import { useState, useRef, useCallback, useEffect } from "react";
import { type PackEntry, type CardEntry } from "../../foundation/types";
import { t } from "../../foundation/i18n";
import { updatePack, deletePack, moveCardToPack } from "../../platform/storage";
import { ContextMenu } from "../components/ContextMenu";

interface PackViewProps {
  pack: PackEntry;
  cards: CardEntry[];
  registerZone: (id: string, el: HTMLElement, type: "pack") => void;
  unregisterZone: (id: string) => void;
}

export function PackView({ pack, cards, registerZone, unregisterZone }: PackViewProps) {
  const [isOpen, setIsOpen] = useState(pack.isOpen);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(pack.label);
  const elRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = elRef.current;
    if (el) registerZone(pack.id, el, "pack");
    return () => unregisterZone(pack.id);
  }, [pack.id, registerZone, unregisterZone]);

  const toggle = useCallback(() => {
    const next = !isOpen;
    setIsOpen(next);
    updatePack(pack.id, { isOpen: next });
  }, [isOpen, pack.id]);

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

  // 右键菜单
  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const commitRename = useCallback(() => {
    setEditing(false);
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== pack.label) {
      updatePack(pack.id, { label: trimmed });
    }
  }, [editValue, pack]);

  // 包内卡片拖出：简化的 pointer 事件（无完整物理，直接跟随）
  const thumbDrag = useRef<{
    active: boolean; cardId: string; sx: number; sy: number; px: number; py: number;
  }>({ active: false, cardId: "", sx: 0, sy: 0, px: 0, py: 0 });

  const onThumbPointerDown = useCallback((e: React.PointerEvent, cardId: string) => {
    e.stopPropagation();
    const td = thumbDrag.current;
    td.active = true;
    td.cardId = cardId;
    td.px = e.clientX; td.py = e.clientY;
    td.sx = e.clientX; td.sy = e.clientY;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onThumbPointerMove = useCallback((e: React.PointerEvent) => {
    const td = thumbDrag.current;
    if (!td.active) return;
    td.px = e.clientX; td.py = e.clientY;
    const target = e.target as HTMLElement;
    target.style.transform = `translate(${e.clientX - td.sx}px, ${e.clientY - td.sy}px)`;
    target.style.zIndex = "999";
    target.style.position = "relative";
  }, []);

  const onThumbPointerUp = useCallback((e: React.PointerEvent) => {
    const td = thumbDrag.current;
    if (!td.active) return;
    const cardId = td.cardId;
    td.active = false;

    const target = e.target as HTMLElement;
    target.style.transform = "";
    target.style.zIndex = "";
    target.style.position = "";

    // 判断是否拖出了包区域
    const el = elRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      const outside = e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom;
      if (outside) {
        // 拖出包，放回桌面（位置在松手处附近）
        moveCardToPack(cardId, null);
      }
    }
  }, []);

  return (
    <div
      ref={elRef}
      onContextMenu={onContextMenu}
      style={{
        position: "absolute",
        left: pack.position.x, top: pack.position.y,
        minWidth: 180, minHeight: isOpen ? 120 : 48,
        border: "1px dashed #d1d5db",
        borderRadius: 6, background: "#fafbfc", padding: 8,
        userSelect: "none", zIndex: 2,
        transition: "min-height 200ms cubic-bezier(0.34, 1.56, 0.64, 1)",
      }}
    >
      <div
        onClick={toggle}
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.6875rem", color: "#6b7280", cursor: "pointer" }}
      >
        {editing ? (
          <input
            autoFocus
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") { setEditing(false); setEditValue(pack.label); } }}
            onClick={(e) => e.stopPropagation()}
            style={{ fontSize: "0.6875rem", border: "1px solid #3b82f6", borderRadius: 2, padding: "1px 4px", width: 120, outline: "none" }}
          />
        ) : (
          <span>{pack.label}</span>
        )}
        <span style={{ background: "#e5e7eb", borderRadius: 8, padding: "0 6px", fontSize: "0.625rem" }}>{cards.length}</span>
      </div>

      {isOpen && cards.length === 0 && (
        <div style={{ fontSize: "0.625rem", color: "#9ca3af", marginTop: 8 }}>{t("pack.empty")}</div>
      )}

      {isOpen && cards.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginTop: 8, overflowX: "auto", padding: 4, minHeight: 112 }}>
          {cards.map((card) => (
            <div
              key={card.id}
              onPointerDown={(e) => onThumbPointerDown(e, card.id)}
              onPointerMove={onThumbPointerMove}
              onPointerUp={onThumbPointerUp}
              style={{
                width: 80, height: 112, border: "1px solid #e5e7eb",
                borderRadius: 4, background: "#fff", flexShrink: 0,
                fontSize: "0.5rem", color: "#6b7280", padding: 3,
                overflow: "hidden", cursor: "grab", touchAction: "none",
              }}
              title={card.label}
            >
              {card.label.slice(0, 15)}
            </div>
          ))}
        </div>
      )}
      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={[
          { label: t("pack.rename"), onClick: () => { setEditing(true); setEditValue(pack.label); } },
          { label: t("pack.delete"), onClick: () => deletePack(pack.id), danger: true },
        ]} onClose={() => setCtxMenu(null)} />
      )}
    </div>
  );
}
