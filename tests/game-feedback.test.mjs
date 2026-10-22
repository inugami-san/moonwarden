import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { ejectionVerdict } from "../server/role-presentation.ts";
import * as matchRules from "../server/match-rules.ts";
import { sanctuaryZoneName } from "../server/sanctuary-map.ts";
import { sightAt } from "../server/visibility.ts";

// Exercise the real engine methods without starting RAF, audio hardware, or a
// network connection. Extracting the class avoids adding test exports/routes
// to the Next.js page that ships to players.
const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const engineNode = ast.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === "OrdealEngine");
assert.ok(engineNode);
const javascript = ts.transpileModule(engineNode.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function fixture() {
  const cues = [], layers = [];
  const Engine = runInNewContext(`${javascript}\nOrdealEngine`, {
    W: 1920, H: 1140, CALM_SECONDS: 24, SANCTUARY_OBSTACLES: [], HEARING_RANGE: 300, DEVOUR_SECONDS: 1.6,
    TASK_PROGRESS_REWARD: 8, ORDEAL_TASK_PROGRESS_REWARD: 12,
    ITEM_LABELS: { FLASHLIGHT: "Glowing Mushroom", FLARE: "Moonblossom", SONAR: "Echo Bell" },
    dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
    isOccludedByObstacle: () => false,
    sharesRootCell: () => false,
    drawSanctumStatus: () => layers.push("status"),
    ejectionVerdict,
    ...matchRules,
    sanctuaryZoneName,
    sightAt,
    Math,
    choose: items => items[0],
  });
  const engine = Object.assign(Object.create(Engine.prototype), {
    players: [{ id: "you", x: 640, y: 400, role: "CREWMATE", alive: true }],
    localPlayerId: "you", phase: "CALM", hazard: "BLACKOUT", phaseTime: 15, elapsed: 10,
    viewWidth: 1280, viewHeight: 760, camera: { x: 0, y: 0 },
    stationRound: 1, stations: [], charges: { FLASHLIGHT: 0, FLARE: 0, SONAR: 0 },
    audio: { cue: cue => cues.push(cue) }, taskProgress: 0, multiplayerClient: null,
    emit() {}, onPuzzle() {}, checkWin() {}, onEnd() {},
    wardClaims: new Set(), pendingWardDelta: 0, wardSettleTimer: 0, obstacles: [],
    keys: new Set(), touchKeys: new Set(), lastQuestions: new Map(), taskFailure: "",
    ordealNumber: 0, botStrikeSpent: new Set(), stealthUntil: 0, stealthAvailableOrdeal: 0, pendingBodies: [],
  });
  return { engine, cues, layers };
}

test("puzzles emit error feedback and grant one completion cue only after a correct answer", () => {
  const { engine, cues } = fixture();
  const station = { label: "FROST FONT", completed: false, reward: "FLASHLIGHT" };
  engine.stations = [station];
  engine.activePuzzle = { kind: "MATH", stationIndex: 0, answerIndex: 1 };
  engine.submitPuzzle(0);
  assert.equal(station.completed, false);
  assert.equal(engine.charges.FLASHLIGHT, 0);
  assert.deepEqual(cues, ["task-error"]);
  assert.equal(engine.activePuzzle, null, "one wrong answer terminates this attempt");
  assert.match(engine.taskFailure, /Incorrect answer/);
  engine.dismissTaskFailure();
  engine.activePuzzle = { kind: "MATH", stationIndex: 0, answerIndex: 1 };
  engine.submitPuzzle(1);
  engine.completeStation(station, false);
  assert.equal(station.completed, true);
  assert.equal(engine.charges.FLASHLIGHT, 1);
  assert.deepEqual(cues, ["task-error", "task-complete"]);
});

test("multiplayer reward audio waits for authoritative acceptance and rejection is distinct", () => {
  const { engine, cues } = fixture();
  const station = { label: "FROST FONT", completed: false, reward: "FLASHLIGHT" };
  engine.stations = [station];
  engine.multiplayerClient = { sendTask() {} };
  engine.completeStation(station, false);
  assert.equal(cues.length, 0, "optimistic UI cannot announce an accepted reward");
  engine.handleNetworkMessage({ type: "GEAR_SYNC", accepted: true, stationId: station.label, stationCompleted: true, roundId: 1, charges: { FLASHLIGHT: 1, FLARE: 0, SONAR: 0 } });
  assert.deepEqual(cues, ["task-complete"]);
  engine.handleNetworkMessage({ type: "GEAR_SYNC", accepted: false, stationId: station.label, stationCompleted: true, roundId: 1, charges: { FLASHLIGHT: 1, FLARE: 0, SONAR: 0 } });
  assert.deepEqual(cues, ["task-complete", "task-error"]);
  assert.equal(engine.charges.FLASHLIGHT, 1);
});

test("reopened shrine questions change even when random picks repeat, and failures cannot award gear", () => {
  const { engine } = fixture();
  const station = { label: "FROST FONT", x: 640, y: 400, completed: false, cooldown: 0, reward: "FLASHLIGHT", puzzle: "MATH" };
  engine.stations = [station];
  engine.tryOpenPuzzle();
  const first = engine.activePuzzle.prompt;
  engine.submitPuzzle((engine.activePuzzle.answerIndex + 1) % 3);
  assert.equal(engine.activePuzzle, null);
  engine.submitPuzzle(0);
  assert.equal(engine.charges.FLASHLIGHT, 0);
  engine.dismissTaskFailure(); station.cooldown = 0;
  engine.tryOpenPuzzle();
  assert.notEqual(engine.activePuzzle.prompt, first);
  engine.cancelPuzzle("");
  station.puzzle = "LINK";
  engine.tryOpenPuzzle();
  const firstSequence = engine.activePuzzle.sequence.join();
  engine.cancelPuzzle("");
  engine.tryOpenPuzzle();
  assert.notEqual(engine.activePuzzle.sequence.join(), firstSequence);
});

test("network snapshots play phase transitions once, not on every world update", () => {
  const { engine, cues } = fixture();
  engine.heardCueIds = new Set();
  const world = { type: "SYNC_WORLD", roundId: 1, phase: "ORDEAL", time: 20, hazard: "BLACKOUT", taskProgress: 0, bodies: [], flares: [], completedStations: [] };
  engine.handleNetworkMessage(world);
  engine.handleNetworkMessage(world);
  engine.handleNetworkMessage({ ...world, phase: "CALM", roundId: 2 });
  engine.handleNetworkMessage({ ...world, phase: "CALM", roundId: 2 });
  assert.deepEqual(cues, ["ordeal-start", "calm"]);
});

test("sealed badges render above players but below blackout and Rootwake visibility masks", () => {
  const { engine, layers } = fixture();
  engine.canvas = { width: 1280 };
  engine.ctx = new Proxy({}, { get: () => () => {} });
  engine.phase = "ORDEAL"; engine.hazard = "ROOTWAKE";
  engine.bodies = []; engine.flares = []; engine.devourEvents = [];
  engine.stations = [{ x: 640, y: 400, completed: true }];
  for (const name of ["drawRoom", "drawBeams", "drawParticles", "drawRootwake", "drawCanvasLabels"]) engine[name] = () => {};
  engine.isRevealed = () => true;
  engine.drawSlime = () => layers.push("player");
  engine.visibilityFor = () => ({ kind: "IDENTIFIED", alpha: 1 });
  engine.drawLighting = () => layers.push("lighting");
  engine.drawRootwakeOcclusion = () => layers.push("roots");
  engine.draw();
  assert.deepEqual(layers, ["player", "status", "lighting", "roots"]);
});

test("match-result feedback follows the local role without broadcasting role-specific effects", () => {
  const { engine, cues } = fixture();
  engine.playResultSound("CREW VICTORY — ALL MOON WARDS RESTORED");
  engine.human.role = "IMPOSTOR";
  engine.playResultSound("CREW VICTORY — ALL MOON WARDS RESTORED");
  engine.playResultSound("IMPOSTOR VICTORY — THE CREW IS AT PARITY");
  assert.deepEqual(cues, ["victory", "defeat", "victory"]);
});

test("solo vote verdicts reveal The Hollow or Warden without rewriting player names", () => {
  for (const [role, label] of [["IMPOSTOR", "THE HOLLOW"], ["CREWMATE", "WARDEN"]]) {
    const { engine } = fixture();
    engine.players.push({ id: "suspect", name: "Impostor", color: "#20d8ed", role, alive: true, ai: false });
    engine.paused = true;
    engine.activeMeeting = { candidates: engine.players };
    engine.suspicion = new Map();
    engine.onMeeting = () => {};
    engine.vote("suspect");
    assert.equal(engine.activeMeeting.verdict, `Impostor was ejected — ${label}`);
    assert.equal(engine.activeMeeting.ejectedId, "suspect");
  }
});

test("solo Moonsway counts the body reporter's shifted ballot, not their original target", t => {
  const { engine } = fixture();
  engine.chaosMoonsway = true;
  engine.players.push(
    { id: "suspect", name: "Suspect", role: "IMPOSTOR", alive: true, ai: false },
    { id: "other", name: "Other", role: "CREWMATE", alive: true, ai: false },
  );
  engine.paused = true;
  engine.activeMeeting = { candidates: engine.players, bodyReporterId: "you" };
  engine.suspicion = new Map();
  engine.onMeeting = () => {};
  t.mock.method(Math, "random", () => 0);
  engine.vote("suspect");
  assert.equal(engine.activeMeeting.localVote.targetId, "other");
  assert.equal(engine.activeMeeting.localVote.shifted, true);
  assert.equal(engine.activeMeeting.tally.find(entry => entry.targetId === "other").votes, 1);
  assert.equal(engine.activeMeeting.tally.find(entry => entry.targetId === "suspect").votes, 0);
});

test("multiplayer vote receipts lock one submission, preserve the discussion, and permit rejected retries", () => {
  const { engine } = fixture();
  const sent = [];
  engine.players.push({ id: "suspect", alive: true }, { id: "other", alive: true });
  const candidates = engine.players.map(player => ({ ...player }));
  engine.paused = true;
  engine.activeMeeting = { candidates, bodyReporterId: "you" };
  engine.onMeeting = () => {};
  engine.multiplayerClient = { sendVote: id => sent.push(id) };
  engine.vote("suspect"); engine.vote("other");
  assert.deepEqual(sent, ["suspect"]);
  assert.equal(engine.activeMeeting.votePending, true);
  engine.handleNetworkMessage({ type: "VOTE_RECEIPT", accepted: false, targetId: null, shifted: false });
  assert.equal(engine.activeMeeting.votePending, false);
  assert.equal(engine.activeMeeting.localVote, undefined);
  engine.vote("suspect");
  engine.handleNetworkMessage({ type: "VOTE_RECEIPT", accepted: true, targetId: "other", shifted: true });
  assert.equal(engine.activeMeeting.localVote.targetId, "other");
  assert.equal(engine.activeMeeting.candidates, candidates, "receipt updates do not recreate/reset the discussion roster");
  engine.vote(null);
  assert.deepEqual(sent, ["suspect", "suspect"]);
});

test("Rootwake blocks a distant chamber's gulp while retaining the victim's private sound", () => {
  const { engine, cues } = fixture();
  engine.audio.devour = () => cues.push("gulp");
  engine.devourEvents = [];
  engine.reducedMotion = true;
  engine.phase = "ORDEAL"; engine.hazard = "ROOTWAKE";
  engine.startDevour("body-other", 450, 400, "#20d8ed");
  assert.equal(cues.length, 0);
  assert.equal(engine.caption, undefined, "no cross-chamber sound caption");
  engine.startDevour("body-you", 640, 400, "#20d8ed");
  assert.deepEqual(cues, ["gulp"], "the victim still hears its own private feedback");
  engine.phase = "CALM";
  engine.startDevour("body-third", 450, 400, "#20d8ed");
  assert.deepEqual(cues, ["gulp", "gulp"]);
});
