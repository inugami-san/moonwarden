import type { EyeStyle } from "../server/appearance";
import { drawEyeShape } from "./slime-eyes";

const skins = new Map<string, HTMLCanvasElement>();

/** Shared SVG/Canvas geometry: a soft bell, not a humanoid capsule. */
export const SLIME_PATH = "M-35 24 C-39 12-28-13-14-26 C-3-37 8-37 19-25 C31-12 40 11 36 24 C32 34-29 35-35 24Z";
export const SLIME_CORE_PATH = "M-27 22 C-26 11-16 2-2 2 C15 0 28 12 29 23 C17 29-15 30-27 22Z";
/** Keep every expression, but seat smaller eyes inside the translucent material. */
export const SLIME_EYE_SCALE = .84;

export function slimePalette(color: string) {
  const rgb = [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16));
  const mix = (target: number[], amount: number) => `rgb(${rgb.map((channel, index) => Math.round(channel * (1 - amount) + target[index] * amount)).join(",")})`;
  return {
    body: mix([210, 224, 236], .20),
    rim: mix([224, 229, 250], .57),
    edge: mix([52, 78, 106], .36),
    core: mix([33, 53, 79], .53),
    shine: mix([244, 239, 225], .91),
  };
}

/** Concealed silhouettes use exactly the same body, without decorative details. */
export function slimeOutline(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.moveTo(-35, 24);
  ctx.bezierCurveTo(-39, 12, -28, -13, -14, -26);
  ctx.bezierCurveTo(-3, -37, 8, -37, 19, -25);
  ctx.bezierCurveTo(31, -12, 40, 11, 36, 24);
  ctx.bezierCurveTo(32, 34, -29, 35, -35, 24);
  ctx.closePath();
}

function referenceSkin(color: string): HTMLCanvasElement {
  const palette = slimePalette(color);
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 224;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(2, 2);
  ctx.translate(48, 54);
  ctx.lineCap = "round";
  // Small botanical curl, common to every role and hidden by concealment.
  ctx.strokeStyle = palette.edge;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(4, -32);
  ctx.bezierCurveTo(14, -48, 29, -44, 35, -36);
  ctx.stroke();
  ctx.fillStyle = palette.core;
  ctx.beginPath();
  ctx.ellipse(36, -34, 4.5, 2.5, .6, 0, Math.PI * 2);
  ctx.fill();

  slimeOutline(ctx);
  const gel = ctx.createLinearGradient(-18, -35, 20, 31);
  gel.addColorStop(0, palette.rim);
  gel.addColorStop(.46, palette.body);
  gel.addColorStop(1, palette.edge);
  ctx.fillStyle = gel;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = palette.core;
  // Layered, feathered pigment replaces the flat face patch and hard candy rim.
  const core = ctx.createRadialGradient(6, 23, 2, 5, 16, 36);
  core.addColorStop(0, palette.core); core.addColorStop(1, `${color}00`);
  ctx.globalAlpha = .56; ctx.fillStyle = core; ctx.fillRect(-40, -32, 80, 72);
  const subsurface = ctx.createRadialGradient(-18, -15, 1, -15, -9, 37);
  subsurface.addColorStop(0, palette.rim); subsurface.addColorStop(1, `${color}00`);
  ctx.globalAlpha = .32; ctx.fillStyle = subsurface; ctx.fillRect(-40, -40, 80, 80);
  ctx.globalAlpha = .7;
  ctx.save(); ctx.translate(-12, -24); ctx.rotate(-.43); ctx.scale(1, .3);
  const reflection = ctx.createRadialGradient(0, 0, 1, 0, 0, 18);
  reflection.addColorStop(0, palette.shine); reflection.addColorStop(.4, `${color}50`); reflection.addColorStop(1, `${color}00`);
  ctx.fillStyle = reflection; ctx.fillRect(-19, -19, 38, 38); ctx.restore();
  ctx.globalAlpha = .52; ctx.strokeStyle = palette.shine; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(-28, 3); ctx.bezierCurveTo(-26, -11, -18, -25, -7, -29); ctx.stroke();
  ctx.globalAlpha = .36; ctx.strokeStyle = palette.rim; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-28, 27); ctx.quadraticCurveTo(0, 33, 29, 26); ctx.stroke();
  // Stable grain is baked once; no per-frame noise, filters, or extra canvases.
  for (let i = 0; i < 190; i++) {
    const x = (i * 37 % 73) - 36, y = (i * 53 % 71) - 35;
    ctx.globalAlpha = i % 3 ? .045 : .075;
    ctx.fillStyle = i % 2 ? palette.shine : palette.core;
    ctx.beginPath(); ctx.ellipse(x, y, .45 + i % 3 * .12, .25, -.4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  slimeOutline(ctx);
  ctx.strokeStyle = palette.edge;
  ctx.lineWidth = .8;
  ctx.stroke();
  return canvas;
}

/** Soft, tapered white eyes; every role has the same expression. */
export function slimeEyes(ctx: CanvasRenderingContext2D, blink: boolean, muted = false, style: EyeStyle = "FIERCE") {
  ctx.save();
  ctx.translate(0, 1.5); ctx.scale(SLIME_EYE_SCALE, SLIME_EYE_SCALE);
  ctx.fillStyle = muted ? "rgba(173,187,190,.3)" : "#f5ffef";
  ctx.beginPath();
  if (blink) {
    ctx.roundRect(-15, 8, 9, 1.3, .6);
    ctx.roundRect(8, 8, 9, 1.3, .6);
  } else {
    drawEyeShape(ctx, style);
  }
  ctx.fill();
  ctx.restore();
}

/** Bake translucent material, surface grain, and reflected light once per color. */
export function slimeSkin(color: string, moonlit = true): HTMLCanvasElement {
  // Fog/Blackout keep their subdued material, separate from the brighter normal skin.
  const cacheKey = `${color}:${moonlit}`;
  const cached = skins.get(cacheKey);
  if (cached) return cached;
  if (moonlit) {
    const skin = referenceSkin(color);
    skins.set(cacheKey, skin);
    return skin;
  }
  const rgb = [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16));
  const pigment = rgb.map((channel, index) => Math.round(channel * 0.74 + [91, 116, 125][index] * 0.26));
  const tone = (light: number, alpha: number) => `rgba(${pigment.map((channel) => Math.round(channel * light)).join(",")},${alpha})`;
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 224;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(2, 2);
  ctx.translate(48, 54);
  slimeOutline(ctx);
  const body = ctx.createLinearGradient(-24, -37, 22, 37);
  body.addColorStop(0, moonlit ? "rgba(202,223,229,.84)" : "rgba(164,186,195,.76)");
  body.addColorStop(0.17, tone(moonlit ? 1.06 : 0.95, 0.88));
  body.addColorStop(0.46, tone(moonlit ? 0.97 : 0.75, moonlit ? 0.82 : 0.64));
  body.addColorStop(0.8, tone(moonlit ? 0.73 : 0.51, 0.89));
  body.addColorStop(1, moonlit ? "rgba(39,70,79,.94)" : "rgba(12,29,39,.96)");
  ctx.fillStyle = body;
  ctx.fill();
  ctx.save();
  ctx.clip();
  const depth = ctx.createRadialGradient(-10, -18, 3, 5, 4, 47);
  depth.addColorStop(0, "rgba(207,229,231,.13)");
  depth.addColorStop(0.48, "rgba(13,38,49,0)");
  depth.addColorStop(1, moonlit ? "rgba(15,41,53,.32)" : "rgba(3,17,28,.57)");
  ctx.fillStyle = depth;
  ctx.fillRect(-42, -46, 84, 94);
  const core = ctx.createRadialGradient(4, 16, 1, 4, 16, 27);
  core.addColorStop(0, tone(1.05, 0.18));
  core.addColorStop(1, tone(0.8, 0));
  ctx.fillStyle = core;
  ctx.fillRect(-34, -15, 70, 58);

  // Soft reflected moonlight, without a painted white shine.
  ctx.save();
  ctx.translate(-10, -24);
  ctx.rotate(-0.32);
  ctx.scale(1, 0.23);
  const reflection = ctx.createRadialGradient(0, 0, 0, 0, 0, 21);
  reflection.addColorStop(0, moonlit ? "rgba(229,244,242,.52)" : "rgba(218,234,237,.4)");
  reflection.addColorStop(0.5, "rgba(184,207,217,.18)");
  reflection.addColorStop(1, "rgba(184,207,217,0)");
  ctx.fillStyle = reflection;
  ctx.fillRect(-22, -22, 44, 44);
  ctx.restore();

  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(206,229,234,.27)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-28, 13);
  ctx.bezierCurveTo(-29, -6, -18, -30, -9, -32);
  ctx.stroke();
  ctx.strokeStyle = "rgba(170,203,211,.15)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(22, -10);
  ctx.bezierCurveTo(29, 7, 23, 19, 30, 25);
  ctx.moveTo(-25, 28);
  ctx.bezierCurveTo(-13, 23, -2, 31, 16, 28);
  ctx.stroke();

  // Fine surface grain is identical across players and baked into the cache.
  let grain = 173;
  for (let i = 0; i < 280; i++) {
    grain = (grain * 16807) % 2147483647;
    const x = (grain % 800) / 10 - 40;
    grain = (grain * 16807) % 2147483647;
    const y = (grain % 900) / 10 - 45;
    ctx.fillStyle = i % 2 ? "rgba(218,235,231,.035)" : "rgba(3,17,27,.06)";
    ctx.fillRect(x, y, 0.55, 0.55);
  }
  ctx.restore();
  const rim = ctx.createLinearGradient(-27, -35, 24, 32);
  rim.addColorStop(0, "rgba(202,225,230,.55)");
  rim.addColorStop(0.36, tone(0.9, 0.25));
  rim.addColorStop(0.75, "rgba(12,26,35,.5)");
  rim.addColorStop(1, "rgba(110,153,166,.27)");
  slimeOutline(ctx);
  ctx.strokeStyle = rim;
  ctx.lineWidth = 1;
  ctx.stroke();
  skins.set(cacheKey, canvas);
  return canvas;
}
