import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { joystickVector, movementVector, JoystickInput, JOYSTICK_RADIUS, JOYSTICK_DEAD_ZONE } from "../app/joystick-input.ts";
import { PairedRituals } from "../server/pair-ritual.ts";
import { resolveReporterVote } from "../server/match-rules.ts";
import { GameRoom } from "../server/game-room.ts";
import { createMatchLayout, shrineRoutesReachable, stationApproaches } from "../server/match-layout.ts";
import { CENTER, SANCTUARY_CLEARINGS, sanctuaryZoneName } from "../server/sanctuary-map.ts";
import { makeObservation, observationClaim } from "../app/field-notes.ts";

test("joystick has a radial dead zone and a proportional continuous velocity", () => {
  assert.deepEqual(joystickVector(0, 0), { vx: 0, vy: 0 });
  assert.deepEqual(joystickVector(JOYSTICK_DEAD_ZONE, 0), { vx: 0, vy: 0 });
  assert.equal(joystickVector((JOYSTICK_RADIUS + JOYSTICK_DEAD_ZONE) / 2, 0).vx, .5);
  assert.equal(joystickVector(0, -JOYSTICK_RADIUS).vy, -1);
  assert.equal(joystickVector(1000, 0).vx, 1);
  for (let angle = 0; angle < Math.PI * 2; angle += .1) {
    const vector = joystickVector(Math.cos(angle) * 100, Math.sin(angle) * 100);
    assert.ok(Math.hypot(vector.vx, vector.vy) <= 1 + 1e-12);
    assert.ok(Math.abs(vector.vx - Math.cos(angle)) < 1e-12);
  }
  for (const input of [[NaN, 0], [0, Infinity], [1, 2, 0], [1, 2, 4, 6]]) assert.deepEqual(joystickVector(...input), { vx: 0, vy: 0 });
});

test("keyboard and joystick share one capped movement path without normalizing slow movement", () => {
  assert.deepEqual(movementVector(0, 0, { vx: .2, vy: .1 }), { vx: .2, vy: .1 });
  assert.deepEqual(movementVector(1, 0, { vx: -1, vy: 0 }), { vx: 1, vy: 0 });
  assert.ok(Math.abs(Math.hypot(...Object.values(movementVector(1, 1))) - 1) < 1e-12);
  assert.deepEqual(movementVector(0, 0, { vx: .2, vy: -.3 }, true), { vx: -.2, vy: .3 });
  assert.deepEqual(movementVector(0, 0, { vx: Infinity, vy: 0 }), { vx: 0, vy: 0 });
});

test("floating stick owns one left-side pointer, follows outside its area, and releases cleanly", () => {
  const stick = new JoystickInput();
  assert.equal(stick.begin(1, 400, 100, 700, 500), false, "right side belongs to actions/aim");
  assert.equal(stick.begin(1, 120, 200, 700, 500), true);
  assert.equal(stick.begin(2, 10, 10, 700, 500), false, "a second finger cannot steal movement");
  assert.equal(stick.move(2, 200, 200), false);
  assert.equal(stick.move(1, 950, 200), true, "captured drag may leave the left half");
  assert.equal(stick.vector.vx, 1);
  assert.equal(stick.end(2), false);
  assert.equal(stick.end(1), true);
  assert.deepEqual(stick.vector, { vx: 0, vy: 0 });
  assert.equal(stick.begin(3, 40, 470, 700, 500), true);
  assert.deepEqual(stick.origin, { x: 40, y: 470 }, "each gesture spawns at the new touch origin");
  stick.end(); assert.equal(stick.pointerId, null);
});

test("standard voting never rolls Moonsway unless the host explicitly enables Chaos", () => {
  const living = ["reporter", "suspect", "other"];
  const never = () => { throw Error("Standard voting must not draw random numbers"); };
  assert.deepEqual(resolveReporterVote("reporter", "suspect", living, "reporter", never), { targetId: "suspect", shifted: false });
  assert.deepEqual(resolveReporterVote("reporter", "suspect", living, "reporter", () => 0, true), { targetId: "other", shifted: true });
});

function pairActors() { return ["a", "b"].map(id => ({ id, x: 300, y: 300, vx: 0, vy: 0, alive: true })); }
const shrine = { id: "shrine", x: 300, y: 300 };
test("paired rites require two explicit, stationary, current-round participants for the full channel", () => {
  const ritual = new PairedRituals(), actors = pairActors();
  ritual.hold("a", shrine.id, 1, 0);
  let result = ritual.tick(actors, [shrine], () => false, 1, 100, .1);
  assert.equal(result.completions.length, 0);
  assert.equal(result.updates[0].progress, 0);
  ritual.hold("b", shrine.id, 1, 100);
  result = ritual.tick(actors, [shrine], () => false, 1, 200, .1);
  assert.equal(result.completions.length, 0);
  actors[1].vx = 40;
  result = ritual.tick(actors, [shrine], () => false, 1, 300, .1);
  assert.ok(result.updates.some(update => update.playerId === "a" && update.progress === 0));
  actors[1].vx = 0;
  let completions = [];
  for (let i = 0; i < 35; i++) {
    const now = 400 + i * 100;
    for (const actor of actors) ritual.hold(actor.id, shrine.id, 1, now);
    result = ritual.tick(actors, [shrine], () => false, 1, now, .1);
    for (const id of ["a", "b"]) ritual.autoPulse(id, shrine.id, 1, now);
    completions.push(...result.completions);
  }
  assert.deepEqual(completions.map(value => value.playerId), ["a", "b"]);
  assert.equal(ritual.tick(actors, [shrine], () => false, 1, 1800, .1).completions.length, 0, "completion clears the accepted holds");
});

test("stale, moving, distant, dead, already-rewarded, and previous-round participants cannot complete rites", () => {
  for (const invalid of ["expired", "moving", "distant", "dead", "completed", "round"]) {
    const ritual = new PairedRituals(), actors = pairActors();
    for (const actor of actors) ritual.hold(actor.id, shrine.id, 1, 0);
    if (invalid === "moving") actors[1].vy = 80;
    if (invalid === "distant") actors[1].x += 200;
    if (invalid === "dead") actors[1].alive = false;
    const result = ritual.tick(actors, [shrine], id => invalid === "completed" && id === "b", invalid === "round" ? 2 : 1, invalid === "expired" ? 1001 : 100, .1);
    assert.equal(result.completions.length, 0, invalid);
    assert.ok(result.updates.every(update => update.progress === 0), invalid);
    ritual.clear(); assert.equal(ritual.intents.size, 0);
  }
});

function roomFixture(t) {
  const room = new GameRoom("NEXT"), clients = new Map();
  for (const id of ["a", "b", "c", "d"]) {
    const client = { readyState: 1, sent: [], send(data) { this.sent.push(JSON.parse(data)); }, close() {} };
    clients.set(id, client); room.addClient(id, client, id.toUpperCase(), "#20d8ed", "hood");
  }
  t.after(() => room.destroy());
  return { room, clients };
}

test("Chaos is host-controlled, off by default, visible in the lobby, and fixed for the match", t => {
  const { room, clients } = roomFixture(t);
  assert.equal(room.chaosMoonsway, false);
  room.handleMessage("b", { type: "UPDATE_ROOM_CONFIG", targetPlayers: 4, botFill: false, chaosMoonsway: true });
  assert.equal(room.chaosMoonsway, false);
  room.handleMessage("a", { type: "UPDATE_ROOM_CONFIG", targetPlayers: 4, botFill: false, chaosMoonsway: true });
  assert.equal(clients.get("b").sent.filter(msg => msg.type === "LOBBY_UPDATED").at(-1).chaosMoonsway, true);
  room.handleMessage("a", { type: "START_MATCH", botFill: false, targetPlayers: 4 });
  assert.equal(clients.get("b").sent.find(msg => msg.type === "MATCH_STARTED").chaosMoonsway, true);
  room.handleMessage("a", { type: "UPDATE_ROOM_CONFIG", targetPlayers: 4, botFill: false, chaosMoonsway: false });
  assert.equal(room.chaosMoonsway, true);
});

test("server-authoritative cooperation rewards both roles once, preserves batching, and keeps sound/state local", t => {
  let now = 10000;
  t.mock.method(Date, "now", () => now);
  const { room, clients } = roomFixture(t);
  room.handleMessage("a", { type: "START_MATCH", botFill: false, targetPlayers: 4 });
  const station = room.stations[0];
  for (const player of room.players.values()) {
    player.role = player.id === "b" ? "IMPOSTOR" : "CREWMATE";
    player.x = player.id === "a" || player.id === "b" ? station.x : CENTER.x;
    player.y = player.id === "a" || player.id === "b" ? station.y : CENTER.y;
    player.vx = 0; player.vy = 0;
  }
  for (const client of clients.values()) client.sent.length = 0;
  for (let i = 0; i < 35; i++) {
    for (const id of ["a", "b"]) room.handleMessage(id, { type: "PAIR_RITUAL", active: true, stationId: station.id, roundId: 1 });
    room.tickPairedRituals(.1, now);
    for (const id of ["a", "b"]) room.pairedRituals.autoPulse(id, station.id, 1, now);
    now += 100;
  }
  for (const id of ["a", "b"]) {
    assert.equal(room.itemCharges.get(id)[station.reward], 1);
    assert.ok(clients.get(id).sent.some(msg => msg.type === "GEAR_SYNC" && msg.accepted));
  }
  assert.equal(room.taskProgress, 0, "public gauge is not changed immediately by either participant");
  for (const id of ["c", "d"]) assert.equal(clients.get(id).sent.some(msg => msg.type === "PAIR_RITUAL_STATE"), false);
  const cues = clients.get("a").sent.filter(msg => msg.type === "SOUND_CUE");
  assert.ok(cues.length > 0);
  assert.ok(cues.every(msg => msg.cue.kind === "RITUAL" && !("role" in msg.cue) && !("playerId" in msg.cue)));
  room.handleMessage("a", { type: "PAIR_RITUAL", active: true, stationId: station.id, roundId: 1 });
  room.tickPairedRituals(.1, now);
  assert.equal(room.itemCharges.get("a")[station.reward], 1);
});

test("station layouts have two reachable approaches and cache callers cannot mutate other matches", () => {
  for (let seed = 0; seed < 60; seed++) {
    const layout = createMatchLayout(seed * 59328);
    assert.ok(shrineRoutesReachable(layout.stations, layout.obstacles), `seed ${seed}`);
    assert.ok(layout.stations.every(station => stationApproaches(station).length === 2));
  }
  const layout = createMatchLayout(11), x = layout.stations[0].x;
  layout.stations[0].x = -1000; layout.obstacles.pop();
  assert.equal(createMatchLayout(11).stations[0].x, x);
  for (const zone of SANCTUARY_CLEARINGS) assert.equal(sanctuaryZoneName(zone.x, zone.y), zone.label);
});

test("field notes are manual sanitized claims, never coordinates, roles, or verified sightings", () => {
  const roster = [{ id: "a", name: "Mochi", role: "IMPOSTOR", x: 999, y: 99 }];
  const note = makeObservation(roster, "a", "FALLEN SHRINE", "during the Ordeal");
  assert.deepEqual(note, { playerName: "Mochi", location: "FALLEN SHRINE", when: "during the Ordeal" });
  assert.equal(observationClaim(note), "I saw Mochi near fallen shrine during the Ordeal.");
  assert.equal(makeObservation(roster, "missing", "FALLEN SHRINE", "during the Ordeal"), null);
  assert.equal(makeObservation(roster, "a", "secret killer coordinates", "during the Ordeal"), null);
  assert.equal(makeObservation(roster, "a", "FALLEN SHRINE", "verified by server"), null);
});

test("mobile UI uses pointer capture and cancellation, not a directional D-pad or per-drag React state", async () => {
  const read = file => readFile(new URL(file, import.meta.url), "utf8");
  const page = await read("../app/page.tsx"), joystick = await read("../app/floating-joystick.tsx");
  assert.doesNotMatch(page, /className="touch-pad"|function TouchButton/);
  assert.match(page, /<FloatingJoystick/);
  for (const event of ["pointercancel", "lostpointercapture", "blur", "resize", "visibilitychange"]) assert.ok(joystick.includes(event));
  assert.match(joystick, /setPointerCapture/);
  assert.doesNotMatch(joystick, /useState/);
  assert.match(page, /!navigationExpanded && !notebookOpen/);
});

test("the actual joystick event lifecycle handles multitouch, control buttons, cancellation and cleanup", async () => {
  const source = await readFile(new URL("../app/floating-joystick.tsx", import.meta.url), "utf8");
  const ast = ts.createSourceFile("joystick.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "FloatingJoystick");
  const js = ts.transpileModule(component.getText(ast).replace(/^export /, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, jsxFactory: "h", jsxFragmentFactory: "fragment" } }).outputText;
  class Events {
    listeners = new Map();
    addEventListener(name, fn) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(fn); }
    removeEventListener(name, fn) { this.listeners.get(name)?.delete(fn); }
    emit(name, value = {}) { for (const fn of this.listeners.get(name) ?? []) fn(value); }
  }
  class Element { constructor(interactive = false) { this.interactive = interactive; } closest() { return this.interactive ? this : null; } }
  const surface = new Events(), window = new Events(), document = new Events(), captures = new Set(), values = [];
  const visual = { dataset: {}, style: { values: {}, setProperty(name, value) { this.values[name] = value; } } };
  surface.getBoundingClientRect = () => ({ left: 20, top: 80, width: 400, height: 600 });
  surface.setPointerCapture = id => captures.add(id);
  surface.hasPointerCapture = id => captures.has(id);
  surface.releasePointerCapture = id => captures.delete(id);
  let cleanup;
  const Component = runInNewContext(`${js}\nFloatingJoystick`, { JoystickInput, JOYSTICK_RADIUS, window, document, Element,
    useRef: () => ({ current: visual }), useEffect: fn => { cleanup = fn(); }, h: () => null, fragment: "fragment" });
  Component({ surfaceRef: { current: surface }, enabled: true, onVector: value => values.push({ ...value }) });
  const pointer = (id, x, y, interactive = false, pointerType = "touch") => ({ pointerId: id, clientX: x, clientY: y, target: new Element(interactive), pointerType, preventDefault() {} });
  surface.emit("pointerdown", pointer(9, 350, 200)); assert.equal(captures.size, 0);
  surface.emit("pointerdown", pointer(9, 80, 200, true)); assert.equal(captures.size, 0);
  surface.emit("pointerdown", pointer(9, 80, 200, false, "mouse")); assert.equal(captures.size, 0);
  surface.emit("pointerdown", pointer(1, 100, 300));
  assert.equal(visual.dataset.active, "true"); assert.equal(visual.style.values["--stick-x"], "80px");
  surface.emit("pointermove", pointer(1, 130, 300)); assert.ok(values.at(-1).vx > 0 && values.at(-1).vx < 1);
  surface.emit("pointerdown", pointer(2, 60, 200)); surface.emit("pointerup", pointer(2, 60, 200));
  assert.ok(captures.has(1), "the action finger cannot steal or cancel movement");
  surface.emit("pointermove", pointer(1, 900, 300)); assert.equal(values.at(-1).vx, 1);
  surface.emit("pointercancel", pointer(1, 900, 300));
  assert.deepEqual(values.at(-1), { vx: 0, vy: 0 }); assert.equal(captures.size, 0);
  for (const event of ["lostpointercapture", "blur", "resize", "visibilitychange"]) {
    surface.emit("pointerdown", pointer(3, 70, 250)); surface.emit("pointermove", pointer(3, 70, 300));
    if (event === "visibilitychange") { document.hidden = true; document.emit(event); }
    else if (event === "lostpointercapture") surface.emit(event, pointer(3, 70, 300));
    else window.emit(event);
    assert.deepEqual(values.at(-1), { vx: 0, vy: 0 }, event);
    assert.equal(visual.dataset.active, "false", event);
  }
  cleanup();
  assert.ok([...surface.listeners.values()].every(listeners => listeners.size === 0));
  assert.ok([...window.listeners.values()].every(listeners => listeners.size === 0));
  assert.ok([...document.listeners.values()].every(listeners => listeners.size === 0));
  assert.equal(captures.size, 0);
});
