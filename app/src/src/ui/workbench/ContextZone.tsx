import { useState, useCallback, useRef, useEffect } from "react";
import { t } from "../../foundation/i18n";
import { fileCategory } from "../../foundation/types";
import { ContextMenu } from "../components/ContextMenu";
import type { ZoneProps, ContextItem } from "./types";

export function ContextZone({ allCards, contextOrder, onContextOrderChange, registerZone, unregisterZone, onContextEdit }: ZoneProps) {
  const [showPicker, setShowPicker] = useState(false);
  const elRef = useRef<HTMLDivElement>(null);

  // 注册到 Canvas 拖拽中枢
  useEffect(() => {
    const el = elRef.current;
    if (el && registerZone) {
      registerZone("wb-context", el, "context", (cardId) => {
        // 防重复
        if (contextOrder.some((item) => item.ref === cardId)) return;
        const card = allCards.find((c) => c.id === cardId);
        if (!card || card.isWorkbench) return;
        const item: ContextItem = { type: "card", id: cardId, label: card.label, ref: cardId };
        onContextOrderChange((prev) => [...prev, item]);
      });
    }
    return () => { if (unregisterZone) unregisterZone("wb-context"); };
  }, [allCards, contextOrder, onContextOrderChange, registerZone, unregisterZone]);

  const removeItem = useCallback((id: string) => {
    onContextOrderChange((prev) => prev.filter((item) => item.id !== id));
  }, [onContextOrderChange]);

  const addCards = useCallback((cardIds: string[]) => {
    onContextOrderChange((prev) => {
      const existingRefs = new Set(prev.map((p) => p.ref));
      const newItems: ContextItem[] = cardIds
        .filter((cid) => !existingRefs.has(cid))
        .map((cid) => {
          const card = allCards.find((c) => c.id === cid);
          return { type: "card" as const, id: cid, label: card?.label ?? cid.slice(0, 8), ref: cid };
        });
      return [...prev, ...newItems];
    });
    setShowPicker(false);
  }, [allCards, onContextOrderChange]);

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; item: typeof contextOrder[0] } | null>(null);

  const onContextMenu = useCallback((e: React.MouseEvent, item: typeof contextOrder[0]) => {
    e.preventDefault();
    if (item.type !== "card") return;
    setCtxMenu({ x: e.clientX, y: e.clientY, item });
  }, []);

  return (
    <div ref={elRef} style={{ padding: "6px 10px", fontSize: "0.625rem", color: "#6b7280", position: "relative", minHeight: 28 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
        {contextOrder.map((item, i) => {
          const cat = item.type === "card" ? fileCategory(item.label) : { label: "MSG", color: "#6b7280" };
          return (
            <span
              key={item.id}
              onClick={() => { if (item.type === "card") onContextEdit?.(item.ref); }}
              onContextMenu={(e) => onContextMenu(e, item)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                fontSize: "0.5625rem", background: "#f0f7ff", border: "1px solid #bfdbfe",
                borderRadius: 3, padding: "2px 6px", cursor: item.type === "card" ? "pointer" : "context-menu",
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

      {showPicker && (
        <CardPicker
          cards={allCards}
          selected={new Set(contextOrder.filter((c) => c.type === "card").map((c) => c.ref))}
          onConfirm={addCards}
          onClose={() => setShowPicker(false)}
        />
      )}
      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={[
          { label: t("wb.ctxEditMenuEdit"), onClick: () => onContextEdit?.(ctxMenu.item.ref) },
          { label: t("ui.delete"), onClick: () => removeItem(ctxMenu.item.id), danger: true },
        ]} onClose={() => setCtxMenu(null)} />
      )}
    </div>
  );
}

// 卡片选择器
function CardPicker({ cards, selected, onConfirm, onClose }: {
  cards: ZoneProps["allCards"];
  selected: Set<string>;
  onConfirm: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set(selected));

  const toggle = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.06)",
      }}
    >
      <div style={{ width: 280, maxHeight: 360, background: "#fff", border: "1px solid #d1d5db", padding: 12, overflow: "auto" }}>
        <div style={{ fontSize: "0.6875rem", color: "#6b7280", marginBottom: 8 }}>{t("wb.contextOrder")}</div>
        {cards.filter((c) => !c.isWorkbench).map((c) => {
          const cat = fileCategory(c.label);
          return (
            <label
              key={c.id}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", fontSize: "0.6875rem", cursor: "pointer", color: picked.has(c.id) ? "#1a1a2e" : "#9ca3af" }}
            >
              <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} style={{ width: 12, height: 12, margin: 0 }} />
              <span style={{ width: 6, height: 12, borderRadius: 1, background: cat.color, flexShrink: 0 }} />
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.label}</span>
            </label>
          );
        })}
        {cards.filter((c) => !c.isWorkbench).length === 0 && (
          <div style={{ fontSize: "0.625rem", color: "#9ca3af", textAlign: "center", padding: 12 }}>—</div>
        )}
        <div style={{ display: "flex", gap: 6, marginTop: 12, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={pickerBtn}>{t("ui.cancel")}</button>
          <button onClick={() => onConfirm([...picked])} style={{ ...pickerBtn, background: "#1a1a2e", color: "#fff", borderColor: "#1a1a2e" }}>
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
