import { ROOT_BARRIERS, WORLD_HEIGHT, WORLD_WIDTH, getRootCell, type WorldPoint } from "../server/sanctuary-map";
import { ROOT_GATES, ROOT_GATE_Y, ROOTWAKE_DURATION, rootGatesOpen, rootwakeEnvelope } from "../server/sanctuary-design";
import type { Phase } from "../server/game-types";

type View = WorldPoint & { width: number; height: number };
export type RootwakeFrame = {
  phase: Phase; remaining: number; reducedMotion?: boolean; hollow?: boolean; view?: View;
};
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const ease = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t); };
const TILE_SIZE = 88, VARIANTS = 8;
const tiles = new Map<number, HTMLCanvasElement>();

/** World-anchored knots, not a wall scaled outward from its midpoint. */
export const ROOTWAKE_KNOTS = Object.freeze(ROOT_BARRIERS.flatMap((wall, barrier) => {
  const horizontal = wall.w > wall.h, length = horizontal ? wall.w : wall.h;
  const count = Math.ceil(length / 50);
  return Array.from({ length: count }, (_, index) => Object.freeze({
    x: wall.x + (horizontal ? (index + .5) * length / count : wall.w / 2),
    y: wall.y + (horizontal ? wall.h / 2 : (index + .5) * length / count),
    horizontal, barrier, variant: (index * 5 + barrier * 3) % VARIANTS,
    delay: ((index * 7 + barrier * 3) % 11) * .01,
  }));
}));

/** Presentation follows the authoritative 12s clock; it cannot change collisions. */
export function rootwakePose(remaining: number, delay = 0, reducedMotion = false) {
  if (!Number.isFinite(remaining) || remaining <= 0 || remaining > ROOTWAKE_DURATION) return { opacity: 0, growth: 0, dust: 0, lift: 0 };
  const age = ROOTWAKE_DURATION - remaining;
  const opacity = rootwakeEnvelope(remaining);
  const emergence = ease((age - Math.max(0, Math.min(.1, Number.isFinite(delay) ? delay : 0))) / .4);
  // Every knot is full-size BEFORE the authority starts blocking at .54s.
  // Retraction only narrows the material after collision has released.
  const release = opacity > .72 ? 1 : ease(remaining / .4);
  const growth = reducedMotion ? 1 : emergence * release;
  return {
    opacity, growth,
    dust: reducedMotion ? 0 : clamp(1 - Math.abs(age - .28) / .38),
    lift: reducedMotion ? 0 : Math.sin(emergence * Math.PI) * 5,
  };
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string | CanvasGradient) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
}

/** Baked shaded bark: no blur filters, gradients or texture generation per frame. */
function paintKnot(ctx: CanvasRenderingContext2D, variant: number) {
  const lean = (variant % 3 - 1) * 2;
  const shadow = ctx.createRadialGradient(2, 5, 4, 2, 5, 41);
  shadow.addColorStop(0, "#070e1bcc"); shadow.addColorStop(.65, "#10182a70"); shadow.addColorStop(1, "#10182a00");
  ellipse(ctx, 2, 5, 36, 42, shadow);
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  // Uneven forks keep the silhouette botanical rather than a straight rail.
  for (const side of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(side * 3, 24);
    ctx.bezierCurveTo(side * 21, 8, side * 24, -4, side * 16, -25);
    ctx.strokeStyle = "#11192c"; ctx.lineWidth = 8; ctx.stroke();
    ctx.strokeStyle = "#3b4353"; ctx.lineWidth = 5; ctx.stroke();
    ctx.strokeStyle = "#68717b77"; ctx.lineWidth = 1; ctx.stroke();
  }
  const bark = ctx.createLinearGradient(-17, -10, 19, 4);
  bark.addColorStop(0, "#182236"); bark.addColorStop(.32, "#536170");
  bark.addColorStop(.52, "#3e495c"); bark.addColorStop(1, "#171d33");
  for (let strand = -1; strand <= 1; strand++) {
    const x = strand * 8;
    ctx.beginPath(); ctx.moveTo(x, -40);
    ctx.bezierCurveTo(x - 12 + lean, -18, x + 13 + lean, -7, x + 4, 9);
    ctx.bezierCurveTo(x - 8, 24, x + 5, 32, x, 40);
    ctx.strokeStyle = "#10172a"; ctx.lineWidth = strand ? 12 : 15; ctx.stroke();
    ctx.strokeStyle = bark; ctx.lineWidth = strand ? 9 : 12; ctx.stroke();
    ctx.strokeStyle = strand ? "#84949055" : "#a2adab66"; ctx.lineWidth = 1.15; ctx.stroke();
  }
  // Small cross-grain scars, moss leaves and a restrained mycelium thread.
  ctx.strokeStyle = "#121b30aa"; ctx.lineWidth = 1.3;
  for (let i = 0; i < 5; i++) {
    const y = -28 + i * 13, x = Math.sin(i * 2 + variant) * 6;
    ctx.beginPath(); ctx.moveTo(x - 9, y - 2); ctx.quadraticCurveTo(x, y + 2, x + 6, y); ctx.stroke();
  }
  ctx.strokeStyle = "#86d4d58c"; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(4, 36); ctx.bezierCurveTo(17, 10, -12, -8, 2, -35); ctx.stroke();
  for (let i = 0; i < 4; i++) {
    const side = (i + variant) % 2 ? 1 : -1, y = -24 + i * 16;
    ctx.save(); ctx.translate(side * (14 + i % 2 * 3), y); ctx.rotate(side * .55);
    ellipse(ctx, 0, 0, 3.6, 6.5, i % 2 ? "#5a87868c" : "#426d73");
    ctx.strokeStyle = "#8ec2b878"; ctx.lineWidth = .7; ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(0, 4); ctx.stroke(); ctx.restore();
  }
}

function knotTile(variant: number) {
  const cached = tiles.get(variant); if (cached) return cached;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = TILE_SIZE * 2;
  const ctx = canvas.getContext("2d"); if (!ctx) return null;
  ctx.scale(2, 2); ctx.translate(TILE_SIZE / 2, TILE_SIZE / 2); paintKnot(ctx, variant);
  tiles.set(variant, canvas); return canvas;
}

function inView(point: WorldPoint, view?: View) {
  return !view || (point.x >= view.x - 70 && point.x <= view.x + view.width + 70 && point.y >= view.y - 70 && point.y <= view.y + view.height + 70);
}

function drawDoor(ctx: CanvasRenderingContext2D, x: number, frame: RootwakeFrame) {
  if (!inView({ x, y: ROOT_GATE_Y }, frame.view)) return;
  const open = frame.phase === "ORDEAL" && rootGatesOpen(frame.remaining);
  const settle = frame.reducedMotion ? 1 : ease((ROOTWAKE_DURATION / 2 - frame.remaining) / .45);
  const curl = open ? settle : 0;
  ctx.save(); ctx.translate(x, ROOT_GATE_Y);
  if (open) ellipse(ctx, 0, 3, 42, 13, "#a4ddd522");
  for (const side of [-1, 1]) {
    // Curls stay OUTSIDE the 128px doorway; no animation suggests a fake wall.
    const edge = side * 66;
    ctx.beginPath(); ctx.moveTo(edge, 25);
    ctx.bezierCurveTo(edge + side * (12 + curl * 11), 12, edge + side * (19 + curl * 8), -14, edge + side * 6, -22);
    ctx.bezierCurveTo(edge - side * 2, -28, edge - side * 5, -13, edge + side * 4, -12);
    ctx.strokeStyle = "#142034"; ctx.lineWidth = 10; ctx.stroke();
    ctx.strokeStyle = "#50616c"; ctx.lineWidth = 6; ctx.stroke();
    ctx.strokeStyle = open ? "#b2e6d9b0" : "#7e929799"; ctx.lineWidth = 1.2; ctx.stroke();
    ellipse(ctx, side * 53, 4, 3, 5, open ? "#bce6dc" : "#6c8791");
  }
  ctx.restore();
}

/** Decorative material only: no actors, lights, role inference or gameplay mutation. */
export function drawRootwakeWalls(ctx: CanvasRenderingContext2D, frame: RootwakeFrame) {
  if (!Number.isFinite(frame.remaining) || frame.remaining <= 0) return;
  const warning = frame.phase === "COUNTDOWN";
  if (!warning && frame.phase !== "ORDEAL") return;
  const pose = rootwakePose(frame.remaining, 0, frame.reducedMotion);
  if (!warning && !pose.opacity) return;
  ctx.save(); ctx.lineCap = "round";
  ctx.globalAlpha *= warning ? .62 : pose.opacity * (frame.hollow ? .72 : 1);
  for (const knot of ROOTWAKE_KNOTS) {
    if (!inView(knot, frame.view)) continue;
    ctx.save(); ctx.translate(knot.x, knot.y); if (knot.horizontal) ctx.rotate(-Math.PI / 2);
    // Shallow branching fissures telegraph the actual future wall footprint.
    ctx.strokeStyle = warning ? "#b1cec281" : "#111d31b0"; ctx.lineWidth = warning ? 1.3 : 2;
    ctx.beginPath(); ctx.moveTo(-3, -27); ctx.lineTo(3, -15); ctx.lineTo(-3, 0); ctx.lineTo(4, 14); ctx.lineTo(-2, 27); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(12, -6); ctx.lineTo(19, -4); ctx.moveTo(3, 14); ctx.lineTo(-13, 19); ctx.stroke();
    ctx.restore();
  }
  if (!warning) {
    ctx.save();
    if (rootGatesOpen(frame.remaining)) {
      ctx.beginPath(); ctx.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      for (const x of ROOT_GATES) ctx.rect(x - 64, ROOT_GATE_Y - 60, 128, 120);
      ctx.clip("evenodd");
    }
    for (const knot of ROOTWAKE_KNOTS) {
      if (!inView(knot, frame.view)) continue;
      const local = rootwakePose(frame.remaining, knot.delay, frame.reducedMotion);
      if (local.growth < .001) continue;
      ctx.save(); ctx.translate(knot.x, knot.y - local.lift);
      if (knot.horizontal) ctx.rotate(-Math.PI / 2);
      ctx.scale(.18 + local.growth * .82, 1);
      const tile = knotTile(knot.variant);
      if (tile) ctx.drawImage(tile, -TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
      else paintKnot(ctx, knot.variant);
      ctx.restore();
    }
    ctx.restore();
    // Short eruption dust; quiet drifting seeds afterwards, with no strobe glow.
    if (!frame.reducedMotion) for (const [index, knot] of ROOTWAKE_KNOTS.entries()) {
      if (!inView(knot, frame.view) || index % 3) continue;
      const age = ROOTWAKE_DURATION - frame.remaining;
      const t = (age * .22 + index * .173) % 1;
      ctx.save(); ctx.globalAlpha *= pose.dust ? pose.dust * .5 : Math.sin(t * Math.PI) * .36;
      const x = knot.x + Math.sin(index * 2.7) * (pose.dust ? age * 24 : 19);
      const y = knot.y - (pose.dust ? age * 35 : t * 24);
      ellipse(ctx, x, y, pose.dust ? 3.5 : 1.5, pose.dust ? 2 : 1.5, pose.dust ? "#a2a394" : "#acd7d6");
      ctx.restore();
    }
  }
  for (const x of ROOT_GATES) drawDoor(ctx, x, frame);
  ctx.restore();
}

/** Preserve the chamber mask exactly; soften its inner edge instead of a neon box. */
export function drawRootwakeChamber(ctx: CanvasRenderingContext2D, observer: WorldPoint, remaining: number) {
  const strength = Number.isFinite(remaining) ? rootwakeEnvelope(remaining) : 0;
  if (strength <= 0) return;
  const cell = getRootCell(observer.x, observer.y);
  ctx.save(); ctx.fillStyle = `rgba(1,4,10,${.985 * strength})`;
  ctx.beginPath(); ctx.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT); ctx.rect(cell.x, cell.y, cell.w, cell.h); ctx.fill("evenodd");
  for (let side = 0; side < 4; side++) {
    const vertical = side < 2;
    const x = side === 1 ? cell.x + cell.w : cell.x, y = side === 3 ? cell.y + cell.h : cell.y;
    const inward = side % 2 ? -22 : 22;
    const fog = ctx.createLinearGradient(x, y, x + (vertical ? inward : 0), y + (vertical ? 0 : inward));
    fog.addColorStop(0, `rgba(8,18,30,${strength * .65})`); fog.addColorStop(1, "rgba(8,18,30,0)");
    ctx.fillStyle = fog;
    ctx.fillRect(side === 1 ? x - 22 : x, side === 3 ? y - 22 : y, vertical ? 22 : cell.w, vertical ? cell.h : 22);
  }
  ctx.restore();
}
