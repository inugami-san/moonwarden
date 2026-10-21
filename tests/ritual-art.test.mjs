import assert from "node:assert/strict";
import test from "node:test";
import { drawForestSanctum, drawSanctumStatus, sanctumPulse, SANCTUM_PULSE_SECONDS } from "../app/sanctum-art.ts";

function canvasRecorder() {
  const calls = [], stack = [], state = { globalAlpha: 1 };
  const methods = new Set(["translate", "scale", "beginPath", "closePath", "ellipse", "arc", "fillRect", "moveTo", "lineTo", "quadraticCurveTo", "bezierCurveTo", "fill", "stroke", "fillText", "strokeText"]);
  const record = (method, args) => {
    for (const value of args) if (typeof value === "number") assert.ok(Number.isFinite(value), `${method} has finite coordinates`);
    if (method === "arc") assert.ok(args[2] >= 0);
    if (method === "ellipse") assert.ok(args[2] >= 0 && args[3] >= 0);
    calls.push([method, ...args]);
  };
  const ctx = new Proxy(state, {
    get(target, key) {
      if (key === "save") return () => stack.push({ ...state });
      if (key === "restore") return () => {
        assert.ok(stack.length, "balanced Canvas state");
        for (const property of Object.keys(state)) delete state[property];
        Object.assign(state, stack.pop());
      };
      if (key === "createLinearGradient" || key === "createRadialGradient") return (...args) => {
        record(key, args);
        return { addColorStop(position, color) { assert.ok(position >= 0 && position <= 1); calls.push(["colorStop", position, color]); } };
      };
      if (methods.has(key)) return (...args) => record(key, args);
      if (key in target) return target[key];
      throw new Error(`Unmocked Canvas operation: ${String(key)}`);
    },
    set(target, key, value) {
      if (typeof value === "number") assert.ok(Number.isFinite(value));
      target[key] = value;
      calls.push([String(key), value]);
      return true;
    },
  });
  return { ctx, calls, stack, state };
}

const shrine = Object.freeze({ x: 375, y: 156, pulse: 1.2, completed: false, teamRestored: true, label: "FROST FONT", reward: "FLASHLIGHT" });
const text = recorder => recorder.calls.filter(([method]) => method === "fillText").map(([, value]) => value);

test("a shared restored shrine advertises a personal gear rite, never a globally sealed task", () => {
  const recorder = canvasRecorder();
  drawSanctumStatus(recorder.ctx, shrine, 20, false, true);
  assert.ok(text(recorder).includes("GEAR READY"));
  assert.ok(text(recorder).includes("E · PERSONAL RITE"));
  assert.ok(!text(recorder).includes("SEALED"));
  assert.ok(!text(recorder).includes("TASK READY"));
  assert.ok(!text(recorder).some(value => /player|impostor|contributor/i.test(value)));
});

test("shared restoration keeps roots open while local reward claim seals only that warden's rite", () => {
  const restored = canvasRecorder();
  drawForestSanctum(restored.ctx, shrine, 20, false, true);
  assert.ok(restored.calls.some(call => JSON.stringify(call) === JSON.stringify(["bezierCurveTo", 24, 24, 44, -7, 35, -25])), "available roots remain open");
  assert.ok(!restored.calls.some(call => JSON.stringify(call) === JSON.stringify(["bezierCurveTo", 24, 6, 4, -6, -8, -24])), "no foreground seal covers an unclaimed rune");

  const claimed = canvasRecorder();
  drawForestSanctum(claimed.ctx, { ...shrine, completed: true }, 20, false, true);
  drawSanctumStatus(claimed.ctx, { ...shrine, completed: true }, 20, false, true);
  assert.ok(claimed.calls.some(call => JSON.stringify(call) === JSON.stringify(["bezierCurveTo", 24, 6, 4, -6, -8, -24])));
  assert.ok(text(claimed).includes("SEALED"));
  assert.ok(text(claimed).includes("REOPENS NEXT CALM"));
  assert.ok(!text(claimed).some(value => value.includes("INTERACT") || value.includes("PERSONAL RITE")));
});

test("shared restoration leaves a steady crown rune and flowers without hiding available fireflies", () => {
  const first = canvasRecorder(), later = canvasRecorder();
  drawForestSanctum(first.ctx, shrine, 20, false, false);
  drawForestSanctum(later.ctx, shrine, 21, false, false);
  for (const recorder of [first, later]) {
    assert.ok(recorder.calls.some(([method, color]) => method === "strokeStyle" && color === "#e8dcba"));
    assert.ok(recorder.calls.some(([method, color]) => method === "fillStyle" && color === "#d3d4ae"));
    assert.ok(recorder.calls.some(([method, x, y, radius]) => method === "arc" && x === 13 && y === -40 && radius === 1.5));
  }
  assert.notDeepEqual(first.calls, later.calls, "unclaimed task fireflies still move");
  const distant = canvasRecorder();
  drawSanctumStatus(distant.ctx, shrine, 20, false, false);
  assert.deepEqual(distant.calls, [], "shared restoration does not clutter the whole map with personal prompts");
});

test("a temporary shrine lock wins over a shared-restoration prompt without claiming the rite", () => {
  const recorder = canvasRecorder();
  drawSanctumStatus(recorder.ctx, shrine, 20, true, true);
  assert.ok(text(recorder).includes("LOCKED"));
  assert.ok(text(recorder).includes("SHRINE RESTING"));
  assert.ok(!text(recorder).includes("GEAR READY"));
  assert.ok(!text(recorder).includes("SEALED"));
  assert.equal(shrine.completed, false);
});

test("all rewards retain safe rendering and backward-compatible optional restoration state", () => {
  for (const teamRestored of [undefined, false, true]) for (const completed of [false, true]) for (const locked of [false, true]) for (const nearby of [false, true]) for (const reward of ["FLASHLIGHT", "FLARE", "SONAR"]) {
    const station = Object.freeze({ ...shrine, teamRestored, completed, reward, completedAt: 10, rootClosure: locked ? 1 : 0 });
    const recorder = canvasRecorder();
    drawForestSanctum(recorder.ctx, station, 10.25, locked, nearby);
    drawSanctumStatus(recorder.ctx, station, 10.25, locked, nearby);
    assert.equal(recorder.stack.length, 0);
    assert.deepEqual(recorder.state, { globalAlpha: 1 });
    assert.equal(station.completed, completed);
    assert.equal(station.teamRestored, teamRestored);
  }
  const legacy = canvasRecorder();
  const legacyShrine = { ...shrine };
  delete legacyShrine.teamRestored;
  drawSanctumStatus(legacy.ctx, legacyShrine, 20, false, true);
  assert.ok(text(legacy).includes("TASK READY"));
  assert.ok(text(legacy).includes("E · INTERACT"));
});

test("both completion kinds retain the same short, local, purely visual half-second pulse", () => {
  assert.equal(SANCTUM_PULSE_SECONDS, 0.5);
  assert.ok(sanctumPulse(10.499, 10));
  assert.equal(sanctumPulse(10.5, 10), null);
  for (const completed of [false, true]) {
    const recorder = canvasRecorder();
    drawForestSanctum(recorder.ctx, { ...shrine, completed, completedAt: 10 }, 10.25, false, true);
    const expected = sanctumPulse(10.25, 10);
    assert.ok(expected.radius <= 58);
    assert.ok(recorder.calls.some(([method, x, y, radius]) => method === "arc" && x === 0 && y === 0 && radius === expected.radius));
  }
});
