import { useState, useEffect, useCallback } from "react";
import { type CardEntry, type SphereEntry } from "../../foundation/types";
import { t } from "../../foundation/i18n";
import { readSphereFiles, getIndex } from "../../platform/storage";
import { buildCardPackage, downloadBlob, scanContent, getPasswordStrength, type EditsLog } from "../../features/export/index";
import { BUILTIN_SHELLS } from "../../features/templates/index";
import { getPublicKeyFingerprint } from "../../features/identity/index";

interface ExportPanelProps {
  cardIds: Set<string>;
  allCards: CardEntry[];
  onClose: () => void;
}

export function ExportPanel({ cardIds, allCards, onClose }: ExportPanelProps) {
  const cards = allCards.filter((c) => cardIds.has(c.id));
  const [label, setLabel] = useState(cards[0]?.label ?? "");
  const [author, setAuthor] = useState("Anonymous");
  const [version, setVersion] = useState("1.0.0");
  const [tags, setTags] = useState("");
  const [desc, setDesc] = useState("");
  const [files, setFiles] = useState<{ cardLabel: string; fileName: string; size: number; content: string }[]>([]);
  const [include, setInclude] = useState<Set<string>>(new Set());
  const [password, setPassword] = useState("");
  const [useEnc, setUseEnc] = useState(false);
  const [useSig, setUseSig] = useState(true);
  const [readme, setReadme] = useState("");
  const [editNote, setEditNote] = useState("");
  const [scan, setScan] = useState<ReturnType<typeof scanContent>>([]);
  const [fp, setFp] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    (async () => {
      const all: typeof files = [];
      for (const c of cards) {
        if (!c.sphereId) continue;
        const fs = await readSphereFiles(c.sphereId);
        for (const f of fs) {
          if (f.name === "_snapshot.png") continue;
          all.push({ cardLabel: c.label, fileName: f.name, size: new TextEncoder().encode(f.content).length, content: f.content });
        }
      }
      setFiles(all);
      setInclude(new Set(all.map((f) => f.fileName)));
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { getPublicKeyFingerprint().then(setFp).catch(() => {}); }, []);

  const toggleFile = useCallback((name: string) => {
    setInclude((prev) => { const next = new Set(prev); if (next.has(name)) next.delete(name); else next.add(name); return next; });
  }, []);

  const genReadme = useCallback(() => {
    const lines = [
      `# ${label}`,
      "", `Author: ${author}  Version: ${version}`,
      tags ? `Tags: ${tags}` : "", desc || "",
      "", "## Files",
      ...files.filter((f) => include.has(f.fileName)).map((f) => `- ${f.fileName} (${f.cardLabel})`),
      "", "Drag into Smelt space to view and continue editing.",
    ].filter(Boolean);
    setReadme(lines.join("\n"));
  }, [label, author, version, tags, desc, files, include]);

  const doScan = useCallback(() => {
    const issues: ReturnType<typeof scanContent> = [];
    for (const f of files) { if (include.has(f.fileName)) issues.push(...scanContent(f.fileName, f.content)); }
    setScan(issues);
  }, [files, include]);

  const doExport = useCallback(async () => {
    setExporting(true);
    const idx = getIndex();
    if (!idx || cards.length === 0) { setExporting(false); return; }
    const card = cards[0];
    const sphere = card.sphereId ? idx.spheres[card.sphereId] : null;
    const manifestFields = {
      id: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
      label, version, author, description: desc,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean), requires: [] as string[],
      createdAt: card.createdAt, exportedAt: Date.now(),
    };
    const extras = readme.trim() ? [{ file: new File([new Blob([readme])], "README.md"), name: "README.md" }] : [];
    const editsLog: EditsLog = { originalAuthor: author, originalHash: "", chain: editNote.trim() ? [{ editor: author, timestamp: Date.now(), note: editNote.trim(), changes: { added: [], removed: [], modified: [] } }] : [] };
    try {
      const blob = await buildCardPackage({
        card, shell: BUILTIN_SHELLS[0].theme, sphere,
        sphereFileFilter: new Set(files.filter((f) => include.has(f.fileName)).map((f) => f.fileName)),
        extraFiles: extras,
        manifest: manifestFields,
        password: useEnc ? password : null,
        authorName: author,
        previousEditsLog: editNote.trim() ? editsLog : undefined,
        editNote: editNote.trim() || undefined,
      });
      downloadBlob(blob, `${label || "export"}.card`);
    } catch (err) { console.warn("Export failed", err); }
    onClose();
  }, [cards, label, author, version, tags, desc, files, include, readme, password, useEnc, useSig, editNote, onClose]);

  const pwStrength = getPasswordStrength(password);

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} style={panel}>
        <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#1a1a2e", marginBottom: 12 }}>{t("export.panelTitle")}</div>

        <InputRow label={t("card.cardName")} value={label} onChange={setLabel} />
        <InputRow label={t("export.authorLabel")} value={author} onChange={setAuthor} />
        <InputRow label={t("export.versionLabel")} value={version} onChange={setVersion} />
        <InputRow label={t("export.tagsLabel")} value={tags} onChange={setTags} />

        <div style={{ marginTop: 12, borderTop: "1px solid #e5e7eb", paddingTop: 8 }}>
          <div style={{ fontSize: "0.625rem", color: "#6b7280", marginBottom: 4 }}>{t("export.fileList")}</div>
          {files.map((f) => (
            <label key={`${f.cardLabel}/${f.fileName}`} style={fileRow}>
              <input type="checkbox" checked={include.has(f.fileName)} onChange={() => toggleFile(f.fileName)} style={{ width: 12, height: 12, margin: 0 }} />
              <span style={{ flex: 1 }}>{f.fileName}</span>
              <span style={{ fontSize: "0.5625rem", color: "#9ca3af" }}>{Math.round(f.size / 1024)}KB</span>
              <span style={{ fontSize: "0.5625rem", color: "#d1d5db" }}>({f.cardLabel})</span>
            </label>
          ))}
          <button onClick={genReadme} style={smBtn}>{t("export.generateReadme")}</button>
        </div>

        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: "0.625rem", color: "#6b7280", marginBottom: 2 }}>{t("export.editNote")}</div>
          <textarea value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder={t("export.editNotePlaceholder")} rows={2}
            style={textArea} />
        </div>

        {scan.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: "0.625rem", color: "#f59e0b" }}>{t("export.privacyIssue", String(scan.length))}</div>
            {scan.map((s, i) => (
              <div key={i} style={{ fontSize: "0.5625rem", color: "#92400e" }}>{s.file}:{s.line} — {s.reason}</div>
            ))}
          </div>
        )}
        <button onClick={doScan} style={{ ...smBtn, marginTop: 4 }}>{t("export.privacyScan")}</button>

        <div style={{ marginTop: 12, borderTop: "1px solid #e5e7eb", paddingTop: 8 }}>
          <div style={{ fontSize: "0.625rem", color: "#6b7280", marginBottom: 4 }}>{t("export.security")}</div>
          <label style={checkRow}>
            <input type="checkbox" checked={useSig} onChange={() => setUseSig(!useSig)} style={{ width: 12, height: 12, margin: 0 }} />
            {t("export.useSignature")} {fp ? `(${fp.slice(0, 12)}...)` : ""}
          </label>
          <label style={checkRow}>
            <input type="checkbox" checked={useEnc} onChange={() => setUseEnc(!useEnc)} style={{ width: 12, height: 12, margin: 0 }} />
            {t("export.useEncryption")}
          </label>
          {useEnc && (
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password"
              style={{ ...inputS, width: "100%", marginTop: 4 }} />
          )}
          {useEnc && password && <div style={{ fontSize: "0.5625rem", color: pwStrength === "strong" ? "#22c55e" : pwStrength === "medium" ? "#f59e0b" : "#ef4444" }}>{t("export.pwStrength", pwStrength)}</div>}
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16, borderTop: "1px solid #e5e7eb", paddingTop: 12 }}>
          <button onClick={onClose} style={cancelBtn}>{t("ui.cancel")}</button>
          <button onClick={doExport} disabled={exporting} style={exportBtn}>{exporting ? t("export.exporting") : t("export.packDownload")}</button>
        </div>
      </div>
    </div>
  );
}

function InputRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
      <span style={{ fontSize: "0.625rem", color: "#6b7280", minWidth: 60 }}>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} style={inputS} />
    </div>
  );
}

const overlay: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.06)" };
const panel: React.CSSProperties = { width: 440, maxHeight: "85vh", overflow: "auto", background: "#fff", border: "1px solid #d1d5db", padding: 20 };
const inputS: React.CSSProperties = { flex: 1, padding: "3px 6px", border: "1px solid #e5e7eb", borderRadius: 4, fontSize: "0.6875rem", outline: "none" };
const textArea: React.CSSProperties = { width: "100%", padding: "4px 8px", border: "1px solid #e5e7eb", borderRadius: 4, fontSize: "0.625rem", outline: "none", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" };
const fileRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, padding: "2px 0", fontSize: "0.625rem", cursor: "pointer", color: "#1a1a2e" };
const checkRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 4, fontSize: "0.625rem", color: "#1a1a2e", marginBottom: 4, cursor: "pointer" };
const smBtn: React.CSSProperties = { padding: "2px 8px", border: "1px solid #e5e7eb", borderRadius: 3, background: "#fafbfc", fontSize: "0.625rem", cursor: "pointer", color: "#6b7280", marginTop: 4 };
const cancelBtn: React.CSSProperties = { padding: "4px 12px", border: "1px solid #e5e7eb", borderRadius: 4, background: "#fafbfc", fontSize: "0.6875rem", cursor: "pointer" };
const exportBtn: React.CSSProperties = { padding: "4px 14px", border: "1px solid #1a1a2e", borderRadius: 4, background: "#1a1a2e", color: "#fff", fontSize: "0.6875rem", cursor: "pointer" };
