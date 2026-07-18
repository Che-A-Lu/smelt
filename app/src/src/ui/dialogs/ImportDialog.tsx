import { useState, useEffect, useCallback } from "react";
import { t } from "../../foundation/i18n";
import { importCard as importToStorage } from "../../platform/storage";
import { parseCardFile, type ParsedCard } from "../../features/import/index";
import { verifyChain, hashSingleFile } from "../../features/identity/index";
import { verifyPassword } from "../../features/export/index";
import { getTrustRecord, setTrusted } from "../../features/identity/trust";
import type { EditsLog } from "../../features/export/index";

interface ImportDialogProps {
  file: File;
  onClose: () => void;
  onImported: () => void;
}

type Step = "unpack" | "security" | "signature" | "select" | "importing";

const STEP_ORDER: Step[] = ["unpack", "security", "signature", "select"];

export function ImportDialog({ file, onClose, onImported }: ImportDialogProps) {
  const [step, setStep] = useState<Step>("unpack");
  const [parsed, setParsed] = useState<ParsedCard | null>(null);
  const [sigResult, setSigResult] = useState<{
    originalAuthor: string | null; sigValid: boolean;
  } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [password, setPassword] = useState("");
  const [pwError, setPwError] = useState(false);
  const [pwOK, setPwOK] = useState(false);
  const [hashIssues, setHashIssues] = useState<{ name: string; msg: string }[]>([]);
  const [editsLog, setEditsLog] = useState<EditsLog | null>(null);
  const [trustInfo, setTrustInfo] = useState<{ fp: string; label: string; count: number; trusted: boolean; firstTime: boolean } | null>(null);

  // 解包
  useEffect(() => {
    parseCardFile(file).then((p) => {
      setParsed(p);
      if (p.contentFiles.length > 0) {
        setSelected(new Set(p.contentFiles.map((f) => f.name)));
      }
    });
  }, [file]);

  // 签名验证 + edits + trust
  useEffect(() => {
    if (step !== "signature") return;
    if (parsed?.provenance.chain) {
      verifyChain(parsed.provenance.chain, parsed.provenance.contentHash ?? "").then((r) => {
        setSigResult({ originalAuthor: r.originalAuthor, sigValid: r.valid });
        if (r.originalAuthor && parsed.provenance.chain?.[0]?.publicKey) {
          const { publicKey } = parsed.provenance.chain[0];
          const raw = `${(publicKey as any).x ?? ""}${(publicKey as any).y ?? ""}`;
          crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw)).then((hash) => {
            const fp = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
            const record = getTrustRecord(fp, r.originalAuthor ?? "Unknown");
            setTrustInfo({ fp, label: record.label, count: record.count, trusted: record.trusted, firstTime: record.firstSeen === Date.now() || record.count === 1 });
          });
        }
      });
    }
    // edits.json
    if (parsed) {
      const editsFile = parsed.contentFiles.find((f) => f.name === "edits.json");
      if (editsFile) {
        try { setEditsLog(JSON.parse(new TextDecoder().decode(editsFile.data))); } catch { /* */ }
      }
    }
  }, [step, parsed]);

  // 每文件 hash 检查
  useEffect(() => {
    if (step !== "security" || !parsed?.manifest) return;
    (async () => {
      const manifestFiles = (parsed.manifest as any).files as Record<string, string> | undefined;
      if (!manifestFiles) return;
      const issues: { name: string; msg: string }[] = [];
      for (const [name, expectedHash] of Object.entries(manifestFiles)) {
        const actual = parsed.contentFiles.find((f) => f.name === name);
        if (!actual) { issues.push({ name, msg: t("import.fileMissing", name) }); continue; }
        const actualHash = await hashSingleFile(name, new TextDecoder().decode(actual.data));
        if (actualHash !== expectedHash) issues.push({ name, msg: t("import.fileModified", name) });
      }
      setHashIssues(issues);
    })();
  }, [step, parsed]);

  const nextStep = useCallback(() => {
    const idx = STEP_ORDER.indexOf(step);
    if (idx < STEP_ORDER.length - 1) setStep(STEP_ORDER[idx + 1]);
  }, [step]);

  const toggleFile = useCallback((name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (parsed) setSelected(new Set(parsed.contentFiles.map((f) => f.name)));
  }, [parsed]);

  // 仅导入产物：排除 process.jsonl、signature.json、temp/ 目录
  const selectArtifacts = useCallback(() => {
    if (!parsed) return;
    const exclude = ["process.jsonl", "signature.json"];
    const artifacts = parsed.contentFiles
      .filter((f) => !exclude.includes(f.name) && !f.name.startsWith("temp/"))
      .map((f) => f.name);
    setSelected(new Set(artifacts));
  }, [parsed]);

  // 验证密码
  const checkPassword = useCallback(async () => {
    if (!parsed?.verifyToken || !password) return;
    const ok = await verifyPassword(parsed.verifyToken, password);
    if (ok) { setPwOK(true); setPwError(false); }
    else { setPwError(true); setPwOK(false); }
  }, [parsed, password]);

  const doImport = useCallback(async () => {
    if (!parsed) return;
    if (parsed.encrypted && !pwOK) return;
    setStep("importing");
    const files = parsed.contentFiles.filter((f) => selected.has(f.name));
    await importToStorage(
      {
        manifest: parsed.manifest ? {
          id: parsed.manifest.id,
          label: parsed.manifest.label,
          version: parsed.manifest.version,
          author: parsed.manifest.author,
          tags: parsed.manifest.tags,
        } : null,
        contentFiles: files.map((f) => ({ name: f.name, data: f.data })),
      },
      { x: 200 + Math.random() * 200, y: 200 + Math.random() * 200 },
    );
    onImported();
  }, [parsed, selected, pwOK, onImported]);

  if (!parsed) {
    return (
      <Overlay onClose={onClose}>
        <div style={box}><p style={{ fontSize: "0.75rem", color: "#6b7280", textAlign: "center" }}>{t("import.parsing")}</p></div>
      </Overlay>
    );
  }

  const manifest = parsed.manifest;
  const stepIdx = STEP_ORDER.indexOf(step);

  return (
    <Overlay onClose={onClose}>
      <div style={{ ...box, maxHeight: "80vh", overflow: "auto" }}>
        {/* 步骤指示器 */}
        <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
          {STEP_ORDER.map((s, i) => (
            <div key={s} style={{
              padding: "2px 8px", borderRadius: 3, fontSize: "0.625rem",
              background: i === stepIdx ? "#1a1a2e" : i < stepIdx ? "#e5e7eb" : "transparent",
              color: i === stepIdx ? "#fff" : "#6b7280",
            }}>
              {t(`import.step${s.charAt(0).toUpperCase() + s.slice(1)}` as any)}
            </div>
          ))}
        </div>

        {/* 卡片信息（始终可见） */}
        {manifest && (
          <div style={{ marginBottom: 12, padding: 8, background: "#fafbfc", borderRadius: 4 }}>
            <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#1a1a2e" }}>{manifest.label || file.name}</div>
            <div style={infoRow}><span>{t("export.author")}:</span> {manifest.author || t("import.unknown")}</div>
            <div style={infoRow}><span>{t("export.version")}:</span> {manifest.version || "1.0.0"}</div>
            <div style={infoRow}>
              <span>{t("import.stepSignature")}:</span>{" "}
              {parsed.provenance.chain
                ? <span style={{ color: "#22c55e" }}>{t("import.signed")}</span>
                : <span style={{ color: "#9ca3af" }}>{t("import.unsigned")}</span>
              }
            </div>
            <div style={infoRow}><span>{t("export.files")}:</span> {parsed.contentFiles.length}</div>
          </div>
        )}

        {/* Step 2: 安全检查 */}
        {step === "security" && (
          <div style={{ marginBottom: 12 }}>
            {parsed.errors.length > 0 && parsed.errors.map((e, i) => (
              <div key={i} style={{ fontSize: "0.625rem", color: "#ef4444", padding: "2px 0" }}>{e.message}</div>
            ))}
            {parsed.warnings.map((w, i) => (
              <div key={i} style={{ fontSize: "0.625rem", color: "#f59e0b", padding: "2px 0" }}>{w.message}</div>
            ))}
            {hashIssues.map((h, i) => (
              <div key={`h${i}`} style={{ fontSize: "0.625rem", color: "#f59e0b", padding: "2px 0" }}>{h.msg}</div>
            ))}
            {parsed.errors.length === 0 && parsed.warnings.length === 0 && hashIssues.length === 0 && (
              <div style={{ fontSize: "0.6875rem", color: "#22c55e" }}>{t("import.noIssues")}</div>
            )}
            <button onClick={nextStep} style={nextBtn}>{t("import.next")}</button>
          </div>
        )}

        {/* Step 3: 签名验证 */}
        {step === "signature" && (
          <div style={{ marginBottom: 12 }}>
            {sigResult ? (
              <div>
                <div style={infoRow}>
                  {sigResult.sigValid
                    ? <span style={{ color: "#22c55e" }}>{t("import.sigOK")}</span>
                    : <span style={{ color: "#ef4444" }}>{t("import.sigFail")}</span>
                  }
                </div>
                {sigResult.originalAuthor && (
                  <div style={infoRow}>{t("export.signedAs")}: {sigResult.originalAuthor}</div>
                )}
                {trustInfo && (
                  <div style={{ marginTop: 4, fontSize: "0.625rem" }}>
                    {trustInfo.firstTime
                      ? <span style={{ color: "#f59e0b" }}>{t("import.firstSeen")}</span>
                      : <span style={{ color: "#22c55e" }}>{t("import.trusted", String(trustInfo.count))}</span>
                    }
                    <button onClick={() => setTrusted(trustInfo.fp, !trustInfo.trusted)} style={{ marginLeft: 8, border: "none", background: "none", fontSize: "0.5625rem", color: "#3b82f6", cursor: "pointer", padding: 0 }}>
                      {trustInfo.trusted ? t("import.trustRemove") : t("import.trustAdd")}
                    </button>
                  </div>
                )}
                {editsLog && editsLog.chain.length > 0 && (
                  <div style={{ marginTop: 6, fontSize: "0.625rem", color: "#6b7280" }}>
                    <div>{t("import.editsHistory", String(editsLog.chain.length))}:</div>
                    {editsLog.chain.map((edit, i) => (
                      <div key={i} style={{ padding: "2px 0", fontSize: "0.5625rem" }}>
                        {i + 1}. {edit.editor} ({new Date(edit.timestamp).toLocaleDateString()})
                        {edit.note && <span> — {edit.note}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ fontSize: "0.6875rem", color: "#9ca3af" }}>{t("import.unsigned")}</div>
            )}
            <button onClick={nextStep} style={nextBtn}>{t("import.next")}</button>
          </div>
        )}

        {/* Step 4: 选择内容 */}
        {step === "select" && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ marginBottom: 8 }}>
              {parsed.contentFiles.map((f) => (
                <label key={f.name} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", fontSize: "0.6875rem", color: "#1a1a2e", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={selected.has(f.name)}
                    onChange={() => toggleFile(f.name)}
                    style={{ width: 12, height: 12, margin: 0 }}
                  />
                  <span style={{ flex: 1 }}>{f.name}</span>
                  <span style={{ fontSize: "0.5625rem", color: "#9ca3af" }}>{Math.round(f.size / 1024)}KB</span>
                </label>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <button onClick={selectAll} style={smallBtn}>{t("import.allFiles")}</button>
              <button onClick={selectArtifacts} style={smallBtn}>{t("import.artifactsOnly")}</button>
            </div>
          </div>
        )}

        {/* 加密验证 */}
        {parsed.encrypted && (
          <div style={{ marginBottom: 12, padding: 8, background: "#fffbf0", borderRadius: 4 }}>
            <div style={{ fontSize: "0.6875rem", color: "#f59e0b", marginBottom: 6 }}>{t("import.encrypted")}</div>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setPwError(false); setPwOK(false); }}
                placeholder={t("import.passwordPlaceholder")}
                style={inputStyle}
              />
              <button onClick={checkPassword} disabled={!password} style={{ ...smallBtn, whiteSpace: "nowrap" }}>
                {t("ui.confirm")}
              </button>
            </div>
            {pwError && <div style={{ fontSize: "0.625rem", color: "#ef4444", marginTop: 4 }}>{t("import.badPassword")}</div>}
            {pwOK && <div style={{ fontSize: "0.625rem", color: "#22c55e", marginTop: 4 }}>{t("import.sigOK")}</div>}
          </div>
        )}

        {/* 底部操作 */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16, borderTop: "1px solid #e5e7eb", paddingTop: 12 }}>
          {/* 解包步骤显示下一步 */}
          {step === "unpack" && (
            <button onClick={nextStep} style={confirmBtn}>{t("import.next")}</button>
          )}
          {/* 选择步骤显示导入 */}
          {step === "select" && (
            <>
              <button onClick={onClose} style={cancelBtn}>{t("import.cancel")}</button>
              <button
                onClick={doImport}
                style={confirmBtn}
                disabled={selected.size === 0 || (parsed.encrypted && !pwOK)}
              >
                {t("import.confirm")}
              </button>
            </>
          )}
          {/* importing */}
          {step === "importing" && (
            <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>{t("import.parsing")}</div>
          )}
          {/* 其他步骤的取消 */}
          {step !== "select" && step !== "importing" && (
            <button onClick={onClose} style={cancelBtn}>{t("import.cancel")}</button>
          )}
        </div>
      </div>
    </Overlay>
  );
}

// Sub-components

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.08)", zIndex: 300 }}
    >
      {children}
    </div>
  );
}

const infoRow: React.CSSProperties = { fontSize: "0.625rem", color: "#6b7280", padding: "1px 0" };
const inputStyle: React.CSSProperties = {
  flex: 1, padding: "4px 8px", border: "1px solid #e5e7eb",
  borderRadius: 4, fontSize: "0.75rem", outline: "none", boxSizing: "border-box" as any,
};
const box: React.CSSProperties = {
  width: 420, background: "#ffffff", border: "1px solid #d1d5db", padding: 20,
};
const cancelBtn: React.CSSProperties = {
  padding: "4px 12px", border: "1px solid #e5e7eb", borderRadius: 4,
  background: "#fafbfc", fontSize: "0.75rem", cursor: "pointer",
};
const confirmBtn: React.CSSProperties = {
  padding: "4px 14px", border: "1px solid #1a1a2e", borderRadius: 4,
  background: "#1a1a2e", color: "#fff", fontSize: "0.75rem", cursor: "pointer",
};
const nextBtn: React.CSSProperties = { ...confirmBtn, marginTop: 12 };
const smallBtn: React.CSSProperties = {
  padding: "2px 8px", border: "1px solid #e5e7eb", borderRadius: 3,
  background: "#fafbfc", fontSize: "0.625rem", cursor: "pointer", color: "#6b7280",
};
