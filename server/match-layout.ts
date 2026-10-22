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
  const slots = [{ x: 350, y: 295 }, { x: 950, y: 295 }, { x: 1530, y: 295 }, { x: 350, y: 820 }, { x: 950, y: 830 }, { x: 1530, y: 820 }];
  for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]]; }
  const stations = STATIONS.map((station, i) => {
    let x = slots[i].x, y = slots[i].y;
    for (let retry = 0; retry < 30; retry++) {
      x = slots[i].x + Math.round((random() - .5) * 100); y = slots[i].y + Math.round((random() - .5) * 65);
      if (SANCTUARY_OBSTACLES.every(obstacle => Math.hypot(obstacle.x - x, obstacle.y - y) >= 100)) break;
    }
    if (SANCTUARY_OBSTACLES.some(obstacle => Math.hypot(obstacle.x - x, obstacle.y - y) < 100)) {
      const fallback = [-90, 0, 90].flatMap(dx => [-70, 0, 70].map(dy => ({ x: slots[i].x + dx, y: slots[i].y + dy }))).find(point => SANCTUARY_OBSTACLES.every(obstacle => Math.hypot(obstacle.x - point.x, obstacle.y - point.y) >= 100));
      if (fallback) { x = fallback.x; y = fallback.y; }
    }
    return { ...station, x, y, side: (slots[i].y < 540 ? "top" : "bottom") as "top" | "bottom" };
  });
  const obstacles: SanctuaryObstacle[] = SANCTUARY_OBSTACLES.map(obstacle => ({ ...obstacle }));
  for (const station of stations) {
    const opening = Math.atan2(CENTER.y - station.y, CENTER.x - station.x);
    for (let i = 0; i < 4; i++) {
      const angle = opening + Math.PI * .48 + i * Math.PI * .35 + (random() - .5) * .15;
      const radius = 126 + random() * 20;
      const x = Math.round(station.x + Math.cos(angle) * radius), y = Math.round(station.y + Math.sin(angle) * radius);
      if (x < PLAYER_BOUNDS.left + 35 || x > PLAYER_BOUNDS.right - 35 || y < PLAYER_BOUNDS.top + 35 || y > PLAYER_BOUNDS.bottom - 35) continue;
      if (getRootCell(x, y).index !== getRootCell(station.x, station.y).index) continue;
      if (ROOT_BARRIERS.some(wall => x > wall.x - 65 && x < wall.x + wall.w + 65 && y > wall.y - 65 && y < wall.y + wall.h + 65)) continue;
      if (stations.some(other => Math.hypot(x - other.x, y - other.y) < 108) || Math.hypot(x - CENTER.x, y - CENTER.y) < 200) continue;
      if (obstacles.some(other => Math.hypot(x - other.x, y - other.y) < other.r + 22 + 52)) continue;
      if (stations.some(other => stationApproaches(other).some(approach => segmentDistance({ x, y }, other, approach) < 70))) continue;
      const tree = i % 2 === 0;
      obstacles.push({ id: `shrine-${station.id}-${i}`, x, y, r: tree ? 23 : 21, kind: tree ? "ANCIENT_TREE" : i === 1 ? "MOSS_PILLAR" : "RUNED_MONOLITH", canopyRadius: tree ? 57 : 35, canopyHeight: tree ? 92 : 65, label: tree ? "Sanctum Pine" : "Ward Stone" });
    }
  }
  // Fail safe: remove optional props, never introduce a hidden collider or an unreachable reward.
  while (!shrineRoutesReachable(stations, obstacles) && obstacles.length > SANCTUARY_OBSTACLES.length) obstacles.pop();
  if (layoutCache.size >= 16) layoutCache.delete(layoutCache.keys().next().value!);
  layoutCache.set(key, { stations: stations.map(station => ({ ...station })), obstacles: obstacles.map(obstacle => ({ ...obstacle })) });
  return { stations, obstacles };
}
