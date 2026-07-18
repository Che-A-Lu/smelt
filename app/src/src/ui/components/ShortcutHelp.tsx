import { t } from "../../foundation/i18n";

const shortcuts = [
  { key: "Ctrl+K",    desc: "ui.search" },
  { key: "Ctrl+N",    desc: "wb.newSession" },
  { key: "Ctrl+S",    desc: "toast.saved" },
  { key: "Delete",    desc: "ui.delete" },
  { key: "Escape",    desc: "ui.cancel" }, // approximate
  { key: "Space",     desc: "card.viewDetail" },
  { key: "Space+drag", desc: "canvas.dropHint" }, // approximate
  { key: "Scroll",    desc: "settings.model" }, // approximate: zoom
  { key: "Shift+drag", desc: "export.packSelected" }, // approximate: box select
  { key: "Enter",     desc: "wb.send" },
  { key: "Shift+Enter", desc: "wb.newCard" }, // approximate
];

export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.06)" }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: 320, background: "#fff", border: "1px solid #d1d5db", padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>{t("shortcuts.title")}</span>
          <button onClick={onClose} style={{ border: "none", background: "none", fontSize: "0.875rem", cursor: "pointer", color: "#6b7280" }}>x</button>
        </div>
        {shortcuts.map((s) => (
          <div key={s.key} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "0.6875rem", borderBottom: "1px solid #f3f4f6" }}>
            <span style={{ fontFamily: "monospace", color: "#3b82f6" }}>{s.key}</span>
            <span style={{ color: "#6b7280" }}>{t(s.desc as any)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
