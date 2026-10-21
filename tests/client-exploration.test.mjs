import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as world from "../server/sanctuary-map.ts";
import * as rules from "../server/ordeal-rules.ts";
import * as matchRules from "../server/match-rules.ts";
import { planRoute } from "../server/sanctuary-paths.ts";
import { preparationStation } from "../app/warden-objectives.ts";
import { GameRoom } from "../server/game-room.ts";

const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const node = ast.statements.find(statement => ts.isClassDeclaration(statement) && statement.name?.text === "OrdealEngine");
const js = ts.transpileModule(node.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function fixture() {
  const Engine = runInNewContext(`${js}\nOrdealEngine`, {
    ...world, ...rules, ...matchRules, W: world.WORLD_WIDTH, H: world.WORLD_HEIGHT, planRoute, preparationStation,
    dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
    clamp: (n, min, max) => Math.max(min, Math.min(max, n)),
    rootwakeStrength: (phase, hazard, time) => phase === "ORDEAL" && hazard === "ROOTWAKE" ? Math.min((10 - time) / .75, time / .55, 1) : 0,
    ITEM_LABELS: { FLASHLIGHT: "Glowing Mushroom", FLARE: "Moonblossom", SONAR: "Echo Bell" },
    choose: items => items[0],
    performance: { now: () => 100 },
  });
  const human = { id: "you", x: world.CENTER.x, y: world.CENTER.y, role: "CREWMATE", alive: true, vx: 0, vy: 0, ai: false, gearCharges: { FLASHLIGHT: 0, FLARE: 0, SONAR: 0 } };
  const cues = [], cancelled = [];
  const engine = Object.assign(Object.create(Engine.prototype), {
    players: [human], localPlayerId: "you", phase: "CALM", hazard: "BLACKOUT", phaseTime: 24,
    elapsed: 10, stationRound: 1, stations: [], charges: { FLASHLIGHT: 0, FLARE: 0, SONAR: 0 },
    audio: { cue: value => cues.push(value) }, taskProgress: 0, multiplayerClient: null,
    emit() {}, onPuzzle: value => cancelled.push(value), checkWin() {}, onEnd() {},
    keys: new Set(), touchKeys: new Set(), bodies: [], flares: [],
    botRites: new Map(), botWork: new Map(), botRoutes: new Map(),
    itemActiveUntil: 0, killCooldownUntil: 0, taskHold: 0,
    wardClaims: new Set(), pendingWardDelta: 0, wardSettleTimer: 0, obstacles: world.SANCTUARY_OBSTACLES,
    ordealNumber: 0, botStrikeSpent: new Set(), stealthUntil: 0, stealthAvailableOrdeal: 0, pendingBodies: [], lastQuestions: new Map(), taskFailure: "",
  });
  engine.makeStations();
  return { engine, human, cues, cancelled };
}

test("a peer's team seal does not cancel your puzzle or consume your gear ritual", () => {
  const { engine, cancelled } = fixture();
  engine.activePuzzle = { stationIndex: 0 };
  engine.handleNetworkMessage({ type: "SYNC_WORLD", phase: "CALM", hazard: "BLACKOUT", time: 20, roundId: 1, taskProgress: 8, completedStations: ["FROST FONT"], bodies: [], flares: [] });
  assert.equal(engine.stations[0].teamRestored, true);
  assert.equal(engine.stations[0].completed, false);
  assert.ok(engine.activePuzzle);
  assert.equal(cancelled.length, 0);
});

test("a personal ritual on an already-restored shrine awards gear without extra progress", () => {
  const { engine } = fixture();
  engine.taskProgress = 8;
  const station = engine.stations[0];
  station.teamRestored = true;
  engine.wardClaims.add(station.label);
  engine.completeStation(station, false);
  engine.completeStation(station, false);
  assert.equal(engine.taskProgress, 8);
  assert.equal(engine.charges.FLASHLIGHT, 1);
  assert.equal(station.completed, true);
  assert.equal(engine.rewardNotice.progress, 0);
});

test("multiplayer waits for private acceptance before awarding gear and tolerates team snapshots", () => {
  const { engine } = fixture();
  const sent = [];
  engine.multiplayerClient = { sendTask: (...args) => sent.push(args) };
  const station = engine.stations[0];
  engine.completeStation(station, false);
  engine.completeStation(station, false);
  assert.equal(sent.length, 1);
  assert.equal(engine.charges.FLASHLIGHT, 0);
  assert.equal(station.pending, true);
  engine.handleNetworkMessage({ type: "GEAR_SYNC", accepted: true, stationId: station.label, stationCompleted: true, completedStations: [station.label], wardProgressGain: 8, roundId: 1, charges: { FLASHLIGHT: 1, FLARE: 0, SONAR: 0 } });
  assert.equal(station.pending, false);
  assert.equal(station.completed, true);
  assert.equal(engine.rewardNotice.progress, 8);
  engine.handleNetworkMessage({ type: "SYNC_WORLD", phase: "CALM", hazard: "BLACKOUT", time: 20, roundId: 1, taskProgress: 8, completedStations: [station.label], bodies: [], flares: [] });
  assert.equal(station.completed, true);
  assert.equal(engine.charges.FLASHLIGHT, 1);
});

test("private round reset preserves gear and team progress but reopens personal rites", () => {
  const { engine } = fixture();
  engine.charges.SONAR = 2; engine.taskProgress = 48;
  engine.stations[0].completed = true; engine.stations[0].teamRestored = true;
  engine.handleNetworkMessage({ type: "GEAR_SYNC", accepted: true, completedStations: [], roundId: 2, charges: { FLASHLIGHT: 0, FLARE: 0, SONAR: 2 } });
  engine.handleNetworkMessage({ type: "SYNC_WORLD", phase: "CALM", hazard: "PHANTOMS", time: 24, roundId: 2, taskProgress: 48, completedStations: [], bodies: [], flares: [] });
  assert.equal(engine.taskProgress, 48);
  assert.equal(engine.charges.SONAR, 2);
  assert.equal(engine.stations[0].completed, false);
  assert.equal(engine.stations[0].teamRestored, false);
});

test("the client can move beyond the old map and respects shared larger bounds", () => {
  const { engine, human } = fixture();
  human.x = 1600; human.y = 920;
  engine.keys.add("KeyD");
  engine.updateHuman(.035);
  assert.ok(human.x > 1600 && human.x <= world.PLAYER_BOUNDS.right);
  engine.navigationOpen = true;
  const x = human.x;
  engine.updateHuman(.035);
  assert.equal(human.x, x, "opening map stops local input without stopping the world");
});

test("an incorrect shrine answer shows a short notice without blocking movement or a fresh attempt", () => {
  const { engine, human } = fixture();
  const station = engine.stations.find(station => station.puzzle);
  human.x = station.x; human.y = station.y + 55;
  engine.tryOpenPuzzle();
  const originalQuestion = engine.activePuzzle.prompt;
  engine.submitPuzzle((engine.activePuzzle.answerIndex + 1) % 3);
  assert.equal(engine.activePuzzle, null);
  assert.match(engine.snapshot().taskFailure, /Incorrect answer/);
  assert.equal(engine.charges[station.reward], 0);
  engine.keys.add("KeyD");
  const x = human.x;
  engine.updateHuman(1 / 60);
  assert.ok(human.x > x, "failure notification must not freeze movement");
  assert.equal(human.working, false, "a failed ritual is no longer being worked on");
  engine.elapsed += 3.5;
  assert.equal(engine.snapshot().taskFailure, "", "notice dismisses automatically without a button");
  // The notice must not act as a retry lock, even if it is still visible.
  engine.elapsed -= 2;
  station.cooldown = 0;
  engine.tryOpenPuzzle();
  assert.ok(engine.activePuzzle);
  assert.notEqual(engine.activePuzzle.prompt, originalQuestion);
  assert.equal(engine.snapshot().taskFailure, "");
});

test("client prediction and co-op authority agree through old walls under delayed, reordered acknowledgements", () => {
  for (const start of [{ x: 1130, y: 700 }, { x: 400, y: 225 }]) {
    const { engine, human } = fixture();
    const room = new GameRoom("SLDE");
    const socket = { readyState: 1, send() {}, close() {} };
    room.addClient("you", socket, "Warden", "#20d8ed", "hood");
    room.state = "PLAYING";
    const authority = room.players.get("you");
    Object.assign(authority, start, { role: "CREWMATE" });
    Object.assign(human, start);
    engine.multiplayerClient = { connected: true };
    engine.pendingInputs = new Map();
    engine.movementBuffer = { push() {} };
    engine.keys.add("KeyD");
    const delivery = [];
    let seq = 0, largestCorrection = 0;
    for (let frame = 0; frame < 150; frame++) {
      engine.updateHuman(1 / 60);
      if (frame % 3 === 0) {
        seq++;
        const input = { type: "PLAYER_INPUT", x: Math.round(human.x), y: Math.round(human.y), vx: Math.round(human.vx), vy: Math.round(human.vy), angle: 0, flashlight: false, seq };
        engine.pendingInputs.set(seq, { x: input.x, y: input.y });
        room.handleMessage("you", input);
        delivery.push({ at: frame + [7, 2, 4][seq % 3], value: { ...authority } });
      }
      for (let i = delivery.length - 1; i >= 0; i--) {
        if (delivery[i].at > frame) continue;
        const before = { x: human.x, y: human.y };
        engine.applyMovement([delivery.splice(i, 1)[0].value]);
        largestCorrection = Math.max(largestCorrection, Math.hypot(human.x - before.x, human.y - before.y));
      }
    }
    assert.ok(human.x > start.x + 400, "walkable old-map boundaries and old prop positions cannot stop the slime");
    assert.ok(largestCorrection < 2, `normal co-op packets should not rubber-band (${largestCorrection}px)`);
    assert.ok(Math.abs(authority.x - human.x) < 13, "the authority follows the latest transmitted input");
  }
});

test("a glancing client collision preserves tangential movement while visible trunks stay solid", () => {
  const { engine, human } = fixture();
  const trunk = world.SANCTUARY_OBSTACLES.find(obstacle => obstacle.id === "nw-monolith");
  human.x = trunk.x - trunk.r - 22;
  human.y = trunk.y;
  human.vx = 100; human.vy = 100;
  engine.keys.add("KeyD"); engine.keys.add("KeyS");
  engine.updateHuman(1 / 60);
  assert.ok(human.vy > 80, "do not damp the safe sliding axis to8%");
  assert.ok(Math.hypot(human.x - trunk.x, human.y - trunk.y) >= trunk.r + 22 - 1e-6);
  const beforeY = human.y;
  for (let frame = 0; frame < 45; frame++) engine.updateHuman(1 / 60);
  assert.ok(human.y > beforeY + 60, "the slime slides around the tree instead of sticking");
});

test("solo bots must approach a shrine and dwell before contributing once", () => {
  const { engine } = fixture();
  const station = engine.stations[0];
  const bot = { ...engine.human, id: "bot-1", ai: true, atStation: 0, thinkAt: 100, targetX: station.x, targetY: station.y + 48, gearCharges: { FLASHLIGHT: 0, FLARE: 0, SONAR: 0 } };
  engine.players.push(bot);
  engine.updateBots(.035);
  assert.equal(engine.taskProgress, 0, "no abstract remote auto-repair");
  bot.x = station.x; bot.y = station.y + 48; bot.vx = 0; bot.vy = 0;
  engine.updateBots(.035);
  assert.equal(bot.vx, 0);
  assert.equal(bot.vy, 0);
  assert.equal(bot.working, true, "the bot visibly stops to perform the rite");
  for (let i = 0; i < 76; i++) engine.updateBots(.035);
  assert.equal(engine.taskProgress, 0, "public progress waits for its shared settlement");
  assert.equal(engine.pendingWardDelta, matchRules.ritualProgress(2, false));
  assert.equal(bot.gearCharges.FLASHLIGHT, 1);
  assert.equal(station.completed, false, "a bot cannot consume the human's ritual");
  assert.equal(station.teamRestored, true);
});

test("Echo Bell renders only nearby anonymous moving contacts in every Ordeal", () => {
  const { engine, human } = fixture();
  engine.phase = "ORDEAL"; engine.selectedItem = "SONAR";
  engine.elapsed = 10; engine.itemActiveUntil = 16;
  const peer = { ...human, id: "peer", x: human.x + 70, vx: 80, name: "SECRET NAME", color: "#ff0000" };
  engine.players.push(peer, { ...peer, id: "still", x: human.x + 90, vx: 0 }, { ...peer, id: "far", x: human.x + 450 }, { ...peer, id: "dead", alive: false });
  engine.getPhantoms = () => [];
  for (const hazard of ["BLACKOUT", "FOG", "MOONGLARE", "ROOTWAKE", "PHANTOMS", "MIRROR_POOL"]) {
    engine.hazard = hazard;
    const calls = [], styles = [];
    const ctx = new Proxy({}, { get: (_target, property) => (...args) => calls.push([property, ...args]), set: (_target, property, value) => { styles.push([property, value]); return true; } });
    engine.drawSonarEchoes(ctx);
    assert.equal(calls.filter(call => call[0] === "arc").length, 2, hazard);
    assert.ok(calls.filter(call => call[0] === "arc").every(call => call[1] === peer.x));
    assert.equal(calls.some(call => call[0] === "fillText"), false, "no names");
    assert.equal(styles.some(([, value]) => value === peer.color), false, "no identity colors");
  }
  engine.elapsed = 16;
  const calls = [];
  engine.drawSonarEchoes(new Proxy({}, { get: (_target, property) => (...args) => calls.push([property, ...args]) }));
  assert.equal(calls.length, 0, "contacts end with the item charge");
});

test("Echo Bell cannot reveal a neighboring Rootwake chamber even within hearing range", () => {
  const { engine, human } = fixture();
  human.x = 610; human.y = 350;
  engine.phase = "ORDEAL"; engine.hazard = "ROOTWAKE";
  engine.selectedItem = "SONAR"; engine.itemActiveUntil = 16;
  engine.players.push({ ...human, id: "across-root", x: 710, vx: 80 });
  const arcs = [];
  engine.drawSonarEchoes(new Proxy({}, { get: (_target, property) => (...args) => { if (property === "arc") arcs.push(args); } }));
  assert.equal(arcs.length, 0);
});

test("phase changes immediately publish the Rootwake mask to navigation", () => {
  const { engine } = fixture();
  engine.heardCueIds = new Set();
  const forced = [];
  engine.emit = force => forced.push(force);
  engine.handleNetworkMessage({ type: "SYNC_WORLD", phase: "ORDEAL", hazard: "ROOTWAKE", time: 10, roundId: 1, taskProgress: 0, completedStations: [], bodies: [], flares: [] });
  assert.equal(forced.at(-1), true);
});

test("camera masks use viewport offsets instead of shrinking an entire world mask", () => {
  const { engine } = fixture();
  const maskCalls = [], screenCalls = [];
  engine.phase = "ORDEAL"; engine.hazard = "FOG";
  engine.camera = { x: 480, y: 220 }; engine.viewWidth = 800; engine.viewHeight = 760;
  engine.mask = {};
  engine.maskCtx = new Proxy({}, { get: (_target, property) => (...args) => { maskCalls.push([property, ...args]); } });
  engine.cutRadial = () => {};
  const ctx = new Proxy({}, { get: (_target, property) => (...args) => { screenCalls.push([property, ...args]); } });
  engine.drawLighting(ctx);
  assert.ok(maskCalls.some(call => call[0] === "clearRect" && call[3] === 800 && call[4] === 760));
  assert.ok(maskCalls.some(call => call[0] === "setTransform" && call[5] === -480 && call[6] === -220));
  assert.ok(screenCalls.some(call => call[0] === "drawImage" && call[2] === 480 && call[3] === 220));
});
