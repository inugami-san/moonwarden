import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { WebSocket } from "ws";
import { createRoomServer } from "../server/ws-service.ts";
import { gameRegistry } from "../server/game-room.ts";
import { STATIONS } from "../server/sanctuary-map.ts";
import { GAME_RELEASE_VERSION, GAME_WORLD_VERSION } from "../server/game-version.ts";
import { MultiplayerClient } from "../app/network.ts";
import { resolveObstaclePosition } from "../server/ordeal-rules.ts";

const FRONTEND_ORIGINS = ["https://moonwarden-two.vercel.app", "https://moonwarden-pi.vercel.app", "https://moonwarden-christainj.vercel.app"];

async function fixture(t) {
  const { server, wss } = createRoomServer({ allowedOrigins: FRONTEND_ORIGINS, heartbeatMs: 100 });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}`;
  const clients = [];
  t.after(async () => {
    for (const socket of clients) socket.terminate();
    for (const socket of wss.clients) socket.terminate();
    await new Promise(resolve => server.close(resolve));
  });
  async function connect(origin = FRONTEND_ORIGINS[0]) {
    const socket = new WebSocket(url.replace("http:", "ws:"), { origin });
    clients.push(socket);
    socket.messages = [];
    socket.on("message", data => socket.messages.push(JSON.parse(data.toString())));
    await once(socket, "open");
    send(socket, { type: "CLIENT_HELLO", worldVersion: GAME_WORLD_VERSION });
    const info = await waitFor(socket, "SERVER_INFO");
    assert.equal(info.compatible, true);
    assert.equal(info.worldVersion, GAME_WORLD_VERSION);
    assert.equal(info.version, GAME_RELEASE_VERSION);
    return socket;
  }
  return { url, connect, wss };
}

function waitFor(socket, type, predicate = () => true) {
  const existing = socket.messages.findIndex(msg => msg.type === type && predicate(msg));
  if (existing >= 0) return Promise.resolve(socket.messages.splice(existing, 1)[0]);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off("message", check); reject(new Error(`Missing ${type}`)); }, 3000);
    function check() {
      const index = socket.messages.findIndex(msg => msg.type === type && predicate(msg));
      if (index < 0) return;
      clearTimeout(timer);
      socket.off("message", check);
      resolve(socket.messages.splice(index, 1)[0]);
    }
    socket.on("message", check);
  });
}

function send(socket, message) { socket.send(JSON.stringify(message)); }

test("real sockets share seeded layouts, private Hollow teams, and delayed-puddle strikes", async t => {
  const { connect } = await fixture(t);
  const sockets = await Promise.all(Array.from({ length: 6 }, () => connect()));
  send(sockets[0], { type: "CREATE_ROOM", playerName: "Host", color: "#20d8ed", hat: "hood" });
  const created = await waitFor(sockets[0], "ROOM_STATE");
  for (let i = 1; i < sockets.length; i++) {
    send(sockets[i], { type: "JOIN_ROOM", roomCode: created.roomCode, playerName: `Guest ${i}`, color: "#20d8ed", hat: "hood" });
    await waitFor(sockets[i], "ROOM_STATE");
  }
  send(sockets[0], { type: "UPDATE_ROOM_CONFIG", targetPlayers: 6, botFill: false, hollowCount: 2 });
  let config;
  do { config = await waitFor(sockets[0], "LOBBY_UPDATED"); } while (config.hollowCount !== 2);
  const started = sockets.map(socket => waitFor(socket, "MATCH_STARTED"));
  send(sockets[0], { type: "START_MATCH", botFill: false, targetPlayers: 6 });
  const matches = await Promise.all(started);
  assert.equal(new Set(matches.map(match => match.layoutSeed)).size, 1);
  assert.equal(matches.filter(match => match.role === "IMPOSTOR").length, 2);
  assert.ok(matches.filter(match => match.role === "CREWMATE").every(match => match.hollowAllies === undefined));
  const killerIndex = matches.findIndex(match => match.role === "IMPOSTOR"), victimIndex = matches.findIndex(match => match.role === "CREWMATE");
  const room = gameRegistry.getRoom(created.roomCode);
  const order = [...room.players.values()];
  for (const player of order) { player.x = 960; player.y = 573; }
  room.phase = "ORDEAL"; room.phaseTime = 10; room.ordealNumber = 1;
  sockets.forEach(socket => { socket.messages.length = 0; });
  const victimId = order[victimIndex].id;
  send(sockets[killerIndex], { type: "TRIGGER_KILL", victimId, style: "STEALTH" });
  const result = await waitFor(sockets[killerIndex], "KILL_RESULT");
  assert.equal(result.accepted, true); assert.equal(result.spent, true);
  assert.equal(room.bodies.length, 0);
  assert.equal((await waitFor(sockets[victimIndex], "DEATH_EVENT")).killerName, order[killerIndex].name);
  const arrived = waitFor(sockets[0], "BODY_SPAWNED");
  room.pendingBodies[0].at = Date.now() - 1;
  room.tick();
  const body = (await arrived).body;
  assert.equal(body.id, `body-${victimId}`); assert.equal(body.delayed, true);
});

test("a cached legacy WebSocket page is rejected before a room is created", async t => {
  const { url } = await fixture(t);
  const socket = new WebSocket(url.replace("http:", "ws:"), { origin: FRONTEND_ORIGINS[0] });
  socket.messages = [];
  socket.on("message", data => socket.messages.push(JSON.parse(data.toString())));
  await once(socket, "open");
  const rejected = waitFor(socket, "ERROR_ALERT");
  send(socket, { type: "CREATE_ROOM", playerName: "Old page", color: "#20d8ed", hat: "hood" });
  assert.match((await rejected).message, /different map versions/);
  assert.equal(socket.messages.some(message => message.type === "ROOM_STATE"), false);
  assert.equal(socket.messages.find(message => message.type === "SERVER_INFO").compatible, false);
  socket.terminate();
});

test("real sockets keep Moonsway receipts private and count the redirected ballot once", async t => {
  const { connect } = await fixture(t);
  const sockets = await Promise.all(Array.from({ length: 5 }, () => connect()));
  send(sockets[0], { type: "CREATE_ROOM", playerName: "Host", color: "#20d8ed", hat: "hood" });
  const created = await waitFor(sockets[0], "ROOM_STATE");
  for (let i = 1; i < sockets.length; i++) {
    send(sockets[i], { type: "JOIN_ROOM", roomCode: created.roomCode, playerName: `Guest ${i}`, color: "#20d8ed", hat: "hood" });
    await waitFor(sockets[i], "ROOM_STATE");
  }
  send(sockets[0], { type: "START_MATCH", botFill: false, targetPlayers: 5, hollowCount: 1, chaosMoonsway: true });
  await Promise.all(sockets.map(socket => waitFor(socket, "MATCH_STARTED")));
  const room = gameRegistry.getRoom(created.roomCode);
  const players = [...room.players.values()];
  const killer = players.find(player => player.role === "IMPOSTOR");
  const wardens = players.filter(player => player.role === "CREWMATE");
  const reporter = wardens[0], victim = wardens[3];
  const socketFor = player => sockets[players.indexOf(player)];
  for (const player of players) { player.x = 960; player.y = 573; }
  room.phase = "ORDEAL";
  room.phaseTime = 8;
  room.executeKill(victim, killer);
  await waitFor(socketFor(victim), "DEATH_EVENT");
  send(socketFor(reporter), { type: "TRIGGER_REPORT" });
  const meeting = await waitFor(socketFor(reporter), "MEETING_CALLED");
  assert.equal(meeting.bodyReporterId, reporter.id);
  t.mock.method(Math, "random", () => 0);
  send(socketFor(reporter), { type: "CAST_VOTE", targetId: killer.id });
  const receipt = await waitFor(socketFor(reporter), "VOTE_RECEIPT");
  assert.equal(receipt.accepted, true);
  assert.equal(receipt.shifted, true);
  assert.notEqual(receipt.targetId, killer.id);
  assert.notEqual(receipt.targetId, reporter.id);
  assert.notEqual(receipt.targetId, victim.id);
  const otherVoters = players.filter(player => player.alive && player.id !== reporter.id);
  for (const player of otherVoters) send(socketFor(player), { type: "CAST_VOTE", targetId: null });
  const concluded = await waitFor(socketFor(reporter), "MEETING_CONCLUDED");
  assert.equal(concluded.tally.find(entry => entry.targetId === receipt.targetId).votes, 1);
  assert.equal(concluded.tally.find(entry => entry.targetId === killer.id).votes, 0);
  assert.equal(concluded.tally.reduce((total, entry) => total + entry.votes, 0), 4);
  for (const player of otherVoters) {
    const ownReceipt = await waitFor(socketFor(player), "VOTE_RECEIPT");
    assert.equal(ownReceipt.targetId, null);
    assert.equal(ownReceipt.shifted, false);
  }
});

test("paired rituals cross real WebSockets, award both players, and reject stale-round replays", async t => {
  const { connect } = await fixture(t);
  const sockets = await Promise.all(Array.from({ length: 4 }, () => connect()));
  send(sockets[0], { type: "CREATE_ROOM", playerName: "Pair host", color: "#20d8ed", hat: "hood" });
  const created = await waitFor(sockets[0], "ROOM_STATE");
  for (let i = 1; i < sockets.length; i++) {
    send(sockets[i], { type: "JOIN_ROOM", roomCode: created.roomCode, playerName: `Pair guest ${i}`, color: "#20d8ed", hat: "hood" });
    await waitFor(sockets[i], "ROOM_STATE");
  }
  send(sockets[0], { type: "START_MATCH", botFill: false, targetPlayers: 4 });
  const started = await Promise.all(sockets.map(socket => waitFor(socket, "MATCH_STARTED")));
  assert.ok(started.every(message => message.chaosMoonsway === false));
  const room = gameRegistry.getRoom(created.roomCode), station = room.stations[0];
  const players = [...room.players.values()];
  for (const player of players.slice(0, 2)) { player.x = station.x; player.y = station.y; player.vx = 0; player.vy = 0; }
  const accepted = sockets.slice(0, 2).map(socket => waitFor(socket, "GEAR_SYNC", message => message.accepted && message.stationId === station.id));
  const hold = () => { for (const socket of sockets.slice(0, 2)) send(socket, { type: "PAIR_RITUAL", active: true, stationId: station.id, roundId: room.roundId }); };
  hold(); const timer = setInterval(hold, 200);
  t.after(() => clearInterval(timer));
  const rewards = await Promise.all(accepted);
  clearInterval(timer);
  assert.ok(rewards.every(message => message.charges[station.reward] === 1));
  assert.ok(sockets[0].messages.some(message => message.type === "PAIR_RITUAL_STATE" && message.ritual.participants === 2));
  assert.ok(sockets.slice(2).every(socket => !socket.messages.some(message => message.type === "PAIR_RITUAL_STATE")));
  const round = room.roundId; room.resetStationsForRound();
  send(sockets[0], { type: "PAIR_RITUAL", active: true, stationId: station.id, roundId: round });
  send(sockets[0], { type: "PING", sentAt: 77 });
  await waitFor(sockets[0], "PONG", message => message.sentAt === 77);
  assert.equal(room.pairedRituals.intents.size, 0);
});

test("matching browser clients negotiate the expanded WebSocket world before co-op movement", async t => {
  const { url } = await fixture(t);
  const previous = { window: globalThis.window, WebSocket: globalThis.WebSocket, wsUrl: process.env.NEXT_PUBLIC_WS_URL };
  globalThis.window = { location: { protocol: "http:", hostname: "127.0.0.1", host: "127.0.0.1:3000" }, setTimeout, clearTimeout, setInterval, clearInterval };
  globalThis.WebSocket = WebSocket;
  process.env.NEXT_PUBLIC_WS_URL = `${url.replace("http:", "ws:")}/ws`;
  const host = new MultiplayerClient(), guest = new MultiplayerClient();
  t.after(() => {
    host.disconnect(); guest.disconnect();
    if (previous.window === undefined) delete globalThis.window;
    else globalThis.window = previous.window;
    globalThis.WebSocket = previous.WebSocket;
    if (previous.wsUrl === undefined) delete process.env.NEXT_PUBLIC_WS_URL;
    else process.env.NEXT_PUBLIC_WS_URL = previous.wsUrl;
  });
  const nextMessage = (client, type, predicate = () => true) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { off(); reject(new Error(`Missing ${type}`)); }, 3000);
    const off = client.onMessage(message => { if (message.type === type && predicate(message)) { clearTimeout(timer); off(); resolve(message); } });
  });
  await Promise.all([host.connect(), guest.connect()]);
  assert.equal(host.connected, true); assert.equal(guest.connected, true);
  const created = nextMessage(host, "ROOM_STATE");
  host.createRoom("Browser Host", "#20d8ed", "hood");
  await created;
  const joined = nextMessage(guest, "ROOM_STATE");
  guest.joinRoom(host.roomCode, "Browser Guest", "#20d8ed", "hood");
  await joined;
  assert.equal(guest.players.length, 2);
  const started = nextMessage(host, "MATCH_STARTED");
  host.startMatch(true, 4);
  await started;
  const room = gameRegistry.getRoom(host.roomCode);
  const player = room.players.get(host.playerId);
  for (const [x, y] of [[1500, 800], [450, 225]]) {
    const seq = host.sendInput(x, y, 0, 0, 0, false);
    const pending = nextMessage(guest, "SYNC_MOVEMENT", message => message.players.some(entry => entry.id === host.playerId && entry.inputSeq === seq));
    // Wait for the next server tick rather than inspecting input before the
    // real socket has delivered its bytes to the authoritative room.
    const movement = await pending;
    const entry = movement.players.find(entry => entry.id === host.playerId);
    assert.equal(entry.inputSeq, seq);
    assert.deepEqual({ x: player.x, y: player.y }, resolveObstaclePosition(x, y, 22, room.obstacles));
  }
});

test("room server health supports the configured frontend and rejects unrelated origins", async t => {
  const { url, connect, wss } = await fixture(t);
  for (const origin of FRONTEND_ORIGINS) {
    const health = await fetch(`${url}/health`, { headers: { Origin: origin } });
    assert.equal(health.status, 200);
    assert.equal(health.headers.get("access-control-allow-origin"), origin);
    const info = await health.json();
    assert.equal(info.service, "moonwarden-ws");
    assert.equal(info.worldVersion, GAME_WORLD_VERSION);
    assert.equal(info.version, GAME_RELEASE_VERSION);
    await connect(origin);
  }
  assert.equal((await fetch(`${url}/health`, { headers: { Origin: "https://unrelated.example" } })).status, 403);
  await assert.rejects(connect("https://unrelated.example"), /403/);
  assert.equal(wss.options.maxPayload, 16_384);
});

test("three real WebSocket connections share discovery, roster, colors, start, and movement", async t => {
  const { connect } = await fixture(t);
  const [host, guest, third] = await Promise.all([connect(), connect(), connect()]);
  send(host, { type: "CREATE_ROOM", playerName: "Host", color: "#20d8ed", hat: "hood", eyeStyle: "STARRY" });
  const created = await waitFor(host, "ROOM_STATE");
  for (const [socket, playerName] of [[guest, "Guest"], [third, "Third"]]) {
    send(socket, { type: "LIST_ROOMS" });
    const list = await waitFor(socket, "ROOMS_LIST");
    assert.ok(list.rooms.some(room => room.code === created.roomCode));
    send(socket, { type: "JOIN_ROOM", roomCode: created.roomCode, playerName, color: "#20d8ed", hat: "hood", eyeStyle: "ROUND" });
    const joined = await waitFor(socket, "ROOM_STATE");
    assert.equal(joined.players.find(p => p.id === joined.playerId).eyeStyle, "ROUND");
  }
  send(host, { type: "UPDATE_PROFILE", playerName: "Host", color: "#20d8ed", hat: "hood", eyeStyle: "JOYFUL" });
  const roster = await waitFor(third, "LOBBY_UPDATED");
  assert.equal(roster.players.find(p => p.id === created.playerId).eyeStyle, "JOYFUL");
  const waiting = [host, guest, third].map(socket => waitFor(socket, "MATCH_STARTED"));
  send(host, { type: "START_MATCH", botFill: true, targetPlayers: 6 });
  const matches = await Promise.all(waiting);
  for (const match of matches) {
    assert.equal(match.players.length, 6);
    assert.equal(new Set(match.players.map(player => player.color)).size, 6);
    assert.equal(match.players.filter(player => !player.isAi).length, 3);
    assert.equal(match.players.find(p => p.id === created.playerId).eyeStyle, "JOYFUL");
  }
  const player = matches[0].players.find(player => player.id === created.playerId);
  send(host, { type: "PLAYER_INPUT", x: player.x + 4, y: player.y, vx: 0, vy: 0, angle: 0, flashlight: false, seq: 1 });
  const movement = await waitFor(third, "SYNC_MOVEMENT");
  assert.ok(movement.players.some(entry => entry.id === created.playerId));
  assert.ok(movement.players.every(entry => !("role" in entry)), "movement must not expose private roles");
});

test("real sockets relay anonymous lures and enforce the shared special-action charge", async t => {
  const { connect } = await fixture(t);
  const sockets = await Promise.all([connect(), connect(), connect(), connect()]);
  send(sockets[0], { type: "CREATE_ROOM", playerName: "Host", color: "#20d8ed", hat: "hood" });
  const created = await waitFor(sockets[0], "ROOM_STATE");
  for (let i = 1; i < 4; i++) {
    send(sockets[i], { type: "JOIN_ROOM", roomCode: created.roomCode, playerName: `P${i}`, color: "#20d8ed", hat: "hood" });
    await waitFor(sockets[i], "ROOM_STATE");
  }
  const pending = sockets.map(socket => waitFor(socket, "MATCH_STARTED"));
  send(sockets[0], { type: "START_MATCH", botFill: false, targetPlayers: 4 });
  const matches = await Promise.all(pending);
  const impostor = sockets[matches.findIndex(match => match.role === "IMPOSTOR")];
  const crew = sockets[matches.findIndex(match => match.role === "CREWMATE")];
  const room = gameRegistry.getRoom(created.roomCode);
  room.phase = "ORDEAL"; room.phaseTime = 10; room.hazard = "FOG";
  for (const player of room.players.values()) { player.x = 640; player.y = 450; }
  for (const socket of sockets) socket.messages.length = 0;
  const request = { type: "USE_ABILITY", ability: "ECHO_LURE", x: 700, y: 450, roundId: 1 };
  send(crew, request);
  assert.equal((await waitFor(crew, "ABILITY_STATE")).accepted, false);
  send(impostor, request);
  let accepted;
  do { accepted = await waitFor(impostor, "ABILITY_STATE"); } while (!accepted.used);
  assert.equal(accepted.accepted, true); assert.equal(accepted.used, true);
  const sound = await waitFor(crew, "SOUND_CUE");
  assert.deepEqual(Object.keys(sound.cue).sort(), ["expiresAt", "id", "x", "y"]);
  impostor.messages = impostor.messages.filter(msg => msg.type !== "ABILITY_STATE");
  send(impostor, { ...request, ability: "MOON_SIGHT" });
  // Periodic private syncs can precede this request's explicit rejection.
  let reply;
  do { reply = await waitFor(impostor, "ABILITY_STATE"); } while (reply.accepted);
  assert.equal(reply.used, true);
});

test("real sockets keep personal gear rites available after a teammate seals the ward", async t => {
  const { connect } = await fixture(t);
  const sockets = await Promise.all([connect(), connect(), connect(), connect()]);
  send(sockets[0], { type: "CREATE_ROOM", playerName: "Host", color: "#20d8ed", hat: "hood" });
  const created = await waitFor(sockets[0], "ROOM_STATE");
  for (let index = 1; index < sockets.length; index++) {
    send(sockets[index], { type: "JOIN_ROOM", roomCode: created.roomCode, playerName: `P${index}`, color: "#20d8ed", hat: "hood" });
    await waitFor(sockets[index], "ROOM_STATE");
  }
  const pending = sockets.map(socket => waitFor(socket, "MATCH_STARTED"));
  send(sockets[0], { type: "START_MATCH", botFill: false, targetPlayers: 4 });
  const matches = await Promise.all(pending);
  const crewIndices = matches.flatMap((match, index) => match.role === "CREWMATE" ? [index] : []);
  const [first, second] = crewIndices;
  const room = gameRegistry.getRoom(created.roomCode);
  const shrine = room.stations.find(station => station.id === "FROST FONT");
  for (const player of room.players.values()) { player.x = shrine.x; player.y = shrine.y + 60; }
  const task = { type: "TASK_UPDATE", stationId: shrine.id, reward: shrine.reward, roundId: room.roundId };
  send(sockets[first], task);
  const firstGear = await waitFor(sockets[first], "GEAR_SYNC");
  assert.equal(firstGear.accepted, true);
  assert.equal(firstGear.wardProgressGain, 4.7);
  assert.deepEqual(firstGear.completedStations, [shrine.id]);
  send(sockets[second], task);
  const secondGear = await waitFor(sockets[second], "GEAR_SYNC");
  assert.equal(secondGear.accepted, true);
  assert.equal(secondGear.wardProgressGain, 0);
  assert.equal(secondGear.charges.FLASHLIGHT, 1);
  assert.equal(room.taskProgress, 0, "public gauge settles independently of the completion packet");
  room.settleWards();
  assert.equal(room.taskProgress, 4.7);
  const pulse = await waitFor(sockets[crewIndices[2]], "STATION_COMPLETED");
  assert.deepEqual(Object.keys(pulse).sort(), ["roundId", "sequence", "stationId", "type"]);
  assert.ok(!sockets[crewIndices[2]].messages.some(message => message.type === "GEAR_SYNC"));
  sockets.forEach(socket => { socket.messages.length = 0; });
  room.phase = "ORDEAL";
  room.phaseTime = 0.01;
  room.lastTick = Date.now() - 50;
  room.tick();
  const reset = await waitFor(sockets[first], "GEAR_SYNC");
  assert.equal(reset.roundId, 2);
  assert.deepEqual(reset.completedStations, []);
  assert.equal(reset.charges.FLASHLIGHT, 1, "next Calm reopens tasks without taking earned gear away");
});
