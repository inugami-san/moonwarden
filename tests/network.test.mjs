import assert from "node:assert/strict";
import test from "node:test";
import { MultiplayerClient } from "../app/network.ts";

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
    open() { this.readyState = 1; this.onopen?.(); }
  }
  globalThis.WebSocket = FakeSocket;
  t.after(() => {
    if (previous.window === undefined) delete globalThis.window;
    else globalThis.window = previous.window;
    globalThis.WebSocket = previous.WebSocket;
  });
  return sockets;
}

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
  assert.equal(sockets[1].sent[0].type, "PING");
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
    return Response.json({ ok: true, sessionId: "http-session", messages: [] });
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
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => ++calls === 1
    ? Response.json({ ok: true, sessionId: "original", messages: [] })
    : Response.json({ error: "SESSION_EXPIRED" }, { status: 409 }));
  const client = new MultiplayerClient();
  await client.connect();
  client.sendChat("Test");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(client.connected, false);
  assert.match(client.lastError, /session expired|another server/);
  client.disconnect();
});

test("a dropped HTTP response retries the same action ID before later queued actions", async (t) => {
  browser(t, "test.vercel.app");
  const requests = [];
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    const request = JSON.parse(init.body);
    requests.push(request);
    if (requests.length === 2) throw new Error("Response lost after the server processed it");
    return Response.json({ ok: true, sessionId: "retry-session", messages: [] });
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
