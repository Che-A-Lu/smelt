import { t } from "../../foundation/i18n";

interface ModeHelpProps {
  onClose: () => void;
}

export function ModeHelp({ onClose }: ModeHelpProps) {
  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.06)",
      }}
    >
      <div style={{
        width: 320, background: "#fff", border: "1px solid #d1d5db",
        padding: 16, fontSize: "0.6875rem", color: "#1a1a2e",
      }}>
        <h4 style={{ margin: "0 0 10px", fontSize: "0.8125rem" }}>{t("wb.modeHelpTitle")}</h4>

        <div style={{ marginBottom: 8 }}>
          <b style={{ color: "#1d4ed8" }}>{t("wb.modePipeline")} (pipeline)</b>
          <div style={{ color: "#6b7280", fontSize: "0.625rem", marginTop: 2 }}>{t("wb.modePipelineDesc")}</div>
        </div>

        <div style={{ marginBottom: 8 }}>
          <b style={{ color: "#be185d" }}>{t("wb.modeTeam")} (team)</b>
          <div style={{ color: "#6b7280", fontSize: "0.625rem", marginTop: 2 }}>{t("wb.modeTeamDesc")}</div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <b style={{ color: "#7c3aed" }}>{t("wb.modeOrchestrator")} (orchestrator)</b>
          <div style={{ color: "#6b7280", fontSize: "0.625rem", marginTop: 2 }}>{t("wb.modeOrchDesc")}</div>
        </div>

        <div style={{ fontSize: "0.5625rem", color: "#9ca3af", marginBottom: 12, lineHeight: 1.4 }}>
          {t("wb.modeHowTo")}
        </div>

        <div style={{ textAlign: "right" }}>
          <button onClick={onClose} style={{
            padding: "3px 12px", border: "1px solid #e5e7eb", borderRadius: 4,
            background: "#fafbfc", fontSize: "0.6875rem", cursor: "pointer",
          }}>
            {t("import.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
