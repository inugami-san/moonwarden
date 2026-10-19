import test from "node:test";
import assert from "node:assert/strict";
import { slimeEyes, slimeOutline, slimePalette, slimeSkin } from "../app/slime-art.ts";
import { readFile } from "node:fs/promises";
import { EYE_STYLES, normalizeEyeStyle } from "../server/appearance.ts";
import { drawEyeShape, eyePath } from "../app/slime-eyes.ts";
import { SlimeAnimator } from "../app/slime-motion.ts";

function animate(vx, vy, fps = 60, seconds = 2) {
  const animator = new SlimeAnimator();
  const player = { id: "slime", x: 400, y: 300 };
  animator.sample(player, 0);
  const poses = [];
  for (let frame = 1; frame <= fps * seconds; frame++) {
    player.x += vx / fps; player.y += vy / fps;
    poses.push({ ...animator.sample(player, frame / fps) });
  }
  return { animator, player, poses };
}

test("slimes idle gently, hop further while moving, and lean/gaze in their actual travel direction", () => {
  const idle = animate(0, 0).poses;
  const right = animate(200, 0).poses;
  const left = animate(-200, 0).poses;
  const up = animate(0, -200).poses;
  const down = animate(0, 200).poses;
  const lift = poses => Math.max(...poses.map(pose => -pose.offsetY));
  assert.ok(lift(idle) > 2 && lift(idle) <= 2.3);
  assert.ok(lift(right) > 8, "walking has clearly visible hops");
  assert.ok(right.at(-1).shear < -.13 && left.at(-1).shear > .13);
  assert.ok(right.at(-1).gazeX > 1.4 && left.at(-1).gazeX < -1.4);
  assert.ok(up.at(-1).gazeY < -1.1 && down.at(-1).gazeY > 1.1);
  for (const pose of right) {
    assert.ok(Math.abs(pose.scaleX * pose.scaleY - 1) < 1e-10, "jelly keeps its volume");
    assert.ok(pose.shadowScale >= .83 && pose.shadowScale <= 1);
    assert.ok(pose.shadowAlpha >= .77 && pose.shadowAlpha <= 1);
  }
  assert.ok(Math.max(...right.map(pose => pose.scaleX)) > 1.12, "landings squash");
});

test("motion eases to idle when blocked/stopped and resets safely after teleports or hidden gaps", () => {
  const { animator, player, poses } = animate(200, 0);
  const before = { ...poses.at(-1) };
  const afterFirstStop = { ...animator.sample(player, 2 + 1 / 60) };
  assert.ok(afterFirstStop.gazeX > 0 && afterFirstStop.gazeX < before.gazeX, "stopping eases instead of snapping");
  for (let frame = 2; frame <= 60; frame++) animator.sample(player, 2 + frame / 60);
  const stopped = { ...animator.sample(player, 3) };
  assert.ok(Math.abs(stopped.shear) < .001);
  assert.ok(stopped.offsetY >= -2.31, "idle bounce only; blocked inputs do not imply movement");
  player.x += 500;
  const teleported = { ...animator.sample(player, 3 + 1 / 60) };
  assert.equal(teleported.shear, 0);
  assert.equal(teleported.gazeX, 0);
  player.x += 40;
  const revealed = { ...animator.sample(player, 8) };
  assert.equal(revealed.shear, 0);
  assert.ok(Object.values(revealed).every(Number.isFinite));
  for (const fps of [30, 60, 144]) {
    const lift = Math.max(...animate(200, 0, fps).poses.map(pose => -pose.offsetY));
    assert.ok(lift > 8.3 && lift <= 8.5, `bounded motion at ${fps}fps`);
  }
});

test("reduced motion is neutral and animation never modifies physics or depends on identity/role", () => {
  const animator = new SlimeAnimator();
  const player = Object.freeze({ id: "fixed", x: 100, y: 200 });
  animator.sample(player, 0);
  const neutral = { offsetY: 0, scaleX: 1, scaleY: 1, shear: 0, gazeX: 0, gazeY: 0, hatTilt: 0, shadowScale: 1, shadowAlpha: 1 };
  assert.deepEqual(animator.sample(player, .02, true), neutral);
  assert.deepEqual(player, { id: "fixed", x: 100, y: 200 });
  const a = new SlimeAnimator(), b = new SlimeAnimator();
  a.sample({ id: "crew", x: 100, y: 200 }, 0);
  b.sample({ id: "impostor", x: 100, y: 200 }, 0);
  assert.deepEqual(a.sample({ id: "crew", x: 103, y: 200 }, .02), b.sample({ id: "impostor", x: 103, y: 200 }, .02));
  animator.clear();
  assert.deepEqual(animator.sample(player, 5), neutral);
});

test("lobby animates one wrapper for hats and eyes, with a reduced-motion override", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/play-menu.css", import.meta.url), "utf8");
  assert.match(page, /className="slime-avatar-motion">\s*<HatGraphic[\s\S]*?<SlimePortrait/);
  assert.match(css, /@keyframes slime-idle-hop/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.slime-avatar-motion[\s\S]*?animation: none !important/);
  assert.match(page, /motionPreference\?\.removeEventListener\("change"/);
});

test("moonlit slime material is brighter without changing concealed skins or cache isolation", () => {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const canvases = [];
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement(tag) {
        assert.equal(tag, "canvas");
        const gradients = [];
        const gradient = () => {
          const stops = new Map();
          gradients.push(stops);
          return { addColorStop: (position, color) => stops.set(position, color) };
        };
        const ctx = new Proxy({ createLinearGradient: gradient, createRadialGradient: gradient }, {
          get: (target, key) => target[key] ?? (() => {}),
        });
        const canvas = { gradients, getContext: () => ctx };
        canvases.push(canvas);
        return canvas;
      },
    },
  });
  try {
    const moonlit = slimeSkin("#54dbef");
    const concealed = slimeSkin("#54dbef", false);
    assert.notEqual(moonlit, concealed);
    assert.equal(slimeSkin("#54dbef", true), moonlit);
    assert.equal(slimeSkin("#54dbef", false), concealed);
    assert.equal(canvases.length, 2, "both materials are baked just once");

    // These are the pre-existing Fog/Blackout material values.
    assert.equal(concealed.gradients[0].get(0), "rgba(164,186,195,.76)");
    assert.equal(concealed.gradients[0].get(1), "rgba(12,29,39,.96)");
    assert.equal(concealed.gradients[1].get(1), "rgba(3,17,28,.57)");

    const channels = (color) => color.match(/[\d.]+/g).map(Number);
    const normalMidtone = channels(moonlit.gradients[0].get(0.46));
    const hiddenMidtone = channels(concealed.gradients[0].get(0.46));
    for (let channel = 0; channel < 3; channel++) {
      assert.ok(normalMidtone[channel] > hiddenMidtone[channel]);
    }
    assert.ok((normalMidtone[3] ?? 1) > hiddenMidtone[3]);
  } finally {
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else delete globalThis.document;
  }
});

test("five eye styles use identical Canvas and SVG geometry and safe legacy defaults", () => {
  assert.equal(EYE_STYLES.length, 5);
  assert.equal(new Set(EYE_STYLES.map(style => eyePath(style))).size, 5);
  const commands = { moveTo: "M", lineTo: "L", quadraticCurveTo: "Q", closePath: "Z" };
  for (const style of EYE_STYLES) {
    const parts = [];
    const ctx = new Proxy({}, { get: (_, name) => (...points) => parts.push(`${commands[name]}${points.join(" ")}`) });
    drawEyeShape(ctx, style);
    assert.equal(parts.join(""), eyePath(style));
  }
  for (const invalid of [undefined, null, "unknown", {}, 123, "toString"]) {
    assert.equal(normalizeEyeStyle(invalid), "FIERCE");
    assert.equal(eyePath(invalid), eyePath("FIERCE"));
  }
});

test("reference slime palettes preserve all eight player colors", () => {
  const colors = ["#20d8ed", "#95ef45", "#ff5d9e", "#ffd94a", "#a879ff", "#ff9843", "#5ea7ff", "#48e0a4"];
  for (const part of ["body", "rim", "edge", "core"]) {
    assert.equal(new Set(colors.map((color) => slimePalette(color)[part])).size, 8);
  }
});

test("anonymous outline excludes sprout and eyes; muted eyes do not glow", () => {
  const calls = [];
  const ctx = new Proxy({}, {
    get: (target, key) => target[key] ?? ((...args) => calls.push([key, ...args])),
  });
  slimeOutline(ctx);
  assert.equal(calls.filter(([name]) => name === "bezierCurveTo").length, 4);
  assert.equal(calls.some(([name]) => name === "ellipse" || name === "fill"), false);
  slimeEyes(ctx, false);
  assert.equal(ctx.fillStyle, "#f5ffef");
  slimeEyes(ctx, false, true);
  assert.equal(ctx.fillStyle, "rgba(173,187,190,.3)");
  slimeEyes(ctx, true);
  assert.equal(calls.filter(([name]) => name === "roundRect").length, 2);
});

test("lobby and arena share the reference body and skip decorations for silhouettes", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const portrait = await readFile(new URL("../app/slime-portrait.tsx", import.meta.url), "utf8");
  assert.match(page, /<SlimePortrait color=\{color\}/);
  assert.match(portrait, /d=\{SLIME_PATH\}/);
  assert.match(portrait, /useId\(\)/, "SVG gradients are scoped to each avatar");
  const renderer = page.slice(page.indexOf("  drawSlime("), page.indexOf("  drawHat("));
  assert.ok(renderer.indexOf("return;") < renderer.indexOf("slimeSkin("));
  assert.ok(renderer.indexOf("return;") < renderer.indexOf("slimeEyes("));
});
