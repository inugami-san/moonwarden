import { slimeEyes, slimeOutline, slimePalette, slimeSkin } from "./slime-art";
import type { SlimePose } from "./slime-motion";
import type { EyeStyle } from "../server/appearance";

export const DEVOUR_SECONDS = 1.6;
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const ease = (value: number) => { const t = clamp01(value); return t * t * (3 - 2 * t); };

/** Same anonymous material as a living concealed actor, with no identifying art. */
function anonymousSlime(ctx: CanvasRenderingContext2D) {
  slimeOutline(ctx);
  const gradient = ctx.createLinearGradient(-25, -38, 28, 38);
  gradient.addColorStop(0, "rgba(137,150,157,.94)");
  gradient.addColorStop(1, "rgba(63,75,84,.96)");
  ctx.fillStyle = gradient;
  ctx.strokeStyle = "rgba(31,42,49,.9)";
  ctx.lineWidth = 1.3;
  ctx.fill(); ctx.stroke();
}

/** A planted body, a soft wrap, then one absorption. No world movement or biting. */
export function devourPose(progress: number, reducedMotion = false) {
  const p = clamp01(Number.isFinite(progress) ? progress : 0);
  const wrap = ease((p - .12) / .26) * (1 - ease((p - .6) / .2));
  const absorb = ease((p - .28) / .44);
  const swell = Math.sin(Math.PI * ease((p - .18) / .7));
  const recoil = Math.sin(Math.PI * ease((p - .72) / .28)) * .035;
  const width = 1 + swell * .16 - recoil;
  return {
    progress: p,
    reach: reducedMotion ? 0 : wrap,
    scaleX: reducedMotion ? 1 : width,
    scaleY: reducedMotion ? 1 : 1 / width,
    victimScale: reducedMotion ? 1 : 1 - absorb * .98,
    victimAlpha: 1 - ease((p - (reducedMotion ? .15 : .52)) / .2),
    coreAlpha: reducedMotion ? 0 : ease((p - .48) / .14) * (1 - ease((p - .72) / .18)),
    ripple: ease((p - .57) / .43),
  };
}

export type DevourVisual = {
  x: number; y: number; victimColor: string; killerColor: string;
  startX: number; startY: number;
};

/** Pure, bounded layout: moving the killer never adds a second lunge/return. */
export function consumptionLayout(event: DevourVisual, progress: number, anchor = { x: event.startX, y: event.startY }) {
  const p = clamp01(Number.isFinite(progress) ? progress : 0);
  const absorb = ease((p - .28) / .44);
  return {
    x: anchor.x,
    y: anchor.y,
    victimX: event.x + (anchor.x - event.x) * absorb,
    victimY: event.y + (anchor.y - event.y) * absorb,
  };
}

export function drawSlimeConsumption(ctx: CanvasRenderingContext2D, event: DevourVisual, progress: number, options: {
  concealed?: boolean; muted?: boolean; reducedMotion?: boolean; alpha?: number;
  returnTo?: { x: number; y: number }; eyes?: EyeStyle; motion?: SlimePose;
  drawHat?: (ctx: CanvasRenderingContext2D) => void;
} = {}) {
  const pose = devourPose(progress, options.reducedMotion);
  const hidden = options.concealed;
  const killerColor = hidden ? "#637a7b" : options.muted ? "#738e85" : event.killerColor;
  const victimColor = hidden || options.muted ? "#8a9b97" : event.victimColor;
  const palette = slimePalette(killerColor);
  const layout = consumptionLayout(event, options.reducedMotion ? 0 : pose.progress, options.returnTo);
  const { x, y } = layout;
  const motion = options.reducedMotion ? undefined : options.motion;
  const alpha = Math.max(0, Math.min(1, options.alpha ?? 1));
  ctx.save();
  ctx.globalAlpha = alpha;

  // Grounding remains at the actual actor position, even as the membrane swells.
  ctx.fillStyle = "rgba(1,8,13,.28)";
  ctx.beginPath(); ctx.ellipse(x, y + 31, 37 * (motion?.shadowScale ?? 1), 9, 0, 0, Math.PI * 2); ctx.fill();
  if (!options.reducedMotion && pose.ripple > 0) {
    ctx.strokeStyle = hidden ? "#9aaead" : palette.rim;
    ctx.lineWidth = 1.6;
    ctx.globalAlpha = alpha * Math.sin(pose.ripple * Math.PI) * .48;
    ctx.beginPath(); ctx.ellipse(x, y + 31, 30 + pose.ripple * 34, 9 + pose.ripple * 7, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = alpha;
  }

  // The whole victim, not a duplicate limb or jaw, folds into the killer's core.
  if (pose.victimAlpha > .01) {
    ctx.save();
    ctx.translate(layout.victimX, layout.victimY + 31);
    ctx.scale(pose.victimScale, pose.victimScale);
    ctx.translate(0, -31);
    ctx.globalAlpha = alpha * pose.victimAlpha;
    if (hidden) anonymousSlime(ctx);
    else { ctx.drawImage(slimeSkin(victimColor, !options.muted), -48, -54, 96, 112); slimeEyes(ctx, false, options.muted); }
    ctx.restore();
  }

  // A short directional gel ribbon wraps around the victim. Its root stays
  // planted; direction is determined by the two actors, not a fixed left/right.
  if (pose.reach > .001) {
    const dx = event.x - x, dy = event.y - y;
    const distance = Math.hypot(dx, dy);
    const angle = distance > .01 ? Math.atan2(dy, dx) : 0;
    const length = Math.min(94, distance) * pose.reach;
    const radius = 25 * pose.reach;
    ctx.save(); ctx.translate(x, y + 12); ctx.rotate(angle);
    ctx.globalAlpha = alpha * pose.reach * (hidden ? .55 : .68);
    ctx.fillStyle = killerColor;
    ctx.strokeStyle = hidden ? "#8c9e9c" : palette.rim;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(9, -15);
    ctx.bezierCurveTo(length * .4, -22 - radius, length + radius, -radius, length + radius, 0);
    ctx.bezierCurveTo(length + radius, radius, length * .4, 22 + radius * .35, 9, 16);
    ctx.quadraticCurveTo(-1, 0, 9, -15); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(x, y + (motion?.offsetY ?? 0) + 31);
  ctx.transform((motion?.scaleX ?? 1) * pose.scaleX, 0, motion?.shear ?? 0, (motion?.scaleY ?? 1) * pose.scaleY, 0, 0);
  ctx.translate(0, -31);
  if (hidden) anonymousSlime(ctx);
  else ctx.drawImage(slimeSkin(killerColor, !options.muted), -48, -54, 96, 112);
  if (pose.coreAlpha > .001) {
    ctx.globalAlpha = alpha * pose.coreAlpha * .65;
    ctx.fillStyle = victimColor;
    ctx.beginPath(); ctx.ellipse(0, 16 + (1 - pose.coreAlpha) * 6, 12, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = alpha;
  }
  if (!hidden) {
    ctx.save(); ctx.translate(motion?.gazeX ?? 0, motion?.gazeY ?? 0);
    slimeEyes(ctx, pose.progress > .61 && pose.progress < .69, options.muted, options.eyes); ctx.restore();
    ctx.save(); ctx.translate(0, -43); ctx.rotate(motion?.hatTilt ?? 0); options.drawHat?.(ctx); ctx.restore();
  }
  ctx.restore();
  ctx.restore();
}
