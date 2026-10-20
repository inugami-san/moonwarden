import assert from "node:assert/strict";
import test from "node:test";
import { ForestAudio } from "../app/forest-audio.ts";
import { HEARING_RANGE } from "../server/ordeal-rules.ts";

class FakeParam {
  value = 0;
  events = [];
  setValueAtTime(value, at) { this.value = value; this.events.push(["set", value, at]); }
  linearRampToValueAtTime(value, at) { this.events.push(["linear", value, at]); }
  exponentialRampToValueAtTime(value, at) { assert.ok(value > 0); this.events.push(["exponential", value, at]); }
  cancelScheduledValues(at) { this.events.push(["cancel", at]); }
}
class FakeNode {
  disconnected = false;
  outputs = [];
  constructor(context, kind) { this.kind = kind; context.nodes.push(this); }
  connect(target) { this.outputs.push(target); return target; }
  disconnect() { this.disconnected = true; this.outputs.length = 0; }
}
class FakeSource extends FakeNode {
  onended = null;
  stops = [];
  frequency = new FakeParam();
  start(at) { this.startAt = at; }
  stop(at) { this.stops.push(at); }
}
class FakeAudioContext {
  static instances = [];
  state = "suspended";
  currentTime = 10;
  sampleRate = 48000;
  nodes = [];
  destination = { kind: "destination" };
  constructor() { FakeAudioContext.instances.push(this); }
  async resume() { this.state = "running"; }
  async close() { this.state = "closed"; }
  createGain() { const node = new FakeNode(this, "gain"); node.gain = new FakeParam(); return node; }
  createOscillator() { return new FakeSource(this, "oscillator"); }
  createBufferSource() { return new FakeSource(this, "noise"); }
  createBiquadFilter() {
    const node = new FakeNode(this, "filter"); node.frequency = new FakeParam(); return node;
  }
  createPanner() {
    const node = new FakeNode(this, "panner"); node.positionX = new FakeParam(); node.positionZ = new FakeParam(); return node;
  }
  createBuffer(_channels, length) { return { getChannelData: () => new Float32Array(length) }; }
  finish() {
    for (const node of this.nodes) if (node instanceof FakeSource) node.onended?.();
    this.currentTime += 3;
  }
}

function install(t, Context = FakeAudioContext) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "AudioContext");
  Object.defineProperty(globalThis, "AudioContext", { configurable: true, writable: true, value: Context });
  FakeAudioContext.instances.length = 0;
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "AudioContext", previous);
    else delete globalThis.AudioContext;
  });
}

test("cues never create an autoplay context; only explicit unlock/toggle creates one", async t => {
  install(t);
  const audio = new ForestAudio();
  assert.equal(await audio.unlock(), false);
  audio.cue("ui"); audio.meetingAlert(); audio.devour({ x: 0, y: 0 }, { x: 0, y: 0 }, true);
  audio.enabled = true;
  assert.equal(audio.cue("task-complete"), false);
  assert.equal(audio.step(), false);
  assert.equal(FakeAudioContext.instances.length, 0);
  assert.equal(await audio.unlock(), true);
  assert.equal(FakeAudioContext.instances.length, 1);
  assert.equal(audio.cue("constructor"), false);
  assert.equal(audio.cue("ui"), true);
  audio.destroy();
});

test("all interaction cues are finite, gentle, and clean up their complete audio graph", async t => {
  install(t);
  const audio = new ForestAudio();
  assert.equal(await audio.toggle(), true);
  const context = FakeAudioContext.instances[0];
  const master = context.nodes[0];
  for (const cue of ["ui", "task-open", "task-correct", "task-error", "task-complete", "item-use", "vote", "ordeal-start", "calm", "victory", "defeat", "step"]) {
    assert.equal(audio.cue(cue), true, cue);
    context.finish();
    assert.ok(context.nodes.filter(node => node !== master).every(node => node.disconnected), cue);
  }
  for (const node of context.nodes) {
    if (node.gain) {
      assert.ok(node.gain.value >= 0 && node.gain.value <= .8);
      for (const event of node.gain.events) if (event.length === 3) assert.ok(Number.isFinite(event[1]) && event[1] <= .8);
    }
    if (node instanceof FakeSource) {
      assert.ok(Number.isFinite(node.startAt));
      assert.ok(node.stops[0] > node.startAt && node.stops[0] - node.startAt <= 1);
      assert.equal(node.onended, null);
    }
  }
  audio.destroy();
  assert.ok(context.nodes.every(node => node.disconnected));
  assert.equal(context.state, "closed");
});

test("rapid interaction and movement have cooldowns and a bounded polyphony budget", async t => {
  install(t);
  const audio = new ForestAudio();
  await audio.toggle();
  const context = FakeAudioContext.instances[0];
  assert.equal(audio.step(0), false);
  assert.equal(audio.step(NaN), false);
  assert.equal(audio.step(1, "stone"), true);
  assert.equal(audio.cue("step"), false);
  context.currentTime += .31;
  assert.equal(audio.cue("step"), true);
  context.finish();
  for (let i = 0; i < 10; i++) {
    assert.equal(audio.cue("ui"), true);
    assert.equal(audio.cue("ui"), false);
    context.currentTime += .1;
  }
  assert.equal(audio.cue("calm"), false, "ten active groups is the hard limit");
  context.finish();
  assert.equal(audio.cue("calm"), true);
  audio.destroy();
});

test("muting immediately stops even future notes and unmuting cannot replay old tails", async t => {
  install(t);
  const audio = new ForestAudio();
  await audio.toggle();
  const context = FakeAudioContext.instances[0];
  audio.cue("victory");
  audio.devour({ x: 0, y: 0 }, { x: 20, y: 0 }, true);
  const oldSources = context.nodes.filter(node => node instanceof FakeSource);
  assert.ok(oldSources.some(node => node.startAt > context.currentTime));
  assert.equal(await audio.toggle(), false);
  assert.equal(context.nodes[0].gain.value, 0);
  assert.ok(oldSources.every(node => node.stops.includes(undefined) && node.disconnected && node.onended === null));
  const count = context.nodes.length;
  assert.equal(audio.cue("item-use"), false);
  assert.equal(context.nodes.length, count);
  assert.equal(await audio.toggle(), true);
  assert.equal(context.nodes.length, count, "unmute reuses context without reviving nodes");
  assert.equal(audio.cue("ui"), true);
  audio.enabled = false;
  assert.ok(context.nodes.slice(1).every(node => node.disconnected));
  audio.destroy();
});

test("positional foley obeys hearing range and matches the single-gulp absorption timing", async t => {
  install(t);
  const audio = new ForestAudio();
  await audio.toggle();
  const context = FakeAudioContext.instances[0];
  const listener = { x: 0, y: 0 };
  assert.equal(audio.rustle(listener, { x: HEARING_RANGE + 1, y: 0 }), false);
  assert.equal(audio.devour(listener, { x: HEARING_RANGE + 1, y: 0 }), false);
  assert.equal(audio.rustle(listener, { x: NaN, y: 0 }), false);
  assert.equal(audio.rustle(listener, { x: 80, y: -60 }), true);
  const panner = context.nodes.find(node => node.kind === "panner");
  assert.equal(panner.positionX.value, .8);
  assert.equal(panner.positionZ.value, -.6);
  context.finish();
  const now = context.currentTime;
  const before = context.nodes.length;
  assert.equal(audio.devour(listener, { x: 200, y: 0 }, true), true);
  const tones = context.nodes.slice(before).filter(node => node.kind === "oscillator");
  assert.equal(tones.length, 4);
  assert.deepEqual(tones.map(node => Math.round((node.startAt - now) * 100)), [16, 46, 98, 124]);
  assert.ok(tones.every(node => node.stops[0] - now < 1.6));
  assert.equal(tones.filter(node => node.frequency.events.some(event => event[0] === "exponential" && event[1] === 58)).length, 1);
  context.finish();
  audio.meetingAlert(true); context.finish();
  audio.meetingAlert(false); context.finish();
  audio.destroy();
  assert.ok(context.nodes.every(node => node.disconnected));
});

test("unsupported or blocked WebAudio remains silent without throwing", async t => {
  install(t, undefined);
  // Passing undefined uses the helper's default, so explicitly remove the constructor.
  delete globalThis.AudioContext;
  const audio = new ForestAudio();
  assert.equal(await audio.toggle(), false);
  assert.equal(audio.enabled, false);
  assert.equal(audio.cue("ui"), false);
  audio.destroy();
  globalThis.AudioContext = class { constructor() { throw new Error("blocked"); } };
  assert.equal(await audio.toggle(), false);
  audio.destroy();
});

test("destroy during pending gesture resume cannot reactivate a discarded engine", async t => {
  let finishResume;
  class DelayedAudioContext extends FakeAudioContext {
    resume() { return new Promise(resolve => { finishResume = () => { this.state = "running"; resolve(); }; }); }
  }
  install(t, DelayedAudioContext);
  const audio = new ForestAudio();
  audio.enabled = true;
  const pending = audio.unlock();
  const context = FakeAudioContext.instances[0];
  audio.destroy();
  finishResume();
  assert.equal(await pending, false);
  assert.equal(audio.enabled, false);
  assert.ok(context.nodes.every(node => node.disconnected));
});
