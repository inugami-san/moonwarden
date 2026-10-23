import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { matchVictory, victoryKind, victoryProgress, VICTORY_SECONDS, VICTORY_SOUND_AT } from "../app/match-victory.ts";
import { VictoryScene, victoryLayout } from "../app/victory-art.ts";

const WARDEN = "CREW VICTORY — ALL MOON WARDS RESTORED";
const HOLLOW = "IMPOSTOR VICTORY — CREW AT PARITY";
const local = Object.freeze({ color: "#e7a576", hat: "hood", eyeStyle: "STARRY", role: "CREWMATE", alive: false });

test("only official final codes select an ending, with current and legacy parity variants", () => {
  for (const result of [WARDEN, "CREW VICTORY — ALL HOLLOWS WERE EXPOSED", "CREW VICTORY — THE IMPOSTOR WAS EJECTED"]) assert.equal(victoryKind(result), "WARDEN");
  for (const result of [HOLLOW, "IMPOSTOR VICTORY — THE CREW IS AT PARITY"]) assert.equal(victoryKind(result), "HOLLOW");
  for (const result of ["", "CREW VICTORY — mystery", "Gloop says IMPOSTOR VICTORY", "constructor"]) assert.equal(victoryKind(result), "NEUTRAL");
  const unknown = matchVictory("Room ended unexpectedly", local);
  assert.equal(unknown.kind, "NEUTRAL"); assert.equal(unknown.won, false);
  assert.equal(unknown.detail, "Room ended unexpectedly");
});

test("team wins include eliminated players, preserve only the local winner's cosmetics, and never infer a roster", () => {
  const win = matchVictory(WARDEN, local);
  assert.equal(win.won, true);
  assert.match(win.personal, /won with the Wardens/);
  assert.deepEqual(win.hero, { color: local.color, hat: local.hat, eyeStyle: local.eyeStyle });
  assert.match(win.detail, /Every moonward/);
  const loss = matchVictory(HOLLOW, local);
  assert.equal(loss.won, false);
  assert.notEqual(loss.hero.color, local.color);
  assert.match(loss.personal, /next story/);
  const hollowWin = matchVictory(HOLLOW, { ...local, role: "IMPOSTOR" });
  assert.equal(hollowWin.won, true);
  assert.deepEqual(hollowWin.hero, win.hero);
  assert.match(hollowWin.personal, /won with The Hollow/);
  assert.equal(Object.hasOwn(hollowWin, "players"), false);
  assert.equal(local.alive, false);
});

function recorder() {
  const calls = [], stack = [], state = { globalAlpha: 1 };
  const ctx = new Proxy(state, {
    get(target, name) {
      if (name === "save") return () => stack.push({ ...state });
      if (name === "restore") return () => { assert.ok(stack.length); for (const key of Object.keys(state)) delete state[key]; Object.assign(state, stack.pop()); };
      if (name in target) return target[name];
      return (...args) => {
        for (const arg of args) if (typeof arg === "number") assert.ok(Number.isFinite(arg), `${name} finite geometry`);
        if (name === "ellipse") assert.ok(args.length === 7 && args[2] >= 0 && args[3] >= 0);
        calls.push([name, ...args]);
        if (name === "createLinearGradient" || name === "createRadialGradient") return { addColorStop(offset) { assert.ok(offset >= 0 && offset <= 1); } };
      };
    },
    set(target, name, value) { if (typeof value === "number") assert.ok(Number.isFinite(value)); target[name] = value; return true; },
  });
  return { ctx, calls, stack, state };
}

test("both scenes are finite, responsive, bounded, deterministic and still under reduced motion", t => {
  const old = globalThis.document;
  let canvases = 0;
  globalThis.document = { createElement(tag) { assert.equal(tag, "canvas"); canvases++; return { width: 0, height: 0, getContext: () => recorder().ctx }; } };
  t.after(() => { globalThis.document = old; });
  for (const result of [WARDEN, HOLLOW]) {
    const scene = new VictoryScene(matchVictory(result));
    for (const [width, height] of [[960, 540], [667, 375], [320, 240]]) {
      for (const time of [NaN, -1, 0, .5, 1.5, 3, 6, 500]) {
        const r = recorder(); scene.draw(r.ctx, width, height, time);
        assert.equal(r.stack.length, 0); assert.equal(r.state.globalAlpha, 1);
        assert.ok(r.calls.length < 600, "fixed scene budget, not a growing emitter");
      }
      const before = canvases;
      const a = recorder(), b = recorder();
      scene.draw(a.ctx, width, height, .1, true); scene.draw(b.ctx, width, height, 100, true);
      assert.deepEqual(a.calls, b.calls, "reduced motion has no hop, drift or root movement");
      assert.equal(canvases, before, "static backdrops and character sprites reuse their cache");
      assert.equal(victoryLayout(width, height).cx, width / 2);
    }
  }
});

test("endings finish quickly, reuse gameplay assets, clean up timers and offer keyboard/touch skip", async () => {
  assert.ok(VICTORY_SOUND_AT > 1);
  for (const kind of ["WARDEN", "HOLLOW"]) assert.ok(VICTORY_SECONDS[kind] > 4 && VICTORY_SECONDS[kind] <= 6);
  assert.equal(victoryProgress(NaN, 0, 1), 0);
  assert.equal(victoryProgress(10, 0, 1), 1);
  const component = await readFile(new URL("../app/victory-overlay.tsx", import.meta.url), "utf8");
  assert.match(component, /role="dialog" aria-modal="true" aria-labelledby="victory-title"/);
  assert.match(component, /Skip to results/); assert.match(component, /Return to lobby/);
  assert.match(component, /event.code === "Escape"/); assert.match(component, /dialog.showModal\(\)/);
  assert.match(component, /onCancel=\{event => \{ event.preventDefault\(\)/);
  assert.match(component, /setFinished\(true\)/); assert.match(component, /clearTimeout\(soundTimer\)/);
  assert.match(component, /cancelAnimationFrame\(frame\)/); assert.match(component, /resize.disconnect\(\)/);
  assert.match(component, /if \(!settled && time < VICTORY_SECONDS/);
  assert.doesNotMatch(component, /set[A-Z]\w*\(time\)/, "no React render loop for the animation clock");
  const art = await readFile(new URL("../app/victory-art.ts", import.meta.url), "utf8");
  assert.match(art, /slimeSkin\(look.color/); assert.match(art, /drawAccessory/);
  assert.doesNotMatch(art, /fetch\(|Math.random|setInterval/);
  const css = await readFile(new URL("../app/victory.css", import.meta.url), "utf8");
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /\.victory-overlay.is-reduced-motion[^}]+animation: none/);
  assert.doesNotMatch(css, /infinite|https?:\/\//);
});

test("results replace transient dialogs, music yields to the final flourish, and preview is development-only", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const handler = page.slice(page.indexOf("(nextResult) => {")).split("multiplayerClient,")[0];
  for (const setter of ["setMeeting", "setBanishment", "setPuzzle", "setDeathReveal", "setRoleReveal"]) assert.match(handler, new RegExp(`${setter}\\(null\\)`));
  assert.match(handler, /setVictory\(matchVictory\(nextResult, engineRef.current\?\.human\)\)/);
  assert.match(page, /musicEnabled && musicReady && !result/);
  assert.match(page, /!musicEnabled \|\| !musicBlocked \|\| result/);
  assert.doesNotMatch(page, /SIMULATION COMPLETE/);
  const preview = await readFile(new URL("../app/dev/victory/page.tsx", import.meta.url), "utf8");
  assert.match(preview, /process.env.NODE_ENV !== "development"\) notFound\(\)/);
});
