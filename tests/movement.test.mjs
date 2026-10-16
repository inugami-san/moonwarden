import assert from "node:assert/strict";
import test from "node:test";
import { MovementBuffer } from "../app/movement.ts";

const movement = (x, vx = 100) => ({ id: "guest", x, y: 180, vx, vy: 0, angle: 0, alive: true, flashlight: false });

test("snapshot interpolation handles jitter without overshooting a stopping player", () => {
  const buffer = new MovementBuffer();
  buffer.push([movement(200)], 1000, 1100);
  buffer.push([movement(205)], 1050, 1170);
  buffer.push([movement(210, 0)], 1100, 1200);
  const halfway = buffer.sample("guest", 1225);
  assert.ok(halfway.x >= 202 && halfway.x <= 203);
  assert.equal(buffer.sample("guest", 1400).x, 210);
});

test("prediction is capped during packet loss, and stale packets cannot rewind motion", () => {
  const buffer = new MovementBuffer();
  buffer.push([movement(300)], 1000, 1100);
  buffer.push([movement(200)], 950, 1150);
  assert.equal(buffer.sample("guest", 2000).x, 310);
  assert.equal(buffer.sample("guest", 10_000).x, 310);
});

test("teleports, deaths, and removed players never drift across the arena", () => {
  const buffer = new MovementBuffer();
  buffer.push([movement(200)], 1000, 1100);
  buffer.push([{ ...movement(900), alive: false }], 1050, 1150);
  assert.equal(buffer.sample("guest", 1200).x, 900);
  assert.equal(buffer.sample("guest", 9000).x, 900);
  buffer.remove("guest");
  assert.equal(buffer.sample("guest", 9000), undefined);
});
