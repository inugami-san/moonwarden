import { tintCatFur } from "./mooncat-sprites";
import type { EyeStyle } from "../server/appearance";

export const SEATED_CAT_URL = "/art/mooncat/mooncat-seated-v1.png";
const SIZE = 672, LIMIT = 12;
type Eye = { x: number; y: number; rx: number; ry: number };
let base: HTMLCanvasElement | undefined, loading: Promise<boolean> | undefined;
let eyes: Eye[] = [];
const cache = new Map<string, { open: HTMLCanvasElement; closed: HTMLCanvasElement }>();

/** One request and one alpha/eye analysis, never work on the render loop. */
export function loadSeatedCat(): Promise<boolean> {
  if (loading) return loading;
  if (typeof window === "undefined" || typeof Image === "undefined") return Promise.resolve(false);
  loading = new Promise(resolve => {
    const image = new Image(); image.decoding = "async";
    image.onload = () => {
      try {
        const source = document.createElement("canvas"); source.width = image.naturalWidth; source.height = image.naturalHeight;
        const read = source.getContext("2d", { willReadFrequently: true }); if (!read) return resolve(false);
        read.drawImage(image, 0, 0);
        const pixels = read.getImageData(0, 0, source.width, source.height).data;
        let left = source.width, top = source.height, right = 0, bottom = 0;
        for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) if (pixels[(y * source.width + x) * 4 + 3] > 48) {
          left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
        }
        // Head/neck centre, not tail-inclusive box centre, aligns the cosmetics.
        let mass = 0, moment = 0;
        for (let y = Math.round(top + (bottom - top) * .2); y < top + (bottom - top) * .48; y++) for (let x = left; x <= right; x++) {
          const a = pixels[(y * source.width + x) * 4 + 3]; mass += a; moment += x * a;
        }
        const centre = mass ? moment / mass : (left + right) / 2;
        const scale = Math.min(90 / (bottom - top), 97 / (right - left));
        base = document.createElement("canvas"); base.width = SIZE; base.height = SIZE;
        const ctx = base.getContext("2d"); if (!ctx) return resolve(false);
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
        ctx.scale(SIZE / 112, SIZE / 112); ctx.drawImage(image, 56 - centre * scale, 94 - bottom * scale, source.width * scale, source.height * scale);
        const normalized = ctx.getImageData(0, 0, SIZE, SIZE).data;
        eyes = [false, true].flatMap(rightEye => {
          let l = SIZE, t = SIZE, r = 0, b = 0, count = 0;
          for (let y = 0; y < SIZE * .65; y++) for (let x = rightEye ? SIZE / 2 : 0; x < (rightEye ? SIZE : SIZE / 2); x++) {
            const i = (y * SIZE + x) * 4;
            if (normalized[i + 3] > 128 && normalized[i] > 150 && normalized[i + 1] > 100 && normalized[i + 1] > normalized[i + 2] * 1.5) {
              l = Math.min(l, x); r = Math.max(r, x); t = Math.min(t, y); b = Math.max(b, y); count++;
            }
          }
          if (count < 12) return [];
          return [{ x: (l + r) / 2, y: (t + b) / 2, rx: (r - l) / 2 + 2, ry: (b - t) / 2 + 2 }];
        });
        resolve(true);
      } catch { resolve(false); }
    };
    image.onerror = () => resolve(false); image.src = SEATED_CAT_URL;
  });
  return loading;
}

function expression(ctx: CanvasRenderingContext2D, style: EyeStyle | "BLINK", tinted: Uint8ClampedArray) {
  const detail = SIZE / 336;
  for (const eye of eyes) {
    const { x, y, rx, ry } = eye;
    const sample = (Math.round(y) * SIZE + Math.max(0, Math.round(x - rx - 6 * detail))) * 4;
    ctx.fillStyle = `rgb(${tinted[sample]},${tinted[sample + 1]},${tinted[sample + 2]})`;
    ctx.beginPath(); ctx.ellipse(x, y, rx + 2 * detail, ry + 2 * detail, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(x, y); ctx.strokeStyle = "#211633"; ctx.lineWidth = 2 * detail;
    ctx.beginPath();
    if (style === "JOYFUL" || style === "BLINK") {
      ctx.moveTo(-rx, 0); ctx.quadraticCurveTo(0, style === "JOYFUL" ? -ry : ry * .3, rx, 0); ctx.stroke();
    } else {
      if (style === "STARRY") for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5, radius = i % 2 ? .48 : 1;
        if (i) ctx.lineTo(Math.cos(a) * rx * radius, Math.sin(a) * ry * radius); else ctx.moveTo(0, -ry);
      }
      else if (style === "DREAMY") { ctx.moveTo(-rx, 0); ctx.lineTo(rx, 0); ctx.bezierCurveTo(rx, ry * 1.3, -rx, ry * 1.3, -rx, 0); }
      else ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.closePath();
      const iris = ctx.createRadialGradient(-rx * .25, -ry * .3, 1, 0, 0, Math.max(rx, ry) * 1.2);
      iris.addColorStop(0, "#fff1b2"); iris.addColorStop(.55, "#edba56"); iris.addColorStop(1, "#ac672c");
      ctx.fillStyle = iris; ctx.fill(); ctx.stroke();
      if (style !== "STARRY") { ctx.fillStyle = "#211633"; ctx.beginPath(); ctx.ellipse(0, style === "DREAMY" ? ry * .4 : 0, rx * .2, ry * .7, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = "#fff9e9"; ctx.beginPath(); ctx.ellipse(-rx * .3, style === "DREAMY" ? ry * .23 : -ry * .38, rx * .16, ry * .14, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}

export function drawSeatedCat(ctx: CanvasRenderingContext2D, color: string, eyeStyle: EyeStyle, blink = false, concealed = false) {
  if (!base) { void loadSeatedCat(); return false; }
  const safe = /^#[\da-f]{6}$/i.test(color) ? color.toLowerCase() : "#8257cb";
  const key = concealed ? "shape" : `${safe}:${eyeStyle}`;
  let variant = cache.get(key);
  if (!variant) {
    const open = document.createElement("canvas"); open.width = SIZE; open.height = SIZE;
    const paint = open.getContext("2d", { willReadFrequently: true }); if (!paint) return false;
    paint.drawImage(base, 0, 0);
    const pixels = paint.getImageData(0, 0, SIZE, SIZE); tintCatFur(pixels.data, safe, concealed); paint.putImageData(pixels, 0, 0);
    if (!concealed && eyeStyle !== "FIERCE") expression(paint, eyeStyle, pixels.data);
    const closed = document.createElement("canvas"); closed.width = SIZE; closed.height = SIZE;
    const shut = closed.getContext("2d"); if (!shut) return false;
    shut.drawImage(open, 0, 0); if (!concealed) expression(shut, "BLINK", pixels.data);
    variant = { open, closed }; if (cache.size >= LIMIT) cache.delete(cache.keys().next().value!); cache.set(key, variant);
  }
  ctx.drawImage(blink && !concealed ? variant.closed : variant.open, -56, -64, 112, 112); return true;
}
