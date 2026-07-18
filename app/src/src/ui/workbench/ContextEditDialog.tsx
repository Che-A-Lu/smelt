import { useState, useEffect, useCallback } from "react";
import { t } from "../../foundation/i18n";
import { fileCategory } from "../../foundation/types";
import { readSphereFiles } from "../../platform/storage";

interface ContextEditDialogProps {
  ref: string;
  cardLabel: string;
  sphereId: string | null;
  onClose: () => void;
  onSave: (ref: string, content: string, note: string, mode: "full" | "titleOnly") => void;
}

export function ContextEditDialog({ ref: itemRef, cardLabel, sphereId, onClose, onSave }: ContextEditDialogProps) {
  const [originalContent, setOriginalContent] = useState("");
  const [content, setContent] = useState("");
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<"full" | "titleOnly">("full");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sphereId) { setLoading(false); return; }
    readSphereFiles(sphereId).then((files) => {
      const text = files.map((f) => `[${f.name}]\n${f.content}`).join("\n\n");
      setOriginalContent(text);
      setContent(text);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [sphereId]);

  const resetContent = useCallback(() => {
    setContent(originalContent);
    setMode("full");
    setNote("");
  }, [originalContent]);

  const handleSave = useCallback(() => {
    onSave(itemRef, content, note, mode);
    onClose();
  }, [itemRef, content, note, mode, onSave, onClose]);

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.06)",
      }}
    >
      <div style={{ width: 400, maxHeight: "80vh", background: "#fff", border: "1px solid #d1d5db", padding: 16, overflow: "auto" }}>
        <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#1a1a2e", marginBottom: 12 }}>
          {t("wb.ctxEditTitle")}
        </div>
        <div style={{ fontSize: "0.625rem", color: "#6b7280", marginBottom: 4 }}>Card: {cardLabel}</div>

        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: "0.625rem", color: "#6b7280", marginBottom: 2 }}>{t("wb.ctxEditNote")}</div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("wb.ctxEditNotePlaceholder")}
            rows={2}
            style={{ width: "100%", padding: "4px 8px", border: "1px solid #e5e7eb", borderRadius: 4, fontSize: "0.625rem", outline: "none", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }}
          />
        </div>

        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: "0.625rem", color: "#6b7280", marginBottom: 2 }}>{t("wb.ctxEditContent")}</div>
          {loading
            ? <div style={{ fontSize: "0.625rem", color: "#9ca3af" }}>{t("ui.loading")}</div>
            : (
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={10}
                style={{ width: "100%", padding: "4px 8px", border: "1px solid #e5e7eb", borderRadius: 4, fontSize: "0.5625rem", fontFamily: "monospace", outline: "none", resize: "vertical", boxSizing: "border-box" }}
              />
            )
          }
        </div>

        <div style={{ marginBottom: 12, fontSize: "0.625rem", color: "#6b7280" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4, cursor: "pointer" }}>
            <input type="radio" name="ctxmode" checked={mode === "full"} onChange={() => setMode("full")} style={{ width: 12, height: 12, margin: 0 }} />
            {t("wb.ctxEditFull")}
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
            <input type="radio" name="ctxmode" checked={mode === "titleOnly"} onChange={() => setMode("titleOnly")} style={{ width: 12, height: 12, margin: 0 }} />
            {t("wb.ctxEditTitleOnly")}
          </label>
        </div>

        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          <button onClick={resetContent} style={{ padding: "3px 10px", border: "1px solid #e5e7eb", borderRadius: 4, background: "#fafbfc", fontSize: "0.6875rem", cursor: "pointer" }}>{t("wb.ctxEditReset")}</button>
          <button onClick={onClose} style={{ padding: "3px 10px", border: "1px solid #e5e7eb", borderRadius: 4, background: "#fafbfc", fontSize: "0.6875rem", cursor: "pointer" }}>{t("ui.cancel")}</button>
          <button onClick={handleSave} style={{ padding: "3px 10px", border: "1px solid #1a1a2e", borderRadius: 4, background: "#1a1a2e", color: "#fff", fontSize: "0.6875rem", cursor: "pointer" }}>{t("wb.ctxEditSave")}</button>
        </div>
      </div>
    </div>
  );
}
