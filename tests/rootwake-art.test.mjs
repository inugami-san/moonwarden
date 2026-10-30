import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ROOT_BARRIERS, getRootCell } from "../server/sanctuary-map.ts";
import { ROOT_GATES, ROOT_GATE_Y, rootwakeEnvelope } from "../server/sanctuary-design.ts";
import { drawRootwakeWalls, drawRootwakeChamber, rootwakePose, ROOTWAKE_KNOTS } from "../app/rootwake-art.ts";

function recorder() {
  const calls = [], stack = [], state = { globalAlpha: 1 };
  const record = (method, args) => {
    for (const value of args) if (typeof value === "number") assert.ok(Number.isFinite(value), `${method}: finite geometry`);
    if (method === "ellipse") assert.ok(args[2] >= 0 && args[3] >= 0);
    calls.push([method, ...args]);
  };
  const ctx = new Proxy(state, {
    get(target, key) {
      if (key === "save") return () => stack.push({ ...state });
      if (key === "restore") return () => { assert.ok(stack.length); for (const name of Object.keys(state)) delete state[name]; Object.assign(state, stack.pop()); };
      if (key === "createLinearGradient" || key === "createRadialGradient") return (...args) => { record(key, args); return { addColorStop(position) { assert.ok(position >= 0 && position <= 1); } }; };
      if (key in target) return target[key];
      return (...args) => record(key, args);
    },
    set(target, key, value) { if (typeof value === "number") assert.ok(Number.isFinite(value)); target[key] = value; return true; },
  });
  return { ctx, calls, stack, state };
}
const frame = changes => ({ phase: "ORDEAL", remaining: 10, reducedMotion: false, hollow: false, ...changes });

test("root knots are deterministic, immutable and anchored along the actual three colliders", () => {
  assert.ok(Object.isFrozen(ROOTWAKE_KNOTS));
  assert.ok(ROOTWAKE_KNOTS.length < 80);
  ROOT_BARRIERS.forEach((wall, barrier) => {
    const knots = ROOTWAKE_KNOTS.filter(knot => knot.barrier === barrier);
    assert.ok(knots.length > 10);
    for (const knot of knots) {
      assert.ok(Object.isFrozen(knot));
      assert.ok(knot.x >= wall.x && knot.x <= wall.x + wall.w);
      assert.ok(knot.y >= wall.y && knot.y <= wall.y + wall.h);
      assert.ok(knot.delay <= .1);
      assert.ok(knot.variant >= 0 && knot.variant < 8);
    }
  });
});

test("all roots reach full size before collision activates and only shrink after collision releases", () => {
  for (const knot of ROOTWAKE_KNOTS) for (let age = .54; age < 12; age += .03) {
    const remaining = 12 - age, pose = rootwakePose(remaining, knot.delay);
    assert.equal(pose.opacity, rootwakeEnvelope(remaining));
    if (pose.opacity > .72) assert.equal(pose.growth, 1, `visible wall while blocking at ${age}`);
  }
  assert.ok(rootwakePose(11.75).growth > rootwakePose(11.95).growth);
  assert.ok(rootwakePose(.05).growth < rootwakePose(.3).growth);
  for (const time of [NaN, Infinity, -Infinity, 0, -1, 13]) assert.deepEqual(rootwakePose(time), { opacity: 0, growth: 0, dust: 0, lift: 0 });
});

test("warning, eruption, held roots, doors and retraction render finite geometry with balanced state", () => {
  for (const remaining of [.01, .2, .4, 1, 5.99, 6, 6.01, 11.6, 11.9, 12]) for (const hollow of [false, true]) for (const reducedMotion of [false, true]) {
    const draw = recorder(); drawRootwakeWalls(draw.ctx, frame({ remaining, hollow, reducedMotion }));
    assert.equal(draw.stack.length, 0);
    assert.deepEqual(draw.state, { globalAlpha: 1 });
    assert.ok(!draw.calls.some(([method]) => method === "fillText" || method === "strokeRect"));
  }
  const warning = recorder(); drawRootwakeWalls(warning.ctx, frame({ phase: "COUNTDOWN", remaining: 2 }));
  assert.ok(warning.calls.some(([method]) => method === "lineTo"));
  assert.ok(!warning.calls.some(([method]) => method === "drawImage"));
  for (const remaining of [NaN, -1, 0, 13]) {
    const draw = recorder(); drawRootwakeWalls(draw.ctx, frame({ remaining })); assert.equal(draw.calls.length, 0);
  }
  const calm = recorder(); drawRootwakeWalls(calm.ctx, frame({ phase: "CALM" })); assert.equal(calm.calls.length, 0);
});

test("door cutouts match the existing authoritative timing and full 128px passages", () => {
  for (const remaining of [6.01, 6, 5.75, .1]) {
    const draw = recorder(); drawRootwakeWalls(draw.ctx, frame({ remaining }));
    const clips = draw.calls.filter(([method]) => method === "clip");
    assert.equal(clips.length, remaining > 6 ? 0 : 1);
    if (remaining <= 6) {
      assert.deepEqual(clips, [["clip", "evenodd"]]);
      for (const x of ROOT_GATES) assert.ok(draw.calls.some(call => JSON.stringify(call) === JSON.stringify(["rect", x - 64, ROOT_GATE_Y - 60, 128, 120])));
    }
  }
});

test("Warden occlusion retains the exact own-cell hole and darkness, without a glowing rectangular border", () => {
  for (const observer of [{ x: 400, y: 350 }, { x: 960, y: 800 }, { x: 1500, y: 350 }]) {
    const draw = recorder(), cell = getRootCell(observer.x, observer.y);
    drawRootwakeChamber(draw.ctx, observer, 10);
    assert.ok(draw.calls.some(call => JSON.stringify(call) === JSON.stringify(["rect", cell.x, cell.y, cell.w, cell.h])));
    assert.ok(draw.calls.some(([method, mode]) => method === "fill" && mode === "evenodd"));
    assert.equal(draw.calls.filter(([method]) => method === "createLinearGradient").length, 4);
    assert.ok(!draw.calls.some(([method]) => method === "strokeRect"));
    assert.deepEqual(draw.state, { globalAlpha: 1 });
    assert.equal(draw.stack.length, 0);
  }
});

test("cached bark variants stay bounded and offscreen knots are culled", t => {
  const original = globalThis.document; let bakes = 0;
  globalThis.document = { createElement() { bakes++; return { getContext: () => recorder().ctx }; } };
  t.after(() => { globalThis.document = original; });
  const all = recorder(); drawRootwakeWalls(all.ctx, frame());
  assert.equal(bakes, 8);
  assert.equal(all.calls.filter(([method]) => method === "drawImage").length, ROOTWAKE_KNOTS.length);
  const cropped = recorder(); drawRootwakeWalls(cropped.ctx, frame({ view: { x: 500, y: 300, width: 300, height: 220 } }));
  assert.ok(cropped.calls.filter(([method]) => method === "drawImage").length < ROOTWAKE_KNOTS.length / 2);
  for (let i = 0; i < 120; i++) drawRootwakeWalls(recorder().ctx, frame({ remaining: 10 - i / 30 }));
  assert.equal(bakes, 8, "textures are not re-created every animation frame");
});

test("reduced motion has no lift, eruption debris, drifting spores, or ongoing idle pulses", () => {
  const a = recorder(), b = recorder();
  drawRootwakeWalls(a.ctx, frame({ remaining: 10, reducedMotion: true }));
  drawRootwakeWalls(b.ctx, frame({ remaining: 8, reducedMotion: true }));
  assert.deepEqual(a.calls, b.calls);
  assert.equal(rootwakePose(11.75, .1, true).lift, 0);
  assert.equal(rootwakePose(11.75, .1, true).dust, 0);
});

test("live rendering uses the new art without changing masks, authority, lights or labels", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const art = await readFile(new URL("../app/rootwake-art.ts", import.meta.url), "utf8");
  assert.match(page, /drawRootwakeChamber\(ctx, this.human, this.phaseTime\)/);
  assert.match(page, /drawRootwakeWalls\(ctx, \{/);
  assert.doesNotMatch(art, /Math.random|fillText|strokeRect|shadowBlur|setTimeout|requestAnimationFrame|players|bodies|\.push\(/);
  const preview = await readFile(new URL("../app/dev/rootwake/page.tsx", import.meta.url), "utf8");
  assert.match(preview, /process.env.NODE_ENV !== "development"\) notFound\(\)/);
});
