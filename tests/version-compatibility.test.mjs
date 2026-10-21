import assert from "node:assert/strict";
import test from "node:test";
import { MultiplayerClient } from "../app/network.ts";
import { POST } from "../app/api/mp/route.ts";
import { gameRegistry } from "../server/game-room.ts";
import { GAME_WORLD_VERSION } from "../server/game-version.ts";
import { resolveObstaclePosition } from "../server/ordeal-rules.ts";

const hello = { type: "CLIENT_HELLO", worldVersion: GAME_WORLD_VERSION };
const create = { type: "CREATE_ROOM", playerName: "Version test", color: "#20d8ed", hat: "hood" };
const api = async payload => {
  const response = await POST(new Request("http://localhost/api/mp", { method: "POST", body: JSON.stringify(payload) }));
  return response.json();
};

test("the relay rejects cached legacy pages before they can create, discover or join rooms", async t => {
  for (const message of [create, { type: "LIST_ROOMS" }, { ...create, type: "JOIN_ROOM", roomCode: "ABCD" }]) {
    const reply = await api({ messages: [message] });
    t.after(() => api({ sessionId: reply.sessionId, disconnect: true }));
    assert.ok(reply.messages.some(message => message.type === "SERVER_INFO" && message.compatible === false));
    assert.ok(reply.messages.some(message => message.type === "ERROR_ALERT" && /different map versions/.test(message.message)));
    assert.equal(reply.messages.some(message => message.type === "ROOM_STATE" || message.type === "ROOMS_LIST"), false);
  }
});

test("wrong-revision relay handshakes cannot be upgraded within a rejected session", async t => {
  const reply = await api({ messages: [{ ...hello, worldVersion: "old-map" }, hello, create] });
  t.after(() => api({ sessionId: reply.sessionId, disconnect: true }));
  assert.equal(reply.messages.some(message => message.type === "ROOM_STATE"), false);
  assert.equal(reply.messages.filter(message => message.type === "SERVER_INFO").length, 1);
  assert.equal(reply.messages.find(message => message.type === "SERVER_INFO").compatible, false);
});

function browser(t) {
  const previous = { window: globalThis.window, fetch: globalThis.fetch, ws: process.env.NEXT_PUBLIC_WS_URL };
  delete process.env.NEXT_PUBLIC_WS_URL;
  globalThis.window = { location: { hostname: "fixture.vercel.app", host: "fixture.vercel.app", protocol: "https:" }, setInterval: () => 1, clearInterval() {} };
  globalThis.fetch = async (_url, init) => POST(new Request("http://localhost/api/mp", init));
  t.after(() => {
    if (previous.window === undefined) delete globalThis.window;
    else globalThis.window = previous.window;
    globalThis.fetch = previous.fetch;
    if (previous.ws === undefined) delete process.env.NEXT_PUBLIC_WS_URL;
    else process.env.NEXT_PUBLIC_WS_URL = previous.ws;
  });
}

test("matching HTTP clients share the expanded authority instead of old invisible bounds or props", async t => {
  const host = new MultiplayerClient(), guest = new MultiplayerClient();
  t.after(() => { host.disconnect(); guest.disconnect(); });
  browser(t);
  await Promise.all([host.connect(), guest.connect()]);
  assert.equal(host.connected, true); assert.equal(guest.connected, true);
  host.createRoom("Version host", "#20d8ed", "hood");
  await new Promise(resolve => setImmediate(resolve));
  guest.joinRoom(host.roomCode, "Version guest", "#20d8ed", "hood");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(guest.roomCode, host.roomCode);
  assert.equal(guest.players.length, 2);
  host.startMatch(true, 4);
  await new Promise(resolve => setImmediate(resolve));
  const room = gameRegistry.getRoom(host.roomCode);
  assert.equal(room.state, "PLAYING");
  const player = room.players.get(host.playerId);
  const trace = [[1500, 800], [450, 225]];
  for (const [x, y] of trace) {
    const expected = resolveObstaclePosition(x, y);
    host.sendInput(x, y, 0, 0, 0, false);
    await host.flushHttp();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual({ x: player.x, y: player.y }, expected, "authority resolves the drawn map's bases, not retired invisible props or bounds");
    if (x === 1500) assert.ok(player.x > 1168 && player.y > 658, "the small visible column must not become the retired arena boundary");
    else assert.deepEqual(expected, { x, y }, "the retired monolith location is open floor in the expanded map");
  }
  assert.notDeepEqual({ x: Math.min(1168, trace[0][0]), y: Math.min(658, trace[0][1]) }, { x: trace[0][0], y: trace[0][1] }, "the retired authority would have clamped this move against an invisible edge");
  assert.equal(guest.connected, true);
});
