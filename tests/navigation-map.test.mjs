import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { STATIONS, getRootCell, PLAYER_BOUNDS } from "../server/sanctuary-map.ts";
import { navigationView, navigationStationState, mapTitle } from "../app/navigation-data.ts";

const stations = STATIONS.map(station => ({ ...station, personalCompleted: false, teamRestored: false }));
const view = overrides => navigationView({ position: { x: 960, y: 573 }, phase: "CALM", hazard: "ROOTWAKE", stations, destinationId: null, ...overrides });

test("navigation shows only your position, static shrines and the selected bearing", () => {
  const scene = view({ destinationId: "OWL TOTEM", players: [{ id: "hidden", role: "IMPOSTOR" }], bodies: [{ x: 10, y: 20 }] });
  assert.equal(scene.stations.length, 6);
  assert.equal(scene.destination.id, "OWL TOTEM");
  assert.equal(scene.cell, null);
  assert.equal(scene.rootLocked, false);
  assert.equal("players" in scene, false);
  assert.equal("bodies" in scene, false);
  assert.deepEqual(Object.keys(scene.position).sort(), ["x", "y"]);
});

test("Rootwake exposes only current-cell shrine and clearing names in every chamber", () => {
  const positions = [{ x: 350, y: 300 }, { x: 950, y: 300 }, { x: 1550, y: 300 }, { x: 350, y: 800 }, { x: 950, y: 800 }, { x: 1550, y: 800 }];
  positions.forEach((position, index) => {
    const scene = view({ position, phase: "ORDEAL" });
    assert.equal(scene.cell.index, index);
    for (const marker of [...scene.stations, ...scene.clearings]) assert.equal(getRootCell(marker.x, marker.y).index, index);
    assert.ok(scene.stations.length < 6);
  });
});

test("Rootwake hides an out-of-cell destination without leaking its name or coordinates", () => {
  const scene = view({ position: { x: 350, y: 300 }, phase: "ORDEAL", destinationId: "OWL TOTEM" });
  assert.equal(scene.destination, null);
  assert.equal(scene.destinationHidden, true);
  assert.equal(scene.stations.some(station => station.label === "OWL TOTEM"), false);
  assert.equal(JSON.stringify(scene).includes("OWL TOTEM"), false);
  const restored = view({ position: { x: 350, y: 300 }, phase: "CALM", destinationId: "OWL TOTEM" });
  assert.equal(restored.destination.id, "OWL TOTEM");
  assert.equal(restored.destinationHidden, false);
});

test("the map strips unknown IDs, duplicate markers, injected positions and extra entity fields", () => {
  const scene = view({ stations: [{ ...stations[0], x: -200, y: 9, label: "Secret impostor", role: "IMPOSTOR", bodyId: "private" }, stations[0], { id: "fake", label: "Body", x: 10, y: 20 }] });
  assert.equal(scene.stations.length, 1);
  assert.deepEqual(scene.stations[0], { id: "FROST FONT", label: "FROST FONT", x: 375, y: 156, personalCompleted: false, teamRestored: false });
});

test("personal gear and shared team restoration retain separate map states", () => {
  assert.equal(navigationStationState({ personalCompleted: false, teamRestored: false }, "CALM").kind, "available");
  assert.equal(navigationStationState({ personalCompleted: false, teamRestored: true }, "CALM").kind, "gear");
  assert.equal(navigationStationState({ personalCompleted: true, teamRestored: false }, "CALM").kind, "claimed");
  assert.equal(navigationStationState({ personalCompleted: false, teamRestored: true }, "ORDEAL").kind, "gear");
  assert.equal(navigationStationState({ personalCompleted: false, teamRestored: false }, "ORDEAL").kind, "available");
  assert.equal(navigationStationState({ personalCompleted: true, teamRestored: true }, "ORDEAL").kind, "claimed");
  assert.equal(navigationStationState({ personalCompleted: false, teamRestored: true }, "DISCUSSION").kind, "locked");
  assert.match(navigationStationState({ personalCompleted: false, teamRestored: true }, "ORDEAL").label, /risk/i);
});

test("invalid positions clamp safely and unknown destinations never create markers", () => {
  const scene = view({ position: { x: -100, y: Infinity }, destinationId: "unknown" });
  assert.equal(scene.position.x, PLAYER_BOUNDS.left);
  assert.ok(Number.isFinite(scene.position.y));
  assert.equal(scene.destination, null);
  assert.equal(scene.destinationHidden, false);
  assert.equal(mapTitle("DEEP ROOT GROTTO"), "Deep Root Grotto");
});

test("navigation UI uses a native modal, input-safe shortcuts and no entity-bearing props", async () => {
  const source = await readFile(new URL("../app/navigation-map.tsx", import.meta.url), "utf8");
  const props = source.slice(source.indexOf("export type NavigationMapProps"), source.indexOf("function MapIcon"));
  assert.doesNotMatch(props, /players|bodies|impostor|role:/i);
  assert.match(source, /<dialog/);
  assert.match(source, /dialog\.showModal\(\)/);
  assert.match(source, /contenteditable/);
  assert.match(source, /event\.repeat/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /onExpandedChange/);
});
