import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HollowLesson, createHollowLesson, hollowLessonReducer } from "../app/hollow-lesson.tsx";
import { CompactFieldGuide } from "../app/game-menu.tsx";

test("optional lesson begins as a harmless ritual demonstration", () => {
  const state = createHollowLesson();
  assert.deepEqual(state, { stage: "RITUAL", gearEarned: false, ability: null, strikeSpent: false });
  assert.equal(hollowLessonReducer(state, { type: "BITE" }), state);
  assert.equal(hollowLessonReducer(state, { type: "ABILITY", ability: "SIGHT" }), state);
  const earned = hollowLessonReducer(state, { type: "FAKE_RITUAL" });
  assert.equal(earned.stage, "ABILITY");
  assert.equal(earned.gearEarned, true);
  assert.equal(hollowLessonReducer(earned, { type: "FAKE_RITUAL" }), earned);
});

test("Sight and Echo are mutually exclusive and a bite spends the single strike", () => {
  for (const ability of ["SIGHT", "ECHO"]) {
    let state = hollowLessonReducer(createHollowLesson(), { type: "FAKE_RITUAL" });
    state = hollowLessonReducer(state, { type: "ABILITY", ability });
    assert.equal(state.stage, "HUNT");
    assert.equal(state.ability, ability);
    assert.equal(hollowLessonReducer(state, { type: "ABILITY", ability: ability === "SIGHT" ? "ECHO" : "SIGHT" }), state);
    state = hollowLessonReducer(state, { type: "BITE" });
    assert.equal(state.stage, "DONE");
    assert.equal(state.strikeSpent, true);
    assert.equal(hollowLessonReducer(state, { type: "BITE" }), state);
  }
});

test("the guide only offers the Hollow lesson when explicitly wired by its caller", () => {
  assert.doesNotMatch(renderToStaticMarkup(createElement(CompactFieldGuide)), /Try the Hollow lesson/);
  const html = renderToStaticMarkup(createElement(CompactFieldGuide, { onReplayHollow() {} }));
  assert.match(html, /Try the Hollow lesson/);
  assert.match(html, /1 \/ 9/);
});

test("the lesson renders accessible private practice and never touches matches or preferences", async () => {
  const html = renderToStaticMarkup(createElement(HollowLesson, { onExit() {} }));
  assert.match(html, /role="dialog" aria-modal="true"/);
  assert.match(html, /Optional practice · no real players/);
  assert.match(html, /Try a fake ritual/);
  assert.match(html, /Public gauge updates are delayed and anonymous/);
  assert.match(html, /Real matches: E shrine/);
  const source = await readFile(new URL("../app/hollow-lesson.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /localStorage|sessionStorage|fetch\(|WebSocket|MultiplayerClient|setInterval/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /previous\.isConnected/);
  assert.match(source, /surviving Hollows match or outnumber the Wardens/);
  assert.match(source, /Normal and Veiled Bite share your single strike/);
});

test("layout contains itself on small screens and respects reduced motion", async () => {
  const css = await readFile(new URL("../app/hollow-lesson.css", import.meta.url), "utf8");
  assert.match(css, /height: 100dvh/);
  assert.match(css, /safe-area-inset/);
  assert.match(css, /orientation: landscape/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /animation: none !important; transition: none !important/);
});
