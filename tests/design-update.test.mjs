import test from "node:test";
import assert from "node:assert/strict";
import { RestorationLedger, ROUND_SIPHON_LIMIT, clampHollowCount } from "../server/match-rules.ts";
import { PairedRituals } from "../server/pair-ritual.ts";
import { rootwakeMove, ROOT_GATE_Y, rootGatesOpen, overgrownStationIndex, lurePoint, SHADE_POCKETS } from "../server/sanctuary-design.ts";
import { sightAt } from "../server/visibility.ts";
import { GameRoom } from "../server/game-room.ts";

test("restoration supports follow-up teamwork, caps both bonuses and team-wide sabotage, and resets per cycle", () => {
  const ledger = new RestorationLedger();
  assert.equal(ledger.claim("font", 7, false, false, 1), 3);
  assert.equal(ledger.claim("font", 7, false, false, 1), .5);
  assert.equal(ledger.claim("font", 7, false, false, 1), .5);
  assert.equal(ledger.claim("font", 7, false, false, 1), 0);
  assert.equal(ledger.claim("bonus", 7, true, false, 1, true), 5.3);
  assert.equal(ledger.claim("bonus2", 7, true, false, 1, true), 3.8);
  let lost = 0;
  for (let n = 0; n < 30; n++) lost -= ledger.claim(`s${n}`, 7, true, true, 2);
  assert.ok(Math.abs(lost - ROUND_SIPHON_LIMIT) < 1e-8);
  ledger.reset();
  assert.equal(ledger.claim("font", 7, false, false, 1), 3);
  assert.ok(ledger.claim("font", 7, false, true, 1) < 0);
});

test("duets cannot complete on holds alone and require four alternating players/runes plus exposure", () => {
  const pair = new PairedRituals();
  const actors = ["a", "b"].map(id => ({ id, x: 300, y: 300, vx: 0, vy: 0, alive: true }));
  const shrine = { id: "s", x: 300, y: 300 };
  let result;
  for (let n = 0; n < 40; n++) {
    for (const a of actors) pair.hold(a.id, "s", 1, n * 100);
    result = pair.tick(actors, [shrine], () => false, 1, n * 100, .1);
    assert.equal(result.completions.length, 0);
  }
  assert.equal(pair.pulse("b", "s", 0, 1, 3900), false, "wrong player");
  assert.equal(pair.pulse("a", "s", 1, 1, 3900), false, "wrong rune");
  for (let beat = 0; beat < 4; beat++) {
    const now = 4000 + beat * 500;
    for (const a of actors) pair.hold(a.id, "s", 1, now);
    pair.tick(actors, [shrine], () => false, 1, now, .1);
    assert.equal(pair.pulse(beat % 2 ? "b" : "a", "s", beat % 2, 1, now), true);
    assert.equal(pair.pulse("a", "s", 0, 1, now), false, "no instant spam");
  }
  result = pair.tick(actors, [shrine], () => false, 1, 5600, .1);
  assert.deepEqual(result.completions.map(p => p.playerId), ["a", "b"]);
  assert.equal(pair.pulse("a", "s", 0, 1, 5600), false, "no replay after completion");
});

test("Rootwake opens only marked midpoint doors, never an arbitrary wall or cross-column tunnel", () => {
  const start = { x: 400, y: ROOT_GATE_Y - 50 }, end = { x: 400, y: ROOT_GATE_Y + 50 };
  assert.equal(rootGatesOpen(7), false);
  assert.equal(rootGatesOpen(6), true);
  assert.notDeepEqual(rootwakeMove(start, end, 8), end);
  assert.deepEqual(rootwakeMove(start, end, 5), end);
  assert.notDeepEqual(rootwakeMove({ ...start, x: 510 }, { ...end, x: 510 }, 5), { ...end, x: 510 });
  assert.notDeepEqual(rootwakeMove(start, { x: 1500, y: 700 }, 5), { x: 1500, y: 700 });
});

test("Glare shade restores nearby identity only inside the same pocket, never through cover", () => {
  const observer = { ...SHADE_POCKETS[0], id: "a" }, target = { x: observer.x + 40, y: observer.y, id: "b" };
  const context = { observer, phase: "ORDEAL", hazard: "MOONGLARE", obstacles: [], flares: [] };
  assert.equal(sightAt(target, context).kind, "IDENTIFIED");
  assert.equal(sightAt({ x: observer.x + 110, y: observer.y, id: "c" }, context).kind, "SHAPE");
  assert.equal(sightAt(target, { ...context, obstacles: [{ x: observer.x + 20, y: observer.y, r: 10 }] }).kind, "HIDDEN");
});

test("recommended role counts and shrine selection remain deterministic; moving lure stays bounded", () => {
  for (let n = 4; n <= 8; n++) assert.equal(clampHollowCount(99, n), n >= 7 ? 2 : 1);
  const indices = new Set(Array.from({ length: 4 }, (_, i) => overgrownStationIndex(i + 1, 7, 6)));
  assert.deepEqual([...indices].sort(), [0, 1, 2, 5]);
  assert.deepEqual(lurePoint({ x: 400, y: 300 }, 0, 1, false), { x: 490, y: 300 });
});

test("meeting limit is host-only, uses approved presets, and freezes when play begins", t => {
  const room = new GameRoom("DSGN"); t.after(() => room.destroy());
  const client = () => ({ readyState: 1, send() {}, close() {} });
  for (const id of ["a", "b", "c", "d"]) room.addClient(id, client(), id, "#20d8ed", "hood");
  room.handleMessage("b", { type: "SET_MEETING_DURATION", seconds: 90 }); assert.equal(room.meetingSeconds, 75);
  room.handleMessage("a", { type: "SET_MEETING_DURATION", seconds: 90 }); assert.equal(room.meetingSeconds, 90);
  room.handleMessage("a", { type: "SET_MEETING_DURATION", seconds: -1 }); assert.equal(room.meetingSeconds, 90);
  room.handleMessage("a", { type: "START_MATCH", botFill: false, targetPlayers: 4 });
  room.handleMessage("a", { type: "SET_MEETING_DURATION", seconds: 60 }); assert.equal(room.meetingSeconds, 90);
});
