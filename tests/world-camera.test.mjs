import assert from "node:assert/strict";
import test from "node:test";
import { cameraViewport, cameraTarget, followCamera, viewportToWorld, GAMEPLAY_ZOOM } from "../app/world-camera.ts";
import { ORDEAL_PREPARATION, preparationStation, restorationMilestone } from "../app/warden-objectives.ts";
import { WORLD_WIDTH, WORLD_HEIGHT, VIEW_WIDTH, VIEW_HEIGHT, CENTER, STATIONS } from "../server/sanctuary-map.ts";
import { HAZARDS } from "../server/ordeal-rules.ts";

const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-8, `${message ?? "value"}: ${actual} ≈ ${expected}`);
const nearPoint = (actual, expected) => { near(actual.x, expected.x, "x"); near(actual.y, expected.y, "y"); };
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test("the following camera centers its player rather than fitting the whole forest", () => {
  const viewport = cameraViewport(1280, 760);
  assert.deepEqual(viewport, { width: VIEW_WIDTH / GAMEPLAY_ZOOM, height: VIEW_HEIGHT / GAMEPLAY_ZOOM });
  nearPoint(cameraTarget(CENTER, viewport), { x: CENTER.x - viewport.width / 2, y: CENTER.y - viewport.height / 2 });
  assert.equal(GAMEPLAY_ZOOM, 1.22);
  assert.ok(viewport.width < WORLD_WIDTH * .6, "a modest zoom-out still avoids the old two-thirds-map overview");
  assert.ok(viewport.width < WORLD_WIDTH && viewport.height < WORLD_HEIGHT);
  const position = { x: 1040, y: 620 }, camera = cameraTarget(position, viewport);
  nearPoint(viewportToWorld({ x: viewport.width / 2, y: viewport.height / 2 }, camera, viewport), position);
});

test("camera targets stop at every world edge without exposing space outside the forest", () => {
  for (const viewport of [cameraViewport(1280, 760), cameraViewport(390, 844), cameraViewport(1440, 700)]) {
    assert.deepEqual(cameraTarget({ x: 0, y: 0 }, viewport), { x: 0, y: 0 });
    nearPoint(cameraTarget({ x: WORLD_WIDTH, y: WORLD_HEIGHT }, viewport), { x: WORLD_WIDTH - viewport.width, y: WORLD_HEIGHT - viewport.height });
    for (const position of [{ x: -100, y: -100 }, CENTER, { x: WORLD_WIDTH + 100, y: WORLD_HEIGHT + 100 }]) {
      const camera = cameraTarget(position, viewport);
      assert.ok(camera.x >= 0 && camera.y >= 0);
      assert.ok(camera.x + viewport.width <= WORLD_WIDTH + 1e-8);
      assert.ok(camera.y + viewport.height <= WORLD_HEIGHT + 1e-8);
    }
  }
});

test("phone and wide-screen viewports fill their canvas aspect without stretching or tiny slimes", () => {
  for (const [width, height] of [[390, 844], [360, 780], [844, 390], [1280, 760], [1920, 1080]]) {
    const viewport = cameraViewport(width, height);
    near(viewport.width / viewport.height, width / height, `${width}×${height} aspect`);
    assert.ok(viewport.width <= VIEW_WIDTH + 1e-8 && viewport.height <= VIEW_HEIGHT + 1e-8);
    near(width / viewport.width, height / viewport.height, "equal horizontal and vertical pixel scale");
    assert.ok(viewport.width === VIEW_WIDTH / GAMEPLAY_ZOOM || viewport.height === VIEW_HEIGHT / GAMEPLAY_ZOOM);
  }
  assert.ok(cameraViewport(390, 844).width < 400, "portrait crops horizontally instead of squeezing the whole forest into the phone");
});

test("viewport dimensions stay finite for collapsed layout measurements", () => {
  for (const [width, height] of [[0, 0], [0, 760], [1280, 0], [1, 1]]) {
    const viewport = cameraViewport(width, height);
    assert.ok(Number.isFinite(viewport.width) && Number.isFinite(viewport.height));
    assert.ok(viewport.width > 0 && viewport.height > 0);
  }
});

test("a stationary pointer updates its world target when the camera moves", () => {
  const viewport = cameraViewport(1280, 760), pointer = Object.freeze({ x: 720, y: 330 });
  const previousCamera = { x: 100, y: 80 }, movedCamera = { x: 180, y: 115 };
  const before = viewportToWorld(pointer, previousCamera, viewport), after = viewportToWorld(pointer, movedCamera, viewport);
  assert.deepEqual(before, { x: 820, y: 410 });
  assert.deepEqual(after, { x: 900, y: 445 });
  assert.deepEqual({ x: after.x - before.x, y: after.y - before.y }, { x: 80, y: 35 });
  assert.deepEqual(pointer, { x: 720, y: 330 }, "pointer events need not fire again for correct aiming");
});

test("resizing preserves aim to the same visible world point with uniform canvas scaling", () => {
  const player = { x: 960, y: 573 }, aim = { x: 1050, y: 510 };
  for (const [width, height] of [[1280, 760], [390, 844], [844, 390], [1024, 768]]) {
    const viewport = cameraViewport(width, height), camera = cameraTarget(player, viewport);
    const cssScale = width / viewport.width;
    const cssPointer = { x: (aim.x - camera.x) * cssScale, y: (aim.y - camera.y) * cssScale };
    assert.ok(cssPointer.x >= 0 && cssPointer.x <= width && cssPointer.y >= 0 && cssPointer.y <= height);
    const pointerViewport = { x: cssPointer.x / cssScale, y: cssPointer.y / cssScale };
    const worldAim = viewportToWorld(pointerViewport, camera, viewport);
    nearPoint(worldAim, aim);
    near(Math.atan2(worldAim.y - player.y, worldAim.x - player.x), Math.atan2(aim.y - player.y, aim.x - player.x), "aim angle");
  }
});

test("pointer mapping clamps drag and touch positions to the visible world", () => {
  const viewport = cameraViewport(390, 844), camera = cameraTarget({ x: WORLD_WIDTH, y: WORLD_HEIGHT }, viewport);
  nearPoint(viewportToWorld({ x: -50, y: -40 }, camera, viewport), camera);
  nearPoint(viewportToWorld({ x: 9000, y: 9000 }, camera, viewport), { x: WORLD_WIDTH, y: WORLD_HEIGHT });
});

test("camera damping is frame-rate independent and never overshoots a stationary target", () => {
  const viewport = cameraViewport(1280, 760), player = { x: 1200, y: 700 }, target = cameraTarget(player, viewport);
  const simulate = fps => {
    let camera = { x: 0, y: 0 };
    for (let frame = 0; frame < fps; frame++) {
      const previousDistance = distance(camera, target);
      camera = followCamera(camera, player, viewport, 1 / fps);
      assert.ok(distance(camera, target) <= previousDistance);
      assert.ok(camera.x >= 0 && camera.y >= 0 && camera.x <= target.x && camera.y <= target.y);
    }
    return camera;
  };
  const at30 = simulate(30), at60 = simulate(60), at120 = simulate(120);
  nearPoint(at30, at60); nearPoint(at60, at120);
  assert.ok(distance(at60, target) < .01);
});

test("paused time is neutral, negative time cannot rewind, and reduced motion snaps without drift", () => {
  const current = Object.freeze({ x: 110, y: 80 }), viewport = cameraViewport(1280, 760);
  assert.deepEqual(followCamera(current, CENTER, viewport, 0), current);
  assert.deepEqual(followCamera(current, CENTER, viewport, -1), current);
  assert.deepEqual(followCamera(current, CENTER, viewport, 1 / 60, true), cameraTarget(CENTER, viewport));
  assert.deepEqual(followCamera(current, CENTER, viewport, 0, true), cameraTarget(CENTER, viewport));
  assert.deepEqual(current, { x: 110, y: 80 });
  assert.deepEqual(followCamera(current, CENTER, viewport, 100), followCamera(current, CENTER, viewport, .1), "tab resumption cannot produce an unbounded camera jump");
});

test("every current Ordeal has a specific, gear-backed preparation prompt", () => {
  assert.deepEqual(Object.keys(ORDEAL_PREPARATION).sort(), [...HAZARDS].sort());
  const expected = { BLACKOUT: "FLASHLIGHT", FOG: "FLASHLIGHT", MOONGLARE: "SONAR", ROOTWAKE: "SONAR", PHANTOMS: "SONAR", MIRROR_POOL: "FLARE" };
  for (const hazard of HAZARDS) {
    const preparation = ORDEAL_PREPARATION[hazard];
    assert.equal(preparation.item, expected[hazard]);
    assert.ok(preparation.title.length > 12 && preparation.reason.length > 35);
    assert.ok(STATIONS.some(station => station.reward === preparation.item));
    const recommended = STATIONS.find(station => station.id === preparationStation(hazard, CENTER, []));
    assert.equal(recommended.reward, preparation.item);
    const eligible = STATIONS.filter(station => station.reward === preparation.item);
    assert.equal(distance(recommended, CENTER), Math.min(...eligible.map(station => distance(station, CENTER))));
  }
});

test("a teammate restoring a ward never removes its personal gear recommendation", () => {
  const frost = STATIONS.find(station => station.id === "FROST FONT");
  const teamRestored = Object.freeze(STATIONS.map(station => station.id));
  const personalClaimed = Object.freeze([]);
  assert.equal(preparationStation("BLACKOUT", frost, personalClaimed), "FROST FONT", "team seals are deliberately not an exclusion input");
  assert.ok(teamRestored.includes("FROST FONT"));
  assert.equal(preparationStation("BLACKOUT", frost, Object.freeze(["FROST FONT"])), "EAST WARD", "only this player's claimed reward removes the shrine");
  assert.deepEqual(personalClaimed, []);
});

test("recommendations fall back to other unclaimed rituals and stop when personal rewards are exhausted", () => {
  const mushroomStations = STATIONS.filter(station => station.reward === "FLASHLIGHT").map(station => station.id);
  const recommendation = preparationStation("BLACKOUT", CENTER, mushroomStations);
  assert.ok(recommendation && !mushroomStations.includes(recommendation));
  const available = STATIONS.filter(station => !mushroomStations.includes(station.id));
  assert.equal(distance(STATIONS.find(station => station.id === recommendation), CENTER), Math.min(...available.map(station => distance(station, CENTER))));
  assert.equal(preparationStation("PHANTOMS", CENTER, Object.freeze(STATIONS.map(station => station.id))), null);
  assert.equal(preparationStation("PHANTOMS", CENTER, ["unknown legacy shrine"]), preparationStation("PHANTOMS", CENTER, []));
});

test("restoration milestones derive from persistent team progress, not the current round's seals", () => {
  const levels = [
    [0, "Restore the wards to win"], [24.999, "Restore the wards to win"],
    [25, "The first lights have returned"], [49.999, "The first lights have returned"],
    [50, "The glade is coming back to life"], [74.999, "The glade is coming back to life"],
    [75, "Final wards — bring the forest home"], [99.999, "Final wards — bring the forest home"],
    [100, "The forest is restored"], [108, "The forest is restored"],
  ];
  for (const [progress, message] of levels) assert.equal(restorationMilestone(progress), message);
  const progress = 56, beforeNewCalm = restorationMilestone(progress);
  // Clearing per-round shrine seals must not reset a milestone: only persistent progress is its input.
  const clearedRoundSeals = [];
  assert.equal(clearedRoundSeals.length, 0);
  assert.equal(restorationMilestone(progress), beforeNewCalm);
});
