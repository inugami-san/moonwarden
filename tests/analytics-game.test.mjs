import assert from "node:assert/strict";
import test from "node:test";
import { GameAnalyticsLifecycle } from "../app/analytics-game.ts";

function participation() {
  const events = [];
  let time = 1000;
  const lifecycle = new GameAnalyticsLifecycle((name, params) => events.push({ name, params }), () => time);
  return { lifecycle, events, advance: (milliseconds) => { time += milliseconds; } };
}

test("a participation begins once despite repeated accepted starts", () => {
  const { lifecycle, events } = participation();
  lifecycle.start("multiplayer", 6);
  lifecycle.start("multiplayer", 6);
  assert.deepEqual(events, [{ name: "match_started", params: { mode: "multiplayer", player_count: 6 } }]);
});

test("real result callbacks emit a single completion with a bounded outcome", () => {
  const { lifecycle, events, advance } = participation();
  lifecycle.start("multiplayer", 4);
  advance(31_600);
  lifecycle.complete("CREW VICTORY — A DISPLAY MESSAGE WITH A PLAYER NAME");
  lifecycle.complete("CREW VICTORY — A RETRIED RESULT");
  assert.deepEqual(events.at(-1), {
    name: "match_completed",
    params: { mode: "multiplayer", duration_seconds: 32, outcome: "wardens" },
  });
  assert.equal(events.length, 2);
  assert.doesNotMatch(JSON.stringify(events), /PLAYER NAME|DISPLAY MESSAGE|RETRIED RESULT/);
});

test("known impostor results map to the winning team, not the local hidden role", () => {
  const { lifecycle, events } = participation();
  lifecycle.start("solo", 8);
  lifecycle.complete("IMPOSTOR VICTORY — THE CREW IS AT PARITY");
  assert.equal(events.at(-1).params.outcome, "impostor");
});

test("unknown result text is never passed through to analytics", () => {
  const { lifecycle, events } = participation();
  lifecycle.start("solo", 6);
  lifecycle.complete("Unexpected text containing Mochi and SECRET_ROOM");
  assert.equal(events.at(-1).params.outcome, "unknown");
  assert.doesNotMatch(JSON.stringify(events), /Mochi|SECRET_ROOM/);
});

test("explicitly leaving an unfinished match emits once", () => {
  const { lifecycle, events, advance } = participation();
  lifecycle.start("solo", 6);
  advance(12_000);
  lifecycle.leave();
  lifecycle.leave();
  assert.deepEqual(events.at(-1), { name: "match_left", params: { mode: "solo", duration_seconds: 12 } });
  assert.equal(events.length, 2);
});

test("returning to the lobby after completion is not counted as abandonment", () => {
  const { lifecycle, events } = participation();
  lifecycle.start("solo", 6);
  lifecycle.complete("CREW VICTORY");
  lifecycle.leave();
  assert.deepEqual(events.map((event) => event.name), ["match_started", "match_completed"]);
});

test("a later match can start after leaving, without inventing a rematch click", () => {
  const { lifecycle, events } = participation();
  lifecycle.start("solo", 6);
  lifecycle.complete("CREW VICTORY");
  lifecycle.leave();
  lifecycle.start("multiplayer", 4);
  assert.deepEqual(events.map((event) => event.name), ["match_started", "match_completed", "match_started"]);
  assert.deepEqual(events.at(-1).params, { mode: "multiplayer", player_count: 4 });
});

test("late result callbacks after leaving cannot produce a completion", () => {
  const { lifecycle, events } = participation();
  lifecycle.complete("CREW VICTORY");
  lifecycle.leave();
  lifecycle.start("solo", 6);
  lifecycle.leave();
  lifecycle.complete("CREW VICTORY");
  assert.deepEqual(events.map((event) => event.name), ["match_started", "match_left"]);
});

test("clock regressions never produce negative durations", () => {
  const { lifecycle, events, advance } = participation();
  lifecycle.start("solo", 6);
  advance(-20_000);
  lifecycle.complete("CREW VICTORY");
  assert.equal(events.at(-1).params.duration_seconds, 0);
});
