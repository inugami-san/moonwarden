import { resolveCatDirection, type CatDirection } from "./cat-art";
import { drawMooncat } from "./mooncat-renderer";
import { drawCatCharacter, type CatAccessoryPass } from "./cat-character";
import type { EyeStyle } from "../server/appearance";

export const DEVOUR_SECONDS = 1.6;
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const ease = (value: number) => { const t = clamp01(value); return t * t * (3 - 2 * t); };

/** Crouch, claw sweep, shadow capture, recover. Never deform the painted cat. */
export function devourPose(progress: number, reducedMotion = false) {
  const p = clamp01(Number.isFinite(progress) ? progress : 0);
  const reach = ease((p - .12) / .26) * (1 - ease((p - .6) / .2));
  const absorb = ease((p - .28) / .44);
  return {
    progress: p, reach: reducedMotion ? 0 : reach,
    scaleX: 1, scaleY: 1,
    crouch: reducedMotion ? 0 : Math.sin(Math.PI * ease(p / .8)) * 3,
    swipe: reducedMotion ? 0 : Math.sin(Math.PI * ease((p - .16) / .34)),
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

/** Visual-only capture: no teleport, collision, kill or report-rule changes. */
export function consumptionLayout(event: DevourVisual, progress: number, anchor = { x: event.startX, y: event.startY }) {
  const p = clamp01(Number.isFinite(progress) ? progress : 0);
  const absorb = ease((p - .28) / .44);
  return { x: anchor.x, y: anchor.y,
    victimX: event.x + (anchor.x - event.x) * absorb,
    victimY: event.y + (anchor.y - event.y) * absorb };
}

/** Both actors use the live painted moon-cat renderer, including fog silhouettes. */
export function drawCatConsumption(ctx: CanvasRenderingContext2D, event: DevourVisual, progress: number, options: {
  concealed?: boolean; muted?: boolean; reducedMotion?: boolean; alpha?: number;
  returnTo?: { x: number; y: number }; eyes?: EyeStyle;
  direction?: CatDirection; drawHat?: (ctx: CanvasRenderingContext2D, direction: CatDirection, phase: number, amount: number, layer?: CatAccessoryPass) => void;
} = {}) {
  const pose = devourPose(progress, options.reducedMotion);
  const layout = consumptionLayout(event, options.reducedMotion ? 0 : pose.progress, options.returnTo);
  const { x, y } = layout;
  const hidden = options.concealed === true;
  const alpha = Number.isFinite(options.alpha ?? 1) ? clamp01(options.alpha ?? 1) : 1;
  const dx = event.x - x, dy = event.y - y;
  const direction = options.direction ?? resolveCatDirection(dx, dy, "SE");
  const victimDirection = resolveCatDirection(-dx, -dy, "SW");
  const ink = hidden || options.muted ? "#677b85" : "#302044";
  const rim = hidden || options.muted ? "#9baab1" : "#c2b1ef";
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.fillStyle = "rgba(1,8,13,.28)";
  ctx.beginPath(); ctx.ellipse(x, y + 29, 31, 7, 0, 0, Math.PI * 2); ctx.fill();

  // A floor-bound shadow crescent gathers the prey, not a stretchy gel ribbon.
  if (pose.reach > .001) {
    ctx.save(); ctx.translate(layout.victimX, layout.victimY + 26);
    ctx.globalAlpha = alpha * pose.reach * .8;
    ctx.fillStyle = ink; ctx.strokeStyle = rim; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.ellipse(0, 0, 32 * pose.reach, 10 * pose.reach, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  if (pose.victimAlpha > .01) {
    ctx.save(); ctx.translate(layout.victimX, layout.victimY + 29);
    ctx.scale(pose.victimScale, pose.victimScale); ctx.translate(0, -29);
    ctx.globalAlpha = alpha * pose.victimAlpha;
    drawMooncat(ctx, { color: event.victimColor, direction: victimDirection, stridePhase: 0,
      strideAmount: 0, blink: false, eyeStyle: "ROUND", concealed: hidden, muted: options.muted });
    ctx.restore();
  }

  if (pose.swipe > .001) {
    ctx.save(); ctx.translate(x, y + 5); ctx.rotate(Math.atan2(dy, dx));
    ctx.globalAlpha = alpha * pose.swipe * .85; ctx.strokeStyle = rim;
    ctx.lineWidth = 2; ctx.lineCap = "round";
    const length = Math.min(85, Math.hypot(dx, dy));
    for (const offset of [-8, 0, 8]) {
      ctx.beginPath(); ctx.moveTo(17, offset - 12);
      ctx.quadraticCurveTo(length * .65, offset - 20, length + 9, offset + 8); ctx.stroke();
    }
    ctx.restore();
  }

  ctx.save(); ctx.translate(x, y + pose.crouch + 29);
  ctx.rotate((direction === "WEST" || direction === "SW" || direction === "NW" ? -1 : 1) * pose.swipe * .045);
  ctx.translate(0, -29);
  drawCatCharacter(ctx, {
    concealed: hidden,
    drawAccessory: options.drawHat ? (target, layer) => options.drawHat?.(target, direction, pose.swipe * Math.PI / 2, pose.swipe * .45, layer) : undefined,
    drawBody: (ctx) => drawMooncat(ctx, { color: event.killerColor, direction, stridePhase: pose.swipe * Math.PI / 2,
      strideAmount: pose.swipe * .45, blink: false, eyeStyle: options.eyes ?? "FIERCE",
      concealed: hidden, muted: options.muted }),
  });
  ctx.restore();

  if (!options.reducedMotion) {
    ctx.strokeStyle = rim; ctx.lineWidth = 1.4;
    ctx.globalAlpha = alpha * Math.sin(pose.ripple * Math.PI) * .5;
    ctx.beginPath(); ctx.ellipse(x, y + 29, 30 + pose.ripple * 26, 8 + pose.ripple * 6, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = ink; ctx.globalAlpha = alpha * pose.coreAlpha * .7;
    for (let i = 0; i < 5; i++) {
      const angle = i * Math.PI * 2 / 5 + pose.progress * 2;
      ctx.beginPath(); ctx.ellipse(x + Math.cos(angle) * 34, y + 8 + Math.sin(angle) * 13 - pose.coreAlpha * 12, 2, 2, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

/** Legacy export retained for existing callers; all rendering is cat-based. */
export const drawSlimeConsumption = drawCatConsumption;
