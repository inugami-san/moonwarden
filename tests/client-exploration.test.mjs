import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as world from "../server/sanctuary-map.ts";
import * as rules from "../server/ordeal-rules.ts";
import * as matchRules from "../server/match-rules.ts";
import * as reportRules from "../server/report-rules.ts";
import * as taskHold from "../app/task-hold.ts";
import * as restoration from "../app/restoration-art.ts";
import { planRoute } from "../server/sanctuary-paths.ts";
import { preparationStation } from "../app/warden-objectives.ts";
import { GameRoom } from "../server/game-room.ts";
import { movementVector } from "../app/joystick-input.ts";
import { sightAt } from "../server/visibility.ts";

const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const node = ast.statements.find(statement => ts.isClassDeclaration(statement) && statement.name?.text === "OrdealEngine");
const js = ts.transpileModule(node.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function fixture() {
  const Engine = runInNewContext(`${js}\nOrdealEngine`, {
    ...world, ...rules, ...matchRules, ...reportRules, ...taskHold, ...restoration, W: world.WORLD_WIDTH, H: world.WORLD_HEIGHT, planRoute, preparationStation, movementVector, sightAt,
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

test("the real client report handler and snapshot share the first-Ordeal lock, cooldown, and body exception", () => {
  const { engine, human } = fixture();
  const reports = [];
  engine.multiplayerClient = { sendReport: id => reports.push(id) };
  engine.paused = false; engine.obstacles = [];
  assert.equal(engine.snapshot().canReport, false);
  assert.equal(engine.snapshot().reportLabel, "Locked");
  engine.report(); assert.equal(reports.length, 0, "keyboard/programmatic calls cannot bypass the disabled button");
  engine.emergency = reportRules.finishFirstOrdeal(reportRules.initialEmergencyState());
  assert.equal(engine.snapshot().canReport, true);
  engine.report(); assert.deepEqual(reports, [undefined]);
  engine.emergency = reportRules.afterMeeting(engine.emergency);
  assert.equal(engine.snapshot().canReport, false);
  assert.equal(engine.snapshot().reportLabel, "60s");
  engine.report(); assert.equal(reports.length, 1);
  engine.bodies = [{ id: "nearby-puddle", x: human.x + 20, y: human.y, name: "Fallen", age: 0 }];
  assert.equal(engine.snapshot().canReport, true);
  assert.equal(engine.snapshot().reportLabel, "Report");
  engine.report(); assert.deepEqual(reports, [undefined, "nearby-puddle"]);
  engine.bodies = []; engine.emergency = reportRules.initialEmergencyState();
  engine.handleNetworkMessage({ type: "SYNC_WORLD", emergency: { firstOrdealComplete: true, cooldownRemaining: 42.4 }, phase: "CALM", hazard: "BLACKOUT", time: 20, roundId: 1, taskProgress: 0, bodies: [], flares: [] });
  assert.equal(engine.snapshot().reportLabel, "43s", "UI follows server state instead of guessing from the phase count");
});

test("hold-E task progress reaches completion once and resets on release, leaving, or changing shrine", () => {
  const { engine, human } = fixture();
  engine.obstacles = []; engine.moveVector = { vx: 0, vy: 0 };
  const shrine = { label: "HOLD A", x: human.x, y: human.y, completed: false, pending: false, cooldown: 0, reward: "FLARE" };
  engine.stations = [shrine];
  const completed = [];
  engine.completeStation = station => { completed.push(station.label); station.pending = true; };
  engine.keys.add("KeyE");
  engine.updateHuman(.9);
  assert.equal(engine.snapshot().taskHoldProgress, .5);
  assert.equal(engine.snapshot().taskHolding, true);
  engine.keys.delete("KeyE"); engine.updateHuman(.02);
  assert.equal(engine.snapshot().taskHoldProgress, 0);
  engine.keys.add("KeyE"); engine.updateHuman(.9);
  shrine.label = "HOLD B"; engine.updateHuman(.18);
  assert.equal(engine.snapshot().taskHoldProgress, .1, "progress cannot be carried to a different station");
  human.x += 100; engine.updateHuman(.02);
  assert.equal(engine.snapshot().taskHoldProgress, 0);
  human.x = shrine.x; engine.updateHuman(1.79);
  assert.equal(completed.length, 0);
  engine.updateHuman(.02); engine.updateHuman(.2);
  assert.deepEqual(completed, ["HOLD B"]);
  assert.equal(engine.snapshot().taskHoldProgress, 0);
  assert.equal(engine.snapshot().taskPrompt, false, "server-pending rewards do not start another channel");
});

test("touch channels use the same gauge and cancel on lost input or navigation", () => {
  for (const role of ["CREWMATE", "IMPOSTOR"]) {
    const { engine, human } = fixture();
    human.role = role;
    engine.audio.unlock = () => Promise.resolve();
    engine.obstacles = []; engine.moveVector = { vx: 0, vy: 0 };
    engine.stations = [{ label: "TOUCH", x: human.x, y: human.y, completed: false, pending: false, cooldown: 0, reward: "FLARE" }];
    engine.setTouch("KeyE", true); engine.updateHuman(.9);
    assert.equal(engine.snapshot().taskHoldProgress, .5);
    engine.setTouch("KeyE", false); engine.updateHuman(.01);
    assert.equal(engine.snapshot().taskHoldProgress, 0);
    engine.setTouch("KeyE", true); engine.updateHuman(.9);
    engine.setNavigationOpen(true);
    assert.equal(engine.snapshot().taskHoldProgress, 0);
    assert.equal(engine.touchKeys.has("KeyE"), false);
  }
});

test("native navigation/settings and notebook dialogs retain Escape and never enqueue movement", () => {
  // Class-field handlers live on constructed instances, not the prototype fixture.
  const field = node.members.find(member => member.name?.getText(ast) === "keyDown");
  const factoryJs = ts.transpileModule(`function handlerFactory() { return ${field.initializer.getText(ast)}; }`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const makeHandler = runInNewContext(`${factoryJs}\nhandlerFactory`);
  for (const gate of ["navigationOpen", "notebookOpen"]) {
    const { engine } = fixture();
    engine.keyDown = makeHandler.call(engine);
    engine[gate] = true;
    let prevented = false;
    for (const code of ["Escape", "KeyD", "KeyQ"]) engine.keyDown({ code, target: null, preventDefault() { prevented = true; } });
    assert.equal(prevented, false, "the browser retains native dialog keys");
    assert.equal(engine.keys.size, 0);
  }
  for (const tagName of ["BUTTON", "SUMMARY"]) {
    const { engine } = fixture();
    engine.keyDown = makeHandler.call(engine);
    engine.keyDown({ code: "Space", target: { tagName }, preventDefault() { assert.fail("native activation must not be cancelled"); } });
    assert.equal(engine.keys.size, 0, "opening role guidance cannot enqueue a strike");
  }
});

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

test("the actual movement handler preserves joystick drag strength and applies Mirror Pool to analog input", () => {
  for (const [strength, mirror] of [[.2, false], [1, false], [.2, true]]) {
    const { engine, human } = fixture();
    engine.moveVector = { vx: strength, vy: 0 };
    if (mirror) { engine.phase = "ORDEAL"; engine.hazard = "MIRROR_POOL"; }
    const x = human.x;
    engine.updateHuman(1 / 60);
    assert.ok(Math.abs(human.vx - strength * 184 * .2 * (mirror ? -1 : 1)) < 1e-8);
    assert.equal(human.x > x, !mirror);
  }
});

test("opening navigation clears the real analog handler and held keyboard movement", () => {
  const { engine, human } = fixture();
  engine.moveVector = { vx: .6, vy: .8 };
  engine.keys.add("KeyD"); human.vx = 80; human.vy = 20;
  engine.setNavigationOpen(true);
  assert.equal(engine.keys.size, 0);
  assert.deepEqual({ ...engine.moveVector }, { vx: 0, vy: 0 });
  assert.equal(human.vx, 0); assert.equal(human.vy, 0);
});

test("rotation clears analog/keyboard input and pauses solo clocks without pausing live multiplayer", () => {
  const field = node.members.find(member => member.name?.getText(ast) === "loop");
  const factoryJs = ts.transpileModule(`function makeLoop() { return ${field.initializer.getText(ast)}; }`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const makeLoop = runInNewContext(`${factoryJs}\nmakeLoop`, { followCamera: value => value, viewportToWorld: value => value, requestAnimationFrame: () => 1 });
  for (const multiplayer of [false, true]) {
    const { engine, human } = fixture();
    let updates = 0;
    Object.assign(engine, { running: true, last: 1000, elapsed: 10, particles: [], camera: { x: 0, y: 0 }, pointerViewport: { x: 0, y: 0 }, viewWidth: 844, viewHeight: 390,
      updateDevourEffects() {}, update() { updates++; }, draw() {}, emit() {} });
    if (multiplayer) engine.multiplayerClient = {};
    engine.loop = makeLoop.call(engine);
    engine.moveVector = { vx: .6, vy: .8 }; engine.keys.add("KeyD"); human.vx = 80; human.vy = 20;
    engine.setOrientationBlocked(true);
    assert.equal(engine.keys.size, 0);
    assert.deepEqual({ ...engine.moveVector }, { vx: 0, vy: 0 });
    assert.equal(human.vx, 0);
    engine.loop(1016);
    assert.equal(updates, multiplayer ? 1 : 0);
    assert.equal(engine.elapsed > 10, multiplayer);
    engine.setOrientationBlocked(false);
    engine.loop(1032);
    assert.equal(updates, multiplayer ? 2 : 1, "landscape resumes the same match without a reset");
  }
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
