import JSZip from "jszip";
import { type CardEntry, type SphereEntry, fileCategory } from "../../foundation/types";
import { readSphereFiles } from "../../platform/storage";
import { type ShellTheme, type ShellEntry, BUILTIN_SHELLS } from "../templates/index";
import { hashContent, buildProvenance, hashSingleFile, type ProvenanceChain } from "../identity/index";

export interface EditRecord {
  editor: string; timestamp: number; note: string;
  changes: { added: string[]; removed: string[]; modified: { file: string; oldHash: string; newHash: string }[] };
}

export interface EditsLog {
  originalAuthor: string; originalHash: string; chain: EditRecord[];
}

// ============================================================
// 隐私扫描
// ============================================================

export interface ScanIssue {
  file: string; line: number; snippet: string; reason: string;
}

const SCAN_RULES: { pattern: RegExp; reason: string }[] = [
  { pattern: /sk-(ant(-api)?-)?[A-Za-z0-9]{32,}/g, reason: "Possible API key" },
  { pattern: /xai-[A-Za-z0-9]{32,}/g, reason: "Possible API key" },
  { pattern: /[A-Za-z0-9+/]{40,}={0,2}/g, reason: "Possible base64 secret" },
  { pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, reason: "Email address" },
  { pattern: /1[3-9]\d{9}/g, reason: "Phone number" },
  { pattern: /(?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*["'\w-]+/gi, reason: "Sensitive field" },
];

export function scanContent(fileName: string, content: string): ScanIssue[] {
  const issues: ScanIssue[] = [];
  const textExts = [".md", ".json", ".csv", ".txt", ".py", ".js", ".ts", ".yaml", ".yml", ".xml", ".html", ".css", ".env", ".cfg", ".ini", ".toml"];
  if (!textExts.some((ext) => fileName.toLowerCase().endsWith(ext))) return issues;

  const lines = content.split("\n");
  for (const rule of SCAN_RULES) {
    for (let i = 0; i < lines.length; i++) {
      for (const m of lines[i].matchAll(rule.pattern)) {
        const start = Math.max(0, m.index! - 20);
        const end = Math.min(lines[i].length, m.index! + m[0].length + 20);
        issues.push({ file: fileName, line: i + 1, snippet: lines[i].slice(start, end), reason: rule.reason });
      }
    }
  }
  return issues;
}

// ============================================================
// AES-256-GCM 加密
// ============================================================

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
}

async function encryptContent(plaintext: string, password: string): Promise<{ encrypted: Uint8Array; iv: Uint8Array; salt: Uint8Array }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  return { encrypted: new Uint8Array(cipher), iv, salt };
}

export function encryptFileData(content: string, password: string): Promise<{ encrypted: Uint8Array; iv: Uint8Array; salt: Uint8Array }> {
  return encryptContent(content, password);
}

const VERIFY_PLAINTEXT = "CARD_VERIFY_OK";

export async function generateVerificationToken(password: string): Promise<string> {
  const enc = await encryptContent(VERIFY_PLAINTEXT, password);
  return JSON.stringify({ v: true, iv: Array.from(enc.iv), salt: Array.from(enc.salt), data: Array.from(enc.encrypted) });
}

export async function verifyPassword(token: string, password: string): Promise<boolean> {
  try {
    const { iv, salt, data } = JSON.parse(token);
    if (!iv || !salt || !data) return false;
    const key = await deriveKey(password, new Uint8Array(salt));
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(iv) }, key, new Uint8Array(data),
    );
    return new TextDecoder().decode(plain) === VERIFY_PLAINTEXT;
  } catch { return false; }
}

export type PasswordStrength = "weak" | "medium" | "strong";

export function getPasswordStrength(pw: string): PasswordStrength {
  if (pw.length < 6) return "weak";
  let score = 0;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score >= 4) return "strong";
  if (score >= 2) return "medium";
  return "weak";
}

export function isEditableFile(name: string): boolean {
  const ext = name.toLowerCase().slice(name.lastIndexOf("."));
  const editable = [".md", ".json", ".csv", ".txt", ".py", ".js", ".ts", ".yaml", ".yml", ".xml", ".html", ".css", ".env", ".cfg", ".ini", ".toml"];
  return editable.includes(ext);
}

export function isPreviewableFile(name: string): boolean {
  return isEditableFile(name);
}

// fileCategory 从 foundation/types 重导出，保持 API 兼容
export { fileCategory };

// ============================================================
// .card 打包
// ============================================================

export interface ExportManifest {
  id: string; label: string; version: string; author: string;
  description: string; tags: string[]; requires: string[];
  createdAt: number; exportedAt: number;
}

export interface ExtraFile {
  file: File; name: string;
}

export interface BuildCardOptions {
  card: CardEntry;
  shell: ShellTheme;
  shellCSS?: string;
  sphere: SphereEntry | null;
  sphereFileFilter?: Set<string>;
  extraFiles: ExtraFile[];
  manifest: ExportManifest;
  password: string | null;
  authorName: string;
  previousProvenance?: ProvenanceChain | null;
  previousEditsLog?: EditsLog;
  editNote?: string;
}

function nanoid(): string { return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2); }

export async function buildCardPackage(opts: BuildCardOptions): Promise<Blob> {
  const zip = new JSZip();

  const manifestData: any = { ...opts.manifest };
  if (opts.password) {
    manifestData._encrypted = true;
    manifestData._verify = await generateVerificationToken(opts.password);
  }

  const contentFolder = zip.folder("content")!;
  const hashFiles: { name: string; content: string }[] = [];
  const fileHashes: Record<string, string> = {};

  if (opts.sphere) {
    const files = await readSphereFiles(opts.sphere.id);
    for (const file of files) {
      if (opts.sphereFileFilter && !opts.sphereFileFilter.has(file.name)) continue;
      let data = file.content;
      if (opts.password) {
        const enc = await encryptFileData(file.content, opts.password);
        data = JSON.stringify({ encrypted: true, iv: Array.from(enc.iv), salt: Array.from(enc.salt), data: Array.from(enc.encrypted) });
      }
      contentFolder.file(file.name, data);
      hashFiles.push(file);
      fileHashes[file.name] = await hashSingleFile(file.name, file.content);
    }
  }

  for (const ef of opts.extraFiles) {
    const buf = await ef.file.arrayBuffer();
    contentFolder.file(ef.name, buf);
    const text = new TextDecoder().decode(buf);
    hashFiles.push({ name: ef.name, content: text });
    fileHashes[ef.name] = await hashSingleFile(ef.name, text);
  }

  manifestData.files = fileHashes;
  zip.file("manifest.json", JSON.stringify(manifestData, null, 2));

  // edits.json
  if (opts.previousEditsLog || opts.editNote) {
    const editsLog: EditsLog = opts.previousEditsLog ?? {
      originalAuthor: opts.authorName, originalHash: "", chain: [],
    };
    if (opts.editNote?.trim()) {
      editsLog.chain.push({
        editor: opts.authorName, timestamp: Date.now(), note: opts.editNote.trim(),
        changes: { added: [], removed: [], modified: [] },
      });
    }
    zip.file("edits.json", JSON.stringify(editsLog, null, 2));
  }

  const shellFolder = zip.folder("shell")!;
  shellFolder.file("theme.json", JSON.stringify(opts.shell, null, 2));
  if (opts.shellCSS) shellFolder.file("style.css", opts.shellCSS);

  const contentHash = await hashContent(hashFiles.length > 0 ? hashFiles : [{ name: "(empty)", content: "" }]);
  const provenance = await buildProvenance(opts.authorName, contentHash, opts.previousProvenance ?? null);
  zip.file("signature.json", JSON.stringify({ provenance, contentHash }, null, 2));

  return zip.generateAsync({ type: "blob" });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
