import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { drawRestorationGarden, restorationTier } from "../app/restoration-art.ts";
import { PAIR_RITUAL_SECONDS } from "../server/pair-ritual.ts";
import { TASK_HOLD_SECONDS } from "../app/task-hold.ts";

test("forest recovery uses the 25/50/75 public milestones and clamps malformed progress", () => {
  for (const [value, tier] of [[0, 0], [24.99, 0], [25, 1], [50, 2], [75, 3], [100, 3], [500, 3], [-1, 0], [NaN, 0]]) assert.equal(restorationTier(value), tier);
});

test("garden patches bake once per tier, stay role-blind and keep reduced-motion scenery still", t => {
  const original = globalThis.document;
  let baked = 0;
  const painter = () => {
    const calls = [], state = { globalAlpha: 1 }, stack = [];
    const ctx = new Proxy(state, {
      get(target, name) {
        if (name === "save") return () => stack.push({ ...state });
        if (name === "restore") return () => { assert.ok(stack.length); for (const key of Object.keys(state)) delete state[key]; Object.assign(state, stack.pop()); };
        if (name in target) return target[name];
        return (...args) => { for (const arg of args) if (typeof arg === "number") assert.ok(Number.isFinite(arg)); calls.push([name, ...args]); };
      }, set(target, name, value) { target[name] = value; return true; },
    });
    return { ctx, calls, stack };
  };
  globalThis.document = { createElement: () => { baked++; return { getContext: () => painter().ctx }; } };
  t.after(() => { globalThis.document = original; });
  const stations = Object.freeze([Object.freeze({ x: 300, y: 300 }), Object.freeze({ x: 800, y: 600 })]);
  const empty = painter(); drawRestorationGarden(empty.ctx, stations, 0, 0);
  assert.equal(baked, 0); assert.equal(empty.calls.length, 0);
  for (const progress of [25, 50, 75]) {
    const a = painter(), b = painter();
    drawRestorationGarden(a.ctx, stations, progress, 1, true);
    drawRestorationGarden(b.ctx, stations, progress, 100, true);
    assert.deepEqual(a.calls, b.calls);
    assert.equal(a.stack.length, 0);
    assert.equal(a.calls.filter(([name]) => name === "drawImage").length, 4);
  }
  assert.equal(baked, 3);
  for (let frame = 0; frame < 100; frame++) drawRestorationGarden(painter().ctx, stations, 75, frame);
  assert.equal(baked, 3, "only three cached patches, not one allocation per shrine/frame");
});

test("Harmonize explains its alternating-note, exposed and noisy bargain", async () => {
  assert.equal(PAIR_RITUAL_SECONDS, 3);
  const controls = await readFile(new URL("../app/gameplay-controls.tsx", import.meta.url), "utf8");
  assert.match(controls, /<details className="play-control-guide">/);
  assert.match(controls, /take turns.*at least \{PAIR_RITUAL_SECONDS\}s/);
  assert.match(controls, /audible nearby; a Hollow can join too/);
  assert.match(controls, /Both earn gear faster/);
  const art = await readFile(new URL("../app/restoration-art.ts", import.meta.url), "utf8");
  assert.doesNotMatch(art, /role|fl[a]res.push|SOUND_CUE|sightAt|Math.random/);
});
