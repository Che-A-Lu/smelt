import { useRef, useEffect, useCallback, useState } from "react";
import { t } from "../../foundation/i18n";
import { ContextMenu } from "../components/ContextMenu";
import type { ZoneProps } from "./types";

export function HistoryZone(props: ZoneProps & { scrollRef?: React.RefObject<HTMLDivElement | null> }) {
  const { messages, onMessagesChange, isBusy, streamContent, streamThinking, streamPhase, streamError, hasKey, onExtractCard, scrollRef: externalRef } = props;
  const internalRef = useRef<HTMLDivElement>(null);
  const scrollRef = externalRef ?? internalRef;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streamContent]);

  const toggleCheck = (idx: number) => {
    onMessagesChange((prev) => prev.map((m, i) => i === idx ? { ...m, checked: !m.checked } : m));
  };

  const toggleCollapse = (idx: number) => {
    onMessagesChange((prev) => prev.map((m, i) => i === idx ? { ...m, collapsed: !m.collapsed } : m));
  };

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; idx: number } | null>(null);

  const onMsgContextMenu = useCallback((e: React.MouseEvent, idx: number) => {
    e.preventDefault();
    if (!messages[idx]) return;
    setCtxMenu({ x: e.clientX, y: e.clientY, idx });
  }, [messages]);

  const busy = streamPhase === "streaming" || streamPhase === "thinking";

  return (
    <div ref={scrollRef} style={{ flex: 1, overflow: "auto", padding: 10, minHeight: 100, maxHeight: 340 }}>
      {messages.length === 0 && !busy && (
        <div style={{ fontSize: "0.6875rem", color: "#9ca3af", textAlign: "center", padding: 20 }}>
          {hasKey ? t("wb.startHint") : t("wb.noKeyHint")}
        </div>
      )}

      {messages.map((msg, i) => (
        <div
          key={i}
          data-index={i}
          onContextMenu={(e) => onMsgContextMenu(e, i)}
          style={{
            marginBottom: 8, padding: 6,
            background: msg.checked ? "#f0f7ff" : "transparent",
            borderRadius: 4,
            borderLeft: msg.role === "assistant" ? "2px solid #e5e7eb" : "2px solid #3b82f6",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={msg.checked}
              onChange={() => toggleCheck(i)}
              style={{ width: 12, height: 12, margin: 0, cursor: "pointer" }}
            />
            <span style={{ fontSize: "0.5625rem", color: "#9ca3af" }}>
              {msg.role === "user" ? t("wb.roleUser") : t("wb.roleAI")}
            </span>
            {msg.role === "assistant" && msg.thinkingTrace && (
              <button
                onClick={() => toggleCollapse(i)}
                style={{ fontSize: "0.5625rem", color: "#6b7280", border: "none", background: "none", cursor: "pointer", padding: 0 }}
              >
                {msg.collapsed ? t("wb.thinkingTrace") + " >" : t("wb.thinkingTrace") + " v"}
              </button>
            )}
          </div>
          <div style={{ fontSize: "0.6875rem", color: "#1a1a2e", whiteSpace: "pre-wrap", marginTop: 4 }}>
            {msg.content}
          </div>
          {!msg.collapsed && msg.thinkingTrace && (
            <div style={{ fontSize: "0.625rem", color: "#9ca3af", marginTop: 4, padding: 4, background: "#fafbfc", borderRadius: 2 }}>
              {msg.thinkingTrace}
            </div>
          )}
        </div>
      ))}

      {busy && (
        <div style={{ padding: 6, borderLeft: "2px solid #3b82f6" }}>
          {streamPhase === "thinking" && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.6875rem", color: "#6b7280" }}>
              <div style={{
                width: 14, height: 14, borderRadius: "50%",
                border: "2px solid #e5e7eb", borderTopColor: "#3b82f6",
                animation: "spin 1s linear infinite",
              }} />
              {t("wb.thinking")}
            </div>
          )}
          {streamContent && (
            <div style={{ fontSize: "0.6875rem", color: "#1a1a2e", whiteSpace: "pre-wrap" }}>
              {streamContent}
              <span className="blink-cursor">|</span>
            </div>
          )}
          {streamError && (
            <div style={{ fontSize: "0.6875rem", color: "#ef4444", marginTop: 4 }}>{streamError}</div>
          )}
        </div>
      )}
      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={[{
          label: t("wb.extractCard"), onClick: () => {
            const msg = messages[ctxMenu.idx];
            if (!msg) return;
            const checked = messages.filter((m) => m.checked);
            const selected = checked.length > 0 ? checked : [msg];
            const text = selected.map((m) => `[${m.role === "user" ? t("wb.roleUser") : t("wb.roleAI")}]\n${m.content}`).join("\n\n");
            onExtractCard?.(text);
          },
        }]} onClose={() => setCtxMenu(null)} />
      )}
    </div>
  );
}
