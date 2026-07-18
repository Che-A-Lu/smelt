import JSZip from "jszip";
import type { ShellTheme } from "../templates/index";
import type { ProvenanceChain } from "../identity/index";

export interface ImportWarning {
  type: "script" | "large" | "unknownFormat" | "missingDep" | "badProvenance";
  file?: string;
  message: string;
}

export interface ImportError {
  type: "bomb" | "pathTraversal" | "corrupt" | "quota" | "badPassword";
  message: string;
}

function isZipBomb(compressedBytes: number, decompressedBytes: number): boolean {
  if (compressedBytes > 100_000) return false;
  return decompressedBytes / Math.max(compressedBytes, 1) > 5000;
}

function hasPathTraversal(name: string): boolean {
  if (name.includes("..")) return true;
  if (name.startsWith("/") || name.startsWith("\\")) return true;
  if (/^[A-Za-z]:[\\/]/.test(name)) return true;
  return false;
}

function isScriptFile(name: string): boolean {
  return [".py", ".js", ".ts", ".sh", ".bat", ".ps1", ".rb", ".php"].some(
    (ext) => name.toLowerCase().endsWith(ext),
  );
}

export interface ParsedCard {
  manifest: {
    id: string; label: string; version: string; author: string;
    description: string; tags: string[]; requires: string[];
    createdAt: number; exportedAt: number;
  } | null;
  shell: ShellTheme | null;
  shellCSS: string | null;
  contentFiles: { name: string; data: ArrayBuffer; size: number; isScript: boolean }[];
  provenance: { chain: ProvenanceChain | null; contentHash: string | null };
  encrypted: boolean;
  verifyToken: string | null;
  warnings: ImportWarning[];
  errors: ImportError[];
}

export async function parseCardFile(file: File): Promise<ParsedCard> {
  const warnings: ImportWarning[] = [];
  const errors: ImportError[] = [];

  let zip: JSZip;
  try { zip = await JSZip.loadAsync(file); } catch {
    return emptyResult([{ type: "corrupt", message: "Cannot parse this file as a card." }]);
  }

  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) {
    return emptyResult([{ type: "corrupt", message: "Not a valid .card file. Missing manifest." }]);
  }

  let manifest: ParsedCard["manifest"] = null;
  try { manifest = JSON.parse(await manifestFile.async("string")); } catch {
    return emptyResult([{ type: "corrupt", message: "Manifest is corrupted." }]);
  }
  if (!manifest) return emptyResult([{ type: "corrupt", message: "Empty manifest." }]);

  const encrypted = !!(manifest as any)._encrypted;
  const verifyToken = (manifest as any)._verify ?? null;

  let shell: ShellTheme | null = null;
  let shellCSS: string | null = null;
  try {
    const themeFile = zip.file("shell/theme.json");
    if (themeFile) shell = JSON.parse(await themeFile.async("string"));
    const cssFile = zip.file("shell/style.css");
    if (cssFile) shellCSS = await cssFile.async("string");
  } catch { /* shell 损坏不影响导入 */ }

  let provenance: ProvenanceChain | null = null;
  let contentHash: string | null = null;
  try {
    const sigFile = zip.file("signature.json");
    if (sigFile) {
      const sig = JSON.parse(await sigFile.async("string"));
      provenance = sig.provenance ?? null;
      contentHash = sig.contentHash ?? null;
    }
  } catch { warnings.push({ type: "badProvenance", message: "Signature data is corrupted." }); }

  const contentFiles: ParsedCard["contentFiles"] = [];
  const contentFolder = zip.folder("content");

  if (contentFolder) {
    for (const [name, entry] of Object.entries(contentFolder.files)) {
      const cleanName = name.replace(/^content\//, "");
      if (hasPathTraversal(cleanName)) {
        errors.push({ type: "pathTraversal", message: `Blocked suspicious path: ${cleanName}` });
        continue;
      }

      const compressed = (entry as any)._data?.compressedSize ?? 0;
      const uncompressed = (entry as any)._data?.uncompressedSize ?? 0;

      if (compressed > 0 && isZipBomb(compressed, uncompressed)) {
        errors.push({ type: "bomb", message: `Suspicious compression ratio in: ${cleanName}` });
        continue;
      }

      try {
        const data = await entry.async("arraybuffer");
        contentFiles.push({ name: cleanName, data, size: data.byteLength, isScript: isScriptFile(cleanName) });
        if (isScriptFile(cleanName)) {
          warnings.push({ type: "script", file: cleanName, message: `Contains executable script: ${cleanName}` });
        }
      } catch {
        warnings.push({ type: "unknownFormat", file: cleanName, message: `Could not read file: ${cleanName}` });
      }
    }
  }

  if (manifest.requires && manifest.requires.length > 0) {
    warnings.push({ type: "missingDep", message: `Requires: ${manifest.requires.join(", ")}. May not function fully.` });
  }

  return {
    manifest, shell, shellCSS, contentFiles, provenance: { chain: provenance, contentHash },
    encrypted, verifyToken, warnings, errors,
  };
}

function emptyResult(errors: ImportError[]): ParsedCard {
  return {
    manifest: null, shell: null, shellCSS: null, contentFiles: [],
    provenance: { chain: null, contentHash: null },
    encrypted: false, verifyToken: null, warnings: [], errors,
  };
}
