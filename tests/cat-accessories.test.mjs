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
  for (const value of ["moonbell", "leafband", "starlock", "mothbow"]) assert.equal(isCollar(value), true);
  assert.equal(isCollar("hood"), false);
  assert.deepEqual(collarAnchor("SE"), { x: 23, y: 0 });
  assert.deepEqual(collarAnchor("SW"), { x: -23, y: 0 });
  assert.equal(collarAnchor("NORTH").y, -15);
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
  for (const hat of ["antlers", "hood", "moth", "mooncap", "moonbell", "leafband", "starlock", "mothbow"]) {
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
  drawWornAccessory(target, "moonbell", "EAST", false, 1, .8);
  assert.equal(blits, 3, "front/side view draws independent band and upright pendant"); assert.equal(depth, 0);
});

test("greeting lifts a paw twice and returns to contact without whole-body jelly scaling", async () => {
  assert.deepEqual([0, .25, .45, .65, .85, 1, NaN].map(catGreetingPhase), [0, Math.PI / 2, 0, Math.PI / 2, 0, 0, 0]);
  const portrait = await readFile(new URL("../app/cat-portrait.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/lobby-studio.css", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(portrait, /if \(accessory && !concealed\) drawWornAccessory/);
  assert.match(page, /drawWornAccessory\(ctx, player.hat, gait.direction, colorMuted, gait.stridePhase, gait.strideAmount, "GAMEPLAY", idlePhase\)/);
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
