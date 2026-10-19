import { slimeEyes, slimeOutline, slimePalette, slimeSkin } from "./slime-art";
import type { EyeStyle } from "../server/appearance";

export const DEVOUR_SECONDS = 1.6;
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const ease = (value: number) => { const t = clamp01(value); return t * t * (3 - 2 * t); };

/** One feeding gesture; presentation only, never an authoritative movement. */
export function devourPose(progress: number, reducedMotion = false) {
  const p = clamp01(Number.isFinite(progress) ? progress : 0);
  const reach = ease((p - .12) / .34) * (1 - ease((p - .78) / .22));
  const envelope = Math.sin(ease((p - .24) / .46) * Math.PI);
  const swallow = ease((p - .35) / .35);
  const settle = p > .72 ? Math.sin((p - .72) / .28 * Math.PI * 3) * (1 - p) : 0;
  return {
    progress: p,
    reach: reducedMotion ? 0 : reach,
    scaleX: reducedMotion ? 1 : 1 + envelope * .48 - settle * .35,
    scaleY: reducedMotion ? 1 : 1 - envelope * .2 + settle * .3,
    victimScale: reducedMotion ? 1 : 1 - swallow * .98,
    victimAlpha: 1 - ease((p - (reducedMotion ? .15 : .53)) / .2),
    coreAlpha: reducedMotion ? 0 : ease((p - .53) / .14) * (1 - ease((p - .8) / .2)),
    ripple: ease((p - .62) / .38),
  };
}

export type DevourVisual = {
  x: number; y: number; victimColor: string; killerColor: string;
  startX: number; startY: number;
};

export function drawSlimeConsumption(ctx: CanvasRenderingContext2D, event: DevourVisual, progress: number, options: {
  concealed?: boolean; muted?: boolean; reducedMotion?: boolean; alpha?: number;
  returnTo?: { x: number; y: number }; eyes?: EyeStyle;
  drawHat?: (ctx: CanvasRenderingContext2D) => void;
} = {}) {
  const pose = devourPose(progress, options.reducedMotion);
  const hidden = options.concealed;
  const killerColor = hidden ? "#637a7b" : options.muted ? "#738e85" : event.killerColor;
  const victimColor = hidden || options.muted ? "#8a9b97" : event.victimColor;
  const palette = slimePalette(killerColor);
  const recovery = ease((pose.progress - .78) / .22);
  const target = options.returnTo ?? { x: event.startX, y: event.startY };
  const x = event.startX + (event.x - event.startX) * pose.reach + (target.x - event.startX) * recovery;
  const y = event.startY + (event.y - event.startY) * pose.reach + (target.y - event.startY) * recovery;
  ctx.save();
  ctx.globalAlpha = options.alpha ?? 1;
  // Rippling moonlight, not a full-screen flash or gore burst.
  ctx.strokeStyle = hidden ? "#9aaead" : palette.rim;
  ctx.lineWidth = 1.8;
  ctx.globalAlpha *= (1 - pose.ripple) * .6;
  ctx.beginPath(); ctx.ellipse(event.x, event.y + 28, 35 + pose.ripple * 44, 10 + pose.ripple * 10, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = options.alpha ?? 1;
  // The victim is pulled under the membrane rather than bitten into pieces.
  if (pose.victimAlpha > .01) {
    ctx.save();
    ctx.translate(event.x + (x - event.x) * ease((pose.progress - .28) / .4), event.y + (y - event.y) * .5 + 24);
    ctx.scale(pose.victimScale * (1 + pose.reach * .18), pose.victimScale * (1 - pose.reach * .2));
    ctx.translate(0, -24);
    ctx.globalAlpha *= pose.victimAlpha;
    if (hidden) { slimeOutline(ctx); ctx.fillStyle = victimColor; ctx.fill(); }
    else { ctx.drawImage(slimeSkin(victimColor, !options.muted), -48, -54, 96, 112); slimeEyes(ctx, false, options.muted); }
    ctx.restore();
  }
  ctx.save();
  ctx.translate(x, y + 31);
  ctx.scale(pose.scaleX, pose.scaleY);
  ctx.translate(0, -31);
  if (hidden) { slimeOutline(ctx); ctx.fillStyle = killerColor; ctx.fill(); }
  else ctx.drawImage(slimeSkin(killerColor, !options.muted), -48, -54, 96, 112);
  // A translucent, continuous gel veil reaches around the victim.
  if (pose.reach > .02) {
    const dx = (event.x - x) / pose.scaleX;
    const dy = (event.y - y) / pose.scaleY;
    const stretch = pose.reach * 30;
    ctx.globalAlpha *= pose.reach * .65;
    ctx.fillStyle = killerColor;
    ctx.strokeStyle = hidden ? "#8c9e9c" : palette.rim;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-29, 17);
    ctx.bezierCurveTo(-52 - stretch, -36, dx - 45, dy - 63, dx, dy - 46 - stretch * .25);
    ctx.bezierCurveTo(dx + 48, dy - 48, 55 + stretch, 19, 30, 26);
    ctx.quadraticCurveTo(0, 39, -29, 17); ctx.fill(); ctx.stroke();
    ctx.globalAlpha = options.alpha ?? 1;
  }
  // A last little orb sinks inside the killer's jelly, then dissolves.
  if (pose.coreAlpha > .01) {
    ctx.globalAlpha *= pose.coreAlpha * .7;
    ctx.fillStyle = victimColor;
    ctx.beginPath(); ctx.ellipse(2, 12, 13, 10, .15, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = hidden ? "#8a9b97" : palette.shine; ctx.lineWidth = 1; ctx.stroke();
    ctx.globalAlpha = options.alpha ?? 1;
  }
  if (!hidden) {
    slimeEyes(ctx, pose.progress > .64 && pose.progress < .84, options.muted, options.eyes);
    ctx.save(); ctx.translate(0, -43); options.drawHat?.(ctx); ctx.restore();
  }
  ctx.restore();
  ctx.restore();
}
