import type { ItemKind } from "./game-types";
import type { RitualKind } from "./forest-rituals";

/** One coordinate system for room authority, navigation, collision, and scenery. */
export const WORLD_WIDTH = 1920;
export const WORLD_HEIGHT = 1140;
export const VIEW_WIDTH = 1280;
export const VIEW_HEIGHT = 760;
export const ROOM = { left: 114, top: 108, right: 1806, bottom: 1035 } as const;
export const PLAYER_BOUNDS = { left: 150, top: 156, right: 1770, bottom: 1003 } as const;
export const CENTER = { x: 960, y: 573 } as const;
export const CALM_SECONDS = 24;

export type WorldPoint = { x: number; y: number };
export type RootBarrier = WorldPoint & { w: number; h: number };
export type RootCell = RootBarrier & { column: number; row: number; index: number };

export const ROOT_BARRIERS: readonly RootBarrier[] = [
  { x: 648, y: ROOM.top, w: 36, h: ROOM.bottom - ROOM.top },
  { x: 1218, y: ROOM.top, w: 36, h: ROOM.bottom - ROOM.top },
  { x: ROOM.left, y: 543, w: ROOM.right - ROOM.left, h: 36 },
];

export type SanctuaryStation = WorldPoint & {
  /** Stable network ID: preserve the original shrine labels. */
  id: string;
  label: string;
  side: "top" | "right" | "bottom" | "left";
  reward: ItemKind;
  puzzle?: "MATH" | "LINK" | RitualKind;
  pulse: number;
};

export const STATIONS: readonly SanctuaryStation[] = [
  { id: "FROST FONT", label: "FROST FONT", x: 375, y: 156, side: "top", reward: "FLASHLIGHT", puzzle: "MOON", pulse: 0 },
  { id: "STAR ALTAR", label: "STAR ALTAR", x: 960, y: 156, side: "top", reward: "SONAR", puzzle: "FIREFLY", pulse: 1.2 },
  { id: "OWL TOTEM", label: "OWL TOTEM", x: 1557, y: 156, side: "top", reward: "FLARE", puzzle: "MOON", pulse: 2.4 },
  { id: "EAST WARD", label: "EAST WARD", x: 1746, y: 585, side: "right", reward: "FLASHLIGHT", puzzle: "MATH", pulse: 3.1 },
  { id: "MOONWELL", label: "MOONWELL", x: 1266, y: 987, side: "bottom", reward: "FLARE", pulse: 4.2 },
  { id: "ROOT SEAL", label: "ROOT SEAL", x: 174, y: 603, side: "left", reward: "SONAR", puzzle: "ROOT", pulse: 5.1 },
];

export type ObstacleKind = "CRYSTAL_SPIRE" | "RUNED_MONOLITH" | "ANCIENT_TREE" | "WEEPING_WILLOW" | "MOSS_PILLAR";
export interface SanctuaryObstacle extends WorldPoint {
  id: string;
  kind: ObstacleKind;
  r: number;
  canopyRadius: number;
  canopyHeight: number;
  label: string;
}

/** Positions spread out with the forest; trunk and canopy sizes do not grow. */
export const SANCTUARY_OBSTACLES: readonly SanctuaryObstacle[] = [
  { id: "frost-spire", kind: "CRYSTAL_SPIRE", x: 322.5, y: 442.5, r: 22, canopyRadius: 48, canopyHeight: 86, label: "Frost Spire" },
  { id: "nw-monolith", kind: "RUNED_MONOLITH", x: 675, y: 337.5, r: 20, canopyRadius: 42, canopyHeight: 82, label: "West Ward Gate" },
  { id: "ne-monolith", kind: "RUNED_MONOLITH", x: 1245, y: 337.5, r: 20, canopyRadius: 42, canopyHeight: 82, label: "East Ward Gate" },
  { id: "owl-hollow-tree", kind: "ANCIENT_TREE", x: 1567.5, y: 412.5, r: 24, canopyRadius: 68, canopyHeight: 104, label: "Owl Hollow Tree" },
  { id: "grotto-elder-tree", kind: "ANCIENT_TREE", x: 427.5, y: 802.5, r: 26, canopyRadius: 72, canopyHeight: 108, label: "Grotto Elder Tree" },
  { id: "sw-ruin-pillar", kind: "MOSS_PILLAR", x: 675, y: 817.5, r: 20, canopyRadius: 42, canopyHeight: 78, label: "Root Arch Pillar" },
  { id: "moonwell-willow", kind: "WEEPING_WILLOW", x: 1027.5, y: 862.5, r: 23, canopyRadius: 66, canopyHeight: 98, label: "Moonwell Willow" },
  { id: "cloister-pillar", kind: "MOSS_PILLAR", x: 1530, y: 802.5, r: 22, canopyRadius: 44, canopyHeight: 80, label: "Cloister Column" },
];

export const SANCTUARY_CLEARINGS = [
  { label: "FROST HOLLOW", x: 375, y: 292, rx: 246, ry: 169, color: "#a9d8d7" },
  { label: "FALLEN SHRINE", x: 960, y: 300, rx: 240, ry: 171, color: "#c9b8df" },
  { label: "OWL WATCH", x: 1557, y: 290, rx: 224, ry: 164, color: "#d8c98c" },
  { label: "WILLOW GROVE", x: 347, y: 790, rx: 208, ry: 200, color: "#b7c4a1" },
  { label: "MOONWELL", x: 1060, y: 854, rx: 230, ry: 150, color: "#9cc6e0" },
  { label: "SUNKEN CLOISTER", x: 1622, y: 690, rx: 166, ry: 220, color: "#b7c7ac" },
] as const;

/** Floor paths only. Props and hidden collision must never be baked into these routes. */
export const SANCTUARY_TRAILS: readonly { points: readonly number[]; width: number }[] = [
  { points: [174, 603, 525, 532, 1300, 651, 1746, 585], width: 126 },
  { points: [375, 156, 359, 397, 660, 429, 960, 573], width: 108 },
  { points: [960, 156, 1001, 318, 900, 416, 960, 573], width: 100 },
  { points: [1557, 156, 1451, 342, 1300, 427, 960, 573], width: 108 },
  { points: [1266, 987, 1286, 826, 1163, 702, 960, 573], width: 126 },
  { points: [174, 603, 210, 1040, 927, 1029, 1266, 987], width: 103 },
];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function clampWorldPoint(x: number, y: number): WorldPoint {
  return {
    x: clamp(Number.isFinite(x) ? x : CENTER.x, PLAYER_BOUNDS.left, PLAYER_BOUNDS.right),
    y: clamp(Number.isFinite(y) ? y : CENTER.y, PLAYER_BOUNDS.top, PLAYER_BOUNDS.bottom),
  };
}

export function getRootCell(x: number, y: number): RootCell {
  const point = clampWorldPoint(x, y);
  const [leftRoot, rightRoot, middleRoot] = ROOT_BARRIERS;
  const column = point.x < leftRoot.x + leftRoot.w / 2 ? 0 : point.x < rightRoot.x + rightRoot.w / 2 ? 1 : 2;
  const row = point.y < middleRoot.y + middleRoot.h / 2 ? 0 : 1;
  const columnBounds = [[ROOM.left, leftRoot.x], [leftRoot.x + leftRoot.w, rightRoot.x], [rightRoot.x + rightRoot.w, ROOM.right]];
  const rowBounds = [[ROOM.top, middleRoot.y], [middleRoot.y + middleRoot.h, ROOM.bottom]];
  const [left, right] = columnBounds[column], [top, bottom] = rowBounds[row];
  return { x: left, y: top, w: right - left, h: bottom - top, column, row, index: row * 3 + column };
}

export function rootCellForPosition(position: WorldPoint): RootCell { return getRootCell(position.x, position.y); }
export function rootCellIndex(position: WorldPoint): number { return rootCellForPosition(position).index; }
export function sharesRootCell(a: WorldPoint, b: WorldPoint): boolean { return rootCellIndex(a) === rootCellIndex(b); }

/** Resolve an eruption under a slime deterministically before choosing its chamber. */
export function resolveRootPosition(x: number, y: number, radius = 30): WorldPoint {
  const point = clampWorldPoint(x, y);
  for (let pass = 0; pass < 2; pass++) {
    for (const wall of ROOT_BARRIERS) {
      const left = wall.x - radius, right = wall.x + wall.w + radius;
      const top = wall.y - radius, bottom = wall.y + wall.h + radius;
      if (point.x <= left || point.x >= right || point.y <= top || point.y >= bottom) continue;
      const exits = [
        { distance: point.x - left, axis: "x" as const, value: left },
        { distance: right - point.x, axis: "x" as const, value: right },
        { distance: point.y - top, axis: "y" as const, value: top },
        { distance: bottom - point.y, axis: "y" as const, value: bottom },
      ].sort((a, b) => a.distance - b.distance);
      point[exits[0].axis] = exits[0].value;
    }
  }
  return clampWorldPoint(point.x, point.y);
}

/** Prevents tunnelling to a different Rootwake chamber, even across a delayed packet. */
export function keepInRootCell(previous: WorldPoint, next: WorldPoint, radius = 30): WorldPoint {
  const cell = rootCellForPosition(resolveRootPosition(previous.x, previous.y, radius));
  const destination = clampWorldPoint(next.x, next.y);
  const left = Math.max(PLAYER_BOUNDS.left, cell.column === 0 ? cell.x : cell.x + radius);
  const right = Math.min(PLAYER_BOUNDS.right, cell.column === 2 ? cell.x + cell.w : cell.x + cell.w - radius);
  const top = Math.max(PLAYER_BOUNDS.top, cell.row === 0 ? cell.y : cell.y + radius);
  const bottom = Math.min(PLAYER_BOUNDS.bottom, cell.row === 1 ? cell.y + cell.h : cell.y + cell.h - radius);
  return { x: clamp(destination.x, left, right), y: clamp(destination.y, top, bottom) };
}

export function sanctuaryZoneName(x: number, y: number): string {
  if (Math.hypot(x - CENTER.x, y - CENTER.y) < 190) return "WARDEN COURTYARD";
  if (y < 543) {
    if (x < 675) return "FROST HOLLOW";
    if (x < 1245) return "FALLEN SHRINE";
    return "OWL WATCH";
  }
  if (x < 675) return "WILLOW GROVE";
  if (x < 1380) return "MOONWELL";
  return "SUNKEN CLOISTER";
}
