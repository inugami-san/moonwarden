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
import { availablePlayerColor, availablePlayerName, PLAYER_COLORS as COLORS } from "./palette";
import { EYE_STYLES, isEyeStyle, normalizeEyeStyle, type EyeStyle } from "./appearance";
import {
  ECHO_RANGE,
  ECHO_SECONDS,
  HEARING_RANGE,
  MIRROR_BUMP_COOLDOWN_MS,
  MIRROR_BUMP_DISTANCE,
  MOON_SIGHT_SECONDS,
  nextHazard,
  ordealDuration,
  resolveObstacleMovement,
  resolveObstaclePosition,
} from "./ordeal-rules";
import {
  CALM_SECONDS,
  CENTER,
  STATIONS,
  clampWorldPoint,
  keepInRootCell,
  sharesRootCell,
  type WorldPoint,
} from "./sanctuary-map";
import { planRoute } from "./sanctuary-paths";
import { ejectionVerdict } from "./role-presentation";
import { createMatchLayout } from "./match-layout";
import { PAIR_RITUAL_RANGE, PairedRituals } from "./pair-ritual";
import { clampHollowCount, hollowVictory, ritualProgress, resolveReporterVote, type VoteReceipt, WARD_SETTLE_SECONDS, STEALTH_BODY_DELAY_SECONDS, STEALTH_COOLDOWN_SECONDS, STEALTH_ORDEAL_LOCKOUT } from "./match-rules";

export interface IWebSocketClient {
  send(data: string): void;
  close(): void;
  readyState: number;
  bufferedAmount?: number;
}

const BOT_NAMES = ["Mochi", "Bubbles", "Gloop", "Pebble", "Nori", "Fizz", "Pip", "Wobble"];
const HATS: readonly Hat[] = ["antlers", "hood", "moth", "mooncap"];
const STATION_INTERACTION_RANGE = 104;
const BOT_RITUAL_SECONDS = 2.6;
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

export class GameRoom {
  code: string;
  hostId: string = "";
  state: "LOBBY" | "PLAYING" | "ENDED" = "LOBBY";
  targetPlayers: number = 6;
  botFill: boolean = true;
  hollowCount = 1;
  chaosMoonsway = false;
  private pairedRituals = new PairedRituals();
  layoutSeed = 0;
  stations = [...STATIONS];
  obstacles = createMatchLayout(0).obstacles.slice(0, 8);
  private startingWardens = 0;
  private startingHollows = 1;
  private pendingWardDelta = 0;
  private wardSettleTimer = 0;
  private strikeSpent = new Set<string>();
  private stealthUntil = new Map<string, number>();
  private stealthOrdeal = new Map<string, number>();
  private ordealNumber = 0;
  private pendingBodies: { body: NetBody; at: number }[] = [];
  clients = new Map<string, IWebSocketClient>();
  players = new Map<string, NetPlayer>();

  phase: Phase = "CALM";
  phaseTime: number = CALM_SECONDS;
  hazard: Hazard = "BLACKOUT";
  taskProgress: number = 0;
  bodies: NetBody[] = [];
  flares: NetFlare[] = [];
  killCooldownUntil: number = 0;
  killUsedThisOrdeal: boolean = false;
  ordealSeed = 1;
  abilityUsed = new Set<string>();
  sightUntil = new Map<string, number>();
  private echoes: { x: number; y: number; until: number; nextAt: number }[] = [];
  private footsteps = new Map<string, { x: number; y: number; at: number }>();
  private soundSequence = 0;
  sealedStations = new Set<string>();
  private publicSeals = new Set<string>();
  roundId = 1;
  private stationCompletionSequence = 0;
  completedStations = new Map<string, Set<string>>();
  itemCharges = new Map<string, Record<ItemKind, number>>();
  trueColors = new Map<string, string>();
  private mirrorBumpCooldowns = new Map<string, number>();
  private botRituals = new Map<string, { stationId: string; route: WorldPoint[]; dwell: number }>();
  private botLightUntil = new Map<string, number>();

  meetingReason: string = "";
  meetingReporter: string = "";
  private meetingBodyReporterId: string | null = null;
  private voteReceipts = new Map<string, VoteReceipt>();
  meetingTally: NetVoteTally[] | null = null;
  votes = new Map<string, string | null>();
  chatHistory: NetChatMessage[] = [];

  private loopTimer: NodeJS.Timeout | null = null;
  private lastTick: number = 0;
  private syncTimer: number = 0;
  private worldSyncTimer = 0;
  private meetingTimers = new Set<ReturnType<typeof setTimeout>>();

  constructor(code: string) {
    this.code = code;
  }

  addClient(playerId: string, client: IWebSocketClient, name: string, color: string, hat: Hat, eyeStyle?: EyeStyle): NetPlayer {
    const assignedColor = availablePlayerColor(color, Array.from(this.players.values(), (p) => p.color));
    if (!assignedColor || this.players.size >= COLORS.length) throw new Error("The room is full.");
    const assignedName = availablePlayerName(name, Array.from(this.players.values(), (p) => p.name));
    const isFirst = this.clients.size === 0;
    if (isFirst) this.hostId = playerId;
    this.clients.set(playerId, client);

    const isHost = this.hostId === playerId;
    const player: NetPlayer = {
      id: playerId,
      name: assignedName,
      color: assignedColor,
      hat: HATS.includes(hat) ? hat : choose(HATS),
      eyeStyle: normalizeEyeStyle(eyeStyle),
      alive: true,
      x: CENTER.x + (Math.random() - 0.5) * 240,
      y: CENTER.y + (Math.random() - 0.5) * 150,
      vx: 0,
      vy: 0,
      angle: 0,
      flashlight: false,
      isHost,
      ready: isHost,
    };
    this.players.set(playerId, player);
    this.trueColors.set(playerId, assignedColor);
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
      hollowCount: this.hollowCount,
      chaosMoonsway: this.chaosMoonsway,
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
    if (!this.players.has(playerId)) return;
    this.clients.delete(playerId);
    this.players.delete(playerId);
    this.trueColors.delete(playerId);
    this.completedStations.delete(playerId);
    this.itemCharges.delete(playerId);
    this.botRituals.delete(playerId);
    this.botLightUntil.delete(playerId);
    this.footsteps.delete(playerId);
    this.abilityUsed.delete(playerId);
    this.sightUntil.delete(playerId);
    this.votes.delete(playerId);
    this.voteReceipts.delete(playerId);
    if (this.meetingBodyReporterId === playerId) this.meetingBodyReporterId = null;
    for (const [voter, target] of this.votes) {
      if (target === playerId) {
        this.votes.set(voter, null);
        const receipt = { targetId: null, shifted: false };
        this.voteReceipts.set(voter, receipt);
        const client = this.clients.get(voter);
        if (client) this.sendTo(client, { type: "VOTE_RECEIPT", accepted: true, ...receipt });
      }
    }

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
    } else if (this.state === "LOBBY") {
      this.hollowCount = clampHollowCount(this.hollowCount, this.botFill ? this.targetPlayers : this.players.size);
      this.broadcastLobbyUpdate();
    } else if (this.state === "PLAYING") {
      if (!this.checkWinConditions() && this.phase === "DISCUSSION" && !this.meetingTally) this.checkVotesComplete();
    }
  }

  broadcastLobbyUpdate() {
    this.broadcast({
      type: "LOBBY_UPDATED",
      players: Array.from(this.players.values()),
      targetPlayers: this.targetPlayers,
      botFill: this.botFill,
      hollowCount: this.hollowCount,
      chaosMoonsway: this.chaosMoonsway,
      hostId: this.hostId,
    });
  }

  handleMessage(playerId: string, msg: C2SMessage) {
    const player = this.players.get(playerId);
    if (!player) return;

    switch (msg.type) {
      case "UPDATE_PROFILE":
        if (this.state === "LOBBY") {
          const requestedName = msg.playerName.trim().slice(0, 16);
          if (requestedName && requestedName.toLowerCase() !== "warden") {
            const nameTaken = Array.from(this.players.values()).some(
              (p) => p.id !== player.id && p.name.toLowerCase() === requestedName.toLowerCase(),
            );
            if (!nameTaken) {
              player.name = requestedName;
            } else if (player.name.toLowerCase() !== requestedName.toLowerCase()) {
              this.sendTo(this.clients.get(playerId)!, {
                type: "ERROR_ALERT",
                message: "That callsign is already taken. Choose another name.",
              });
            }
          }
          const color = msg.color.toLowerCase();
          const taken = Array.from(this.players.values()).some((p) => p.id !== player.id && p.color === color);
          if (COLORS.includes(color) && !taken) {
            player.color = color;
            this.trueColors.set(player.id, color);
          }
          else if (taken && player.color !== color) this.sendTo(this.clients.get(playerId)!, { type: "ERROR_ALERT", message: "That slime color is already taken. Choose an available color." });
          if (HATS.includes(msg.hat)) player.hat = msg.hat;
          if (isEyeStyle(msg.eyeStyle)) player.eyeStyle = msg.eyeStyle;
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
          this.targetPlayers = Math.max(this.players.size, 4, Math.min(8, Math.round(msg.targetPlayers)));
          this.botFill = Boolean(msg.botFill);
          if (typeof msg.chaosMoonsway === "boolean") this.chaosMoonsway = msg.chaosMoonsway;
          this.hollowCount = clampHollowCount(msg.hollowCount ?? this.hollowCount, this.botFill ? this.targetPlayers : this.players.size);
          this.broadcastLobbyUpdate();
        }
        break;

      case "START_MATCH":
        if (player.isHost && this.state === "LOBBY") {
          this.botFill = msg.botFill ?? this.botFill;
          if (typeof msg.chaosMoonsway === "boolean") this.chaosMoonsway = msg.chaosMoonsway;
          this.targetPlayers = Math.max(this.players.size, 4, Math.min(8, Math.round(msg.targetPlayers ?? this.targetPlayers)));
          this.hollowCount = clampHollowCount(msg.hollowCount ?? this.hollowCount, this.botFill ? this.targetPlayers : this.players.size);
          this.startMatch(this.botFill, this.targetPlayers);
        }
        break;

      case "PAIR_RITUAL": {
        if (msg.roundId !== this.roundId) break;
        const station = this.stations.find(station => station.id === msg.stationId);
        if (!msg.active) {
          this.pairedRituals.release(player.id);
          player.working = false;
          this.sendTo(this.clients.get(player.id)!, { type: "PAIR_RITUAL_STATE", ritual: { stationId: msg.stationId, progress: 0, participants: 0, roundId: this.roundId } });
        } else if (this.state === "PLAYING" && this.phase !== "DISCUSSION" && player.alive && station
          && dist(player, station) <= PAIR_RITUAL_RANGE && !this.completedStations.get(player.id)?.has(station.id)) {
          this.pairedRituals.hold(player.id, station.id, this.roundId, Date.now());
        }
        break;
      }

      case "PLAYER_INPUT":
        if (this.state === "PLAYING" && player.alive && this.phase !== "DISCUSSION") {
          if (![msg.x, msg.y, msg.vx, msg.vy, msg.angle].every(Number.isFinite)) break;
          if (msg.seq !== undefined && (!Number.isSafeInteger(msg.seq) || msg.seq <= (player.inputSeq ?? -1))) break;
          const { x: nextX, y: nextY } = clampWorldPoint(msg.x, msg.y);
          const impostorPhasing = this.phase === "ORDEAL" && this.hazard === "ROOTWAKE" && player.role === "IMPOSTOR";
          const rootChecked = rootwakeStrength(this.phase, this.hazard, this.phaseTime) > 0.72 && !impostorPhasing
            ? keepInRootCell(player, { x: nextX, y: nextY })
            : { x: nextX, y: nextY };
          const velocityX = rootChecked.x !== nextX || nextX !== msg.x ? 0 : msg.vx;
          const velocityY = rootChecked.y !== nextY || nextY !== msg.y ? 0 : msg.vy;
          const inputSpeed = Math.hypot(velocityX, velocityY);
          const speedScale = inputSpeed > 184 ? 184 / inputSpeed : 1;
          const next = impostorPhasing
            ? { ...rootChecked, vx: velocityX * speedScale, vy: velocityY * speedScale }
            : resolveObstacleMovement(rootChecked.x, rootChecked.y, velocityX, velocityY, 22, this.obstacles);
          player.x = next.x;
          player.y = next.y;
          player.vx = next.vx;
          player.vy = next.vy;
          player.inputSeq = msg.seq;
          player.angle = msg.angle;
          player.flashlight = msg.flashlight;
          player.working = Boolean(msg.working);
          this.maybeFootstep(player);
          this.checkMirrorPoolBumps();
        }
        break;

      case "USE_ITEM": {
        let accepted = false;
        if (this.state === "PLAYING" && player.alive && this.phase === "ORDEAL") {
          const charges = this.itemCharges.get(player.id);
          if (charges && charges[msg.item] > 0) {
            accepted = true;
            charges[msg.item] -= 1;
            if (msg.item === "FLARE") {
              const flare: NetFlare = { x: player.x, y: player.y, life: 5, owner: player.id };
              this.flares.push(flare);
              this.broadcast({ type: "FLARE_SPAWNED", flare });
            }
          }
        }
        this.syncGear(player.id, accepted, { item: msg.item });
        break;
      }

      case "USE_ABILITY": {
        const valid = this.state === "PLAYING" && player.alive && player.role === "IMPOSTOR"
          && this.phase === "ORDEAL" && msg.roundId === this.roundId && !this.abilityUsed.has(playerId)
          && ["MOON_SIGHT", "ECHO_LURE"].includes(msg.ability) && [msg.x, msg.y].every(Number.isFinite);
        if (valid) {
          this.abilityUsed.add(playerId);
          if (msg.ability === "MOON_SIGHT") this.sightUntil.set(playerId, Date.now() + Math.min(MOON_SIGHT_SECONDS, this.phaseTime) * 1000);
          else {
            const distance = Math.max(1, dist(player, msg));
            const scale = Math.min(1, ECHO_RANGE / distance);
            let point = clampWorldPoint(player.x + (msg.x - player.x) * scale, player.y + (msg.y - player.y) * scale);
            if (this.hazard === "ROOTWAKE") point = keepInRootCell(player, point);
            this.echoes.push({ ...point, until: Date.now() + ECHO_SECONDS * 1000, nextAt: 0 });
          }
        }
        this.syncAbility(playerId, valid);
        break;
      }

      case "TRIGGER_KILL": {
        let accepted = false;
        const stealth = msg.style === "STEALTH";
        const stealthReady = Date.now() >= (this.stealthUntil.get(playerId) ?? 0) && this.ordealNumber >= (this.stealthOrdeal.get(playerId) ?? 0);
        if (this.state === "PLAYING" && player.role === "IMPOSTOR" && player.alive && this.phase === "ORDEAL" && !this.strikeSpent.has(playerId) && (!stealth || stealthReady)) {
          const victim = this.players.get(msg.victimId);
          if (
            victim
            && victim.alive
            && victim.role !== "IMPOSTOR"
            && dist(player, victim) < 84
          ) {
            accepted = true;
            this.executeKill(victim, player, stealth);
          }
        }
        this.sendTo(this.clients.get(playerId)!, { type: "KILL_RESULT", accepted, ...this.strikeState(playerId) });
        break;
      }

      case "TRIGGER_REPORT":
        if (this.state === "PLAYING" && player.alive && this.phase !== "DISCUSSION") {
          const nearbyBody = this.bodies.find((b) => dist(player, b) < 96);
          const atBell = dist(player, CENTER) < 92 && this.phase === "CALM";
          if (nearbyBody) {
            this.startMeeting(`${nearbyBody.name.toUpperCase()} WAS FOUND AS A JELLY PUDDLE`, player.name, player.id);
          } else if (atBell) {
            this.startMeeting("EMERGENCY MEETING CALLED", player.name);
          }
        }
        break;

      case "TASK_UPDATE":
        this.completeRitual(player, msg.stationId, msg.reward, msg.roundId);
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
        this.castVote(player.id, msg.targetId);
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

  private completeRitual(player: NetPlayer, stationId: string, reward: ItemKind, roundId = this.roundId) {
    player.working = false;
    const station = this.stations.find(station => station.id === stationId);
    const completed = this.completedStations.get(player.id);
    const charges = this.itemCharges.get(player.id);
    if (this.state !== "PLAYING" || !player.alive || this.phase === "DISCUSSION" || roundId !== this.roundId
      || !station || station.reward !== reward || dist(player, station) > STATION_INTERACTION_RANGE
      || !completed || !charges || completed.has(stationId)) {
      this.syncGear(player.id, false, { stationId });
      return false;
    }

    completed.add(stationId);
    this.publicSeals.add(stationId);
    charges[reward] = Math.min(3, charges[reward] + 1);
    // A shared seal advances the ward only once, but never takes another player's personal rite away.
    const hollow = player.role === "IMPOSTOR";
    const wardens = [...this.players.values()].filter(p => p.alive && p.role === "CREWMATE").length;
    const progressGain = hollow || !this.sealedStations.has(stationId)
      ? ritualProgress(wardens, this.phase === "ORDEAL", hollow, this.startingHollows) : 0;
    if (progressGain) {
      if (!hollow) this.sealedStations.add(stationId);
      this.pendingWardDelta += progressGain;
    }
    this.syncGear(player.id, true, { stationId, wardProgressGain: progressGain });
    // No player identity, role, reward, or fake-task flag in the public completion cue.
    this.broadcast({ type: "STATION_COMPLETED", stationId, roundId: this.roundId, sequence: ++this.stationCompletionSequence });
    // The public gauge changes on the same clock for every role, not at the
    // instant a visible player finishes a shrine. No false progress is shown.
    return true;
  }

  private syncGear(playerId: string, accepted: boolean, detail: { item?: ItemKind; stationId?: string; wardProgressGain?: number }) {
    const charges = this.itemCharges.get(playerId);
    const client = this.clients.get(playerId);
    if (!charges || !client) return;
    this.sendTo(client, {
      type: "GEAR_SYNC", charges: { ...charges }, accepted, roundId: this.roundId, ...detail,
      completedStations: Array.from(this.completedStations.get(playerId) ?? []),
      stationCompleted: detail.stationId ? this.completedStations.get(playerId)?.has(detail.stationId) : undefined,
    });
  }

  private syncAbility(playerId: string, accepted = true) {
    const client = this.clients.get(playerId);
    if (client) this.sendTo(client, { type: "ABILITY_STATE", accepted, used: this.abilityUsed.has(playerId), sightRemainingMs: this.phase === "ORDEAL" ? Math.max(0, (this.sightUntil.get(playerId) ?? 0) - Date.now()) : 0, roundId: this.roundId });
  }

  private soundAt(x: number, y: number, kind?: "RITUAL") {
    // Real footsteps and lures deliberately have the same public payload. No role/source leak.
    const cue = { id: `${this.roundId}-${++this.soundSequence}`, x, y, expiresAt: Date.now() + 1000, ...(kind ? { kind } : {}) };
    for (const [id, client] of this.clients) {
      const listener = this.players.get(id);
      if (listener?.alive && dist(listener, cue) <= HEARING_RANGE && (this.phase !== "ORDEAL" || this.hazard !== "ROOTWAKE" || sharesRootCell(listener, cue))) this.sendTo(client, { type: "SOUND_CUE", cue });
    }
  }

  private maybeFootstep(player: NetPlayer) {
    if (this.phase !== "ORDEAL" || !player.alive) return;
    const previous = this.footsteps.get(player.id);
    if (!previous) { this.footsteps.set(player.id, { x: player.x, y: player.y, at: Date.now() }); return; }
    if (Date.now() - previous.at < 500 || dist(previous, player) < 34) return;
    this.footsteps.set(player.id, { x: player.x, y: player.y, at: Date.now() });
    this.soundAt(player.x, player.y);
  }

  private startMatch(botFill: boolean, targetCount: number) {
    this.pairedRituals.clear();
    this.state = "PLAYING";
    this.phase = "CALM";
    this.phaseTime = CALM_SECONDS;
    this.announceNextOrdeal();
    this.taskProgress = 0;
    this.pendingWardDelta = 0;
    this.wardSettleTimer = 0;
    this.strikeSpent.clear();
    this.stealthUntil.clear(); this.stealthOrdeal.clear(); this.pendingBodies = []; this.ordealNumber = 0;
    this.layoutSeed = Math.floor(Math.random() * 4294967296);
    const layout = createMatchLayout(this.layoutSeed);
    this.stations = layout.stations; this.obstacles = layout.obstacles;
    this.bodies = [];
    this.flares = [];
    this.killCooldownUntil = 0;
    this.killUsedThisOrdeal = false;
    this.abilityUsed.clear();
    this.sightUntil.clear();
    this.echoes = [];
    this.footsteps.clear();
    this.roundId = 1;
    this.stationCompletionSequence = 0;
    this.sealedStations.clear();
    this.publicSeals.clear();
    this.completedStations.clear();
    this.itemCharges.clear();
    this.botRituals.clear();
    this.botLightUntil.clear();
    this.syncTimer = 0;
    this.worldSyncTimer = 0;
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
          name: availablePlayerName(BOT_NAMES[botIndex % BOT_NAMES.length], Array.from(this.players.values(), (p) => p.name)),
          color: availablePlayerColor("", Array.from(this.players.values(), (p) => p.color))!,
          hat: HATS[botIndex % HATS.length],
          eyeStyle: EYE_STYLES[botIndex % EYE_STYLES.length],
          alive: true,
          x: CENTER.x + Math.cos(angle) * 240,
          y: CENTER.y + Math.sin(angle) * 150,
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

    this.trueColors.clear();
    this.mirrorBumpCooldowns.clear();
    // Assign the configured Hollow team, then disclose allies only to that team.
    const playerList = Array.from(this.players.values());
    this.hollowCount = clampHollowCount(this.hollowCount, playerList.length);
    const shuffled = [...playerList];
    for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
    const hollowIds = new Set(shuffled.slice(0, this.hollowCount).map(p => p.id));
    this.startingHollows = this.hollowCount;
    this.startingWardens = playerList.length - this.hollowCount;
    for (const p of playerList) {
      p.role = hollowIds.has(p.id) ? "IMPOSTOR" : "CREWMATE";
      this.trueColors.set(p.id, p.color);
    }

    // Notify each human client privately with their assigned role
    for (const [id, client] of this.clients.entries()) {
      const p = this.players.get(id);
      if (!p) continue;
      this.sendTo(client, {
        type: "MATCH_STARTED",
        role: p.role || "CREWMATE",
        layoutSeed: this.layoutSeed,
        hollowCount: this.hollowCount,
        chaosMoonsway: this.chaosMoonsway,
        ...(p.role === "IMPOSTOR" ? { hollowAllies: [...hollowIds] } : {}),
        players: playerList.map((player) => ({
          ...player,
          role: player.id === id ? player.role : undefined, // Keep role secret!
        })),
      });
    }

    this.lastTick = Date.now();
    this.broadcastWorld();
    this.loopTimer = setInterval(() => this.tick(), 50); // 20Hz server tick
    this.loopTimer.unref?.();
  }

  private restoreTrueColors() {
    let changed = false;
    for (const p of this.players.values()) {
      const trueColor = this.trueColors.get(p.id);
      if (trueColor && p.color !== trueColor) {
        p.color = trueColor;
        changed = true;
      }
    }
    this.mirrorBumpCooldowns.clear();
    if (changed) {
      this.broadcast({
        type: "SYNC_PLAYERS",
        players: Array.from(this.players.values()).map((p) => ({ ...p, role: undefined })),
      });
    }
  }

  private checkMirrorPoolBumps(now = Date.now()) {
    if (this.phase !== "ORDEAL" || this.hazard !== "MIRROR_POOL") return;
    const living = Array.from(this.players.values()).filter((p) => p.alive);
    let swapped = false;
    for (let i = 0; i < living.length; i++) {
      for (let j = i + 1; j < living.length; j++) {
        const a = living[i];
        const b = living[j];
        if (dist(a, b) > MIRROR_BUMP_DISTANCE) continue;
        const pairKey = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
        if (now < (this.mirrorBumpCooldowns.get(pairKey) ?? 0)) continue;
        this.mirrorBumpCooldowns.set(pairKey, now + MIRROR_BUMP_COOLDOWN_MS);
        if (!this.trueColors.has(a.id)) this.trueColors.set(a.id, a.color);
        if (!this.trueColors.has(b.id)) this.trueColors.set(b.id, b.color);
        const temp = a.color;
        a.color = b.color;
        b.color = temp;
        swapped = true;
      }
    }
    if (swapped) {
      this.broadcast({
        type: "SYNC_PLAYERS",
        players: Array.from(this.players.values()).map((p) => ({ ...p, role: undefined })),
      });
    }
  }

  private resetStationsForRound() {
    this.pairedRituals.clear();
    this.roundId += 1;
    this.sealedStations.clear();
    this.publicSeals.clear();
    for (const completed of this.completedStations.values()) completed.clear();
    this.botRituals.clear();
    for (const id of this.clients.keys()) this.syncGear(id, true, {});
    // Earned gear and team progress carry forward; only the shrine locks reset.
  }

  private announceNextOrdeal() {
    this.hazard = nextHazard(this.hazard);
    this.ordealSeed = Math.floor(Math.random() * 4294967296);
  }

  private strikeState(id: string) {
    return { spent: this.strikeSpent.has(id), stealthRemainingMs: Math.max(0, (this.stealthUntil.get(id) ?? 0) - Date.now()), stealthOrdealsLeft: Math.max(0, (this.stealthOrdeal.get(id) ?? 0) - this.ordealNumber) };
  }

  private executeKill(victim: NetPlayer, killer: NetPlayer, stealth = false) {
    victim.alive = false;
    victim.vx = 0;
    victim.vy = 0;
    victim.working = false;
    this.killUsedThisOrdeal = true;
    this.strikeSpent.add(killer.id);
    if (stealth) { this.stealthUntil.set(killer.id, Date.now() + STEALTH_COOLDOWN_SECONDS * 1000); this.stealthOrdeal.set(killer.id, this.ordealNumber + STEALTH_ORDEAL_LOCKOUT); }
    this.killCooldownUntil = Date.now() + KILL_COOLDOWN_MS;

    const body: NetBody = {
      id: `body-${victim.id}`,
      x: victim.x,
      y: victim.y,
      color: victim.color,
      name: victim.name,
      age: 0,
    };
    if (stealth) this.pendingBodies.push({ body: { ...body, delayed: true }, at: Date.now() + STEALTH_BODY_DELAY_SECONDS * 1000 });
    else { this.bodies.push(body); this.broadcast({ type: "BODY_SPAWNED", body }); }

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

  private startMeeting(reason: string, reporter: string, bodyReporterId: string | null = null) {
    this.pairedRituals.clear();
    this.clearMeetingTimers();
    this.restoreTrueColors();
    this.phase = "DISCUSSION";
    this.meetingReason = reason;
    this.meetingReporter = reporter;
    this.meetingBodyReporterId = bodyReporterId;
    this.meetingTally = null;
    this.votes.clear();
    this.voteReceipts.clear();
    for (const player of this.players.values()) {
      player.vx = 0;
      player.vy = 0;
      player.flashlight = false;
      player.working = false;
    }

    const candidates = Array.from(this.players.values()).map((p) => ({
      ...p,
      role: undefined, // Hide roles in meeting roster
    }));

    this.broadcast({
      type: "MEETING_CALLED",
      reason,
      reporter,
      bodyReporterId,
      candidates,
    });

    // Simulate AI bot votes after 3–6 seconds
    const livingBots = Array.from(this.players.values()).filter((p) => p.alive && p.isAi);
    for (const bot of livingBots) {
      this.scheduleMeeting(() => {
        if (this.phase === "DISCUSSION" && !this.meetingTally) {
          const candidatesToVote = Array.from(this.players.values()).filter((p) => p.alive && p.id !== bot.id);
          const votePick = Math.random() < 0.25 ? null : choose(candidatesToVote)?.id || null;
          this.castVote(bot.id, votePick);
        }
      }, 2500 + Math.random() * 3000);
    }
    this.scheduleMeeting(() => {
      if (this.phase !== "DISCUSSION" || this.meetingTally) return;
      for (const player of this.players.values()) {
        if (player.alive && !this.votes.has(player.id)) this.votes.set(player.id, null);
      }
      this.concludeMeeting();
    }, 45_000);
  }

  private castVote(playerId: string, targetId: string | null) {
    const player = this.players.get(playerId);
    const client = this.clients.get(playerId);
    const reply = (accepted: boolean, receipt: VoteReceipt) => {
      if (client) this.sendTo(client, { type: "VOTE_RECEIPT", accepted, ...receipt });
    };
    if (this.phase !== "DISCUSSION" || !player?.alive || this.meetingTally) return;
    if (this.votes.has(playerId)) {
      reply(true, this.voteReceipts.get(playerId) ?? { targetId: this.votes.get(playerId) ?? null, shifted: false });
      return; // A repeated click or packet cannot reroll a ballot.
    }
    if (targetId !== null && !this.players.get(targetId)?.alive) {
      reply(false, { targetId: null, shifted: false });
      return;
    }
    const livingIds = [...this.players.values()].filter(candidate => candidate.alive).map(candidate => candidate.id);
    const receipt = resolveReporterVote(playerId, targetId, livingIds, this.meetingBodyReporterId, Math.random, this.chaosMoonsway);
    this.votes.set(playerId, receipt.targetId);
    this.voteReceipts.set(playerId, receipt);
    reply(true, receipt); // Private; public acknowledgements never disclose targets.
    this.broadcast({ type: "VOTE_CAST_ACK", voterId: playerId });
    this.checkVotesComplete();
  }

  private scheduleMeeting(callback: () => void, delay: number) {
    const timer = setTimeout(() => {
      this.meetingTimers.delete(timer);
      if (this.state === "PLAYING") callback();
    }, delay);
    timer.unref?.();
    this.meetingTimers.add(timer);
  }

  private clearMeetingTimers() {
    for (const timer of this.meetingTimers) clearTimeout(timer);
    this.meetingTimers.clear();
  }

  private checkVotesComplete() {
    const livingPlayers = Array.from(this.players.values()).filter((p) => p.alive);
    if (this.votes.size >= livingPlayers.length) {
      this.concludeMeeting();
    }
  }

  private concludeMeeting() {
    this.clearMeetingTimers();
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
        targetEyeStyle: normalizeEyeStyle(p.eyeStyle),
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
        verdict = ejectionVerdict(ejected.name, ejected.role ?? "CREWMATE");
      }
    }

    this.broadcast({
      type: "MEETING_CONCLUDED",
      tally,
      ejectedId,
      verdict,
      tied,
    });
    this.scheduleMeeting(() => this.resolveMeeting(), 7_000);
  }

  private resolveMeeting() {
    this.clearMeetingTimers();
    this.meetingBodyReporterId = null;
    this.voteReceipts.clear();
    this.bodies = [];
    this.pendingBodies = [];
    this.flares = [];
    this.meetingTally = null;

    if (!this.checkWinConditions()) {
      this.phase = "CALM";
      this.phaseTime = CALM_SECONDS;
      this.announceNextOrdeal();
      this.killCooldownUntil = 0;
      this.resetStationsForRound();
      this.broadcastWorld();
    }
  }

  private checkWinConditions(): boolean {
    if (this.state !== "PLAYING") return false;
    const hollows = Array.from(this.players.values()).filter((p) => p.role === "IMPOSTOR" && p.alive);
    const livingCrew = Array.from(this.players.values()).filter((p) => p.role === "CREWMATE" && p.alive).length;

    if (hollows.length === 0) {
      this.endMatch("CREW VICTORY — ALL HOLLOWS WERE EXPOSED");
      return true;
    }
    if (this.taskProgress >= 100) {
      this.endMatch("CREW VICTORY — ALL MOON WARDS RESTORED");
      return true;
    }
    if (hollowVictory(livingCrew, hollows.length, this.startingWardens, this.startingHollows)) {
      this.endMatch("IMPOSTOR VICTORY — CREW AT PARITY");
      return true;
    }
    return false;
  }

  private endMatch(result: string) {
    this.clearMeetingTimers();
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

  public stepIfPlaying() {
    if (this.state === "PLAYING" && Date.now() - this.lastTick >= 40) {
      this.tick();
    }
  }

  private tick() {
    if (this.state !== "PLAYING") return;
    const now = Date.now();
    const elapsed = Math.max(0, Math.min((now - this.lastTick) / 1000, 60));
    const dt = Math.min(elapsed, 0.1);
    this.lastTick = now;
    if (this.phase !== "DISCUSSION") {
      this.wardSettleTimer += elapsed;
      if (this.wardSettleTimer >= WARD_SETTLE_SECONDS) {
        this.wardSettleTimer %= WARD_SETTLE_SECONDS;
        if (this.settleWards()) return;
      }
      const due = this.pendingBodies.filter(entry => entry.at <= now);
      this.pendingBodies = this.pendingBodies.filter(entry => entry.at > now);
      for (const entry of due) { this.bodies.push(entry.body); this.broadcast({ type: "BODY_SPAWNED", body: entry.body }); }
    }

    // AI Bots movement
    if (this.phase !== "DISCUSSION") {
      this.tickBots(dt);
      this.tickPairedRituals(dt, now);
    }
    if (this.state !== "PLAYING") return;

    this.checkMirrorPoolBumps(now);

    const previousPhase = this.phase;
    // World timer
    if (this.phase !== "DISCUSSION") {
      this.phaseTime -= elapsed;
      while (this.phaseTime <= 0) {
        if (this.phase === "CALM") {
          this.phase = "COUNTDOWN";
          this.phaseTime += 3;
        } else if (this.phase === "COUNTDOWN") {
          this.restoreTrueColors();
          this.phase = "ORDEAL";
          this.phaseTime += ordealDuration(this.hazard);
          this.abilityUsed.clear();
          this.sightUntil.clear();
          this.footsteps.clear();
          this.killCooldownUntil = 0;
          this.killUsedThisOrdeal = false;
          this.strikeSpent.clear(); this.ordealNumber += 1;
        } else if (this.phase === "ORDEAL") {
          this.phase = "CALM";
          this.phaseTime += CALM_SECONDS;
          this.announceNextOrdeal();
          this.resetStationsForRound();
        }
      }
    }

    // Flares
    if (this.phase !== "ORDEAL") { this.echoes = []; this.sightUntil.clear(); }
    this.echoes = this.echoes.filter(echo => echo.until > now);
    for (const echo of this.echoes) {
      if (now >= echo.nextAt) { this.soundAt(echo.x, echo.y); echo.nextAt = now + 360; }
    }
    this.flares = this.flares.filter((f) => (f.life -= elapsed) > 0);
    for (const body of this.bodies) body.age += elapsed;

    // Sync broadcast to clients
    this.syncTimer += elapsed;
    if (this.syncTimer >= 0.05) { // 20Hz player state sync
      this.syncTimer = 0;
      this.broadcast({
        type: "SYNC_MOVEMENT",
        serverTime: now,
        players: Array.from(this.players.values()).map((p) => ({
          id: p.id,
          alive: p.alive,
          x: p.x,
          y: p.y,
          vx: p.vx,
          vy: p.vy,
          angle: p.angle,
          flashlight: p.flashlight,
          ...(p.working ? { working: true } : {}),
          inputSeq: p.inputSeq,
        })),
      });
    }
    this.worldSyncTimer += elapsed;
    if (previousPhase !== this.phase || this.worldSyncTimer >= 0.2) this.broadcastWorld();
  }

  private settleWards() {
    this.taskProgress = Math.max(0, Math.min(100, Math.round((this.taskProgress + this.pendingWardDelta) * 10) / 10));
    this.pendingWardDelta = 0;
    return this.checkWinConditions();
  }

  private broadcastWorld() {
    this.worldSyncTimer = 0;
    this.broadcast({ type: "SYNC_WORLD", serverTime: Date.now(), roundId: this.roundId, ordealSeed: this.ordealSeed, phase: this.phase, time: Math.max(0, this.phaseTime), hazard: this.hazard, taskProgress: this.taskProgress, bodies: this.bodies, flares: this.flares, completedStations: Array.from(this.publicSeals) });
    for (const player of this.players.values()) if (player.role === "IMPOSTOR") { this.syncAbility(player.id); const client = this.clients.get(player.id); if (client) this.sendTo(client, { type: "STRIKE_STATE", ...this.strikeState(player.id) }); }
  }

  private tickBots(dt: number) {
    for (const bot of this.players.values()) {
      if (!bot.isAi || !bot.alive) continue;
      // Calm is useful preparation: travel to a real shrine, stop, and finish a visible rite.
      const preparing = this.phase === "CALM" || this.phase === "COUNTDOWN";
      const doingRitual = preparing && this.tickBotRitual(bot, dt);
      if (this.state !== "PLAYING") return;
      if (!preparing) {
        bot.working = false;
        const ritual = this.botRituals.get(bot.id);
        if (ritual) ritual.dwell = 0;
      }
      if (!doingRitual && (Math.hypot(bot.vx, bot.vy) < 1 || Math.random() < dt * 0.4)) {
        const angle = Math.random() * Math.PI * 2;
        const speed = this.phase === "ORDEAL" ? 140 : 100;
        bot.vx = Math.cos(angle) * speed;
        bot.vy = Math.sin(angle) * speed;
      }
      const { x: nextX, y: nextY } = clampWorldPoint(bot.x + bot.vx * dt, bot.y + bot.vy * dt);
      const impostorPhasing = this.phase === "ORDEAL" && this.hazard === "ROOTWAKE" && bot.role === "IMPOSTOR";
      const rootChecked = rootwakeStrength(this.phase, this.hazard, this.phaseTime) > 0.72 && !impostorPhasing
        ? keepInRootCell(bot, { x: nextX, y: nextY })
        : { x: nextX, y: nextY };
      const next = impostorPhasing ? rootChecked : resolveObstaclePosition(rootChecked.x, rootChecked.y, 22, this.obstacles);
      if (next.x !== nextX) bot.vx *= -0.2;
      if (next.y !== nextY) bot.vy *= -0.2;
      bot.x = next.x;
      bot.y = next.y;
      if (Math.hypot(bot.vx, bot.vy) > 1) bot.angle = Math.atan2(bot.vy, bot.vx);
      this.maybeFootstep(bot);
      this.tickBotGear(bot);

      // Bot Impostor hunting
      if (this.phase === "ORDEAL" && bot.role === "IMPOSTOR" && !this.strikeSpent.has(bot.id) && this.phaseTime < ordealDuration(this.hazard) - 1.5) {
        const victim = Array.from(this.players.values()).find((p) =>
          p.alive
          && p.role === "CREWMATE"
          && dist(bot, p) < 65
        );
        if (victim) {
          this.executeKill(victim, bot);
        }
      }
    }
  }

  private tickBotRitual(bot: NetPlayer, dt: number) {
    const completed = this.completedStations.get(bot.id);
    if (!completed) return false;
    let ritual = this.botRituals.get(bot.id);
    if (!ritual || completed.has(ritual.stationId)) {
      const target = this.stations.filter(station => !completed.has(station.id)).sort((a, b) =>
        Number(this.sealedStations.has(a.id)) - Number(this.sealedStations.has(b.id)) || dist(bot, a) - dist(bot, b))[0];
      if (!target) { bot.working = false; return false; }
      ritual = { stationId: target.id, route: planRoute(bot, target, false, this.obstacles), dwell: 0 };
      this.botRituals.set(bot.id, ritual);
    }
    const station = this.stations.find(station => station.id === ritual.stationId)!;
    if (dist(bot, station) <= 82) {
      bot.vx = 0;
      bot.vy = 0;
      bot.working = true;
      if ([...this.pairedRituals.intents].some(([id, intent]) => id !== bot.id && intent.stationId === station.id && intent.until > Date.now())) {
        this.pairedRituals.hold(bot.id, station.id, this.roundId, Date.now());
        return true;
      }
      ritual.dwell += Math.min(dt, 0.1);
      if (ritual.dwell >= BOT_RITUAL_SECONDS) {
        this.completeRitual(bot, station.id, station.reward);
        this.botRituals.delete(bot.id);
      }
      return true;
    }
    ritual.dwell = 0;
    bot.working = false;
    while (ritual.route.length > 1 && dist(bot, ritual.route[0]) < 12) ritual.route.shift();
    const next = ritual.route[0];
    if (!next) { bot.vx = 0; bot.vy = 0; return true; }
    const distance = Math.max(1, dist(bot, next));
    const speed = Math.min(130, distance / Math.max(dt, 0.001));
    bot.vx = (next.x - bot.x) / distance * speed;
    bot.vy = (next.y - bot.y) / distance * speed;
    return true;
  }

  private tickPairedRituals(dt: number, now: number) {
    const actors = [...this.players.values()].filter(player => player.isAi || this.clients.get(player.id)?.readyState === 1);
    const result = this.pairedRituals.tick(actors, this.stations, (id, stationId) => this.completedStations.get(id)?.has(stationId) ?? true, this.roundId, now, dt);
    for (const { playerId, ...ritual } of result.updates) {
      const client = this.clients.get(playerId);
      if (client) this.sendTo(client, { type: "PAIR_RITUAL_STATE", ritual });
    }
    for (const sound of result.sounds) this.soundAt(sound.x, sound.y, "RITUAL");
    for (const completion of result.completions) {
      const actor = this.players.get(completion.playerId), station = this.stations.find(station => station.id === completion.stationId);
      if (actor && station) this.completeRitual(actor, station.id, station.reward);
    }
  }

  private tickBotGear(bot: NetPlayer) {
    const now = Date.now();
    if (this.phase !== "ORDEAL") {
      bot.flashlight = false;
      this.botLightUntil.delete(bot.id);
      return;
    }
    const charges = this.itemCharges.get(bot.id);
    const usedLight = this.botLightUntil.has(bot.id);
    bot.flashlight = now < (this.botLightUntil.get(bot.id) ?? 0);
    if (!charges || usedLight || this.phaseTime > ordealDuration(this.hazard) - 1.5) return;
    if ((this.hazard === "BLACKOUT" || this.hazard === "FOG") && charges.FLASHLIGHT > 0) {
      charges.FLASHLIGHT -= 1;
      bot.flashlight = true;
      this.botLightUntil.set(bot.id, now + 4000);
    } else if (charges.FLARE > 0 && (this.hazard === "BLACKOUT" || this.hazard === "FOG" || this.hazard === "MOONGLARE")) {
      charges.FLARE -= 1;
      this.botLightUntil.set(bot.id, now);
      const flare = { x: bot.x, y: bot.y, life: 5, owner: bot.id };
      this.flares.push(flare);
      this.broadcast({ type: "FLARE_SPAWNED", flare });
    }
  }

  broadcast(msg: S2CMessage) {
    const payload = JSON.stringify(msg);
    for (const client of this.clients.values()) {
      if (msg.type === "SYNC_MOVEMENT" && (client.bufferedAmount ?? 0) > 32_768) continue;
      this.sendPayload(client, payload);
    }
  }

  broadcastExcept(exceptId: string, msg: S2CMessage) {
    const payload = JSON.stringify(msg);
    for (const [id, client] of this.clients.entries()) {
      if (id !== exceptId) this.sendPayload(client, payload);
    }
  }

  sendTo(client: IWebSocketClient, msg: S2CMessage) {
    this.sendPayload(client, JSON.stringify(msg));
  }

  private sendPayload(client: IWebSocketClient, payload: string) {
    try {
      if (client?.readyState === 1) client.send(payload);
    } catch {
      // One disconnected peer must not interrupt the room's entire broadcast.
    }
  }

  destroy() {
    this.clearMeetingTimers();
    this.state = "ENDED";
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

  tickActiveRooms() {
    for (const room of this.rooms.values()) {
      room.stepIfPlaying();
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
          hostEyeStyle: normalizeEyeStyle(host?.eyeStyle),
          playerCount: room.players.size,
          targetPlayers: room.targetPlayers,
          botFill: room.botFill,
          hollowCount: room.hollowCount,
          chaosMoonsway: room.chaosMoonsway,
        });
      }
    }
    return list;
  }
}

const globalForMoonwarden = globalThis as unknown as {
  __moonwardenRegistry?: GameServerRegistry;
};

export const gameRegistry =
  globalForMoonwarden.__moonwardenRegistry ||
  (globalForMoonwarden.__moonwardenRegistry = new GameServerRegistry());
