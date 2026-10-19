import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../app/api/mp/route.ts";
import { GameServerRegistry } from "../server/game-room.ts";
import { gameRegistry } from "../server/game-room.ts";
import { handleSocketConnection } from "../server/ws-handler.ts";
import { PLAYER_COLORS } from "../server/palette.ts";

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
  playerA.role = "CREWMATE";
  const initialTask = room.taskProgress;
  room.handleMessage("player-a", { type: "TASK_UPDATE", stationId: "FROST FONT", reward: "FLASHLIGHT" });
  assert.equal(room.taskProgress, initialTask + 8);
  assert.equal(room.itemCharges.get("player-a").FLASHLIGHT, 1);
  assert.equal(room.sealedStations.has("FROST FONT"), true);
  const worldSyncForB = clientB.popMessage("SYNC_WORLD");
  assert.ok(worldSyncForB);
  assert.deepEqual(worldSyncForB.completedStations, ["FROST FONT"]);
  // Neither the same player nor another player can re-seal an already sealed shrine.
  room.handleMessage("player-a", { type: "TASK_UPDATE", stationId: "FROST FONT", reward: "FLASHLIGHT" });
  assert.equal(room.itemCharges.get("player-a").FLASHLIGHT, 1);
  room.handleMessage("player-b", { type: "TASK_UPDATE", stationId: "FROST FONT", reward: "FLASHLIGHT" });
  assert.equal(room.itemCharges.get("player-b").FLASHLIGHT, 0);

  // 6. Emergency Meeting Trigger
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
  player.x = 360;
  player.y = 180;
  room.handleMessage("root-tester", {
    type: "PLAYER_INPUT",
    x: 435,
    y: 180,
    vx: 184,
    vy: 0,
    angle: 0,
    flashlight: false,
  });

  assert.equal(player.x, 402);
  assert.equal(player.y, 180);

  player.x = 600;
  player.y = 320;
  room.handleMessage("root-tester", {
    type: "PLAYER_INPUT",
    x: 600,
    y: 370,
    vx: 0,
    vy: 184,
    angle: Math.PI / 2,
    flashlight: false,
  });

  assert.equal(player.x, 600);
  assert.equal(player.y, 332);

  // Impostor can pass freely through Rootwake walls across cells
  player.role = "IMPOSTOR";
  room.handleMessage("root-tester", {
    type: "PLAYER_INPUT",
    x: 900,
    y: 520,
    vx: 184,
    vy: 184,
    angle: 0,
    flashlight: false,
  });
  assert.equal(player.x, 900);
  assert.equal(player.y, 520);

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
      body: JSON.stringify(payload),
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
    const response = await POST(new Request("http://localhost/api/mp", { method: "POST", body: JSON.stringify(payload) }));
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
  room.handleMessage("host", { ...input, x: 250, seq: 1 });
  room.handleMessage("host", { ...input, x: NaN, seq: 3 });
  assert.equal(player.x, 300);
  assert.equal(player.inputSeq, 2);
  room.phase = "ORDEAL";
  room.hazard = "ROOTWAKE";
  room.phaseTime = 5;
  room.handleMessage("host", { ...input, x: 900, y: 600, seq: 4 });
  assert.equal(player.x, 402);
  assert.equal(player.y, 332);
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
  assert.deepEqual(client.popMessage("KILL_RESULT"), { type: "KILL_RESULT", accepted: false, spent: false });
  room.itemCharges.get("host").SONAR = 1;
  room.handleMessage("host", { type: "USE_ITEM", item: "SONAR", x: 0, y: 0 });
  assert.equal(client.popMessage("GEAR_SYNC").charges.SONAR, 0);
  room.handleMessage("host", { type: "USE_ITEM", item: "SONAR", x: 0, y: 0 });
  assert.equal(client.popMessage("GEAR_SYNC").accepted, false);
});

test("HTTP relay retries are idempotent and missing sessions fail explicitly", async (t) => {
  const call = async (payload) => POST(new Request("http://localhost/api/mp", { method: "POST", body: JSON.stringify(payload) }));
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
