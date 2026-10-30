import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { GET } from "../app/api/version/route.ts";
import { handleSocketConnection } from "../server/ws-handler.ts";
import { GAME_RELEASE_INFO, GAME_RELEASE_LABEL, GAME_RELEASE_VERSION, GAME_WORLD_VERSION, isCompatibleServerInfo } from "../server/game-version.ts";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("release version has one source of truth and matches both lockfile versions", async () => {
  const pkg = JSON.parse(await read("../package.json"));
  const lock = JSON.parse(await read("../package-lock.json"));
  assert.match(GAME_RELEASE_VERSION, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?(?:\+[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?$/);
  assert.equal(pkg.version, GAME_RELEASE_VERSION);
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[""].version, pkg.version);
  assert.equal(GAME_RELEASE_LABEL, `v${pkg.version} · BETA`);
  assert.notEqual(GAME_RELEASE_VERSION, GAME_WORLD_VERSION);
});

test("each release has a changelog entry and a documented release workflow", async () => {
  const changelog = await read("../CHANGELOG.md");
  assert.ok(changelog.split("\n").some(line => line.startsWith(`## [${GAME_RELEASE_VERSION}] - `)), "Add notes for the package version before releasing");
  const readme = await read("../README.md");
  assert.match(readme, /npm version patch --no-git-tag-version/);
  assert.match(readme, /npm run release:check/);
});

test("site version endpoint exposes only public release metadata and is uncached", async () => {
  const response = GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), GAME_RELEASE_INFO);
  assert.deepEqual(Object.keys(GAME_RELEASE_INFO).sort(), ["channel", "name", "version", "worldVersion"]);
});

test("the room handshake reports its own release without changing protocol compatibility", () => {
  const messages = [];
  const socket = { readyState: 1, send: data => messages.push(JSON.parse(data)), close() { this.readyState = 3; } };
  const handler = handleSocketConnection(socket, "release-version-check");
  handler.onMessage(JSON.stringify({ type: "CLIENT_HELLO", worldVersion: GAME_WORLD_VERSION }));
  const info = messages.find(message => message.type === "SERVER_INFO");
  assert.equal(info.version, GAME_RELEASE_VERSION);
  assert.equal(info.worldVersion, GAME_WORLD_VERSION);
  assert.equal(isCompatibleServerInfo(info), true);
  handler.onClose();
});

test("different release numbers are compatible only when the gameplay protocol matches", () => {
  const info = { type: "SERVER_INFO", worldVersion: GAME_WORLD_VERSION, compatible: true };
  assert.equal(isCompatibleServerInfo({ ...info, version: "99.0.0" }), true);
  assert.equal(isCompatibleServerInfo({ ...info, version: GAME_RELEASE_VERSION, worldVersion: "retired-map" }), false);
});

test("cached v8 clients cannot enter a room with accessory IDs their wardrobe cannot render", () => {
  const messages = [];
  const socket = { readyState: 1, send: data => messages.push(JSON.parse(data)), close() { this.readyState = 3; } };
  const handler = handleSocketConnection(socket, "legacy-wardrobe-check");
  handler.onMessage(JSON.stringify({ type: "CLIENT_HELLO", worldVersion: "silverpine-trust-v8" }));
  handler.onMessage(JSON.stringify({ type: "CREATE_ROOM", playerName: "Old wardrobe", color: "#20d8ed", hat: "moonbell" }));
  assert.equal(socket.readyState, 3);
  assert.equal(messages.find(message => message.type === "SERVER_INFO")?.compatible, false);
  assert.ok(messages.some(message => message.type === "ERROR_ALERT"));
  assert.equal(messages.some(message => message.type === "ROOM_STATE"), false);
  handler.onClose();
});
