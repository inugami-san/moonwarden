import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../app/api/mp/route.ts";
import { GameServerRegistry } from "../server/game-room.ts";

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

  // 5. Task Progress
  const initialTask = room.taskProgress;
  room.handleMessage("player-a", { type: "TASK_UPDATE", stationId: "FROST FONT", reward: "FLASHLIGHT" });
  assert.equal(room.taskProgress, initialTask + (playerA.role === "CREWMATE" ? 17 : 0));
  assert.equal(room.itemCharges.get("player-a").FLASHLIGHT, 1);
  // The same shrine cannot be claimed twice by the same player.
  room.handleMessage("player-a", { type: "TASK_UPDATE", stationId: "FROST FONT", reward: "FLASHLIGHT" });
  assert.equal(room.itemCharges.get("player-a").FLASHLIGHT, 1);

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
