import { t } from "../foundation/i18n";
import { generateSnapshot, canSnapshot } from "../features/snapshot";
import type { WorkbenchSessionData } from "../ui/workbench/types";
import {
  type SpaceIndex,
  type CardEntry,
  type SphereEntry,
  type PackEntry,
  type DockEntry,
  type SphereRefMap,
  CARD_W,
  CARD_H,
  createDefaultIndex,
} from "../foundation/types";

const INDEX_PATH = "index.json";
const INDEX_BACKUP_PATH = "index.backup.json";
const WRITE_DEBOUNCE_MS = 500;
const QUOTA_THRESHOLD = 0.95;
const BROADCAST_CHANNEL_NAME = "card-space";

let root: FileSystemDirectoryHandle | null = null;
let index: SpaceIndex | null = null;
let sphereToCards: SphereRefMap = new Map();
let dirty = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let channel: BroadcastChannel | null = null;
let onQuotaWarning: ((msg: string) => void) | null = null;

// 多 Tab 检测

function setupMultiTabGuard(): void {
  try {
    channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    const instanceId = Math.random().toString(36).slice(2);
    channel.onmessage = (ev) => {
      if (ev.data?.type === "ping" && ev.data.id !== instanceId) {
        channel?.postMessage({ type: "pong", id: instanceId });
      }
      if (ev.data?.type === "pong" && ev.data.id !== instanceId) {
        onQuotaWarning?.(t("toast.multiTab"));
      }
    };
    channel.postMessage({ type: "ping", id: instanceId });
  } catch { /* BroadcastChannel 不可用 */ }
}

function teardownMultiTabGuard(): void {
  channel?.close();
  channel = null;
}

// OPFS 根目录

async function getRoot(): Promise<FileSystemDirectoryHandle> {
  if (root) return root;
  root = await navigator.storage.getDirectory();
  return root;
}

// 读写

async function tryReadJSON(dir: FileSystemDirectoryHandle, name: string): Promise<SpaceIndex | null> {
  try {
    const fileHandle = await dir.getFileHandle(name);
    const file = await fileHandle.getFile();
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (parsed && parsed.version != null) return parsed as SpaceIndex;
    return null;
  } catch { return null; }
}

async function writeJSONDirect(dir: FileSystemDirectoryHandle, name: string, data: SpaceIndex): Promise<void> {
  const json = JSON.stringify(data, null, 2);
  const fileHandle = await dir.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(json);
  await writable.close();
}

async function checkQuota(neededBytes: number): Promise<boolean> {
  try {
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage ?? 0;
    const quota = estimate.quota ?? 0;
    if (quota > 0 && usage + neededBytes > quota * QUOTA_THRESHOLD) return false;
    return true;
  } catch { return true; }
}

async function flushNow(): Promise<void> {
  if (!index) return;
  const dir = await getRoot();
  const json = JSON.stringify(index, null, 2);
  const neededBytes = new TextEncoder().encode(json).length;
  const ok = await checkQuota(neededBytes);
  if (!ok) { onQuotaWarning?.(t("toast.quotaWarning")); return; }

  try {
    const existing = await tryReadJSON(dir, INDEX_PATH);
    if (existing) await writeJSONDirect(dir, INDEX_BACKUP_PATH, existing);
  } catch { /* 读不到不备份 */ }

  await writeJSONDirect(dir, INDEX_PATH, index);
  const verified = await tryReadJSON(dir, INDEX_PATH);
  if (!verified) throw new Error("Index write verification failed");

  try { await dir.removeEntry(INDEX_BACKUP_PATH); } catch { /* ok */ }
  dirty = false;
}

function scheduleFlush(): void {
  if (!dirty) return;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushNow().catch((err) => {
      onQuotaWarning?.(`${t("toast.saveFailed")}: ${err instanceof Error ? err.message : t("toast.unknownError")}`);
    });
  }, WRITE_DEBOUNCE_MS);
}

function markDirty(): void { dirty = true; scheduleFlush(); }

async function flushAndWait(): Promise<void> {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  if (dirty) await flushNow();
}

// 反向索引

function buildRefMap(): SphereRefMap {
  const map: SphereRefMap = new Map();
  if (!index) return map;
  for (const card of Object.values(index.cards)) {
    if (card.sphereId) {
      if (!map.has(card.sphereId)) map.set(card.sphereId, new Set());
      map.get(card.sphereId)!.add(card.id);
    }
  }
  return map;
}

function addRef(sphereId: string, cardId: string): void {
  if (!sphereToCards.has(sphereId)) sphereToCards.set(sphereId, new Set());
  sphereToCards.get(sphereId)!.add(cardId);
}

function removeRef(sphereId: string, cardId: string): void {
  const set = sphereToCards.get(sphereId);
  if (set) { set.delete(cardId); if (set.size === 0) sphereToCards.delete(sphereId); }
}

function nanoid(): string { return crypto.randomUUID(); }

// ============================================================
// 初始化
// ============================================================

export async function initSpace(quotaWarnFn?: (msg: string) => void): Promise<SpaceIndex> {
  if (index) return index;
  onQuotaWarning = quotaWarnFn ?? null;
  setupMultiTabGuard();

  const dir = await getRoot();
  for (const sub of ["cards", "spheres", "packs", "projects"]) {
    try { await dir.getDirectoryHandle(sub); } catch { await dir.getDirectoryHandle(sub, { create: true }); }
  }

  index = (await tryReadJSON(dir, INDEX_PATH)) ?? createDefaultIndex();

  for (const s of Object.values(index.spheres)) {
    if (!s.position) (s as any).position = { x: 0, y: 0 };
  }

  const defaultProjId = "project-default";
  if (!index.projects[defaultProjId]) {
    index.projects[defaultProjId] = {
      id: defaultProjId, label: "Default", path: `projects/${defaultProjId}/`, isActive: true,
    };
    markDirty();
  }

  sphereToCards = buildRefMap();
  window.addEventListener("beforeunload", () => { flushAndWait().catch(() => {}); });
  return index;
}

export function getIndex(): Readonly<SpaceIndex> | null { return index; }
export { flushAndWait };

// ============================================================
// 卡片 CRUD
// ============================================================

export function createCard(
  label: string,
  position: { x: number; y: number },
  projectId?: string,
  color?: string,
): CardEntry {
  if (!index) throw new Error("Space not initialized");
  const card: CardEntry = {
    id: nanoid(),
    label,
    sphereId: null,
    packId: null,
    projectId: projectId ?? index.workspace.activeProjectId,
    tags: [],
    position,
    size: { w: CARD_W, h: CARD_H },
    color: color ?? "#0284c7",
    status: "idle",
    hasScripts: false,
    isWorkbench: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  index.cards[card.id] = card;
  writeCardMeta(card).catch(() => {});
  markDirty();
  return card;
}

export function updateCard(
  id: string,
  patch: Partial<Pick<CardEntry, "label" | "position" | "packId" | "tags" | "status" | "color" | "isWorkbench">>,
): void {
  if (!index) return;
  const card = index.cards[id];
  if (!card) return;
  Object.assign(card, patch);
  card.updatedAt = Date.now();
  writeCardMeta(card).catch(() => {});
  markDirty();
}

export function deleteCard(id: string): void {
  if (!index) return;
  const card = index.cards[id];
  if (!card) return;
  if (card.sphereId) removeRef(card.sphereId, id);
  delete index.cards[id];
  getRoot().then(async (r) => {
    try { const cardsDir = await r.getDirectoryHandle("cards"); await cardsDir.removeEntry(id, { recursive: true }); } catch { /* ok */ }
  });
  markDirty();
}

// ============================================================
// 戴森球
// ============================================================

export async function createSphereFromFile(
  file: File,
  position: { x: number; y: number },
): Promise<{ sphere: SphereEntry; card: CardEntry }> {
  if (!index) throw new Error("Space not initialized");
  const dir = await getRoot();
  const sphereId = nanoid();
  const spheresDir = await dir.getDirectoryHandle("spheres");
  const sphereDir = await spheresDir.getDirectoryHandle(sphereId, { create: true });

  const fileHandle = await sphereDir.getFileHandle(file.name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(await file.arrayBuffer());
  await writable.close();

  const sphere: SphereEntry = {
    id: sphereId, path: `spheres/${sphereId}/`, fileCount: 1, totalBytes: file.size,
    sourceFileName: file.name, position: { x: position.x, y: position.y }, createdAt: Date.now(),
  };
  index.spheres[sphereId] = sphere;

  // 生成快照
  if (canSnapshot(file.name)) {
    generateSnapshot(file, { w: 300, h: 400 }).then(async (snap) => {
      if (snap) {
        try {
          const snapHandle = await sphereDir.getFileHandle("_snapshot.png", { create: true });
          const sw = await snapHandle.createWritable();
          await sw.write(await snap.arrayBuffer());
          await sw.close();
        } catch { /* 快照写入失败不影响主流程 */ }
      }
    });
  }

  const card = createCard(file.name.replace(/\.[^.]+$/, ""), { x: position.x + 40, y: position.y + 40 });
  bindCardToSphere(card.id, sphereId);
  return { sphere, card };
}

export function bindCardToSphere(cardId: string, sphereId: string): void {
  if (!index) return;
  const card = index.cards[cardId];
  const sphere = index.spheres[sphereId];
  if (!card || !sphere) return;
  if (card.sphereId) removeRef(card.sphereId, cardId);
  card.sphereId = sphereId;
  card.status = "idle";
  card.updatedAt = Date.now();
  addRef(sphereId, cardId);
  markDirty();
}

export async function readSphereFiles(sphereId: string): Promise<{ name: string; content: string }[]> {
  const dir = await getRoot();
  const spheresDir = await dir.getDirectoryHandle("spheres");
  const sphereDir = await spheresDir.getDirectoryHandle(sphereId);
  const files: { name: string; content: string }[] = [];
  for await (const [name, handle] of sphereDir as any) {
    const file = await (handle as FileSystemFileHandle).getFile();
    const content = await file.text();
    files.push({ name, content });
  }
  return files;
}

// 读取快照 → blob URL（用于 <img> 渲染）
export async function readSnapshot(sphereId: string): Promise<string | null> {
  try {
    const dir = await getRoot();
    const spheresDir = await dir.getDirectoryHandle("spheres");
    const sphereDir = await spheresDir.getDirectoryHandle(sphereId);
    const handle = await sphereDir.getFileHandle("_snapshot.png");
    const file = await handle.getFile();
    return URL.createObjectURL(file);
  } catch {
    return null;
  }
}

// 读球里的原始文件 → blob URL（图片用）
export async function readSphereFileBlob(sphereId: string): Promise<string | null> {
  try {
    const dir = await getRoot();
    const spheresDir = await dir.getDirectoryHandle("spheres");
    const sphereDir = await spheresDir.getDirectoryHandle(sphereId);
    for await (const [name, handle] of sphereDir as any) {
      if (name === "_snapshot.png") continue;
      const file = await (handle as FileSystemFileHandle).getFile();
      return URL.createObjectURL(file);
    }
    return null;
  } catch {
    return null;
  }
}

// ============================================================
// 工作台会话持久化
// ============================================================

const SESSIONS_DIR = "sessions";

export async function saveWorkbenchSession(workbenchCardId: string, data: WorkbenchSessionData): Promise<void> {
  const dir = await getRoot();
  const sessionsDir = await dir.getDirectoryHandle(SESSIONS_DIR, { create: true });
  const handle = await sessionsDir.getFileHandle(`${workbenchCardId}.json`, { create: true });
  const w = await handle.createWritable();
  await w.write(JSON.stringify(data));
  await w.close();
}

export async function loadWorkbenchSession(workbenchCardId: string): Promise<WorkbenchSessionData | null> {
  try {
    const dir = await getRoot();
    const sessionsDir = await dir.getDirectoryHandle(SESSIONS_DIR);
    const handle = await sessionsDir.getFileHandle(`${workbenchCardId}.json`);
    return JSON.parse(await (await handle.getFile()).text());
  } catch { return null; }
}

export async function deleteWorkbenchSession(workbenchCardId: string): Promise<void> {
  try {
    const dir = await getRoot();
    const sessionsDir = await dir.getDirectoryHandle(SESSIONS_DIR);
    await sessionsDir.removeEntry(`${workbenchCardId}.json`);
  } catch { /* 不存在就不删 */ }
}

// ============================================================
// 卡包
// ============================================================

export function createPack(label: string, position: { x: number; y: number }): PackEntry {
  if (!index) throw new Error("Space not initialized");
  const pack: PackEntry = { id: nanoid(), label, position, isOpen: false };
  index.packs[pack.id] = pack;
  markDirty();
  return pack;
}

export function updatePack(id: string, patch: Partial<Pick<PackEntry, "label" | "position" | "isOpen">>): void {
  if (!index) return;
  const pack = index.packs[id];
  if (!pack) return;
  Object.assign(pack, patch);
  markDirty();
}

export function deletePack(id: string): void {
  if (!index) return;
  for (const card of Object.values(index.cards)) {
    if (card.packId === id) updateCard(card.id, { packId: null });
  }
  delete index.packs[id];
  markDirty();
}

export function moveCardToPack(cardId: string, packId: string | null): void {
  updateCard(cardId, { packId });
}

export function getCardsByPack(packId: string): CardEntry[] {
  if (!index) return [];
  return Object.values(index.cards).filter((c) => c.packId === packId);
}

export function getCardsForActiveProject(): CardEntry[] {
  if (!index) return [];
  const pid = index.workspace.activeProjectId;
  return Object.values(index.cards).filter((c) => c.projectId === pid);
}

// ============================================================
// 卡座
// ============================================================

export function createDock(label: string, position: { x: number; y: number }): DockEntry {
  if (!index) throw new Error("Space not initialized");
  const dock: DockEntry = {
    id: nanoid(), label, position,
    size: { w: 180, h: 250 },
    activeCardIds: [],
  };
  index.docks[dock.id] = dock;
  markDirty();
  return dock;
}

export function updateDock(id: string, patch: Partial<Pick<DockEntry, "label" | "position" | "activeCardIds">>): void {
  if (!index) return;
  const dock = index.docks[id];
  if (!dock) return;
  Object.assign(dock, patch);
  markDirty();
}

export function deleteDock(id: string): void {
  if (!index) return;
  // 卡座上的卡片回到 idle 状态
  const dock = index.docks[id];
  if (dock) {
    for (const cardId of dock.activeCardIds) {
      updateCard(cardId, { status: "idle" });
    }
  }
  delete index.docks[id];
  markDirty();
}

export function activateCardInDock(cardId: string, dockId: string): void {
  if (!index) return;
  const dock = index.docks[dockId];
  if (!dock) return;
  if (!dock.activeCardIds.includes(cardId)) {
    dock.activeCardIds.push(cardId);
  }
  updateCard(cardId, { status: "active" });
  markDirty();
}

export function deactivateCardInDock(cardId: string, dockId: string): void {
  if (!index) return;
  const dock = index.docks[dockId];
  if (!dock) return;
  dock.activeCardIds = dock.activeCardIds.filter((id) => id !== cardId);
  updateCard(cardId, { status: "idle" });
  markDirty();
}

// ============================================================
// 工作区
// ============================================================

export function saveWorkspaceCamera(x: number, y: number, zoom: number): void {
  if (!index) return;
  index.workspace.camera = { x, y, zoom };
  markDirty();
}

// ============================================================
// 流式内容保存
// ============================================================

export async function saveStreamedContent(
  content: string,
  thinkingTrace: string,
  position: { x: number; y: number },
): Promise<string> {
  if (!index) throw new Error("Space not initialized");
  const dir = await getRoot();
  const sphereId = nanoid();
  const spheresDir = await dir.getDirectoryHandle("spheres");
  const sphereDir = await spheresDir.getDirectoryHandle(sphereId, { create: true });

  const output = JSON.stringify({ content, thinkingTrace, createdAt: Date.now() }, null, 2);
  const fileHandle = await sphereDir.getFileHandle("output.json", { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(output);
  await writable.close();

  const sphere: SphereEntry = {
    id: sphereId, path: `spheres/${sphereId}/`, fileCount: 1,
    totalBytes: new TextEncoder().encode(output).length,
    sourceFileName: null, position, createdAt: Date.now(),
  };
  index.spheres[sphereId] = sphere;
  markDirty();
  return sphereId;
}

// ============================================================
// 导入 .card
// ============================================================

interface ImportedData {
  manifest: { id: string; label: string; version: string; author: string; tags: string[] } | null;
  contentFiles: { name: string; data: ArrayBuffer }[];
}

export async function importCard(
  data: ImportedData,
  position: { x: number; y: number },
): Promise<{ card: CardEntry; sphere: SphereEntry }> {
  if (!index) throw new Error("Space not initialized");
  const dir = await getRoot();
  const sphereId = nanoid();
  const spheresDir = await dir.getDirectoryHandle("spheres");
  const sphereDir = await spheresDir.getDirectoryHandle(sphereId, { create: true });

  let totalBytes = 0;
  for (const f of data.contentFiles) {
    const fh = await sphereDir.getFileHandle(f.name, { create: true });
    const w = await fh.createWritable();
    await w.write(f.data);
    await w.close();
    totalBytes += f.data.byteLength;
  }

  const sphere: SphereEntry = {
    id: sphereId, path: `spheres/${sphereId}/`, fileCount: data.contentFiles.length, totalBytes,
    sourceFileName: null, position, createdAt: Date.now(),
  };
  index.spheres[sphereId] = sphere;

  const hasScripts = data.contentFiles.some((f) =>
    [".py", ".js", ".ts", ".sh", ".bat", ".ps1", ".rb", ".php"].some((ext) => f.name.toLowerCase().endsWith(ext)),
  );

  const card: CardEntry = {
    id: nanoid(),
    label: data.manifest?.label ?? "未命名卡片",
    sphereId, packId: null,
    projectId: index.workspace.activeProjectId,
    tags: data.manifest?.tags ?? [],
    position, size: { w: CARD_W, h: CARD_H },
    color: "#0284c7",
    status: hasScripts ? "idle" : "idle",
    hasScripts,
    isWorkbench: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  index.cards[card.id] = card;

  addRef(sphereId, card.id);
  writeCardMeta(card).catch(() => {});
  markDirty();
  return { card, sphere };
}

// ============================================================
// 冗余元数据
// ============================================================

async function writeCardMeta(card: CardEntry): Promise<void> {
  try {
    const dir = await getRoot();
    const cardsDir = await dir.getDirectoryHandle("cards");
    const cardDir = await cardsDir.getDirectoryHandle(card.id, { create: true });
    const metaFile = await cardDir.getFileHandle("card.json", { create: true });
    const writable = await metaFile.createWritable();
    await writable.write(JSON.stringify(card, null, 2));
    await writable.close();
  } catch { /* OPFS 写入失败不阻塞 */ }
}
