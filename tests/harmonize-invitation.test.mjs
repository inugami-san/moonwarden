import assert from "node:assert/strict";
import test from "node:test";
import { drawHarmonizeInvitation, HARMONIZE_INVITATION_BOUNDS } from "../app/harmonize-invitation.ts";

function canvasRecorder() {
  const calls = [], stack = [], state = { globalAlpha: .75 };
  const methods = new Set(["translate", "beginPath", "ellipse", "arc", "moveTo", "lineTo", "quadraticCurveTo", "bezierCurveTo", "fill", "stroke", "fillText", "strokeText"]);
  const ctx = new Proxy(state, {
    get(target, key) {
      if (key === "save") return () => stack.push({ ...state });
      if (key === "restore") return () => {
        assert.ok(stack.length, "balanced Canvas state");
        for (const property of Object.keys(state)) delete state[property];
        Object.assign(state, stack.pop());
      };
      if (methods.has(key)) return (...args) => {
        for (const value of args) if (typeof value === "number") assert.ok(Number.isFinite(value), `${key} coordinates must be finite`);
        if (key === "arc") assert.ok(args[2] >= 0);
        if (key === "ellipse") assert.ok(args[2] >= 0 && args[3] >= 0);
        calls.push([key, ...args]);
      };
      if (key in target) return target[key];
      throw new Error(`Unexpected Canvas operation: ${String(key)}`);
    },
    set(target, key, value) {
      if (typeof value === "number") assert.ok(Number.isFinite(value));
      target[key] = value; calls.push([key, value]); return true;
    },
  });
  return { ctx, calls, stack, state };
}

const shrine = Object.freeze({ x: 375, y: 156 });
const labels = recorder => recorder.calls.filter(([method]) => method === "fillText").map(([, value]) => value);
function render(state, elapsed = 20, reducedMotion = false) {
  const recorder = canvasRecorder();
  drawHarmonizeInvitation(recorder.ctx, shrine, Object.freeze(state), elapsed, reducedMotion);
  assert.equal(recorder.stack.length, 0);
  assert.deepEqual(recorder.state, { globalAlpha: .75 });
  return recorder;
}

test("the unjoined invitation is two quiet physical rune pads without repeated instructions", () => {
  const recorder = render({ participating: false });
  assert.deepEqual(labels(recorder), []);
  for (const x of [-39, 39]) {
    assert.ok(recorder.calls.some(([method, px, py, rx, ry]) => method === "ellipse" && px === x && py === 37 && rx === 16 && ry === 8.5));
  }
  assert.ok(HARMONIZE_INVITATION_BOUNDS.left > -84 && HARMONIZE_INVITATION_BOUNDS.right < 84);
  assert.equal(HARMONIZE_INVITATION_BOUNDS.bottom, 64);
  assert.ok(recorder.calls.length < 180, "small bounded vector drawing");
});

test("private remote counts and turns are ignored when the local player is not participating", () => {
  const blank = render({ participating: false });
  const remote = render({ participating: false, participants: 2, beats: 3, rune: 1, yourTurn: false });
  assert.deepEqual(remote.calls, blank.calls);
  assert.ok(!labels(remote).some(label => /companion|player|hollow|warden|impostor|crewmate/i.test(label)));
});

test("a single local voice invites a companion and only the vacant pad softly pulses", () => {
  const first = render({ participating: true, participants: 1 }, 0);
  const later = render({ participating: true, participants: 1 }, .5);
  assert.deepEqual(labels(first), ["WAITING FOR PARTNER"]);
  const halo = first.calls.filter(([method, , , rx]) => method === "ellipse" && rx === 19);
  assert.equal(halo.length, 1);
  assert.equal(halo[0][1], 39, "only the vacant second place pulses");
  assert.notDeepEqual(first.calls, later.calls);
});

test("a joined duet gets one private turn cue, with no repeated count or risk labels", () => {
  for (const rune of [0, 1]) {
    const yours = render({ participating: true, participants: 2, rune, yourTurn: true, beats: 1 });
    const theirs = render({ participating: true, participants: 2, rune, yourTurn: false, beats: 1 });
    assert.deepEqual(labels(yours), [rune === 0 ? "YOUR TURN · SUN J" : "YOUR TURN · MOON K"]);
    assert.deepEqual(labels(theirs), ["PARTNER'S TURN"]);
    const ring = yours.calls.filter(([method, , , radius]) => method === "ellipse" && radius === 19);
    assert.equal(ring.length, 1);
    assert.equal(ring[0][1], rune === 0 ? -39 : 39);
  }
  assert.deepEqual(labels(render({ participating: true, participants: 2, beats: 4, rune: 0, yourTurn: true })), ["HOLD STILL"]);
  for (const participating of [false, true]) for (const participants of [0, 1, 2]) {
    const text = labels(render({ participating, participants, rune: 0, yourTurn: true }));
    assert.ok(text.length <= 1);
    assert.ok(text.every(label => !/READY|AUDIBLE|MIN|H TO LEAVE|JOIN DUET/.test(label)));
  }
});

test("reduced motion is fully static, and completed notes do not keep flashing a rune", () => {
  const state = { participating: true, participants: 1 };
  assert.deepEqual(render(state, 0, true).calls, render(state, 100, true).calls);
  const complete = render({ participating: true, participants: 2, beats: 4, rune: 0, yourTurn: true });
  assert.ok(!complete.calls.some(([method, , , radius]) => method === "ellipse" && radius === 19));
});

test("invalid optional state stays finite, clamped, and honest instead of inventing a companion", () => {
  for (const participants of [undefined, NaN, Infinity, -2, 0, .5, 1, 1.9, 2, 8]) {
    const recorder = render({ participating: true, participants, beats: NaN, rune: Infinity }, NaN);
    assert.equal(labels(recorder).length, 1);
    assert.ok(["WAITING FOR PARTNER", "TAKE TURNS"].includes(labels(recorder)[0]));
    assert.ok(!labels(recorder).some(label => label.startsWith("YOUR TURN")));
  }
  assert.equal(labels(render({ participating: true, participants: NaN }))[0], "WAITING FOR PARTNER");
  for (const point of [{ x: NaN, y: 0 }, { x: 0, y: Infinity }]) {
    const recorder = canvasRecorder();
    drawHarmonizeInvitation(recorder.ctx, point, { participating: false }, 0);
    assert.deepEqual(recorder.calls, []);
  }
});
