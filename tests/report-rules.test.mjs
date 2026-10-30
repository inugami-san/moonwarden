import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { GameRoom } from "../server/game-room.ts";
import { CENTER } from "../server/sanctuary-map.ts";
import { EMERGENCY_COOLDOWN_SECONDS, advanceEmergency, afterMeeting, finishFirstOrdeal, initialEmergencyState, reportAvailability } from "../server/report-rules.ts";

const status = overrides => reportAvailability({ emergency: initialEmergencyState(), phase: "CALM", alive: true, nearbyBody: false, nearBell: true, ...overrides });

test("emergency bell starts locked, unlocks after Ordeal one, and still requires Calm/proximity", () => {
  assert.equal(status().allowed, false);
  assert.equal(status().label, "Locked");
  assert.match(status().hint, /first Ordeal/);
  const emergency = finishFirstOrdeal(initialEmergencyState());
  assert.equal(status({ emergency }).allowed, true, "first use is available immediately after Ordeal one");
  for (const phase of ["COUNTDOWN", "ORDEAL", "DISCUSSION"]) assert.equal(status({ emergency, phase }).allowed, false);
  assert.equal(status({ emergency, nearBell: false }).allowed, false);
  assert.equal(status({ emergency, alive: false }).allowed, false);
  assert.equal(status({ emergency, blocked: true }).allowed, false);
});

test("nearby body reports bypass the first-Ordeal lock and all emergency cooldowns", () => {
  for (const phase of ["CALM", "COUNTDOWN", "ORDEAL"]) {
    for (const emergency of [initialEmergencyState(), afterMeeting(finishFirstOrdeal(initialEmergencyState()))]) {
      const report = status({ emergency, nearbyBody: true, nearBell: false, phase });
      assert.equal(report.allowed, true);
      assert.equal(report.label, "Report");
    }
  }
  assert.equal(status({ nearbyBody: true, alive: false }).allowed, false);
  assert.equal(status({ nearbyBody: true, phase: "DISCUSSION" }).allowed, false);
});

test("shared 60-second cooldown starts after meetings, pauses in discussion, and never resets at Ordeals", () => {
  const state = afterMeeting(finishFirstOrdeal(initialEmergencyState()));
  assert.equal(state.cooldownRemaining, EMERGENCY_COOLDOWN_SECONDS);
  assert.equal(status({ emergency: state }).label, "60s");
  const next = advanceEmergency(state, 59.5, "CALM");
  assert.equal(status({ emergency: next }).label, "1s");
  assert.equal(status({ emergency: next }).allowed, false);
  assert.equal(status({ emergency: advanceEmergency(next, .5, "ORDEAL") }).allowed, true);
  assert.equal(advanceEmergency(state, 120, "DISCUSSION"), state);
  assert.equal(advanceEmergency(state, NaN, "CALM"), state);
  assert.equal(advanceEmergency(state, -5, "CALM"), state);
  assert.equal(finishFirstOrdeal(next).cooldownRemaining, .5);
  assert.equal(state.cooldownRemaining, 60, "helpers do not mutate earlier snapshots");
});

function match(t) {
  const room = new GameRoom("BELL"), clients = [];
  for (let i = 0; i < 4; i++) {
    const client = { readyState: 1, messages: [], send(data) { this.messages.push(JSON.parse(data)); }, close() {} };
    clients.push(client); room.addClient(`p${i}`, client, `Warden ${i}`, "#20d8ed", "hood");
  }
  room.handleMessage("p0", { type: "START_MATCH", botFill: false, targetPlayers: 4 });
  room.obstacles = [];
  for (const p of room.players.values()) { p.role = p.id === "p0" ? "IMPOSTOR" : "CREWMATE"; p.x = CENTER.x; p.y = CENTER.y; }
  clients.forEach(client => { client.messages.length = 0; });
  t.after(() => room.destroy());
  return { room, clients };
}

function finishOrdeal(room) {
  room.phase = "ORDEAL"; room.phaseTime = .01;
  room.lastTick = Date.now() - 50; room.tick();
  assert.equal(room.phase, "CALM");
}

test("server rejects forged early report packets and publishes the authoritative unlock", t => {
  const { room, clients } = match(t);
  for (let i = 0; i < 3; i++) room.handleMessage("p1", { type: "TRIGGER_REPORT" });
  assert.equal(room.phase, "CALM");
  assert.equal(clients[1].messages.some(m => m.type === "MEETING_CALLED"), false);
  assert.match(clients[1].messages.at(-1).message, /first Ordeal/);
  finishOrdeal(room);
  const sync = clients[1].messages.filter(m => m.type === "SYNC_WORLD").at(-1);
  assert.deepEqual(sync.emergency, { firstOrdealComplete: true, cooldownRemaining: 0 });
  room.handleMessage("p1", { type: "TRIGGER_REPORT" });
  assert.equal(room.phase, "DISCUSSION");
});

test("a different player cannot bypass the shared server cooldown; duplicate resolve packets cannot reset it", t => {
  const { room, clients } = match(t);
  finishOrdeal(room);
  room.handleMessage("p1", { type: "TRIGGER_REPORT" });
  room.meetingTally = []; room.handleMessage("p1", { type: "RESOLVE_MEETING" });
  assert.equal(room.emergency.cooldownRemaining, 60);
  room.handleMessage("p2", { type: "TRIGGER_REPORT" });
  assert.equal(room.phase, "CALM");
  assert.match(clients[2].messages.at(-1).message, /60s/);
  room.phaseTime = 200;
  room.lastTick = Date.now() - 1000; room.tick();
  const remaining = room.emergency.cooldownRemaining;
  room.handleMessage("p1", { type: "RESOLVE_MEETING" });
  assert.equal(room.emergency.cooldownRemaining, remaining);
  room.lastTick = Date.now() - 60_000; room.tick();
  room.handleMessage("p2", { type: "TRIGGER_REPORT" });
  assert.equal(room.phase, "DISCUSSION");
});

test("body reports work during Ordeal one and during cooldown without allowing phantom/body-through-cover reports", t => {
  const { room } = match(t);
  room.phase = "ORDEAL"; room.hazard = "FOG";
  const body = { id: "puddle", x: CENTER.x + 70, y: CENTER.y, color: "#20d8ed", name: "Fallen", age: 0 };
  room.bodies = [body];
  room.obstacles = [{ id: "cover", x: CENTER.x + 35, y: CENTER.y, r: 20 }];
  room.handleMessage("p1", { type: "TRIGGER_REPORT", bodyId: body.id });
  assert.equal(room.phase, "ORDEAL");
  room.obstacles = [];
  room.handleMessage("p1", { type: "TRIGGER_REPORT", bodyId: body.id });
  assert.equal(room.phase, "DISCUSSION");
  assert.equal(room.emergency.firstOrdealComplete, true, "a body report can end the first Ordeal early");
  room.meetingTally = []; room.resolveMeeting();
  room.handleMessage("p2", { type: "TRIGGER_REPORT", bodyId: "already-cleared" });
  assert.equal(room.phase, "CALM");
  room.bodies = [body];
  room.handleMessage("p2", { type: "TRIGGER_REPORT", bodyId: body.id });
  assert.equal(room.phase, "DISCUSSION", "a new nearby body ignores all 60 seconds of cooldown");
});

test("report action is gated by authoritative availability, exposes cooldown reasons, and retains the R binding", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const control = await readFile(new URL("../app/report-action.tsx", import.meta.url), "utf8");
  assert.match(source, /<ReportAction allowed=\{snapshot.canReport\} label=\{snapshot.reportLabel\} hint=\{snapshot.reportHint\}/);
  assert.match(control, /disabled=\{!allowed\}/);
  assert.match(control, /aria-label=\{hint\}/);
  assert.match(control, /if \(allowed\) onReport\(\)/);
  assert.match(source, /if \(event.code === "KeyR"\) this.report\(\)/);
});
