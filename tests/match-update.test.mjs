import assert from "node:assert/strict";
import test from "node:test";
import { GameRoom } from "../server/game-room.ts";
import { createMatchLayout } from "../server/match-layout.ts";
import { clampHollowCount, hollowVictory, ritualProgress } from "../server/match-rules.ts";
import { CENTER, PLAYER_BOUNDS, getRootCell } from "../server/sanctuary-map.ts";
import { planRoute } from "../server/sanctuary-paths.ts";
import { navigationView } from "../app/navigation-data.ts";

function match(t, count = 8, hollows = 2) {
  const room = new GameRoom("TEST"), clients = [];
  for (let i = 0; i < count; i++) {
    const client = { readyState: 1, sent: [], send(data) { this.sent.push(JSON.parse(data)); }, close() {} };
    clients.push(client); room.addClient(`p${i}`, client, `Player ${i}`, "#20d8ed", "hood");
  }
  room.handleMessage("p0", { type: "START_MATCH", botFill: false, targetPlayers: count, hollowCount: hollows });
  t.after(() => room.destroy());
  return { room, clients };
}

test("Hollow cap defaults to one and permits a second only at seven or eight players", t => {
  for (let size = 4; size <= 8; size++) {
    assert.equal(clampHollowCount(undefined, size), 1);
    assert.equal(clampHollowCount(Infinity, size), 1);
    assert.equal(clampHollowCount(999, size), size >= 7 ? 2 : 1);
    assert.equal(clampHollowCount(-1, size), 1);
    const { room } = match(t, size, 999);
    const hollows = [...room.players.values()].filter(p => p.role === "IMPOSTOR").length;
    assert.equal(hollows, size >= 7 ? 2 : 1);
    assert.equal(room.checkWinConditions(), false);
    assert.equal(room.state, "PLAYING");
  }
  assert.equal(hollowVictory(2, 2, 2, 2), false);
  assert.equal(hollowVictory(1, 2, 2, 2), true);
});

test("only Hollows receive their teammates; role fields stay private to each player", t => {
  const { room, clients } = match(t);
  for (let i = 0; i < clients.length; i++) {
    const message = clients[i].sent.find(m => m.type === "MATCH_STARTED");
    assert.equal(message.hollowCount, 2);
    assert.equal(message.layoutSeed, room.layoutSeed);
    assert.equal(message.players.filter(p => p.role !== undefined).length, 1);
    if (message.role === "IMPOSTOR") {
      assert.equal(message.hollowAllies.length, 2);
      assert.ok(message.hollowAllies.every(id => room.players.get(id).role === "IMPOSTOR"));
    } else assert.equal(message.hollowAllies, undefined);
  }
});

test("ward growth scales with living Wardens; siphons and restoration use the same anonymous settlement", t => {
  assert.ok(ritualProgress(7, false) < ritualProgress(3, false));
  const { room, clients } = match(t);
  const warden = [...room.players.values()].find(p => p.role === "CREWMATE");
  const hollow = [...room.players.values()].find(p => p.role === "IMPOSTOR");
  const station = room.stations[0];
  room.taskProgress = 50;
  for (const p of [warden, hollow]) { p.x = station.x; p.y = station.y; }
  for (const client of clients) client.sent.length = 0;
  room.completeRitual(hollow, station.id, station.reward, 1);
  assert.equal(room.taskProgress, 50, "no immediate public gauge cue from the Hollow's rite");
  assert.equal(room.sealedStations.has(station.id), false, "a siphon must not consume the Warden's restoration claim");
  room.broadcastWorld();
  assert.ok(clients[0].sent.find(m => m.type === "SYNC_WORLD").completedStations.includes(station.id), "both roles leave the same public shrine state");
  room.settleWards();
  assert.equal(room.taskProgress, 50 + ritualProgress(6, false, true, 2));
  const afterSiphon = room.taskProgress;
  room.completeRitual(warden, station.id, station.reward, 1);
  assert.equal(room.taskProgress, afterSiphon);
  room.settleWards();
  assert.equal(room.taskProgress, Math.round((afterSiphon + ritualProgress(6, false)) * 10) / 10);
  room.completeRitual(hollow, station.id, station.reward, 1);
  room.settleWards();
  assert.equal(room.itemCharges.get(hollow.id)[station.reward], 1, "no repeated siphon/reward exploit");
  for (const client of clients) for (const cue of client.sent.filter(m => m.type === "STATION_COMPLETED")) assert.deepEqual(Object.keys(cue).sort(), ["roundId", "sequence", "stationId", "type"]);
});

test("all Hollow teammates must be eliminated before a Warden role victory", t => {
  const { room } = match(t);
  const hollows = [...room.players.values()].filter(p => p.role === "IMPOSTOR");
  hollows[0].alive = false;
  assert.equal(room.checkWinConditions(), false);
  hollows[1].alive = false;
  assert.equal(room.checkWinConditions(), true);
  assert.equal(room.state, "ENDED");
});

test("stealth uses the normal strike, delays the puddle, and enforces 45 seconds plus two Ordeal starts", t => {
  let now = Date.now();
  t.mock.method(Date, "now", () => now);
  const { room, clients } = match(t);
  room.phase = "ORDEAL"; room.phaseTime = 10; room.ordealNumber = 1;
  const hollows = [...room.players.values()].filter(p => p.role === "IMPOSTOR");
  const wardens = [...room.players.values()].filter(p => p.role === "CREWMATE");
  for (const p of room.players.values()) { p.x = CENTER.x; p.y = CENTER.y; }
  const sent = id => clients[Number(id.slice(1))].sent.filter(m => m.type === "KILL_RESULT").at(-1);
  room.handleMessage(hollows[0].id, { type: "TRIGGER_KILL", victimId: hollows[1].id });
  assert.equal(sent(hollows[0].id).accepted, false, "no friendly fire");
  room.handleMessage(hollows[0].id, { type: "TRIGGER_KILL", victimId: wardens[0].id, style: "STEALTH" });
  assert.equal(wardens[0].alive, false);
  assert.equal(room.bodies.length, 0);
  assert.equal(sent(hollows[0].id).stealthRemainingMs, 45000);
  assert.equal(sent(hollows[0].id).stealthOrdealsLeft, 2);
  assert.ok(clients[Number(wardens[0].id.slice(1))].sent.some(m => m.type === "DEATH_EVENT"));
  room.handleMessage(hollows[0].id, { type: "TRIGGER_KILL", victimId: wardens[1].id });
  assert.equal(sent(hollows[0].id).accepted, false, "stealth and normal share one strike");
  room.handleMessage(hollows[1].id, { type: "TRIGGER_KILL", victimId: wardens[1].id });
  assert.equal(sent(hollows[1].id).accepted, true, "a teammate retains its own strike");
  now += 8001; room.tick();
  assert.ok(room.bodies.some(b => b.id === `body-${wardens[0].id}` && b.delayed));
  room.phase = "ORDEAL"; room.phaseTime = 10; room.strikeSpent.clear(); room.ordealNumber = 2;
  now += 45000;
  room.handleMessage(hollows[0].id, { type: "TRIGGER_KILL", victimId: wardens[2].id, style: "STEALTH" });
  assert.equal(sent(hollows[0].id).accepted, false, "time alone does not bypass the Ordeal lockout");
  room.ordealNumber = 3;
  room.handleMessage(hollows[0].id, { type: "TRIGGER_KILL", victimId: wardens[2].id, style: "STEALTH" });
  assert.equal(sent(hollows[0].id).accepted, true);
});

test("seeded station layouts are stable, vary between matches, and preserve walkable shrine approaches", () => {
  assert.deepEqual(createMatchLayout(123), createMatchLayout(123));
  assert.notDeepEqual(createMatchLayout(123).stations, createMatchLayout(456).stations);
  for (let seed = 0; seed < 40; seed++) {
    const layout = createMatchLayout(seed * 59328);
    assert.equal(new Set(layout.stations.map(s => getRootCell(s.x, s.y).index)).size, 6);
    assert.ok(layout.obstacles.length > 8, "curated cover is added without requiring a crowded fixed prop count");
    for (const shrine of layout.stations) {
      assert.ok(layout.obstacles.every(obstacle => Math.hypot(obstacle.x - shrine.x, obstacle.y - shrine.y) > obstacle.r + 60));
      const path = planRoute(CENTER, shrine, false, layout.obstacles);
      assert.ok(path.length, `seed ${seed}: ${shrine.id} must be reachable`);
      assert.ok(path.every(point => point.x >= PLAYER_BOUNDS.left && point.x <= PLAYER_BOUNDS.right && point.y >= PLAYER_BOUNDS.top && point.y <= PLAYER_BOUNDS.bottom));
      const view = navigationView({ position: CENTER, phase: "CALM", hazard: "FOG", stations: layout.stations, destinationId: shrine.id, layoutSeed: seed * 59328 });
      assert.equal(view.destination.x, shrine.x); assert.equal(view.destination.y, shrine.y);
    }
  }
});
