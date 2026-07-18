import { useState, useCallback, useRef, useEffect } from "react";
import { t } from "../../foundation/i18n";
import { fileCategory } from "../../foundation/types";
import { ContextMenu } from "../components/ContextMenu";
import type { ZoneProps, ToolItem } from "./types";

export function ToolZone({ allCards, toolItems, onToolItemsChange, registerZone, unregisterZone }: ZoneProps) {
  const [showPicker, setShowPicker] = useState(false);
  const elRef = useRef<HTMLDivElement>(null);

  // 注册到 Canvas 拖拽中枢
  useEffect(() => {
    const el = elRef.current;
    if (el && registerZone) {
      registerZone("wb-tool", el, "tool", (cardId) => {
        // 防重复
        if (toolItems.some((item) => item.cardId === cardId)) return;
        const card = allCards.find((c) => c.id === cardId);
        if (!card || card.isWorkbench) return;
        const item: ToolItem = {
          id: cardId, cardId, label: card.label,
          description: card.hasScripts ? t("wb.executableScript") : "",
        };
        onToolItemsChange((prev) => [...prev, item]);
      });
    }
    return () => { if (unregisterZone) unregisterZone("wb-tool"); };
  }, [allCards, toolItems, onToolItemsChange, registerZone, unregisterZone]);

  const removeItem = useCallback((id: string) => {
    onToolItemsChange((prev) => prev.filter((item) => item.id !== id));
  }, [onToolItemsChange]);

  const addCards = useCallback((cardIds: string[]) => {
    onToolItemsChange((prev) => {
      const existing = new Set(prev.map((p) => p.cardId));
      const newItems: ToolItem[] = cardIds
        .filter((cid) => !existing.has(cid))
        .map((cid) => {
          const card = allCards.find((c) => c.id === cid);
          return {
            id: cid, cardId: cid,
            label: card?.label ?? cid.slice(0, 8),
            description: card?.hasScripts ? t("wb.executableScript") : "",
          };
        });
      return [...prev, ...newItems];
    });
    setShowPicker(false);
  }, [allCards, onToolItemsChange]);

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; id: string } | null>(null);

  const onContextMenu = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, id });
  }, []);

  return (
    <div ref={elRef} style={{ padding: "6px 10px", fontSize: "0.625rem", color: "#6b7280", position: "relative", minHeight: 28 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
        {toolItems.map((item) => {
          const cat = fileCategory(item.label);
          return (
            <span
              key={item.id}
              onContextMenu={(e) => onContextMenu(e, item.id)}
              title={item.description}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                fontSize: "0.5625rem", background: "#f5f3ff", border: "1px solid #ddd6fe",
                borderRadius: 3, padding: "2px 6px", cursor: "context-menu",
                maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}
            >
              <span style={{ width: 6, height: 10, borderRadius: 1, background: cat.color, flexShrink: 0 }} />
              {item.label}
            </span>
          );
        })}
        <button
          onClick={() => setShowPicker(true)}
          style={{
            width: 20, height: 20, borderRadius: 3, border: "1px dashed #d1d5db",
            background: "transparent", cursor: "pointer", fontSize: "0.75rem", color: "#9ca3af",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}
        >
          +
        </button>
      </div>

      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={[
          { label: t("ui.delete"), onClick: () => removeItem(ctxMenu.id), danger: true },
        ]} onClose={() => setCtxMenu(null)} />
      )}
      {showPicker && (
        <ToolPicker
          cards={allCards}
          selected={new Set(toolItems.map((t) => t.cardId))}
          onConfirm={addCards}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}

function ToolPicker({ cards, selected, onConfirm, onClose }: {
  cards: ZoneProps["allCards"];
  selected: Set<string>;
  onConfirm: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set(selected));
  const toggle = (id: string) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.06)" }}
    >
      <div style={{ width: 280, maxHeight: 360, background: "#fff", border: "1px solid #d1d5db", padding: 12, overflow: "auto" }}>
        <div style={{ fontSize: "0.6875rem", color: "#6b7280", marginBottom: 8 }}>{t("wb.toolZone")}</div>
        {cards.filter((c) => !c.isWorkbench).map((c) => {
          const cat = fileCategory(c.label);
          return (
            <label
              key={c.id}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", fontSize: "0.6875rem", cursor: "pointer", color: picked.has(c.id) ? "#7c3aed" : "#9ca3af" }}
            >
              <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} style={{ width: 12, height: 12, margin: 0 }} />
              <span style={{ width: 6, height: 12, borderRadius: 1, background: cat.color, flexShrink: 0 }} />
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.label}</span>
              {c.hasScripts && <span style={{ fontSize: "0.5rem", background: "#7c3aed", color: "#fff", borderRadius: 2, padding: "0 4px" }}>RUN</span>}
            </label>
          );
        })}
        {cards.filter((c) => !c.isWorkbench).length === 0 && (
          <div style={{ fontSize: "0.625rem", color: "#9ca3af", textAlign: "center", padding: 12 }}>—</div>
        )}
        <div style={{ display: "flex", gap: 6, marginTop: 12, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={pickerBtn}>{t("ui.cancel")}</button>
          <button onClick={() => onConfirm([...picked])} style={{ ...pickerBtn, background: "#7c3aed", color: "#fff", borderColor: "#7c3aed" }}>
            {t("ui.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

const pickerBtn: React.CSSProperties = {
  padding: "3px 10px", border: "1px solid #e5e7eb", borderRadius: 4,
  background: "#fafbfc", fontSize: "0.6875rem", cursor: "pointer",
};
