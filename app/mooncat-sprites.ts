import type { MooncatOptions } from "./mooncat-renderer";
import { applyPawTransform, bodyPose, idleBodyPose, fitPawPose, measurePaws, pawPose, type PawRegion } from "./cat-walk-rig";

export const MOONCAT_ATLAS_URL = "/art/mooncat/mooncat-walk-v2.png";
export const SPRITE_DIRECTIONS = ["NORTH", "NE", "EAST", "SE", "SOUTH", "SW", "WEST", "NW"] as const;
const TILE = 192;
const WIDTH = TILE * 8, HEIGHT = TILE * 4;
const CACHE_LIMIT = 12;
let base: HTMLCanvasElement | undefined;
let loading: Promise<boolean> | undefined;
type Variant = { image: HTMLCanvasElement; body: HTMLCanvasElement; closedBody: HTMLCanvasElement };
const variants = new Map<string, Variant>();
let paws: PawRegion[][] = [];
let fadingRig: HTMLCanvasElement | undefined;
export function mooncatRigSummary() {
  return SPRITE_DIRECTIONS.map((direction, i) => `${direction} ${paws[i]?.length ?? 0}`).join(" · ");
}

/** Generated atlases can have unequal outer margins. Use transparent gutters,
 * not height / 4, so feet never bleed into the following animation row. */
export function atlasRows(alphaCounts: readonly number[]): { top: number; bottom: number }[] {
  const ranges: { top: number; bottom: number }[] = [];
  for (let y = 0; y < alphaCounts.length; y++) {
    if (alphaCounts[y] < 12) continue;
    const last = ranges.at(-1);
    if (last && y - last.bottom <= 4) last.bottom = y + 1;
    else ranges.push({ top: y, bottom: y + 1 });
  }
  const rows = ranges.filter(r => r.bottom - r.top > 30);
  if (rows.length !== 4) throw new Error("Mooncat atlas needs four separated rows");
  return rows.map(r => ({ top: Math.max(0, r.top - 2), bottom: Math.min(alphaCounts.length, r.bottom + 2) }));
}

/** Browser-only, single shared image request. SSR/tests never touch the DOM. */
export function loadMooncatSprites(): Promise<boolean> {
  if (loading) return loading;
  if (typeof window === "undefined" || typeof Image === "undefined") return Promise.resolve(false);
  loading = new Promise(resolve => {
    const image = new Image(); image.decoding = "async";
    image.onload = () => {
      try {
        base = normalizeAtlas(image);
        const pixels = base.getContext("2d")!.getImageData(0, 0, WIDTH, TILE).data;
        paws = SPRITE_DIRECTIONS.map((direction, column) => measurePaws(pixels, WIDTH, column, TILE, direction !== "WEST" && direction !== "EAST"));
        resolve(true);
      }
      catch { resolve(false); }
    };
    image.onerror = () => resolve(false);
    image.src = MOONCAT_ATLAS_URL;
  });
  return loading;
}

export function spriteRegistration(centerX: number, bottom: number, scale: number) {
  return { x: TILE / 2 - centerX * scale, y: 158 - bottom * scale };
}

/** Register every pose independently to its planted paws. A union crop alone
 * lets shorter walk poses float and taller poses sink into the ground. */
function normalizeAtlas(image: HTMLImageElement) {
  const source = document.createElement("canvas");
  source.width = image.naturalWidth; source.height = image.naturalHeight;
  const read = source.getContext("2d", { willReadFrequently: true });
  if (!read) throw new Error("Canvas unavailable");
  read.drawImage(image, 0, 0);
  const data = read.getImageData(0, 0, source.width, source.height).data;
  const cellW = source.width / 8;
  const counts = new Array<number>(source.height).fill(0);
  for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) if (data[(y * source.width + x) * 4 + 3] > 48) counts[y]++;
  const rows = atlasRows(counts);
  const bounds = SPRITE_DIRECTIONS.map((_, column) => Array.from({ length: 4 }, (_, row) => {
    let left = cellW, top = source.height, right = 0, bottom = 0;
      for (let y = rows[row].top; y < rows[row].bottom; y++) {
        for (let x = Math.ceil(column * cellW); x < Math.floor((column + 1) * cellW); x++) {
          if (data[(y * source.width + x) * 4 + 3] < 48) continue;
          left = Math.min(left, x - column * cellW); right = Math.max(right, x - column * cellW);
          top = Math.min(top, y - rows[row].top); bottom = Math.max(bottom, y - rows[row].top);
        }
      }
    // Register horizontal motion using the torso, excluding the curled tail
    // and swinging toes so neither can drag the whole cat left/right.
    let mass = 0, moment = 0;
    const bandTop = Math.floor(top + (bottom - top) * .48);
    const bandBottom = Math.ceil(top + (bottom - top) * .72);
    for (let y = bandTop; y <= bandBottom; y++) {
      for (let x = Math.ceil(column * cellW); x < Math.floor((column + 1) * cellW); x++) {
        const a = data[((y + rows[row].top) * source.width + x) * 4 + 3];
        if (a < 128) continue;
        mass += a; moment += (x - column * cellW) * a;
      }
    }
    return { left, top, right, bottom, torsoX: mass ? moment / mass : (left + right) / 2 };
  }));
  const all = bounds.flat();
  const scale = Math.min(170 / Math.max(...all.map(b => b.right - b.left)), 150 / Math.max(...all.map(b => b.bottom - b.top)));
  const result = document.createElement("canvas"); result.width = WIDTH; result.height = HEIGHT;
  const ctx = result.getContext("2d"); if (!ctx) throw new Error("Canvas unavailable");
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  bounds.forEach((poses, column) => {
    // Preserve each heading's original placement relative to its hat/name anchor.
    const unionCenter = (Math.min(...poses.map(b => b.left)) + Math.max(...poses.map(b => b.right))) / 2;
    const torsoCenter = poses.reduce((sum, b) => sum + b.torsoX, 0) / poses.length;
    for (let row = 0; row < 4; row++) {
      const b = poses[row];
      const anchor = spriteRegistration(unionCenter + b.torsoX - torsoCenter, b.bottom, scale);
      ctx.save(); ctx.beginPath(); ctx.rect(column * TILE, row * TILE, TILE, TILE); ctx.clip();
      const cellH = rows[row].bottom - rows[row].top;
      ctx.drawImage(image, column * cellW, rows[row].top, cellW, cellH,
        column * TILE + anchor.x,
        row * TILE + anchor.y, cellW * scale, cellH * scale);
      ctx.restore();
    }
  });
  return result;
}

export function spriteFrame(phase: number, amount: number) {
  if (!Number.isFinite(amount) || amount < .08 || !Number.isFinite(phase)) return 0;
  return Math.floor(((phase % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 2)) % 4;
}

function hue(r: number, g: number, b: number) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) return 0;
  return (((max === r ? (g - b) / d : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60) + 360) % 360;
}
function hsl(h: number, s: number, l: number) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  const rgb = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgb.map(value => Math.round((value + m) * 255));
}

/** Shared fur-only recoloring for living and fallen cat artwork. */
export function tintCatFur(data: Uint8ClampedArray, color: string, concealed = false) {
  const safe = /^#[\da-f]{6}$/i.test(color) ? color : "#8257cb";
  const rgb = [1, 3, 5].map(offset => parseInt(safe.slice(offset, offset + 2), 16));
  const target = hue(rgb[0], rgb[1], rgb[2]);
  const targetMax = Math.max(...rgb) / 255, targetMin = Math.min(...rgb) / 255;
  const targetLight = (targetMax + targetMin) / 2;
  const targetSaturation = targetMax === targetMin ? 0 : (targetMax - targetMin) / (1 - Math.abs(2 * targetLight - 1));
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (concealed) { data[i] = 120; data[i + 1] = 137; data[i + 2] = 147; }
    else if (b > g * 1.12 && r > g * 1.06 && b > r * .96) {
      const max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255, l = (max + min) / 2;
      const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
      // Preserve the painted ink and stars. Lift the fur's middle values, not
      // the entire sprite: a bright coat stays soft instead of neon plastic.
      const weight = Math.max(0, Math.min(1, (b - g * 1.12) / 24, (r - g * 1.06) / 16, (max - .08) * 8));
      const shadow = Math.max(0, (.28 - l) / .28) * .22;
      const coolDelta = ((250 - target + 540) % 360) - 180;
      const light = Math.min(.9, l + .065 * Math.sin(Math.PI * l) * Math.min(1, max * 3));
      const tinted = hsl((target + coolDelta * shadow + 360) % 360, Math.min(.72, s * .78 + .06, targetSaturation * .5 + .4), light);
      data[i] = Math.round(r + (tinted[0] - r) * weight);
      data[i + 1] = Math.round(g + (tinted[1] - g) * weight);
      data[i + 2] = Math.round(b + (tinted[2] - b) * weight);
    }
  }
}

function variant(options: MooncatOptions) {
  const color = /^#[\da-f]{6}$/i.test(options.color) ? options.color.toLowerCase() : "#8257cb";
  // A blink is not a new appearance: keep all eight players' colors resident
  // rather than evicting/repainting full atlases each time their eyes close.
  const eyeStyle = options.eyeStyle ?? "FIERCE";
  const mode = options.concealed ? "shape" : options.muted ? "muted" : "normal";
  const key = mode === "normal" ? `${color}:${eyeStyle}` : mode;
  const cached = variants.get(key);
  if (cached) { variants.delete(key); variants.set(key, cached); return cached; }
  const canvas = document.createElement("canvas"); canvas.width = WIDTH; canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d", { willReadFrequently: true }); if (!ctx || !base) return;
  ctx.drawImage(base, 0, 0);
  const pixels = ctx.getImageData(0, 0, WIDTH, HEIGHT), data = pixels.data;
  if (mode === "normal") tintCatFur(data, color);
  else for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    // Exactly identical material for every anonymous player; no eyes or runes.
    const light = mode === "shape" ? 1 : (.45 + (r + g + b) / 1530);
    data[i] = 120 * light; data[i + 1] = 137 * light; data[i + 2] = 147 * light;
  }
  ctx.putImageData(pixels, 0, 0);
  if (mode === "normal" && eyeStyle !== "FIERCE") customizeEyes(ctx, eyeStyle);
  if (variants.size >= CACHE_LIMIT) variants.delete(variants.keys().next().value!);
  const body = document.createElement("canvas"); body.width = WIDTH; body.height = TILE;
  const torso = body.getContext("2d"); if (!torso) return;
  torso.drawImage(canvas, 0, 0);
  paws.forEach((legs, column) => legs.forEach(leg => {
    const x = column * TILE + leg.left, w = leg.right - leg.left;
    torso.clearRect(x, leg.top + 4, w, TILE - leg.top - 4);
    // A feathered overlap hides straight crop seams at the leg/body joint.
    torso.save(); torso.globalCompositeOperation = "destination-out";
    const feather = torso.createLinearGradient(0, leg.top, 0, leg.top + 4);
    feather.addColorStop(0, "#00000000"); feather.addColorStop(1, "#000000ff");
    torso.fillStyle = feather; torso.fillRect(x, leg.top, w, 4); torso.restore();
  }));
  let closedBody = body;
  if (mode === "normal") {
    closedBody = document.createElement("canvas"); closedBody.width = WIDTH; closedBody.height = TILE;
    const closed = closedBody.getContext("2d");
    if (closed) { closed.drawImage(body, 0, 0); customizeEyes(closed, "BLINK", TILE); }
    else closedBody = body;
  }
  const result = { image: canvas, body, closedBody };
  variants.set(key, result); return result;
}

/** Detect the painted amber irises, then bake expression choices into the cache. */
function customizeEyes(ctx: CanvasRenderingContext2D, style: string, height = HEIGHT) {
  const pixels = ctx.getImageData(0, 0, WIDTH, height), d = pixels.data, visited = new Uint8Array(WIDTH * height);
  // Locate irises in the ORIGINAL art, not in recolored yellow/orange fur.
  const mask = base!.getContext("2d")!.getImageData(0, 0, WIDTH, height).data;
  const isGold = (i: number) => mask[i + 3] > 128 && mask[i] > 140 && mask[i + 1] > 100 && mask[i + 1] > mask[i + 2] * 1.5 && mask[i] > mask[i + 1] * .95;
  for (let start = 0; start < visited.length; start++) {
    if (visited[start] || !isGold(start * 4)) continue;
    const queue = [start]; visited[start] = 1;
    let left = WIDTH, top = HEIGHT, right = 0, bottom = 0;
    for (let q = 0; q < queue.length; q++) {
      const p = queue[q], x = p % WIDTH, y = Math.floor(p / WIDTH);
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      for (const n of [p - WIDTH, p + WIDTH, p - 1, p + 1]) {
        if (n < 0 || n >= visited.length || visited[n] || Math.abs(n % WIDTH - x) > 1 || !isGold(n * 4)) continue;
        visited[n] = 1; queue.push(n);
      }
    }
    if (queue.length < 8 || right - left < 2 || bottom - top < 3) continue;
    const x = (left + right) / 2, y = (top + bottom) / 2, rx = (right - left) / 2 + 1.5, ry = (bottom - top) / 2 + 1.5;
    const sample = (Math.floor(y) * WIDTH + Math.max(0, left - 4)) * 4;
    ctx.fillStyle = `rgb(${d[sample]},${d[sample + 1]},${d[sample + 2]})`;
    ctx.beginPath(); ctx.ellipse(x, y, rx + 1, ry + 1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(x, y); ctx.strokeStyle = "#211633"; ctx.lineWidth = 1.7;
    ctx.beginPath();
    if (style === "JOYFUL" || style === "BLINK") {
      ctx.moveTo(-rx, 1); ctx.quadraticCurveTo(0, style === "BLINK" ? ry * .45 : -ry, rx, 1); ctx.stroke();
    } else {
      if (style === "STARRY") {
        for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? .48 : 1; const px = Math.cos(a) * rx * r, py = Math.sin(a) * ry * r; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); } ctx.closePath();
      } else if (style === "DREAMY") {
        ctx.moveTo(-rx, 0); ctx.lineTo(rx, 0); ctx.bezierCurveTo(rx, ry * 1.4, -rx, ry * 1.4, -rx, 0);
      } else ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      const gold = ctx.createLinearGradient(0, -ry, 0, ry); gold.addColorStop(0, "#ffc461"); gold.addColorStop(1, "#fff0a3"); ctx.fillStyle = gold; ctx.fill(); ctx.stroke();
      if (style !== "STARRY") { ctx.fillStyle = "#211633"; ctx.beginPath(); ctx.ellipse(.5, style === "DREAMY" ? ry * .4 : 0, rx * .3, ry * .72, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = "#fff9e9"; ctx.beginPath(); ctx.ellipse(-rx * .3, style === "DREAMY" ? ry * .23 : -ry * .35, Math.max(.6, rx * .16), Math.max(.6, ry * .14), 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}

/** Returns false while loading or without Canvas so the vector fallback remains safe. */
export function drawMooncatSprite(ctx: CanvasRenderingContext2D, options: MooncatOptions) {
  if (!base) { void loadMooncatSprites(); return false; }
  const sprite = variant(options); if (!sprite) return false;
  const column = Math.max(0, SPRITE_DIRECTIONS.indexOf(options.direction));
  const row = spriteFrame(options.stridePhase, options.strideAmount);
  ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  const amount = Number.isFinite(options.strideAmount) ? Math.max(0, Math.min(1, options.strideAmount)) : 0;
  const legs = paws[column];
  const idle = idleBodyPose(options.idlePhase, amount);
  const breathing = Math.abs(idle.y) + Math.abs(idle.lean) > .0001;
  if ((options.walkStyle !== "FRAMES" || options.blink) && legs?.length && (amount > .001 || breathing || options.blink)) {
    const scale = 112 / TILE;
    const front = options.direction === "NORTH" || options.direction === "SOUTH";
    const mirrored = ["WEST", "SW", "NW"].includes(options.direction);
    const walk = bodyPose(options.stridePhase, amount);
    const body = { x: walk.x + idle.x, y: walk.y + idle.y, lean: walk.lean + idle.lean };
    const paintRig = (target: CanvasRenderingContext2D) => {
    legs.forEach((leg, index) => {
      const w = (leg.right - leg.left) * scale, h = (leg.bottom - leg.top) * scale;
      const paw = fitPawPose(pawPose(options.stridePhase, amount, index, front, mirrored), w, h);
      const x = (leg.left + leg.right) / 2 * scale - 56, y = leg.top * scale - 64;
      target.save(); applyPawTransform(target, x, y, h, body, paw);
      target.drawImage(sprite.image, column * TILE + leg.left, leg.top, leg.right - leg.left, leg.bottom - leg.top, -w / 2, 0, w, h);
      target.restore();
    });
    target.save(); target.translate(body.x, 8 + body.y); target.rotate(body.lean); target.translate(0, -8);
    // The painted head/scarf follow the shoulder bob, without image morphing.
    const paintedBody = options.blink ? sprite.closedBody : sprite.body;
    target.drawImage(paintedBody, column * TILE, 0, TILE, TILE, -56, -64, 112, 112);
    target.restore();
    };
    if (ctx.globalAlpha < .999) {
      // Fade the complete character once. Applying fog alpha separately to
      // overlapping body/paw layers would make the joints visibly brighter.
      if (!fadingRig) { fadingRig = document.createElement("canvas"); fadingRig.width = TILE; fadingRig.height = TILE; }
      const paint = fadingRig.getContext("2d");
      if (paint) {
        paint.setTransform(1, 0, 0, 1, 0, 0); paint.clearRect(0, 0, TILE, TILE);
        paint.setTransform(TILE / 112, 0, 0, TILE / 112, TILE / 2, 64 * TILE / 112);
        paintRig(paint);
        ctx.drawImage(fadingRig, -56, -64, 112, 112);
      } else ctx.drawImage(sprite.image, column * TILE, 0, TILE, TILE, -56, -64, 112, 112);
    } else paintRig(ctx);
  } else {
    const frame = options.walkStyle === "FRAMES" || !legs?.length ? row : 0;
    ctx.drawImage(sprite.image, column * TILE, frame * TILE, TILE, TILE, -56, -64, 112, 112);
  }
  ctx.restore(); return true;
}
