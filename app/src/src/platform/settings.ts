import type { AIKeyStore, ProviderId } from "../foundation/types";

const SETTINGS_PATH = "settings.json";
const KEY_PATH = "encryption-key.json";

let store: AIKeyStore | null = null;
let cryptoKey: CryptoKey | null = null;

async function getRoot(): Promise<FileSystemDirectoryHandle> {
  return navigator.storage.getDirectory();
}

async function getCryptoKey(): Promise<CryptoKey> {
  if (cryptoKey) return cryptoKey;
  const dir = await getRoot();
  try {
    const fh = await dir.getFileHandle(KEY_PATH);
    const jwk = JSON.parse(await (await fh.getFile()).text());
    cryptoKey = await crypto.subtle.importKey(
      "jwk", jwk, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
    );
  } catch {
    cryptoKey = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"],
    );
    const jwk = await crypto.subtle.exportKey("jwk", cryptoKey);
    const fh = await dir.getFileHandle(KEY_PATH, { create: true });
    const w = await fh.createWritable();
    await w.write(JSON.stringify(jwk));
    await w.close();
  }
  return cryptoKey;
}

async function encrypt(plain: string): Promise<string> {
  const key = await getCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plain);
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return JSON.stringify({ iv: Array.from(iv), data: Array.from(new Uint8Array(cipher)) });
}

async function decrypt(encrypted: string): Promise<string> {
  const { iv, data } = JSON.parse(encrypted);
  const key = await getCryptoKey();
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(iv) }, key, new Uint8Array(data),
  );
  return new TextDecoder().decode(plain);
}

export async function loadSettings(): Promise<AIKeyStore> {
  if (store) return store;
  const dir = await getRoot();
  try {
    const fh = await dir.getFileHandle(SETTINGS_PATH);
    const raw = JSON.parse(await (await fh.getFile()).text());
    const keys: Partial<Record<ProviderId, string>> = {};
    if (raw.encryptedKeys) {
      for (const [k, v] of Object.entries(raw.encryptedKeys)) {
        try { keys[k as ProviderId] = await decrypt(v as string); } catch { /* 解密失败 */ }
      }
    }
    store = {
      keys,
      activeModel: raw.activeModel ?? "deepseek-chat",
      customBaseURL: raw.customBaseURL ?? "",
      customModel: raw.customModel ?? "",
    };
  } catch {
    store = { keys: {}, activeModel: "deepseek-chat", customBaseURL: "", customModel: "" };
  }
  return store;
}

let saveTimer: ReturnType<typeof setTimeout>;
async function save(): Promise<void> {
  if (!store) return;
  const encryptedKeys: Record<string, string> = {};
  for (const [k, v] of Object.entries(store.keys)) {
    if (v) encryptedKeys[k] = await encrypt(v);
  }
  const dir = await getRoot();
  const fh = await dir.getFileHandle(SETTINGS_PATH, { create: true });
  const w = await fh.createWritable();
  await w.write(JSON.stringify({ encryptedKeys, activeModel: store.activeModel, customBaseURL: store.customBaseURL, customModel: store.customModel }, null, 2));
  await w.close();
}

function scheduleSave(): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 300);
}

export async function setAPIKey(provider: ProviderId, key: string): Promise<void> {
  const s = await loadSettings();
  s.keys[provider] = key;
  scheduleSave();
}

export async function setActiveModel(model: string): Promise<void> {
  const s = await loadSettings();
  s.activeModel = model;
  scheduleSave();
}

export async function getActiveModel(): Promise<string> {
  const s = await loadSettings();
  return s.activeModel;
}

export function getSettings(): AIKeyStore | null { return store; }

export async function hasAnyKey(): Promise<boolean> {
  const s = await loadSettings();
  return Object.values(s.keys).some((v) => !!v);
}
