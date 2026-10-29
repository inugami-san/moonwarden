import type { Sanctum } from "./sanctum-art";

export const SHRINE_ATLAS_URL = "/art/shrines/celestial-shrines-v1.png";
export const SHRINE_KINDS = ["SUNDIAL", "BASIN", "TOTEM"] as const;
export type ShrineKind = typeof SHRINE_KINDS[number];
type Rect = { x: number; y: number; w: number; h: number };
type Frame = { source: Rect; left: number; top: number; width: number; height: number;
  centerX: number; groundY: number; modelWidth: number; modelHeight: number };
type Art = { image: HTMLImageElement; frames: Frame[][]; glow: HTMLCanvasElement[] };
let art: Art | undefined, loading: Promise<boolean> | undefined;
const TONES = ["#c7b4ff", "#7ee8f3", "#e5c58e"] as const;

export function shrineKind(reward: Sanctum["reward"]): ShrineKind {
  return reward === "SONAR" ? "SUNDIAL" : reward === "FLASHLIGHT" ? "BASIN" : "TOTEM";
}

/** Shared restoration awakens the sculpture, but does not claim anyone's gear. */
export function shrineState(station: Pick<Sanctum, "reward" | "completed" | "teamRestored">, locked: boolean) {
  return { kind: shrineKind(station.reward), active: !locked && (station.completed || station.teamRestored === true), locked };
}

/** Cell-space trim is shared between states so activation cannot resize/jump. */
export function shrineFrames(data: Uint8ClampedArray, width: number, height: number): Frame[][] {
  return SHRINE_KINDS.map((_, column) => {
    const left = Math.floor(column * width / 3), right = Math.floor((column + 1) * width / 3);
    const cells = [0, 1].map(row => {
      const top = Math.floor(row * height / 2), bottom = Math.floor((row + 1) * height / 2);
      let x0 = right - left, y0 = bottom - top, x1 = 0, y1 = 0, count = 0;
      let coreLeft = right - left, coreTop = bottom - top, coreRight = 0, coreBottom = 0, coreCount = 0;
      for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
        if (data[(y * width + x) * 4 + 3] <= 48) continue;
        x0 = Math.min(x0, x - left); y0 = Math.min(y0, y - top);
        x1 = Math.max(x1, x - left); y1 = Math.max(y1, y - top); count++;
        // Glow can fill the entire tile. Only near-opaque stone/flame pixels
        // determine the sculpture's physical registration and visual scale.
        if (data[(y * width + x) * 4 + 3] > 220) {
          coreLeft = Math.min(coreLeft, x - left); coreTop = Math.min(coreTop, y - top);
          coreRight = Math.max(coreRight, x - left); coreBottom = Math.max(coreBottom, y - top); coreCount++;
        }
      }
      if (!count) throw new Error(`Missing shrine artwork in cell ${column},${row}`);
      return { top, x0, y0, x1, y1,
        coreLeft: coreCount ? coreLeft : x0, coreTop: coreCount ? coreTop : y0,
        coreRight: coreCount ? coreRight : x1, coreBottom: coreCount ? coreBottom : y1 };
    });
    const x0 = Math.max(0, Math.min(...cells.map(cell => cell.x0)) - 2);
    const y0 = Math.max(0, Math.min(...cells.map(cell => cell.y0)) - 2);
    const x1 = Math.min(right - left, Math.max(...cells.map(cell => cell.x1)) + 3);
    const y1 = Math.min(Math.floor(height / 2), Math.max(...cells.map(cell => cell.y1)) + 3);
    const centerX = cells.reduce((sum, cell) => sum + (cell.coreLeft + cell.coreRight) / 2, 0) / cells.length;
    const modelWidth = Math.max(...cells.map(cell => cell.coreRight)) - Math.min(...cells.map(cell => cell.coreLeft)) + 1;
    const modelHeight = Math.max(...cells.map(cell => cell.coreBottom - cell.coreTop + 1));
    return cells.map(cell => ({ source: { x: left + x0, y: cell.top + y0, w: x1 - x0, h: y1 - y0 },
      left: x0, top: y0, width: x1 - x0, height: y1 - y0, centerX, groundY: cell.coreBottom, modelWidth, modelHeight }));
  });
}

export const shrineSpritesReady = () => art !== undefined;

function glowTexture(tone: string) {
  const canvas = document.createElement("canvas"); canvas.width = 160; canvas.height = 160;
  const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Shrine glow Canvas unavailable");
  const halo = ctx.createRadialGradient(80, 80, 5, 80, 80, 78);
  halo.addColorStop(0, `${tone}58`); halo.addColorStop(.4, `${tone}29`); halo.addColorStop(1, `${tone}00`);
  ctx.fillStyle = halo; ctx.fillRect(0, 0, 160, 160); return canvas;
}

/** One image request, alpha scan and glow bake for every station in the room. */
export function loadShrineSprites(): Promise<boolean> {
  if (loading) return loading;
  if (typeof window === "undefined" || typeof Image === "undefined") return Promise.resolve(false);
  loading = new Promise(resolve => {
    const image = new Image(); image.decoding = "async";
    image.onerror = () => resolve(false);
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        const ctx = canvas.getContext("2d", { willReadFrequently: true }); if (!ctx) return resolve(false);
        ctx.drawImage(image, 0, 0);
        const frames = shrineFrames(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
        art = { image, frames, glow: TONES.map(glowTexture) }; resolve(true);
      } catch { resolve(false); }
    };
    image.src = SHRINE_ATLAS_URL;
  });
  return loading;
}

/** Pure artwork. The halo does not reveal actors or create gameplay illumination.
 * Returns false while unavailable so the existing procedural shrine is safe. */
export function drawShrineSprite(ctx: CanvasRenderingContext2D, station: Sanctum, time: number, locked: boolean, nearby: boolean) {
  if (!art) { void loadShrineSprites(); return false; }
  const state = shrineState(station, locked), column = SHRINE_KINDS.indexOf(state.kind);
  const frame = art.frames[column][state.active ? 1 : 0], source = frame.source;
  const scale = Math.min((state.kind === "TOTEM" ? 79 : 106) / frame.modelWidth, 112 / frame.modelHeight);
  const w = frame.width * scale, h = frame.height * scale;
  ctx.save(); ctx.translate(station.x, station.y);
  ctx.fillStyle = "rgba(4,9,22,.32)"; ctx.beginPath(); ctx.ellipse(0, 28, Math.min(49, w * .47), 12, 0, 0, Math.PI * 2); ctx.fill();
  if (state.active) {
    // Completed art is steady: no flashing beam or perpetual completion pulse.
    ctx.drawImage(art.glow[column], -66, -76, 132, 132);
    ctx.save(); ctx.globalAlpha *= .54;
    ctx.drawImage(art.glow[column], -66, 8, 132, 35); ctx.restore();
  }
  ctx.save(); if (locked) ctx.globalAlpha *= .54;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  ctx.drawImage(art.image, source.x, source.y, source.w, source.h,
    (frame.left - frame.centerX) * scale, 30 + (frame.top - frame.groundY) * scale, w, h); ctx.restore();
  if (!locked && !station.completed) {
    const t = Number.isFinite(time) ? time : 0;
    const seed = Number.isFinite(station.pulse) ? station.pulse : 0;
    ctx.fillStyle = state.active ? "#b4eff1aa" : "#b6b4db70";
    for (let i = 0; i < 3; i++) {
      const x = Math.sin(t * .48 + i * 2.2 + seed) * 42;
      const y = -9 + Math.cos(t * .65 + i * 2.1) * 24;
      ctx.beginPath(); ctx.arc(x, y, 1.1, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (nearby && !station.completed && !locked) {
    ctx.strokeStyle = "rgba(190,217,242,.48)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(0, 29, 52, 17, 0, 0, Math.PI * 2); ctx.stroke();
  }
  if (locked) {
    ctx.strokeStyle = "#30354c"; ctx.lineWidth = 4; ctx.lineCap = "round";
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(side * 43, 29);
      ctx.bezierCurveTo(side * 17, 34, side * 30, 2, side * 8, -9); ctx.stroke();
    }
  }
  ctx.restore(); return true;
}
