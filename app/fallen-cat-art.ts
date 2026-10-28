import { tintCatFur } from "./mooncat-sprites";

export const FALLEN_CAT_URL = "/art/mooncat/fallen-cat-v1.png";
let source: HTMLCanvasElement | undefined;
let loading: Promise<boolean> | undefined;
const variants = new Map<string, HTMLCanvasElement>();
export function loadFallenCat(): Promise<boolean> {
  if (loading) return loading;
  if (typeof window === "undefined" || typeof Image === "undefined") return Promise.resolve(false);
  loading = new Promise(resolve => {
    const image = new Image(); image.decoding = "async"; image.onerror = () => resolve(false);
    image.onload = () => {
      try {
        const scan = document.createElement("canvas"); scan.width = image.naturalWidth; scan.height = image.naturalHeight;
        const read = scan.getContext("2d", { willReadFrequently: true }); if (!read) { resolve(false); return; }
        read.drawImage(image, 0, 0);
        const pixels = read.getImageData(0, 0, scan.width, scan.height).data;
        let left = scan.width, right = 0, top = scan.height, bottom = 0;
        for (let y = 0; y < scan.height; y++) for (let x = 0; x < scan.width; x++) {
          if (pixels[(y * scan.width + x) * 4 + 3] < 48) continue;
          left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
        }
        const canvas = document.createElement("canvas"); canvas.width = 256; canvas.height = 160;
        const ctx = canvas.getContext("2d"); if (!ctx) { resolve(false); return; }
        const w = right - left + 1, h = bottom - top + 1, scale = Math.min(244 / w, 128 / h);
        ctx.drawImage(image, left, top, w, h, 128 - w * scale / 2, 142 - h * scale, w * scale, h * scale);
        source = canvas; resolve(true);
      } catch { resolve(false); }
    };
    image.src = FALLEN_CAT_URL;
  });
  return loading;
}

/** Static non-gory fallen cat, no bubbling liquid or living walk animation. */
export function drawFallenCat(ctx: CanvasRenderingContext2D, color: string, concealed = false) {
  ctx.save();
  ctx.fillStyle = "#060f244d"; ctx.beginPath(); ctx.ellipse(0, 2, 51, 12, 0, 0, Math.PI * 2); ctx.fill();
  if (source) {
    const safe = /^#[\da-f]{6}$/i.test(color) ? color.toLowerCase() : "#8257cb";
    const key = concealed ? "anonymous" : safe;
    let sprite = variants.get(key);
    if (!sprite) {
      sprite = document.createElement("canvas"); sprite.width = 256; sprite.height = 160;
      const paint = sprite.getContext("2d", { willReadFrequently: true });
      if (paint) {
        paint.drawImage(source, 0, 0);
        const pixels = paint.getImageData(0, 0, 256, 160);
        tintCatFur(pixels.data, safe, concealed); paint.putImageData(pixels, 0, 0);
        if (variants.size >= 12) variants.delete(variants.keys().next().value!);
        variants.set(key, sprite);
      }
    }
    ctx.drawImage(sprite, -64, -72, 128, 80);
  } else {
    void loadFallenCat();
    ctx.fillStyle = concealed ? "#788993" : color; ctx.strokeStyle = "#22253f"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(-10, -13, 29, 17, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(25, -15, 18, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(13, -26); ctx.lineTo(12, -40); ctx.lineTo(27, -30); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-28, -5); ctx.bezierCurveTo(-56, -2, -55, -30, -39, -28); ctx.stroke();
    if (!concealed) { ctx.beginPath(); ctx.moveTo(19, -16); ctx.quadraticCurveTo(24, -11, 29, -16); ctx.stroke(); }
  }
  ctx.restore();
}
