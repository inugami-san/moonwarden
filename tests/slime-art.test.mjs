import test from "node:test";
import assert from "node:assert/strict";
import { slimeEyes, slimeOutline, slimePalette, slimeSkin } from "../app/slime-art.ts";
import { readFile } from "node:fs/promises";
import { EYE_STYLES, normalizeEyeStyle } from "../server/appearance.ts";
import { drawEyeShape, eyePath } from "../app/slime-eyes.ts";
import { SlimeAnimator } from "../app/slime-motion.ts";
import { DEVOUR_SECONDS, consumptionLayout, devourPose, drawSlimeConsumption } from "../app/slime-devour.ts";
import { drawAccessory } from "../app/accessory-art.ts";

test("wardrobe and gameplay share cached accessory artwork without repainting every animation frame", async t => {
  const original = globalThis.document;
  let canvases = 0, blits = 0;
  const painter = () => new Proxy({}, { get: (_, key) => key === "createLinearGradient" ? () => ({ addColorStop() {} }) : () => {}, set: () => true });
  globalThis.document = { createElement: () => { canvases++; return { getContext: painter }; } };
  t.after(() => { globalThis.document = original; });
  const target = { drawImage() { blits++; } };
  for (const hat of ["antlers", "hood", "moth", "mooncap"]) {
    for (let frame = 0; frame < 60; frame++) drawAccessory(target, hat, 0, 0, false);
    drawAccessory(target, hat, 0, 0, true);
  }
  assert.equal(canvases, 8, "four hats × two visibility materials, not one sprite per frame");
  assert.equal(blits, 244);
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /drawAccessory\(context, hat, 40, 22\)/);
  assert.match(source, /drawAccessory\(ctx, hat, x, y, muted\)/);
});

test("consumption reaches, envelops, swallows, then returns to a neutral pose", () => {
  assert.equal(DEVOUR_SECONDS, 1.6);
  const start = devourPose(0), engulf = devourPose(.5), swallowed = devourPose(.8), end = devourPose(1);
  assert.equal(start.reach, 0);
  assert.equal(start.victimScale, 1);
  assert.ok(engulf.reach > .9 && engulf.scaleX > 1.1 && engulf.scaleX < 1.2, "one controlled swell, not a stretched duplicate body");
  assert.ok(swallowed.victimAlpha < .01 && swallowed.victimScale < .05);
  assert.equal(end.reach, 0);
  assert.equal(end.scaleX, 1);
  assert.equal(end.scaleY, 1);
  assert.equal(end.coreAlpha, 0);
  for (const value of [-1, 0, .2, .5, 1, 2, NaN]) assert.ok(Object.values(devourPose(value)).every(Number.isFinite));
  assert.deepEqual(devourPose(-1), start);
  assert.deepEqual(devourPose(2), end);
});

test("consumption stays rooted, keeps volume, and crosses stage boundaries continuously", () => {
  const event = Object.freeze({ x: 420, y: 300, startX: 360, startY: 270, killerColor: "#20d8ed", victimColor: "#eaa058" });
  const anchor = Object.freeze({ x: 365, y: 275 });
  let previous = devourPose(0);
  for (let frame = 0; frame <= 1000; frame++) {
    const progress = frame / 1000;
    const pose = devourPose(progress);
    const layout = consumptionLayout(event, progress, anchor);
    assert.equal(layout.x, anchor.x, "killer never performs a fake lunge or return");
    assert.equal(layout.y, anchor.y);
    assert.ok(layout.victimX >= anchor.x && layout.victimX <= event.x);
    assert.ok(layout.victimY >= anchor.y && layout.victimY <= event.y);
    assert.ok(Math.abs(pose.scaleX * pose.scaleY - 1) < 1e-10);
    for (const key of Object.keys(pose)) assert.ok(Math.abs(pose[key] - previous[key]) < .02, `${key} stays continuous`);
    previous = pose;
  }
  assert.deepEqual(consumptionLayout(event, 0, anchor), { x: 365, y: 275, victimX: 420, victimY: 300 });
  assert.deepEqual(consumptionLayout(event, 1, anchor), { x: 365, y: 275, victimX: 365, victimY: 275 });

  // The first and last body matrix match a living actor's gait exactly.
  const motion = { offsetY: -3, scaleX: 1.03, scaleY: 1 / 1.03, shear: .04, gazeX: 1, gazeY: -.3, hatTilt: .02, shadowScale: .95, shadowAlpha: .9 };
  for (const progress of [0, 1]) {
    const transforms = [], translations = [];
    const ctx = new Proxy({}, { get: (_, key) => key === "createLinearGradient" ? () => ({ addColorStop() {} }) : (...args) => {
      if (key === "ellipse") assert.ok(args.length >= 7, "native Canvas ellipse requires rotation, start, and end angles");
      if (key === "transform") transforms.push(args);
      if (key === "translate") translations.push(args);
    }, set: () => true });
    drawSlimeConsumption(ctx, event, progress, { concealed: true, returnTo: anchor, motion });
    assert.deepEqual(transforms, [[motion.scaleX, 0, motion.shear, motion.scaleY, 0, 0]]);
    assert.ok(translations.some(([x, y]) => x === anchor.x && y === anchor.y + motion.offsetY + 31));
  }
});

test("concealed consumption hides cosmetics, stays bounded, and never changes player physics", () => {
  const event = Object.freeze({x:420,y:300,startX:360,startY:300,killerColor:"#20d8ed",victimColor:"#eaa058"});
  const player = Object.freeze({x:365,y:305});
  let depth = 0, cosmetics = 0;
  const materials = [];
  const ctx = new Proxy({}, {get: (_, key) => {
    if (key === "save") return () => depth++;
    if (key === "restore") return () => depth--;
    if (key === "drawImage") return () => cosmetics++;
    if (key === "createLinearGradient") return () => {
      const stops = [];
      materials.push(stops);
      return { addColorStop: (offset, color) => stops.push([offset, color]) };
    };
    return (...args) => {
      if (key === "ellipse") assert.ok(args.length >= 7, "native Canvas ellipse requires rotation, start, and end angles");
      for (const arg of args) if (typeof arg === "number") assert.ok(Number.isFinite(arg));
    };
  }, set: () => true});
  for (const progress of [0,.2,.5,.7,1]) {
    drawSlimeConsumption(ctx,event,progress,{concealed:true,returnTo:player,drawHat:()=>cosmetics++});
    assert.equal(depth,0,"balanced Canvas state");
  }
  assert.equal(cosmetics,0);
  assert.ok(materials.length > 0);
  for (const stops of materials) assert.deepEqual(stops, [[0,"rgba(137,150,157,.94)"],[1,"rgba(63,75,84,.96)"]], "concealment retains the same living silhouette material");
  assert.equal(event.startX,360); assert.equal(player.x,365);
  const calm = devourPose(.5,true);
  assert.equal(calm.reach,0); assert.equal(calm.scaleX,1); assert.equal(calm.scaleY,1);
});

test("kill visuals remain local, non-repeating and do not infer other players' roles", async () => {
  const source = await readFile(new URL("../app/page.tsx",import.meta.url),"utf8");
  const start = source.match(/  startDevour\([\s\S]*?\n  frame =/)?.[0] ?? "";
  assert.doesNotMatch(start, /resolvedKiller\.(x|y)\s*[+]?=/);
  assert.doesNotMatch(start, /this\.players\.find\(\(p\) => p\.alive/);
  assert.match(start, /pendingDevourVictimId/);
  assert.doesNotMatch(start, /isKiller =[^;]*dist\(/);
  assert.match(source, /<ConsumptionPortrait killerColor=\{deathReveal.killerColor\}/);
  const css = await readFile(new URL("../app/consumption.css",import.meta.url),"utf8");
  assert.doesNotMatch(css,/infinite/);
  assert.match(css,/prefers-reduced-motion: reduce/);
});

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
  assert.ok(lift(idle) > 1.7 && lift(idle) <= 1.8);
  assert.ok(lift(right) > 6.8 && lift(right) <= 7.6, "walking has rounded, grounded hops");
  assert.ok(right.at(-1).shear < -.095 && left.at(-1).shear > .095);
  assert.ok(right.at(-1).gazeX > 1.4 && left.at(-1).gazeX < -1.4);
  assert.ok(up.at(-1).gazeY < -1.1 && down.at(-1).gazeY > 1.1);
  for (const pose of right) {
    assert.ok(Math.abs(pose.scaleX * pose.scaleY - 1) < 1e-10, "jelly keeps its volume");
    assert.ok(pose.shadowScale >= .83 && pose.shadowScale <= 1);
    assert.ok(pose.shadowAlpha >= .77 && pose.shadowAlpha <= 1);
  }
  assert.ok(Math.max(...right.map(pose => pose.scaleX)) > 1.09, "landings squash without ballooning");
});

test("gait is fluid across contact, reversal, and different render frame rates", () => {
  for (const fps of [30, 60, 144]) {
    const { animator, player, poses } = animate(200, 0, fps);
    for (let frame = 1; frame <= fps; frame++) {
      player.x -= 200 / fps;
      poses.push({ ...animator.sample(player, 2 + frame / fps) });
    }
    let previous = poses[0];
    for (const pose of poses.slice(1)) {
      assert.ok(Math.abs(pose.offsetY - previous.offsetY) < 70 / fps, "no clipped-sine contact snap");
      assert.ok(Math.abs(pose.scaleX - previous.scaleX) < 1.5 / fps, "continuous squash/stretch");
      assert.ok(Math.abs(pose.shear - previous.shear) < 1.05 / fps, "direction changes have follow-through");
      assert.ok(Math.abs(pose.gazeX - previous.gazeX) < 15 / fps, "eyes do not flip instantly");
      previous = pose;
    }
    assert.ok(poses.at(-1).shear > .095 && poses.at(-1).gazeX < -1.4);
  }
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
    assert.ok(lift > 6.8 && lift < 7.1, `bounded, consistent motion at ${fps}fps`);
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
