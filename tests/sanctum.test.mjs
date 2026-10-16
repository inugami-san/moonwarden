import assert from "node:assert/strict";
import test from "node:test";
import { GameServerRegistry } from "../server/game-room.ts";
import { sanctumPulse } from "../app/sanctum-art.ts";

function match(t) {
  const room = new GameServerRegistry().createRoom();
  const clients = [];
  for (let i = 0; i < 4; i++) {
    const client = { readyState: 1, sent: [], send(data) { this.sent.push(JSON.parse(data)); }, close() {} };
    clients.push(client);
    room.addClient(`p${i}`, client, `P${i}`, "#20d8ed", "hood");
  }
  room.handleMessage("p0", { type: "START_MATCH", botFill: false, targetPlayers: 4 });
  for (const p of room.players.values()) p.role = p.id === "p3" ? "IMPOSTOR" : "CREWMATE";
  clients.forEach((client) => { client.sent.length = 0; });
  t.after(() => room.destroy());
  return { room, clients };
}

test("a completion pulse lasts 0.5 seconds and stays within a small shrine radius", () => {
  assert.equal(sanctumPulse(9.99, 10), null);
  assert.ok(sanctumPulse(10, 10));
  assert.ok(sanctumPulse(10.499, 10));
  assert.equal(sanctumPulse(10.5, 10), null);
  assert.equal(sanctumPulse(10, undefined), null);
  for (let elapsed = 0; elapsed < 0.5; elapsed += 0.01) {
    assert.ok(sanctumPulse(10 + elapsed, 10).radius <= 58);
  }
});

test("stations reopen next Calm without losing team progress or earned gear", (t) => {
  const { room, clients } = match(t);
  const task = { type: "TASK_UPDATE", stationId: "FROST FONT", reward: "FLASHLIGHT", roundId: 1 };
  room.handleMessage("p0", task);
  room.handleMessage("p0", task);
  assert.equal(room.taskProgress, 17);
  assert.equal(room.itemCharges.get("p0").FLASHLIGHT, 1);
  for (const client of clients) {
    assert.equal(client.sent.filter((msg) => msg.type === "STATION_COMPLETED").length, 1);
  }
  room.phase = "ORDEAL";
  room.phaseTime = 0.01;
  room.lastTick = Date.now() - 50;
  room.tick();
  assert.equal(room.phase, "CALM");
  assert.equal(room.roundId, 2);
  assert.equal(room.sealedStations.size, 0);
  assert.equal(room.completedStations.get("p0").size, 0);
  assert.equal(room.taskProgress, 17);
  assert.equal(room.itemCharges.get("p0").FLASHLIGHT, 1);
  const world = clients[1].sent.filter((msg) => msg.type === "SYNC_WORLD").at(-1);
  assert.equal(world.roundId, 2);
  assert.deepEqual(world.completedStations, []);
  room.handleMessage("p0", { ...task, roundId: 2 });
  assert.equal(room.taskProgress, 34);
  assert.equal(room.itemCharges.get("p0").FLASHLIGHT, 2);
});

test("a delayed task from an older round cannot claim a fresh reward or create a pulse", (t) => {
  const { room, clients } = match(t);
  room.roundId = 2;
  room.handleMessage("p0", { type: "TASK_UPDATE", stationId: "FROST FONT", reward: "FLASHLIGHT", roundId: 1 });
  assert.equal(room.taskProgress, 0);
  assert.equal(room.itemCharges.get("p0").FLASHLIGHT, 0);
  assert.equal(clients[1].sent.filter((msg) => msg.type === "STATION_COMPLETED").length, 0);
  assert.equal(clients[0].sent.find((msg) => msg.type === "GEAR_SYNC").accepted, false);
});

test("meeting resolution starts a fresh shrine round and clears fake-task locks too", (t) => {
  const { room } = match(t);
  room.handleMessage("p0", { type: "TASK_UPDATE", stationId: "FROST FONT", reward: "FLASHLIGHT", roundId: 1 });
  room.handleMessage("p3", { type: "TASK_UPDATE", stationId: "STAR ALTAR", reward: "SONAR", roundId: 1 });
  assert.equal(room.completedStations.get("p3").size, 1);
  room.phase = "DISCUSSION";
  room.resolveMeeting();
  assert.equal(room.roundId, 2);
  assert.equal(room.sealedStations.size, 0);
  assert.equal(room.completedStations.get("p3").size, 0);
  assert.equal(room.taskProgress, 17);
  assert.equal(room.itemCharges.get("p3").SONAR, 1);
});
