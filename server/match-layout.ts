import { CENTER, PLAYER_BOUNDS, ROOT_BARRIERS, STATIONS, SANCTUARY_OBSTACLES, getRootCell, type SanctuaryObstacle, type SanctuaryStation } from "./sanctuary-map";
import { planRoute } from "./sanctuary-paths";

/** Two separate approaches per shrine; random props must leave both mouths open. */
export function stationApproaches(station: { x: number; y: number }) {
  const bearing = Math.atan2(CENTER.y - station.y, CENTER.x - station.x);
  const selected: { x: number; y: number }[] = [];
  for (const offset of [-.72, .72, -1.5, 1.5, 0, -2.3, 2.3, Math.PI]) {
    const point = { x: station.x + Math.cos(bearing + offset) * 96, y: station.y + Math.sin(bearing + offset) * 96 };
    if (point.x < PLAYER_BOUNDS.left || point.x > PLAYER_BOUNDS.right || point.y < PLAYER_BOUNDS.top || point.y > PLAYER_BOUNDS.bottom) continue;
    if (SANCTUARY_OBSTACLES.some(obstacle => segmentDistance(obstacle, station, point) < obstacle.r + 30)) continue;
    if (selected.some(previous => Math.hypot(previous.x - point.x, previous.y - point.y) < 90)) continue;
    selected.push(point);
    if (selected.length === 2) break;
  }
  return selected;
}

function segmentDistance(point: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}

export function shrineRoutesReachable(stations: readonly SanctuaryStation[], obstacles: SanctuaryObstacle[]) {
  return stations.every(station => stationApproaches(station).length === 2 && stationApproaches(station).every(approach =>
    planRoute(CENTER, approach, false, obstacles).length > 0 && planRoute(approach, station, false, obstacles).length > 0));
}

const layoutCache = new Map<number, { stations: SanctuaryStation[]; obstacles: SanctuaryObstacle[] }>();

export function createMatchLayout(seed: number): { stations: SanctuaryStation[]; obstacles: SanctuaryObstacle[] } {
  const key = seed >>> 0;
  const cached = layoutCache.get(key);
  if (cached) return { stations: cached.stations.map(station => ({ ...station })), obstacles: cached.obstacles.map(obstacle => ({ ...obstacle })) };
  let state = seed >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  // Stable landmarks, not a shuffled ring: a player's alibi has the same meaning
  // every match. Only approved positions inside each clearing can vary.
  const homes: Record<string, { x: number; y: number }[]> = {
    "FROST FONT": [{ x: 350, y: 265 }, { x: 410, y: 285 }, { x: 300, y: 310 }],
    "STAR ALTAR": [{ x: 950, y: 280 }, { x: 1030, y: 300 }, { x: 880, y: 270 }],
    "OWL TOTEM": [{ x: 1500, y: 280 }, { x: 1590, y: 260 }, { x: 1460, y: 310 }],
    "EAST WARD": [{ x: 1530, y: 880 }, { x: 1610, y: 900 }, { x: 1460, y: 900 }],
    "MOONWELL": [{ x: 970, y: 760 }, { x: 1070, y: 720 }, { x: 910, y: 770 }],
    "ROOT SEAL": [{ x: 320, y: 760 }, { x: 260, y: 840 }, { x: 340, y: 900 }],
  };
  const slots = STATIONS.map(station => homes[station.id][Math.floor(random() * 3)]);
  const stations = STATIONS.map((station, i) => {
    let x = slots[i].x, y = slots[i].y;
    if (SANCTUARY_OBSTACLES.some(obstacle => Math.hypot(obstacle.x - x, obstacle.y - y) < 100)) {
      const fallback = [-90, 0, 90].flatMap(dx => [-70, 0, 70].map(dy => ({ x: slots[i].x + dx, y: slots[i].y + dy }))).find(point => SANCTUARY_OBSTACLES.every(obstacle => Math.hypot(obstacle.x - point.x, obstacle.y - point.y) >= 100));
      if (fallback) { x = fallback.x; y = fallback.y; }
    }
    return { ...station, x, y, side: (slots[i].y < 540 ? "top" : "bottom") as "top" | "bottom" };
  });
  const obstacles: SanctuaryObstacle[] = SANCTUARY_OBSTACLES.map(obstacle => ({ ...obstacle }));
  // Each group has a job: staggered frost cover, a broken ruin, an owl lookout,
  // a cloister corner, an open moonwell, and a looping willow grove. Circles are
  // visible trunks/stone bases; foliage never adds an invisible collider.
  const cover: Record<string, readonly (readonly [number, number])[]> = {
    "FROST FONT": [[-115, 100], [-155, 170], [120, -40]],
    "STAR ALTAR": [[-130, -70], [-130, -15], [120, 110]],
    "OWL TOTEM": [[125, 70], [140, 150]],
    "EAST WARD": [[-140, -80], [-140, -25], [110, 80]],
    "MOONWELL": [[-160, 80]],
    "ROOT SEAL": [[-115, -80], [-160, 10], [120, 110], [145, 175]],
  };
  for (const station of stations) {
    const variation = random() < .5 ? -1 : 1;
    for (const [i, offset] of cover[station.id].entries()) {
      const x = station.x + offset[0] * variation, y = station.y + offset[1];
      if (x < PLAYER_BOUNDS.left + 35 || x > PLAYER_BOUNDS.right - 35 || y < PLAYER_BOUNDS.top + 35 || y > PLAYER_BOUNDS.bottom - 35) continue;
      if (getRootCell(x, y).index !== getRootCell(station.x, station.y).index) continue;
      if (ROOT_BARRIERS.some(wall => x > wall.x - 65 && x < wall.x + wall.w + 65 && y > wall.y - 65 && y < wall.y + wall.h + 65)) continue;
      if (stations.some(other => Math.hypot(x - other.x, y - other.y) < 108) || Math.hypot(x - CENTER.x, y - CENTER.y) < 200) continue;
      if (obstacles.some(other => Math.hypot(x - other.x, y - other.y) < other.r + 22 + 52)) continue;
      if (stations.some(other => stationApproaches(other).some(approach => segmentDistance({ x, y }, other, approach) < 70))) continue;
      const tree = station.id !== "STAR ALTAR" && station.id !== "EAST WARD";
      obstacles.push({ id: `shrine-${station.id}-${i}`, x, y, r: tree ? 23 : 21, kind: tree ? "ANCIENT_TREE" : i === 1 ? "MOSS_PILLAR" : "RUNED_MONOLITH", canopyRadius: tree ? 57 : 35, canopyHeight: tree ? 92 : 65, label: tree ? "Sanctum Pine" : "Ward Stone" });
    }
  }
  // Fail safe: remove optional props, never introduce a hidden collider or an unreachable reward.
  while (!shrineRoutesReachable(stations, obstacles) && obstacles.length > SANCTUARY_OBSTACLES.length) obstacles.pop();
  if (layoutCache.size >= 16) layoutCache.delete(layoutCache.keys().next().value!);
  layoutCache.set(key, { stations: stations.map(station => ({ ...station })), obstacles: obstacles.map(obstacle => ({ ...obstacle })) });
  return { stations, obstacles };
}
