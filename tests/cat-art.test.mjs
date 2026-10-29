import test from "node:test";
import assert from "node:assert/strict";
import { SLIME_CORE_PATH, SLIME_MATERIAL, SLIME_PATH, SLIME_SKIN_CACHE_LIMIT, SLIME_SPROUT, catHatAnchor, drawAnimatedCat, drawSlimeSprout, resolveCatDirection, sampleCatGait, slimeEyes, slimeOutline, slimePalette, slimeSkin } from "../app/cat-art.ts";
import { readFile } from "node:fs/promises";
import { EYE_STYLES, normalizeEyeStyle } from "../server/appearance.ts";
import { drawEyeShape, eyePath } from "../app/cat-eyes.ts";
import { SlimeAnimator } from "../app/cat-motion.ts";
import { DEVOUR_SECONDS, consumptionLayout, devourPose, drawSlimeConsumption } from "../app/cat-devour.ts";
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
  assert.match(portrait, /\.hat-btn-preview \.cat-collar-svg \{ transform: scale\(1\.65\)/);
  assert.doesNotMatch(portrait, /\.slime-avatar \.cat-collar-svg[^}]*top:/, "neck alignment belongs to the shared renderer");
  assert.match(css, /\.moon-studio \.preview-warden canvas\.slime-hat-svg \{ filter: drop-shadow\([^;]+; \}/);
});

test("consumption reaches, envelops, swallows, then returns to a neutral pose", () => {
  assert.equal(DEVOUR_SECONDS, 1.6);
  const start = devourPose(0), engulf = devourPose(.5), swallowed = devourPose(.8), end = devourPose(1);
  assert.equal(start.reach, 0);
  assert.equal(start.victimScale, 1);
  assert.ok(engulf.reach > .9 && engulf.crouch > 0);
  assert.equal(engulf.scaleX, 1, "painted cat never becomes a swollen gel body");
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

  // The cat returns to its contact pose, without inheriting legacy gel scaling.
  for (const progress of [0, 1]) {
    const transforms = [], translations = [];
    const ctx = new Proxy({}, { get: (_, key) => key === "createLinearGradient" || key === "createRadialGradient" ? () => ({ addColorStop() {} }) : (...args) => {
      if (key === "ellipse") assert.ok(args.length >= 7, "native Canvas ellipse requires rotation, start, and end angles");
      if (key === "transform") transforms.push(args);
      if (key === "translate") translations.push(args);
    }, set: () => true });
    drawSlimeConsumption(ctx, event, progress, { concealed: true, returnTo: anchor });
    assert.deepEqual(transforms, []);
    assert.ok(translations.some(([x, y]) => x === anchor.x && Math.abs(y - (anchor.y + 29)) < 1e-10));
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
    if (key === "createLinearGradient" || key === "createRadialGradient") return () => {
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
  for (const stops of materials) for (const [, color] of stops) assert.equal(color, "#788993", "concealment retains the live anonymous cat material");
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

test("painted cats keep a planted solid body while gaze and tail follow actual travel", () => {
  const idle = animate(0, 0).poses;
  const right = animate(200, 0).poses;
  const left = animate(-200, 0).poses;
  const up = animate(0, -200).poses;
  const down = animate(0, 200).poses;
  assert.ok(right.at(-1).gazeX > 1.4 && left.at(-1).gazeX < -1.4);
  assert.ok(up.at(-1).gazeY < -1.1 && down.at(-1).gazeY > 1.1);
  for (const pose of [...idle, ...right, ...left, ...up, ...down]) {
    assert.equal(pose.offsetY, 0, "body cannot hop off its supporting feet");
    assert.equal(pose.scaleX, 1); assert.equal(pose.scaleY, 1);
    assert.equal(pose.shear, 0, "do not turn the painted torso into a gel");
    assert.equal(pose.shadowScale, 1); assert.equal(pose.shadowAlpha, 1);
    assert.ok(Math.abs(pose.sproutTilt) <= .1);
  }
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
      assert.equal(pose.offsetY, previous.offsetY);
      assert.equal(pose.scaleX, previous.scaleX);
      assert.equal(pose.shear, previous.shear);
      assert.ok(Math.abs(pose.gazeX - previous.gazeX) < 15 / fps, "eyes do not flip instantly");
      assert.ok(Math.abs(pose.sproutTilt - previous.sproutTilt) < 1.5 / fps, "tail reversals have soft follow-through");
      previous = pose;
    }
    assert.ok(poses.at(-1).gazeX < -1.4);
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
  assert.equal(stopped.offsetY, 0, "blocked inputs cannot make a grounded cat bounce");
  player.x += 500;
  const teleported = { ...animator.sample(player, 3 + 1 / 60) };
  assert.equal(teleported.shear, 0);
  assert.equal(teleported.gazeX, 0);
  player.x += 40;
  const revealed = { ...animator.sample(player, 8) };
  assert.equal(revealed.shear, 0);
  assert.ok(Object.values(revealed).every(Number.isFinite));
  for (const fps of [30, 60, 144]) for (const pose of animate(200, 0, fps).poses) assert.equal(pose.scaleY, 1);
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
  for (const [point, time] of [[{ ...player, x: NaN }, 6], [{ ...player, y: Infinity }, 6], [player, NaN]]) assert.deepEqual(animator.sample(point, time), neutral);
  assert.deepEqual(animator.sample(player, 0), neutral, "a rewound match clock cannot replay stale follow-through");
});

test("live gait distinguishes a gentle slow walk from a full stride even on uneven frames", () => {
  for (const fps of [10, 30, 60, 144]) {
    const id = `slow-walk-${fps}`;
    sampleCatGait(id, 0, 0, 0, 0, 0, false, { x: 0, y: 0 });
    let gait;
    for (let frame = 1; frame <= fps; frame++) gait = sampleCatGait(id, 200, 0, 0, 0, frame / fps, false, { x: frame / fps * 56, y: 0 });
    assert.ok(Math.abs(gait.stridePhase - Math.PI) < 1e-10, "travel, not a capped render interval, owns foot timing");
    assert.ok(gait.strideAmount > .42 && gait.strideAmount < .44, "a slow interpolated cat must not stomp at full intensity");
  }
});

test("a stopped or blocked cat softly finishes its swing, then remains planted", () => {
  for (const fps of [30, 60, 144]) {
    const id = `settled-paws-${fps}`;
    let x = 0;
    sampleCatGait(id, 0, 0, 0, 0, 0, false, { x, y: 0 });
    let gait;
    for (let frame = 1; frame <= fps; frame++) { x += 200 / fps; gait = sampleCatGait(id, 200, 0, 0, 0, frame / fps, false, { x, y: 0 }); }
    const moving = gait;
    const firstStop = sampleCatGait(id, 200, 0, 0, 0, 1 + 1 / fps, false, { x, y: 0 });
    assert.ok(firstStop.strideAmount > 0 && firstStop.strideAmount < moving.strideAmount);
    assert.ok(firstStop.stridePhase > moving.stridePhase, "a lifted paw continues its arc rather than dropping vertically");
    let previous = firstStop;
    for (let frame = 2; frame <= fps; frame++) {
      gait = sampleCatGait(id, 200, 0, 0, 0, 1 + frame / fps, false, { x, y: 0 });
      assert.ok(gait.strideAmount <= previous.strideAmount);
      previous = gait;
    }
    assert.equal(gait.strideAmount, 0, "blocked desired velocity cannot sustain walking");
    assert.ok(gait.stridePhase - moving.stridePhase < .65, "the settling step is bounded, never an idle walk loop");
    const held = sampleCatGait(id, 200, 0, 0, 0, 2 + 1 / fps, false, { x, y: 0 });
    assert.equal(held.stridePhase, gait.stridePhase);
    assert.equal(held.strideAmount, 0);
  }
});

test("painted headings resist tiny sector-edge jitter without delaying clear turns", () => {
  const id = "heading-edge-hysteresis";
  const velocity = angle => ({ x: Math.cos(angle * Math.PI / 180) * 100, y: Math.sin(angle * Math.PI / 180) * 100 });
  sampleCatGait(id, 100, 0, 0, 0, 0);
  for (const [index, angle] of [22, 23, 21, 25, 23].entries()) {
    const v = velocity(angle);
    assert.equal(sampleCatGait(id, v.x, v.y, 0, 0, (index + 1) * .02).direction, "EAST");
  }
  const diagonal = velocity(35);
  assert.equal(sampleCatGait(id, diagonal.x, diagonal.y, 0, 0, .2).direction, "SE");
  const turn = velocity(10);
  assert.equal(sampleCatGait(id, turn.x, turn.y, 0, 0, .4).direction, "EAST");
  const invalid = sampleCatGait(id, NaN, Infinity, NaN, Infinity, NaN);
  assert.equal(invalid.direction, "EAST");
  assert.equal(invalid.stridePhase, 0); assert.equal(invalid.strideAmount, 0);
});

test("lobby animates one wrapper for hats and eyes, with a reduced-motion override", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/play-menu.css", import.meta.url), "utf8");
  assert.match(page, /className="slime-avatar-motion">\s*<SlimePortrait[^>]*accessory=\{hat\}/);
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
  assert.equal(calls.filter(([name]) => name === "bezierCurveTo").length, 9);
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
  const portrait = await readFile(new URL("../app/cat-portrait.tsx", import.meta.url), "utf8");
  assert.match(page, /<SlimePortrait color=\{color\}/);
  assert.match(portrait, /drawMooncat\(context, \{ color, eyeStyle/);
  assert.match(portrait, /direction: "SE"/);
  const renderer = page.slice(page.indexOf("  drawSlime("), page.indexOf("  drawHat("));
  assert.match(renderer, /concealed: true/);
  assert.match(renderer, /if \(silhouette\) \{[\s\S]*?return;/);
  assert.doesNotMatch(renderer, /slimeSkin\(|slimeEyes\(|drawEyes:/);
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
  const portrait = await readFile(new URL("../app/cat-portrait.tsx", import.meta.url), "utf8");
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
  const sway = Math.max(...moving.map(p => p.sproutTilt)) - Math.min(...moving.map(p => p.sproutTilt));
  assert.ok(sway > .07 && sway < .13, "tail keeps soft independent follow-through without a rubbery whip");
});

test("4-legged cat silhouette and Hollow claw/shadow capture stages render cleanly", t => {
  recordSkins(t);
  assert.match(SLIME_PATH, /M-8 -12C-9 -20 -6 -28 -2 -33/, "left pointed cat ear");
  assert.match(SLIME_PATH, /C20 -26 23 -30 26 -32/, "right pointed cat ear");
  assert.match(SLIME_MATERIAL.bouncePath, /M-6 -19Q-8 -11 -5 -4M-8 -10Q-14 2 1 9Q11 12 21 10/, "defined neck/jaw contour and 4-legged anatomy");
  const event = Object.freeze({ x: 420, y: 300, startX: 360, startY: 270, killerColor: "#6a42b8", victimColor: "#20d8ed" });
  for (const progress of [.2, .4, .75]) {
    let depth = 0, ellipses = 0;
    const ctx = new Proxy({}, {
      get: (_, key) => {
        if (key === "save") return () => depth++;
        if (key === "restore") return () => depth--;
        if (key === "ellipse") return (...args) => { assert.ok(args.length >= 7); ellipses++; };
        if (key === "createLinearGradient" || key === "createRadialGradient") return () => ({ addColorStop() {} });
        return () => {};
      },
      set: () => true,
    });
    drawSlimeConsumption(ctx, event, progress, { concealed: false });
    assert.equal(depth, 0);
    assert.ok(ellipses >= 3, `Hollow capture stage at ${progress} renders cat and shadow geometry`);
  }
});

test("Hollow devour shares painted cats with gameplay instead of legacy gel parts", async () => {
  const source = await readFile(new URL("../app/cat-devour.ts", import.meta.url), "utf8");
  assert.match(source, /import \{ drawMooncat \} from/);
  assert.equal((source.match(/drawMooncat\(ctx,/g) ?? []).length, 2, "both victim and Hollow use the shared cat renderer");
  assert.doesNotMatch(source, /slimeSkin|slimeEyes|slimeOutline|drawSlimeSprout/);
  const portrait = await readFile(new URL("../app/consumption-portrait.tsx", import.meta.url), "utf8");
  assert.match(portrait, /drawCatConsumption\(/);
  assert.match(portrait, /if \(progress < 1\) frame = requestAnimationFrame/);
  assert.match(portrait, /cancelAnimationFrame\(frame\)/);
  assert.match(portrait, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(portrait, /consumption-veil|consumption-core|SlimePortrait/);
});

test("4-legged cat walk cycle steps naturally across all interactive heading directions", () => {
  assert.equal(resolveCatDirection(1, 0, "EAST"), "EAST");
  assert.equal(resolveCatDirection(-1, 0, "EAST"), "WEST");
  assert.equal(resolveCatDirection(0, 1, "EAST"), "SOUTH");
  assert.equal(resolveCatDirection(0, -1, "EAST"), "NORTH");
  assert.equal(resolveCatDirection(1, -1, "EAST"), "NE");
  assert.equal(resolveCatDirection(-1, -1, "EAST"), "NW");
  assert.equal(resolveCatDirection(0, 0, "NORTH"), "NORTH", "idle cat keeps its last interactive heading");

  const start = sampleCatGait("cat-test", 140, 0, 0, 0, 10, false);
  const step = sampleCatGait("cat-test", 140, 0, 0, 0, 10.05, false);
  assert.equal(step.direction, "EAST");
  assert.ok(step.stridePhase > start.stridePhase, "moving advances quadruped stride phase");
  assert.ok(step.strideAmount > 0.3, "moving engages quadruped leg swing");

  // Releasing two diagonal keys (e.g. W+D for NE) with a 1-2 frame finger-lift offset keeps the diagonal heading
  sampleCatGait("cat-diag", 120, -120, 0, 0, 20.0, false);
  const releaseFrame = sampleCatGait("cat-diag", 95, -10, 0, 0, 20.03, false);
  assert.equal(releaseFrame.direction, "NE", "diagonal hold prevents snapping to cardinal on key release");

  for (const dir of ["EAST", "WEST", "SOUTH", "NORTH", "SE", "SW", "NE", "NW"]) {
    let depth = 0, strokes = 0;
    const ctx = new Proxy({}, {
      get: (_, key) => {
        if (key === "save") return () => depth++;
        if (key === "restore") return () => depth--;
        if (key === "stroke") return () => strokes++;
        if (key === "createLinearGradient" || key === "createRadialGradient") return () => ({ addColorStop() {} });
        return (...args) => { for (const v of args) if (typeof v === "number") assert.ok(Number.isFinite(v)); };
      },
      set: () => true,
    });
    drawAnimatedCat(ctx, {
      color: "#6a42b8",
      direction: dir,
      stridePhase: Math.PI * 0.5,
      strideAmount: 1,
      tailTilt: 0.12,
      blink: false,
      eyeStyle: "FIERCE",
      muted: false,
    });
    assert.equal(depth, 0, `balanced canvas stack for direction ${dir}`);
    assert.ok(strokes >= 5, `4-legged anatomy and outlines drawn for ${dir}`);
    const anchor = catHatAnchor(dir);
    assert.ok(Number.isFinite(anchor.x) && Number.isFinite(anchor.y));
  }
});
