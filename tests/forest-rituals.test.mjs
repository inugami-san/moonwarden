import assert from "node:assert/strict";
import test from "node:test";
import { createRitual, ritualAnswerIsCorrect } from "../server/forest-rituals.ts";
import { ForestUtilities, wispDestination } from "../server/forest-utilities.ts";
import { GameRoom } from "../server/game-room.ts";
import { createMatchLayout, shrineRoutesReachable } from "../server/match-layout.ts";
import { getRootCell, CENTER } from "../server/sanctuary-map.ts";

function setup(t) {
  let now = 100000;
  t.mock.method(Date, "now", () => now);
  const room = new GameRoom("RITE"), clients = [];
  for (let i = 0; i < 4; i++) {
    const client = { readyState: 1, sent: [], send(data) { this.sent.push(JSON.parse(data)); }, close() {} };
    clients.push(client); room.addClient(`p${i}`, client, `Warden ${i}`, "#20d8ed", "hood");
  }
  t.after(() => room.destroy());
  const start = () => room.handleMessage("p0", { type: "START_MATCH", botFill: false, targetPlayers: 4 });
  const advance = (ms = 1000) => { now += ms; };
  const open = (id = "p0", station = room.stations[0]) => {
    Object.assign(room.players.get(id), { x: station.x, y: station.y });
    room.handleMessage(id, { type: "OPEN_RITUAL", stationId: station.id, roundId: room.roundId });
    return clients[Number(id.slice(1))].sent.filter(message => message.type === "RITUAL_CHALLENGE").at(-1)?.challenge;
  };
  return { room, clients, start, advance, open };
}

test("rituals change every attempt and reject malformed, partial and incorrect submissions", () => {
  for (const kind of ["ROOT", "MOON", "FIREFLY"]) for (const difficulty of ["STANDARD", "CHALLENGING"]) {
    const a = createRitual(kind, difficulty, 123, 1), b = createRitual(kind, difficulty, 123, 2);
    assert.notDeepEqual(a.target, b.target);
    assert.notEqual(a.id, b.id);
    assert.ok(ritualAnswerIsCorrect(a, a.target));
    for (const bad of [null, {}, [], a.initial, a.target.slice(1), a.target.map(String)]) assert.equal(ritualAnswerIsCorrect(a, bad), false);
    assert.ok(a.target.length >= 2 && a.target.length <= 5);
  }
});

test("every generated root solution really connects spring, all tiles and flower", () => {
  const ends = [[[-1, 0], [0, -1]], [[0, -1], [1, 0]], [[1, 0], [0, 1]], [[0, 1], [-1, 0]]];
  for (const difficulty of ["STANDARD", "CHALLENGING"]) for (let attempt = 1; attempt <= 8; attempt++) {
    const challenge = createRitual("ROOT", difficulty, 42, attempt);
    challenge.cells.forEach((cell, index) => {
      const neighbours = ends[challenge.target[index]].map(([x, y]) => ({ x: cell.x + x, y: cell.y + y }));
      const previous = index ? challenge.cells[index - 1] : challenge.entry;
      const next = index === challenge.cells.length - 1 ? challenge.exit : challenge.cells[index + 1];
      assert.ok(neighbours.some(p => p.x === previous.x && p.y === previous.y));
      assert.ok(neighbours.some(p => p.x === next.x && p.y === next.y));
    });
  }
});

test("station landmarks stay in their named area across curated variations and both approaches stay open", () => {
  const original = createMatchLayout(1).stations;
  for (let seed = 0; seed < 60; seed++) {
    const layout = createMatchLayout(seed * 17239);
    assert.ok(shrineRoutesReachable(layout.stations, layout.obstacles));
    layout.stations.forEach((station, index) => {
      assert.equal(station.id, original[index].id);
      assert.equal(getRootCell(station.x, station.y).index, getRootCell(original[index].x, original[index].y).index);
      assert.ok(Math.hypot(station.x - original[index].x, station.y - original[index].y) < 250);
    });
  }
});

test("difficulty is host controlled; utilities are personal, available to either role, and frozen at match start", t => {
  const { room, start } = setup(t);
  room.handleMessage("p1", { type: "SET_DIFFICULTY", difficulty: "CHALLENGING" });
  assert.equal(room.puzzleDifficulty, "STANDARD");
  room.handleMessage("p0", { type: "SET_DIFFICULTY", difficulty: "CHALLENGING" });
  room.handleMessage("p1", { type: "SET_UTILITY", utility: "WATCHROOT" });
  start();
  assert.equal(room.puzzleDifficulty, "CHALLENGING");
  assert.equal(room.utilities.state("p1", Date.now()).kind, "WATCHROOT");
  room.handleMessage("p1", { type: "SET_UTILITY", utility: "WISP_STEP" });
  room.handleMessage("p0", { type: "SET_DIFFICULTY", difficulty: "STANDARD" });
  assert.equal(room.utilities.state("p1", Date.now()).kind, "WATCHROOT");
  assert.equal(room.puzzleDifficulty, "CHALLENGING");
});

test("server owns ritual attempts, failure, retry, rewards and replay protection", t => {
  const { room, clients, start, advance, open } = setup(t); start();
  const station = room.stations[0];
  const first = open(); assert.ok(first);
  room.handleMessage("p0", { type: "TASK_UPDATE", stationId: station.id, reward: station.reward, roundId: 1 });
  assert.equal(room.itemCharges.get("p0")[station.reward], 0, "direct claims cannot bypass a puzzle");
  advance();
  room.handleMessage("p0", { type: "ANSWER_RITUAL", challengeId: first.id, answer: first.initial, roundId: 1 });
  assert.equal(clients[0].sent.at(-1).type, "RITUAL_FAILED");
  assert.equal(open(), null, "failed attempts have a short retry delay");
  advance(1600);
  const second = open(); assert.notDeepEqual(second.target, first.target);
  advance();
  const answer = { type: "ANSWER_RITUAL", challengeId: second.id, answer: second.target, roundId: 1 };
  room.handleMessage("p0", answer); room.handleMessage("p0", answer);
  assert.equal(room.itemCharges.get("p0")[station.reward], 1);
  assert.equal(room.utilities.state("p0", Date.now()).charge, 1);
  assert.equal(open(), null, "completed shrines stay sealed for this player");
  assert.equal(clients[1].sent.some(message => message.type === "RITUAL_CHALLENGE"), false, "private puzzle stays private");
});

test("ritual answers reject dead, departed, stale-round and meeting attempts", t => {
  const { room, start, advance, open } = setup(t); start();
  const player = room.players.get("p0"), station = room.stations[0];
  for (const condition of ["dead", "distant", "stale", "meeting"]) {
    player.alive = true; room.phase = "CALM"; advance(2000);
    const challenge = open(); assert.ok(challenge); advance();
    if (condition === "dead") player.alive = false;
    if (condition === "distant") Object.assign(player, CENTER);
    if (condition === "meeting") room.phase = "DISCUSSION";
    room.handleMessage("p0", { type: "ANSWER_RITUAL", challengeId: challenge.id, answer: challenge.target, roundId: condition === "stale" ? 0 : 1 });
    assert.equal(room.itemCharges.get("p0")[station.reward], 0, condition);
  }
});

test("Wisp Step is swept against obstacles and cannot cross a sealed Rootwake cell", () => {
  const start = { x: 300, y: 300 };
  assert.equal(wispDestination(start, 0, [], false).x, 440);
  const obstacle = { id: "rock", x: 360, y: 300, r: 22 };
  assert.ok(wispDestination(start, 0, [obstacle], false).x <= 316);
  const edge = { x: 650, y: 400 };
  const destination = wispDestination(edge, 0, [], true);
  assert.equal(getRootCell(edge.x, edge.y).index, getRootCell(destination.x, destination.y).index);
});

test("utilities require earned charges and cooldown; Watchroot trips once, anonymously, for any living slime", () => {
  const utility = new ForestUtilities(), actor = { id: "owner", x: 960, y: 570, alive: true };
  assert.equal(utility.use(actor.id, actor, 0, 0, [], false), null);
  utility.select(actor.id, "WATCHROOT"); utility.earn(actor.id); utility.earn(actor.id);
  assert.equal(utility.state(actor.id, 0).charge, 1, "charges cap at one");
  assert.ok(utility.use(actor.id, actor, 0, 0, [], false));
  utility.earn(actor.id);
  assert.equal(utility.use(actor.id, actor, 0, 1000, [], false), null);
  utility.tick([actor], 800);
  actor.x += 100;
  const triggers = utility.tick([actor], 900);
  assert.equal(triggers.length, 1, "the owner can also trigger their own root");
  assert.equal("playerId" in triggers[0], false); assert.equal("role" in triggers[0], false);
  assert.equal(utility.tick([actor], 1000).length, 0);
  assert.ok(utility.use(actor.id, actor, 0, 18001, [], false));
  utility.tick([actor], 31000); assert.equal(utility.roots.length, 0);
});

test("server enforces utility phase, life, earned charge, cooldown and private state", t => {
  const { room, clients, start } = setup(t); start();
  const player = room.players.get("p0"); Object.assign(player, CENTER);
  const use = () => room.handleMessage("p0", { type: "USE_UTILITY", angle: 0, roundId: 1 });
  use(); assert.equal(clients[0].sent.at(-1).accepted, false);
  room.utilities.earn("p0"); use(); assert.equal(clients[0].sent.at(-1).accepted, false);
  room.phase = "ORDEAL"; room.hazard = "FOG";
  player.alive = false; use(); assert.equal(clients[0].sent.at(-1).accepted, false);
  player.alive = true; use(); assert.equal(clients[0].sent.at(-1).accepted, true);
  assert.ok(player.x > CENTER.x);
  use(); assert.equal(clients[0].sent.at(-1).accepted, false);
  assert.equal(clients[1].sent.filter(message => message.type === "UTILITY_STATE").length, 1, "other players only receive their own lobby state");
});
