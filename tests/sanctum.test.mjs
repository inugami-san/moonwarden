import assert from "node:assert/strict";
import test from "node:test";
import { GameServerRegistry } from "../server/game-room.ts";
import { drawForestSanctum, drawSanctumStatus, sanctumPulse } from "../app/sanctum-art.ts";
import { CALM_SECONDS, STATIONS } from "../server/sanctuary-map.ts";

function canvasRecorder() {
  const calls = [], stack = [];
  const state = { globalAlpha: 1 };
  const methods = new Set(["translate", "scale", "beginPath", "closePath", "ellipse", "arc", "fillRect", "moveTo", "lineTo", "quadraticCurveTo", "bezierCurveTo", "fill", "stroke", "fillText", "strokeText"]);
  const record = (method, args) => {
    for (const arg of args) if (typeof arg === "number") assert.ok(Number.isFinite(arg), `${method} has finite coordinates`);
    if (method === "arc") assert.ok(args[2] >= 0, "circle radius cannot be negative");
    if (method === "ellipse") assert.ok(args[2] >= 0 && args[3] >= 0, "ellipse radii cannot be negative");
    calls.push([method, ...args]);
  };
  const ctx = new Proxy(state, {
    get(target, key) {
      if (key === "save") return () => { stack.push({ ...state }); calls.push(["save"]); };
      if (key === "restore") return () => {
        assert.ok(stack.length, "restore must have a matching save");
        for (const property of Object.keys(state)) delete state[property];
        Object.assign(state, stack.pop());
        calls.push(["restore"]);
      };
      if (key === "createLinearGradient" || key === "createRadialGradient") return (...args) => {
        record(key, args);
        return { addColorStop(position, color) { assert.ok(position >= 0 && position <= 1); calls.push(["colorStop", position, color]); } };
      };
      if (methods.has(key)) return (...args) => record(key, args);
      if (key in target) return target[key];
      throw new Error(`Unmocked Canvas operation: ${String(key)}`);
    },
    set(target, key, value) {
      if (typeof value === "number") assert.ok(Number.isFinite(value), `${String(key)} must be finite`);
      target[key] = value;
      return true;
    },
  });
  return { ctx, calls, stack, state };
}

const shrine = Object.freeze({ x: 300, y: 180, pulse: 1.2, completed: false, label: "STAR ALTAR", reward: "SONAR" });

test("forest sanctums render every reward and availability state without mutating game state", () => {
  for (const reward of ["FLASHLIGHT", "FLARE", "SONAR"]) {
    for (const completed of [false, true]) {
      for (const locked of [false, true]) {
        for (const nearby of [false, true]) {
          const station = Object.freeze({ ...shrine, reward, completed, rootClosure: locked ? 1 : 0, completedAt: completed ? 10 : undefined });
          const { ctx, stack, state } = canvasRecorder();
          drawForestSanctum(ctx, station, 10.25, locked, nearby);
          drawSanctumStatus(ctx, station, 10.25, locked, nearby);
          assert.equal(stack.length, 0, "all Canvas state is restored");
          assert.deepEqual(state, { globalAlpha: 1 });
          assert.equal(station.completed, completed);
          assert.equal(station.x, 300);
        }
      }
    }
  }
});

test("sealed shrines keep a raised completion badge even outside interaction range", () => {
  const sealed = Object.freeze({ ...shrine, completed: true, completedAt: 10 });
  const { ctx, calls } = canvasRecorder();
  drawSanctumStatus(ctx, sealed, 30, false, false);
  const badge = calls.find(([method, text]) => method === "fillText" && text === "SEALED");
  assert.ok(badge, "completed state is persistent, not only a half-second pulse");
  assert.ok(badge[3] < -50, "completion badge sits above a nearby slime");
  assert.equal(calls.filter(([method]) => method === "fillText").length, 1, "distant badges stay compact");

  const near = canvasRecorder();
  drawSanctumStatus(near.ctx, sealed, 30, true, true);
  assert.ok(near.calls.some(([method, text]) => method === "fillText" && text === "SEALED"), "a meeting never erases completed state");
  assert.ok(near.calls.some(([method, text]) => method === "fillText" && text === "REOPENS NEXT CALM"));
  assert.ok(!near.calls.some(([method, text]) => method === "fillText" && text.includes("INTERACT")), "sealed stations never advertise interaction");
});

test("ready, temporarily locked, and sealed sanctums have distinct status prompts", () => {
  for (const [locked, expected] of [[false, "TASK READY"], [true, "LOCKED"]]) {
    const { ctx, calls } = canvasRecorder();
    drawSanctumStatus(ctx, shrine, 10, locked, true);
    assert.ok(calls.some(([method, text]) => method === "fillText" && text === expected));
    assert.equal(calls.some(([method, text]) => method === "fillText" && text === "E · INTERACT"), !locked);
  }
  const distant = canvasRecorder();
  drawSanctumStatus(distant.ctx, shrine, 10, false, false);
  assert.equal(distant.calls.length, 0, "distant ready stations do not clutter the arena");
});

test("north-shrine completion badges sit below the HUD instead of behind the ward meter", () => {
  const { ctx, calls } = canvasRecorder();
  drawSanctumStatus(ctx, { ...shrine, y: 104, completed: true }, 30, false, true);
  const badge = calls.find(([method, text]) => method === "fillText" && text === "SEALED");
  assert.ok(badge[3] > 45, "north badges use the approach side of the shrine");
  assert.ok(calls.some(([method, text, , y]) => method === "fillText" && text === "STAR ALTAR" && y > 80));
});

test("completed shrine light is steady after the 0.5-second bloom while ready fireflies remain lively", () => {
  const completed = Object.freeze({ ...shrine, completed: true, completedAt: 10 });
  const first = canvasRecorder(), later = canvasRecorder();
  drawForestSanctum(first.ctx, completed, 11, false, false);
  drawForestSanctum(later.ctx, completed, 12, false, false);
  assert.deepEqual(first.calls, later.calls, "persistent sealed state does not keep flashing");
  const readyFirst = canvasRecorder(), readyLater = canvasRecorder();
  drawForestSanctum(readyFirst.ctx, shrine, 11, false, false);
  drawForestSanctum(readyLater.ctx, shrine, 12, false, false);
  assert.notDeepEqual(readyFirst.calls, readyLater.calls);
});

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
  const shrine = room.stations.find(station => station.id === "FROST FONT");
  for (const p of room.players.values()) { p.x = shrine.x; p.y = shrine.y; }
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
  assert.equal(room.taskProgress, 0, "public gauge is queued");
  room.settleWards();
  assert.equal(room.taskProgress, 4.7);
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
  assert.equal(room.taskProgress, 4.7);
  assert.equal(room.itemCharges.get("p0").FLASHLIGHT, 1);
  const world = clients[1].sent.filter((msg) => msg.type === "SYNC_WORLD").at(-1);
  assert.equal(world.roundId, 2);
  assert.deepEqual(world.completedStations, []);
  room.handleMessage("p0", { ...task, roundId: 2 });
  room.settleWards();
  assert.equal(room.taskProgress, 9.4);
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
  const shrine = room.stations.find(station => station.id === "STAR ALTAR");
  room.players.get("p3").x = shrine.x;
  room.players.get("p3").y = shrine.y;
  room.handleMessage("p3", { type: "TASK_UPDATE", stationId: "STAR ALTAR", reward: "SONAR", roundId: 1 });
  assert.equal(room.completedStations.get("p3").size, 1);
  const previousHazard = room.hazard;
  room.phase = "DISCUSSION";
  room.resolveMeeting();
  assert.equal(room.phaseTime, CALM_SECONDS);
  assert.notEqual(room.hazard, previousHazard, "meeting return also advertises the next ordeal immediately");
  assert.equal(room.roundId, 2);
  assert.equal(room.sealedStations.size, 0);
  assert.equal(room.completedStations.get("p3").size, 0);
  assert.equal(room.taskProgress, 0, "meetings do not flush role-correlated gauge changes");
  room.settleWards();
  assert.equal(room.taskProgress, 1.7, "both restoration and the queued Hollow siphon survive the round transition");
  assert.equal(room.itemCharges.get("p3").SONAR, 1);
});
