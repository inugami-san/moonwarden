import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { GameRoom } from "../server/game-room.ts";
import { accessoryFit, collarAnchor, drawWornAccessory, isCollar } from "../app/accessory-art.ts";
import { FALLEN_CAT_URL, loadFallenCat, drawFallenCat } from "../app/fallen-cat-art.ts";
import { tintCatFur } from "../app/mooncat-sprites.ts";
import { catGreetingPhase } from "../app/cat-portrait.tsx";

test("all four new collars survive room creation, profile update and match start", t => {
  const room = new GameRoom("COLLAR"); t.after(() => room.destroy());
  const looks = ["moonbell", "leafband", "starlock", "mothbow"];
  const clients = looks.map(() => ({ readyState: 1, sent: [], send(raw) { this.sent.push(JSON.parse(raw)); }, close() {} }));
  looks.forEach((hat, i) => room.addClient(`cat-${i}`, clients[i], `Cat ${i}`, ["#20d8ed", "#95ef45", "#ff5d9e", "#ffd94a"][i], hat));
  looks.forEach((hat, i) => assert.equal(room.players.get(`cat-${i}`).hat, hat));
  room.handleMessage("cat-0", { type: "UPDATE_PROFILE", playerName: "Cat 0", color: "#20d8ed", hat: "starlock", eyeStyle: "ROUND" });
  assert.equal(room.players.get("cat-0").hat, "starlock");
  room.handleMessage("cat-0", { type: "START_MATCH", botFill: false, targetPlayers: 4 });
  const match = clients[0].sent.find(m => m.type === "MATCH_STARTED");
  assert.ok(match); assert.equal(match.players.find(p => p.id === "cat-0").hat, "starlock");
});

test("collars sit at the neck and mirror without using a head-height anchor", () => {
  for (const value of ["moonbell", "leafband", "starlock", "mothbow", "dewdrop", "fernwrap"]) assert.equal(isCollar(value), true);
  assert.equal(isCollar("hood"), false);
  assert.deepEqual(collarAnchor("SE"), { x: 15, y: -2 });
  assert.deepEqual(collarAnchor("SW"), { x: -15, y: -2 });
  assert.equal(collarAnchor("NORTH").y, -14);
});

test("cat accessories fit front, side, rear and the separate seated home pose", () => {
  const south = accessoryFit("moonbell", "SOUTH"), east = accessoryFit("moonbell", "EAST"), west = accessoryFit("moonbell", "WEST");
  assert.ok(east.scaleX < south.scaleX, "side band follows neck perspective, not a frontal necklace");
  assert.equal(east.charmScale, west.charmScale, "charms stay round, not perspective-squashed");
  assert.equal(east.x, -west.x); assert.equal(east.angle, -west.angle);
  for (const direction of ["NORTH", "NE", "NW"]) assert.equal(accessoryFit("moonbell", direction).rear, true);
  const seated = accessoryFit("moonbell", "SOUTH", "SEATED");
  assert.equal(seated.x, 0); assert.ok(seated.y >= 0 && seated.y < 12);
  assert.ok(accessoryFit("mooncap", "SOUTH", "SEATED").y < -30, "headwear cannot cover the seated face");
  for (const hat of ["antlers", "hood", "moth", "mooncap", "moonbell", "leafband", "starlock", "mothbow", "dewdrop", "fernwrap", "mushroom"]) {
    for (const direction of ["NORTH", "NE", "EAST", "SE", "SOUTH", "SW", "WEST", "NW"]) {
      const fit = accessoryFit(hat, direction);
      for (const value of Object.values(fit)) if (typeof value === "number") assert.ok(Number.isFinite(value));
      assert.ok(fit.scaleX > 0 && fit.scaleX < 1 && fit.scaleY > 0 && fit.scaleY < 1);
    }
  }
});

test("rear collar renders no hanging charm and live fitting balances canvas state", t => {
  const original = globalThis.document;
  const paint = new Proxy({}, { get: (_, key) => key === "createLinearGradient" ? () => ({ addColorStop() {} }) : () => {}, set: () => true });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => paint }) };
  t.after(() => { globalThis.document = original; });
  let depth = 0, blits = 0;
  const target = new Proxy({}, { get: (_, key) => {
    if (key === "save") return () => depth++;
    if (key === "restore") return () => depth--;
    if (key === "drawImage") return () => blits++;
    return () => {};
  }, set: () => true });
  drawWornAccessory(target, "moonbell", "NORTH", false, 1, .8);
  assert.equal(blits, 1, "rear view draws only the neckband"); assert.equal(depth, 0);
  drawWornAccessory(target, "moonbell", "EAST", false, 1, .8, "GAMEPLAY", 0, "BACK");
  assert.equal(blits, 2, "near neck's rear band is drawn before the body");
  drawWornAccessory(target, "moonbell", "EAST", false, 1, .8, "GAMEPLAY", 0, "FRONT");
  assert.equal(blits, 4, "front pass draws only the independent band and upright pendant"); assert.equal(depth, 0);
});

test("directional artwork caches perspective and layers, sharing mirrored views across walking phases", t => {
  const original = globalThis.document;
  let allocated = 0;
  const paint = new Proxy({}, { get: (_, key) => key === "createLinearGradient" ? () => ({ addColorStop() {} }) : () => {}, set: () => true });
  globalThis.document = { createElement: () => ({ id: ++allocated, width: 0, height: 0, getContext: () => paint }) };
  t.after(() => { if (original === undefined) delete globalThis.document; else globalThis.document = original; });
  const images = [];
  const target = new Proxy({}, { get: (_, key) => key === "drawImage" ? sprite => images.push(sprite) : () => {}, set: () => true });
  const draw = (direction, phase) => drawWornAccessory(target, "dewdrop", direction, true, phase, .8, "GAMEPLAY", .7, "FRONT");
  draw("EAST", .1); draw("WEST", 2); draw("SE", .5); draw("SW", 3);
  assert.equal(allocated, 4, "side and front-diagonal each cache their own band and charm");
  assert.equal(images[0], images[2]); assert.equal(images[1], images[3]);
  assert.equal(images[4], images[6]); assert.equal(images[5], images[7]);
  assert.notEqual(images[0], images[4], "profile geometry is not the frontal image squashed sideways");
  for (const direction of ["NORTH", "NE", "NW", "SOUTH"]) draw(direction, 1);
  assert.equal(allocated, 8, "rear and rear-diagonal have bands only, front has a band and pendant");
});

test("greeting lifts a paw twice and returns to contact without whole-body jelly scaling", async () => {
  assert.deepEqual([0, .25, .45, .65, .85, 1, NaN].map(catGreetingPhase), [0, Math.PI / 2, 0, Math.PI / 2, 0, 0, 0]);
  const portrait = await readFile(new URL("../app/cat-portrait.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/lobby-studio.css", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(portrait, /drawCatCharacter\(context, \{\s*concealed,/);
  assert.match(portrait, /drawWornAccessory\(target, accessory, "SE", false, phase, animate \? 1 : 0, "GAMEPLAY", 0, layer\)/);
  assert.match(page, /drawWornAccessory\(context, player.hat, gait.direction, colorMuted, gait.stridePhase, gait.strideAmount, "GAMEPLAY", idlePhase, layer\)/);
  assert.match(portrait, /cancelAnimationFrame\(frame\)/);
  assert.match(portrait, /!reduced.matches/);
  assert.doesNotMatch(css, /@keyframes wardenGroupWave/);
});

test("fallen cat has a transparent sprite and SSR-safe non-liquid fallback", async () => {
  const png = await readFile(new URL(`../public${FALLEN_CAT_URL}`, import.meta.url));
  assert.equal(png[25], 6); assert.ok(png.readUInt32BE(16) > 500);
  assert.equal(await loadFallenCat(), false);
  const calls = [], ctx = new Proxy({}, { get: (_, key) => (...args) => calls.push([key, ...args]), set: () => true });
  drawFallenCat(ctx, "#8257cb", true);
  assert.equal(calls.filter(c => c[0] === "save").length, calls.filter(c => c[0] === "restore").length);
  assert.equal(calls.filter(c => c[0] === "arc").length, 1, "a round feline head, not floating eyes or bubbles");
});

test("fallen fur recolors while blue trim and transparency remain unchanged", () => {
  const source = new Uint8ClampedArray([100, 55, 175, 255, 70, 200, 240, 255, 0, 0, 0, 0]);
  const tinted = source.slice(); tintCatFur(tinted, "#ff5d9e");
  assert.notDeepEqual(tinted.slice(0, 3), source.slice(0, 3));
  assert.deepEqual(tinted.slice(4), source.slice(4));
  const a = source.slice(), b = source.slice();
  tintCatFur(a, "#ff5d9e", true); tintCatFur(b, "#20d8ed", true); assert.deepEqual(a, b);
});

test("reportable cats keep visibility, server timing and delayed-spawn gates", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const body = page.slice(page.indexOf("  drawBody("), page.indexOf("  getCrystalBlink("));
  assert.match(body, /sight.kind === "HIDDEN"\) return/);
  assert.match(body, /if \(progress < \.72\) return/);
  assert.match(body, /drawFallenCat\(ctx, body.color, sight.kind === "SHAPE"\)/);
  assert.doesNotMatch(body, /droplets|bubbles|wobble|floating/);
});
