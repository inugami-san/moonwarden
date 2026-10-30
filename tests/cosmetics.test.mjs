import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_HAT, HAT_IDS, HAT_META, HAT_METADATA, isHat, normalizeHat } from "../server/cosmetics.ts";
import { GameRoom } from "../server/game-room.ts";
import { MultiplayerClient } from "../app/network.ts";

const NEW_HATS = ["dewdrop", "fernwrap", "mushroom"];

function client() {
  return { readyState: 1, sent: [], send(raw) { this.sent.push(JSON.parse(raw)); }, close() {} };
}

test("the shared accessory catalog preserves legacy IDs and describes the three new cat pieces", () => {
  assert.deepEqual(HAT_IDS.slice(0, 8), ["moonbell", "leafband", "starlock", "mothbow", "antlers", "hood", "moth", "mooncap"]);
  assert.deepEqual(HAT_IDS.slice(8), NEW_HATS);
  assert.equal(new Set(HAT_IDS).size, HAT_IDS.length);
  assert.equal(HAT_META, HAT_METADATA);
  assert.equal(DEFAULT_HAT, "moonbell");
  for (const hat of HAT_IDS) {
    assert.equal(isHat(hat), true);
    assert.equal(normalizeHat(hat), hat);
    assert.ok(HAT_META[hat].label.length > 0);
    assert.ok(HAT_META[hat].title.length > 0);
    assert.ok(["COLLAR", "HEADWEAR"].includes(HAT_META[hat].kind));
  }
  assert.equal(HAT_META.dewdrop.title, "Dewdrop Pendant");
  assert.equal(HAT_META.fernwrap.title, "Fern Scarf");
  assert.equal(HAT_META.mushroom.title, "Mushroom Cap");
  assert.equal(HAT_META.dewdrop.kind, "COLLAR");
  assert.equal(HAT_META.fernwrap.kind, "COLLAR");
  assert.equal(HAT_META.mushroom.kind, "HEADWEAR");
});

test("cosmetic validation rejects non-catalog and prototype-shaped IDs safely", () => {
  for (const value of [undefined, null, 0, {}, [], "", "MOONBELL", "__proto__", "toString", "unknown"]) {
    assert.equal(isHat(value), false);
    assert.equal(normalizeHat(value), DEFAULT_HAT);
    assert.equal(normalizeHat(value, "fernwrap"), "fernwrap");
  }
});

test("new accessories survive room joining, roster broadcasts, profile updates and match start", t => {
  const room = new GameRoom("CATGEAR");
  t.after(() => room.destroy());
  const looks = [...NEW_HATS, "moonbell"];
  const clients = looks.map(client);
  const colors = ["#20d8ed", "#95ef45", "#ff5d9e", "#ffd94a"];
  looks.forEach((hat, index) => room.addClient(`cat-${index}`, clients[index], `Cat ${index}`, colors[index], hat));
  looks.forEach((hat, index) => assert.equal(room.players.get(`cat-${index}`).hat, hat));

  const roster = clients[3].sent.find(message => message.type === "ROOM_STATE");
  assert.deepEqual(roster.players.map(player => player.hat), looks);
  const joins = clients[0].sent.filter(message => message.type === "PLAYER_JOINED");
  assert.deepEqual(joins.map(message => message.player.hat), looks.slice(1));

  for (const hat of NEW_HATS) {
    room.handleMessage("cat-0", { type: "UPDATE_PROFILE", playerName: "Cat 0", color: colors[0], hat });
    assert.equal(room.players.get("cat-0").hat, hat);
  }
  room.handleMessage("cat-0", { type: "START_MATCH", botFill: false, targetPlayers: 4 });
  const match = clients[0].sent.find(message => message.type === "MATCH_STARTED");
  assert.ok(match);
  assert.equal(match.players.find(player => player.id === "cat-0").hat, "mushroom");
  assert.equal(match.players.find(player => player.id === "cat-1").hat, "fernwrap");
});

test("invalid raw room cosmetics retain legacy join/profile fallback behavior", t => {
  const room = new GameRoom("FALLBACK");
  t.after(() => room.destroy());
  const player = room.addClient("cat", client(), "Cat", "#20d8ed", "not-a-hat");
  assert.equal(isHat(player.hat), true, "an invalid join still receives a valid random accessory");
  player.hat = "dewdrop";
  room.handleMessage("cat", { type: "UPDATE_PROFILE", playerName: "Cat", color: "#20d8ed", hat: "__proto__" });
  assert.equal(player.hat, "dewdrop", "an invalid profile edit cannot replace an equipped accessory");
});

test("client lobby commands transmit every catalog ID and normalize invalid runtime inputs", () => {
  const network = new MultiplayerClient();
  const messages = [];
  network.send = message => messages.push(message);
  for (const hat of HAT_IDS) {
    network.createRoom("Cat", "#20d8ed", hat);
    network.joinRoom(" forest ", "Cat", "#20d8ed", hat);
    network.updateProfile("Cat", "#20d8ed", hat);
    assert.deepEqual(messages.slice(-3).map(message => message.hat), [hat, hat, hat]);
    assert.equal(messages.at(-2).roomCode, "FOREST");
  }
  network.createRoom("Cat", "#20d8ed", "invalid");
  network.joinRoom("FOREST", "Cat", "#20d8ed", null);
  network.updateProfile("Cat", "#20d8ed", undefined);
  assert.deepEqual(messages.slice(-3).map(message => message.hat), [DEFAULT_HAT, DEFAULT_HAT, DEFAULT_HAT]);
});
