import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

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
  });
  const engine = Object.assign(Object.create(Engine.prototype), {
    players: [{ id: "you", x: 640, y: 400, role: "CREWMATE", alive: true }],
    localPlayerId: "you", phase: "CALM", hazard: "BLACKOUT", phaseTime: 15, elapsed: 10,
    viewWidth: 1280, viewHeight: 760, camera: { x: 0, y: 0 },
    stationRound: 1, stations: [], charges: { FLASHLIGHT: 0, FLARE: 0, SONAR: 0 },
    audio: { cue: cue => cues.push(cue) }, taskProgress: 0, multiplayerClient: null,
    emit() {}, onPuzzle() {}, checkWin() {}, onEnd() {},
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
  engine.keys = new Set();
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
