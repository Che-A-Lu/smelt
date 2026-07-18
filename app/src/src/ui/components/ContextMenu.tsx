import { useEffect } from "react";

export interface ContextMenuItem {
  label: string;
  danger?: boolean;
  separator?: boolean;
  onClick: () => void;
}

interface ContextMenuProps {
  x: number; y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  useEffect(() => {
    const close = (e: MouseEvent) => {
      onClose();
    };
    setTimeout(() => document.addEventListener("click", close), 0);
    return () => document.removeEventListener("click", close);
  }, [onClose]);

  return (
    <div style={{ position: "fixed", left: x, top: y, background: "#fff", border: "1px solid #d1d5db", padding: "4px 0", zIndex: 9999, fontSize: "0.6875rem", minWidth: 100 }}>
      {items.map((item, i) => (
        <div key={i}>
          {item.separator && <div style={{ borderTop: "1px solid #e5e7eb", margin: "2px 0" }} />}
          <div
            onClick={() => { item.onClick(); onClose(); }}
            style={{ padding: "4px 12px", cursor: "pointer", color: item.danger ? "#ef4444" : "#1a1a2e" }}
          >
            {item.label}
          </div>
        </div>
      ))}
    </div>
  );
}
