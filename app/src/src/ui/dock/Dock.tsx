import { useEffect, useRef, useCallback } from "react";
import { type DockEntry, type CardEntry, DOCK_W, DOCK_H } from "../../foundation/types";
import { t } from "../../foundation/i18n";
import { deactivateCardInDock } from "../../platform/storage";

interface DockProps {
  dock: DockEntry;
  cards: Record<string, CardEntry>;
  registerZone: (id: string, el: HTMLElement, type: "dock") => void;
  unregisterZone: (id: string) => void;
  onDropOut: (cardId: string, vx: number, vy: number) => void;
  onRefresh: () => void;
}

export function Dock({ dock, cards, registerZone, unregisterZone, onDropOut, onRefresh }: DockProps) {
  const elRef = useRef<HTMLDivElement>(null);
  const hasActive = dock.activeCardIds.length > 0;
  const drag = useRef<{
    active: boolean; cardId: string; sx: number; sy: number; ox: number; oy: number; el: HTMLElement | null;
  }>({ active: false, cardId: "", sx: 0, sy: 0, ox: 0, oy: 0, el: null });

  useEffect(() => {
    const el = elRef.current;
    if (el) registerZone(dock.id, el, "dock");
    return () => unregisterZone(dock.id);
  }, [dock.id, registerZone, unregisterZone]);

  const onCardPointerDown = useCallback((e: React.PointerEvent, cardId: string) => {
    e.stopPropagation();
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);

    const d = drag.current;
    d.active = true;
    d.cardId = cardId;
    d.el = target;
    d.sx = e.clientX;
    d.sy = e.clientY;
    d.ox = target.offsetLeft;
    d.oy = target.offsetTop;

    target.style.transition = "none";
    target.style.zIndex = "999";
    target.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
  }, []);

  const onCardPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.active || !d.el) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    d.el.style.transform = `translate(${dx}px, ${dy}px)`;
  }, []);

  const onCardPointerUp = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.active) return;
    d.active = false;

    const el = d.el;
    if (!el) return;

    // 复位样式
    el.style.transition = "transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1)";
    el.style.zIndex = "";
    el.style.boxShadow = "";

    // 判断是否拖出了卡座
    const dockEl = elRef.current;
    if (dockEl) {
      const dockRect = dockEl.getBoundingClientRect();
      const outside =
        e.clientX < dockRect.left || e.clientX > dockRect.right ||
        e.clientY < dockRect.top || e.clientY > dockRect.bottom;

      if (outside) {
        // 拖出：停用卡片 + 归还画布
        el.style.transform = "";
        deactivateCardInDock(d.cardId, dock.id);
        onDropOut(d.cardId, e.clientX, e.clientY);
        onRefresh();
      } else {
        // 放回卡座
        el.style.transform = "";
      }
    }

    d.el = null;
  }, [dock.id, onDropOut, onRefresh]);

  return (
    <div
      ref={elRef}
      style={{
        position: "absolute",
        left: dock.position.x, top: dock.position.y,
        width: DOCK_W, height: DOCK_H,
        border: "2px solid #d1d5db",
        borderRadius: 6,
        background: hasActive ? "rgba(34,197,94,0.04)" : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexDirection: "column", gap: 4,
        userSelect: "none",
        zIndex: 3,
        transition: "border-color 150ms ease-out, box-shadow 150ms ease-out",
      }}
    >
      {!hasActive && (
        <div style={{
          width: "80%", height: "60%",
          border: "1px dashed #d1d5db", borderRadius: 4,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontSize: "0.625rem", color: "#9ca3af", textAlign: "center", padding: 8 }}>
            {t("dock.empty")}
          </span>
        </div>
      )}

      {hasActive && (
        <div style={{ textAlign: "center", width: "100%" }}>
          <div style={{ fontSize: "0.625rem", color: "#22c55e", marginBottom: 6 }}>{t("dock.active")}</div>
          {dock.activeCardIds.map((id) => {
            const card = cards[id];
            return (
              <div
                key={id}
                onPointerDown={(e) => onCardPointerDown(e, id)}
                onPointerMove={onCardPointerMove}
                onPointerUp={onCardPointerUp}
                onPointerCancel={onCardPointerUp}
                style={{
                  fontSize: "0.5625rem", color: "#6b7280",
                  padding: "4px 12px", margin: "3px 0",
                  border: "1px solid #d1d5db", borderRadius: 4,
                  background: "#fff", cursor: "grab",
                  touchAction: "none", userSelect: "none",
                }}
              >
                <span style={{ fontSize: "0.4375rem", color: "#9ca3af", display: "block" }}>
                  {card ? (card.label.length > 12 ? card.label.slice(0, 12) + "..." : card.label) : id.slice(0, 8)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
