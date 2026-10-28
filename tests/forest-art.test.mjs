import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { drawForestObstacle, drawGroundResponse, forestCanopyAlpha, FOREST_PALETTE } from "../app/forest-art.ts";
import { SANCTUARY_OBSTACLES } from "../server/sanctuary-map.ts";
import { drawForestSanctum } from "../app/sanctum-art.ts";
import { SLIME_EYE_SCALE } from "../app/cat-art.ts";

function recorder() {
  const calls = [], stack = [], state = { globalAlpha: 1 };
  const ctx = new Proxy(state, {
    get(target, key) {
      if (key === "save") return () => stack.push({ ...state });
      if (key === "restore") return () => { assert.ok(stack.length); for (const p of Object.keys(state)) delete state[p]; Object.assign(state, stack.pop()); };
      if (key in target) return target[key];
      return (...args) => {
        for (const value of args) if (typeof value === "number") assert.ok(Number.isFinite(value), `${String(key)} has finite geometry`);
        if (key === "ellipse") assert.ok(args[2] >= 0 && args[3] >= 0 && args.length === 7);
        calls.push([key, ...args]);
        if (key === "createLinearGradient" || key === "createRadialGradient") return { addColorStop(offset, color) { assert.ok(offset >= 0 && offset <= 1); calls.push(["colorStop", offset, color]); } };
      };
    },
    set(target, key, value) { if (typeof value === "number") assert.ok(Number.isFinite(value)); target[key] = value; return true; },
  });
  return { ctx, calls, stack, state };
}

test("painterly props bake once per material/shape variant, then use two blits per frame", t => {
  const previous = globalThis.document;
  const painters = [];
  globalThis.document = { createElement(tag) { assert.equal(tag, "canvas"); const r = recorder(); painters.push(r); return { getContext: () => r.ctx }; } };
  t.after(() => { globalThis.document = previous; });
  for (const original of SANCTUARY_OBSTACLES) {
    const obs = Object.freeze({ ...original });
    const target = recorder(), before = painters.length;
    for (let frame = 0; frame < 90; frame++) drawForestObstacle(target.ctx, obs, frame / 60, { x: 0, y: 0 });
    assert.ok(painters.length - before <= 2, "not a new texture every frame");
    assert.equal(target.calls.filter(([name]) => name === "drawImage").length, 180);
    assert.equal(target.calls.filter(([name]) => name === "createLinearGradient" || name === "createRadialGradient").length, 0);
    assert.equal(target.stack.length, 0); assert.deepEqual(target.state, { globalAlpha: 1 });
    assert.deepEqual(obs, original, "rendering never moves or resizes a collider");
  }
  assert.ok(painters.length > 0 && painters.length <= SANCTUARY_OBSTACLES.length * 2);
  for (const p of painters) { assert.equal(p.stack.length, 0); assert.ok(p.calls.length > 10); }
});

test("canopies fade behind the player, reduced motion is static, and crystal glow is opt-in", t => {
  const previous = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => recorder().ctx }) };
  t.after(() => { globalThis.document = previous; });
  const tree = SANCTUARY_OBSTACLES.find(p => p.kind === "ANCIENT_TREE");
  assert.equal(forestCanopyAlpha(tree, { x: tree.x, y: tree.y - 40 }), .38);
  assert.equal(forestCanopyAlpha(tree, { x: tree.x, y: tree.y + 40 }), 1);
  const a = recorder(), b = recorder();
  drawForestObstacle(a.ctx, tree, 0, { x: 0, y: 0 }, true);
  drawForestObstacle(b.ctx, tree, 5, { x: 0, y: 0 }, true);
  assert.deepEqual(a.calls, b.calls);
  const crystal = SANCTUARY_OBSTACLES.find(p => p.kind === "CRYSTAL_SPIRE");
  const dormant = recorder(), lit = recorder();
  drawForestObstacle(dormant.ctx, crystal, 5, { x: 0, y: 0 });
  drawForestObstacle(lit.ctx, crystal, 5, { x: 0, y: 0 }, false, .6);
  assert.equal(dormant.calls.filter(([name]) => name === "createRadialGradient").length, 0);
  assert.equal(lit.calls.filter(([name]) => name === "createRadialGradient").length, 1);
});

test("surface responses distinguish water/grass, stop at rest, and honor reduced motion", () => {
  for (const [speed, reduced] of [[0, false], [200, true]]) {
    const r = recorder(); drawGroundResponse(r.ctx, 1060, 824, speed, .2, reduced); assert.equal(r.calls.length, 0);
  }
  const water = recorder(), grass = recorder();
  drawGroundResponse(water.ctx, 1060, 824, 200, .2, false);
  drawGroundResponse(grass.ctx, 960, 573, 200, .2, false);
  assert.equal(water.calls.filter(([key]) => key === "ellipse").length, 1);
  assert.equal(grass.calls.filter(([key]) => key === "quadraticCurveTo").length, 2);
  assert.deepEqual(water.state, { globalAlpha: 1 }); assert.deepEqual(grass.state, { globalAlpha: 1 });
});

test("six shrine crowns are distinct while task state remains separate from decoration", () => {
  const shapes = new Set();
  for (const label of ["FROST FONT", "STAR ALTAR", "OWL TOTEM", "EAST WARD", "MOONWELL", "ROOT SEAL"]) {
    const r = recorder();
    const station = Object.freeze({ x: 0, y: 0, pulse: 0, label, reward: "SONAR", completed: false });
    drawForestSanctum(r.ctx, station, 2, false, false);
    shapes.add(JSON.stringify(r.calls)); assert.deepEqual(r.state, { globalAlpha: 1 });
    assert.equal(station.completed, false);
  }
  assert.ok(shapes.size >= 5, "Frost Font and East Ward intentionally share the font family");
});

test("portrait and arena share smaller eyes and new surface effects cannot leak Ordeal identities", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const portrait = await readFile(new URL("../app/cat-portrait.tsx", import.meta.url), "utf8");
  const material = await readFile(new URL("../app/cat-art.ts", import.meta.url), "utf8");
  assert.equal(SLIME_EYE_SCALE, .84);
  assert.match(portrait, /scale\(\$\{SLIME_EYE_SCALE\}\)/);
  assert.match(material, /ctx\.scale\(SLIME_EYE_SCALE, SLIME_EYE_SCALE\)/);
  assert.match(page, /this\.phase === "CALM" && !silhouette && !colorMuted[^)]*\) \{\s*drawGroundResponse/);
  assert.match(page, /drawForestObstacle\(ctx, obs, this\.elapsed, this\.human, this\.reducedMotion/);
  // Medium-value, blue-teal forest soil: not the old washed-out gray floor,
  // nor near-black ground that would obscure dark characters.
  for (const color of [FOREST_PALETTE.floorLight, FOREST_PALETTE.floorMid, FOREST_PALETTE.floorShade]) {
    const rgb = color.match(/[a-f\d]{2}/gi).map(v => parseInt(v, 16));
    const value = rgb.reduce((a, b) => a + b) / 3;
    assert.ok(value >= 60 && value <= 125);
    assert.ok(rgb[2] >= rgb[0] && rgb[1] >= rgb[0], "cool soil supports cyan mushrooms");
  }
});

test("prop texture memory is bounded across many differently shaped room layouts", t => {
  const previous = globalThis.document;
  let painted = 0;
  globalThis.document = { createElement: () => { painted++; return { getContext: () => recorder().ctx }; } };
  t.after(() => { globalThis.document = previous; });
  const original = SANCTUARY_OBSTACLES[0], target = recorder();
  const first = { ...original, id: "cache-budget-first", canopyHeight: 111 };
  drawForestObstacle(target.ctx, first, 0, { x: 0, y: 0 });
  for (let i = 0; i < 40; i++) drawForestObstacle(target.ctx, { ...original, canopyHeight: 150 + i }, 0, { x: 0, y: 0 });
  const before = painted;
  drawForestObstacle(target.ctx, first, 0, { x: 0, y: 0 });
  assert.equal(painted - before, 2, "oldest material was evicted instead of retaining every previous room forever");
  drawForestObstacle(target.ctx, first, 1, { x: 0, y: 0 });
  assert.equal(painted - before, 2, "the active room still reuses its cached material");
});
