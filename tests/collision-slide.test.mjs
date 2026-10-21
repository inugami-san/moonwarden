import assert from "node:assert/strict";
import test from "node:test";
import { resolveObstacleMovement, resolveObstaclePosition } from "../server/ordeal-rules.ts";
import { CENTER, SANCTUARY_OBSTACLES, keepInRootCell } from "../server/sanctuary-map.ts";
import { GameServerRegistry } from "../server/game-room.ts";

const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-8, message ?? `${actual} != ${expected}`);
const obstacle = SANCTUARY_OBSTACLES[1];
const radius = obstacle.r + 22;

test("trunk contacts remove inward velocity but retain a smooth tangent", () => {
  const motion = resolveObstacleMovement(obstacle.x + radius - 1, obstacle.y, -80, 120);
  close(motion.x, obstacle.x + radius);
  close(motion.y, obstacle.y);
  close(motion.vx, 0);
  close(motion.vy, 120);
  assert.deepEqual({ x: motion.x, y: motion.y }, resolveObstaclePosition(obstacle.x + radius - 1, obstacle.y));
});

test("glancing diagonal contacts keep tangential speed instead of damping both axes", () => {
  const angle = Math.PI / 4;
  const nx = Math.cos(angle), ny = Math.sin(angle);
  const motion = resolveObstacleMovement(obstacle.x + nx * (radius - 1), obstacle.y + ny * (radius - 1), -150, 30);
  close(Math.hypot(motion.x - obstacle.x, motion.y - obstacle.y), radius);
  close(motion.vx * nx + motion.vy * ny, 0);
  close(motion.vx, -90);
  close(motion.vy, 90);
});

test("directly blocked movement stops while outward and exact-tangent movement remain free", () => {
  const stopped = resolveObstacleMovement(obstacle.x + radius, obstacle.y, -184, 0);
  close(stopped.vx, 0); close(stopped.vy, 0);
  const outward = resolveObstacleMovement(obstacle.x + radius, obstacle.y, 100, 60);
  close(outward.vx, 100); close(outward.vy, 60);
  const tangent = resolveObstacleMovement(obstacle.x + radius, obstacle.y, 0, 140);
  close(tangent.vx, 0); close(tangent.vy, 140);
});

test("every visible base remains solid, including zero-distance corrections", () => {
  for (const base of SANCTUARY_OBSTACLES) {
    const origin = { x: base.x, y: base.y, vx: -184, vy: 0 };
    const before = { ...origin };
    const motion = resolveObstacleMovement(origin.x, origin.y, origin.vx, origin.vy);
    assert.deepEqual(origin, before, "resolution is pure");
    close(motion.x, base.x + base.r + 22);
    close(motion.y, base.y);
    close(motion.vx, 0);
    assert.ok(SANCTUARY_OBSTACLES.every(other => Math.hypot(motion.x - other.x, motion.y - other.y) >= other.r + 22 - 1e-8));
  }
});

test("non-finite input has safe finite defaults and velocity never exceeds normal movement speed", () => {
  const invalid = resolveObstacleMovement(NaN, Infinity, -Infinity, NaN, NaN);
  assert.deepEqual(invalid, { x: CENTER.x, y: CENTER.y, vx: 0, vy: 0 });
  for (const [vx, vy] of [[184, 184], [10000, 3000], [Number.MAX_VALUE, Number.MAX_VALUE], [0, 0]]) {
    const motion = resolveObstacleMovement(CENTER.x, CENTER.y, vx, vy);
    assert.ok(Object.values(motion).every(Number.isFinite));
    assert.ok(Math.hypot(motion.vx, motion.vy) <= 184 + 1e-8);
  }
});

test("shared obstacle resolution cannot move a root-constrained point to another chamber", () => {
  const before = { x: 600, y: 350 };
  const root = keepInRootCell(before, { x: 1400, y: 900 });
  const motion = resolveObstacleMovement(root.x, root.y, 0, 0);
  assert.equal(motion.x, root.x);
  assert.equal(motion.y, root.y);
});

test("room authority uses the same tangent and stops motion against Rootwake and world edges", () => {
  const registry = new GameServerRegistry();
  const room = registry.createRoom();
  const socket = { readyState: 1, send() {}, close() {} };
  room.addClient("slide-host", socket, "Host", "#20d8ed", "hood");
  const player = room.players.get("slide-host");
  room.state = "PLAYING";
  room.phase = "CALM";
  player.role = "CREWMATE";
  const send = (x, y, vx, vy, seq) => room.handleMessage(player.id, { type: "PLAYER_INPUT", x, y, vx, vy, angle: 0, flashlight: false, seq });
  send(obstacle.x + radius - 1, obstacle.y, -80, 120, 1);
  close(player.vx, 0); close(player.vy, 120);
  close(player.x, obstacle.x + radius);

  player.x = 600; player.y = 350;
  room.phase = "ORDEAL"; room.hazard = "ROOTWAKE"; room.phaseTime = 5;
  send(1400, 350, 184, 0, 2);
  assert.ok(player.x < 648);
  close(player.vx, 0);

  room.phase = "CALM";
  send(10000, 10000, 184, 184, 3);
  close(player.vx, 0); close(player.vy, 0);
});

test("Rootwalk still bypasses solid roots and trunks without exceeding the movement speed cap", () => {
  const registry = new GameServerRegistry();
  const room = registry.createRoom();
  room.addClient("rootwalk-host", { readyState: 1, send() {}, close() {} }, "Host", "#20d8ed", "hood");
  const player = room.players.get("rootwalk-host");
  player.role = "IMPOSTOR";
  room.state = "PLAYING"; room.phase = "ORDEAL"; room.hazard = "ROOTWAKE"; room.phaseTime = 5;
  room.handleMessage(player.id, { type: "PLAYER_INPUT", x: obstacle.x, y: obstacle.y, vx: 184, vy: 184, angle: 0, flashlight: false, seq: 1 });
  close(player.x, obstacle.x); close(player.y, obstacle.y);
  close(Math.hypot(player.vx, player.vy), 184);
});
