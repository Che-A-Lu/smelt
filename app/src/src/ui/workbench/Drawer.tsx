import { t } from "../../foundation/i18n";
import type { ZoneProps } from "./types";
import { ContextZone } from "./ContextZone";
import { ToolZone } from "./ToolZone";
import { FilesZone } from "./FilesZone";
import { TrayZone } from "./TrayZone";

const ZONE_LABELS: Record<string, string> = {
  context: "wb.contextOrder",
  tool: "wb.toolZone",
  files: "wb.aiFiles",
  tray: "wb.cardTray",
  mode: "wb.modeButton",
};

interface DrawerProps {
  zoneId: string;
  top: number;
  left: number;
  zoneProps: ZoneProps;
  onClose: () => void;
}

export function Drawer({ zoneId, top, left, zoneProps, onClose }: DrawerProps) {
  return (
    <div style={{
      position: "fixed",
      left: left - 260,
      top: Math.max(0, top),
      width: 250, maxHeight: 320,
      background: "#fff", border: "1px solid #d1d5db",
      zIndex: 200, overflow: "auto",
      boxShadow: "2px 0 8px rgba(0,0,0,0.06)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 8px", borderBottom: "1px solid #e5e7eb", fontSize: "0.625rem", color: "#6b7280" }}>
        <span>{t(ZONE_LABELS[zoneId] as any)}</span>
        <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", fontSize: "0.75rem", color: "#9ca3af", padding: 0 }}>x</button>
      </div>
      <div style={{ padding: 6 }}>
        {zoneId === "context" && <ContextZone {...zoneProps} />}
        {zoneId === "tool" && <ToolZone {...zoneProps} />}
        {zoneId === "files" && <FilesZone {...zoneProps} />}
        {zoneId === "tray" && <TrayZone {...zoneProps} />}
      </div>
    </div>
  );
}
