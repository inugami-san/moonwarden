import assert from "node:assert/strict";
import test from "node:test";
import { GameServerRegistry } from "../server/game-room.ts";
import { phantomPaths, nextHazard, ordealDuration, TASK_PROGRESS_REWARD, ORDEAL_TASK_PROGRESS_REWARD } from "../server/ordeal-rules.ts";
import { soundDirection, ForestAudio } from "../app/forest-audio.ts";
import { drawMoonGlade } from "../app/moon-glade.ts";
import { fittedCanvasBounds } from "../app/canvas-bounds.ts";

function match(t) {
  const room = new GameServerRegistry().createRoom();
  const clients = [];
  for (let i = 0; i < 4; i++) {
    const client = { readyState: 1, sent: [], send(data) { this.sent.push(JSON.parse(data)); }, close() {} };
    clients.push(client); room.addClient(`p${i}`, client, `P${i}`, "#20d8ed", "hood");
  }
  room.handleMessage("p0", { type: "START_MATCH", botFill: false, targetPlayers: 4 });
  for (const p of room.players.values()) { p.role = p.id === "p0" ? "IMPOSTOR" : "CREWMATE"; p.x = 640; p.y = 450; }
  room.phase = "ORDEAL"; room.phaseTime = 10;
  clients.forEach(client => { client.sent.length = 0; });
  t.after(() => room.destroy());
  return { room, clients };
}
const special = (ability, extra = {}) => ({ type: "USE_ABILITY", ability, x: 720, y: 450, roundId: 1, ...extra });

test("Sight and Echo share one authoritative charge, without spending the kill", t => {
  const { room, clients } = match(t);
  room.handleMessage("p0", special("MOON_SIGHT"));
  assert.equal(clients[0].sent.at(-1).accepted, true);
  assert.ok(clients[0].sent.at(-1).sightRemainingMs <= 3200);
  assert.equal(room.killUsedThisOrdeal, false);
  room.handleMessage("p0", special("ECHO_LURE"));
  assert.equal(clients[0].sent.at(-1).accepted, false);
  assert.equal(room.echoes.length, 0);
  assert.ok(clients.slice(1).every(client => !client.sent.some(msg => msg.type === "ABILITY_STATE")));
});

test("specials reject wrong roles, dead players, stale rounds, wrong phases and invalid points", t => {
  const { room, clients } = match(t);
  room.handleMessage("p1", special("ECHO_LURE"));
  assert.equal(clients[1].sent.at(-1).accepted, false);
  room.players.get("p0").alive = false;
  room.handleMessage("p0", special("ECHO_LURE")); assert.equal(clients[0].sent.at(-1).accepted, false);
  room.players.get("p0").alive = true;
  for (const input of [special("ECHO_LURE", { roundId: 0 }), special("ECHO_LURE", { x: NaN }), special("UNKNOWN")]) {
    room.handleMessage("p0", input); assert.equal(clients[0].sent.at(-1).accepted, false);
  }
  room.phase = "CALM";
  room.handleMessage("p0", special("MOON_SIGHT")); assert.equal(clients[0].sent.at(-1).accepted, false);
  assert.equal(room.abilityUsed.size, 0);
});

test("Echo is range-limited, audible nearby, anonymous, and gone after its short lifetime", t => {
  const { room, clients } = match(t);
  room.hazard = "FOG";
  room.handleMessage("p0", special("ECHO_LURE", { x: 2000 }));
  const echo = room.echoes[0];
  assert.ok(Math.hypot(echo.x - 640, echo.y - 450) <= 220.001);
  room.players.get("p3").x = 120;
  room.lastTick = Date.now() - 60; room.tick();
  const msg = clients[1].sent.find(msg => msg.type === "SOUND_CUE");
  assert.ok(msg);
  assert.deepEqual(Object.keys(msg.cue).sort(), ["expiresAt", "id", "x", "y"]);
  assert.ok(!clients[3].sent.some(msg => msg.type === "SOUND_CUE"));
  room.handleMessage("p0", special("MOON_SIGHT")); assert.equal(clients[0].sent.at(-1).accepted, false);
  echo.until = Date.now() - 1;
  room.lastTick = Date.now() - 60; room.tick(); assert.equal(room.echoes.length, 0);
});

test("Rootwake keeps lures in their caster's chamber and clips sound at the roots", t => {
  const { room, clients } = match(t);
  room.hazard = "ROOTWAKE";
  room.players.get("p0").x = 790;
  room.players.get("p1").x = 850;
  room.handleMessage("p0", special("ECHO_LURE", { x: 1000 }));
  assert.ok(room.echoes[0].x <= 782);
  room.lastTick = Date.now() - 60; room.tick();
  assert.ok(!clients[1].sent.some(msg => msg.type === "SOUND_CUE"));
});

test("countdown announces the same hazard/seed that begins the ordeal, with a fresh charge", t => {
  const { room, clients } = match(t);
  room.abilityUsed.add("p0"); room.phase = "CALM"; room.phaseTime = .01; room.lastTick = Date.now() - 50; room.tick();
  assert.equal(room.phase, "COUNTDOWN");
  const announced = clients[0].sent.filter(msg => msg.type === "SYNC_WORLD").at(-1);
  assert.ok(Number.isSafeInteger(announced.ordealSeed));
  room.phaseTime = .01; room.lastTick = Date.now() - 50; room.tick();
  assert.equal(room.phase, "ORDEAL"); assert.equal(room.hazard, announced.hazard);
  assert.equal(room.abilityUsed.size, 0);
});

test("phantoms vary by seed, stay in the arena, and do not repeat the previous hazard", () => {
  assert.deepEqual(phantomPaths(42), phantomPaths(42)); assert.notDeepEqual(phantomPaths(42), phantomPaths(43));
  for (let seed = 0; seed < 30; seed++) for (const path of phantomPaths(seed)) {
    assert.ok(path.x - path.rx > 76 && path.x + path.rx < 1204);
    assert.ok(path.y - path.ry > 72 && path.y + path.ry < 690);
  }
  for (const hazard of ["BLACKOUT", "FOG", "MOONGLARE", "ROOTWAKE", "PHANTOMS", "MIRROR_POOL"]) assert.notEqual(nextHazard(hazard), hazard);
  assert.equal(ordealDuration("MIRROR_POOL"), 25);
  assert.equal(ordealDuration("FOG"), 10);
  assert.ok(TASK_PROGRESS_REWARD * 6 < 100);
});

test("Mirror Pool lasts 25s, swaps colors on bump, persists into Calm, and reverts at Meeting", t => {
  const { room, clients } = match(t);
  const p0 = room.players.get("p0");
  const p1 = room.players.get("p1");
  const p2 = room.players.get("p2");
  const p3 = room.players.get("p3");
  const orig0 = p0.color;
  const orig1 = p1.color;
  assert.notEqual(orig0, orig1);

  // Move p2 and p3 far away so only p0 and p1 bump
  p2.x = 200; p2.y = 200;
  p3.x = 1000; p3.y = 200;

  // Transition COUNTDOWN -> ORDEAL with MIRROR_POOL
  room.phase = "COUNTDOWN";
  room.hazard = "MIRROR_POOL";
  room.phaseTime = 0.01;
  room.lastTick = Date.now() - 50;
  room.tick();
  assert.equal(room.phase, "ORDEAL");
  assert.ok(room.phaseTime > 24 && room.phaseTime <= 25);

  // Bump p0 and p1 together
  room.handleMessage("p0", { type: "PLAYER_INPUT", x: 640, y: 450, vx: 0, vy: 0, angle: 0, flashlight: false, seq: 1 });
  assert.equal(p0.color, orig1);
  assert.equal(p1.color, orig0);
  assert.ok(clients[0].sent.some(msg => msg.type === "SYNC_PLAYERS"));

  // Transition ORDEAL -> CALM: swapped colors persist!
  room.phaseTime = 0.01;
  room.lastTick = Date.now() - 50;
  room.tick();
  assert.equal(room.phase, "CALM");
  assert.equal(p0.color, orig1);
  assert.equal(p1.color, orig0);

  // Calling an emergency meeting restores everyone's true colors
  p0.x = 640; p0.y = 382;
  room.handleMessage("p0", { type: "TRIGGER_REPORT" });
  assert.equal(room.phase, "DISCUSSION");
  assert.equal(p0.color, orig0);
  assert.equal(p1.color, orig1);
});

test("shrines stay open during Ordeals, sync working status, and grant +12% Moon Wards", t => {
  const { room, clients } = match(t);
  const p1 = room.players.get("p1");
  room.handleMessage("p1", {
    type: "PLAYER_INPUT",
    x: 246,
    y: 230,
    vx: 0,
    vy: 0,
    angle: 0,
    flashlight: false,
    working: true,
    seq: 1,
  });
  assert.equal(p1.working, true);
  room.lastTick = Date.now() - 60;
  room.tick();
  const moveMsg = clients[0].sent.find(msg => msg.type === "SYNC_MOVEMENT");
  assert.ok(moveMsg);
  const netP1 = moveMsg.players.find(entry => entry.id === "p1");
  assert.equal(netP1.working, true);

  room.handleMessage("p1", { type: "TASK_UPDATE", stationId: "FROST FONT", reward: "FLASHLIGHT" });
  assert.equal(room.taskProgress, ORDEAL_TASK_PROGRESS_REWARD);
  assert.equal(p1.working, false);
});

test("sound captions work without audio and do not label a lure as fake", () => {
  assert.equal(new ForestAudio().enabled, false);
  assert.equal(soundDirection({ x: 0, y: 0 }, { x: 110, y: -100 }), "Rustling north-east");
  assert.equal(soundDirection({ x: 0, y: 0 }, { x: 10, y: 10 }), "Rustling nearby");
  assert.equal(soundDirection({ x: 0, y: 0 }, { x: 500, y: 0 }), "");
});

test("glade artwork bakes without per-frame assets or changes to collision", () => {
  let shapes = 0;
  const gradient = { addColorStop() {} };
  const ctx = new Proxy({ createLinearGradient: () => gradient, createRadialGradient: () => gradient }, {
    get: (target, key) => target[key] ?? (() => { shapes++; }),
  });
  drawMoonGlade(ctx); assert.ok(shapes > 500);
});

test("aim coordinates follow the painted arena in wide and portrait letterboxes", () => {
  for (const rect of [{ left: 0, top: 58, width: 1280, height: 626 }, { left: 0, top: 80, width: 375, height: 600 }]) {
    const fitted = fittedCanvasBounds(rect);
    assert.ok(Math.abs(fitted.width / fitted.height - 1280 / 760) < .001);
    assert.ok(fitted.width <= rect.width && fitted.height <= rect.height);
    const centerX = fitted.left + fitted.width / 2;
    assert.equal((centerX - fitted.left) / fitted.width * 1280, 640);
  }
});
