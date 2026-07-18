// ============================================================
// 身份与签名系统
// ECDSA P-256 密钥对，Web Crypto 原生支持
// ============================================================

const IDENTITY_KEY_PATH = "identity-key.json";
const IDENTITY_PUB_PATH = "identity-pub.json";

let keyPair: { privateKey: CryptoKey; publicKey: CryptoKey } | null = null;

async function getRoot(): Promise<FileSystemDirectoryHandle> {
  return navigator.storage.getDirectory();
}

async function getOrCreateKeyPair(): Promise<{ privateKey: CryptoKey; publicKey: CryptoKey }> {
  if (keyPair) return keyPair;

  const dir = await getRoot();
  try {
    const privHandle = await dir.getFileHandle(IDENTITY_KEY_PATH);
    const privJWK = JSON.parse(await (await privHandle.getFile()).text());
    const pubHandle = await dir.getFileHandle(IDENTITY_PUB_PATH);
    const pubJWK = JSON.parse(await (await pubHandle.getFile()).text());

    keyPair = {
      privateKey: await crypto.subtle.importKey("jwk", privJWK, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]),
      publicKey: await crypto.subtle.importKey("jwk", pubJWK, { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"]),
    };
  } catch {
    keyPair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair;

    const privJWK = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
    const pubJWK = await crypto.subtle.exportKey("jwk", keyPair.publicKey);

    const privHandle = await dir.getFileHandle(IDENTITY_KEY_PATH, { create: true });
    const w1 = await privHandle.createWritable();
    await w1.write(JSON.stringify(privJWK));
    await w1.close();

    const pubHandle = await dir.getFileHandle(IDENTITY_PUB_PATH, { create: true });
    const w2 = await pubHandle.createWritable();
    await w2.write(JSON.stringify(pubJWK));
    await w2.close();
  }

  return keyPair;
}

export async function getPublicKeyJWK(): Promise<JsonWebKey> {
  const kp = await getOrCreateKeyPair();
  return crypto.subtle.exportKey("jwk", kp.publicKey);
}

export async function getPublicKeyFingerprint(): Promise<string> {
  const jwk = await getPublicKeyJWK();
  const raw = `${jwk.x ?? ""}${jwk.y ?? ""}`;
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

export async function hashContent(files: { name: string; content: string }[]): Promise<string> {
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name));
  const combined = sorted.map((f) => `${f.name}:${f.content}`).join("\n");
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(combined));
  return "sha256:" + Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface SignatureEntry {
  author: string;
  publicKey: JsonWebKey;
  contentHash: string;
  sig: string;
  timestamp: number;
}

export async function signContent(authorName: string, contentHash: string): Promise<SignatureEntry> {
  const kp = await getOrCreateKeyPair();
  const publicKey = await getPublicKeyJWK();
  const payload = `${authorName}|${contentHash}`;
  const sigRaw = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, kp.privateKey, new TextEncoder().encode(payload),
  );
  const sig = btoa(String.fromCharCode(...new Uint8Array(sigRaw)));
  return { author: authorName, publicKey, contentHash, sig, timestamp: Date.now() };
}

export async function verifySignature(entry: SignatureEntry): Promise<boolean> {
  try {
    const publicKey = await crypto.subtle.importKey(
      "jwk", entry.publicKey, { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"],
    );
    const payload = `${entry.author}|${entry.contentHash}`;
    const sigRaw = Uint8Array.from(atob(entry.sig), (c) => c.charCodeAt(0));
    return crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" }, publicKey, sigRaw, new TextEncoder().encode(payload),
    );
  } catch { return false; }
}

export type ProvenanceChain = SignatureEntry[];

export async function buildProvenance(
  authorName: string, contentHash: string, previousChain: ProvenanceChain | null,
): Promise<ProvenanceChain> {
  const entry = await signContent(authorName, contentHash);
  return previousChain ? [...previousChain, entry] : [entry];
}

export async function verifyChain(
  chain: ProvenanceChain, currentContentHash: string,
): Promise<{
  valid: boolean; originalAuthor: string | null; currentSigner: string | null;
  results: { author: string; sigValid: boolean; contentMatch: boolean }[];
}> {
  const results: { author: string; sigValid: boolean; contentMatch: boolean }[] = [];
  let originalAuthor: string | null = null;

  for (let i = 0; i < chain.length; i++) {
    const e = chain[i];
    const sigValid = await verifySignature(e);
    const contentMatch = e.contentHash === currentContentHash;
    if (i === 0 && sigValid) originalAuthor = e.author;
    results.push({ author: e.author, sigValid, contentMatch });
  }

  const last = chain[chain.length - 1];
  const currentSigner = last && (await verifySignature(last)) ? last.author : null;
  const valid = results.every((r) => r.sigValid);
  return { valid, originalAuthor, currentSigner, results };
}

// 单文件 SHA-256 hash
export async function hashSingleFile(name: string, content: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${name}:${content}`));
  return "sha256:" + Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// 导出身份密钥 → 下载 JSON
export async function exportIdentityKey(): Promise<void> {
  const kp = await getOrCreateKeyPair();
  const privJWK = await crypto.subtle.exportKey("jwk", kp.privateKey);
  const pubJWK = await crypto.subtle.exportKey("jwk", kp.publicKey);
  const blob = new Blob([JSON.stringify({ type: "smelt-identity-key", version: 1, privateKey: privJWK, publicKey: pubJWK }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "smelt-identity-key.json";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// 导入身份密钥 → 覆盖 OPFS
export async function importIdentityKey(file: File): Promise<{ fingerprint: string; success: boolean }> {
  try {
    const keyFile = JSON.parse(await file.text());
    if (keyFile.type !== "smelt-identity-key") throw new Error("Invalid format");
    keyPair = {
      privateKey: await crypto.subtle.importKey("jwk", keyFile.privateKey, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]),
      publicKey: await crypto.subtle.importKey("jwk", keyFile.publicKey, { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"]),
    };
    const dir = await getRoot();
    const privHandle = await dir.getFileHandle(IDENTITY_KEY_PATH, { create: true });
    const w1 = await privHandle.createWritable(); await w1.write(JSON.stringify(keyFile.privateKey)); await w1.close();
    const pubHandle = await dir.getFileHandle(IDENTITY_PUB_PATH, { create: true });
    const w2 = await pubHandle.createWritable(); await w2.write(JSON.stringify(keyFile.publicKey)); await w2.close();
    const fingerprint = await getPublicKeyFingerprint();
    return { fingerprint, success: true };
  } catch { return { fingerprint: "", success: false }; }
}
