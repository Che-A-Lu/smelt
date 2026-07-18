import { useState, useEffect, useCallback } from "react";
import { type SpaceIndex, type InteractionConfig, defaultInteraction } from "./foundation/types";
import { t, setLang, getLang } from "./foundation/i18n";
import { initSpace, createCard } from "./platform/storage";
import { Canvas } from "./ui/canvas/Canvas";
import { SettingsPanel } from "./ui/panels/SettingsPanel";
import { SearchPanel } from "./ui/panels/SearchPanel";
import { ShortcutHelp } from "./ui/components/ShortcutHelp";
import { ImportDialog } from "./ui/dialogs/ImportDialog";

type Panel = "settings" | "search" | null;

export default function App() {
  const [index, setIndex] = useState<SpaceIndex | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [interaction] = useState<InteractionConfig>(defaultInteraction);
  const [lang, setLangState] = useState(getLang());
  const [, forceUpdate] = useState(0);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [autoOpenWb, setAutoOpenWb] = useState<string | null>(null);

  useEffect(() => {
    initSpace((msg) => console.warn(msg)).then(setIndex);
  }, []);

  const toggleLang = useCallback(() => {
    const next = lang === "zh" ? "en" : "zh";
    setLang(next);
    setLangState(next);
  }, [lang]);

  const togglePanel = useCallback((p: Panel) => {
    setPanel((prev) => (prev === p ? null : p));
  }, []);

  const refresh = useCallback(() => forceUpdate((n) => n + 1), []);

  // 新建工作台卡片
  const createWorkbench = useCallback(() => {
    if (!index) return;
    const card = createCard(t("wb.newSession"), { x: 300, y: 200 });
    card.isWorkbench = true;
    refresh();
    setAutoOpenWb(card.id);
  }, [index, refresh]);

  if (!index) {
    return (
      <div style={loadingStyle}>
        <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>{t("ui.loading")}</div>
      </div>
    );
  }

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden" }}>
      {/* 顶部工具栏 */}
      <div style={toolbarStyle}>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={createWorkbench} style={toolbarBtnStyle}>
            + {t("wb.newSession")}
          </button>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => togglePanel("search")} style={toolbarBtnStyle}>{t("ui.search")}</button>
          <button onClick={toggleLang} style={toolbarBtnStyle}>{t("ui.lang")}</button>
          <button onClick={() => setShowShortcuts(true)} style={toolbarBtnStyle}>?</button>
          <button onClick={() => togglePanel("settings")} style={toolbarBtnStyle}>{t("ui.settings")}</button>
        </div>
      </div>

      <Canvas index={index} interaction={interaction} onCreateWorkbench={createWorkbench} onRefresh={refresh} onFileDrop={setImportFile} autoOpenWorkbenchId={autoOpenWb} />

      {panel === "settings" && <SettingsPanel onClose={() => setPanel(null)} />}
      {panel === "search" && <SearchPanel onClose={() => setPanel(null)} />}
      {showShortcuts && <ShortcutHelp onClose={() => setShowShortcuts(false)} />}
      {importFile && (
        <ImportDialog
          file={importFile}
          onClose={() => setImportFile(null)}
          onImported={() => { setImportFile(null); refresh(); }}
        />
      )}
    </div>
  );
}

const toolbarStyle: React.CSSProperties = {
  position: "fixed", top: 0, left: 0, right: 0, height: 36,
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "0 12px", background: "#fafbfc", borderBottom: "1px solid #e5e7eb",
  zIndex: 500,
};

const toolbarBtnStyle: React.CSSProperties = {
  padding: "4px 10px", border: "none", borderRadius: 4,
  background: "transparent", fontSize: "0.75rem", color: "#6b7280",
  cursor: "pointer",
};

const loadingStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  height: "100vh", color: "#6b7280", fontSize: "0.875rem",
};
