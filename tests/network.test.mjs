import assert from "node:assert/strict";
import test from "node:test";
import { MultiplayerClient } from "../app/network.ts";
import { GAME_WORLD_VERSION } from "../server/game-version.ts";

const serverInfo = { type: "SERVER_INFO", worldVersion: GAME_WORLD_VERSION, compatible: true };
function relayResponse(payload) { return Response.json({ ...payload, messages: [serverInfo, ...(payload.messages ?? [])] }); }

function browser(t, hostname = "localhost") {
  const previous = { window: globalThis.window, WebSocket: globalThis.WebSocket };
  const sockets = [];
  let timer = 0;
  globalThis.window = {
    location: { hostname, host: `${hostname}:3000`, protocol: "http:" },
    setInterval: () => ++timer,
    clearInterval() {},
    setTimeout: () => ++timer,
    clearTimeout() {},
  };
  class FakeSocket {
    static OPEN = 1;
    readyState = 0;
    bufferedAmount = 0;
    sent = [];
    constructor(url) { this.url = url; sockets.push(this); }
    send(value) { this.sent.push(JSON.parse(value)); }
    close() { this.readyState = 3; this.onclose?.(); }
    open(info = serverInfo) { this.readyState = 1; this.onopen?.(); if (info) this.onmessage?.({ data: JSON.stringify(info) }); }
  }
  globalThis.WebSocket = FakeSocket;
  t.after(() => {
    if (previous.window === undefined) delete globalThis.window;
    else globalThis.window = previous.window;
    globalThis.WebSocket = previous.WebSocket;
  });
  return sockets;
}

function externalServer(t) {
  const previous = process.env.NEXT_PUBLIC_WS_URL;
  process.env.NEXT_PUBLIC_WS_URL = "wss://rooms.example/ws";
  t.after(() => {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_WS_URL;
    else process.env.NEXT_PUBLIC_WS_URL = previous;
  });
}

test("a socket is not connected until its map revision is acknowledged", async t => {
  const sockets = browser(t);
  const client = new MultiplayerClient();
  const connecting = client.connect();
  sockets[0].open(null);
  assert.equal(client.connected, false);
  client.createRoom("Blocked", "#20d8ed", "hood");
  assert.deepEqual(sockets[0].sent.map(message => message.type), ["CLIENT_HELLO"]);
  sockets[0].onmessage({ data: JSON.stringify(serverInfo) });
  await connecting;
  assert.equal(client.connected, true);
  assert.equal(client.lastError, "");
  client.disconnect();
});

test("legacy character alerts use cat terminology without rewriting names, chat or unknown errors", async t => {
  const sockets = browser(t);
  const client = new MultiplayerClient();
  const connecting = client.connect();
  sockets[0].open();
  await connecting;
  for (const [message, expected] of [
    ["That slime color is already taken. Choose an available color.", "That coat color is already taken. Choose an available color."],
    ["That puddle is no longer visible within reporting reach.", "That fallen cat is no longer visible within reporting reach."],
    ['Room "Slime King" not found.', 'Room "Slime King" not found.'],
    ["toString", "toString"],
    ["__proto__", "__proto__"],
  ]) {
    sockets[0].onmessage({ data: JSON.stringify({ type: "ERROR_ALERT", message }) });
    assert.equal(client.getSnapshot().lastError, expected);
  }
  const message = { id: "chat-1", playerId: "p1", playerName: "Slime King", playerColor: "#63e6be", text: "I like slimes", system: false };
  sockets[0].onmessage({ data: JSON.stringify({ type: "CHAT_MESSAGE", message }) });
  assert.deepEqual(client.getSnapshot().lobbyChat.at(-1), message);
  client.disconnect();
});

test("an opened legacy socket fails explicitly without creating alternate fallback rooms", async t => {
  const sockets = browser(t);
  const client = new MultiplayerClient();
  const connecting = client.connect();
  const rejected = assert.rejects(connecting, /different map versions/);
  sockets[0].open({ type: "PONG", sentAt: 1 });
  await rejected;
  assert.equal(client.connected, false);
  assert.equal(sockets.length, 1, "incompatibility is never an excuse to split the room onto another authority");
  assert.match(client.lastError, /matching local room server/);
  assert.deepEqual(sockets[0].sent.map(message => message.type), ["CLIENT_HELLO"]);
  client.disconnect();
});

test("a server that closes after accepting a socket cannot bypass the map handshake through fallback", async t => {
  const sockets = browser(t);
  const client = new MultiplayerClient();
  const rejected = assert.rejects(client.connect(), /different map versions/);
  sockets[0].open(null);
  sockets[0].close();
  await rejected;
  assert.equal(sockets.length, 1);
  assert.equal(client.connected, false);
  client.disconnect();
});

test("an unresponsive legacy socket times out as incompatible before any room action", async t => {
  const sockets = browser(t);
  let timeout;
  window.setTimeout = callback => { timeout = callback; return 1; };
  const client = new MultiplayerClient();
  const rejected = assert.rejects(client.connect(), /different map versions/);
  sockets[0].open(null);
  timeout();
  await rejected;
  assert.equal(sockets.length, 1);
  assert.equal(client.connected, false);
  client.disconnect();
});

test("external health rejects absent or outdated map revisions before opening a socket", async t => {
  const sockets = browser(t, "test.vercel.app");
  externalServer(t);
  for (const worldVersion of [undefined, "old-1280-map"]) {
    t.mock.method(globalThis, "fetch", async () => Response.json({ status: "ok", worldVersion }));
    const client = new MultiplayerClient();
    await assert.rejects(client.connect(), /different map versions/);
    assert.equal(sockets.length, 0);
    assert.equal(client.connected, false);
    client.disconnect();
  }
});

test("a legacy HTTP relay cannot create a room before acknowledging this client's map", async t => {
  browser(t, "test.vercel.app");
  const requests = [];
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    requests.push(JSON.parse(init.body));
    return Response.json({ ok: true, sessionId: "old-world", messages: [] });
  });
  const client = new MultiplayerClient();
  await assert.rejects(client.connect(), /different map versions/);
  client.createRoom("Never sent", "#20d8ed", "hood");
  assert.equal(client.connected, false);
  assert.deepEqual(requests[0].messages, [{ type: "CLIENT_HELLO", worldVersion: GAME_WORLD_VERSION }]);
  assert.equal(requests.some(request => request.messages?.some(message => message.type === "CREATE_ROOM")), false);
  assert.ok(requests.some(request => request.disconnect), "the old empty relay session is closed");
  client.disconnect();
});

test("a rejected relay revision cannot deliver later room or match events from the same response", async t => {
  browser(t, "test.vercel.app");
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => ++calls === 1
    ? relayResponse({ ok: true, sessionId: "changing-world", messages: [] })
    : Response.json({ ok: true, sessionId: "changing-world", messages: [
      { ...serverInfo, worldVersion: "retired-world" },
      { type: "ROOM_STATE", roomCode: "WRONG", playerId: "stale", isHost: true, players: [], state: "LOBBY" },
      { type: "MATCH_STARTED", role: "CREWMATE", players: [] },
    ] }));
  const client = new MultiplayerClient();
  await client.connect();
  const matches = [];
  client.onMessage(message => { if (message.type === "MATCH_STARTED") matches.push(message); });
  client.createRoom("Changed server", "#20d8ed", "hood");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(client.connected, false);
  assert.equal(client.roomCode, "");
  assert.equal(client.state, "LOBBY");
  assert.equal(matches.length, 0);
  client.disconnect();
});

test("external room servers wake through health before opening one shared socket", async t => {
  const sockets = browser(t, "test.vercel.app");
  externalServer(t);
  let release;
  const urls = [];
  t.mock.method(globalThis, "fetch", (url) => {
    urls.push(String(url));
    return new Promise(resolve => { release = resolve; });
  });
  const client = new MultiplayerClient();
  const connecting = client.connect();
  assert.equal(client.connect(), connecting);
  assert.equal(sockets.length, 0);
  assert.deepEqual(urls, ["https://rooms.example/health"]);
  release(Response.json({ status: "ok", worldVersion: GAME_WORLD_VERSION }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sockets.length, 1);
  sockets[0].open();
  await connecting;
  assert.equal(client.getSnapshot().transport, "WS");
  client.disconnect();
});

test("an unavailable external backend never splits players into HTTP fallback rooms", async t => {
  const sockets = browser(t, "test.vercel.app");
  externalServer(t);
  const urls = [];
  t.mock.method(globalThis, "fetch", async url => { urls.push(String(url)); return new Response("Waking", { status: 503 }); });
  const client = new MultiplayerClient();
  await assert.rejects(client.connect(), /waking up|unavailable/);
  assert.equal(client.connected, false);
  assert.equal(sockets.length, 0);
  assert.deepEqual(urls, ["https://rooms.example/health"]);
});

test("cancelling server warmup never opens a late WebSocket", async t => {
  const sockets = browser(t, "test.vercel.app");
  externalServer(t);
  let release;
  t.mock.method(globalThis, "fetch", () => new Promise(resolve => { release = resolve; }));
  const client = new MultiplayerClient();
  const cancelled = assert.rejects(client.connect(), /cancelled/);
  client.disconnect();
  release(Response.json({ status: "ok", worldVersion: GAME_WORLD_VERSION }));
  await cancelled;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sockets.length, 0);
  assert.equal(client.connected, false);
});

test("simultaneous connection requests share one socket and error/close produces one fallback", async (t) => {
  const sockets = browser(t);
  const client = new MultiplayerClient();
  const first = client.connect();
  assert.equal(client.connect(), first);
  assert.equal(sockets.length, 1);
  sockets[0].onerror();
  assert.equal(sockets.length, 2);
  assert.match(sockets[1].url, /:3001/);
  sockets[1].open();
  await first;
  assert.equal(client.getSnapshot().transport, "WS");
  assert.equal(sockets[1].sent[0].type, "CLIENT_HELLO");
  assert.equal(sockets[1].sent[1].type, "PING");
  client.disconnect();
  assert.equal(sockets.length, 2);
});

test("movement packets are discarded under WebSocket backpressure, while actions remain reliable", async (t) => {
  const sockets = browser(t);
  const client = new MultiplayerClient();
  const connecting = client.connect();
  sockets[0].open();
  await connecting;
  sockets[0].sent.length = 0;
  sockets[0].bufferedAmount = 20_000;
  client.sendInput(100, 200, 100, 0, 0, false);
  client.sendChat("Hello");
  assert.deepEqual(sockets[0].sent.map((m) => m.type), ["SEND_CHAT"]);
  sockets[0].bufferedAmount = 0;
  client.sendInput(105, 200, 100, 0, 0, false);
  assert.equal(sockets[0].sent[1].seq, 2);
  client.disconnect();
});

test("HTTP relay coalesces queued positions and preserves action ordering", async (t) => {
  browser(t, "test.vercel.app");
  const requests = [];
  let release;
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    const payload = JSON.parse(init.body);
    requests.push(payload);
    if (requests.length === 2) await new Promise((resolve) => { release = resolve; });
    return relayResponse({ ok: true, sessionId: "http-session", messages: [] });
  });
  const client = new MultiplayerClient();
  await client.connect();
  client.sendChat("First");
  client.sendInput(1, 2, 100, 0, 0, false);
  client.sendInput(10, 2, 100, 0, 0, false);
  client.sendInput(20, 2, 0, 0, 0, false);
  client.sendChat("Second");
  release();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests.length, 3);
  assert.equal(requests[2].messages.filter((m) => m.type === "PLAYER_INPUT").length, 1);
  assert.equal(requests[2].messages[0].x, 20);
  assert.equal(requests[2].messages[1].text, "Second");
  client.disconnect();
});

test("a late HTTP connect response cannot revive a disconnected client", async (t) => {
  browser(t, "test.vercel.app");
  let release;
  t.mock.method(globalThis, "fetch", () => new Promise((resolve) => { release = resolve; }));
  const client = new MultiplayerClient();
  const connecting = client.connect();
  const cancelled = assert.rejects(connecting, /cancelled/);
  client.disconnect();
  release(Response.json({ ok: true, sessionId: "stale", messages: [] }));
  await cancelled;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(client.connected, false);
  assert.equal(client.getSnapshot().transport, "NONE");
});

test("HTTP instance/session loss is surfaced instead of silently continuing a frozen match", async (t) => {
  browser(t, "test.vercel.app");
  const cleared = [];
  window.clearInterval = (id) => cleared.push(id);
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => ++calls === 1
    ? relayResponse({ ok: true, sessionId: "original", messages: [] })
    : Response.json({ error: "SESSION_EXPIRED" }, { status: 409 }));
  const client = new MultiplayerClient();
  await client.connect();
  client.sendChat("Test");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(client.connected, false);
  assert.match(client.lastError, /session expired|another server/);
  assert.ok(cleared.length > 0, "stop polling a dead session");
  client.startMatch();
  assert.match(client.lastError, /session expired|another server/);
  client.leaveRoom();
  assert.equal(client.roomCode, "");
  assert.equal(client.getSnapshot().transport, "NONE");
  client.disconnect();
});

test("malformed HTTP handshakes never pretend to be connected", async (t) => {
  browser(t, "test.vercel.app");
  t.mock.method(globalThis, "fetch", async () => Response.json({ ok: true, messages: [] }));
  const client = new MultiplayerClient();
  await assert.rejects(client.connect(), /invalid session/);
  assert.equal(client.connected, false);
  assert.equal(client.getSnapshot().transport, "NONE");
});

test("a delayed JSON body cannot restore a disconnected room", async (t) => {
  browser(t, "test.vercel.app");
  let release;
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    if (++calls !== 2) return relayResponse({ ok: true, sessionId: "original", messages: [] });
    return { ok: true, status: 200, json: () => new Promise(resolve => { release = resolve; }) };
  });
  const client = new MultiplayerClient();
  await client.connect();
  client.sendChat("Pending");
  await new Promise(resolve => setImmediate(resolve));
  client.disconnect();
  release({ ok: true, sessionId: "original", messages: [{ type: "ROOM_STATE", roomCode: "OLD", playerId: "old-player", players: [], state: "LOBBY", isHost: true }] });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(client.roomCode, "");
  assert.equal(client.playerId, "");
  assert.equal(client.httpSessionId, "");
  assert.equal(client.connected, false);
});

test("HTTP responses cannot silently move a player into a different session", async (t) => {
  browser(t, "test.vercel.app");
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => relayResponse({ ok: true, sessionId: ++calls === 1 ? "original" : "other", messages: [] }));
  const client = new MultiplayerClient();
  await client.connect();
  client.sendChat("Pending");
  await new Promise(resolve => setImmediate(resolve));
  await client.flushHttp();
  await client.flushHttp();
  assert.equal(client.httpSessionId, "original");
  assert.equal(client.connected, false);
  assert.match(client.lastError, /lost/);
  client.disconnect();
});

test("disconnected room controls report an error rather than silently dropping actions", (t) => {
  browser(t);
  const client = new MultiplayerClient();
  const changes = [];
  client.onStateChange(state => changes.push(state));
  client.startMatch();
  assert.match(changes.at(-1).lastError, /disconnected/);
});

test("a dropped HTTP response retries the same action ID before later queued actions", async (t) => {
  browser(t, "test.vercel.app");
  const requests = [];
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    const request = JSON.parse(init.body);
    requests.push(request);
    if (requests.length === 2) throw new Error("Response lost after the server processed it");
    return relayResponse({ ok: true, sessionId: "retry-session", messages: [] });
  });
  const client = new MultiplayerClient();
  await client.connect();
  client.sendChat("Only once");
  await new Promise((resolve) => setImmediate(resolve));
  await client.flushHttp();
  assert.equal(requests[1].requestId, requests[2].requestId);
  assert.deepEqual(requests[1].messages, requests[2].messages);
  assert.equal(client.connected, true);
  client.disconnect();
});
