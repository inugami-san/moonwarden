import { CENTER, ROOM, SANCTUARY_CLEARINGS, SANCTUARY_TRAILS } from "../server/sanctuary-map";

export const FOREST_ATLAS_URL = "/art/forest/bioluminescent-forest-v1.png";
// Authored atlas gutters are not uniform. These regions contain whole objects;
// load-time alpha trimming removes empty margins without cropping cap edges.
export const FOREST_REGIONS = [
  [0, 0, 530, 575], [530, 0, 405, 575], [935, 0, 373, 575], [1308, 0, 466, 575],
  [25, 580, 480, 307], [510, 580, 335, 307], [865, 580, 443, 307], [1318, 580, 456, 307],
] as const;
type Rect = { x: number; y: number; w: number; h: number };
let image: HTMLImageElement | undefined;
let regions: Rect[] = [];
let loading: Promise<boolean> | undefined;
export const forestSpritesReady = () => image !== undefined;

export function loadForestSprites(): Promise<boolean> {
  if (loading) return loading;
  if (typeof window === "undefined" || typeof Image === "undefined") return Promise.resolve(false);
  loading = new Promise(resolve => {
    const img = new Image(); img.decoding = "async";
    img.onerror = () => resolve(false);
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas"); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d", { willReadFrequently: true }); if (!ctx) { resolve(false); return; }
        ctx.drawImage(img, 0, 0);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        regions = FOREST_REGIONS.map(([x, y, w, h]) => {
          let left: number = x + w, top: number = y + h, right: number = x, bottom: number = y;
          for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) {
            if (pixels[(py * canvas.width + px) * 4 + 3] < 48) continue;
            left = Math.min(left, px); right = Math.max(right, px); top = Math.min(top, py); bottom = Math.max(bottom, py);
          }
          return { x: left, y: top, w: Math.max(1, right - left + 1), h: Math.max(1, bottom - top + 1) };
        });
        image = img; resolve(true);
      } catch { resolve(false); }
    };
    img.src = FOREST_ATLAS_URL;
  });
  return loading;
}

/** Pure art, not a light source or collider. Base is at (x,y); aspect is kept. */
export function drawForestAsset(ctx: CanvasRenderingContext2D, index: number, x: number, y: number, maxWidth: number, maxHeight: number, layer: "all" | "base" | "crown" = "all") {
  if (!image) { void loadForestSprites(); return false; }
  const r = regions[index]; if (!r) return false;
  const scale = Math.min(maxWidth / r.w, maxHeight / r.h), w = r.w * scale, h = r.h * scale;
  ctx.save();
  if (layer !== "all") {
    ctx.beginPath();
    if (layer === "base") ctx.rect(x - w / 2 - 1, y - h * .44, w + 2, h * .44 + 2);
    else ctx.rect(x - w / 2 - 1, y - h - 1, w + 2, h * .56 + 1);
    ctx.clip();
  }
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, r.x, r.y, r.w, r.h, x - w / 2, y - h, w, h);
  ctx.restore(); return true;
}

const trailSamples = SANCTUARY_TRAILS.flatMap(trail => Array.from({ length: 33 }, (_, i) => {
  const t = i / 32, s = 1 - t, p = trail.points;
  return { x: s ** 3 * p[0] + 3 * s * s * t * p[2] + 3 * s * t * t * p[4] + t ** 3 * p[6], y: s ** 3 * p[1] + 3 * s * s * t * p[3] + 3 * s * t * t * p[5] + t ** 3 * p[7], radius: trail.width * .4 };
}));
/** Deterministic, sparse, walkable ground accents; central routes stay readable. */
export const FOREST_GRASS_PATCHES = Object.freeze(Array.from({ length: 230 }, (_, i) => ({
  x: ROOM.left + 42 + (i * 173 % (ROOM.right - ROOM.left - 84)),
  y: ROOM.top + 48 + (i * 239 % (ROOM.bottom - ROOM.top - 96)),
  width: 23 + i % 5 * 5, asset: 5 + i % 3,
})).filter(p => Math.hypot(p.x - CENTER.x, p.y - CENTER.y) > 150
  && !SANCTUARY_CLEARINGS.some(c => ((p.x - c.x) / (c.rx * .45)) ** 2 + ((p.y - c.y) / (c.ry * .45)) ** 2 < 1)
  && !trailSamples.some(t => Math.hypot(p.x - t.x, p.y - t.y) < t.radius + 18)));
