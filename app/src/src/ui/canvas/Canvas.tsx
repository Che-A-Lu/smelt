import { useRef, useEffect, useCallback, useState } from "react";
import { type SpaceIndex, type InteractionConfig, defaultInteraction, CARD_W, CARD_H } from "../../foundation/types";
import { t } from "../../foundation/i18n";
import { saveWorkspaceCamera, updateCard, moveCardToPack, activateCardInDock, deactivateCardInDock, deleteCard, createSphereFromFile, readSphereFiles, flushAndWait } from "../../platform/storage";
import { CardView } from "../card/CardView";
import { Dock } from "../dock/Dock";
import { PackView } from "../pack/PackView";
import { Workbench } from "../workbench/Workbench";
import { ExportPanel } from "../panels/ExportPanel";
import { Minimap } from "./Minimap";
import { DetailView } from "../card/CardView";

interface CanvasProps {
  index: SpaceIndex;
  interaction: InteractionConfig;
  onCreateWorkbench: () => void;
  onRefresh: () => void;
  onFileDrop?: (file: File) => void;
  autoOpenWorkbenchId?: string | null;
}

type ZoneType = "dock" | "pack" | "context" | "tool" | "mode";
type DropZone = { el: HTMLElement; type: ZoneType; onDrop?: (cardId: string) => void };

export function Canvas({ index, interaction = defaultInteraction(), onCreateWorkbench, onRefresh, onFileDrop, autoOpenWorkbenchId }: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const view = useRef({ x: 0, y: 0, zoom: 1 });
  const animFrame = useRef(0);
  const [dropActive, setDropActive] = useState(false);
  const [openWorkbenches, setOpenWorkbenches] = useState<Set<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exportingCardIds, setExportingCardIds] = useState<Set<string> | null>(null);
  const [themeOverride, setThemeOverride] = useState<Partial<InteractionConfig> | null>(null);
  const [quickPreview, setQuickPreview] = useState<string | null>(null);

  // autoOpen 工作台
  useEffect(() => {
    if (autoOpenWorkbenchId) {
      setOpenWorkbenches((prev) => new Set([...prev, autoOpenWorkbenchId]));
    }
  }, [autoOpenWorkbenchId]);

  const effectiveInteraction = (() => {
    const base = themeOverride
      ? { ...interaction, ...themeOverride, card: { ...interaction.card, ...(themeOverride.card ?? {}) }, global: { ...interaction.global, ...(themeOverride.global ?? {}) }, spring: { ...interaction.spring, ...(themeOverride.spring ?? {}) }, workbench: { ...interaction.workbench, ...(themeOverride.workbench ?? {}) }, pack: { ...interaction.pack, ...(themeOverride.pack ?? {}) } }
      : interaction;
    const lsCardScale = parseFloat(localStorage.getItem("card-space-cardScale") ?? "1");
    const lsUiScale = parseFloat(localStorage.getItem("card-space-uiScale") ?? "1");
    if (lsCardScale !== 1 || lsUiScale !== 1) {
      return { ...base, global: { ...base.global, cardScale: lsCardScale, uiScale: lsUiScale } };
    }
    return base;
  })();
  const seenCards = useRef(new Set<string>());
  const cardElements = useRef(new Map<string, HTMLElement>());
  const multiDragOrigins = useRef(new Map<string, { x: number; y: number }>());

  // 框选
  const boxSelect = useRef({ active: false, startX: 0, startY: 0, currentX: 0, currentY: 0 });
  const [boxRect, setBoxRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // 画布平移
  const pan = useRef({
    active: false, spaceHeld: false,
    startX: 0, startY: 0, vx: 0, vy: 0, lastX: 0, lastY: 0,
  });

  // 拖拽协调：注册拖放区
  const dropZones = useRef(new Map<string, DropZone>());
  const dragPointer = useRef({ x: 0, y: 0 });

  const registerZone = useCallback((id: string, el: HTMLElement, type: ZoneType, onDrop?: (cardId: string) => void) => {
    dropZones.current.set(id, { el, type, onDrop });
  }, []);

  const unregisterZone = useCallback((id: string) => {
    dropZones.current.delete(id);
  }, []);

  // 视觉反馈重置
  const resetZoneVisuals = useCallback(() => {
    for (const [, { el, type }] of dropZones.current) {
      if (type === "dock") {
        el.style.borderColor = "";
        el.style.boxShadow = "";
      } else if (type === "context" || type === "tool" || type === "mode") {
        el.style.background = "";
        el.style.outline = "";
      } else {
        el.style.borderColor = "";
      }
    }
  }, []);

  // 卡片→视口坐标转换
  const toViewport = useCallback((cx: number, cy: number) => {
    const v = view.current;
    return { x: cx * v.zoom + v.x, y: cy * v.zoom + v.y };
  }, []);

  // 拖拽中：检查落点区域，做 DOM 视觉反馈
  const onCardDragMove = useCallback((cardId: string, cx: number, cy: number, px: number, py: number) => {
    dragPointer.current = { x: px, y: py };

    // 多卡拖拽：其他选中卡跟随移动
    if (selectedIds.has(cardId) && selectedIds.size > 1) {
      const orig = multiDragOrigins.current.get(cardId);
      if (orig) {
        const dx = cx - orig.x;
        const dy = cy - orig.y;
        for (const id of selectedIds) {
          if (id === cardId) continue;
          const o = multiDragOrigins.current.get(id);
          if (o) {
            const el = cardElements.current.get(id);
            if (el) el.style.transform = `translate(${o.x + dx}px, ${o.y + dy}px)`;
          }
        }
      }
    }

    const vp = toViewport(cx, cy);

    for (const [, { el, type }] of dropZones.current) {
      const rect = el.getBoundingClientRect();
      const zx = rect.left + rect.width / 2;
      const zy = rect.top + rect.height / 2;
      const dx = vp.x - zx;
      const dy = vp.y - zy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (type === "dock") {
        if (dist < 40) {
          el.style.borderColor = "#1a1a2e";
          el.style.boxShadow = "0 0 20px rgba(26,26,46,0.08)";
        } else if (dist < 80) {
          el.style.borderColor = "#9ca3af";
          el.style.boxShadow = "none";
        } else {
          el.style.borderColor = "";
          el.style.boxShadow = "";
        }
      } else if (type === "pack") {
        el.style.borderColor = dist < 80 ? "#3b82f6" : "";
      } else if (type === "context") {
        el.style.background = dist < 80 ? "rgba(59,130,246,0.08)" : "";
        el.style.outline = dist < 80 ? "1px solid #3b82f6" : "";
        el.style.borderRadius = "4px";
      } else if (type === "tool") {
        el.style.background = dist < 80 ? "rgba(124,58,237,0.08)" : "";
        el.style.outline = dist < 80 ? "1px solid #7c3aed" : "";
        el.style.borderRadius = "4px";
      } else if (type === "mode") {
        el.style.outline = dist < 80 ? "2px solid #1a1a2e" : "";
        el.style.borderRadius = "4px";
      }
    }
  }, [toViewport]);

  // 拖拽结束：判定落点
  const onCardDragEnd = useCallback((cardId: string, cx: number, cy: number) => {
    // 多卡拖拽：更新所有选中卡位置
    if (selectedIds.has(cardId) && selectedIds.size > 1) {
      const orig = multiDragOrigins.current.get(cardId);
      const dx = orig ? cx - orig.x : 0;
      const dy = orig ? cy - orig.y : 0;
      for (const id of selectedIds) {
        const o = multiDragOrigins.current.get(id);
        if (o) updateCard(id, { position: { x: o.x + dx, y: o.y + dy } });
      }
      multiDragOrigins.current.clear();
      resetZoneVisuals();
      return;
    }

    const vp = toViewport(cx, cy);
    let landed = false;

    for (const [zoneId, { el, type, onDrop }] of dropZones.current) {
      const rect = el.getBoundingClientRect();
      if (vp.x >= rect.left && vp.x <= rect.right && vp.y >= rect.top && vp.y <= rect.bottom) {
        if (type === "dock") {
          // 检测主题卡
          const c = index.cards[cardId];
          if (c?.sphereId) {
            readSphereFiles(c.sphereId).then((files) => {
              try {
                const json = JSON.parse(files.map((f) => f.content).join("\n"));
                if (json.interaction && typeof json.interaction === "object") {
                  setThemeOverride(json.interaction as Partial<InteractionConfig>);
                }
              } catch { /* 不是主题卡 */ }
              activateCardInDock(cardId, zoneId);
            });
          } else {
            activateCardInDock(cardId, zoneId);
          }
        } else if (type === "pack") {
          moveCardToPack(cardId, zoneId);
        } else if ((type === "context" || type === "tool" || type === "mode") && onDrop) {
          onDrop(cardId);
        }
        landed = true;
        break;
      }
    }

    if (!landed) {
      updateCard(cardId, { position: { x: cx, y: cy } });
    }

    resetZoneVisuals();
  }, [toViewport, resetZoneVisuals, selectedIds]);

  // Dock 卡片拖出：视口坐标 → 画布坐标 → 更新位置
  const onDockDropOut = useCallback((cardId: string, vx: number, vy: number) => {
    const v = view.current;
    const cx = (vx - v.x) / v.zoom;
    const cy = (vy - v.y) / v.zoom;
    updateCard(cardId, { position: { x: cx - CARD_W / 2, y: cy - CARD_H / 2 } });
    // 如果是主题卡拖出，恢复默认
    setThemeOverride((prev) => prev ? null : prev);
    onRefresh();
  }, [onRefresh]);

  const onCardDragStart = useCallback((cardId: string) => {
    if (selectedIds.has(cardId) && selectedIds.size > 1) {
      const cards = Object.values(index.cards);
      for (const id of selectedIds) {
        const c = cards.find((x) => x.id === id);
        if (c) multiDragOrigins.current.set(id, { x: c.position.x, y: c.position.y });
      }
    }
  }, [selectedIds, index]);

  const applyTransform = useCallback(() => {
    if (!contentRef.current) return;
    const v = view.current;
    contentRef.current.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.zoom})`;
  }, []);

  // 平移惯性
  const runInertia = useCallback(() => {
    const p = pan.current;
    if (p.active) return;
    if (Math.abs(p.vx) < 0.1 && Math.abs(p.vy) < 0.1) return;
    p.vx *= 0.95;
    p.vy *= 0.95;
    view.current.x += p.vx;
    view.current.y += p.vy;
    applyTransform();
    if (Math.abs(p.vx) > 0.05 || Math.abs(p.vy) > 0.05) {
      animFrame.current = requestAnimationFrame(runInertia);
    } else {
      p.vx = 0; p.vy = 0;
      saveWorkspaceCamera(view.current.x, view.current.y, view.current.zoom);
    }
  }, [applyTransform]);

  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const v = view.current;
    const oldZoom = v.zoom;
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    v.zoom = Math.max(0.2, Math.min(3.0, +(v.zoom + delta).toFixed(1)));
    const scale = v.zoom / oldZoom;
    v.x = px - (px - v.x) * scale;
    v.y = py - (py - v.y) * scale;
    applyTransform();
    saveWorkspaceCamera(v.x, v.y, v.zoom);
  }, [applyTransform]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.target !== contentRef.current && e.target !== containerRef.current) return;

    if (e.shiftKey) {
      // 框选模式
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const v = view.current;
      const bx = (e.clientX - rect.left - v.x) / v.zoom;
      const by = (e.clientY - rect.top - v.y) / v.zoom;
      boxSelect.current = { active: true, startX: bx, startY: by, currentX: bx, currentY: by };
      setBoxRect({ x: bx, y: by, w: 0, h: 0 });
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    // 点击空白区域取消选中
    setSelectedIds(new Set());
    cancelAnimationFrame(animFrame.current);
    const p = pan.current;
    p.active = true;
    p.startX = e.clientX - view.current.x;
    p.startY = e.clientY - view.current.y;
    p.lastX = e.clientX; p.lastY = e.clientY;
    p.vx = 0; p.vy = 0;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    // 框选中 → 更新矩形
    if (boxSelect.current.active) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const v = view.current;
      const bx = (e.clientX - rect.left - v.x) / v.zoom;
      const by = (e.clientY - rect.top - v.y) / v.zoom;
      boxSelect.current.currentX = bx;
      boxSelect.current.currentY = by;
      setBoxRect({
        x: Math.min(boxSelect.current.startX, bx),
        y: Math.min(boxSelect.current.startY, by),
        w: Math.abs(bx - boxSelect.current.startX),
        h: Math.abs(by - boxSelect.current.startY),
      });
      return;
    }

    const p = pan.current;
    if (!p.active) return;
    const v = view.current;
    const nx = e.clientX - p.startX;
    const ny = e.clientY - p.startY;
    p.vx = nx - v.x; p.vy = ny - v.y;
    v.x = nx; v.y = ny;
    p.lastX = e.clientX; p.lastY = e.clientY;
    applyTransform();
  }, [applyTransform]);

  const onPointerUp = useCallback(() => {
    // 框选结束 → 找框内卡片
    if (boxSelect.current.active) {
      boxSelect.current.active = false;
      if (boxRect && boxRect.w > 10 && boxRect.h > 10) {
        const cards = Object.values(index.cards).filter((c) => !c.packId);
        const inBox = cards.filter((c) =>
          c.position.x >= boxRect.x && c.position.x <= boxRect.x + boxRect.w &&
          c.position.y >= boxRect.y && c.position.y <= boxRect.y + boxRect.h,
        );
        if (inBox.length > 0) setSelectedIds(new Set(inBox.map((c) => c.id)));
      }
      setBoxRect(null);
      return;
    }

    const p = pan.current;
    if (!p.active) return;
    p.active = false;
    animFrame.current = requestAnimationFrame(runInertia);
  }, [runInertia, boxRect, index]);

  // 卡片选中
  const onCardClick = useCallback((cardId: string, e?: React.MouseEvent) => {
    const shift = e?.shiftKey ?? false;
    const ctrl = e?.metaKey || e?.ctrlKey;

    if (shift) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.add(cardId);
        return next;
      });
    } else if (ctrl) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(cardId)) next.delete(cardId);
        else next.add(cardId);
        return next;
      });
    } else {
      setSelectedIds(new Set([cardId]));
    }
  }, []);

  // 删除完成回调
  const onDeleteComplete = useCallback((cardId: string) => {
    deleteCard(cardId);
    setDeletingId(null);
    onRefresh();
  }, [onRefresh]);

  // 键盘
  useEffect(() => {
    const onKD = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) {
        if (selectedIds.size === 1 && !quickPreview) {
          e.preventDefault();
          setQuickPreview([...selectedIds][0]);
          return;
        }
        pan.current.spaceHeld = true;
      }
      if (e.code === "Escape") { setOpenWorkbenches(new Set()); setSelectedIds(new Set()); setQuickPreview(null); }
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyN") { e.preventDefault(); onCreateWorkbench(); }
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyS") {
        e.preventDefault();
        flushAndWait().then(() => { /* saved */ });
        return;
      }
      if ((e.code === "Delete" || e.code === "Backspace") && selectedIds.size > 0 && !deletingId) {
        if (selectedIds.size > 1) {
          if (window.confirm(`Delete ${selectedIds.size} cards?`)) {
            for (const id of selectedIds) deleteCard(id);
            setSelectedIds(new Set());
            onRefresh();
          }
        } else {
          setDeletingId([...selectedIds][0]);
          setSelectedIds(new Set());
        }
      }
    };
    const onKU = (e: KeyboardEvent) => { if (e.code === "Space") pan.current.spaceHeld = false; };
    window.addEventListener("keydown", onKD);
    window.addEventListener("keyup", onKU);
    return () => { window.removeEventListener("keydown", onKD); window.removeEventListener("keyup", onKU); };
  }, [onCreateWorkbench, deletingId, selectedIds, onRefresh, quickPreview, openWorkbenches]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onWheel]);

  useEffect(() => {
    const cam = index.workspace.camera;
    view.current = { x: cam.x, y: cam.y, zoom: cam.zoom };
    applyTransform();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 文件拖入
  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }, []);
  const onDragEnter = useCallback((e: React.DragEvent) => { e.preventDefault(); setDropActive(true); }, []);
  const onDragLeave = useCallback((e: React.DragEvent) => { if (e.currentTarget === e.target) setDropActive(false); }, []);
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDropActive(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    const cardFiles = files.filter((f) => f.name.endsWith(".card") || f.name.endsWith(".zip"));
    const regularFiles = files.filter((f) => !f.name.endsWith(".card") && !f.name.endsWith(".zip"));

    if (cardFiles.length > 0) {
      onFileDrop?.(cardFiles[0]);
      if (regularFiles.length === 0) return;
    }

    const v = view.current;
    const baseX = (-v.x + window.innerWidth / 2) / v.zoom;
    const baseY = (-v.y + window.innerHeight / 2) / v.zoom;

    for (const file of regularFiles) {
      createSphereFromFile(file, {
        x: baseX + (Math.random() - 0.5) * 200,
        y: baseY + (Math.random() - 0.5) * 100,
      }).then(() => onRefresh()).catch((err) => console.warn("File import failed", err));
    }
  }, [onFileDrop, onRefresh]);

  const cards = Object.values(index.cards);
  const docks = Object.values(index.docks);
  const packs = Object.values(index.packs);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100vw", height: "100vh", overflow: "hidden",
        background: effectiveInteraction.global.backgroundColor,
        fontFamily: effectiveInteraction.global.fontFamily,
        fontSize: `${16 * effectiveInteraction.global.uiScale}px`,
        position: "relative", touchAction: "none",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div
        ref={contentRef}
        style={{ position: "absolute", inset: 0, transformOrigin: "0 0", willChange: "transform" }}
      >
        {/* 网格背景（在内容层内，随画布移动+缩放） */}
        <div
          style={{
            position: "absolute",
            left: "-5000px", top: "-5000px",
            width: "10000px", height: "10000px",
            backgroundImage: `radial-gradient(circle, ${effectiveInteraction.global.gridColor} 1px, transparent 1px)`,
            backgroundSize: `${effectiveInteraction.global.gridSpacing}px ${effectiveInteraction.global.gridSpacing}px`,
            pointerEvents: "none",
          }}
        />

        {docks.map((dock) => (
          <Dock key={dock.id} dock={dock} cards={index.cards} registerZone={registerZone} unregisterZone={unregisterZone} onDropOut={onDockDropOut} onRefresh={onRefresh} />
        ))}
        {packs.map((pack) => (
          <PackView key={pack.id} pack={pack} cards={cards.filter((c) => c.packId === pack.id)} registerZone={registerZone} unregisterZone={unregisterZone} />
        ))}
        {cards
          .filter((c) => !c.packId)
          .map((card) => {
            const isNew = !seenCards.current.has(card.id);
            if (isNew) seenCards.current.add(card.id);
            return (
              <CardView
                key={card.id}
                card={card}
                interaction={effectiveInteraction}
                isNew={isNew}
                deleting={deletingId === card.id}
                selected={selectedIds.has(card.id)}
                elRef={(el) => { if (el) cardElements.current.set(card.id, el); }}
                onExportCard={(cardId) => setExportingCardIds(new Set([cardId]))}
                onDragStart={onCardDragStart}
                onDragMove={onCardDragMove}
                onDragEnd={onCardDragEnd}
                onClick={onCardClick}
                onDeleteComplete={onDeleteComplete}
                onDoubleClick={(id) => {
                  if (card.isWorkbench) {
                    setOpenWorkbenches((prev) => {
                      const next = new Set(prev);
                      if (next.has(id)) next.delete(id); else next.add(id);
                      return next;
                    });
                  }
                }}
              />
            );
          })}

        {[...openWorkbenches].map((id) => (
          <Workbench
            key={id}
            card={index.cards[id]}
            interaction={effectiveInteraction}
            allCards={Object.values(index.cards)}
            registerZone={registerZone}
            unregisterZone={unregisterZone}
            onClose={() => setOpenWorkbenches((prev) => { const next = new Set(prev); next.delete(id); return next; })}
          />
        ))}

        {/* 框选矩形 */}
        {boxRect && (
          <div style={{
            position: "absolute",
            left: boxRect.x, top: boxRect.y,
            width: boxRect.w, height: boxRect.h,
            border: "1px solid #3b82f6",
            background: "rgba(59, 130, 246, 0.08)",
            pointerEvents: "none", zIndex: 9999,
          }} />
        )}

        {/* 欢迎状态 */}
        {Object.values(index.cards).length === 0 && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none", color: "#d1d5db", fontFamily: "system-ui, sans-serif" }}>
            <div style={{ fontSize: "3rem", fontWeight: 300, letterSpacing: 8, marginBottom: 24 }}>Smelt</div>
            <div style={{ fontSize: "0.8125rem", lineHeight: 2, textAlign: "center" }}>
              {t("canvas.welcomeHint1")}<br />{t("canvas.welcomeHint2")}<br />{t("canvas.welcomeHint3")}
            </div>
          </div>
        )}
      </div>

      {dropActive && (
        <div style={{
          position: "absolute", inset: 0, border: "2px dashed #1a1a2e",
          background: "rgba(26,26,46,0.04)", display: "flex",
          alignItems: "center", justifyContent: "center",
          pointerEvents: "none", zIndex: 1000,
        }}>
          <span style={{ fontSize: "0.875rem", color: "#1a1a2e" }}>{t("canvas.dropHint")}</span>
        </div>
      )}

      <StorageBar />

      {/* 快速预览 */}
      {quickPreview && index.cards[quickPreview]?.sphereId && (
        <DetailView sphereId={index.cards[quickPreview]!.sphereId!} cardLabel={index.cards[quickPreview]!.label} onClose={() => setQuickPreview(null)} />
      )}

      {/* 小地图 */}
      {Object.values(index.cards).filter((c) => !c.packId).length >= 3 && (
        <Minimap
          cards={Object.values(index.cards).filter((c) => !c.packId)}
          view={view.current}
          containerW={window.innerWidth}
          containerH={window.innerHeight}
          onNavigate={(cx, cy) => { view.current.x = cx; view.current.y = cy; applyTransform(); }}
        />
      )}

      {exportingCardIds && (
        <ExportPanel cardIds={exportingCardIds} allCards={Object.values(index.cards)} onClose={() => setExportingCardIds(null)} />
      )}

      {/* 多选操作栏 */}
      {selectedIds.size > 1 && (
        <div style={{ position: "fixed", bottom: 12, left: "50%", transform: "translateX(-50%)", background: "#1a1a2e", color: "#fff", borderRadius: 6, padding: "6px 16px", display: "flex", gap: 12, fontSize: "0.6875rem", zIndex: 9999, alignItems: "center" }}>
          <span>{selectedIds.size} selected</span>
          <button onClick={() => setExportingCardIds(new Set(selectedIds))} style={{ border: "1px solid rgba(255,255,255,0.3)", borderRadius: 3, background: "transparent", color: "#fff", fontSize: "0.625rem", cursor: "pointer", padding: "2px 8px" }}>Export</button>
          <button onClick={() => { if (window.confirm(`Delete ${selectedIds.size} cards?`)) { for (const id of selectedIds) deleteCard(id); setSelectedIds(new Set()); onRefresh(); }}} style={{ border: "1px solid rgba(255,255,255,0.3)", borderRadius: 3, background: "transparent", color: "#ef4444", fontSize: "0.625rem", cursor: "pointer", padding: "2px 8px" }}>Delete</button>
          <button onClick={() => setSelectedIds(new Set())} style={{ border: "none", background: "none", color: "rgba(255,255,255,0.5)", fontSize: "0.625rem", cursor: "pointer", padding: 0 }}>Clear</button>
        </div>
      )}
    </div>
  );
}

function StorageBar() {
  const [info, setInfo] = useState({ usage: 0, persisted: false });
  useEffect(() => {
    (async () => {
      const est = await navigator.storage.estimate();
      const persisted = await navigator.storage.persisted();
      setInfo({ usage: Math.round((est.usage ?? 0) / 1024 / 1024), persisted });
      if (!persisted) navigator.storage.persist().catch(() => {});
    })();
  }, []);
  return (
    <div style={{ position: "fixed", bottom: 8, left: 12, fontSize: "0.625rem", color: info.persisted ? "#6b7280" : "#f59e0b", zIndex: 10 }}>
      {t("storage.usage", String(info.usage))} · {info.persisted ? t("storage.persistOk") : t("storage.persistNo")}
    </div>
  );
}
