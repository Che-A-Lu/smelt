import { useRef } from "react";
import type { CardEntry } from "../../foundation/types";
import { fileCategory } from "../../foundation/types";

interface MinimapProps {
  cards: CardEntry[];
  view: { x: number; y: number; zoom: number };
  containerW: number; containerH: number;
  onNavigate: (cx: number, cy: number) => void;
}

export function Minimap({ cards, view, containerW, containerH, onNavigate }: MinimapProps) {
  const ref = useRef<HTMLDivElement>(null);

  const xs = cards.map((c) => c.position.x);
  const ys = cards.map((c) => c.position.y);
  const minX = Math.min(...xs) - 200;
  const maxX = Math.max(...xs) + 200;
  const minY = Math.min(...ys) - 200;
  const maxY = Math.max(...ys) + 200;
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  const W = 180; const H = 130;
  const toMapX = (x: number) => ((x - minX) / rangeX) * W + 8;
  const toMapY = (y: number) => ((y - minY) / rangeY) * H + 8;

  // 视口矩形
  const vx = -view.x / view.zoom;
  const vy = -view.y / view.zoom;
  const vw = containerW / view.zoom;
  const vh = containerH / view.zoom;

  const onClick = (e: React.MouseEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const cx = (mx - 8) / W * rangeX + minX;
    const cy = (my - 8) / H * rangeY + minY;
    onNavigate(-cx * view.zoom + containerW / 2, -cy * view.zoom + containerH / 2);
  };

  return (
    <div ref={ref} onClick={onClick}
      style={{
        position: "fixed", right: 16, bottom: 36, width: W + 16, height: H + 16,
        background: "#f0f1f3", border: "1px solid #d1d5db",
        cursor: "pointer", zIndex: 100,
      }}>
      {/* 卡片色点 */}
      {cards.map((c) => {
        const cat = fileCategory(c.label);
        return (
          <div key={c.id} style={{
            position: "absolute",
            left: toMapX(c.position.x), top: toMapY(c.position.y),
            width: 2, height: 3, background: cat.color,
          }} />
        );
      })}
      {/* 视口矩形 */}
      <div style={{
        position: "absolute",
        left: toMapX(vx), top: toMapY(vy),
        width: Math.max(4, vw / rangeX * W),
        height: Math.max(3, vh / rangeY * H),
        border: "1px solid #3b82f6",
        background: "rgba(59,130,246,0.12)",
        pointerEvents: "none",
      }} />
    </div>
  );
}
