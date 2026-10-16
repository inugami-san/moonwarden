import type {
  C2SMessage,
  Hat,
  Hazard,
  ItemKind,
  NetBody,
  NetChatMessage,
  NetFlare,
  NetPlayer,
  NetVoteTally,
  Phase,
  RoomSummary,
  S2CMessage,
} from "./game-types";

export interface IWebSocketClient {
  send(data: string): void;
  close(): void;
  readyState: number;
}

const ROOM = { left: 76, top: 72, right: 1204, bottom: 690 };
const ROOT_BARRIERS = [
  { x: 432, y: ROOM.top, w: 36, h: ROOM.bottom - ROOM.top },
  { x: 812, y: ROOM.top, w: 36, h: ROOM.bottom - ROOM.top },
  { x: ROOM.left, y: 362, w: ROOM.right - ROOM.left, h: 36 },
] as const;
const COLORS = ["#20d8ed", "#95ef45", "#ff5d9e", "#ffd94a", "#a879ff", "#ff9843", "#5ea7ff", "#48e0a4"];
const BOT_NAMES = ["Mochi", "Bubbles", "Gloop", "Pebble", "Nori", "Fizz", "Pip", "Wobble"];
const HATS: readonly Hat[] = ["antlers", "hood", "moth", "mooncap"];
const STATION_REWARDS = new Map<string, ItemKind>([
  ["FROST FONT", "FLASHLIGHT"],
  ["STAR ALTAR", "SONAR"],
  ["OWL TOTEM", "FLARE"],
  ["EAST WARD", "FLASHLIGHT"],
  ["MOONWELL", "FLARE"],
  ["ROOT SEAL", "SONAR"],
]);
const TASK_PROGRESS_REWARD = 17;
const KILL_COOLDOWN_MS = 1500;

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function choose<T>(items: readonly T[] | T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function rootwakeStrength(phase: Phase, hazard: Hazard, phaseTime: number) {
  if (phase !== "ORDEAL" || hazard !== "ROOTWAKE") return 0;
  const risen = Math.max(0, Math.min(1, (10 - phaseTime) / 0.75));
  const receding = Math.max(0, Math.min(1, phaseTime / 0.55));
  return Math.min(risen, receding);
}

function resolveRootPosition(x: number, y: number, radius = 30) {
  let resolvedX = x;
  let resolvedY = y;
  for (const barrier of ROOT_BARRIERS) {
    const left = barrier.x - radius;
    const right = barrier.x + barrier.w + radius;
    const top = barrier.y - radius;
    const bottom = barrier.y + barrier.h + radius;
    if (resolvedX <= left || resolvedX >= right || resolvedY <= top || resolvedY >= bottom) continue;
    const exits = [
      { distance: resolvedX - left, axis: "x" as const, value: left },
      { distance: right - resolvedX, axis: "x" as const, value: right },
      { distance: resolvedY - top, axis: "y" as const, value: top },
      { distance: bottom - resolvedY, axis: "y" as const, value: bottom },
    ].sort((a, b) => a.distance - b.distance);
    if (exits[0].axis === "x") resolvedX = exits[0].value;
    else resolvedY = exits[0].value;
  }
  return { x: resolvedX, y: resolvedY };
}

function rootCellIndex(position: { x: number; y: number }) {
  const [leftRoot, rightRoot, middleRoot] = ROOT_BARRIERS;
  const column = position.x < leftRoot.x + leftRoot.w / 2 ? 0 : position.x < rightRoot.x + rightRoot.w / 2 ? 1 : 2;
  const row = position.y < middleRoot.y + middleRoot.h / 2 ? 0 : 1;
  return row * 3 + column;
}

function sharesRootCell(a: { x: number; y: number }, b: { x: number; y: number }) {
  return rootCellIndex(a) === rootCellIndex(b);
}

export class GameRoom {
  code: string;
  hostId: string = "";
  state: "LOBBY" | "PLAYING" | "ENDED" = "LOBBY";
  targetPlayers: number = 6;
  botFill: boolean = true;
  clients = new Map<string, IWebSocketClient>();
  players = new Map<string, NetPlayer>();

  phase: Phase = "CALM";
  phaseTime: number = 15;
  hazard: Hazard = "BLACKOUT";
  taskProgress: number = 0;
  bodies: NetBody[] = [];
  flares: NetFlare[] = [];
  killCooldownUntil: number = 0;
  killUsedThisOrdeal: boolean = false;
  completedStations = new Map<string, Set<string>>();
  itemCharges = new Map<string, Record<ItemKind, number>>();

  meetingReason: string = "";
  meetingReporter: string = "";
  meetingTally: NetVoteTally[] | null = null;
  votes = new Map<string, string | null>();
  chatHistory: NetChatMessage[] = [];

  private loopTimer: NodeJS.Timeout | null = null;
  private lastTick: number = 0;
  private syncTimer: number = 0;

  constructor(code: string) {
    this.code = code;
  }

  addClient(playerId: string, client: IWebSocketClient, name: string, color: string, hat: Hat): NetPlayer {
    const isFirst = this.clients.size === 0;
    if (isFirst) this.hostId = playerId;
    this.clients.set(playerId, client);

    const isHost = this.hostId === playerId;
    const player: NetPlayer = {
      id: playerId,
      name: name.slice(0, 16) || `Warden-${this.clients.size}`,
      color: color || COLORS[(this.clients.size - 1) % COLORS.length],
      hat: hat || choose(HATS),
      alive: true,
      x: 640 + (Math.random() - 0.5) * 160,
      y: 380 + (Math.random() - 0.5) * 100,
      vx: 0,
      vy: 0,
      angle: 0,
      flashlight: false,
      isHost,
      ready: isHost,
    };
    this.players.set(playerId, player);
    this.completedStations.set(playerId, new Set());
    this.itemCharges.set(playerId, { FLASHLIGHT: 0, FLARE: 0, SONAR: 0 });

    // Send room state to the joining client
    this.sendTo(client, {
      type: "ROOM_STATE",
      roomCode: this.code,
      playerId,
      isHost: player.isHost,
      players: Array.from(this.players.values()),
      state: this.state,
      targetPlayers: this.targetPlayers,
      botFill: this.botFill,
      chatHistory: this.chatHistory,
    });

    // Broadcast to others
    this.broadcastExcept(playerId, {
      type: "PLAYER_JOINED",
      player,
    });

    return player;
  }

  removeClient(playerId: string) {
    this.clients.delete(playerId);
    this.players.delete(playerId);
    this.completedStations.delete(playerId);
    this.itemCharges.delete(playerId);

    let newHostId: string | undefined;
    if (this.hostId === playerId && this.clients.size > 0) {
      newHostId = this.clients.keys().next().value;
      this.hostId = newHostId!;
      const hostPlayer = this.players.get(this.hostId);
      if (hostPlayer) {
        hostPlayer.isHost = true;
        hostPlayer.ready = true;
      }
    }

    this.broadcast({
      type: "PLAYER_LEFT",
      playerId,
      newHostId,
    });

    if (this.clients.size === 0) {
      this.destroy();
    } else if (this.state === "PLAYING") {
      this.checkWinConditions();
    }
  }

  broadcastLobbyUpdate() {
    this.broadcast({
      type: "LOBBY_UPDATED",
      players: Array.from(this.players.values()),
      targetPlayers: this.targetPlayers,
      botFill: this.botFill,
      hostId: this.hostId,
    });
  }

  handleMessage(playerId: string, msg: C2SMessage) {
    const player = this.players.get(playerId);
    if (!player) return;

    switch (msg.type) {
      case "UPDATE_PROFILE":
        if (this.state === "LOBBY") {
          player.name = msg.playerName.trim().slice(0, 16) || player.name;
          if (COLORS.includes(msg.color)) player.color = msg.color;
          if (HATS.includes(msg.hat)) player.hat = msg.hat;
          this.broadcastLobbyUpdate();
        }
        break;

      case "TOGGLE_READY":
        if (this.state === "LOBBY") {
          player.ready = typeof msg.ready === "boolean" ? msg.ready : !player.ready;
          this.broadcastLobbyUpdate();
        }
        break;

      case "UPDATE_ROOM_CONFIG":
        if (player.isHost && this.state === "LOBBY") {
          this.targetPlayers = Math.max(4, Math.min(8, Math.round(msg.targetPlayers)));
          this.botFill = Boolean(msg.botFill);
          this.broadcastLobbyUpdate();
        }
        break;

      case "START_MATCH":
        if (player.isHost && this.state === "LOBBY") {
          this.botFill = msg.botFill ?? this.botFill;
          this.targetPlayers = msg.targetPlayers ?? this.targetPlayers;
          this.startMatch(this.botFill, this.targetPlayers);
        }
        break;

      case "PLAYER_INPUT":
        if (this.state === "PLAYING" && player.alive && this.phase !== "DISCUSSION") {
          const nextX = Math.max(ROOM.left + 36, Math.min(ROOM.right - 36, msg.x));
          const nextY = Math.max(ROOM.top + 48, Math.min(ROOM.bottom - 32, msg.y));
          const next = rootwakeStrength(this.phase, this.hazard, this.phaseTime) > 0.72
            ? resolveRootPosition(nextX, nextY)
            : { x: nextX, y: nextY };
          player.x = next.x;
          player.y = next.y;
          player.vx = msg.vx;
          player.vy = msg.vy;
          player.angle = msg.angle;
          player.flashlight = msg.flashlight;
        }
        break;

      case "USE_ITEM":
        if (this.state === "PLAYING" && player.alive && this.phase === "ORDEAL") {
          const charges = this.itemCharges.get(player.id);
          if (!charges || charges[msg.item] <= 0) break;
          charges[msg.item] -= 1;
          if (msg.item === "FLARE") {
            const flare: NetFlare = { x: player.x, y: player.y, life: 5, owner: player.id };
            this.flares.push(flare);
            this.broadcast({ type: "FLARE_SPAWNED", flare });
          }
        }
        break;

      case "TRIGGER_KILL":
        if (this.state === "PLAYING" && player.role === "IMPOSTOR" && player.alive && this.phase === "ORDEAL" && !this.killUsedThisOrdeal && Date.now() >= this.killCooldownUntil) {
          const victim = this.players.get(msg.victimId);
          if (
            victim
            && victim.alive
            && victim.role !== "IMPOSTOR"
            && dist(player, victim) < 84
            && (this.hazard !== "ROOTWAKE" || sharesRootCell(player, victim))
          ) {
            this.executeKill(victim, player);
          }
        }
        break;

      case "TRIGGER_REPORT":
        if (this.state === "PLAYING" && player.alive && this.phase !== "DISCUSSION") {
          const nearbyBody = this.bodies.find((b) => dist(player, b) < 96);
          const atBell = dist(player, { x: 640, y: 382 }) < 92 && this.phase === "CALM";
          if (nearbyBody) {
            this.startMeeting(`${nearbyBody.name.toUpperCase()} WAS FOUND AS A JELLY PUDDLE`, player.name);
          } else if (atBell) {
            this.startMeeting("EMERGENCY MEETING CALLED", player.name);
          }
        }
        break;

      case "TASK_UPDATE":
        if (this.state === "PLAYING" && player.alive && this.phase === "CALM") {
          const expectedReward = STATION_REWARDS.get(msg.stationId);
          const completed = this.completedStations.get(player.id);
          const charges = this.itemCharges.get(player.id);
          if (!expectedReward || expectedReward !== msg.reward || !completed || !charges || completed.has(msg.stationId)) break;
          completed.add(msg.stationId);
          charges[msg.reward] = Math.min(3, charges[msg.reward] + 1);
          if (player.role === "CREWMATE") {
            this.taskProgress = Math.min(100, this.taskProgress + TASK_PROGRESS_REWARD);
            if (this.taskProgress >= 100) {
              this.endMatch("CREW VICTORY — ALL MOON WARDS RESTORED");
            }
          }
        }
        break;

      case "SEND_CHAT":
        if ((this.state === "LOBBY" || (this.phase === "DISCUSSION" && player.alive)) && msg.text.trim()) {
          const chatMsg: NetChatMessage = {
            id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            playerId: player.id,
            playerName: player.name,
            playerColor: player.color,
            text: msg.text.slice(0, 160),
          };
          this.chatHistory.push(chatMsg);
          if (this.chatHistory.length > 50) this.chatHistory.shift();
          this.broadcast({ type: "CHAT_MESSAGE", message: chatMsg });
        }
        break;

      case "CAST_VOTE":
        if (this.phase === "DISCUSSION" && player.alive && !this.meetingTally) {
          this.votes.set(player.id, msg.targetId);
          this.broadcast({ type: "VOTE_CAST_ACK", voterId: player.id });
          this.checkVotesComplete();
        }
        break;

      case "RESOLVE_MEETING":
        if (this.meetingTally) {
          this.resolveMeeting();
        }
        break;

      case "LEAVE_ROOM":
        this.removeClient(playerId);
        break;
    }
  }

  private startMatch(botFill: boolean, targetCount: number) {
    this.state = "PLAYING";
    this.phase = "CALM";
    this.phaseTime = 15;
    this.taskProgress = 0;
    this.bodies = [];
    this.flares = [];
    this.killCooldownUntil = 0;
    this.killUsedThisOrdeal = false;
    this.completedStations.clear();
    this.itemCharges.clear();
    for (const player of this.players.values()) {
      this.completedStations.set(player.id, new Set());
      this.itemCharges.set(player.id, { FLASHLIGHT: 0, FLARE: 0, SONAR: 0 });
    }

    // Fill remaining slots with AI if enabled
    if (botFill && this.players.size < targetCount) {
      let botIndex = 0;
      while (this.players.size < targetCount) {
        const botId = `bot-${botIndex + 1}`;
        const angle = (this.players.size / targetCount) * Math.PI * 2;
        this.players.set(botId, {
          id: botId,
          name: BOT_NAMES[botIndex % BOT_NAMES.length],
          color: COLORS[(this.players.size) % COLORS.length],
          hat: HATS[botIndex % HATS.length],
          alive: true,
          x: 640 + Math.cos(angle) * 160,
          y: 384 + Math.sin(angle) * 100,
          vx: 0,
          vy: 0,
          angle: 0,
          flashlight: false,
          isHost: false,
          isAi: true,
        });
        this.completedStations.set(botId, new Set());
        this.itemCharges.set(botId, { FLASHLIGHT: 0, FLARE: 0, SONAR: 0 });
        botIndex++;
      }
    }

    // Assign roles secretly: exactly 1 Impostor
    const playerList = Array.from(this.players.values());
    const impostor = choose(playerList);
    for (const p of playerList) {
      p.role = p.id === impostor.id ? "IMPOSTOR" : "CREWMATE";
    }

    // Notify each human client privately with their assigned role
    for (const [id, client] of this.clients.entries()) {
      const p = this.players.get(id);
      if (!p) continue;
      this.sendTo(client, {
        type: "MATCH_STARTED",
        role: p.role || "CREWMATE",
        players: playerList.map((player) => ({
          ...player,
          role: player.id === id ? player.role : undefined, // Keep role secret!
        })),
      });
    }

    this.lastTick = Date.now();
    this.loopTimer = setInterval(() => this.tick(), 50); // 20Hz server tick
  }

  private executeKill(victim: NetPlayer, killer: NetPlayer) {
    victim.alive = false;
    victim.vx = 0;
    victim.vy = 0;
    this.killUsedThisOrdeal = true;
    this.killCooldownUntil = Date.now() + KILL_COOLDOWN_MS;

    const body: NetBody = {
      id: `body-${victim.id}`,
      x: victim.x,
      y: victim.y,
      color: victim.color,
      name: victim.name,
      age: 0,
    };
    this.bodies.push(body);

    this.broadcast({ type: "BODY_SPAWNED", body });

    // Send private death reveal only to the victim
    const victimClient = this.clients.get(victim.id);
    if (victimClient) {
      this.sendTo(victimClient, {
        type: "DEATH_EVENT",
        killerName: killer.name,
        killerColor: killer.color,
      });
    }

    this.checkWinConditions();
  }

  private startMeeting(reason: string, reporter: string) {
    this.phase = "DISCUSSION";
    this.meetingReason = reason;
    this.meetingReporter = reporter;
    this.meetingTally = null;
    this.votes.clear();

    const candidates = Array.from(this.players.values()).map((p) => ({
      ...p,
      role: undefined, // Hide roles in meeting roster
    }));

    this.broadcast({
      type: "MEETING_CALLED",
      reason,
      reporter,
      candidates,
    });

    // Simulate AI bot votes after 3–6 seconds
    const livingBots = Array.from(this.players.values()).filter((p) => p.alive && p.isAi);
    for (const bot of livingBots) {
      setTimeout(() => {
        if (this.phase === "DISCUSSION" && !this.meetingTally) {
          const candidatesToVote = Array.from(this.players.values()).filter((p) => p.alive && p.id !== bot.id);
          const votePick = Math.random() < 0.25 ? null : choose(candidatesToVote)?.id || null;
          this.votes.set(bot.id, votePick);
          this.broadcast({ type: "VOTE_CAST_ACK", voterId: bot.id });
          this.checkVotesComplete();
        }
      }, 2500 + Math.random() * 3000);
    }
  }

  private checkVotesComplete() {
    const livingPlayers = Array.from(this.players.values()).filter((p) => p.alive);
    if (this.votes.size >= livingPlayers.length) {
      this.concludeMeeting();
    }
  }

  private concludeMeeting() {
    const tallyMap = new Map<string, number>();
    for (const targetId of this.votes.values()) {
      const id = targetId || "SKIP";
      tallyMap.set(id, (tallyMap.get(id) || 0) + 1);
    }

    const living = Array.from(this.players.values()).filter((p) => p.alive);
    const ranked = Array.from(tallyMap.entries()).sort((a, b) => b[1] - a[1]);
    const maxVotes = ranked[0]?.[1] || 0;
    const tied = ranked.length > 1 && ranked[0][1] === ranked[1][1];
    const ejectedId = tied || ranked[0]?.[0] === "SKIP" ? null : ranked[0]?.[0];

    const tally: NetVoteTally[] = [
      ...living.map((p) => ({
        targetId: p.id,
        targetName: p.name,
        targetColor: p.color,
        votes: tallyMap.get(p.id) || 0,
        isTop: (tallyMap.get(p.id) || 0) === maxVotes,
      })),
      {
        targetId: null,
        targetName: "SKIP",
        targetColor: null,
        votes: tallyMap.get("SKIP") || 0,
        isTop: (tallyMap.get("SKIP") || 0) === maxVotes,
      },
    ].sort((a, b) => b.votes - a.votes);

    this.meetingTally = tally;

    let verdict = tied ? "Vote tied — no one was ejected" : "Vote skipped — no one was ejected";
    if (ejectedId) {
      const ejected = this.players.get(ejectedId);
      if (ejected) {
        ejected.alive = false;
        verdict = `${ejected.name} was ejected — ${ejected.role === "IMPOSTOR" ? "THE IMPOSTOR" : "CREWMATE"}`;
      }
    }

    this.broadcast({
      type: "MEETING_CONCLUDED",
      tally,
      ejectedId,
      verdict,
      tied,
    });
  }

  private resolveMeeting() {
    this.bodies = [];
    this.flares = [];
    this.meetingTally = null;

    if (!this.checkWinConditions()) {
      this.phase = "CALM";
      this.phaseTime = 15;
      this.killCooldownUntil = 0;
    }
  }

  private checkWinConditions(): boolean {
    if (this.state !== "PLAYING") return false;
    const impostor = Array.from(this.players.values()).find((p) => p.role === "IMPOSTOR");
    const livingCrew = Array.from(this.players.values()).filter((p) => p.role === "CREWMATE" && p.alive).length;

    if (!impostor?.alive) {
      this.endMatch("CREW VICTORY — THE IMPOSTOR WAS EJECTED");
      return true;
    }
    if (this.taskProgress >= 100) {
      this.endMatch("CREW VICTORY — ALL MOON WARDS RESTORED");
      return true;
    }
    if (livingCrew <= 1) {
      this.endMatch("IMPOSTOR VICTORY — CREW AT PARITY");
      return true;
    }
    return false;
  }

  private endMatch(result: string) {
    this.state = "ENDED";
    if (this.loopTimer) {
      clearInterval(this.loopTimer);
      this.loopTimer = null;
    }
    const impostor = Array.from(this.players.values()).find((p) => p.role === "IMPOSTOR");
    this.broadcast({
      type: "MATCH_RESULT",
      result,
      impostorName: impostor?.name || "Unknown",
    });
  }

  private tick() {
    const now = Date.now();
    const dt = Math.min((now - this.lastTick) / 1000, 0.1);
    this.lastTick = now;

    // AI Bots movement
    if (this.phase !== "DISCUSSION") {
      this.tickBots(dt);
    }

    // World timer
    if (this.phase !== "DISCUSSION") {
      this.phaseTime -= dt;
      if (this.phaseTime <= 0) {
        if (this.phase === "CALM") {
          this.phase = "COUNTDOWN";
          this.phaseTime = 3;
        } else if (this.phase === "COUNTDOWN") {
          this.phase = "ORDEAL";
          this.phaseTime = 10;
          this.hazard = choose<Hazard>(["BLACKOUT", "FOG", "MOONGLARE", "ROOTWAKE", "PHANTOMS"]);
          this.killCooldownUntil = 0;
          this.killUsedThisOrdeal = false;
        } else if (this.phase === "ORDEAL") {
          this.phase = "CALM";
          this.phaseTime = 15;
        }
      }
    }

    // Flares
    this.flares = this.flares.filter((f) => (f.life -= dt) > 0);

    // Sync broadcast to clients
    this.syncTimer += dt;
    if (this.syncTimer >= 0.05) { // 20Hz player state sync
      this.syncTimer = 0;
      this.broadcast({
        type: "SYNC_PLAYERS",
        players: Array.from(this.players.values()).map((p) => ({
          id: p.id,
          name: p.name,
          color: p.color,
          hat: p.hat,
          alive: p.alive,
          x: p.x,
          y: p.y,
          vx: p.vx,
          vy: p.vy,
          angle: p.angle,
          flashlight: p.flashlight,
          isHost: p.isHost,
          isAi: p.isAi,
        })),
      });

      this.broadcast({
        type: "SYNC_WORLD",
        phase: this.phase,
        time: Math.max(0, this.phaseTime),
        hazard: this.hazard,
        taskProgress: this.taskProgress,
        bodies: this.bodies,
        flares: this.flares,
      });
    }
  }

  private tickBots(dt: number) {
    for (const bot of this.players.values()) {
      if (!bot.isAi || !bot.alive) continue;
      // Basic smooth wander
      if (Math.random() < dt * 0.4) {
        const angle = Math.random() * Math.PI * 2;
        const speed = this.phase === "ORDEAL" ? 140 : 100;
        bot.vx = Math.cos(angle) * speed;
        bot.vy = Math.sin(angle) * speed;
      }
      const nextX = Math.max(ROOM.left + 36, Math.min(ROOM.right - 36, bot.x + bot.vx * dt));
      const nextY = Math.max(ROOM.top + 48, Math.min(ROOM.bottom - 32, bot.y + bot.vy * dt));
      const next = rootwakeStrength(this.phase, this.hazard, this.phaseTime) > 0.72
        ? resolveRootPosition(nextX, nextY)
        : { x: nextX, y: nextY };
      if (next.x !== nextX) bot.vx *= -0.2;
      if (next.y !== nextY) bot.vy *= -0.2;
      bot.x = next.x;
      bot.y = next.y;

      // Bot auto-repairs in Calm
      if (this.phase === "CALM" && bot.role === "CREWMATE" && Math.random() < dt * 0.08) {
        this.taskProgress = Math.min(100, this.taskProgress + 1.2);
        this.checkWinConditions();
      }

      // Bot Impostor hunting
      if (this.phase === "ORDEAL" && bot.role === "IMPOSTOR" && !this.killUsedThisOrdeal && Date.now() >= this.killCooldownUntil && this.phaseTime < 8.5) {
        const victim = Array.from(this.players.values()).find((p) =>
          p.alive
          && p.role === "CREWMATE"
          && dist(bot, p) < 65
          && (this.hazard !== "ROOTWAKE" || sharesRootCell(bot, p))
        );
        if (victim) {
          this.executeKill(victim, bot);
        }
      }
    }
  }

  broadcast(msg: S2CMessage) {
    const payload = JSON.stringify(msg);
    for (const client of this.clients.values()) {
      if (client.readyState === 1) client.send(payload);
    }
  }

  broadcastExcept(exceptId: string, msg: S2CMessage) {
    const payload = JSON.stringify(msg);
    for (const [id, client] of this.clients.entries()) {
      if (id !== exceptId && client.readyState === 1) client.send(payload);
    }
  }

  sendTo(client: IWebSocketClient, msg: S2CMessage) {
    if (client.readyState === 1) client.send(JSON.stringify(msg));
  }

  destroy() {
    if (this.loopTimer) {
      clearInterval(this.loopTimer);
      this.loopTimer = null;
    }
    for (const client of this.clients.values()) {
      try { client.close(); } catch {}
    }
    this.clients.clear();
    this.players.clear();
  }
}

// Global Room Registry
export class GameServerRegistry {
  private rooms = new Map<string, GameRoom>();

  createRoom(): GameRoom {
    let code: string;
    const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    do {
      code = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join("");
    } while (this.rooms.has(code));

    const room = new GameRoom(code);
    this.rooms.set(code, room);
    return room;
  }

  getRoom(code: string): GameRoom | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  removeRoom(code: string) {
    const room = this.rooms.get(code.toUpperCase());
    if (room) {
      room.destroy();
      this.rooms.delete(code.toUpperCase());
    }
  }

  listOpenRooms(): RoomSummary[] {
    const list: RoomSummary[] = [];
    for (const room of this.rooms.values()) {
      if (room.state === "LOBBY" && room.clients.size > 0) {
        const host = room.players.get(room.hostId) || Array.from(room.players.values())[0];
        list.push({
          code: room.code,
          hostName: host?.name || "Warden",
          hostColor: host?.color || COLORS[0],
          hostHat: host?.hat || "antlers",
          playerCount: room.players.size,
          targetPlayers: room.targetPlayers,
          botFill: room.botFill,
        });
      }
    }
    return list;
  }
}

export const gameRegistry = new GameServerRegistry();
