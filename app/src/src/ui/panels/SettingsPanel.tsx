import { useState, useEffect, useRef } from "react";
import { BUILTIN_PROVIDERS, type ProviderId } from "../../foundation/types";
import { t } from "../../foundation/i18n";
import { loadSettings, setAPIKey, setActiveModel, getSettings } from "../../platform/settings";
import { getPublicKeyFingerprint, exportIdentityKey, importIdentityKey } from "../../features/identity/index";

interface SettingsPanelProps {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [keys, setKeys] = useState<Partial<Record<ProviderId, string>>>({});
  const [activeModel, setModel] = useState("deepseek-chat");
  const [fp, setFp] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSettings().then((s) => {
      setKeys({ ...s.keys });
      setModel(s.activeModel);
    });
    getPublicKeyFingerprint().then(setFp).catch(() => {});
  }, []);

  const providers = Object.values(BUILTIN_PROVIDERS);

  const handleImportKey = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const { fingerprint, success } = await importIdentityKey(f);
    if (success) setFp(fingerprint);
  };

  return (
    <div style={{
      position: "fixed", top: 60, right: 16, width: 320, maxHeight: "70vh", overflow: "auto",
      background: "#ffffff", border: "1px solid #d1d5db", padding: 16, zIndex: 200,
    }}>
      <h3 style={{ fontSize: "0.875rem", margin: "0 0 12px" }}>{t("settings.title")}</h3>

      {providers.filter((p) => p.id !== "custom").map((p) => (
        <div key={p.id} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: "0.75rem", color: "#6b7280", marginBottom: 4 }}>{p.label}</div>
          <input
            type="password"
            placeholder="API Key"
            value={keys[p.id] ?? ""}
            onChange={(e) => {
              setKeys((prev) => ({ ...prev, [p.id]: e.target.value }));
              setAPIKey(p.id, e.target.value);
            }}
            style={inputStyle}
          />
        </div>
      ))}

      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: "0.75rem", color: "#6b7280", marginBottom: 4 }}>{t("settings.model")}</div>
        <select
          value={activeModel}
          onChange={(e) => { setModel(e.target.value); setActiveModel(e.target.value); }}
          style={inputStyle}
        >
          {providers.flatMap((p) => p.models).map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      {/* UI Scale + Card Scale */}
      <div style={{ marginTop: 16, borderTop: "1px solid #e5e7eb", paddingTop: 12 }}>
        <div style={{ fontSize: "0.75rem", color: "#6b7280", marginBottom: 8 }}>Display</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: "0.625rem", color: "#6b7280", minWidth: 50 }}>UI Size</span>
          <input type="range" min="0.8" max="2.0" step="0.1"
            defaultValue={localStorage.getItem("card-space-uiScale") ?? "1.0"}
            onChange={(e) => { localStorage.setItem("card-space-uiScale", e.target.value); }}
            style={{ flex: 1 }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: "0.625rem", color: "#6b7280", minWidth: 50 }}>Card Size</span>
          <input type="range" min="0.6" max="1.4" step="0.05"
            defaultValue={localStorage.getItem("card-space-cardScale") ?? "1.0"}
            onChange={(e) => { localStorage.setItem("card-space-cardScale", e.target.value); }}
            style={{ flex: 1 }} />
        </div>
      </div>

      {/* Identity section */}
      <div style={{ marginTop: 16, borderTop: "1px solid #e5e7eb", paddingTop: 12 }}>
        <div style={{ fontSize: "0.75rem", color: "#6b7280", marginBottom: 8 }}>{t("export.identity")}</div>
        {fp && <div style={{ fontSize: "0.625rem", color: "#6b7280", marginBottom: 6 }}>{t("export.fingerprint", fp.slice(0, 16))}</div>}
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => exportIdentityKey()} style={btnStyle}>{t("export.exportKey")}</button>
          <input ref={fileRef} type="file" accept=".json" onChange={handleImportKey} style={{ display: "none" }} />
          <button onClick={() => fileRef.current?.click()} style={btnStyle}>{t("export.importKey")}</button>
        </div>
      </div>

      <button onClick={onClose} style={{ marginTop: 12, ...btnStyle }}>
        {t("ui.cancel")}
      </button>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "4px 8px", border: "1px solid #e5e7eb",
  borderRadius: 4, fontSize: "0.75rem", outline: "none",
};

const btnStyle: React.CSSProperties = {
  padding: "4px 12px", border: "1px solid #e5e7eb",
  borderRadius: 4, background: "#fafbfc", fontSize: "0.75rem", cursor: "pointer",
};
