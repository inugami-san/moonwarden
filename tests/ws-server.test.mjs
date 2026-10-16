import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { WebSocket } from "ws";
import { createRoomServer } from "../server/ws-service.ts";

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
  send(host, { type: "CREATE_ROOM", playerName: "Host", color: "#20d8ed", hat: "hood" });
  const created = await waitFor(host, "ROOM_STATE");
  for (const [socket, playerName] of [[guest, "Guest"], [third, "Third"]]) {
    send(socket, { type: "LIST_ROOMS" });
    const list = await waitFor(socket, "ROOMS_LIST");
    assert.ok(list.rooms.some(room => room.code === created.roomCode));
    send(socket, { type: "JOIN_ROOM", roomCode: created.roomCode, playerName, color: "#20d8ed", hat: "hood" });
    await waitFor(socket, "ROOM_STATE");
  }
  const waiting = [host, guest, third].map(socket => waitFor(socket, "MATCH_STARTED"));
  send(host, { type: "START_MATCH", botFill: true, targetPlayers: 6 });
  const matches = await Promise.all(waiting);
  for (const match of matches) {
    assert.equal(match.players.length, 6);
    assert.equal(new Set(match.players.map(player => player.color)).size, 6);
    assert.equal(match.players.filter(player => !player.isAi).length, 3);
  }
  const player = matches[0].players.find(player => player.id === created.playerId);
  send(host, { type: "PLAYER_INPUT", x: player.x + 4, y: player.y, vx: 0, vy: 0, angle: 0, flashlight: false, seq: 1 });
  const movement = await waitFor(third, "SYNC_MOVEMENT");
  assert.ok(movement.players.some(entry => entry.id === created.playerId));
  assert.ok(movement.players.every(entry => !("role" in entry)), "movement must not expose private roles");
});
