import assert from "node:assert/strict";
import test from "node:test";
import {
  WORLD_WIDTH, WORLD_HEIGHT, VIEW_WIDTH, VIEW_HEIGHT, ROOM, PLAYER_BOUNDS, CENTER, CALM_SECONDS,
  STATIONS, ROOT_BARRIERS, SANCTUARY_OBSTACLES, SANCTUARY_CLEARINGS, SANCTUARY_TRAILS,
  clampWorldPoint, getRootCell, rootCellIndex, sharesRootCell, keepInRootCell, resolveRootPosition, sanctuaryZoneName,
} from "../server/sanctuary-map.ts";
import { drawMoonGlade } from "../app/moon-glade.ts";
import { planRoute } from "../server/sanctuary-paths.ts";

function assertRouteClear(start, route) {
  let previous = start;
  for (const point of route) {
    const dx = point.x - previous.x, dy = point.y - previous.y;
    const lengthSquared = dx * dx + dy * dy;
    for (const obstacle of SANCTUARY_OBSTACLES) {
      const t = lengthSquared ? Math.max(0, Math.min(1, ((obstacle.x - previous.x) * dx + (obstacle.y - previous.y) * dy) / lengthSquared)) : 0;
      const clearance = Math.hypot(previous.x + t * dx - obstacle.x, previous.y + t * dy - obstacle.y);
      assert.ok(clearance >= obstacle.r + 22 - 1e-6, `route clears the actual collision radius at ${obstacle.id}`);
    }
    previous = point;
  }
}

test("the forest grows in world space while the camera viewport and obstacle sizes stay readable", () => {
  assert.equal(WORLD_WIDTH, 1920); assert.equal(WORLD_HEIGHT, 1140);
  assert.equal(VIEW_WIDTH, 1280); assert.equal(VIEW_HEIGHT, 760);
  assert.equal((ROOM.right - ROOM.left) * (ROOM.bottom - ROOM.top), 1128 * 618 * 2.25);
  assert.ok((PLAYER_BOUNDS.right - PLAYER_BOUNDS.left) * (PLAYER_BOUNDS.bottom - PLAYER_BOUNDS.top) > 1056 * 514 * 2.5);
  assert.equal(CALM_SECONDS, 24);
  assert.deepEqual(SANCTUARY_OBSTACLES.map(o => o.r), [22, 20, 20, 24, 26, 20, 23, 22]);
  assert.deepEqual(SANCTUARY_OBSTACLES.map(o => o.canopyRadius), [48, 42, 42, 68, 72, 42, 66, 44]);
  assert.equal(new Set(STATIONS.map(s => s.id)).size, 6);
  assert.ok(STATIONS.every(s => s.id === s.label && ["FLASHLIGHT", "FLARE", "SONAR"].includes(s.reward)));
  assert.equal(SANCTUARY_CLEARINGS.length, 6);
});

test("all shrines and clearings are inside shared bounds, with space to approach their tasks", () => {
  for (const station of STATIONS) {
    assert.deepEqual(clampWorldPoint(station.x, station.y), { x: station.x, y: station.y });
    for (const obstacle of SANCTUARY_OBSTACLES) assert.ok(Math.hypot(station.x - obstacle.x, station.y - obstacle.y) > obstacle.r + 78);
  }
  for (const clearing of SANCTUARY_CLEARINGS) assert.deepEqual(clampWorldPoint(clearing.x, clearing.y), { x: clearing.x, y: clearing.y });
  assert.deepEqual(clampWorldPoint(-100, 9000), { x: PLAYER_BOUNDS.left, y: PLAYER_BOUNDS.bottom });
  assert.deepEqual(clampWorldPoint(NaN, Infinity), CENTER);
});

test("every shrine is reachable from the courtyard through connected walkable floor", () => {
  const step = 20;
  const xs = Array.from({ length: Math.floor((PLAYER_BOUNDS.right - PLAYER_BOUNDS.left) / step) + 1 }, (_, i) => PLAYER_BOUNDS.left + i * step);
  const ys = Array.from({ length: Math.floor((PLAYER_BOUNDS.bottom - PLAYER_BOUNDS.top) / step) + 1 }, (_, i) => PLAYER_BOUNDS.top + i * step);
  const free = (col, row) => col >= 0 && col < xs.length && row >= 0 && row < ys.length && SANCTUARY_OBSTACLES.every(o => Math.hypot(xs[col] - o.x, ys[row] - o.y) > o.r + 24);
  const origin = [Math.round((CENTER.x - PLAYER_BOUNDS.left) / step), Math.round((CENTER.y - PLAYER_BOUNDS.top) / step)];
  assert.ok(free(...origin));
  const seen = new Set([origin.join(",")]), queue = [origin];
  for (let index = 0; index < queue.length; index++) {
    const [col, row] = queue[index];
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = col + dc, nr = row + dr, key = `${nc},${nr}`;
      if (!seen.has(key) && free(nc, nr)) { seen.add(key); queue.push([nc, nr]); }
    }
  }
  assert.ok(seen.size > xs.length * ys.length * .92, "only deliberate trunks occupy walkable floor");
  for (const station of STATIONS) {
    assert.ok(queue.some(([col, row]) => Math.hypot(xs[col] - station.x, ys[row] - station.y) < 60), `${station.label} has a navigable approach`);
  }
});

test("bots can route away from a legal trunk edge, and toward a tree-hugging target", () => {
  // A collision during an Ordeal can leave either actor exactly r + 22 from
  // a trunk. That position must remain connected on the next preparation trip.
  for (const obstacle of SANCTUARY_OBSTACLES) {
    for (let direction = 0; direction < 8; direction++) {
      const angle = direction * Math.PI / 4;
      const edge = { x: obstacle.x + Math.cos(angle) * (obstacle.r + 22), y: obstacle.y + Math.sin(angle) * (obstacle.r + 22) };
      for (const station of STATIONS) {
        const outward = planRoute(edge, station);
        assert.ok(outward.length, `${obstacle.id} edge ${direction} reaches ${station.id}`);
        assertRouteClear(edge, outward);
        const inward = planRoute(station, edge);
        assert.ok(inward.length, `${station.id} can approach ${obstacle.id} edge ${direction}`);
        assertRouteClear(station, inward);
      }
    }
  }
  const obstacle = SANCTUARY_OBSTACLES[1];
  assert.deepEqual(planRoute({ x: obstacle.x + obstacle.r + 21, y: obstacle.y }, STATIONS[1]), [], "a genuinely overlapping start is not considered walkable");
});

test("legal edge navigation does not bypass Rootwake chamber boundaries", () => {
  const obstacle = SANCTUARY_OBSTACLES[0];
  const start = { x: obstacle.x + obstacle.r + 22, y: obstacle.y };
  const target = { x: STATIONS[0].x, y: STATIONS[0].y + 60 };
  const route = planRoute(start, target, true);
  assert.ok(route.length);
  assertRouteClear(start, route);
  for (const point of route) {
    assert.ok(sharesRootCell(start, point));
    assert.deepEqual(keepInRootCell(start, point), point);
  }
  assert.deepEqual(planRoute(start, STATIONS[1], true), []);
  assert.deepEqual(planRoute(start, STATIONS[5], true), []);
});

test("the six Rootwake cells remain meaningful and block tunnelling across enlarged routes", () => {
  assert.deepEqual(ROOT_BARRIERS.map((wall, i) => i === 2 ? wall.h : wall.w), [36, 36, 36]);
  const points = [{ x: 375, y: 300 }, { x: 960, y: 300 }, { x: 1557, y: 300 }, { x: 375, y: 800 }, { x: 960, y: 800 }, { x: 1557, y: 800 }];
  points.forEach((origin, index) => {
    const cell = getRootCell(origin.x, origin.y);
    assert.equal(cell.index, index); assert.equal(rootCellIndex(origin), index);
    assert.ok(cell.w > 500 && cell.h > 400, "a sealed chamber still permits movement");
    for (const target of points) {
      const position = keepInRootCell(origin, target);
      assert.ok(sharesRootCell(origin, position));
      assert.deepEqual(clampWorldPoint(position.x, position.y), position);
    }
  });
});

test("roots erupting under a player resolve outside every wall, including intersections", () => {
  const insideWall = p => ROOT_BARRIERS.some(w => p.x > w.x - 30 && p.x < w.x + w.w + 30 && p.y > w.y - 30 && p.y < w.y + w.h + 30);
  for (let x = PLAYER_BOUNDS.left; x <= PLAYER_BOUNDS.right; x += 17) {
    for (let y = PLAYER_BOUNDS.top; y <= PLAYER_BOUNDS.bottom; y += 19) {
      const resolved = resolveRootPosition(x, y);
      assert.equal(insideWall(resolved), false, `roots resolve at ${x},${y}`);
      assert.deepEqual(resolveRootPosition(resolved.x, resolved.y), resolved, "root correction is idempotent");
    }
  }
});

test("floor trails are wide and their centerlines do not advertise routes through solid trunks", () => {
  for (const { points: p, width } of SANCTUARY_TRAILS) {
    assert.ok(width >= 100); assert.equal(p.length, 8);
    for (let sample = 0; sample <= 100; sample++) {
      const t = sample / 100, s = 1 - t;
      const x = s ** 3 * p[0] + 3 * s ** 2 * t * p[2] + 3 * s * t ** 2 * p[4] + t ** 3 * p[6];
      const y = s ** 3 * p[1] + 3 * s ** 2 * t * p[3] + 3 * s * t ** 2 * p[5] + t ** 3 * p[7];
      for (const obstacle of SANCTUARY_OBSTACLES) assert.ok(Math.hypot(x - obstacle.x, y - obstacle.y) > obstacle.r + 22, `trail clears ${obstacle.label}`);
    }
  }
});

test("zone callouts agree with the enlarged forest landmarks", () => {
  for (const zone of SANCTUARY_CLEARINGS) assert.equal(sanctuaryZoneName(zone.x, zone.y), zone.label);
  assert.equal(sanctuaryZoneName(CENTER.x, CENTER.y), "WARDEN COURTYARD");
  for (const station of STATIONS) assert.ok(typeof sanctuaryZoneName(station.x, station.y) === "string");
});

test("expanded background draws finite geometry and restores all Canvas state", () => {
  const stack = [], calls = [], state = { globalAlpha: 1 };
  const methods = new Set(["translate", "scale", "rotate", "beginPath", "closePath", "clip", "ellipse", "arc", "fillRect", "roundRect", "moveTo", "lineTo", "quadraticCurveTo", "bezierCurveTo", "fill", "stroke", "fillText"]);
  const record = (method, args) => {
    for (const value of args) if (typeof value === "number") assert.ok(Number.isFinite(value), `${method} uses finite geometry`);
    if (method === "ellipse") assert.ok(args[2] > 0 && args[3] > 0);
    calls.push([method, ...args]);
  };
  const ctx = new Proxy(state, {
    get(target, key) {
      if (key === "save") return () => stack.push({ ...state });
      if (key === "restore") return () => { assert.ok(stack.length); for (const property of Object.keys(state)) delete state[property]; Object.assign(state, stack.pop()); };
      if (key === "createLinearGradient" || key === "createRadialGradient") return (...args) => {
        record(key, args);
        return { addColorStop(position) { assert.ok(position >= 0 && position <= 1); } };
      };
      if (methods.has(key)) return (...args) => record(key, args);
      if (key in target) return target[key];
      throw new Error(`Unexpected Canvas operation ${String(key)}`);
    },
    set(target, key, value) { if (typeof value === "number") assert.ok(Number.isFinite(value)); target[key] = value; return true; },
  });
  drawMoonGlade(ctx);
  assert.equal(stack.length, 0); assert.deepEqual(state, { globalAlpha: 1 });
  assert.ok(calls.some(([method, x, y, width, height]) => method === "fillRect" && x === 0 && y === 0 && width === WORLD_WIDTH && height === WORLD_HEIGHT));
  for (const zone of SANCTUARY_CLEARINGS) assert.ok(calls.some(([method, label]) => method === "fillText" && label === zone.label));
  assert.ok(!calls.some(([method]) => method === "drawImage"), "native floor rendering needs no asset fetches");
});
