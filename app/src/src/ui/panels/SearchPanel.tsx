import { useState } from "react";
import { t } from "../../foundation/i18n";

interface SearchPanelProps {
  onClose: () => void;
}

export function SearchPanel({ onClose }: SearchPanelProps) {
  const [query, setQuery] = useState("");

  return (
    <div style={{
      position: "fixed", top: 60, left: "50%", transform: "translateX(-50%)", width: 360,
      background: "#ffffff", border: "1px solid #d1d5db", padding: 16, zIndex: 200,
    }}>
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("search.placeholder")}
        style={{
          width: "100%", padding: "6px 10px", border: "1px solid #e5e7eb",
          borderRadius: 4, fontSize: "0.8125rem", outline: "none",
        }}
      />
      <div style={{ fontSize: "0.75rem", color: "#9ca3af", marginTop: 8 }}>
        {query ? t("search.noResults") : ""}
      </div>
    </div>
  );
}
