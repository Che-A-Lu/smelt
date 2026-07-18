import { t } from "../../foundation/i18n";
import { fileCategory } from "../../foundation/types";
import { createCard } from "../../platform/storage";
import type { ZoneProps } from "./types";

export function FilesZone({ tempFiles, onTempFilesChange, trayCards, onTrayCardsChange, onCreateCard }: ZoneProps) {
  const buildCard = (file: typeof tempFiles[0]) => {
    const card = createCard(file.name, { x: 300 + Math.random() * 200, y: 300 + Math.random() * 200 });
    onTrayCardsChange((prev) => [...prev, card.id]);
    onTempFilesChange((prev) => prev.filter((f) => f.name !== file.name));
    onCreateCard(file.name);
  };

  return (
    <div style={{ padding: "4px 10px", fontSize: "0.625rem", color: "#6b7280" }}>
      {tempFiles.length > 0 ? (
        tempFiles.map((f, i) => {
          const cat = f.category ?? fileCategory(f.name);
          return (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "3px 0",
              borderBottom: i < tempFiles.length - 1 ? "1px solid #f3f4f6" : "none",
            }}>
              <span style={{ width: 6, height: 12, borderRadius: 1, background: cat.color, display: "inline-block", flexShrink: 0 }} />
              <span style={{ flex: 1, color: "#1a1a2e", fontSize: "0.625rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {f.name}
              </span>
              <span style={{ color: "#9ca3af", fontSize: "0.5625rem", flexShrink: 0 }}>{Math.round(f.size / 1024)}KB</span>
              <button
                onClick={() => buildCard(f)}
                style={{
                  padding: "1px 6px", border: "1px solid #e5e7eb", borderRadius: 3,
                  background: "#fafbfc", fontSize: "0.5625rem", cursor: "pointer", color: "#6b7280",
                  flexShrink: 0,
                }}
              >
                {t("wb.createCard")}
              </button>
            </div>
          );
        })
      ) : (
        <span style={{ color: "#9ca3af" }}>—</span>
      )}
    </div>
  );
}
