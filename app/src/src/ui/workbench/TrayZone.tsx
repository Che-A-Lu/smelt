import { t } from "../../foundation/i18n";
import { type CardEntry, fileCategory, CARD_W, CARD_H } from "../../foundation/types";
import type { ZoneProps } from "./types";

export function TrayZone({ allCards, trayCards, onTrayCardsChange }: ZoneProps) {
  const trayCardEntries = trayCards
    .map((id) => allCards.find((c) => c.id === id))
    .filter(Boolean) as CardEntry[];

  const removeFromTray = (id: string) => {
    onTrayCardsChange((prev) => prev.filter((cid) => cid !== id));
  };

  const onThumbPointerDown = (e: React.PointerEvent, cardId: string) => {
    // 拖出陈列区回到画布
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const sx = e.clientX;
    const sy = e.clientY;

    const onMove = (ev: PointerEvent) => {
      target.style.transform = `translate(${ev.clientX - sx}px, ${ev.clientY - sy}px)`;
      target.style.zIndex = "999";
      target.style.position = "relative";
    };
    const onUp = () => {
      target.style.transform = "";
      target.style.zIndex = "";
      target.style.position = "";
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      // 拖出陈列区后从 tray 移除（卡片仍在画布上）
      removeFromTray(cardId);
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
  };

  return (
    <div style={{ padding: "6px 10px", fontSize: "0.625rem", color: "#6b7280" }}>
      {trayCardEntries.length > 0 ? (
        <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: 4 }}>
          {trayCardEntries.map((card) => {
            const cat = fileCategory(card.label);
            return (
              <div
                key={card.id}
                onPointerDown={(e) => onThumbPointerDown(e, card.id)}
                style={{
                  width: 80, height: 112, border: "1px solid #e5e7eb",
                  borderRadius: 4, background: "#fff", flexShrink: 0,
                  fontSize: "0.5rem", color: "#6b7280", padding: 3,
                  overflow: "hidden", cursor: "grab",
                  touchAction: "none", userSelect: "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 2, marginBottom: 2 }}>
                  <span style={{ width: 4, height: 8, borderRadius: 1, background: cat.color, flexShrink: 0 }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "0.4375rem" }}>
                    {card.label.slice(0, 12)}
                  </span>
                </div>
                <div style={{ fontSize: "0.4375rem", color: "#9ca3af", lineHeight: 1.3, overflow: "hidden" }}>
                  {card.tags.length > 0
                    ? card.tags.slice(0, 2).join(", ")
                    : card.sphereId ? "..." : ""}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <span style={{ color: "#9ca3af" }}>—</span>
      )}
    </div>
  );
}
