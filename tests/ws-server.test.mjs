import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { WebSocket } from "ws";
import { createRoomServer } from "../server/ws-service.ts";
import { gameRegistry } from "../server/game-room.ts";

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
    return socket;
  }
  return { url, connect, wss };
}

function waitFor(socket, type) {
  const existing = socket.messages.findIndex(msg => msg.type === type);
  if (existing >= 0) return Promise.resolve(socket.messages.splice(existing, 1)[0]);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off("message", check); reject(new Error(`Missing ${type}`)); }, 3000);
    function check() {
      const index = socket.messages.findIndex(msg => msg.type === type);
      if (index < 0) return;
      clearTimeout(timer);
      socket.off("message", check);
      resolve(socket.messages.splice(index, 1)[0]);
    }
    socket.on("message", check);
  });
}

function send(socket, message) { socket.send(JSON.stringify(message)); }

test("room server health supports the configured frontend and rejects unrelated origins", async t => {
  const { url, connect, wss } = await fixture(t);
  for (const origin of FRONTEND_ORIGINS) {
    const health = await fetch(`${url}/health`, { headers: { Origin: origin } });
    assert.equal(health.status, 200);
    assert.equal(health.headers.get("access-control-allow-origin"), origin);
    assert.equal((await health.json()).service, "moonwarden-ws");
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
  const accepted = await waitFor(impostor, "ABILITY_STATE");
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
