import { useRef, useCallback, useState, useEffect } from "react";
import { type CardEntry, type InteractionConfig, fileCategory, CARD_W, CARD_H } from "../../foundation/types";
import { t } from "../../foundation/i18n";
import { updateCard, readSnapshot, readSphereFiles, readSphereFileBlob } from "../../platform/storage";
import { downloadBlob } from "../../features/export/index";
import { ContextMenu, type ContextMenuItem } from "../components/ContextMenu";

interface CardViewProps {
  card: CardEntry;
  interaction: InteractionConfig;
  isNew?: boolean;
  deleting?: boolean;
  selected?: boolean;
  elRef?: (el: HTMLElement | null) => void;
  onDragStart?: (cardId: string) => void;
  onDragMove?: (cardId: string, cx: number, cy: number, px: number, py: number) => void;
  onDragEnd?: (cardId: string, cx: number, cy: number) => void;
  onClick?: (cardId: string, e?: React.MouseEvent) => void;
  onExportCard?: (cardId: string) => void;
  onDeleteComplete?: (cardId: string) => void;
  onDoubleClick?: (id: string) => void;
}

// 全局 LRU 缓存
const snapshotCache = new Map<string, string>();
const MAX_CACHE = 80;

function cacheGet(key: string): string | undefined { return snapshotCache.get(key); }
function cacheSet(key: string, url: string) {
  if (snapshotCache.size >= MAX_CACHE) {
    const first = snapshotCache.keys().next().value;
    if (first) {
      const old = snapshotCache.get(first);
      if (old) URL.revokeObjectURL(old);
      snapshotCache.delete(first);
    }
  }
  snapshotCache.set(key, url);
}

export function CardView({
  card, interaction, isNew, deleting, selected,
  elRef: onElRef,
  onDragStart, onDragMove, onDragEnd, onClick, onExportCard, onDeleteComplete, onDoubleClick,
}: CardViewProps) {
  const elRef = useRef<HTMLDivElement>(null);
  const ds = useRef({
    active: false, frame: 0,
    px: 0, py: 0, prevPx: 0, prevPy: 0, prevPrevPx: 0, prevPrevPy: 0,
    cx: 0, cy: 0,
  });
  const raf = useRef(0);
  const isDragging = useRef(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(card.label);
  const animating = useRef(false);

  // 把 DOM 元素传给 Canvas（多卡拖拽用）
  useEffect(() => {
    if (elRef.current && onElRef) onElRef(elRef.current);
    return () => { if (onElRef) onElRef(null); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 快照
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [snapLoading, setSnapLoading] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  // Escape 关闭详情
  useEffect(() => {
    if (!showDetail) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowDetail(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showDetail]);

  useEffect(() => {
    if (!card.sphereId) return;
    const el = elRef.current;
    if (!el) return;

    const cached = cacheGet(card.sphereId);
    if (cached) { setSnapshotUrl(cached); return; }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSnapLoading(true);
          readSnapshot(card.sphereId!).then((url) => {
            if (url) { cacheSet(card.sphereId!, url); setSnapshotUrl(url); }
            setSnapLoading(false);
          }).catch(() => setSnapLoading(false));
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [card.sphereId]);

  // 同步外部位置
  useEffect(() => {
    if (!ds.current.active && !animating.current) {
      ds.current.cx = card.position.x;
      ds.current.cy = card.position.y;
      if (elRef.current) {
        elRef.current.style.transform = `translate(${card.position.x}px, ${card.position.y}px)`;
      }
    }
  }, [card.position.x, card.position.y]);

  // 创建动画
  useEffect(() => {
    if (!isNew) return;
    const el = elRef.current; if (!el) return;
    animating.current = true;
    el.style.transform = `translate(${card.position.x}px, ${card.position.y}px) scale(0.8)`;
    el.style.opacity = "0";
    const t1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.opacity = "1";
        el.style.transition = "transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1)";
        el.style.transform = `translate(${card.position.x}px, ${card.position.y}px) scale(1.0)`;
        setTimeout(() => { el.style.transition = ""; animating.current = false; }, 200);
      });
    });
    return () => { cancelAnimationFrame(t1); animating.current = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 删除动画
  useEffect(() => {
    if (!deleting) return;
    const el = elRef.current; if (!el) return;
    animating.current = true;
    el.style.transition = "transform 100ms ease-in, opacity 100ms ease-in";
    el.style.transform = `translate(${card.position.x}px, ${card.position.y}px) scale(0.85)`;
    el.style.opacity = "0"; el.style.pointerEvents = "none";
    const timer = setTimeout(() => onDeleteComplete?.(card.id), 110);
    return () => { clearTimeout(timer); };
  }, [deleting]); // eslint-disable-line react-hooks/exhaustive-deps

  const statusColor: Record<string, string> = {
    idle: "#e5e7eb", active: "#22c55e", generating: "#3b82f6",
    interrupted: "#f59e0b", orphaned: "#d1d5db", selected: "#1a1a2e",
  };
  const lineColor = statusColor[card.status] ?? "#e5e7eb";
  const isGenerating = card.status === "generating";
  const isOrphaned = card.status === "orphaned";
  const category = fileCategory(card.label);

  // 拖拽（不变）
  const dragLoop = useCallback(() => {
    const d = ds.current; if (!d.active) return;
    if (d.frame < interaction.card.dragDelayFrames) { d.frame++; raf.current = requestAnimationFrame(dragLoop); return; }
    if (d.frame === interaction.card.dragDelayFrames) {
      isDragging.current = true;
      document.body.style.cursor = "grabbing";
      if (elRef.current) { elRef.current.style.zIndex = "1000"; elRef.current.style.transition = "none"; }
      onDragStart?.(card.id);
    }
    const ratio = interaction.card.dragFollowRatio;
    d.cx += (d.px - d.cx) * ratio; d.cy += (d.py - d.cy) * ratio;
    if (elRef.current) elRef.current.style.transform = `translate(${d.cx}px, ${d.cy}px)`;
    onDragMove?.(card.id, d.cx, d.cy, d.px, d.py);
    d.frame++;
    raf.current = requestAnimationFrame(dragLoop);
  }, [interaction, card.id, onDragStart, onDragMove]);

  const throwLoop = useCallback((vx: number, vy: number) => {
    let velX = vx; let velY = vy;
    const tick = () => {
      velX *= interaction.card.throwDecay; velY *= interaction.card.throwDecay;
      if (Math.abs(velX) < 0.1 && Math.abs(velY) < 0.1) {
        if (elRef.current) { elRef.current.style.transition = "transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1)"; elRef.current.style.transform = `translate(${ds.current.cx}px, ${ds.current.cy}px)`; }
        onDragEnd?.(card.id, ds.current.cx, ds.current.cy); return;
      }
      ds.current.cx += velX; ds.current.cy += velY;
      if (elRef.current) elRef.current.style.transform = `translate(${ds.current.cx}px, ${ds.current.cy}px)`;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [interaction, card.id, onDragEnd]);

  const finishDrag = useCallback(() => {
    const d = ds.current; d.active = false; cancelAnimationFrame(raf.current); isDragging.current = false;
    document.body.style.cursor = "";
    const el = elRef.current; if (!el) return;
    const avgVx = (d.px - d.prevPrevPx) / 3; const avgVy = (d.py - d.prevPrevPy) / 3;
    const speed = Math.sqrt(avgVx * avgVx + avgVy * avgVy);
    el.style.transition = "transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 150ms ease-out";
    el.style.zIndex = ""; el.style.boxShadow = "none";
    if (speed > interaction.card.minThrowVelocity && d.frame > interaction.card.dragDelayFrames) {
      el.style.transition = "box-shadow 150ms ease-out"; throwLoop(avgVx, avgVy);
    } else if (d.frame > interaction.card.dragDelayFrames) {
      el.style.transform = `translate(${d.cx}px, ${d.cy}px)`; onDragEnd?.(card.id, d.cx, d.cy);
      setTimeout(() => { if (el) el.style.transition = ""; }, 200);
    }
  }, [interaction, card.id, onDragEnd, throwLoop]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (editing || deleting) return; onClick?.(card.id, e as unknown as React.MouseEvent);
    cancelAnimationFrame(raf.current);
    const d = ds.current; d.active = true; d.frame = 0;
    d.px = e.clientX; d.py = e.clientY; d.prevPx = e.clientX; d.prevPy = e.clientY;
    d.prevPrevPx = e.clientX; d.prevPrevPy = e.clientY;
    d.cx = card.position.x; d.cy = card.position.y;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    raf.current = requestAnimationFrame(dragLoop);
    const el = elRef.current;
    if (el) {
      el.style.transition = "none";
      requestAnimationFrame(() => { if (!ds.current.active) return; if (el) el.style.transform = `translate(${d.cx}px, ${d.cy}px) scale(1.05)`; requestAnimationFrame(() => { if (!ds.current.active) return; if (el) el.style.boxShadow = interaction.card.dragShadow; }); });
    }
  }, [editing, deleting, interaction, dragLoop, card, onClick]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!ds.current.active) return;
    ds.current.prevPrevPx = ds.current.prevPx; ds.current.prevPrevPy = ds.current.prevPy;
    ds.current.prevPx = ds.current.px; ds.current.prevPy = ds.current.py;
    ds.current.px = e.clientX; ds.current.py = e.clientY;
  }, []);

  const onPointerUp = useCallback(() => { if (ds.current.active) finishDrag(); }, [finishDrag]);

  const onDblClick = useCallback(() => {
    if (card.isWorkbench) { onDoubleClick?.(card.id); } else { setEditing(true); setEditValue(card.label); }
  }, [card, onDoubleClick]);

  const commitEdit = useCallback(() => {
    setEditing(false); const t = editValue.trim(); if (t && t !== card.label) updateCard(card.id, { label: t });
  }, [editValue, card]);

  const onEditKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") commitEdit(); if (e.key === "Escape") { setEditing(false); setEditValue(card.label); }
  }, [commitEdit, card.label]);

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const handleExportFile = useCallback(async () => {
    if (!card.sphereId) return;
    const files = await readSphereFiles(card.sphereId);
    const real = files.filter((f) => f.name !== "_snapshot.png");
    if (real.length > 0) {
      const blob = new Blob([real[0].content], { type: "application/octet-stream" });
      downloadBlob(blob, real[0].name);
    }
  }, [card.sphereId]);

  if (deleting && !elRef.current) return null;

  const previewTop = 28;
  const previewBottom = card.tags.length > 0 ? 24 : 8;

  return (
    <>
      <div
        ref={elRef}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        onDoubleClick={onDblClick} onContextMenu={onContextMenu}
        className={isGenerating ? "card-generating" : ""}
        style={{
          position: "absolute", left: 0, top: 0, width: CARD_W * interaction.global.cardScale, height: CARD_H * interaction.global.cardScale,
          background: "#ffffff",
          border: selected ? "2px solid #1a1a2e" : "1px solid #e5e7eb",
          boxShadow: selected ? "0 0 0 3px rgba(26,26,46,0.08)" : "none",
          borderRadius: 6,
          transform: `translate(${card.position.x}px, ${card.position.y}px)`,
          opacity: isOrphaned ? 0.45 : 1,
          cursor: isDragging.current ? "grabbing" : "grab",
          userSelect: "none", touchAction: "none", zIndex: 1,
        }}
      >
        <div style={{ position: "absolute", left: 0, top: 4, bottom: 4, width: 3, borderRadius: "2px 0 0 2px", background: lineColor, transition: "background 150ms ease-out" }} />
        <div style={{ position: "absolute", left: 8, top: 8, width: 6, height: 12, borderRadius: 1, background: card.isWorkbench ? "#1a1a2e" : category.color }} />

        {editing ? (
          <input autoFocus value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={commitEdit} onKeyDown={onEditKeyDown}
            style={{ position: "absolute", left: 20, top: 6, width: 220, border: "1px solid #3b82f6", borderRadius: 2, fontSize: "0.625rem", padding: "1px 4px", outline: "none", fontFamily: "inherit" }} />
        ) : (
          <div style={{ position: "absolute", left: 20, top: 8, right: 8, fontSize: "0.625rem", color: "#1a1a2e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {card.label || t("card.defaultLabel")}
          </div>
        )}

        {/* 预览区 */}
        <div style={{ position: "absolute", left: 8, top: previewTop, right: 8, bottom: previewBottom }}>
          {snapshotUrl ? (
            <img src={snapshotUrl} style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 2 }} alt="" />
          ) : snapLoading ? (
            <div style={{ fontSize: "0.5625rem", color: "#d1d5db", textAlign: "center", paddingTop: 30 }}>...</div>
          ) : card.sphereId ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%" }}>
              <span style={{ fontSize: "1.25rem", opacity: 0.3 }}>{category.label}</span>
            </div>
          ) : null}
        </div>

        {/* 标签区（底部） */}
        {card.tags.length > 0 && (
          <div style={{ position: "absolute", left: 8, right: 8, bottom: 6, fontSize: "0.5rem", color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.2 }}>
            {card.tags.join(", ")}
          </div>
        )}

        {card.isWorkbench && (
          <div style={{ position: "absolute", right: 4, bottom: 4, width: 8, height: 8, borderRadius: "50%", background: "#1a1a2e" }} />
        )}
      </div>

      {/* 查看详情浮层 */}
      {showDetail && card.sphereId && (
        <DetailView sphereId={card.sphereId} cardLabel={card.label} onClose={() => setShowDetail(false)} />
      )}

      {/* 右键菜单 */}
      {ctxMenu && card.sphereId && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={[
          { label: t("card.viewDetail"), onClick: () => setShowDetail(true) },
          { label: t("export.exportFile"), onClick: handleExportFile },
          { label: t("export.packCard"), onClick: () => onExportCard?.(card.id), separator: true },
        ]} onClose={() => setCtxMenu(null)} />
      )}
    </>
  );
}

export function DetailView({ sphereId, cardLabel, onClose }: {
  sphereId: string; cardLabel: string; onClose: () => void;
}) {
  const [content, setContent] = useState<string>("");
  const [mode, setMode] = useState<"image" | "text" | "unknown">("unknown");

  useEffect(() => {
    (async () => {
      const files = await readSphereFiles(sphereId);
      const realFiles = files.filter((f: { name: string }) => f.name !== "_snapshot.png");
      if (realFiles.length === 0) return;
      const fileName = realFiles[0].name;
      const ext = fileName.toLowerCase().slice(fileName.lastIndexOf("."));

      const IMG = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);
      if (IMG.has(ext)) {
        const url = await readSphereFileBlob(sphereId);
        if (url) { setContent(url); setMode("image"); }
        return;
      }

      const TEXT = new Set([".md", ".txt", ".json", ".csv", ".ts", ".js", ".tsx", ".jsx", ".py", ".go", ".rs", ".yaml", ".yml", ".xml", ".html", ".css"]);
      if (TEXT.has(ext)) {
        const text = realFiles.map((f: { content: string }) => f.content).join("\n\n");
        setContent(text);
        setMode("text");
        return;
      }

      setMode("unknown");
    })();
  }, [sphereId]);

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.3)" }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", padding: 16, border: "1px solid #d1d5db", maxWidth: "90vw", maxHeight: "90vh", overflow: "auto" }}>
        <div style={{ fontSize: "0.75rem", fontWeight: 600, marginBottom: 8 }}>{cardLabel}</div>
        {mode === "image" && (
          <img src={content} style={{ maxWidth: "80vw", maxHeight: "80vh", objectFit: "contain" }} alt="" />
        )}
        {mode === "text" && (
          <pre style={{ fontSize: "0.6875rem", fontFamily: "monospace", color: "#1a1a2e", whiteSpace: "pre-wrap", maxWidth: 700, maxHeight: "80vh", overflow: "auto", margin: 0 }}>
            {content}
          </pre>
        )}
        {mode === "unknown" && (
          <div style={{ fontSize: "0.875rem", color: "#9ca3af", padding: 40 }}>Preview not available</div>
        )}
      </div>
    </div>
  );
}
