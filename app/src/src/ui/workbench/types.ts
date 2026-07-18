import type { FileCategory, CardEntry } from "../../foundation/types";

export interface WbMessage {
  role: "user" | "assistant";
  content: string;
  thinkingTrace: string;
  checked: boolean;
  collapsed: boolean;
  timestamp: number;
}

export interface TempFile {
  name: string;
  size: number;
  category: FileCategory;
  cardId?: string;
}

export interface ContextItem {
  type: "message" | "card";
  id: string;
  label: string;
  ref: string;
}

export interface ToolItem {
  id: string;
  cardId: string;
  label: string;
  description: string;
}

export interface ZoneProps {
  sessionId: string;
  allCards: CardEntry[];
  registerZone?: (id: string, el: HTMLElement, type: "context" | "tool" | "mode", onDrop: (cardId: string) => void) => void;
  unregisterZone?: (id: string) => void;
  messages: WbMessage[];
  onMessagesChange: (fn: (prev: WbMessage[]) => WbMessage[]) => void;
  tempFiles: TempFile[];
  onTempFilesChange: (fn: (prev: TempFile[]) => TempFile[]) => void;
  trayCards: string[];
  onTrayCardsChange: (fn: (prev: string[]) => string[]) => void;
  contextOrder: ContextItem[];
  onContextOrderChange: (fn: (prev: ContextItem[]) => ContextItem[]) => void;
  toolItems: ToolItem[];
  onToolItemsChange: (fn: (prev: ToolItem[]) => ToolItem[]) => void;
  onCreateCard: (title: string, fileData?: { name: string; content: string }) => void;
  isBusy: boolean;
  onContextEdit?: (ref: string) => void;
  onExtractCard?: (content: string) => void;
  streamContent: string;
  streamThinking: string;
  streamPhase: string;
  streamError: string | null;
  hasKey: boolean;
}

export interface ZoneConfig {
  id: string;
  titleKey: string;
  defaultOpen: boolean;
  collapsible: boolean;
  Component: React.ComponentType<ZoneProps>;
}

export interface WorkbenchSessionData {
  messages: WbMessage[];
  tempFiles: TempFile[];
  trayCards: string[];
  contextOrder: ContextItem[];
  toolItems: ToolItem[];
  modeCardId: string | null;
  localModel: string;
  autoMode: boolean;
  thinkingMode: string;
  contextOverrides: Record<string, { content: string; mode: "full" | "titleOnly"; note: string }>;
}
