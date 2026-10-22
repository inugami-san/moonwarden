import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../app/api/mp/route.ts";
import { GameServerRegistry } from "../server/game-room.ts";
import { gameRegistry } from "../server/game-room.ts";
import { handleSocketConnection } from "../server/ws-handler.ts";
import { PLAYER_COLORS } from "../server/palette.ts";
import { CALM_SECONDS, CENTER, PLAYER_BOUNDS, STATIONS, SANCTUARY_OBSTACLES, keepInRootCell } from "../server/sanctuary-map.ts";
import { planRoute } from "../server/sanctuary-paths.ts";
import { GAME_WORLD_VERSION } from "../server/game-version.ts";
import { ritualProgress } from "../server/match-rules.ts";
const wardGain = room => ritualProgress([...room.players.values()].filter(player => player.alive && player.role === "CREWMATE").length, room.phase === "ORDEAL");

const hello = { type: "CLIENT_HELLO", worldVersion: GAME_WORLD_VERSION };
const initialHandshake = payload => !payload.sessionId && !payload.disconnect
  ? { ...payload, messages: [hello, ...(payload.messages ?? [])] } : payload;

function atStation(room, player, stationId) {
  const station = room.stations.find(station => station.id === stationId);
  player.x = station.x;
  player.y = station.y + (station.side === "top" ? 60 : station.side === "bottom" ? -60 : 0);
}

// Mock WebSocket client for testing protocol
function createMockClient() {
  const sent = [];
  return {
    sent,
    readyState: 1,
    send(data) {
      sent.push(JSON.parse(data));
    },
    close() {},
    popMessage(type) {
      const idx = sent.findIndex((m) => m.type === type);
      if (idx >= 0) return sent.splice(idx, 1)[0];
      return undefined;
    },
    lastMessage() {
      return sent[sent.length - 1];
    },
  };
}

for (const role of ["IMPOSTOR", "CREWMATE"]) {
  test(`multiplayer ejection names the ${role === "IMPOSTOR" ? "Hollow" : "Warden"} without altering role IDs or player names`, () => {
    const registry = new GameServerRegistry();
    const room = registry.createRoom();
    const host = createMockClient();
    const guest = createMockClient();
    room.addClient("label-host", host, "Host", PLAYER_COLORS[0], "hood");
    const target = room.addClient("label-target", guest, "Impostor", PLAYER_COLORS[1], "moth");
    try {
      room.handleMessage("label-host", { type: "START_MATCH", botFill: true, targetPlayers: 4 });
      assert.ok(["CREWMATE", "IMPOSTOR"].includes(host.popMessage("MATCH_STARTED").role));
      target.role = role;
      room.phase = "DISCUSSION";
      for (const player of room.players.values()) room.votes.set(player.id, target.id);
      room.concludeMeeting();
      const result = host.popMessage("MEETING_CONCLUDED");
      assert.equal(result.verdict, `Impostor was ejected — ${role === "IMPOSTOR" ? "THE HOLLOW" : "WARDEN"}`);
      assert.equal(target.role, role);
      assert.equal(result.tally.find(entry => entry.targetId === target.id).targetName, "Impostor");
      assert.equal(target.alive, false);
    } finally {
      registry.removeRoom(room.code);
    }
  });
}

test("eye cosmetics survive create, join, profile updates, discovery, matches, and vote tallies", () => {
  const registry = new GameServerRegistry();
  const room = registry.createRoom();
  const host = createMockClient();
  const guest = createMockClient();
  room.addClient("eyes-host", host, "Host", PLAYER_COLORS[0], "hood", "STARRY");
  room.addClient("eyes-guest", guest, "Guest", PLAYER_COLORS[1], "moth");
  assert.equal(room.players.get("eyes-guest").eyeStyle, "FIERCE", "older clients have a default");
  assert.equal(registry.listOpenRooms().find(entry => entry.code === room.code).hostEyeStyle, "STARRY");
  room.handleMessage("eyes-guest", { type: "UPDATE_PROFILE", playerName: "Guest", color: PLAYER_COLORS[1], hat: "hood", eyeStyle: "ROUND" });
  assert.equal(guest.popMessage("ROOM_STATE").players.find(p => p.id === "eyes-host").eyeStyle, "STARRY");
  assert.equal(host.sent.filter(msg => msg.type === "LOBBY_UPDATED").at(-1).players.find(p => p.id === "eyes-guest").eyeStyle, "ROUND");
  for (const invalid of [undefined, "unknown", {}, null]) {
    room.handleMessage("eyes-guest", { type: "UPDATE_PROFILE", playerName: "Guest", color: PLAYER_COLORS[1], hat: "hood", eyeStyle: invalid });
    assert.equal(room.players.get("eyes-guest").eyeStyle, "ROUND", "bad/missing cosmetics never overwrite a selection");
  }
  room.handleMessage("eyes-host", { type: "START_MATCH", botFill: true, targetPlayers: 6 });
  const match = host.popMessage("MATCH_STARTED");
  assert.equal(match.players.find(p => p.id === "eyes-host").eyeStyle, "STARRY");
  assert.equal(match.players.find(p => p.id === "eyes-guest").eyeStyle, "ROUND");
  assert.ok(match.players.every(p => ["FIERCE", "ROUND", "DREAMY", "JOYFUL", "STARRY"].includes(p.eyeStyle)));
  room.handleMessage("eyes-host", { type: "UPDATE_PROFILE", playerName: "Host", color: PLAYER_COLORS[0], hat: "hood", eyeStyle: "DREAMY" });
  assert.equal(room.players.get("eyes-host").eyeStyle, "STARRY", "cosmetics lock during the match");
  room.phase = "DISCUSSION";
  for (const player of room.players.values()) room.votes.set(player.id, "eyes-guest");
  room.concludeMeeting();
  const result = host.popMessage("MEETING_CONCLUDED");
  assert.equal(result.tally.find(entry => entry.targetId === "eyes-guest").targetEyeStyle, "ROUND");
  registry.removeRoom(room.code);
});

test("Multiplayer GameRoom: Lifecycle, Input Sync, Tasks, Meetings, and Voting", async () => {
  const registry = new GameServerRegistry();

  // 1. Create Room
  const room = registry.createRoom();
  assert.equal(typeof room.code, "string");
  assert.equal(room.code.length, 4);

  const clientA = createMockClient();
  const playerA = room.addClient("player-a", clientA, "HostWarden", "#20d8ed", "antlers");

  assert.equal(playerA.isHost, true);
  assert.equal(room.clients.size, 1);
  assert.equal(clientA.lastMessage().type, "ROOM_STATE");
  assert.equal(clientA.lastMessage().isHost, true);

  // 2. Join Room
  const clientB = createMockClient();
  const playerB = room.addClient("player-b", clientB, "GuestWarden", "#95ef45", "hood");

  assert.equal(playerB.isHost, false);
  assert.equal(room.clients.size, 2);
  assert.equal(clientB.lastMessage().type, "ROOM_STATE");
  assert.equal(clientB.lastMessage().isHost, false);
  // Host should receive notification of guest joining
  assert.equal(clientA.popMessage("PLAYER_JOINED").player.name, "GuestWarden");

  // 3. Start Match (with 4 AI bot fill = 6 total)
  room.handleMessage("player-a", { type: "START_MATCH", botFill: true, targetPlayers: 6 });
  assert.equal(room.state, "PLAYING");
  assert.equal(room.players.size, 6);

  const matchMsgA = clientA.popMessage("MATCH_STARTED");
  const matchMsgB = clientB.popMessage("MATCH_STARTED");
  assert.ok(matchMsgA);
  assert.ok(matchMsgB);
  assert.ok(["CREWMATE", "IMPOSTOR"].includes(matchMsgA.role));
  assert.ok(["CREWMATE", "IMPOSTOR"].includes(matchMsgB.role));

  // 4. Movement Input Sync
  room.handleMessage("player-a", {
    type: "PLAYER_INPUT",
    x: 650,
    y: 390,
    vx: 100,
    vy: 0,
    angle: 0.5,
    flashlight: true,
  });
  const updatedA = room.players.get("player-a");
  assert.equal(updatedA.x, 650);
  assert.equal(updatedA.y, 390);
  assert.equal(updatedA.flashlight, true);

  // 5. Task Progress & Shared Station Completion Sync
  // Keep a real Hollow when assigning the fixture's human Wardens. Randomly
  // assigning the host as Hollow, then changing only that role, ended the match
  // during ward settlement and made the guest's otherwise valid rite fail.
  const fixtureHollow = [...room.players.values()].find(player => player.isAi);
  for (const player of room.players.values()) player.role = player.id === fixtureHollow.id ? "IMPOSTOR" : "CREWMATE";
  atStation(room, playerA, "FROST FONT");
  clientB.sent.length = 0;
  const initialTask = room.taskProgress;
  room.handleMessage("player-a", { type: "TASK_UPDATE", stationId: "FROST FONT", reward: "FLASHLIGHT" });
  assert.equal(room.taskProgress, initialTask, "the gauge is not an instant identity detector");
  room.settleWards(); room.broadcastWorld();
  assert.equal(room.taskProgress, initialTask + wardGain(room));
  assert.equal(room.itemCharges.get("player-a").FLASHLIGHT, 1);
  assert.equal(room.sealedStations.has("FROST FONT"), true);
  const worldSyncForB = clientB.popMessage("SYNC_WORLD");
  assert.ok(worldSyncForB);
  assert.deepEqual(worldSyncForB.completedStations, ["FROST FONT"]);
  // Personal gear rites remain available to teammates, but cannot double team progress.
  room.handleMessage("player-a", { type: "TASK_UPDATE", stationId: "FROST FONT", reward: "FLASHLIGHT" });
  assert.equal(room.itemCharges.get("player-a").FLASHLIGHT, 1);
  atStation(room, playerB, "FROST FONT");
  room.handleMessage("player-b", { type: "TASK_UPDATE", stationId: "FROST FONT", reward: "FLASHLIGHT" });
  assert.equal(room.itemCharges.get("player-b").FLASHLIGHT, 1);
  assert.equal(room.taskProgress, initialTask + wardGain(room));

  // 6. Emergency Meeting Trigger
  playerA.x = CENTER.x;
  playerA.y = CENTER.y;
  room.handleMessage("player-a", { type: "TRIGGER_REPORT" });
  assert.equal(room.phase, "DISCUSSION");

  const meetingMsgA = clientA.popMessage("MEETING_CALLED");
  const meetingMsgB = clientB.popMessage("MEETING_CALLED");
  assert.ok(meetingMsgA);
  assert.ok(meetingMsgB);
  assert.equal(meetingMsgA.reporter, "HostWarden");

  // 7. Chat Message in Meeting
  room.handleMessage("player-b", { type: "SEND_CHAT", text: "I was at the Star Altar doing tasks!" });
  const chatMsgA = clientA.popMessage("CHAT_MESSAGE");
  const chatMsgB = clientB.popMessage("CHAT_MESSAGE");
  assert.equal(chatMsgA.message.playerName, "GuestWarden");
  assert.equal(chatMsgA.message.text, "I was at the Star Altar doing tasks!");
  assert.equal(chatMsgB.message.text, "I was at the Star Altar doing tasks!");

  // 8. Voting & Conclusion
  room.handleMessage("player-a", { type: "CAST_VOTE", targetId: null }); // Skip
  room.handleMessage("player-b", { type: "CAST_VOTE", targetId: null }); // Skip

  // Concluded when all living cast
  assert.ok(room.meetingTally || clientA.popMessage("VOTE_CAST_ACK"));

  // Clean up
  room.destroy();
  registry.removeRoom(room.code);
  assert.equal(registry.getRoom(room.code), undefined);
});

test("Multiplayer GameRoom: Impostor can kill only once per Ordeal", () => {
  const registry = new GameServerRegistry();
  const room = registry.createRoom();
  const impostorClient = createMockClient();
  const firstVictimClient = createMockClient();
  const secondVictimClient = createMockClient();
  const thirdVictimClient = createMockClient();

  const impostor = room.addClient("impostor", impostorClient, "Shade", "#ff5d9e", "hood");
  const firstVictim = room.addClient("victim-one", firstVictimClient, "Mochi", "#20d8ed", "antlers");
  const secondVictim = room.addClient("victim-two", secondVictimClient, "Nori", "#95ef45", "moth");
  const thirdVictim = room.addClient("victim-three", thirdVictimClient, "Pip", "#ffd94a", "mooncap");
  room.handleMessage("impostor", { type: "START_MATCH", botFill: false, targetPlayers: 4 });

  impostor.role = "IMPOSTOR";
  firstVictim.role = "CREWMATE";
  secondVictim.role = "CREWMATE";
  thirdVictim.role = "CREWMATE";
  impostor.x = firstVictim.x = secondVictim.x = thirdVictim.x = 640;
  impostor.y = firstVictim.y = secondVictim.y = thirdVictim.y = 380;
  room.phase = "ORDEAL";
  room.phaseTime = 10;
  room.killCooldownUntil = 0;
  room.killUsedThisOrdeal = false;

  room.handleMessage("impostor", { type: "TRIGGER_KILL", victimId: "victim-one" });
  assert.equal(firstVictim.alive, false);
  assert.equal(room.bodies.length, 1);
  assert.equal(room.killUsedThisOrdeal, true);

  room.killCooldownUntil = 0;
  room.handleMessage("impostor", { type: "TRIGGER_KILL", victimId: "victim-two" });
  assert.equal(secondVictim.alive, true);
  assert.equal(room.bodies.length, 1);

  room.destroy();
  registry.removeRoom(room.code);
});

function preparedMatch(t, bots = false) {
  const room = new GameServerRegistry().createRoom();
  const clients = [];
  for (let i = 0; i < (bots ? 1 : 4); i++) {
    const client = createMockClient();
    clients.push(client);
    room.addClient(`rite-${i}`, client, `Rite ${i}`, PLAYER_COLORS[i], "hood");
  }
  room.handleMessage("rite-0", { type: "START_MATCH", botFill: bots, targetPlayers: 4 });
  for (const player of room.players.values()) player.role = player.id === "rite-0" ? "IMPOSTOR" : "CREWMATE";
  clients.forEach(client => { client.sent.length = 0; });
  t.after(() => room.destroy());
  return { room, clients };
}

test("each player keeps a private shrine rite after the team seal, without duplicate ward progress", t => {
  const { room, clients } = preparedMatch(t);
  for (const player of room.players.values()) atStation(room, player, "FROST FONT");
  const request = { type: "TASK_UPDATE", stationId: "FROST FONT", reward: "FLASHLIGHT", roundId: room.roundId };
  room.handleMessage("rite-1", request);
  room.settleWards();
  assert.equal(room.taskProgress, wardGain(room));
  room.handleMessage("rite-2", request);
  room.handleMessage("rite-0", request);
  assert.equal(room.taskProgress, wardGain(room), "a teammate cannot add a second restoration; Hollow siphons settle later");
  for (const id of ["rite-0", "rite-1", "rite-2"]) assert.equal(room.itemCharges.get(id).FLASHLIGHT, 1);
  const personal = clients[2].sent.filter(message => message.type === "GEAR_SYNC").at(-1);
  assert.deepEqual(personal.completedStations, ["FROST FONT"]);
  assert.equal(personal.stationCompleted, true);
  assert.equal(personal.wardProgressGain, 0);
  assert.equal(clients[1].sent.find(message => message.type === "GEAR_SYNC").wardProgressGain, wardGain(room));
  assert.ok(!clients[3].sent.some(message => message.type === "GEAR_SYNC"), "private inventories never leak to other clients");
  for (const message of clients[3].sent.filter(message => message.type === "STATION_COMPLETED")) {
    assert.deepEqual(Object.keys(message).sort(), ["roundId", "sequence", "stationId", "type"]);
  }
  room.handleMessage("rite-2", request);
  assert.equal(room.itemCharges.get("rite-2").FLASHLIGHT, 1);
  assert.equal(clients[2].sent.filter(message => message.type === "GEAR_SYNC").at(-1).accepted, false);

  // Another player's seal must not be reported as this unclaimed player's personal completion.
  room.handleMessage("rite-3", { ...request, reward: "SONAR" });
  const rejected = clients[3].sent.filter(message => message.type === "GEAR_SYNC").at(-1);
  assert.equal(rejected.stationCompleted, false);
  assert.deepEqual(rejected.completedStations, []);
});

test("fake rites award gear but leave the first real Warden restoration available", t => {
  const { room } = preparedMatch(t);
  for (const player of room.players.values()) atStation(room, player, "STAR ALTAR");
  const request = { type: "TASK_UPDATE", stationId: "STAR ALTAR", reward: "SONAR", roundId: 1 };
  room.handleMessage("rite-0", request);
  assert.equal(room.taskProgress, 0);
  assert.equal(room.sealedStations.has("STAR ALTAR"), false);
  room.phase = "ORDEAL";
  room.handleMessage("rite-1", request);
  const expected = wardGain(room) + ritualProgress(3, false, true);
  room.settleWards();
  assert.equal(room.taskProgress, Math.round(expected * 10) / 10);
  assert.equal(room.sealedStations.has("STAR ALTAR"), true);
});

test("rites reject distant, dead, discussion, wrong-reward and stale-round claims", t => {
  const { room, clients } = preparedMatch(t);
  const player = room.players.get("rite-1");
  const request = { type: "TASK_UPDATE", stationId: "ROOT SEAL", reward: "SONAR", roundId: 1 };
  room.handleMessage(player.id, request);
  assert.equal(clients[1].sent.at(-1).accepted, false, "distant task claims cannot repair the forest");
  atStation(room, player, "ROOT SEAL");
  for (const change of [{ alive: false }, { alive: true, phase: "DISCUSSION" }, { alive: true, phase: "CALM", roundId: 0 }, { reward: "FLARE", roundId: 1 }]) {
    if (change.alive !== undefined) player.alive = change.alive;
    if (change.phase) room.phase = change.phase;
    room.handleMessage(player.id, { ...request, roundId: change.roundId ?? 1, reward: change.reward ?? request.reward });
    assert.equal(clients[1].sent.at(-1).accepted, false);
  }
  assert.equal(room.taskProgress, 0);
  assert.equal(room.completedStations.get(player.id).size, 0);
  assert.equal(room.itemCharges.get(player.id).SONAR, 0);
});

test("Calm announces the upcoming hazard immediately and preserves its seed through countdown", t => {
  const room = new GameServerRegistry().createRoom();
  t.after(() => room.destroy());
  const client = createMockClient();
  room.addClient("host", client, "Host", PLAYER_COLORS[0], "hood");
  room.handleMessage("host", { type: "START_MATCH", botFill: true, targetPlayers: 4 });
  assert.equal(room.phaseTime, CALM_SECONDS);
  const announced = client.sent.filter(message => message.type === "SYNC_WORLD").at(-1);
  assert.equal(announced.phase, "CALM");
  assert.ok(Number.isSafeInteger(announced.ordealSeed));
  for (const phase of ["COUNTDOWN", "ORDEAL"]) {
    room.phaseTime = 0.01;
    room.lastTick = Date.now() - 50;
    room.tick();
    assert.equal(room.phase, phase);
    assert.equal(room.hazard, announced.hazard);
    assert.equal(room.ordealSeed, announced.ordealSeed);
  }
  room.phaseTime = 0.01;
  room.lastTick = Date.now() - 50;
  room.tick();
  assert.equal(room.phase, "CALM");
  assert.notEqual(room.hazard, announced.hazard, "the next preparation period advertises a fresh ordeal");
  assert.ok(room.phaseTime > CALM_SECONDS - 0.1);
});

test("bots cannot repair from afar: they travel, dwell, claim gear and use the shared team seal", t => {
  const { room } = preparedMatch(t, true);
  const bot = [...room.players.values()].find(player => player.isAi);
  for (const player of room.players.values()) if (player.isAi && player.id !== bot.id) player.alive = false;
  // Keep enough living crew for the match to remain valid while exercising this bot in isolation.
  const human = room.players.get("rite-0");
  human.role = "CREWMATE";
  [...room.players.values()].find(player => player.isAi && player.id !== bot.id).role = "IMPOSTOR";
  [...room.players.values()].find(player => player.role === "IMPOSTOR").alive = true;
  const impostor = [...room.players.values()].find(player => player.role === "IMPOSTOR");
  impostor.isAi = false;
  room.tickBots(0.1);
  assert.equal(room.taskProgress, 0);
  assert.equal(room.completedStations.get(bot.id).size, 0);
  assert.ok(Math.hypot(bot.vx, bot.vy) > 0);
  const target = room.botRituals.get(bot.id).stationId;
  atStation(room, bot, target);
  for (let i = 0; i < 20; i++) room.tickBots(0.1);
  assert.equal(room.taskProgress, 0, "standing at a shrine is not immediate completion");
  assert.equal(bot.working, true);
  for (let i = 0; i < 7; i++) room.tickBots(0.1);
  room.settleWards();
  assert.equal(room.taskProgress, wardGain(room));
  assert.equal(room.completedStations.get(bot.id).has(target), true);
  assert.equal(room.itemCharges.get(bot.id)[STATIONS.find(station => station.id === target).reward], 1);
  assert.equal(room.sealedStations.has(target), true);
});

test("larger-world spawns, movement, bot routes and lures share the actual room bounds", t => {
  const { room } = preparedMatch(t, true);
  for (const player of room.players.values()) {
    assert.ok(player.x >= PLAYER_BOUNDS.left && player.x <= PLAYER_BOUNDS.right);
    assert.ok(player.y >= PLAYER_BOUNDS.top && player.y <= PLAYER_BOUNDS.bottom);
    assert.ok(Math.hypot(player.x - CENTER.x, player.y - CENTER.y) < 290);
  }
  room.handleMessage("rite-0", { type: "PLAYER_INPUT", x: 9999, y: 9999, vx: 184, vy: 184, angle: 0, flashlight: false });
  assert.equal(room.players.get("rite-0").x, PLAYER_BOUNDS.right);
  assert.equal(room.players.get("rite-0").y, PLAYER_BOUNDS.bottom);
  room.phase = "ORDEAL";
  room.handleMessage("rite-0", { type: "USE_ABILITY", ability: "ECHO_LURE", x: 9999, y: 9999, roundId: room.roundId });
  const echo = room.echoes[0];
  assert.ok(echo.x <= PLAYER_BOUNDS.right && echo.y <= PLAYER_BOUNDS.bottom);
  assert.ok(echo.x > 1204, "the larger east clearing is genuinely playable, not just scenery");
  const obstacle = SANCTUARY_OBSTACLES[1];
  const start = { x: obstacle.x - 130, y: obstacle.y };
  const end = { x: obstacle.x + 130, y: obstacle.y };
  const route = planRoute(start, end);
  assert.ok(route.length > 1, "bots detour around trunks");
  let previous = start;
  for (const point of route) {
    assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
    for (let fraction = 0; fraction <= 1; fraction += 0.05) {
      const x = previous.x + (point.x - previous.x) * fraction;
      const y = previous.y + (point.y - previous.y) * fraction;
      for (const tree of SANCTUARY_OBSTACLES) assert.ok(Math.hypot(x - tree.x, y - tree.y) >= tree.r + 22 - 0.01);
    }
    previous = point;
  }
  assert.deepEqual(planRoute({ x: 500, y: 400 }, { x: 900, y: 400 }, true), [], "a Warden route cannot cross Rootwake cells");
  const kept = keepInRootCell({ x: 500, y: 400 }, { x: 900, y: 800 });
  assert.deepEqual(kept, { x: 618, y: 513 });
});

test("bot shrine trips finish real rituals without clipping the forest's obstacle bases", t => {
  const { room } = preparedMatch(t, true);
  const bot = [...room.players.values()].find(player => player.isAi);
  for (const other of room.players.values()) if (other.id !== bot.id) other.isAi = false;
  atStation(room, bot, "ROOT SEAL");
  for (let step = 0; step < 380; step++) {
    room.tickBots(0.05);
    assert.ok(bot.x >= PLAYER_BOUNDS.left && bot.x <= PLAYER_BOUNDS.right);
    assert.ok(bot.y >= PLAYER_BOUNDS.top && bot.y <= PLAYER_BOUNDS.bottom);
    for (const obstacle of SANCTUARY_OBSTACLES) {
      assert.ok(Math.hypot(bot.x - obstacle.x, bot.y - obstacle.y) >= obstacle.r + 22 - 0.01, "a ritual journey respects physical bases");
    }
  }
  assert.ok(room.completedStations.get(bot.id).size >= 2, "the bot actually arrives at later shrines, not just its spawn shrine");
  room.settleWards();
  assert.ok(Math.abs(room.taskProgress - room.sealedStations.size * wardGain(room)) < 1e-6);
  const charges = room.itemCharges.get(bot.id);
  assert.ok(charges.SONAR >= 1);
  assert.ok(charges.FLASHLIGHT + charges.FLARE >= 1);
});

test("bots consume only gear they earned and extinguish their lights outside the Ordeal", t => {
  const { room } = preparedMatch(t, true);
  const bot = [...room.players.values()].find(player => player.isAi);
  for (const other of room.players.values()) if (other.id !== bot.id) other.isAi = false;
  room.phase = "ORDEAL";
  room.hazard = "BLACKOUT";
  room.phaseTime = 7;
  room.tickBots(0.05);
  assert.equal(bot.flashlight, false, "no free mushroom at the start of an ordeal");
  room.phase = "CALM";
  atStation(room, bot, "FROST FONT");
  room.completeRitual(bot, "FROST FONT", "FLASHLIGHT", 1);
  assert.equal(room.itemCharges.get(bot.id).FLASHLIGHT, 1);
  room.phase = "ORDEAL";
  room.phaseTime = 7;
  room.tickBots(0.05);
  assert.equal(bot.flashlight, true);
  assert.equal(room.itemCharges.get(bot.id).FLASHLIGHT, 0);
  room.tickBots(0.05);
  assert.equal(room.itemCharges.get(bot.id).FLASHLIGHT, 0);
  room.phase = "CALM";
  room.tickBots(0.05);
  assert.equal(bot.flashlight, false);
});

test("Multiplayer GameRoom: Rootwake grid seals players inside their current cell", () => {
  const registry = new GameServerRegistry();
  const room = registry.createRoom();
  const client = createMockClient();
  const player = room.addClient("root-tester", client, "Bramble", "#48e0a4", "antlers");
  room.handleMessage("root-tester", { type: "START_MATCH", botFill: false, targetPlayers: 1 });

  player.role = "CREWMATE";
  room.phase = "ORDEAL";
  room.phaseTime = 5;
  room.hazard = "ROOTWAKE";
  player.x = 540;
  player.y = 270;
  room.handleMessage("root-tester", {
    type: "PLAYER_INPUT",
    x: 660,
    y: 270,
    vx: 184,
    vy: 0,
    angle: 0,
    flashlight: false,
  });

  assert.equal(player.x, 618);
  assert.equal(player.y, 270);

  player.x = 900;
  player.y = 480;
  room.handleMessage("root-tester", {
    type: "PLAYER_INPUT",
    x: 900,
    y: 560,
    vx: 0,
    vy: 184,
    angle: Math.PI / 2,
    flashlight: false,
  });

  assert.equal(player.x, 900);
  assert.equal(player.y, 513);

  // Impostor can pass freely through Rootwake walls across cells
  player.role = "IMPOSTOR";
  room.handleMessage("root-tester", {
    type: "PLAYER_INPUT",
    x: 1350,
    y: 780,
    vx: 184,
    vy: 184,
    angle: 0,
    flashlight: false,
  });
  assert.equal(player.x, 1350);
  assert.equal(player.y, 780);

  room.destroy();
  registry.removeRoom(room.code);
});

test("Multiplayer Lobby System: Profile Updates, Ready Toggle, Config Sync, Lobby Chat, and Open Rooms", () => {
  const registry = new GameServerRegistry();
  const room = registry.createRoom();
  const hostClient = createMockClient();
  const guestClient = createMockClient();

  room.addClient("host-1", hostClient, "Sylph", "#20d8ed", "antlers");
  room.addClient("guest-1", guestClient, "Mochi", "#95ef45", "hood");

  // Open rooms list should include the active lobby room
  const openRooms = registry.listOpenRooms();
  assert.equal(openRooms.length, 1);
  assert.equal(openRooms[0].code, room.code);
  assert.equal(openRooms[0].hostName, "Sylph");
  assert.equal(openRooms[0].playerCount, 2);

  // Guest updates profile in waiting room
  room.handleMessage("guest-1", {
    type: "UPDATE_PROFILE",
    playerName: "Lumen",
    color: "#a879ff",
    hat: "moth",
  });
  const updatedGuest = room.players.get("guest-1");
  assert.equal(updatedGuest.name, "Lumen");
  assert.equal(updatedGuest.color, "#a879ff");
  assert.equal(updatedGuest.hat, "moth");
  assert.equal(hostClient.popMessage("LOBBY_UPDATED").players.find((p) => p.id === "guest-1").name, "Lumen");

  // Guest toggles ready state
  assert.equal(updatedGuest.ready, false);
  room.handleMessage("guest-1", { type: "TOGGLE_READY" });
  assert.equal(updatedGuest.ready, true);

  // Host updates room config
  room.handleMessage("host-1", {
    type: "UPDATE_ROOM_CONFIG",
    targetPlayers: 8,
    botFill: false,
  });
  assert.equal(room.targetPlayers, 8);
  assert.equal(room.botFill, false);
  const configSyncMsg = guestClient.popMessage("LOBBY_UPDATED");
  assert.ok(configSyncMsg);

  // Pre-game lobby chat
  room.handleMessage("guest-1", { type: "SEND_CHAT", text: "Ready for the trial!" });
  const lobbyChatMsg = hostClient.popMessage("CHAT_MESSAGE");
  assert.ok(lobbyChatMsg);
  assert.equal(lobbyChatMsg.message.playerName, "Lumen");
  assert.equal(lobbyChatMsg.message.text, "Ready for the trial!");

  room.destroy();
  registry.removeRoom(room.code);
});

test("Vercel HTTP Realtime Relay (/api/mp): Room Creation, Joining, and Match Sync", async () => {
  const callApi = async (payload) => {
    const req = new Request("http://localhost:3000/api/mp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(initialHandshake(payload)),
    });
    const res = await POST(req);
    return await res.json();
  };

  // 1. Host creates room via HTTP relay
  const hostInit = await callApi({
    messages: [{ type: "CREATE_ROOM", playerName: "VercelHost", color: "#20d8ed", hat: "antlers" }],
  });
  assert.equal(hostInit.ok, true);
  assert.ok(hostInit.sessionId);
  const roomState = hostInit.messages.find((m) => m.type === "ROOM_STATE");
  assert.ok(roomState);
  assert.equal(roomState.isHost, true);

  // 2. Guest joins room via HTTP relay
  const guestInit = await callApi({
    messages: [
      {
        type: "JOIN_ROOM",
        roomCode: roomState.roomCode,
        playerName: "VercelGuest",
        color: "#ff5d9e",
        hat: "mooncap",
      },
    ],
  });
  assert.equal(guestInit.ok, true);
  const guestRoomState = guestInit.messages.find((m) => m.type === "ROOM_STATE");
  assert.ok(guestRoomState);
  assert.equal(guestRoomState.players.length, 2);

  // 3. Host polls and receives PLAYER_JOINED
  const hostPoll = await callApi({ sessionId: hostInit.sessionId, messages: [] });
  assert.ok(hostPoll.messages.some((m) => m.type === "PLAYER_JOINED"));

  // 4. Clean up both HTTP sessions
  await callApi({ sessionId: hostInit.sessionId, disconnect: true });
  await callApi({ sessionId: guestInit.sessionId, disconnect: true });
});

test("three relay players can discover, join, and start after a background-tab pause", async (t) => {
  let now = Date.now();
  t.mock.method(Date, "now", () => now);
  const ids = [];
  const api = async payload => {
    const response = await POST(new Request("http://localhost/api/mp", { method: "POST", body: JSON.stringify(initialHandshake(payload)) }));
    return { status: response.status, ...await response.json() };
  };
  t.after(async () => { for (const sessionId of ids) await api({ sessionId, disconnect: true }); });
  const host = await api({ messages: [{ type: "CREATE_ROOM", playerName: "Host", color: PLAYER_COLORS[0], hat: "hood" }] });
  ids.push(host.sessionId);
  const room = host.messages.find(msg => msg.type === "ROOM_STATE");
  const guest = await api({ messages: [{ type: "JOIN_ROOM", roomCode: room.roomCode, playerName: "Guest", color: PLAYER_COLORS[0], hat: "hood" }] });
  ids.push(guest.sessionId);
  // Browsers may only run a background polling timer once per minute.
  now += 45_000;
  const third = await api({ messages: [{ type: "LIST_ROOMS" }, { type: "JOIN_ROOM", roomCode: room.roomCode, playerName: "Third", color: PLAYER_COLORS[0], hat: "hood" }] });
  ids.push(third.sessionId);
  assert.ok(third.messages.find(msg => msg.type === "ROOMS_LIST").rooms.some(entry => entry.code === room.roomCode));
  assert.equal(third.messages.find(msg => msg.type === "ROOM_STATE").players.length, 3);
  const started = await api({ sessionId: host.sessionId, messages: [{ type: "START_MATCH", botFill: true, targetPlayers: 6 }] });
  assert.equal(started.status, 200);
  const match = started.messages.find(msg => msg.type === "MATCH_STARTED");
  assert.ok(match);
  assert.equal(new Set(match.players.map(player => player.color)).size, 6);
  for (const sessionId of [guest.sessionId, third.sessionId]) {
    assert.ok((await api({ sessionId })).messages.some(msg => msg.type === "MATCH_STARTED"));
  }
});

test("room colors stay unique on join, profile races, bot fill, and slot reuse", (t) => {
  const room = new GameServerRegistry().createRoom();
  t.after(() => room.destroy());
  const host = room.addClient("host", createMockClient(), "Host", PLAYER_COLORS[5], "hood");
  const guestClient = createMockClient();
  const guest = room.addClient("guest", guestClient, "Guest", PLAYER_COLORS[5].toUpperCase(), "moth");
  assert.notEqual(host.color, guest.color);
  room.handleMessage("guest", { type: "UPDATE_PROFILE", playerName: "Guest", color: host.color, hat: "moth" });
  assert.notEqual(host.color, guest.color);
  assert.match(guestClient.popMessage("ERROR_ALERT").message, /already taken/);
  const releasedColor = guest.color;
  room.removeClient("guest");
  assert.equal(room.addClient("new", createMockClient(), "New", releasedColor, "hood").color, releasedColor);
  room.handleMessage("host", { type: "START_MATCH", botFill: true, targetPlayers: 8 });
  assert.equal(new Set(Array.from(room.players.values(), (p) => p.color)).size, 8);
  assert.equal(new Set(Array.from(room.players.values(), (p) => p.name.toLowerCase())).size, 8);
  assert.equal(Array.from(room.players.values()).filter((p) => p.role === "IMPOSTOR").length, 1);
});

test("default Warden callsign randomizes and room callsigns stay unique on join, profile update, and bot fill", (t) => {
  const room = new GameServerRegistry().createRoom();
  t.after(() => room.destroy());
  const p1 = room.addClient("p1", createMockClient(), "Warden", PLAYER_COLORS[0], "hood");
  assert.notEqual(p1.name.toLowerCase(), "warden");
  const c2 = createMockClient();
  const p2 = room.addClient("p2", c2, p1.name, PLAYER_COLORS[1], "moth");
  assert.notEqual(p2.name.toLowerCase(), p1.name.toLowerCase());
  room.handleMessage("p2", { type: "UPDATE_PROFILE", playerName: p1.name, color: p2.color, hat: "moth" });
  assert.notEqual(p2.name.toLowerCase(), p1.name.toLowerCase());
  assert.match(c2.popMessage("ERROR_ALERT").message, /already taken/);
  room.handleMessage("p1", { type: "START_MATCH", botFill: true, targetPlayers: 8 });
  assert.equal(new Set(Array.from(room.players.values(), (p) => p.name.toLowerCase())).size, 8);
});

test("compact movement keeps roles private, reduces bytes, and skips congested peers", (t) => {
  const room = new GameServerRegistry().createRoom();
  t.after(() => room.destroy());
  const host = createMockClient();
  room.addClient("host", host, "Host", PLAYER_COLORS[0], "hood");
  const slow = createMockClient();
  slow.bufferedAmount = 65_536;
  room.addClient("slow", slow, "Slow", PLAYER_COLORS[1], "hood");
  room.handleMessage("host", { type: "START_MATCH", botFill: true, targetPlayers: 8 });
  host.sent.length = slow.sent.length = 0;
  for (let i = 0; i < 5; i++) {
    room.lastTick = Date.now() - 55;
    room.tick();
  }
  const packets = host.sent.filter((msg) => msg.type === "SYNC_MOVEMENT");
  assert.equal(packets.length, 5);
  assert.equal(host.sent.filter((msg) => msg.type === "SYNC_WORLD").length, 1);
  assert.equal(slow.sent.filter((msg) => msg.type === "SYNC_MOVEMENT").length, 0);
  assert.ok(packets[0].players.every((p) => !("role" in p) && !("color" in p) && !("name" in p)));
  const oldSize = JSON.stringify({ type: "SYNC_PLAYERS", players: Array.from(room.players.values()) }).length;
  assert.ok(JSON.stringify(packets[0]).length < oldSize * 0.7);
});

test("invalid and reordered movement cannot corrupt a room or tunnel through Rootwake", (t) => {
  const room = new GameServerRegistry().createRoom();
  t.after(() => room.destroy());
  const player = room.addClient("host", createMockClient(), "Host", PLAYER_COLORS[0], "hood");
  room.handleMessage("host", { type: "START_MATCH", botFill: false, targetPlayers: 4 });
  player.role = "CREWMATE";
  const input = { type: "PLAYER_INPUT", x: 300, y: 180, vx: 100, vy: 0, angle: 0, flashlight: false, seq: 2 };
  room.handleMessage("host", input);
  const acceptedX = player.x;
  room.handleMessage("host", { ...input, x: 250, seq: 1 });
  room.handleMessage("host", { ...input, x: NaN, seq: 3 });
  assert.equal(player.x, acceptedX, "stale and invalid inputs cannot change the collision-resolved position");
  assert.equal(player.inputSeq, 2);
  room.phase = "ORDEAL";
  room.hazard = "ROOTWAKE";
  room.phaseTime = 5;
  room.handleMessage("host", { ...input, x: 900, y: 600, seq: 4 });
  assert.equal(player.x, 618);
  assert.equal(player.y, 513);
});

test("slow HTTP ticks advance phase clocks by wall time without speeding up AI", (t) => {
  const room = new GameServerRegistry().createRoom();
  t.after(() => room.destroy());
  room.addClient("host", createMockClient(), "Host", PLAYER_COLORS[0], "hood");
  room.handleMessage("host", { type: "START_MATCH", botFill: false, targetPlayers: 4 });
  room.phaseTime = 1;
  room.lastTick = Date.now() - 2000;
  room.tick();
  assert.equal(room.phase, "COUNTDOWN");
  assert.ok(room.phaseTime > 1.9 && room.phaseTime <= 2);
});

test("switching rooms removes ghosts, and malformed packets do not throw", (t) => {
  const client = createMockClient();
  const handler = handleSocketConnection(client, "switcher");
  handler.onMessage(JSON.stringify(hello));
  t.after(() => handler.onClose());
  for (const value of ["null", "[]", "{}", '{"type":"JOIN_ROOM"}', '{"type":"UPDATE_PROFILE"}']) {
    assert.doesNotThrow(() => handler.onMessage(value));
  }
  handler.onMessage(JSON.stringify({ type: "CREATE_ROOM", playerName: "Host", color: PLAYER_COLORS[0], hat: "hood" }));
  const oldCode = client.popMessage("ROOM_STATE").roomCode;
  handler.onMessage(JSON.stringify({ type: "CREATE_ROOM", playerName: "Host", color: PLAYER_COLORS[0], hat: "hood" }));
  assert.equal(gameRegistry.getRoom(oldCode), undefined);
  handler.onMessage(JSON.stringify({ type: "PING", sentAt: 123 }));
  assert.equal(client.popMessage("PONG").sentAt, 123);
});

test("disconnect during voting no longer stalls the meeting", (t) => {
  const room = new GameServerRegistry().createRoom();
  t.after(() => room.destroy());
  for (let i = 0; i < 4; i++) room.addClient(`p${i}`, createMockClient(), `P${i}`, PLAYER_COLORS[i], "hood");
  room.handleMessage("p0", { type: "START_MATCH", botFill: false, targetPlayers: 4 });
  for (const p of room.players.values()) p.role = p.id === "p0" ? "IMPOSTOR" : "CREWMATE";
  room.startMeeting("TEST", "P0");
  for (const id of ["p0", "p1", "p2"]) room.handleMessage(id, { type: "CAST_VOTE", targetId: null });
  room.handleMessage("p0", { type: "CAST_VOTE", targetId: "missing" });
  assert.equal(room.votes.get("p0"), null);
  room.removeClient("p3");
  assert.ok(room.meetingTally);
});

test("rejected kill and gear actions return authoritative state to the requesting player", (t) => {
  const room = new GameServerRegistry().createRoom();
  t.after(() => room.destroy());
  const client = createMockClient();
  const host = room.addClient("host", client, "Host", PLAYER_COLORS[0], "hood");
  room.handleMessage("host", { type: "START_MATCH", botFill: true, targetPlayers: 4 });
  host.role = "IMPOSTOR";
  room.phase = "ORDEAL";
  room.handleMessage("host", { type: "TRIGGER_KILL", victimId: "missing" });
  assert.deepEqual(client.popMessage("KILL_RESULT"), { type: "KILL_RESULT", accepted: false, spent: false, stealthRemainingMs: 0, stealthOrdealsLeft: 0 });
  room.itemCharges.get("host").SONAR = 1;
  room.handleMessage("host", { type: "USE_ITEM", item: "SONAR", x: 0, y: 0 });
  assert.equal(client.popMessage("GEAR_SYNC").charges.SONAR, 0);
  room.handleMessage("host", { type: "USE_ITEM", item: "SONAR", x: 0, y: 0 });
  assert.equal(client.popMessage("GEAR_SYNC").accepted, false);
});

test("HTTP relay retries are idempotent and missing sessions fail explicitly", async (t) => {
  const call = async (payload) => POST(new Request("http://localhost/api/mp", { method: "POST", body: JSON.stringify(initialHandshake(payload)) }));
  const initial = await (await call({ messages: [{ type: "CREATE_ROOM", playerName: "Retry", color: PLAYER_COLORS[0], hat: "hood" }] })).json();
  t.after(() => call({ sessionId: initial.sessionId, disconnect: true }));
  const payload = { sessionId: initial.sessionId, requestId: 1, messages: [{ type: "SEND_CHAT", text: "Only once" }] };
  const first = await (await call(payload)).json();
  const replay = await (await call(payload)).json();
  assert.deepEqual(first, replay);
  const roomCode = initial.messages.find((m) => m.type === "ROOM_STATE").roomCode;
  assert.equal(gameRegistry.getRoom(roomCode).chatHistory.filter((msg) => msg.text === "Only once").length, 1);
  const room = gameRegistry.getRoom(roomCode);
  const body = { id: "test-body", x: 640, y: 380, color: PLAYER_COLORS[1], name: "Test", age: 0 };
  const world = { type: "SYNC_WORLD", phase: "ORDEAL", time: 5, hazard: "FOG", taskProgress: 0, bodies: [], flares: [] };
  room.broadcast(world);
  room.broadcast({ type: "BODY_SPAWNED", body });
  room.broadcast({ ...world, bodies: [body] });
  const ordered = await (await call({ sessionId: initial.sessionId, requestId: 2, messages: [] })).json();
  assert.deepEqual(ordered.messages.map((msg) => msg.type), ["BODY_SPAWNED", "SYNC_WORLD"]);
  assert.equal((await call({ sessionId: "a-session-from-another-instance", messages: [] })).status, 409);
});
