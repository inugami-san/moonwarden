import { ROOT_BARRIERS, clampWorldPoint, keepInRootCell, getRootCell, type WorldPoint } from "./sanctuary-map";

export const ROOTWAKE_DURATION = 12;
export const ROOT_GATES = [400, 960, 1500] as const;
export const SHADE_POCKETS = [{ x: 470, y: 400 }, { x: 1410, y: 740 }] as const;
export const SHADE_RADIUS = 96;
export function sameShade(a: WorldPoint, b: WorldPoint) {
  return SHADE_POCKETS.some(p => Math.hypot(a.x - p.x, a.y - p.y) < SHADE_RADIUS && Math.hypot(b.x - p.x, b.y - p.y) < SHADE_RADIUS);
}
export function rootGatesOpen(remaining: number) { return remaining > 0 && remaining <= ROOTWAKE_DURATION / 2; }
export function rootwakeEnvelope(remaining: number) {
  return Math.max(0, Math.min(1, (ROOTWAKE_DURATION - remaining) / .75, remaining / .55));
}
/** Paired north/south chambers share a visibly marked doorway in the second half.
 * Restrict both endpoints to its width so delayed packets cannot tunnel around walls. */
export function rootwakeMove(previous: WorldPoint, next: WorldPoint, remaining: number): WorldPoint {
  const a = getRootCell(previous.x, previous.y), b = getRootCell(next.x, next.y);
  const gate = ROOT_GATES[a.column];
  if (rootGatesOpen(remaining) && a.column === b.column && Math.abs(previous.x - gate) <= 42 && Math.abs(next.x - gate) <= 42) return clampWorldPoint(next.x, next.y);
  return keepInRootCell(previous, next);
}
export function overgrownStationIndex(round: number, seed: number, count: number) {
  const eligible = count === 6 ? [0, 1, 2, 5] : Array.from({ length: count }, (_, i) => i);
  return eligible[((seed >>> 0) + Math.max(0, round - 1)) % eligible.length] ?? 0;
}
export function lurePoint(origin: WorldPoint, angle: number, progress: number, rootLocked: boolean) {
  const t = Math.max(0, Math.min(1, progress));
  const next = clampWorldPoint(origin.x + Math.cos(angle) * 90 * t, origin.y + Math.sin(angle) * 90 * t);
  return rootLocked ? keepInRootCell(origin, next) : next;
}
export const ORDEAL_HINTS = {
  BLACKOUT: "Light reveals the path—and your position. Share it carefully.",
  FOG: "Follow nearby sounds. Stay close, or take a quieter route.",
  MOONGLARE: "Find a blue shade pocket to recognize nearby companions.",
  ROOTWAKE: "Choose a chamber. Moon-marked doors open halfway through.",
  PHANTOMS: "An Echo Bell can test suspicious shapes. A shape is not proof.",
  MIRROR_POOL: "Bumps swap colors, not controls. True colors return when Calm begins.",
} as const;
export const ROOT_GATE_Y = ROOT_BARRIERS[2].y + ROOT_BARRIERS[2].h / 2;
