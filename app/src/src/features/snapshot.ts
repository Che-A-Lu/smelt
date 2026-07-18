const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);
const TEXT_EXTS = new Set([".md", ".txt", ".json", ".ts", ".js", ".tsx", ".jsx", ".py", ".go", ".rs", ".yaml", ".yml", ".xml", ".html", ".css", ".env", ".cfg", ".ini", ".toml"]);
const CSV_EXTS = new Set([".csv"]);

export function canSnapshot(fileName: string): boolean {
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf("."));
  return IMAGE_EXTS.has(ext) || TEXT_EXTS.has(ext) || CSV_EXTS.has(ext);
}

export async function generateSnapshot(
  file: File | { name: string; data: ArrayBuffer },
  size: { w: number; h: number },
): Promise<Blob | null> {
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
  if (IMAGE_EXTS.has(ext)) return snapshotImage(file, size);
  if (TEXT_EXTS.has(ext)) return snapshotText(file, size);
  if (CSV_EXTS.has(ext)) return snapshotCSV(file, size);
  return null;
}

// 图片 → Canvas 缩小（cover 裁切）→ PNG
async function snapshotImage(
  file: File | { name: string; data: ArrayBuffer },
  size: { w: number; h: number },
): Promise<Blob | null> {
  try {
    const blob = file instanceof File ? file : new Blob([file.data]);
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.src = url;
    await img.decode();

    const canvas = document.createElement("canvas");
    canvas.width = size.w;
    canvas.height = size.h;
    const ctx = canvas.getContext("2d")!;
    const scale = Math.max(size.w / img.width, size.h / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.drawImage(img, (size.w - dw) / 2, (size.h - dh) / 2, dw, dh);
    URL.revokeObjectURL(url);

    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png", 0.85));
  } catch {
    return null;
  }
}

// 文本 → Canvas 渲染 → PNG
async function snapshotText(
  file: File | { name: string; data: ArrayBuffer },
  size: { w: number; h: number },
): Promise<Blob | null> {
  try {
    const text = file instanceof File ? await file.text() : new TextDecoder().decode(file.data);
    const lines = text.split("\n").slice(0, 30);

    const canvas = document.createElement("canvas");
    canvas.width = size.w;
    canvas.height = size.h;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size.w, size.h);
    ctx.fillStyle = "#374151";
    ctx.font = "14px monospace";

    const maxLines = Math.min(lines.length, Math.floor(size.h / 14));
    for (let i = 0; i < maxLines; i++) {
      const line = lines[i].slice(0, 80);
      ctx.fillText(line, 4, 14 + i * 14);
    }

    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png", 0.85));
  } catch {
    return null;
  }
}

// CSV → Canvas 迷你表格 → PNG
async function snapshotCSV(
  file: File | { name: string; data: ArrayBuffer },
  size: { w: number; h: number },
): Promise<Blob | null> {
  try {
    const text = file instanceof File ? await file.text() : new TextDecoder().decode(file.data);
    const rows = text.split("\n").slice(0, 20).map((r) => {
      const cols: string[] = [];
      let cur = ""; let inQuote = false;
      for (const ch of r) {
        if (ch === '"') { inQuote = !inQuote; continue; }
        if (ch === "," && !inQuote) { cols.push(cur.trim()); cur = ""; continue; }
        cur += ch;
      }
      cols.push(cur.trim());
      return cols;
    }).filter((r) => r.length > 0 && r.some((c) => c));

    if (rows.length === 0) return null;

    const canvas = document.createElement("canvas");
    canvas.width = size.w;
    canvas.height = size.h;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size.w, size.h);

    const maxCols = Math.max(...rows.map((r) => r.length));
    const colW = (size.w - 8) / maxCols;
    const rowH = 13;
    const maxRows = Math.min(rows.length, Math.floor(size.h / rowH));

    for (let ri = 0; ri < maxRows; ri++) {
      const y = 4 + ri * rowH;
      // 表头背景
      if (ri === 0) {
        ctx.fillStyle = "#f3f4f6";
        ctx.fillRect(0, y, size.w, rowH);
      }
      ctx.fillStyle = ri === 0 ? "#1a1a2e" : "#374151";
      ctx.font = ri === 0 ? "bold 11px monospace" : "11px monospace";
      for (let ci = 0; ci < Math.min(rows[ri].length, maxCols); ci++) {
        ctx.fillText(rows[ri][ci].slice(0, 20), 4 + ci * colW, y + 10);
      }
    }

    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png", 0.85));
  } catch {
    return null;
  }
}
