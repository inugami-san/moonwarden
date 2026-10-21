import { CENTER, PLAYER_BOUNDS, ROOT_BARRIERS, STATIONS, SANCTUARY_OBSTACLES, getRootCell, type SanctuaryObstacle, type SanctuaryStation } from "./sanctuary-map";

export function createMatchLayout(seed: number): { stations: SanctuaryStation[]; obstacles: SanctuaryObstacle[] } {
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
      const tree = i % 2 === 0;
      obstacles.push({ id: `shrine-${station.id}-${i}`, x, y, r: tree ? 23 : 21, kind: tree ? "ANCIENT_TREE" : i === 1 ? "MOSS_PILLAR" : "RUNED_MONOLITH", canopyRadius: tree ? 57 : 35, canopyHeight: tree ? 92 : 65, label: tree ? "Sanctum Pine" : "Ward Stone" });
    }
  }
  return { stations, obstacles };
}
