import type { Hazard } from "./game-types";

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
    x: 280 + i * 170 + (random() - 0.5) * 90,
    y: 240 + random() * 270,
    rx: 65 + random() * 85,
    ry: 40 + random() * 70,
    speed: 0.5 + random() * 0.65,
    phase: random() * Math.PI * 2,
  }));
}

export type ObstacleKind = "CRYSTAL_SPIRE" | "RUNED_MONOLITH" | "ANCIENT_TREE" | "WEEPING_WILLOW" | "MOSS_PILLAR";

export interface SanctuaryObstacle {
  id: string;
  kind: ObstacleKind;
  x: number;
  y: number;
  r: number;
  canopyRadius: number;
  canopyHeight: number;
  label: string;
}

export const SANCTUARY_OBSTACLES: readonly SanctuaryObstacle[] = [
  { id: "frost-spire", kind: "CRYSTAL_SPIRE", x: 215, y: 295, r: 22, canopyRadius: 48, canopyHeight: 86, label: "Frost Spire" },
  { id: "nw-monolith", kind: "RUNED_MONOLITH", x: 450, y: 225, r: 20, canopyRadius: 42, canopyHeight: 82, label: "West Ward Gate" },
  { id: "ne-monolith", kind: "RUNED_MONOLITH", x: 830, y: 225, r: 20, canopyRadius: 42, canopyHeight: 82, label: "East Ward Gate" },
  { id: "owl-hollow-tree", kind: "ANCIENT_TREE", x: 1045, y: 275, r: 24, canopyRadius: 68, canopyHeight: 104, label: "Owl Hollow Tree" },
  { id: "grotto-elder-tree", kind: "ANCIENT_TREE", x: 285, y: 535, r: 26, canopyRadius: 72, canopyHeight: 108, label: "Grotto Elder Tree" },
  { id: "sw-ruin-pillar", kind: "MOSS_PILLAR", x: 450, y: 545, r: 20, canopyRadius: 42, canopyHeight: 78, label: "Root Arch Pillar" },
  { id: "moonwell-willow", kind: "WEEPING_WILLOW", x: 685, y: 575, r: 23, canopyRadius: 66, canopyHeight: 98, label: "Moonwell Willow" },
  { id: "cloister-pillar", kind: "MOSS_PILLAR", x: 1020, y: 535, r: 22, canopyRadius: 44, canopyHeight: 80, label: "Cloister Column" },
] as const;

/** Smoothly pushes a moving circle (player) out of any overlapping sanctuary obstacle trunks/bases. */
export function resolveObstaclePosition(x: number, y: number, playerRadius = 22) {
  let rx = x;
  let ry = y;
  for (const obs of SANCTUARY_OBSTACLES) {
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

/** Returns true if the line-of-sight segment between `a` and `b` is blocked by a sanctuary obstacle trunk/pillar. */
export function isOccludedByObstacle(a: { x: number; y: number }, b: { x: number; y: number }) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  if (lenSq < 1) return false;
  for (const obs of SANCTUARY_OBSTACLES) {
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

export function sanctuaryZoneName(x: number, y: number): string {
  if (Math.hypot(x - 640, y - 382) < 135) return "WARDEN COURTYARD";
  if (y < 362) {
    if (x < 450) return "FROST HOLLOW";
    if (x < 830) return "STARLIGHT ARCHIVE";
    return "OWL WATCH";
  }
  if (x < 450) return "DEEP ROOT GROTTO";
  if (x < 920) return "MOONWELL SPRINGS";
  return "SUNKEN CLOISTER";
}
