import { useRef, useEffect } from "react";
import { t } from "../../foundation/i18n";
import type { ModeCard, ModeType } from "../../features/mode/types";

interface ModeSlotProps {
  modeCard: ModeCard | null;
  onDrop: (cardId: string) => void;
  onRemove: () => void;
  onToggleHelp: () => void;
  registerZone: (id: string, el: HTMLElement, type: "mode", onDrop: (cardId: string) => void) => void;
  unregisterZone: (id: string) => void;
}

export function ModeSlot({ modeCard, onDrop, onRemove, onToggleHelp, registerZone, unregisterZone }: ModeSlotProps) {
  const elRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = elRef.current;
    if (el) registerZone("wb-mode", el, "mode", onDrop);
    return () => unregisterZone("wb-mode");
  }, [registerZone, unregisterZone, onDrop]);

  const typeLabel = (type: ModeType) => {
    if (type === "pipeline") return t("wb.modePipeline");
    if (type === "team") return t("wb.modeTeam");
    if (type === "orchestrator") return t("wb.modeOrchestrator");
    return "";
  };

  return (
    <div ref={elRef} style={{ padding: "6px 10px", borderBottom: "1px solid #f3f4f6", background: "#fafbfc" }}>
      {modeCard ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.625rem" }}>
          <span style={{
            background: modeCard.type === "pipeline" ? "#dbeafe" : modeCard.type === "team" ? "#fce7f3" : "#ede9fe",
            color: modeCard.type === "pipeline" ? "#1d4ed8" : modeCard.type === "team" ? "#be185d" : "#7c3aed",
            borderRadius: 3, padding: "1px 6px", fontSize: "0.5625rem", fontWeight: 600,
          }}>
            {typeLabel(modeCard.type)}
          </span>
          <span style={{ color: "#1a1a2e", fontWeight: 500 }}>{modeCard.name}</span>
          <button
            onClick={onRemove}
            style={{ marginLeft: "auto", border: "none", background: "none", cursor: "pointer", fontSize: "0.75rem", color: "#9ca3af", padding: 0 }}
          >
            x
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            flex: 1, height: 48, border: "1px dashed #d1d5db", borderRadius: 4,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "0.625rem", color: "#9ca3af",
          }}>
            {t("wb.modeSlotHint")}
          </div>
          <button
            onClick={onToggleHelp}
            style={{
              width: 22, height: 22, borderRadius: 11, border: "1px solid #d1d5db",
              background: "#fff", cursor: "pointer", fontSize: "0.75rem", color: "#6b7280",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}
            title={t("wb.modeHelpTitle")}
          >
            ?
          </button>
        </div>
      )}
    </div>
  );
}
