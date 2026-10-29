import assert from "node:assert/strict";
import test from "node:test";
import {
  banishmentDuration,
  banishmentOutcome,
  banishmentRevealAt,
  banishmentSettleAt,
  displayName,
  seededRandom,
} from "../app/banishment.ts";
import { BanishmentScene, banishmentLayout } from "../app/banishment-art.ts";
import { verdictRole } from "../server/role-presentation.ts";
import { ForestAudio } from "../app/forest-audio.ts";

test("displayName strips (YOU) suffixes cleanly", () => {
  assert.equal(displayName("Mochi (YOU)"), "Mochi");
  assert.equal(displayName("Pip"), "Pip");
  assert.equal(displayName("   "), "A cat");
  assert.equal(displayName(""), "A cat");
  assert.equal(displayName("Slime King (YOU)"), "Slime King", "player-chosen names are never rewritten");
});

test("verdictRole extracts authoritative roles from current and legacy strings", () => {
  assert.equal(verdictRole("Mochi was ejected — WARDEN"), "CREWMATE");
  assert.equal(verdictRole("Mochi was ejected — CREWMATE"), "CREWMATE");
  assert.equal(verdictRole("Gloop was ejected — THE HOLLOW"), "IMPOSTOR");
  assert.equal(verdictRole("Gloop was ejected — THE IMPOSTOR"), "IMPOSTOR");
  assert.equal(verdictRole("Vote tied — no one was ejected"), null);
  assert.equal(verdictRole("Vote skipped — no one was ejected"), null);
  assert.equal(verdictRole(""), null);
  assert.equal(verdictRole(null), null);
  assert.equal(verdictRole(undefined), null);
  assert.equal(verdictRole("Random text without suffix"), null);
});

test("banishmentOutcome returns null before tally is concluded", () => {
  const meeting = {
    key: "m1",
    candidates: [{ id: "p1", name: "Mochi", color: "#63e6be" }],
  };
  assert.equal(banishmentOutcome(meeting), null);
});

test("banishmentOutcome formats Warden ejection with gentle tone and cosmetics", () => {
  const meeting = {
    key: "m-warden",
    ejectedId: "p1",
    verdict: "Mochi was ejected — WARDEN",
    tied: false,
    tally: [
      { targetId: "p1", targetName: "Mochi (YOU)", targetColor: "#63e6be", targetEyeStyle: "DREAMY", votes: 3, isTop: true },
      { targetId: "SKIP", targetName: "SKIP", targetColor: null, votes: 1, isTop: false },
    ],
    candidates: [
      { id: "p1", name: "Mochi (YOU)", color: "#63e6be", hat: "antlers", eyeStyle: "DREAMY" },
      { id: "p2", name: "Pip", color: "#a5d8ff", hat: "hood", eyeStyle: "ROUND" },
    ],
    localPlayerId: "p1",
  };

  const outcome = banishmentOutcome(meeting);
  assert.ok(outcome);
  assert.equal(outcome.kind, "WARDEN");
  assert.equal(outcome.isLocal, true);
  assert.equal(outcome.name, "Mochi");
  assert.equal(outcome.color, "#63e6be");
  assert.equal(outcome.hat, "antlers");
  assert.equal(outcome.eyeStyle, "DREAMY");
  assert.equal(outcome.headline, "You were a Warden.");
  assert.match(outcome.detail, /innocent light/);
  assert.equal(outcome.announcement, "You were a Warden.");
});

test("banishmentOutcome formats Hollow ejection with rejection theme", () => {
  const meeting = {
    key: "m-hollow",
    ejectedId: "p2",
    verdict: "Gloop was ejected — THE HOLLOW",
    tied: false,
    tally: [
      { targetId: "p2", targetName: "Gloop", targetColor: "#ff8787", targetEyeStyle: "FIERCE", votes: 4, isTop: true },
    ],
    candidates: [
      { id: "p1", name: "Mochi", color: "#63e6be", hat: "moth" },
      { id: "p2", name: "Gloop", color: "#ff8787", hat: "mooncap", eyeStyle: "FIERCE" },
    ],
    localPlayerId: "p1",
  };

  const outcome = banishmentOutcome(meeting);
  assert.ok(outcome);
  assert.equal(outcome.kind, "HOLLOW");
  assert.equal(outcome.isLocal, false);
  assert.equal(outcome.name, "Gloop");
  assert.equal(outcome.color, "#ff8787");
  assert.equal(outcome.hat, "mooncap");
  assert.equal(outcome.headline, "Gloop was The Hollow.");
  assert.match(outcome.detail, /forest rejects/);
  assert.equal(outcome.announcement, "Gloop was The Hollow.");
});

test("banishmentOutcome formats ties and skips without role reveal", () => {
  const tiedMeeting = {
    key: "m-tied",
    ejectedId: null,
    tied: true,
    verdict: "Vote tied — no one was ejected",
    tally: [
      { targetId: "p1", targetName: "Mochi", targetColor: "#63e6be", votes: 2, isTop: true },
      { targetId: "p2", targetName: "Gloop", targetColor: "#ff8787", votes: 2, isTop: true },
    ],
    candidates: [
      { id: "p1", name: "Mochi", color: "#63e6be" },
      { id: "p2", name: "Gloop", color: "#ff8787" },
    ],
  };
  const tiedOutcome = banishmentOutcome(tiedMeeting);
  assert.ok(tiedOutcome);
  assert.equal(tiedOutcome.kind, "NONE");
  assert.equal(tiedOutcome.tied, true);
  assert.equal(tiedOutcome.headline, "No one was banished.");
  assert.match(tiedOutcome.announcement, /Vote was tied/i);

  const skipMeeting = {
    key: "m-skip",
    ejectedId: null,
    tied: false,
    verdict: "Vote skipped — no one was ejected",
    tally: [{ targetId: "SKIP", targetName: "SKIP", targetColor: null, votes: 3, isTop: true }],
    candidates: [{ id: "p1", name: "Mochi", color: "#63e6be" }],
  };
  const skipOutcome = banishmentOutcome(skipMeeting);
  assert.ok(skipOutcome);
  assert.equal(skipOutcome.kind, "NONE");
  assert.equal(skipOutcome.tied, false);
  assert.equal(skipOutcome.headline, "No one was banished.");
  assert.match(skipOutcome.announcement, /Vote was skipped/i);
});

test("banishmentOutcome handles unrevealed verdicts gracefully without leaking roles", () => {
  const meeting = {
    key: "m-unrevealed",
    ejectedId: "p1",
    verdict: "A mystery verdict occurred",
    tied: false,
    tally: [{ targetId: "p1", targetName: "Pebble", targetColor: "#ffd43b", votes: 3, isTop: true }],
    candidates: [{ id: "p1", name: "Pebble", color: "#ffd43b" }],
  };
  const outcome = banishmentOutcome(meeting);
  assert.ok(outcome);
  assert.equal(outcome.kind, "UNREVEALED");
  assert.equal(outcome.headline, "Pebble was banished.");
  assert.match(outcome.announcement, /role stays hidden/);
});

test("timeline durations fit comfortably inside the room server's 7-second window", () => {
  for (const kind of ["WARDEN", "HOLLOW", "NONE", "UNREVEALED"]) {
    const reveal = banishmentRevealAt(kind);
    const settle = banishmentSettleAt(kind);
    const duration = banishmentDuration(kind);
    assert.ok(reveal < settle, `${kind} reveal before settle`);
    assert.ok(settle < duration, `${kind} settle before duration`);
    assert.ok(duration <= 4.0, `${kind} duration stays under 4.0 seconds`);

    const reducedReveal = banishmentRevealAt(kind, true);
    const reducedDuration = banishmentDuration(kind, true);
    assert.ok(reducedReveal <= reveal, "reduced motion reveal is prompt");
    assert.ok(reducedDuration <= duration, "reduced motion duration is prompt");
  }
});

test("seededRandom produces deterministic numbers across identical seeds", () => {
  const rng1 = seededRandom("test-seed-123");
  const rng2 = seededRandom("test-seed-123");
  const seq1 = Array.from({ length: 10 }, () => rng1());
  const seq2 = Array.from({ length: 10 }, () => rng2());
  assert.deepEqual(seq1, seq2);
  assert.ok(seq1.every(n => n >= 0 && n < 1));
});

test("banishmentLayout computes responsive dimensions proportionally", () => {
  const l1 = banishmentLayout(960, 540);
  assert.equal(l1.width, 960);
  assert.equal(l1.height, 540);
  assert.equal(l1.cx, 480);
  assert.ok(l1.s > 0);
  assert.ok(l1.groundY > 0 && l1.groundY < 540);

  const l2 = banishmentLayout(1920, 1080);
  assert.ok(l2.s > l1.s);
  assert.equal(l2.cx, 960);
});

test("ForestAudio banishment cues are finite, gentle, and clean up their graph", async t => {
  class FakeParam {
    value = 0;
    events = [];
    setValueAtTime(value, at) { this.value = value; this.events.push(["set", value, at]); }
    linearRampToValueAtTime(value, at) { this.events.push(["linear", value, at]); }
    exponentialRampToValueAtTime(value, at) { this.events.push(["exponential", value, at]); }
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
    state = "running";
    currentTime = 10;
    sampleRate = 48000;
    nodes = [];
    destination = { kind: "destination" };
    constructor() { FakeAudioContext.instances.push(this); }
    async resume() { this.state = "running"; }
    async close() { this.state = "closed"; }
    createGain() { const n = new FakeNode(this, "gain"); n.gain = new FakeParam(); return n; }
    createOscillator() { return new FakeSource(this, "oscillator"); }
    createBufferSource() { return new FakeSource(this, "noise"); }
    createBiquadFilter() { const n = new FakeNode(this, "filter"); n.frequency = new FakeParam(); return n; }
    createBuffer(_c, len) { return { getChannelData: () => new Float32Array(len) }; }
    finish() {
      for (const node of this.nodes) if (node instanceof FakeSource) node.onended?.();
      this.currentTime += 3;
    }
  }

  const prev = Object.getOwnPropertyDescriptor(globalThis, "AudioContext");
  Object.defineProperty(globalThis, "AudioContext", { configurable: true, writable: true, value: FakeAudioContext });
  t.after(() => {
    if (prev) Object.defineProperty(globalThis, "AudioContext", prev);
    else delete globalThis.AudioContext;
  });

  const audio = new ForestAudio();
  await audio.toggle();
  const ctx = FakeAudioContext.instances[0];

  assert.equal(audio.banishmentOpening(), true);
  ctx.finish();
  assert.equal(audio.banishmentWarden(), true);
  ctx.finish();
  assert.equal(audio.banishmentHollow(), true);
  ctx.finish();

  audio.destroy();
  assert.ok(ctx.nodes.every(node => node.disconnected));
});

test("BanishmentScene initializes and prepares scene structure for all kinds", () => {
  for (const kind of ["WARDEN", "HOLLOW", "NONE", "UNREVEALED"]) {
    const outcome = {
      key: `scene-${kind}`,
      kind,
      tied: false,
      playerId: "p1",
      name: "Mochi",
      color: "#63e6be",
      hat: "antlers",
      eyeStyle: "FIERCE",
      isLocal: false,
      eyebrow: "The circle has chosen",
      headline: "Mochi was a Warden.",
      detail: "An innocent light returns to the moon.",
      announcement: "Mochi was a Warden.",
    };
    const scene = new BanishmentScene(outcome);
    assert.ok(scene);
  }
});
