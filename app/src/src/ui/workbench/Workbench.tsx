import { useState, useRef, useCallback, useEffect } from "react";
import { type CardEntry, type InteractionConfig, type ChatMessage, type StreamState, fileCategory, BUILTIN_PROVIDERS } from "../../foundation/types";
import { t } from "../../foundation/i18n";
import { getActiveModel, hasAnyKey } from "../../platform/settings";
import { readSphereFiles, createCard, updateCard as storageUpdateCard, getIndex, saveWorkbenchSession, loadWorkbenchSession, deleteWorkbenchSession } from "../../platform/storage";
import { buildCardPackage, downloadBlob } from "../../features/export/index";
import { BUILTIN_SHELLS } from "../../features/templates/index";
import { streamChat, type ToolCall } from "../../features/ai/index";
import { buildTools, executeTool, requiresConfirmation, type ToolContext } from "../../features/tool-registry";
import type { ZoneProps, ZoneConfig, WbMessage, TempFile, ContextItem, ToolItem } from "./types";
import { ContextZone } from "./ContextZone";
import { ToolZone } from "./ToolZone";
import { FilesZone } from "./FilesZone";
import { TrayZone } from "./TrayZone";
import { HistoryZone } from "./HistoryZone";
import { ModeSlot } from "./ModeSlot";
import { ModeHelp } from "./ModeHelp";
import { ContextEditDialog } from "./ContextEditDialog";
import { Drawer } from "./Drawer";
import { validateModeCard, runPipeline, runTeam, runOrchestrator, type ModeCard, type ModeType } from "../../features/mode/index";
import type { PipelineContext } from "../../features/mode/pipeline";
import type { TeamContext } from "../../features/mode/team";
import type { OrchestratorContext } from "../../features/mode/orchestrator";

interface WorkbenchProps {
  card: CardEntry;
  interaction: InteractionConfig;
  allCards: CardEntry[];
  registerZone: (id: string, el: HTMLElement, type: "context" | "tool" | "mode", onDrop: (cardId: string) => void) => void;
  unregisterZone: (id: string) => void;
  onClose: () => void;
}

const workbenchZones: ZoneConfig[] = [
  { id: "context", titleKey: "wb.contextOrder", defaultOpen: false, collapsible: true, Component: ContextZone },
  { id: "tool",    titleKey: "wb.toolZone",     defaultOpen: false, collapsible: true, Component: ToolZone },
  { id: "files",   titleKey: "wb.aiFiles",      defaultOpen: true,  collapsible: true, Component: FilesZone },
  { id: "tray",    titleKey: "wb.cardTray",      defaultOpen: true,  collapsible: true, Component: TrayZone },
  { id: "history", titleKey: "",                  defaultOpen: true,  collapsible: false, Component: HistoryZone },
];

const MAX_TOOL_ROUNDS = 5;
const MODE_KEY = "card-space-tool-mode";

export function Workbench({ card, interaction, allCards, registerZone, unregisterZone, onClose }: WorkbenchProps) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<WbMessage[]>([]);
  const [tempFiles, setTempFiles] = useState<TempFile[]>([]);
  const [trayCards, setTrayCards] = useState<string[]>([]);
  const [contextOrder, setContextOrder] = useState<ContextItem[]>([]);
  const [toolItems, setToolItems] = useState<ToolItem[]>([]);
  const [hasKey, setHasKey] = useState(false);
  const [stream, setStream] = useState<StreamState>({ phase: "idle", content: "", thinkingTrace: "", tokenCount: 0, error: null });
  const [openZones, setOpenZones] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const z of workbenchZones) init[z.id] = z.defaultOpen;
    return init;
  });

  // 阶段四：确认模式
  const [localModel, setLocalModel] = useState("");
  const [autoMode, setAutoMode] = useState(() => localStorage.getItem(MODE_KEY) === "auto");

  useEffect(() => { getActiveModel().then(setLocalModel); }, []);
  const [pendingConfirm, setPendingConfirm] = useState<{
    toolName: string; cardName: string;
  } | null>(null);
  const [lastToolCall, setLastToolCall] = useState<string | null>(null);
  const confirmResolve = useRef<((allowed: boolean) => void) | null>(null);
  const sessionAllowAll = useRef(false);

  // 阶段五：新建卡片弹窗
  const [showNewCard, setShowNewCard] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState("");
  const [newCardType, setNewCardType] = useState("md");

  // 工作模式
  const [showModeSlot, setShowModeSlot] = useState(false);
  const [modeCardId, setModeCardId] = useState<string | null>(null);
  const [modeCardData, setModeCardData] = useState<ModeCard | null>(null);
  const [modeType, setModeType] = useState<ModeType>(null);
  const [showModeHelp, setShowModeHelp] = useState(false);
  const [pauseResolve, setPauseResolve] = useState<(() => void) | null>(null);
  const [pauseLabel, setPauseLabel] = useState("");
  const [modeToast, setModeToast] = useState<string | null>(null);
  const [openDrawer, setOpenDrawer] = useState<string | null>(null);
  const [drawerTop, setDrawerTop] = useState(0);
  const [drawerLeft, setDrawerLeft] = useState(0);
  const iconRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // 上下文注入 + 思考链
  const contextOverrides = useRef(new Map<string, { content: string; mode: "full" | "titleOnly"; note: string }>());
  const [thinkingMode, setThinkingMode] = useState(() => localStorage.getItem("card-space-thinking-mode") ?? "last");
  const [showContextEdit, setShowContextEdit] = useState<string | null>(null); // ref → 编辑浮层
  const [extractedContent, setExtractedContent] = useState("");

  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const checkedRef = useRef(new Set<number>());
  const historyScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { hasAnyKey().then(setHasKey); }, []);

  // 加载持久化会话
  useEffect(() => {
    loadWorkbenchSession(card.id).then((saved) => {
      if (!saved) return;
      setMessages(saved.messages ?? []);
      setTempFiles(saved.tempFiles ?? []);
      setTrayCards(saved.trayCards ?? []);
      setContextOrder(saved.contextOrder ?? []);
      setToolItems(saved.toolItems ?? []);
      if (saved.modeCardId) { setModeCardId(saved.modeCardId); setShowModeSlot(true); }
      if (saved.localModel) setLocalModel(saved.localModel);
      if (saved.autoMode !== undefined) setAutoMode(saved.autoMode);
      if (saved.thinkingMode) setThinkingMode(saved.thinkingMode);
      if (saved.contextOverrides) {
        for (const [ref, ov] of Object.entries(saved.contextOverrides)) {
          contextOverrides.current.set(ref, ov);
        }
      }
      // 恢复 modeCardData
      if (saved.modeCardId) {
        const mc = allCards.find((c) => c.id === saved.modeCardId);
        if (mc?.sphereId) {
          readSphereFiles(mc.sphereId).then((files) => {
            try {
              const validated = validateModeCard(JSON.parse(files.map((f) => f.content).join("\n")));
              if (validated) { setModeCardData(validated); setModeType(validated.type); }
            } catch { /* */ }
          });
        }
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 自动保存（2 秒防抖）
  const saveTimer = useRef(0);
  useEffect(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveWorkbenchSession(card.id, {
        messages, tempFiles, trayCards, contextOrder, toolItems,
        modeCardId, localModel, autoMode, thinkingMode,
        contextOverrides: Object.fromEntries(contextOverrides.current),
      });
    }, 2000) as unknown as number;
    return () => clearTimeout(saveTimer.current);
  }, [messages, tempFiles, trayCards, contextOrder, toolItems, modeCardId, localModel, autoMode, thinkingMode]);

  const toggleMode = useCallback(() => {
    setAutoMode((prev) => {
      const next = !prev;
      localStorage.setItem(MODE_KEY, next ? "auto" : "manual");
      sessionAllowAll.current = false;
      return next;
    });
  }, []);

  // 勾选消息 → 自动加入 contextOrder
  useEffect(() => {
    const now = new Set<number>();
    messages.forEach((m, i) => { if (m.checked) now.add(i); });
    for (const idx of now) {
      if (!checkedRef.current.has(idx)) {
        const msg = messages[idx];
        const item: ContextItem = { type: "message", id: `msg-${idx}`, label: msg.content.slice(0, 40), ref: String(idx) };
        setContextOrder((prev) => { if (prev.some((p) => p.id === item.id)) return prev; return [...prev, item]; });
      }
    }
    for (const idx of checkedRef.current) {
      if (!now.has(idx)) setContextOrder((prev) => prev.filter((p) => p.id !== `msg-${idx}`));
    }
    checkedRef.current = now;
  }, [messages]);

  const isBusy = stream.phase === "streaming" || stream.phase === "thinking";

  const onMessagesChange = useCallback((fn: (prev: WbMessage[]) => WbMessage[]) => setMessages(fn), []);
  const onTempFilesChange = useCallback((fn: (prev: TempFile[]) => TempFile[]) => setTempFiles(fn), []);
  const onTrayCardsChange = useCallback((fn: (prev: string[]) => string[]) => setTrayCards(fn), []);
  const onContextOrderChange = useCallback((fn: (prev: ContextItem[]) => ContextItem[]) => setContextOrder(fn), []);
  const onToolItemsChange = useCallback((fn: (prev: ToolItem[]) => ToolItem[]) => setToolItems(fn), []);
  const onCreateCard = useCallback((_title: string, _fileData?: { name: string; content: string }) => {}, []);
  const onContextEdit = useCallback((ref: string) => setShowContextEdit(ref), []);
  const onExtractCard = useCallback((content: string) => { setExtractedContent(content); }, []);

  const handleContextSave = useCallback((itemRef: string, content: string, note: string, mode: "full" | "titleOnly") => {
    contextOverrides.current.set(itemRef, { content, mode, note });
    setShowContextEdit(null);
  }, []);

  // 提取为卡片
  useEffect(() => {
    if (!extractedContent) return;
    const title = `${t("wb.extractedCardTitle")} ${new Date().toLocaleTimeString()}`;
    const card = createCard(title, { x: 300 + Math.random() * 200, y: 300 + Math.random() * 200 });
    setTrayCards((prev) => [...prev, card.id]);
    const cat = fileCategory("extract.md");
    setTempFiles((prev) => [...prev, { name: title + ".md", size: new TextEncoder().encode(extractedContent).length, category: cat, cardId: card.id }]);
    setMessages((prev) => [...prev, { role: "assistant", content: `[Extracted]\n${extractedContent}`, thinkingTrace: "", checked: false, collapsed: true, timestamp: Date.now() }]);
    setExtractedContent("");
  }, [extractedContent]);

  // 模式卡：凹槽接收
  const onModeSlotDrop = useCallback(async (cardId: string) => {
    const c = allCards.find((x) => x.id === cardId);
    if (!c?.sphereId) return;
    try {
      const files = await readSphereFiles(c.sphereId);
      const text = files.map((f) => f.content).join("\n");
      const json = JSON.parse(text);
      const validated = validateModeCard(json);
      if (!validated) { setModeToast(t("wb.modeInvalid")); setTimeout(() => setModeToast(null), 3000); return; }
      setModeCardId(cardId);
      setModeCardData(validated);
      setModeType(validated.type);
      setShowModeSlot(false);
    } catch { setModeToast(t("wb.modeInvalid")); setTimeout(() => setModeToast(null), 3000); }
  }, [allCards]);

  // 模式卡：移除
  const onModeCardRemove = useCallback(() => {
    setModeCardId(null);
    setModeCardData(null);
    setModeType(null);
  }, []);

  const buildToolContext = useCallback((): ToolContext => {
    const wbCardIds = new Set<string>();
    for (const item of contextOrder) { if (item.type === "card") wbCardIds.add(item.ref); }
    for (const item of toolItems) wbCardIds.add(item.cardId);
    const toolCardIds = new Set(toolItems.map((t) => t.cardId));
    return {
      workbenchCardIds: [...wbCardIds], toolCardIds: [...toolCardIds], allCards,
      readCard: async (cardId: string) => {
        const c = allCards.find((x) => x.id === cardId);
        if (!c?.sphereId) return `卡片 "${c?.label ?? cardId}" 内容为空。`;
        try { const files = await readSphereFiles(c.sphereId); return files.map((f) => `[${f.name}]\n${f.content}`).join("\n\n"); }
        catch { return `无法读取卡片内容。`; }
      },
      createCard: async (title: string, content: string) => {
        const c = createCard(title, { x: 300 + Math.random() * 200, y: 300 + Math.random() * 200 });
        const cat = fileCategory(title + ".md");
        setTempFiles((prev) => [...prev, { name: title + ".md", size: new TextEncoder().encode(content).length, category: cat, cardId: c.id }]);
        setTrayCards((prev) => [...prev, c.id]);
        return title;
      },
      updateCard: async (cardId: string, content: string) => { storageUpdateCard(cardId, { label: content.slice(0, 30) }); },
      tagCard: async (cardId: string, tags: string[]) => { storageUpdateCard(cardId, { tags }); },
      searchCards: async (query: string) => {
        const idx = getIndex(); if (!idx) return [];
        const q = query.toLowerCase();
        return Object.values(idx.cards).filter((c) => c.label.toLowerCase().includes(q) || c.tags.some((t) => t.toLowerCase().includes(q))).map((c) => ({ name: c.label, tags: c.tags })).slice(0, 20);
      },
    };
  }, [allCards, contextOrder, toolItems]);

  // ============================================================
  // 构建上下文卡片 system messages
  // ============================================================
  const buildContextMessages = useCallback(async (): Promise<ChatMessage[]> => {
    const msgs: ChatMessage[] = [];
    for (const item of contextOrder) {
      if (item.type !== "card") continue;
      const card = allCards.find((c) => c.id === item.ref);
      if (!card?.sphereId) continue;

      const override = contextOverrides.current.get(item.ref);
      let content: string;
      let mode: "full" | "titleOnly";
      let note = "";

      if (override) {
        content = override.content;
        mode = override.mode;
        note = override.note;
      } else {
        try {
          const files = await readSphereFiles(card.sphereId);
          content = files.map((f) => `[${f.name}]\n${f.content}`).join("\n\n");
          mode = "full";
        } catch { continue; }
      }

      if (mode === "titleOnly") {
        msgs.push({
          role: "system",
          content: `用户提供了一张参考卡片：「${card.label}」\n标签：${card.tags.join("、") || "无"}。` +
            (note ? `\n用户注释：${note}` : "") +
            `\n内容未提供——仅在需要时通过 card_read 工具读取。`,
        });
      } else {
        msgs.push({
          role: "system",
          content: `以下是用户提供的上下文卡片「${card.label}」的内容：` +
            (note ? `\n用户注释：${note}\n` : "\n") +
            `\n标签：${card.tags.join("、") || "无"}\n\n${content}`,
        });
      }
    }
    return msgs;
  }, [contextOrder, allCards]);

  // ============================================================
  // AI 发送（含工具调用循环 + 确认模式）
  // ============================================================
  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || isBusy) return;
    setInput("");

    const userMsg: WbMessage = { role: "user", content: text, thinkingTrace: "", checked: false, collapsed: false, timestamp: Date.now() };
    const displayMessages = [...messages, userMsg];
    setMessages(displayMessages);

    // 工作模式路由
    if (modeCardData) {
      const controller = new AbortController();
      abortRef.current = controller;
      setStream({ phase: "thinking", content: "", thinkingTrace: "", tokenCount: 0, error: null });

      const contextMsgs = await buildContextMessages();

      try {
        if (modeCardData.type === "pipeline") {
          const pCtx: PipelineContext = {
            contextMessages: contextMsgs,
            streamChat: (m, msgs, sig, tools) => streamChat(m, msgs, sig, tools),
            onStepOutput: (label, content) => {
              const cat = fileCategory(label + ".md");
              setTempFiles((prev) => [...prev, { name: label + ".md", size: new TextEncoder().encode(content).length, category: cat }]);
              const aiMsg: WbMessage = { role: "assistant", content: `[${label}]\n${content}`, thinkingTrace: "", checked: false, collapsed: true, timestamp: Date.now() };
              setMessages((prev) => [...prev, aiMsg]);
            },
            onPause: async (label) => {
              setPauseLabel(label);
              return new Promise<void>((resolve) => setPauseResolve(() => resolve));
            },
            signal: controller.signal,
          };
          await runPipeline(modeCardData, text, pCtx);
        } else if (modeCardData.type === "team") {
          const tCtx: TeamContext = {
            streamChat: (m, msgs, sig) => streamChat(m, msgs, sig),
            onMemberOutput: (member, content) => {
              const aiMsg: WbMessage = { role: "assistant", content: `**[${member.role}]** (${member.model})\n${content}`, thinkingTrace: "", checked: false, collapsed: true, timestamp: Date.now() };
              setMessages((prev) => [...prev, aiMsg]);
            },
            signal: controller.signal,
            contextMessages: contextMsgs,
          };
          await runTeam(modeCardData, text, tCtx);
        } else if (modeCardData.type === "orchestrator") {
          const oCtx: OrchestratorContext = {
            streamChat: (m, msgs, sig, tools) => streamChat(m, msgs, sig, tools),
            onStepOutput: (label, content) => {
              const cat = fileCategory(label + ".md");
              setTempFiles((prev) => [...prev, { name: label + ".md", size: new TextEncoder().encode(content).length, category: cat }]);
            },
            signal: controller.signal,
            contextMessages: contextMsgs,
          };
          const final = await runOrchestrator(modeCardData, text, oCtx);
          if (final) {
            const aiMsg: WbMessage = { role: "assistant", content: final, thinkingTrace: "", checked: false, collapsed: true, timestamp: Date.now() };
            setMessages((prev) => [...prev, aiMsg]);
          }
        }
      } catch (err) {
        setStream((s) => ({ ...s, phase: "error", error: `Mode error: ${err instanceof Error ? err.message : String(err)}` }));
      }

      abortRef.current = null;
      setStream({ phase: "idle", content: "", thinkingTrace: "", tokenCount: 0, error: null });
      return;
    }

    // 单模型模式（原逻辑）
    const ctx = buildToolContext();

    // 构建上下文卡片 system messages
    const contextMsgs = await buildContextMessages();

    // 构建 API 消息（含思考链注入）
    const apiMessages: ChatMessage[] = displayMessages.map((m, i) => {
      const isLastAssistant = i === displayMessages.length - 1 && m.role === "assistant";
      let content = m.content;
      const thinking = m.thinkingTrace || undefined;

      if (thinking && m.role === "assistant") {
        if (thinkingMode === "all" || (thinkingMode === "last" && isLastAssistant)) {
          content = `[思考过程]\n${thinking}\n\n[回复]\n${content}`;
        }
      }

      return { role: m.role as "user" | "assistant", content, thinking };
    });

    // 上下文卡片注入放在最前面
    apiMessages.unshift(...contextMsgs);

    const model = localModel || await getActiveModel();

    let round = 0;
    let finalContent = "";
    let finalThinking = "";

    while (round < MAX_TOOL_ROUNDS) {
      round++;
      const controller = new AbortController();
      abortRef.current = controller;

      const tools = buildTools(toolItems, text);
      let streamContent = "";
      let streamThinking = "";
      let allToolCalls: ToolCall[] = [];

      setStream({ phase: "thinking", content: "", thinkingTrace: "", tokenCount: 0, error: null });

      try {
        for await (const chunk of streamChat(model, apiMessages, controller.signal, tools)) {
          if (chunk.error) { setStream((s) => ({ ...s, phase: "error", error: chunk.error })); break; }
          if (chunk.done) { allToolCalls = chunk.toolCalls ?? []; break; }
          streamContent += chunk.content;
          streamThinking += chunk.thinking;
          setStream((s) => ({ ...s, phase: streamContent ? "streaming" : "thinking", content: streamContent, thinkingTrace: streamThinking }));
        }
      } catch { setStream((s) => ({ ...s, phase: "error", error: "Request aborted" })); break; }

      if (allToolCalls.length > 0) {
        apiMessages.push({ role: "assistant", content: streamContent || "", tool_calls: allToolCalls });

        for (const tc of allToolCalls) {
          let args: Record<string, string> = {};
          try { args = JSON.parse(tc.function.arguments); } catch { /* */ }

          // 确认检查（手动模式 + 写工具 + 会话未全局允许）
          if (!autoMode && !sessionAllowAll.current && requiresConfirmation(tc.function.name)) {
            const cardName = args.cardId || args.title || "";
            setPendingConfirm({ toolName: tc.function.name, cardName });
            const allowed = await new Promise<boolean>((resolve) => { confirmResolve.current = resolve; });
            setPendingConfirm(null);
            if (!allowed) {
              apiMessages.push({ role: "tool", content: "用户拒绝了此操作。", tool_call_id: tc.id });
              continue;
            }
          }

          const result = await executeTool(tc.function.name, args, ctx);
          setLastToolCall(`${tc.function.name}${args.cardId ? " → " + args.cardId : ""}`);
          setTimeout(() => setLastToolCall(null), 4000);
          apiMessages.push({ role: "tool", content: result, tool_call_id: tc.id });
        }

        setStream((s) => ({ ...s, phase: "thinking", content: streamContent, thinkingTrace: streamThinking }));
        abortRef.current = null;
        continue;
      }

      finalContent = streamContent;
      finalThinking = streamThinking;
      break;
    }

    abortRef.current = null;

    if (finalContent || finalThinking) {
      const aiMsg: WbMessage = { role: "assistant", content: finalContent, thinkingTrace: finalThinking, checked: false, collapsed: true, timestamp: Date.now() };
      setMessages((prev) => [...prev, aiMsg]);
      if (finalContent.includes("报告") || finalContent.includes("report")) {
        const cat = fileCategory("report.md");
        setTempFiles((prev) => [...prev, { name: "report.md", size: finalContent.length * 2, category: cat }]);
      }
    }

    setStream({ phase: "idle", content: "", thinkingTrace: "", tokenCount: 0, error: null });
  }, [input, messages, isBusy, buildToolContext, toolItems, autoMode, modeCardData, localModel]);

  const stop = useCallback(() => { abortRef.current?.abort(); setStream((s) => ({ ...s, phase: "interrupted" })); }, []);
  const onKeyDown = useCallback((e: React.KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }, [send]);
  const toggleZone = useCallback((id: string) => { setOpenZones((prev) => ({ ...prev, [id]: !prev[id] })); }, []);

  // 确认：允许
  const onConfirmAllow = useCallback(() => { confirmResolve.current?.(true); }, []);
  // 确认：拒绝
  const onConfirmDeny = useCallback(() => { confirmResolve.current?.(false); }, []);
  // 确认：本次会话全部允许
  const onConfirmAllowAll = useCallback(() => { sessionAllowAll.current = true; confirmResolve.current?.(true); }, []);

  // 阶段五：新建卡片
  const doCreateCard = useCallback(() => {
    const title = newCardTitle.trim() || t("card.defaultLabel");
    const card = createCard(title, { x: 300 + Math.random() * 200, y: 300 + Math.random() * 200 });
    setTrayCards((prev) => [...prev, card.id]);
    setShowNewCard(false);
    setNewCardTitle("");
    setNewCardType("md");
  }, [newCardTitle, newCardType]);

  // 阶段五：导出模板
  const exportTemplate = useCallback(async () => {
    const contextCardIds = contextOrder.filter((item) => item.type === "card").map((item) => item.ref);
    const toolCardIds = toolItems.map((t) => t.cardId);
    const allExportIds = new Set([...contextCardIds, ...toolCardIds]);
    if (modeCardId) allExportIds.add(modeCardId);
    if (allExportIds.size === 0) { setModeToast(t("wb.noExportContent")); setTimeout(() => setModeToast(null), 3000); return; }

    const idx = getIndex(); if (!idx) return;
    const mainCardId = allExportIds.values().next().value!;
    const mainCard = allCards.find((c) => c.id === mainCardId);
    if (!mainCard?.sphereId) return;

    const readmeLines = [
      `# ${card.label || "Workbench Template"}`, "", `> ${new Date().toLocaleString()}`,
      "", "## Context cards", ...contextCardIds.map((cid) => { const c = allCards.find((x) => x.id === cid); return `- ${c?.label ?? "(gone)"}`; }),
      "", "## Tool cards", ...toolCardIds.map((cid) => { const c = allCards.find((x) => x.id === cid); return `- ${c?.label ?? "(gone)"}${c?.hasScripts ? " (script)" : ""}`; }),
      "", "## How to use", "", "1. Import this .card into Smelt space", "2. Drag cards into workbench Context and Tool zones",
      modeCardId ? "3. Drag the mode card into the mode slot" : "",
    ].filter(Boolean);
    const readmeFile = new File([new Blob([readmeLines.join("\n")])], "README.md");

    const extraFiles: { file: File; name: string }[] = [{ file: readmeFile, name: "README.md" }];
    for (const cid of allExportIds) {
      if (cid === mainCardId) continue;
      const c = allCards.find((x) => x.id === cid);
      if (!c?.sphereId) continue;
      try {
        const files = await readSphereFiles(c.sphereId);
        for (const f of files) {
          if (f.name === "_snapshot.png") continue;
          extraFiles.push({ file: new File([new Blob([f.content])], f.name), name: f.name });
        }
      } catch { /* skip */ }
    }

    const blob = await buildCardPackage({
      card: mainCard, sphere: idx.spheres[mainCard.sphereId],
      shell: BUILTIN_SHELLS[0].theme, extraFiles,
      manifest: { id: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
        label: card.label || "Workbench Template", version: "1.0.0", author: "Smelt User",
        description: `Context ${contextCardIds.length} · Tools ${toolCardIds.length}` + (modeCardData ? ` · Mode: ${modeCardData.type}` : ""),
        tags: ["workbench-template"], requires: [], createdAt: Date.now(), exportedAt: Date.now() },
      password: null, authorName: "Smelt User",
    });
    downloadBlob(blob, `${card.label || "workbench-template"}.card`);
  }, [contextOrder, toolItems, modeCardId, modeCardData, allCards, card]);

  // 阶段五：归档
  const doArchive = useCallback(() => {
    const lines: string[] = [];
    lines.push(`# ${t("wb.archiveDone")}`);
    lines.push(`> ${new Date().toLocaleString()}`);
    lines.push("");
    for (const m of messages) {
      lines.push(`## ${m.role === "user" ? t("wb.roleUser") : t("wb.roleAI")}`);
      lines.push(m.content);
      if (m.thinkingTrace) lines.push(`\n> ${t("wb.thinkingTrace")}: ${m.thinkingTrace}`);
      lines.push("");
    }
    if (contextOrder.length > 0) {
      lines.push(`## ${t("wb.contextOrder")}`);
      for (const item of contextOrder) lines.push(`- ${item.label}`);
    }
    const content = lines.join("\n");
    const record = createCard(`${t("wb.archiveDone")} ${new Date().toLocaleDateString()}`, { x: 200, y: 200 });
    setTrayCards((prev) => [...prev, record.id]);
    // 将归档内容作为卡片数据储存
    const cat = fileCategory("record.md");
    setTempFiles((prev) => [...prev, { name: "record.md", size: new TextEncoder().encode(content).length, category: cat, cardId: record.id }]);
    setMessages([]);
    setContextOrder([]);
    setToolItems([]);
    clearTimeout(saveTimer.current);
    saveWorkbenchSession(card.id, {
      messages: [], tempFiles, trayCards, contextOrder: [], toolItems: [],
      modeCardId, localModel, autoMode, thinkingMode,
      contextOverrides: Object.fromEntries(contextOverrides.current),
    });
    onClose();
  }, [messages, contextOrder, card.id, onClose, tempFiles, trayCards, toolItems, modeCardId, localModel, autoMode, thinkingMode]);

  // 阶段五：清除
  // 关闭时最终保存
  const handleClose = useCallback(() => {
    clearTimeout(saveTimer.current);
    saveWorkbenchSession(card.id, {
      messages, tempFiles, trayCards, contextOrder, toolItems,
      modeCardId, localModel, autoMode, thinkingMode,
      contextOverrides: Object.fromEntries(contextOverrides.current),
    });
    onClose();
  }, [messages, tempFiles, trayCards, contextOrder, toolItems, modeCardId, localModel, autoMode, thinkingMode, card.id, onClose]);

  const doClear = useCallback(() => {
    clearTimeout(saveTimer.current);
    contextOverrides.current.clear();
    deleteWorkbenchSession(card.id);
    setMessages([]);
    setTempFiles([]);
    setTrayCards([]);
    setContextOrder([]);
    setToolItems([]);
    onClose();
  }, [card.id, onClose]);

  const zoneProps: ZoneProps = {
    sessionId: card.id, allCards, registerZone, unregisterZone,
    messages, onMessagesChange,
    tempFiles, onTempFilesChange,
    trayCards, onTrayCardsChange,
    contextOrder, onContextOrderChange,
    toolItems, onToolItemsChange,
    onCreateCard,
    onContextEdit,
    onExtractCard,
    isBusy,
    streamContent: stream.content, streamThinking: stream.thinkingTrace,
    streamPhase: stream.phase, streamError: stream.error,
    hasKey,
  };

  return (
    <div className="panel-enter" style={{ ...panelStyle(card, interaction), width: 460, display: "flex", flexDirection: "row" }}>
      {/* 左窄列：图标 + 角标 */}
      <LeftIcons zoneProps={zoneProps} openDrawer={openDrawer} setOpenDrawer={setOpenDrawer} iconRefs={iconRefs} setDrawerTop={setDrawerTop} setDrawerLeft={setDrawerLeft} />

      {/* 右大区 */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Header 行 */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", borderBottom: "1px solid #f3f4f6", fontSize: "0.625rem", color: "#6b7280", flexWrap: "wrap" }}>
          <button onClick={toggleMode} style={{ border: "none", background: "none", fontSize: "0.625rem", color: autoMode ? "#22c55e" : "#f59e0b", cursor: "pointer", padding: 0, whiteSpace: "nowrap" }}>
            {autoMode ? t("wb.autoMode") : t("wb.manualMode")}
          </button>
          <select value={localModel} onChange={(e) => setLocalModel(e.target.value)}
            style={{ fontSize: "0.5625rem", border: "1px solid #e5e7eb", borderRadius: 3, padding: "1px 4px", outline: "none", color: "#6b7280", background: "#fafbfc", maxWidth: 140 }}>
            {Object.values(BUILTIN_PROVIDERS).filter((p) => p.id !== "custom").flatMap((p) =>
              p.models.map((m) => <option key={m} value={m}>{p.label} / {m}</option>)
            )}
          </select>
          <button onClick={() => setShowModeSlot((v) => !v)}
            style={{ border: "1px solid #e5e7eb", borderRadius: 3, padding: "1px 4px", fontSize: "0.5625rem", background: modeCardData ? "#f0f7ff" : "#fafbfc", cursor: "pointer", color: modeCardData ? "#1a1a2e" : "#6b7280", whiteSpace: "nowrap" }}>
            {modeCardData ? `${typeShort(modeCardData.type)}: ${modeCardData.name}` : `${t("wb.modeButton")} >`}
          </button>
          <select value={thinkingMode} onChange={(e) => { setThinkingMode(e.target.value); localStorage.setItem("card-space-thinking-mode", e.target.value); }}
            style={{ fontSize: "0.5625rem", border: "1px solid #e5e7eb", borderRadius: 3, padding: "1px 4px", outline: "none", color: "#6b7280", background: "#fafbfc" }}>
            <option value="last">{t("wb.thinkLabel")} last</option>
            <option value="off">{t("wb.thinkLabel")} off</option>
            <option value="all">{t("wb.thinkLabel")} all</option>
          </select>
          {lastToolCall && <span style={{ fontSize: "0.5625rem", color: "#9ca3af", flex: "1 0 auto", textAlign: "right" }}>{t("wb.toolExecuted", lastToolCall)}</span>}
        </div>

        {/* 确认条 / 暂停条 / 模式 Toast / ModeSlot */}
        {modeToast && <div style={{ padding: "4px 10px", background: "#fef2f2", borderBottom: "1px solid #fecaca", fontSize: "0.625rem", color: "#dc2626" }}>{modeToast}</div>}
        {pauseResolve && (
          <div style={{ padding: "6px 10px", background: "#fffbf0", borderBottom: "1px solid #fde68a", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: "0.625rem", color: "#92400e", flex: 1 }}>{pauseLabel || t("wb.pauseHint")}</span>
            <button onClick={() => { const r = pauseResolve; setPauseResolve(null); setPauseLabel(""); r(); }}
              style={{ padding: "2px 10px", border: "1px solid #d97706", borderRadius: 4, background: "#f59e0b", color: "#fff", fontSize: "0.625rem", cursor: "pointer" }}>{t("wb.continueBtn")}</button>
          </div>
        )}
        {pendingConfirm && (
          <div style={{ padding: "8px 10px", background: "#fffbf0", borderBottom: "1px solid #fde68a", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.625rem", color: "#92400e", flex: "1 0 100%" }}>{t("wb.confirmTitle", pendingConfirm.toolName)}{pendingConfirm.cardName && ` — ${t("wb.confirmDetail", pendingConfirm.cardName)}`}</span>
            <button onClick={onConfirmAllow} style={confirmBtn}>{t("wb.allow")}</button>
            <button onClick={onConfirmDeny} style={{ ...confirmBtn, background: "#fafbfc", color: "#ef4444", borderColor: "#fca5a5" }}>{t("wb.deny")}</button>
            <button onClick={onConfirmAllowAll} style={{ ...confirmBtn, background: "#fafbfc", borderColor: "#d1d5db" }}>{t("wb.allowAll")}</button>
          </div>
        )}
        {showModeSlot && (
          <ModeSlot modeCard={modeCardData} onDrop={onModeSlotDrop} onRemove={onModeCardRemove}
            onToggleHelp={() => setShowModeHelp((v) => !v)} registerZone={registerZone} unregisterZone={unregisterZone} />
        )}
        {showModeHelp && <ModeHelp onClose={() => setShowModeHelp(false)} />}

        {/* 对话历史（主力区） */}
        <TimelineBar messages={messages} scrollRef={historyScrollRef} />
        <HistoryZone {...zoneProps} scrollRef={historyScrollRef} />

        {/* 输入区 */}
        <div style={{ borderTop: "1px solid #e5e7eb", padding: 8 }}>
          <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown}
            placeholder={hasKey ? t("wb.inputPlaceholder") : t("settings.notConnected")}
            rows={2} disabled={!hasKey} style={{ ...inputStyle, height: 44 }} />
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            {isBusy ? (
              <button onClick={stop} style={{ ...btnSm, color: "#f59e0b" }}>{t("wb.stop")}</button>
            ) : (
              <button onClick={send} disabled={!input.trim()} style={{ ...btnSm, opacity: input.trim() ? 1 : 0.5 }}>{t("wb.send")}</button>
            )}
            <button onClick={() => setShowNewCard(true)} style={btnSm}>{t("wb.newCard")}</button>
            <button onClick={doArchive} disabled={messages.length === 0} style={{ ...btnSm, opacity: messages.length > 0 ? 1 : 0.4 }}>{t("wb.archive")}</button>
            <button onClick={exportTemplate} style={btnSm}>{t("wb.exportTemplate")}</button>
            <button onClick={doClear} style={{ ...btnSm, color: "#ef4444" }}>{t("wb.clear")}</button>
          </div>
        </div>
      </div>

      {/* 抽屉 */}
      {openDrawer && (
        <Drawer zoneId={openDrawer} top={drawerTop} left={drawerLeft} zoneProps={zoneProps} onClose={() => setOpenDrawer(null)} />
      )}

      {/* ContextDialog / new card / mode help */}
      {showContextEdit && (() => {
        const ctxItem = contextOrder.find((c) => c.type === "card" && c.ref === showContextEdit);
        const card = allCards.find((c) => c.id === showContextEdit);
        if (!ctxItem || !card) { setShowContextEdit(null); return null; }
        return <ContextEditDialog ref={showContextEdit} cardLabel={card.label} sphereId={card.sphereId}
          onClose={() => setShowContextEdit(null)} onSave={handleContextSave} />;
      })()}
      {showNewCard && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setShowNewCard(false); }}
          style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.06)" }}>
          <div style={{ width: 260, background: "#fff", border: "1px solid #d1d5db", padding: 16 }}>
            <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#1a1a2e", marginBottom: 12 }}>{t("wb.newCardTitle")}</div>
            <div style={{ marginBottom: 8 }}><div style={{ fontSize: "0.625rem", color: "#6b7280", marginBottom: 2 }}>{t("wb.newCardLabel")}</div>
              <input autoFocus value={newCardTitle} onChange={(e) => setNewCardTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") doCreateCard(); if (e.key === "Escape") setShowNewCard(false); }}
                placeholder={t("card.defaultLabel")}
                style={{ width: "100%", padding: "4px 8px", border: "1px solid #e5e7eb", borderRadius: 4, fontSize: "0.6875rem", outline: "none", boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: 12 }}><div style={{ fontSize: "0.625rem", color: "#6b7280", marginBottom: 2 }}>{t("wb.newCardType")}</div>
              <select value={newCardType} onChange={(e) => setNewCardType(e.target.value)}
                style={{ width: "100%", padding: "4px 8px", border: "1px solid #e5e7eb", borderRadius: 4, fontSize: "0.6875rem", outline: "none" }}>
                <option value="md">Markdown</option><option value="txt">Text</option>
              </select>
            </div>
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
              <button onClick={() => setShowNewCard(false)} style={btnSm}>{t("ui.cancel")}</button>
              <button onClick={doCreateCard} style={{ ...btnSm, background: "#1a1a2e", color: "#fff", borderColor: "#1a1a2e" }}>{t("ui.confirm")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ZoneShell({ zone, isOpen, onToggle, zoneProps, children }: {
  zone: ZoneConfig; isOpen: boolean; onToggle: () => void; zoneProps: ZoneProps; children: React.ReactNode;
}) {
  if (!zone.collapsible) return <>{children}</>;
  let badge = 0;
  if (zone.id === "context") badge = zoneProps.contextOrder.length;
  if (zone.id === "tool") badge = zoneProps.toolItems.length;
  if (zone.id === "files") badge = zoneProps.tempFiles.length;
  if (zone.id === "tray") badge = zoneProps.trayCards.length;
  return (
    <div style={{ borderTop: "1px solid #e5e7eb" }}>
      <div onClick={onToggle} style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", fontSize: "0.625rem", color: "#6b7280", cursor: "pointer", userSelect: "none" }}>
        <span>{t(zone.titleKey as any)}</span>
        {badge > 0 && <span style={{ background: "#e5e7eb", borderRadius: 8, padding: "0 6px", fontSize: "0.5625rem" }}>{badge}</span>}
        <span style={{ marginLeft: "auto", fontSize: "0.5625rem" }}>{isOpen ? "v" : ">"}</span>
      </div>
      {isOpen && children}
    </div>
  );
}

const CARD_W = 150;
const panelStyle = (card: CardEntry, interaction: InteractionConfig): React.CSSProperties => ({
  position: "absolute", left: card.position.x + CARD_W + 10, top: card.position.y,
  width: 460, maxHeight: "70vh",
  background: "#ffffff", border: "1px solid #d1d5db",
  zIndex: 100, boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
});
const inputStyle: React.CSSProperties = {
  width: "100%", border: "1px solid #e5e7eb", borderRadius: 4,
  padding: 6, fontSize: "0.6875rem", resize: "none", outline: "none",
  fontFamily: "inherit", boxSizing: "border-box",
};
const ZONE_ICONS = [
  { id: "context", icon: "#", labelKey: "wb.contextOrder" as const },
  { id: "tool",    icon: "+", labelKey: "wb.toolZone" as const },
  { id: "files",   icon: ":", labelKey: "wb.aiFiles" as const },
  { id: "tray",    icon: "=", labelKey: "wb.cardTray" as const },
  { id: "mode",    icon: "@", labelKey: "wb.modeButton" as const },
];

function getBadge(id: string, zp: ZoneProps): number {
  if (id === "context") return zp.contextOrder.length;
  if (id === "tool") return zp.toolItems.length;
  if (id === "files") return zp.tempFiles.length;
  if (id === "tray") return zp.trayCards.length;
  return 0;
}

function LeftIcons({ zoneProps, openDrawer, setOpenDrawer, iconRefs, setDrawerTop, setDrawerLeft }: {
  zoneProps: ZoneProps; openDrawer: string | null;
  setOpenDrawer: (id: string | null) => void;
  iconRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  setDrawerTop: (v: number) => void; setDrawerLeft: (v: number) => void;
}) {
  return (
    <div style={{ width: 50, display: "flex", flexDirection: "column", gap: 2, padding: "8px 4px", borderRight: "1px solid #e5e7eb", flexShrink: 0 }}>
      {ZONE_ICONS.map((z) => {
        const badge = getBadge(z.id, zoneProps);
        const isOpen = openDrawer === z.id;
        return (
          <div key={z.id}
            ref={(el) => { iconRefs.current[z.id] = el; }}
            onClick={() => {
              if (isOpen) { setOpenDrawer(null); return; }
              const r = iconRefs.current[z.id]?.getBoundingClientRect();
              setDrawerTop(r?.top ?? 0);
              setDrawerLeft(r?.right ?? 0);
              setOpenDrawer(z.id);
            }}
            title={t(z.labelKey)}
            style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", padding: "6px 2px", borderRadius: 4, cursor: "pointer", background: isOpen ? "#e5e7eb" : "transparent", fontSize: "0.875rem", color: badge > 0 ? "#1a1a2e" : "#9ca3af" }}>
            <span>{z.icon}</span>
            {badge > 0 && <span style={{ fontSize: "0.5rem", marginTop: 1, fontWeight: 600 }}>{badge}</span>}
          </div>
        );
      })}
    </div>
  );
}

function TimelineBar({ messages, scrollRef }: { messages: { timestamp: number }[]; scrollRef: React.RefObject<HTMLDivElement | null> }) {
  if (messages.length <= 5) return null;
  const groups: { label: string; msgIndex: number }[] = [];
  const firstTs = messages[0]?.timestamp ?? 0;
  for (let i = 0; i < messages.length; i++) {
    const bucket = firstTs ? Math.floor((messages[i].timestamp - firstTs) / 300000) : Math.floor(i / 5);
    const last = groups[groups.length - 1];
    if (!last || (firstTs ? Math.floor((messages[i].timestamp - firstTs) / 300000) !== Math.floor((messages[last.msgIndex].timestamp - firstTs) / 300000) : i - last.msgIndex >= 5)) {
      groups.push({ label: `${i}`, msgIndex: i });
    }
  }
  if (groups.length <= 1) return null;

  return (
    <div style={{ display: "flex", gap: 2, padding: "2px 8px", borderBottom: "1px solid #f3f4f6", overflowX: "auto" }}>
      {groups.map((g, i) => (
        <div key={i} onClick={() => {
          const el = scrollRef.current?.querySelector(`[data-index="${g.msgIndex}"]`);
          el?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
          style={{ width: 4, height: 4, borderRadius: 2, background: "#3b82f6", cursor: "pointer", flexShrink: 0 }}
          title={`Msg #${g.msgIndex}`} />
      ))}
    </div>
  );
}

function typeShort(type: ModeType): string {
  if (type === "pipeline") return t("wb.modePipeline");
  if (type === "team") return t("wb.modeTeam");
  if (type === "orchestrator") return t("wb.modeOrchestrator");
  return "";
}

const btnSm: React.CSSProperties = {
  padding: "3px 8px", border: "1px solid #e5e7eb", borderRadius: 4,
  background: "#fafbfc", fontSize: "0.625rem", cursor: "pointer", color: "#1a1a2e",
};
const confirmBtn: React.CSSProperties = {
  padding: "2px 10px", border: "1px solid #d97706", borderRadius: 4,
  background: "#f59e0b", color: "#fff", fontSize: "0.625rem", cursor: "pointer",
};
