// 5 套内置空卡片壳模板

export interface ShellTheme {
  card: {
    width: number; minHeight: number; borderRadius: number;
    background: string; shadow: string; font: string;
    color?: string; border?: string;
  };
  active?: {
    border?: string; shadow?: string;
    particles?: { type: string; color: string; count: number; speed: number };
  };
  inactive?: { border?: string; opacity?: number };
  header?: {
    iconSize?: number; iconBorderRadius?: number;
    titleSize?: number; titleWeight?: number;
  };
}

export interface ShellEntry {
  id: string; label: string; theme: ShellTheme;
  css?: string; builtin: boolean;
}

export const BUILTIN_SHELLS: ShellEntry[] = [
  {
    id: "default", label: "Default", builtin: true,
    theme: {
      card: {
        width: 280, minHeight: 120, borderRadius: 14,
        background: "#ffffff", shadow: "0 2px 8px rgba(0,0,0,0.06)",
        font: "system-ui, sans-serif", color: "#333333",
      },
      active: { border: "2px solid #0284c7", shadow: "0 4px 20px rgba(2,132,199,0.15)" },
      inactive: { border: "1px dashed #d1d5db", opacity: 0.7 },
      header: { iconSize: 34, iconBorderRadius: 10, titleSize: 13, titleWeight: 600 },
    },
  },
  {
    id: "minimal", label: "Minimal", builtin: true,
    theme: {
      card: {
        width: 280, minHeight: 120, borderRadius: 6,
        background: "#fafafa", shadow: "none",
        font: "ui-monospace, monospace", color: "#1a1a1a", border: "1px solid #e5e5e5",
      },
      active: { border: "1px solid #000", shadow: "none" },
      header: { iconSize: 28, iconBorderRadius: 4, titleSize: 11, titleWeight: 500 },
    },
  },
  {
    id: "dark", label: "Dark", builtin: true,
    theme: {
      card: {
        width: 280, minHeight: 120, borderRadius: 14,
        background: "#1e1e2e", shadow: "0 2px 16px rgba(0,0,0,0.3)",
        font: "system-ui, sans-serif", color: "#e0e0e0",
      },
      active: {
        border: "2px solid #7c3aed", shadow: "0 0 24px rgba(124,58,237,0.3)",
        particles: { type: "sparkle", color: "#7c3aed", count: 20, speed: 0.5 },
      },
      header: { iconSize: 34, iconBorderRadius: 10, titleSize: 13, titleWeight: 600 },
    },
  },
  {
    id: "warm", label: "Warm", builtin: true,
    theme: {
      card: {
        width: 280, minHeight: 120, borderRadius: 18,
        background: "#fffbf0", shadow: "0 2px 12px rgba(180,120,40,0.08)",
        font: "Georgia, 'Times New Roman', serif", color: "#5c3d2e",
      },
      active: { border: "2px solid #d97706", shadow: "0 4px 20px rgba(217,119,6,0.15)" },
      header: { iconSize: 36, iconBorderRadius: 12, titleSize: 14, titleWeight: 700 },
    },
  },
  {
    id: "glass", label: "Glass", builtin: true,
    theme: {
      card: {
        width: 280, minHeight: 120, borderRadius: 20,
        background: "rgba(255,255,255,0.4)", shadow: "0 8px 32px rgba(0,0,0,0.04)",
        font: "system-ui, sans-serif", color: "#1a1a2e", border: "1px solid rgba(255,255,255,0.6)",
      },
      active: { border: "2px solid rgba(2,132,199,0.4)", shadow: "0 8px 40px rgba(2,132,199,0.12)" },
      header: { iconSize: 34, iconBorderRadius: 10, titleSize: 13, titleWeight: 600 },
    },
    css: ".card { backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); }",
  },
];

export async function importShellFromCard(file: File): Promise<ShellEntry | null> {
  try {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(file);

    let label = file.name.replace(/\.card$/, "");
    const manifestFile = zip.file("manifest.json");
    if (manifestFile) {
      const manifest = JSON.parse(await manifestFile.async("string"));
      label = manifest.label || label;
    }

    const shellFolder = zip.folder("shell");
    if (!shellFolder) return null;

    const themeFile = shellFolder.file("theme.json");
    if (!themeFile) return null;
    const theme = JSON.parse(await themeFile.async("string"));
    if (!theme) return null;

    let css: string | undefined;
    const cssFile = shellFolder.file("style.css");
    if (cssFile) css = await cssFile.async("string");

    return { id: `imported-${Date.now().toString(36)}`, label: `${label} shell`, theme, css, builtin: false };
  } catch { return null; }
}
