import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TASK_HOLD_SECONDS, holdTaskProgress } from "../app/task-hold.ts";
import { movementVector, JoystickInput } from "../app/joystick-input.ts";
import {
  INTRO_STORAGE_KEY, INTRO_VERSION, shouldShowFirstSteps, readFirstStepsState,
  markFirstStepsComplete, markFirstStepsSkipped, subscribeFirstSteps, createFirstStepsProgress,
  FIRST_STEPS_RUNES, FIRST_STEPS_SHRINE, firstStepsReducer, isNearFirstStepsShrine,
} from "../app/intro-state.ts";

// The production joystick owns a stylesheet. Ignore CSS only during this local
// component import; restore the Node loader before any test runs.
const loadComponent = createRequire(import.meta.url);
const previousCssLoader = loadComponent.extensions[".css"];
let FirstSteps;
try {
  loadComponent.extensions[".css"] = () => {};
  ({ FirstSteps } = loadComponent("../app/first-steps.tsx"));
} finally {
  if (previousCssLoader) loadComponent.extensions[".css"] = previousCssLoader;
  else delete loadComponent.extensions[".css"];
}

function store(value = null) {
  const values = new Map(value === null ? [] : [[INTRO_STORAGE_KEY, value]]);
  return { values, getItem: (key) => values.get(key) ?? null, setItem: (key, next) => values.set(key, next) };
}

test("first visit shows the intro; completion is a minimal versioned browser choice", () => {
  const storage = store();
  assert.equal(shouldShowFirstSteps(storage), true);
  assert.equal(markFirstStepsComplete(storage), true);
  assert.deepEqual(JSON.parse(storage.values.get(INTRO_STORAGE_KEY)), { version: INTRO_VERSION, status: "complete" });
  assert.equal(shouldShowFirstSteps(storage), false);
  assert.deepEqual(readFirstStepsState(storage), { version: INTRO_VERSION, status: "complete" });
  const nextVisit = store(storage.values.get(INTRO_STORAGE_KEY));
  assert.equal(shouldShowFirstSteps(nextVisit), false);
});

test("explicit skip is distinct from completion and also suppresses later automatic intros", () => {
  const storage = store();
  assert.equal(markFirstStepsSkipped(storage), true);
  assert.equal(readFirstStepsState(storage).status, "skipped");
  assert.equal(shouldShowFirstSteps(store(storage.values.get(INTRO_STORAGE_KEY))), false);
  assert.equal(markFirstStepsComplete(storage), true, "a later replay may be completed");
  assert.equal(readFirstStepsState(storage).status, "complete");
});

test("missing, malformed, old and future preferences are not mistaken for completion", () => {
  for (const value of [null, "not json", "null", "true", "[]", "{}", '{"version":0,"status":"complete"}', '{"version":2,"status":"complete"}', '{"version":1,"status":"started"}', '{"version":"1","status":"complete"}']) {
    const storage = store(value);
    assert.equal(readFirstStepsState(storage), null);
    assert.equal(shouldShowFirstSteps(storage), true);
  }
});

test("storage exceptions do not break dismissal or re-open the intro in the same visit", () => {
  const storage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("quota"); } };
  assert.equal(shouldShowFirstSteps(storage), true);
  assert.equal(markFirstStepsSkipped(storage), false);
  assert.equal(shouldShowFirstSteps(storage), false);
  assert.equal(readFirstStepsState(storage).status, "skipped");
});

test("SSR and an explicitly absent storage never touch browser globals", () => {
  assert.equal(typeof window, "undefined");
  assert.equal(shouldShowFirstSteps(), false);
  assert.equal(readFirstStepsState(), null);
  assert.equal(markFirstStepsComplete(), false);
  assert.equal(markFirstStepsSkipped(), false);
  assert.equal(shouldShowFirstSteps(null), false);
  assert.equal(markFirstStepsComplete(null), false);
  assert.doesNotThrow(() => subscribeFirstSteps(() => {})());
});

test("storage subscription filters changes and cleans up its listener", () => {
  const prior = Object.getOwnPropertyDescriptor(globalThis, "window");
  let listener, removed, notifications = 0;
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    addEventListener(type, next) { assert.equal(type, "storage"); listener = next; },
    removeEventListener(type, next) { assert.equal(type, "storage"); removed = next; },
  } });
  try {
    const unsubscribe = subscribeFirstSteps(() => notifications++);
    listener({ key: "unrelated" });
    assert.equal(notifications, 0);
    listener({ key: INTRO_STORAGE_KEY });
    listener({ key: null });
    assert.equal(notifications, 2);
    unsubscribe();
    assert.equal(removed, listener);
  } finally {
    if (prior) Object.defineProperty(globalThis, "window", prior);
    else delete globalThis.window;
  }
});

test("automatic intro is hydration-safe, stays outside rooms/matches, and can be replayed", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /useSyncExternalStore\(subscribeFirstSteps, shouldShowFirstSteps, \(\) => false\)/);
  assert.match(source, /\(introOpen \|\| \(introNeeded && !introDismissed\)\) && !match && !client\.roomCode/);
  assert.match(source, /onReplayIntro=\{\(\) => \{ if \(!match && !client\.roomCode\) setIntroOpen\(true\)/);
  assert.match(source, /<div inert=\{introVisible \|\| hollowLessonVisible\}>\s*<Lobby/);
  assert.doesNotMatch(source, /if \(hollowLessonOpen.*return <HollowLesson/);
  const guide = await readFile(new URL("../app/game-menu.tsx", import.meta.url), "utf8");
  assert.match(guide, /onClick=\{onReplayIntro\}>Play the introduction/);
});

test("a browser whose localStorage getter throws can still skip once for this visit", () => {
  const prior = Object.getOwnPropertyDescriptor(globalThis, "window");
  const browser = Object.defineProperty({}, "localStorage", { get() { throw new Error("denied"); } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: browser });
  try {
    assert.equal(shouldShowFirstSteps(), true);
    assert.equal(markFirstStepsComplete(), false);
    assert.equal(shouldShowFirstSteps(), false);
    assert.equal(readFirstStepsState().status, "complete");
  } finally {
    if (prior) Object.defineProperty(globalThis, "window", prior);
    else delete globalThis.window;
  }
});

test("the lesson requires movement, shrine proximity, the puzzle, and spending the reward", () => {
  let state = createFirstStepsProgress();
  for (const action of [{ type: "OPEN_SHRINE" }, { type: "HOLD_SHRINE", held: true, seconds: TASK_HOLD_SECONDS }, { type: "RUNE", rune: "Crescent" }, { type: "USE_LIGHT" }]) {
    assert.equal(firstStepsReducer(state, action), state);
  }
  state = firstStepsReducer(state, { type: "MOVE", dx: 13, dy: 0 });
  assert.equal(state.stage, "SHRINE");
  assert.equal(firstStepsReducer(state, { type: "HOLD_SHRINE", held: true, seconds: TASK_HOLD_SECONDS }), state, "must actually reach the shrine");
  state = firstStepsReducer(state, { type: "MOVE", dx: FIRST_STEPS_SHRINE.x - state.x, dy: FIRST_STEPS_SHRINE.y - state.y });
  assert.equal(isNearFirstStepsShrine(state), true);
  assert.equal(firstStepsReducer(state, { type: "OPEN_SHRINE" }), state, "an old instant-open action cannot bypass holding");
  state = firstStepsReducer(state, { type: "HOLD_SHRINE", held: true, seconds: TASK_HOLD_SECONDS - .1 });
  assert.equal(state.stage, "SHRINE");
  assert.equal(state.holding, true);
  state = firstStepsReducer(state, { type: "HOLD_SHRINE", held: true, seconds: .1 });
  assert.equal(state.stage, "PUZZLE");
  state = firstStepsReducer(state, { type: "RUNE", rune: "Full" });
  assert.equal(state.puzzleIndex, 0);
  assert.equal(state.puzzleMistakes, 1);
  assert.equal(state.lightEarned, false);
  for (const rune of FIRST_STEPS_RUNES) state = firstStepsReducer(state, { type: "RUNE", rune });
  assert.equal(state.stage, "BLACKOUT");
  assert.equal(state.lightEarned, true);
  assert.equal(state.lightUsed, false);
  assert.equal(firstStepsReducer(state, { type: "MOVE", dx: 20, dy: 20 }), state);
  state = firstStepsReducer(state, { type: "USE_LIGHT" });
  assert.equal(state.stage, "DONE");
  assert.equal(state.lightUsed, true);
  assert.equal(firstStepsReducer(state, { type: "USE_LIGHT" }), state);
});

test("shrine hold uses the real duration and resets on release or leaving the shrine", () => {
  assert.equal(TASK_HOLD_SECONDS, 1.8);
  let state = firstStepsReducer(createFirstStepsProgress(), { type: "MOVE", dx: FIRST_STEPS_SHRINE.x - 23, dy: FIRST_STEPS_SHRINE.y - 72 });
  state = firstStepsReducer(state, { type: "HOLD_SHRINE", held: true, seconds: .9 });
  assert.equal(holdTaskProgress(state.holdSeconds), .5);
  const partial = state;
  for (const seconds of [NaN, Infinity, -.1]) assert.equal(firstStepsReducer(partial, { type: "HOLD_SHRINE", held: true, seconds }), partial);
  state = firstStepsReducer(state, { type: "HOLD_SHRINE", held: false, seconds: 0 });
  assert.equal(state.holdSeconds, 0);
  assert.equal(state.holding, false);
  state = firstStepsReducer(state, { type: "HOLD_SHRINE", held: true, seconds: .9 });
  assert.equal(state.stage, "SHRINE", "release discards the first half of the hold");
  state = firstStepsReducer(state, { type: "MOVE", dx: -30, dy: 0 });
  assert.equal(state.holdSeconds, 0);
  assert.equal(state.holding, false);
  assert.equal(firstStepsReducer(state, { type: "HOLD_SHRINE", held: true, seconds: TASK_HOLD_SECONDS }), state);
  state = firstStepsReducer(state, { type: "MOVE", dx: 30, dy: 0 });
  state = firstStepsReducer(state, { type: "HOLD_SHRINE", held: true, seconds: TASK_HOLD_SECONDS });
  assert.equal(state.stage, "PUZZLE");
  assert.equal(state.holding, false);
  assert.equal(state.holdSeconds, 0);
});

test("tutorial analog movement keeps the live joystick's left region, speed and release behavior", () => {
  const input = new JoystickInput();
  assert.equal(input.begin(1, 220, 100, 400, 250), false, "right-side touches do not move");
  assert.equal(input.begin(1, 50, 100, 400, 250), true);
  input.move(1, 80, 100);
  const analog = movementVector(0, 0, input.vector);
  assert.ok(analog.vx > 0 && analog.vx < 1, "partial joystick deflection preserves proportional speed");
  assert.equal(analog.vy, 0);
  assert.deepEqual(movementVector(0, -1, input.vector), { vx: 0, vy: -1 }, "keyboard takes priority just as in a match");
  input.end(1);
  assert.deepEqual(movementVector(0, 0, input.vector), { vx: 0, vy: 0 });
});

test("practice movement stays inside the clearing and rejects invalid input", () => {
  const initial = createFirstStepsProgress();
  assert.equal(firstStepsReducer(initial, { type: "MOVE", dx: NaN, dy: 0 }), initial);
  assert.equal(firstStepsReducer(initial, { type: "MOVE", dx: 0, dy: Infinity }), initial);
  assert.equal(firstStepsReducer(initial, { type: "MOVE", dx: 0, dy: 0 }), initial);
  const right = firstStepsReducer(initial, { type: "MOVE", dx: 1000, dy: 1000 });
  assert.deepEqual({ x: right.x, y: right.y }, { x: 92, y: 83 });
  const left = firstStepsReducer(right, { type: "MOVE", dx: -1000, dy: -1000 });
  assert.deepEqual({ x: left.x, y: left.y }, { x: 8, y: 17 });
});

test("intro server-renders with accessible actions without creating a live game", () => {
  let callbacks = 0;
  const html = renderToStaticMarkup(createElement(FirstSteps, { onComplete() { callbacks++; }, onSkip() { callbacks++; }, name: "<Warden>" }));
  assert.equal(callbacks, 0);
  assert.match(html, /^<main[^>]+class="first-steps-shell"/);
  assert.doesNotMatch(html, /role="dialog"|aria-modal/);
  assert.match(html, /data-first-steps-stage="MOVE"/);
  assert.match(html, /Skip intro/);
  assert.match(html, /a private practice clearing/);
  assert.match(html, /WASD or arrow keys/);
  assert.match(html, /&lt;Warden&gt;/);
  assert.match(html, /Touch &amp; drag the left side to move/);
  assert.match(html, /class="floating-joystick" data-active="false"/);
  assert.match(html, /disabled=""[^>]*>[^<]*<span aria-hidden="true">☽<\/span> Hold to restore/);
  assert.match(html, /aria-label="Shrine ritual progress"/);
  assert.match(html, /1\.8 seconds/);
  assert.doesNotMatch(html, /Move north|tap the ground|tap the clearing/);
  assert.doesNotMatch(html, /CREATE ROOM|JOIN WITH CODE|<input|aria-live="assertive"/);
});

test("intro has viewport containment, safe areas, and a reduced-motion override", async () => {
  const css = await readFile(new URL("../app/first-steps.css", import.meta.url), "utf8");
  assert.match(css, /height: 100dvh/);
  assert.match(css, /safe-area-inset/);
  assert.match(css, /overflow: hidden/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  const source = await readFile(new URL("../app/first-steps.tsx", import.meta.url), "utf8");
  assert.match(source, /cancelAnimationFrame\(frame\)/);
  assert.match(source, /visibilitychange/);
  assert.match(source, /animated=\{false\}/);
  assert.match(source, /key === "f" && progress\.stage === "BLACKOUT"/);
  assert.match(source, /Use Glowing Mushroom <kbd>F<\/kbd>/);
  assert.match(source, /<FloatingJoystick surfaceRef=\{worldRef\} enabled=\{canMove\} onVector=\{onJoystickVector\}/);
  assert.match(source, /movementVector\(x, y, joystickRef\.current\)/);
  assert.match(source, /<TaskHoldGauge progress=\{holdTaskProgress\(progress\.holdSeconds\)\}/);
  assert.match(source, /onPointerCancel=\{cancelHold\}/);
  assert.match(source, /onBlur=\{cancelHold\}/);
  assert.match(source, /window\.addEventListener\("blur", reset\)/);
  assert.doesNotMatch(source, /OPEN_SHRINE|destinationRef|first-steps-dpad|walkTo/);
  assert.doesNotMatch(source, /fetch\(|WebSocket|startGame|startMatch|setTimeout/);
});
