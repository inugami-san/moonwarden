import { SANCTUARY_OBSTACLES, PLAYER_BOUNDS, keepInRootCell, type WorldPoint, type SanctuaryObstacle } from "./sanctuary-map";

const PLAYER_RADIUS = 22;
const CLEARANCE_EPSILON = 1e-7;

/** Navigation uses the same small obstacle bases as collision, never the decorative canopy. */
function clearRoute(a: WorldPoint, b: WorldPoint, obstacles = SANCTUARY_OBSTACLES) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  return obstacles.every(obstacle => {
    const t = lengthSquared ? Math.max(0, Math.min(1, ((obstacle.x - a.x) * dx + (obstacle.y - a.y) * dy) / lengthSquared)) : 0;
    // Collision can leave a bot exactly on a trunk's legal edge. Requiring an
    // extra safety margin here would disconnect every edge from that start
    // (or a target hugging a tree), caching an empty route indefinitely.
    return Math.hypot(a.x + t * dx - obstacle.x, a.y + t * dy - obstacle.y) >= obstacle.r + PLAYER_RADIUS - CLEARANCE_EPSILON;
  });
}

const routePoints = (obstacles: readonly SanctuaryObstacle[]) => obstacles.flatMap(obstacle => Array.from({ length: 8 }, (_, i) => {
  const angle = i * Math.PI / 4;
  return { x: obstacle.x + Math.cos(angle) * (obstacle.r + 32), y: obstacle.y + Math.sin(angle) * (obstacle.r + 32) };
}));
const distance = (a: WorldPoint, b: WorldPoint) => Math.hypot(a.x - b.x, a.y - b.y);

/** Short visibility-graph route, calculated once per destination rather than on every frame. */
export function planRoute(start: WorldPoint, destination: WorldPoint, restrictRootCell = false, obstacles = SANCTUARY_OBSTACLES): WorldPoint[] {
  if (![start.x, start.y, destination.x, destination.y].every(Number.isFinite)) return [];
  const inChamber = (point: WorldPoint) => {
    if (point.x < PLAYER_BOUNDS.left || point.x > PLAYER_BOUNDS.right || point.y < PLAYER_BOUNDS.top || point.y > PLAYER_BOUNDS.bottom) return false;
    if (!restrictRootCell) return true;
    const kept = keepInRootCell(start, point);
    return Math.abs(kept.x - point.x) < 0.01 && Math.abs(kept.y - point.y) < 0.01;
  };
  if (!inChamber(destination)) return [];
  if (clearRoute(start, destination, obstacles)) return [{ x: destination.x, y: destination.y }];
  const points = [{ x: start.x, y: start.y }, { x: destination.x, y: destination.y }, ...routePoints(obstacles).filter(inChamber)];
  const distances = points.map(() => Infinity), previous = points.map(() => -1), visited = new Set<number>();
  distances[0] = 0;
  for (let iteration = 0; iteration < points.length; iteration++) {
    let current = -1;
    for (let i = 0; i < points.length; i++) if (!visited.has(i) && (current === -1 || distances[i] < distances[current])) current = i;
    if (current === -1 || !Number.isFinite(distances[current])) break;
    if (current === 1) {
      const result: WorldPoint[] = [];
      for (let i = 1; i !== 0; i = previous[i]) result.unshift(points[i]);
      return result;
    }
    visited.add(current);
    for (let i = 1; i < points.length; i++) {
      if (visited.has(i) || !clearRoute(points[current], points[i], obstacles)) continue;
      const candidate = distances[current] + distance(points[current], points[i]);
      if (candidate < distances[i]) { distances[i] = candidate; previous[i] = current; }
    }
  }
  return [];
}
