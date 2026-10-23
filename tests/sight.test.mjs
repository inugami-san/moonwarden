import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { sightAt, SIGHT_RANGES } from "../server/visibility.ts";
import * as world from "../server/sanctuary-map.ts";
import * as rules from "../server/ordeal-rules.ts";
import * as camera from "../app/world-camera.ts";
import * as reportRules from "../server/report-rules.ts";
import * as taskHold from "../app/task-hold.ts";
import * as restoration from "../app/restoration-art.ts";

const observer = Object.freeze({ id: "you", x: 900, y: 400 });
const context = overrides => ({ observer, phase: "CALM", hazard: "FOG", obstacles: [], flares: [], ...overrides });
const point = (dx, dy = 0) => ({ id: "other", x: observer.x + dx, y: observer.y + dy });
const cover = Object.freeze({ id: "tree", kind: "ANCIENT_TREE", x: observer.x + 75, y: observer.y, r: 22, canopyRadius: 68, canopyHeight: 104, label: "Tree" });

test("Calm has local sight with a soft edge, independent of camera size", () => {
  assert.equal(sightAt(point(160), context()).kind, "IDENTIFIED");
  assert.equal(sightAt(point(265), context()).kind, "IDENTIFIED");
  assert.ok(sightAt(point(265), context()).alpha < 1);
  assert.equal(sightAt(point(280), context()).kind, "HIDDEN");
  assert.equal(sightAt(point(500), context()).kind, "HIDDEN");
  assert.equal(SIGHT_RANGES.calm, 280);
  for (const p of [{ x: NaN, y: 0 }, { x: 0, y: Infinity }]) assert.deepEqual(sightAt(p, context()), { kind: "HIDDEN", alpha: 0 });
});

test("cover hides players and bodies even at close range or inside a flare/beam", () => {
  const target = point(145);
  for (const extra of [{}, { beamAngle: 0 }, { flares: [{ ...target, life: 5 }] }, { ambientLit: true }]) {
    const ctx = context({ phase: "ORDEAL", hazard: "BLACKOUT", obstacles: [cover], ...extra });
    assert.equal(sightAt(target, ctx).kind, "HIDDEN");
    assert.equal(sightAt({ x: target.x, y: target.y }, ctx).kind, "HIDDEN", "puddles use the same cover rule");
  }
  assert.equal(sightAt(point(0, 90), context({ obstacles: [cover] })).kind, "IDENTIFIED");
});

test("each Ordeal limits local observation while preserving its identity rules", () => {
  for (const hazard of rules.HAZARDS) {
    const ctx = context({ phase: "ORDEAL", hazard });
    assert.equal(sightAt(point(400), ctx).kind, "HIDDEN", hazard);
  }
  assert.equal(sightAt(point(60), context({ phase: "ORDEAL", hazard: "BLACKOUT" })).kind, "IDENTIFIED");
  assert.equal(sightAt(point(70), context({ phase: "ORDEAL", hazard: "BLACKOUT" })).kind, "HIDDEN");
  assert.equal(sightAt(point(80), context({ phase: "ORDEAL" })).kind, "IDENTIFIED");
  assert.equal(sightAt(point(130), context({ phase: "ORDEAL" })).kind, "SHAPE");
  assert.equal(sightAt(point(181), context({ phase: "ORDEAL" })).kind, "HIDDEN");
  for (const hazard of ["MOONGLARE", "PHANTOMS"]) {
    const ctx = context({ phase: "ORDEAL", hazard, beamAngle: 0 });
    assert.equal(sightAt(point(40), ctx).kind, "SHAPE", "light cannot restore concealed identity");
    assert.equal(sightAt(observer, ctx).kind, "SHAPE", "the local costume is hidden too");
  }
});

test("light extends nearby inspection but is directional, finite, and expires", () => {
  const dark = context({ phase: "ORDEAL", hazard: "BLACKOUT" });
  assert.equal(sightAt(point(300), { ...dark, beamAngle: 0 }).kind, "IDENTIFIED");
  assert.equal(sightAt(point(-140), { ...dark, beamAngle: 0 }).kind, "HIDDEN");
  assert.equal(sightAt(point(331), { ...dark, beamAngle: 0 }).kind, "HIDDEN");
  assert.equal(sightAt(point(140), { ...dark, flares: [{ ...point(140), life: 5 }] }).kind, "IDENTIFIED");
  assert.equal(sightAt(point(140), { ...dark, flares: [{ ...point(140), life: 0 }] }).kind, "HIDDEN");
  assert.equal(sightAt({ ...point(400), flashlight: true }, dark).kind, "HIDDEN", "a distant light is not a global tracking beacon");
});

test("Rootwake blocks other chambers; only explicit private Moon Sight bypasses it", () => {
  const ctx = context({ observer: { id: "you", x: 610, y: 400 }, phase: "ORDEAL", hazard: "ROOTWAKE", beamAngle: 0 });
  const across = { id: "other", x: 710, y: 400 };
  assert.equal(sightAt(across, ctx).kind, "HIDDEN");
  assert.equal(sightAt(across, { ...ctx, moonSight: true }).kind, "IDENTIFIED");
  assert.equal(sightAt(point(145), context({ obstacles: [cover], moonSight: true })).kind, "IDENTIFIED");
  assert.equal(sightAt(point(145), context({ obstacles: [cover], moonSight: false })).kind, "HIDDEN");
});

const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const engineNode = ast.statements.find(n => ts.isClassDeclaration(n) && n.name?.text === "OrdealEngine");
const javascript = ts.transpileModule(engineNode.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const resizeNode = engineNode.members.find(n => ts.isPropertyDeclaration(n) && n.name.getText(ast) === "resize");
const resizeJavascript = ts.transpileModule(`function resizeEngine() { const resize = ${resizeNode.initializer.getText(ast)}; resize(); }\nresizeEngine;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function fixture() {
  const draws = [], audio = [], reports = [];
  const runtime = {
    ...world, ...rules, ...camera, ...reportRules, ...taskHold, ...restoration, sightAt, W: world.WORLD_WIDTH, H: world.WORLD_HEIGHT,
    DEVOUR_SECONDS: 1.6, HEARING_RANGE: 300, KILL_COOLDOWN_SECONDS: 1.6, Math, window: { devicePixelRatio: 2 },
    dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y), clamp: (n, a, b) => Math.max(a, Math.min(b, n)),
    drawSanctumStatus() {}, drawSlimeConsumption: (...args) => draws.push(["consume", ...args]),
  };
  const Engine = runInNewContext(`${javascript}\nOrdealEngine`, runtime);
  const human = { ...observer, role: "CREWMATE", alive: true, vx: 0, vy: 0, color: "#20d8ed", ai: false };
  const engine = Object.assign(Object.create(Engine.prototype), {
    localPlayerId: "you", players: [human], phase: "CALM", hazard: "FOG", elapsed: 10, phaseTime: 24,
    obstacles: [], flares: [], particles: [], devourEvents: [], stations: [], bodies: [], reducedMotion: false,
    selectedItem: "FLASHLIGHT", itemActiveUntil: 0, moonSightUntil: 0, mouse: { x: 1200, y: 400 },
    audio: { devour: () => audio.push("gulp"), unlock: () => Promise.resolve() }, suspicion: new Map(),
    camera: { x: 400, y: 150 }, viewWidth: 915, viewHeight: 543,
    ctx: new Proxy({}, { get: (_, key) => (...args) => draws.push([key, ...args]), set: () => true }),
    canvas: { width: 1830 }, emit() {}, flashMessage() {},
    resize: runInNewContext(resizeJavascript, runtime),
    multiplayerClient: { sendReport: value => reports.push(value) },
  });
  return { engine, human, draws, audio, reports };
}

test("the actual renderer hides distant/blocked actors instead of painting faint silhouettes", () => {
  const { engine, human, draws } = fixture();
  engine.players.push({ ...point(150), alive: true }, { ...point(400), id: "far", alive: true }, { ...point(0, 100), id: "clear", alive: true });
  engine.obstacles = [cover];
  for (const name of ["drawRoom", "drawBeams", "drawLighting", "drawParticles", "drawCanvasLabels", "drawObstacle"]) engine[name] = () => {};
  engine.drawSlime = (_ctx, player) => draws.push(["actor", player.id]);
  engine.draw();
  assert.deepEqual(draws.filter(([name]) => name === "actor").map(([, id]) => id).sort(), [human.id, "clear"].sort());
});

test("hidden attacks create no particles/shake, and approaching later cannot replay them", () => {
  const { engine, human } = fixture();
  engine.startDevour("body-unseen", human.x + 400, human.y, "#ff5d9e");
  const event = engine.devourEvents[0];
  assert.equal(event.witnessed, "HIDDEN");
  assert.equal(engine.particles.length, 0);
  assert.equal(engine.devourShakeUntil, undefined);
  human.x += 400;
  assert.equal(engine.canRenderDevour(event), false);
  engine.elapsed += 1;
  engine.updateDevourEffects(.1);
  assert.equal(engine.particles.length, 0);
});

test("nearby clear witnesses see attacks; leaving sight hides the ongoing animation", () => {
  const { engine, human } = fixture();
  engine.startDevour("body-near", human.x + 120, human.y, "#ff5d9e");
  const event = engine.devourEvents[0];
  assert.equal(event.witnessed, "IDENTIFIED");
  assert.equal(engine.canRenderDevour(event), true);
  assert.ok(engine.particles.length > 0);
  human.x -= 400;
  assert.equal(engine.canRenderDevour(event), false);
});

test("anonymous witnesses retain anonymity even if the phase clears mid-animation", () => {
  const { engine, human } = fixture();
  engine.phase = "ORDEAL"; engine.hazard = "FOG";
  engine.startDevour("body-shape", human.x + 130, human.y, "#ff5d9e");
  assert.equal(engine.devourEvents[0].witnessed, "SHAPE");
  assert.ok(engine.particles.every(p => p.color === "#b5c1c4"));
  engine.phase = "CALM";
  assert.equal(engine.devourEvents[0].witnessed, "SHAPE", "identity cannot be upgraded retroactively");
});

test("late private victim feedback restores only the participant's own animation", () => {
  const { engine, human } = fixture();
  engine.startDevour("body-you", human.x, human.y, human.color);
  engine.devourEvents[0].witnessed = "HIDDEN";
  engine.startDevour("body-you", human.x, human.y, human.color, "killer", "#ff5d9e");
  assert.equal(engine.devourEvents.length, 1);
  assert.equal(engine.devourEvents[0].witnessed, "IDENTIFIED");
});

test("AI witnesses use the same identity/cover limits and gain no omniscient suspicion", () => {
  const { engine, human } = fixture();
  const bot = { ...human, id: "bot", ai: true };
  const killer = { ...point(130), id: "killer", alive: true };
  const victim = { ...point(145), id: "victim", alive: false };
  engine.players.push(bot, killer, victim);
  engine.phase = "ORDEAL"; engine.hazard = "FOG";
  engine.recordWitnesses(victim, killer);
  assert.equal(engine.suspicion.get("bot")?.has("killer") ?? false, false);
  engine.phase = "CALM"; engine.obstacles = [cover];
  engine.recordWitnesses(victim, killer);
  assert.equal(engine.suspicion.get("bot")?.has("killer") ?? false, false);
  engine.obstacles = []; engine.recordWitnesses(victim, killer);
  assert.ok(engine.suspicion.get("bot").get("killer") >= 4);
});

test("puddles and report actions cannot reveal a body through nearby cover", () => {
  const { engine, human, draws, reports } = fixture();
  engine.obstacles = [{ ...cover, x: human.x + 35, r: 12 }];
  const body = { ...point(70), id: "body", color: "#ff5d9e", name: "Warden", age: 0 };
  engine.bodies = [body]; engine.phase = "ORDEAL";
  engine.drawBody(engine.ctx, body); engine.report();
  assert.equal(draws.length, 0);
  assert.equal(reports.length, 0);
  engine.obstacles = []; engine.report();
  assert.deepEqual(reports, ["body"]);
});

test("event particles are visibility-gated and painted before the fog mask", () => {
  const { engine, human, draws } = fixture();
  engine.particles = [{ x: human.x + 500, y: human.y, sourceX: human.x + 500, sourceY: human.y, life: .5, max: 1, size: 2, color: "#ff5d9e" }];
  engine.drawParticles(engine.ctx);
  assert.equal(draws.filter(([name]) => name === "arc").length, 0);
  assert.ok(source.indexOf("    this.drawParticles(ctx);", source.indexOf("  draw() {")) < source.indexOf("    if (!moonGlareActive) this.drawLighting(ctx);", source.indexOf("  draw() {")));
  const lighting = source.slice(source.indexOf('    if (this.hazard === "MIRROR_POOL") {', source.indexOf("  drawLighting(")), source.indexOf('    if (this.hazard !== "BLACKOUT"'));
  assert.match(lighting, /visibilityFor\(player, this.human, false\)\.kind === "HIDDEN"\) continue/);
});

test("normal-client strike targeting cannot locate an unseen Warden behind cover", () => {
  const { engine, human } = fixture();
  const strikes = [];
  human.role = "IMPOSTOR"; engine.phase = "ORDEAL";
  engine.players.push({ ...point(70), id: "victim", role: "CREWMATE", alive: true });
  engine.multiplayerClient.sendKill = id => strikes.push(id);
  engine.obstacles = [{ ...cover, x: human.x + 35, r: 12 }];
  engine.kill(); assert.equal(strikes.length, 0);
  engine.obstacles = []; engine.kill(); assert.deepEqual(strikes, ["victim"]);
});

test("zoom keeps native canvas resolution and preserves desktop/phone input scaling", () => {
  for (const [width, height] of [[1280, 760], [390, 650]]) {
    const { engine } = fixture();
    engine.canvas = { clientWidth: width, clientHeight: height };
    engine.mask = {}; engine.updateRect = () => {};
    engine.resize();
    assert.equal(engine.canvas.width, width * 2); assert.equal(engine.canvas.height, height * 2);
    assert.deepEqual({ width: engine.viewWidth, height: engine.viewHeight }, camera.cameraViewport(width, height));
  }
});
