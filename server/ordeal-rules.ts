import type { Hazard } from "./game-types";
import { CENTER, SANCTUARY_OBSTACLES, type SanctuaryObstacle } from "./sanctuary-map";
export { SANCTUARY_OBSTACLES, sanctuaryZoneName } from "./sanctuary-map";
export type { SanctuaryObstacle, ObstacleKind } from "./sanctuary-map";

export const TASK_PROGRESS_REWARD = 8;
export const ORDEAL_TASK_PROGRESS_REWARD = 12;
export const MOON_SIGHT_SECONDS = 3.2;
export const ECHO_SECONDS = 2;
export const ECHO_RANGE = 220;
export const HEARING_RANGE = 300;
export const ORDEAL_SECONDS = 10;
export const MIRROR_POOL_SECONDS = 25;
export const MIRROR_BUMP_DISTANCE = 54;
export const MIRROR_BUMP_COOLDOWN_MS = 1500;
export const HAZARDS: Hazard[] = ["BLACKOUT", "FOG", "MOONGLARE", "ROOTWAKE", "PHANTOMS", "MIRROR_POOL"];

export function ordealDuration(hazard: Hazard): number {
  return hazard === "MIRROR_POOL" ? MIRROR_POOL_SECONDS : ORDEAL_SECONDS;
}

export function nextHazard(previous: Hazard, random = Math.random) {
  const options = HAZARDS.filter(hazard => hazard !== previous);
  return options[Math.min(options.length - 1, Math.floor(random() * options.length))];
}

/** Shared seed + phase time means every observer sees the same wandering shapes. */
export function phantomPaths(seed: number) {
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  return Array.from({ length: 5 }, (_, i) => ({
    x: 420 + i * 255 + (random() - 0.5) * 135,
    y: 360 + random() * 405,
    rx: 65 + random() * 85,
    ry: 40 + random() * 70,
    speed: 0.5 + random() * 0.65,
    phase: random() * Math.PI * 2,
  }));
}

/** Smoothly pushes a moving circle (player) out of any overlapping sanctuary obstacle trunks/bases. */
export function resolveObstaclePosition(x: number, y: number, playerRadius = 22, obstacles = SANCTUARY_OBSTACLES) {
  let rx = x;
  let ry = y;
  for (const obs of obstacles) {
    const dx = rx - obs.x;
    const dy = ry - obs.y;
    const minDist = obs.r + playerRadius;
    const d = Math.hypot(dx, dy);
    if (d < minDist) {
      if (d < 0.001) {
        rx = obs.x + minDist;
      } else {
        const push = minDist / d;
        rx = obs.x + dx * push;
        ry = obs.y + dy * push;
      }
    }
  }
  return { x: rx, y: ry };
}

/** Resolve visible trunk contacts without killing movement along their edge.
 * Both prediction and room authority use this so glancing contacts do not
 * alternate between free movement and a full stop on every network update.
 */
export function resolveObstacleMovement(x: number, y: number, vx: number, vy: number, playerRadius = 22, obstacles = SANCTUARY_OBSTACLES) {
  let rx = Number.isFinite(x) ? x : CENTER.x;
  let ry = Number.isFinite(y) ? y : CENTER.y;
  let rvx = Number.isFinite(vx) ? vx : 0;
  let rvy = Number.isFinite(vy) ? vy : 0;
  const radius = Number.isFinite(playerRadius) && playerRadius >= 0 ? playerRadius : 22;
  const speed = Math.hypot(rvx, rvy);
  if (speed > 184) { rvx = rvx / speed * 184; rvy = rvy / speed * 184; }
  for (const obstacle of obstacles) {
    const dx = rx - obstacle.x, dy = ry - obstacle.y;
    const distance = Math.hypot(dx, dy);
    const contactDistance = obstacle.r + radius;
    if (distance > contactDistance + 0.001) continue;
    // Match the deterministic east-side exit of resolveObstaclePosition when
    // a stale position lands exactly in the middle of a trunk.
    const nx = distance < 0.001 ? 1 : dx / distance;
    const ny = distance < 0.001 ? 0 : dy / distance;
    if (distance < contactDistance) {
      rx = obstacle.x + nx * contactDistance;
      ry = obstacle.y + ny * contactDistance;
    }
    const inwardSpeed = rvx * nx + rvy * ny;
    if (inwardSpeed < 0) {
      rvx -= inwardSpeed * nx;
      rvy -= inwardSpeed * ny;
    }
  }
  return { x: rx, y: ry, vx: rvx, vy: rvy };
}

/** Returns true if the line-of-sight segment between `a` and `b` is blocked by a sanctuary obstacle trunk/pillar. */
export function isOccludedByObstacle(a: { x: number; y: number }, b: { x: number; y: number }, obstacles: readonly SanctuaryObstacle[] = SANCTUARY_OBSTACLES) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  if (lenSq < 1) return false;
  for (const obs of obstacles) {
    // Project obstacle center onto segment a->b
    const t = Math.max(0, Math.min(1, ((obs.x - a.x) * abx + (obs.y - a.y) * aby) / lenSq));
    if (t <= 0.05 || t >= 0.95) continue;
    const px = a.x + t * abx;
    const py = a.y + t * aby;
    const blockRadius = obs.r + 8;
    if ((px - obs.x) ** 2 + (py - obs.y) ** 2 < blockRadius * blockRadius) {
      return true;
    }
  }
  return false;
}
