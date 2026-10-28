import { clampWorldPoint, keepInRootCell, type SanctuaryObstacle } from "./sanctuary-map";
import { resolveObstacleMovement } from "./ordeal-rules";
import { rootwakeMove } from "./sanctuary-design";

export type UtilityKind = "WISP_STEP" | "WATCHROOT";
export type UtilityPoint = { x: number; y: number };
export type Watchroot = UtilityPoint & { id: string; angle: number; expiresAt: number; armedAt: number };
export const UTILITY_LABELS: Record<UtilityKind, string> = { WISP_STEP: "Wisp Step", WATCHROOT: "Watchroot" };
export function normalizeUtility(value: unknown): UtilityKind { return value === "WATCHROOT" ? value : "WISP_STEP"; }
export const UTILITY_COOLDOWN_MS = 18_000;

/** Sweep in small steps; neither ordinary walls nor sealed Rootwake cells can be bypassed. */
export function wispDestination(start: UtilityPoint, angle: number, obstacles: SanctuaryObstacle[], rootLocked: boolean, rootRemaining = Infinity): UtilityPoint {
  let point = { ...start };
  for (let i = 0; i < 20; i++) {
    let next = clampWorldPoint(point.x + Math.cos(angle) * 7, point.y + Math.sin(angle) * 7);
    if (rootLocked) next = rootRemaining === Infinity ? keepInRootCell(start, next) : rootwakeMove(start, next, rootRemaining);
    const resolved = resolveObstacleMovement(next.x, next.y, 0, 0, 22, obstacles);
    if (Math.hypot(resolved.x - next.x, resolved.y - next.y) > .5) break;
    point = next;
  }
  return point;
}
export function crossesWatchroot(root: Watchroot, from: UtilityPoint, to: UtilityPoint): boolean {
  const relative = (p: UtilityPoint) => ({
    x: (p.x - root.x) * Math.cos(root.angle) + (p.y - root.y) * Math.sin(root.angle),
    y: -(p.x - root.x) * Math.sin(root.angle) + (p.y - root.y) * Math.cos(root.angle),
  });
  const a = relative(from), b = relative(to);
  if (a.x === b.x || a.x * b.x > 0) return false;
  const t = -a.x / (b.x - a.x);
  return Math.abs(a.y + (b.y - a.y) * t) <= 58;
}
export class ForestUtilities {
  choices = new Map<string, UtilityKind>();
  charges = new Map<string, number>();
  cooldowns = new Map<string, number>();
  roots: Watchroot[] = [];
  private positions = new Map<string, UtilityPoint>();
  private serial = 0;
  select(id: string, kind: unknown) { this.choices.set(id, normalizeUtility(kind)); }
  earn(id: string) { this.charges.set(id, 1); }
  reset() { this.charges.clear(); this.cooldowns.clear(); this.roots = []; this.positions.clear(); }
  state(id: string, now: number) { return { kind: this.choices.get(id) ?? "WISP_STEP" as UtilityKind, charge: this.charges.get(id) ?? 0, cooldownMs: Math.max(0, (this.cooldowns.get(id) ?? 0) - now) }; }
  use(id: string, actor: UtilityPoint, angle: number, now: number, obstacles: SanctuaryObstacle[], rootLocked: boolean, rootRemaining = Infinity) {
    const status = this.state(id, now);
    if (!Number.isFinite(angle) || !status.charge || status.cooldownMs) return null;
    const destination = status.kind === "WISP_STEP" ? wispDestination(actor, angle, obstacles, rootLocked, rootRemaining) : { ...actor };
    if (status.kind === "WISP_STEP" && Math.hypot(destination.x - actor.x, destination.y - actor.y) < 7) return null;
    this.charges.set(id, 0); this.cooldowns.set(id, now + UTILITY_COOLDOWN_MS);
    if (status.kind === "WATCHROOT") {
      const point = wispDestination(actor, angle, obstacles, rootLocked, rootRemaining);
      const distance = Math.hypot(point.x - actor.x, point.y - actor.y);
      if (distance < 25) { this.charges.set(id, 1); this.cooldowns.delete(id); return null; }
      const scale = Math.min(1, 64 / distance);
      this.roots.push({ id: `root-${++this.serial}`, x: actor.x + (point.x - actor.x) * scale, y: actor.y + (point.y - actor.y) * scale, angle, armedAt: now + 700, expiresAt: now + 12_000 });
    }
    return { kind: status.kind, destination };
  }
  tick(actors: readonly (UtilityPoint & { id: string; alive: boolean })[], now: number) {
    const triggered: Watchroot[] = [];
    this.roots = this.roots.filter(root => {
      if (now >= root.expiresAt) return false;
      const crossed = now >= root.armedAt && actors.some(actor => actor.alive && this.positions.has(actor.id) && crossesWatchroot(root, this.positions.get(actor.id)!, actor));
      if (crossed) triggered.push(root);
      return !crossed;
    });
    for (const actor of actors) this.positions.set(actor.id, { x: actor.x, y: actor.y });
    return triggered;
  }
}
