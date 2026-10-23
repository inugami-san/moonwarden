import test from "node:test";
import assert from "node:assert/strict";
import { SLIME_CORE_PATH, SLIME_MATERIAL, SLIME_PATH, SLIME_SKIN_CACHE_LIMIT, SLIME_SPROUT, drawSlimeSprout, slimeEyes, slimeOutline, slimePalette, slimeSkin } from "../app/slime-art.ts";
import { readFile } from "node:fs/promises";
import { EYE_STYLES, normalizeEyeStyle } from "../server/appearance.ts";
import { drawEyeShape, eyePath } from "../app/slime-eyes.ts";
import { SlimeAnimator } from "../app/slime-motion.ts";
import { DEVOUR_SECONDS, consumptionLayout, devourPose, drawSlimeConsumption } from "../app/slime-devour.ts";
import { ACCESSORY_FRAME, drawAccessory } from "../app/accessory-art.ts";

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
  assert.match(source, /drawAccessory\(context, hat, anchorX, anchorY\)/);
  assert.match(source, /drawAccessory\(ctx, hat, x, y, muted\)/);
  assert.deepEqual(ACCESSORY_FRAME, { width: 96, height: 72, anchorX: 48, anchorY: 34, pixelRatio: 2 });
});

test("canvas headdress choices are contained without distorting or covering their labels", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const studio = await readFile(new URL("../app/lobby-studio.css", import.meta.url), "utf8");
  const portrait = await readFile(new URL("../app/play-menu.css", import.meta.url), "utf8");
  const icon = css.match(/\.mp-hat-btn \.hat-btn-preview :is\(svg, canvas\) \{([^}]+)\}/)?.[1] ?? "";
  assert.match(icon, /width: 100%/);
  assert.match(icon, /height: 100%/);
  assert.match(icon, /object-fit: contain/);
  assert.match(icon, /pointer-events: none/);
  assert.match(css, /\.mp-hat-btn \{[^}]*min-width: 0;[^}]*overflow: hidden/s);
  assert.match(studio, /\.moon-studio \.mp-hat-btn \.hat-btn-preview \{ width: min\(72px, 100%\); height: 54px/);
  assert.match(portrait, /\.slime-avatar \.slime-hat-svg \{[^}]*width: 100%;[^}]*translate: 0 -98\.611111%/);
  assert.match(css, /\.moon-studio \.preview-warden canvas\.slime-hat-svg \{ filter: drop-shadow\([^;]+; \}/);
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
  assert.ok(lift(idle) > 1.3 && lift(idle) <= 1.4);
  assert.ok(lift(right) > 8.1 && lift(right) <= 9, "walking has a visible jelly lift without turning into a pogo stick");
  assert.ok(right.at(-1).shear < -.095 && left.at(-1).shear > .095);
  assert.ok(right.at(-1).gazeX > 1.4 && left.at(-1).gazeX < -1.4);
  assert.ok(up.at(-1).gazeY < -1.1 && down.at(-1).gazeY > 1.1);
  for (const pose of right) {
    assert.ok(Math.abs(pose.scaleX * pose.scaleY - 1) < 1e-10, "jelly keeps its volume");
    assert.ok(pose.shadowScale >= .8 && pose.shadowScale <= 1);
    assert.ok(pose.shadowAlpha >= .74 && pose.shadowAlpha <= 1);
    assert.ok(Math.abs(pose.sproutTilt) <= .28);
  }
  assert.ok(Math.max(...right.map(pose => pose.scaleX)) > 1.1 && Math.max(...right.map(pose => pose.scaleX)) < 1.14, "landings visibly compress while preserving volume");
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
      assert.ok(Math.abs(pose.scaleX - previous.scaleX) < 2 / fps, "continuous squash/stretch");
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
    assert.ok(lift > 8.1 && lift < 8.5, `bounded, consistent motion at ${fps}fps`);
  }
});

test("reduced motion is neutral and animation never modifies physics or depends on identity/role", () => {
  const animator = new SlimeAnimator();
  const player = Object.freeze({ id: "fixed", x: 100, y: 200 });
  animator.sample(player, 0);
  const neutral = { offsetY: 0, scaleX: 1, scaleY: 1, shear: 0, gazeX: 0, gazeY: 0, hatTilt: 0, shadowScale: 1, shadowAlpha: 1, sproutTilt: 0 };
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
  assert.equal(calls.filter(([name]) => name === "bezierCurveTo").length, 7);
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

function recordSkins(t) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "document");
  const canvases = [];
  Object.defineProperty(globalThis, "document", { configurable: true, value: {
    createElement(tag) {
      assert.equal(tag, "canvas");
      const paths = [], gradients = [], stack = [], state = { globalAlpha: 1 };
      let path = "";
      const ctx = new Proxy(state, {
        get(target, key) {
          if (key in target) return target[key];
          if (key === "save") return () => stack.push({ ...state });
          if (key === "restore") return () => {
            assert.ok(stack.length, "balanced Canvas state");
            for (const field of Object.keys(state)) delete state[field];
            Object.assign(state, stack.pop());
          };
          if (key === "beginPath") return () => { path = ""; };
          const commands = { moveTo: "M", bezierCurveTo: "C", closePath: "Z" };
          if (key in commands) return (...points) => { path += `${commands[key]}${points.join(" ")}`; };
          if (key === "fill" || key === "stroke" || key === "clip") return () => paths.push(path);
          if (key === "createLinearGradient" || key === "createRadialGradient") return (...geometry) => {
            assert.ok(geometry.every(Number.isFinite));
            gradients.push({ kind: key, geometry });
            return { addColorStop(position, color) {
              assert.ok(position >= 0 && position <= 1);
              assert.doesNotMatch(color, /NaN|undefined/);
            } };
          };
          return (...args) => { for (const value of args) if (typeof value === "number") assert.ok(Number.isFinite(value)); };
        },
      });
      const canvas = { paths, gradients, stack, getContext: () => ctx };
      canvases.push(canvas);
      return canvas;
    },
  } });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, "document", original);
    else delete globalThis.document;
  });
  return canvases;
}

test("mochi dome and botanical sprout replay the same geometry as their SVG counterparts", t => {
  recordSkins(t);
  const skin = slimeSkin("#61b9d4");
  assert.ok(skin.paths.includes(SLIME_PATH));
  assert.ok(skin.paths.includes(SLIME_CORE_PATH), "a suspended seed, not the old wide face patch");
  for (const path of Object.values(SLIME_SPROUT)) assert.ok(skin.paths.includes(path), "no Path2D-only or independently redrawn sprout");
  assert.deepEqual([skin.width, skin.height], [192, 224]);
  assert.equal(skin.stack.length, 0);
  const concealed = slimeSkin("#61b9d4", false);
  assert.ok(concealed.paths.includes(SLIME_PATH), "concealment uses the new dome too");
  assert.ok(!concealed.paths.includes(SLIME_CORE_PATH));
  for (const path of Object.values(SLIME_SPROUT)) assert.ok(!concealed.paths.includes(path), "subdued material never adds identifying leaves");
  assert.equal(concealed.stack.length, 0);
});

test("portrait and game material use the same body-space lighting, not bounding-box approximations", async t => {
  recordSkins(t);
  const skin = slimeSkin("#d9ad65");
  const { gel, volume, glow, rim, edge, bounce } = SLIME_MATERIAL;
  for (const light of [gel, rim, edge, bounce]) {
    assert.ok(skin.gradients.some(g => g.kind === "createLinearGradient" && JSON.stringify(g.geometry) === JSON.stringify([light.x1, light.y1, light.x2, light.y2])));
  }
  for (const light of [volume, glow]) {
    assert.ok(skin.gradients.some(g => g.kind === "createRadialGradient" && JSON.stringify(g.geometry) === JSON.stringify([light.x0, light.y0, light.r0, light.x1, light.y1, light.r1])));
  }
  const portrait = await readFile(new URL("../app/slime-portrait.tsx", import.meta.url), "utf8");
  assert.match(portrait, /SLIME_MATERIAL/);
  assert.match(portrait, /gradientUnits="userSpaceOnUse" cx=\{volume.x1\}/);
  assert.match(portrait, /fr=\{glow.r0\}/);
  assert.match(portrait, /stroke=\{palette.leafVein\}/);
  assert.doesNotMatch(portrait, /<filter|feTurbulence/, "fine grain does not need expensive animated filters");
});

test("material colors normalize safely and cache equivalent hex representations once", t => {
  recordSkins(t);
  assert.equal(slimeSkin("#aBc"), slimeSkin("#AABBCC"));
  const fallback = slimePalette("#54dbef");
  for (const invalid of ["not-a-color", "#", "#ffffff00", null, undefined]) {
    assert.deepEqual(slimePalette(invalid), fallback);
    assert.equal(slimeSkin(invalid), slimeSkin("#54dbef"));
  }
});

test("gel texture cache is bounded and retains recently used skins across many palettes", t => {
  recordSkins(t);
  const cold = slimeSkin("#1a2b3c"), hot = slimeSkin("#f4c9d1");
  for (let i = 0; i <= SLIME_SKIN_CACHE_LIMIT; i++) {
    slimeSkin(`#${(0x820000 + i * 79).toString(16)}`);
    assert.equal(slimeSkin("#f4c9d1"), hot, "active material is not repainted");
  }
  assert.notEqual(slimeSkin("#1a2b3c"), cold, "old unused materials are evicted rather than retained forever");
  assert.equal(slimeSkin("#f4c9d1"), hot);
});

test("the sprout has independent follow-through and is cached separately from the body", t => {
  const canvases = recordSkins(t);
  let blits = 0;
  const ctx = { save() {}, restore() {}, translate() {}, rotate(angle) { assert.ok(Number.isFinite(angle)); }, drawImage() { blits++; } };
  for (let frame = 0; frame < 120; frame++) drawSlimeSprout(ctx, "#73bcaa", Math.sin(frame / 12) * .2);
  assert.equal(canvases.length, 1, "not one crown texture per animation frame");
  assert.equal(blits, 120);
  const body = slimeSkin("#73bcaa", true, false);
  assert.ok(!body.paths.includes(SLIME_SPROUT.stem), "animated sprout does not duplicate a baked stem");
  const moving = animate(200, 0).poses;
  assert.ok(Math.max(...moving.map(p => p.sproutTilt)) - Math.min(...moving.map(p => p.sproutTilt)) > .2);
});
