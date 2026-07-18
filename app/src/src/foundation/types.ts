// ============================================================
// 卡片尺寸常量
// ============================================================

export const CARD_W = 150;
export const CARD_H = 210;
export const DOCK_W = 180;
export const DOCK_H = 250;

// ============================================================
// 卡片
// ============================================================

export type CardStatus = "idle" | "active" | "generating" | "interrupted" | "orphaned" | "selected";

export interface CardEntry {
  id: string;
  label: string;
  sphereId: string | null;
  packId: string | null;
  projectId: string;
  tags: string[];
  position: { x: number; y: number };
  size: { w: number; h: number };
  color: string;
  status: CardStatus;
  hasScripts: boolean;
  isWorkbench: boolean;
  createdAt: number;
  updatedAt: number;
}

// ============================================================
// 戴森球（OPFS 数据实体，用户不可见）
// ============================================================

export interface SphereEntry {
  id: string;
  path: string;
  fileCount: number;
  totalBytes: number;
  sourceFileName: string | null;
  position: { x: number; y: number };
  createdAt: number;
}

// ============================================================
// 卡座（卡片通电的地方）
// ============================================================

export interface DockEntry {
  id: string;
  label: string;
  position: { x: number; y: number };
  size: { w: number; h: number };
  activeCardIds: string[];
}

// ============================================================
// 卡包
// ============================================================

export interface PackEntry {
  id: string;
  label: string;
  position: { x: number; y: number };
  isOpen: boolean;
}

// ============================================================
// 工作台会话
// ============================================================

export interface WorkbenchSession {
  cardId: string;
  messages: ChatMessage[];
  streamState: StreamState;
  tempFileIds: string[];
  contextOrder: string[];
}

// ============================================================
// 交互参数（可被主题卡覆盖）
// ============================================================

export interface InteractionConfig {
  card: {
    dragDelayFrames: number;
    dragFollowRatio: number;
    dragScaleOnPickup: number;
    dragShadow: string;
    throwDecay: number;
    minThrowVelocity: number;
  };
  spring: {
    stiffness: number;
    damping: number;
  };
  createAnimation: "spring" | "fade" | "none" | "drop";
  deleteAnimation: "shrink" | "fade" | "none" | "explode";
  workbench: {
    openSpringStiffness: number;
    openSpringDamping: number;
    panelWidth: number;
    showThinkingTrace: boolean;
  };
  pack: {
    expandSpringStiffness: number;
    expandSpringDamping: number;
    cardInPackScale: number;
  };
  global: {
    backgroundColor: string;
    gridColor: string;
    gridSpacing: number;
    fontFamily: string;
    animationEnabled: boolean;
    cardScale: number;
    uiScale: number;
  };
}

export function defaultInteraction(): InteractionConfig {
  return {
    card: {
      dragDelayFrames: 3,
      dragFollowRatio: 0.65,
      dragScaleOnPickup: 1.05,
      dragShadow: "0 4px 12px rgba(0,0,0,0.15)",
      throwDecay: 0.92,
      minThrowVelocity: 2,
    },
    spring: { stiffness: 300, damping: 28 },
    createAnimation: "spring",
    deleteAnimation: "shrink",
    workbench: {
      openSpringStiffness: 200,
      openSpringDamping: 24,
      panelWidth: 360,
      showThinkingTrace: true,
    },
    pack: {
      expandSpringStiffness: 250,
      expandSpringDamping: 24,
      cardInPackScale: 0.7,
    },
    global: {
      backgroundColor: "#f5f5f5",
      gridColor: "#d1d5db",
      gridSpacing: 40,
      fontFamily: "system-ui, sans-serif",
      animationEnabled: true,
      cardScale: 1.0,
      uiScale: 1.0,
    },
  };
}

// ============================================================
// 项目 & 工作区
// ============================================================

export interface ProjectEntry {
  id: string;
  label: string;
  path: string;
  isActive: boolean;
}

export interface WorkspaceState {
  camera: { x: number; y: number; zoom: number };
  activeProjectId: string;
}

// ============================================================
// 空间索引
// ============================================================

export interface SpaceIndex {
  version: 1;
  cards: Record<string, CardEntry>;
  spheres: Record<string, SphereEntry>;
  packs: Record<string, PackEntry>;
  docks: Record<string, DockEntry>;
  projects: Record<string, ProjectEntry>;
  workspace: WorkspaceState;
}

export function createDefaultIndex(): SpaceIndex {
  const defaultProjectId = "project-default";
  return {
    version: 1,
    cards: {},
    spheres: {},
    packs: {},
    docks: {},
    projects: {
      [defaultProjectId]: {
        id: defaultProjectId,
        label: "Default",
        path: `projects/${defaultProjectId}/`,
        isActive: true,
      },
    },
    workspace: {
      camera: { x: 0, y: 0, zoom: 1 },
      activeProjectId: defaultProjectId,
    },
  };
}

export type SphereRefMap = Map<string, Set<string>>;

export interface CardSearchResult {
  card: CardEntry;
  matchField: "label" | "tag";
}

// ============================================================
// 导出模式
// ============================================================

export type ExportMode = "overwrite" | "copy" | "card";

// ============================================================
// AI 接入
// ============================================================

export type ProviderId = "deepseek" | "kimi" | "openai" | "anthropic" | "google" | "qwen" | "zhipu" | "groq" | "custom";

export interface ProviderConfig {
  id: ProviderId;
  label: string;
  baseURL: string;
  models: string[];
  requiresKey: boolean;
}

export const BUILTIN_PROVIDERS: Record<string, ProviderConfig> = {
  deepseek: {
    id: "deepseek", label: "DeepSeek",
    baseURL: "https://api.deepseek.com/v1",
    models: ["deepseek-chat", "deepseek-reasoner", "deepseek-v4-flash", "deepseek-v4-pro"],
    requiresKey: true,
  },
  openai: {
    id: "openai", label: "OpenAI",
    baseURL: "https://api.openai.com/v1",
    models: ["gpt-4.1", "gpt-4o", "o3", "o4-mini"],
    requiresKey: true,
  },
  anthropic: {
    id: "anthropic", label: "Anthropic",
    baseURL: "https://api.anthropic.com/v1",
    models: ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5"],
    requiresKey: true,
  },
  google: {
    id: "google", label: "Google Gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    models: ["gemini-2.5-pro", "gemini-2.5-flash"],
    requiresKey: true,
  },
  kimi: {
    id: "kimi", label: "Kimi (月之暗面)",
    baseURL: "https://api.moonshot.cn/v1",
    models: ["kimi-k2.5", "kimi-latest", "moonshot-v1-auto"],
    requiresKey: true,
  },
  qwen: {
    id: "qwen", label: "通义千问 (阿里)",
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: ["qwen3.5-plus", "qwen-max", "qwen-plus"],
    requiresKey: true,
  },
  zhipu: {
    id: "zhipu", label: "智谱 GLM",
    baseURL: "https://open.bigmodel.cn/api/paas/v4",
    models: ["glm-4.7", "glm-4.7-flash"],
    requiresKey: true,
  },
  groq: {
    id: "groq", label: "Groq",
    baseURL: "https://api.groq.com/openai/v1",
    models: ["llama-4-scout-17b-16e-instruct", "mixtral-8x7b-32768"],
    requiresKey: true,
  },
  custom: {
    id: "custom", label: "Custom",
    baseURL: "", models: [],
    requiresKey: true,
  },
};

export interface AIKeyStore {
  keys: Partial<Record<ProviderId, string>>;
  activeModel: string;
  customBaseURL: string;
  customModel: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
  thinking?: string;
}

export type StreamPhase = "idle" | "thinking" | "streaming" | "done" | "error" | "interrupted";

export interface StreamState {
  phase: StreamPhase;
  content: string;
  thinkingTrace: string;
  tokenCount: number;
  error: string | null;
}

// ============================================================
// 文件分类
// ============================================================

export interface FileCategory { label: string; color: string }

const FILE_CATEGORIES: Record<string, FileCategory> = {
  ".py": { label: "PY", color: "#6366f1" },
  ".js": { label: "JS", color: "#f59e0b" },
  ".ts": { label: "TS", color: "#2563eb" },
  ".jsx": { label: "JSX", color: "#6366f1" },
  ".tsx": { label: "TSX", color: "#2563eb" },
  ".go": { label: "GO", color: "#06b6d4" },
  ".rs": { label: "RS", color: "#ef4444" },
  ".csv": { label: "CSV", color: "#22c55e" },
  ".json": { label: "JSON", color: "#a855f7" },
  ".md": { label: "MD", color: "#1a1a2e" },
  ".txt": { label: "TXT", color: "#6b7280" },
  ".png": { label: "IMG", color: "#ec4899" },
  ".jpg": { label: "IMG", color: "#ec4899" },
  ".jpeg": { label: "IMG", color: "#ec4899" },
  ".svg": { label: "SVG", color: "#f97316" },
  ".gif": { label: "GIF", color: "#ec4899" },
  ".webp": { label: "IMG", color: "#ec4899" },
  ".pdf": { label: "PDF", color: "#ef4444" },
  ".mp4": { label: "VID", color: "#dc2626" },
  ".mov": { label: "VID", color: "#dc2626" },
  ".webm": { label: "VID", color: "#dc2626" },
  ".mp3": { label: "AUD", color: "#f59e0b" },
  ".wav": { label: "AUD", color: "#f59e0b" },
  ".zip": { label: "ZIP", color: "#9ca3af" },
  ".card": { label: "CARD", color: "#0284c7" },
};

const DEFAULT_CATEGORY: FileCategory = { label: "FILE", color: "#9ca3af" };

export function fileCategory(name: string): FileCategory {
  const ext = name.toLowerCase().slice(name.lastIndexOf("."));
  return FILE_CATEGORIES[ext] ?? DEFAULT_CATEGORY;
}

export interface QuotaInfo {
  usage: number;
  quota: number;
}
