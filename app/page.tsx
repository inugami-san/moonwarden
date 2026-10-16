"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MultiplayerClient, type MultiplayerState } from "./network";
import type { NetMovement, NetPlayer, S2CMessage } from "../server/game-types";
import { MovementBuffer } from "./movement";
import { slimeOutline, slimeSkin } from "./slime-art";
import { drawForestSanctum } from "./sanctum-art";
import { PLAYER_COLORS as COLORS } from "../server/palette";

type Role = "CREWMATE" | "IMPOSTOR";
type RoleChoice = Role | "RANDOM";
type Phase = "CALM" | "COUNTDOWN" | "ORDEAL" | "DISCUSSION";
type Hazard = "BLACKOUT" | "FOG" | "MOONGLARE" | "ROOTWAKE" | "PHANTOMS";
type ItemKind = "FLASHLIGHT" | "FLARE" | "SONAR";
type Hat = "antlers" | "hood" | "moth" | "mooncap";
type PuzzleKind = "MATH" | "LINK";

type Player = {
  id: string;
  name: string;
  role: Role;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle?: number;
  color: string;
  hat: Hat;
  alive: boolean;
  ai: boolean;
  targetX: number;
  targetY: number;
  thinkAt: number;
  atStation: number;
  flashlight: boolean;
  flareDropped: boolean;
  gearCharges: Record<ItemKind, number>;
};

type Station = {
  x: number;
  y: number;
  side: "top" | "right" | "bottom" | "left";
  label: string;
  pulse: number;
  cooldown: number;
  completed: boolean;
  completedAt?: number;
  rootClosure?: number;
  reward: ItemKind;
  puzzle?: PuzzleKind;
};

type Body = { id: string; x: number; y: number; color: string; name: string; age: number };
type Flare = { x: number; y: number; life: number; owner: string };

type Snapshot = {
  phase: Phase;
  time: number;
  hazard: Hazard;
  taskProgress: number;
  selectedItem: ItemKind;
  charges: Record<ItemKind, number>;
  role: Role;
  living: number;
  total: number;
  canKill: boolean;
  killCooldown: number;
  killSpent: boolean;
  canUseMoonSight: boolean;
  moonSightActive: boolean;
  canReport: boolean;
  taskPrompt: boolean;
  taskMode: "PUZZLE" | "HOLD" | null;
  stationStatus: { label: string; completed: boolean; reward: ItemKind } | null;
  rewardNotice: { item: ItemKind; station: string } | null;
  humanAlive: boolean;
  message: string;
  localPlayerId: string;
};

type TaskPuzzle = {
  stationIndex: number;
  stationLabel: string;
  reward: ItemKind;
  kind: PuzzleKind;
  prompt: string;
  sequence?: string[];
  options: string[];
  answerIndex: number;
  error?: string;
};

type DeathReveal = {
  killerName: string;
  killerColor: string;
};

type KillNotice = {
  key: string;
};

type ChatMessage = {
  id: string;
  playerId: string | null;
  playerName: string;
  playerColor: string | null;
  text: string;
  system?: boolean;
};

type VoteTally = {
  targetId: string | null;
  targetName: string;
  targetColor: string | null;
  votes: number;
  isTop: boolean;
};

type Meeting = {
  reason: string;
  reporter: string;
  candidates: Player[];
  tally?: VoteTally[];
  ejectedId?: string | null;
  verdict?: string;
  tied?: boolean;
  /** Each living bot's current prime suspect, derived from what it witnessed. */
  accusations: Record<string, string | null>;
};

type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string };
type RootBarrier = { x: number; y: number; w: number; h: number };
type RootCell = { x: number; y: number; w: number; h: number; column: number; row: number; index: number };

const W = 1280;
const H = 760;
const ROOM = { left: 76, top: 72, right: 1204, bottom: 690 };
const ROOT_BARRIERS: RootBarrier[] = [
  { x: 432, y: ROOM.top, w: 36, h: ROOM.bottom - ROOM.top },
  { x: 812, y: ROOM.top, w: 36, h: ROOM.bottom - ROOM.top },
  { x: ROOM.left, y: 362, w: ROOM.right - ROOM.left, h: 36 },
];
const PHANTOM_SEEDS = [
  { x: 235, y: 230, rx: 112, ry: 74, speed: 0.84, phase: 0.2 },
  { x: 485, y: 520, rx: 148, ry: 82, speed: 0.68, phase: 1.7 },
  { x: 670, y: 245, rx: 132, ry: 96, speed: 0.76, phase: 3.1 },
  { x: 965, y: 500, rx: 124, ry: 88, speed: 0.72, phase: 4.4 },
  { x: 1040, y: 220, rx: 92, ry: 105, speed: 0.9, phase: 5.6 },
];
const NAMES = ["Bubbles", "Mochi", "Gloop", "Pebble", "Nori", "Fizz", "Wobble", "Pip"];
const HATS: Hat[] = ["antlers", "hood", "moth", "mooncap"];
const ITEM_LABELS: Record<ItemKind, string> = { FLASHLIGHT: "Flashlight", FLARE: "Signal Flare", SONAR: "Sonar" };
const HAZARD_LABELS: Record<Hazard, string> = {
  BLACKOUT: "TOTAL BLACKOUT",
  FOG: "THICK SEA FOG",
  MOONGLARE: "MOON GLARE",
  ROOTWAKE: "ROOTWAKE",
  PHANTOMS: "PHANTOM PROCESSION",
};
const ITEM_DESCRIPTIONS: Record<ItemKind, string> = {
  FLASHLIGHT: "Cuts a focused path through total darkness",
  FLARE: "Creates a shared circle of light for five seconds",
  SONAR: "Reveals movement and exposes Phantom Procession decoys",
};
const KILL_COOLDOWN_SECONDS = 1.6;
const MOON_SIGHT_SECONDS = 3.2;
const TASK_PROGRESS_REWARD = 17;

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const choose = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];

function rootwakeStrength(phase: Phase, hazard: Hazard, phaseTime: number) {
  if (phase !== "ORDEAL" || hazard !== "ROOTWAKE") return 0;
  const risen = clamp((10 - phaseTime) / 0.75, 0, 1);
  const receding = clamp(phaseTime / 0.55, 0, 1);
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

function getRootCell(x: number, y: number): RootCell {
  const [leftRoot, rightRoot, middleRoot] = ROOT_BARRIERS;
  const column = x < leftRoot.x + leftRoot.w / 2 ? 0 : x < rightRoot.x + rightRoot.w / 2 ? 1 : 2;
  const row = y < middleRoot.y + middleRoot.h / 2 ? 0 : 1;
  const columnBounds = [
    [ROOM.left, leftRoot.x],
    [leftRoot.x + leftRoot.w, rightRoot.x],
    [rightRoot.x + rightRoot.w, ROOM.right],
  ];
  const rowBounds = [
    [ROOM.top, middleRoot.y],
    [middleRoot.y + middleRoot.h, ROOM.bottom],
  ];
  const [cellLeft, cellRight] = columnBounds[column];
  const [cellTop, cellBottom] = rowBounds[row];
  return {
    x: cellLeft,
    y: cellTop,
    w: cellRight - cellLeft,
    h: cellBottom - cellTop,
    column,
    row,
    index: row * 3 + column,
  };
}

function sharesRootCell(a: { x: number; y: number }, b: { x: number; y: number }) {
  return getRootCell(a.x, a.y).index === getRootCell(b.x, b.y).index;
}

function initialSnapshot(role: Role = "CREWMATE"): Snapshot {
  return {
    phase: "CALM",
    time: 15,
    hazard: "BLACKOUT",
    taskProgress: 0,
    selectedItem: "FLASHLIGHT",
    charges: { FLASHLIGHT: 0, FLARE: 0, SONAR: 0 },
    role,
    living: 0,
    total: 0,
    canKill: false,
    killCooldown: 0,
    killSpent: false,
    canUseMoonSight: false,
    moonSightActive: false,
    canReport: false,
    taskPrompt: false,
    taskMode: null,
    stationStatus: null,
    rewardNotice: null,
    humanAlive: true,
    message: "",
    localPlayerId: "you",
  };
}

const MUTED_COLOR_CACHE = new Map<string, string>();
/** Precomputes saturate(.34) brightness(.72) in hex so drawSlime avoids expensive per-frame ctx.filter passes. */
function muteHexColor(hex: string): string {
  const cached = MUTED_COLOR_CACHE.get(hex);
  if (cached) return cached;
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return hex;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  const mr = Math.round((lum * 0.66 + r * 0.34) * 0.72);
  const mg = Math.round((lum * 0.66 + g * 0.34) * 0.72);
  const mb = Math.round((lum * 0.66 + b * 0.34) * 0.72);
  const out = `#${mr.toString(16).padStart(2, "0")}${mg.toString(16).padStart(2, "0")}${mb.toString(16).padStart(2, "0")}`;
  MUTED_COLOR_CACHE.set(hex, out);
  return out;
}

function snapshotsEqual(a: Snapshot, b: Snapshot): boolean {
  return (
    a.phase === b.phase
    && a.time === b.time
    && a.hazard === b.hazard
    && a.taskProgress === b.taskProgress
    && a.selectedItem === b.selectedItem
    && a.charges.FLASHLIGHT === b.charges.FLASHLIGHT
    && a.charges.FLARE === b.charges.FLARE
    && a.charges.SONAR === b.charges.SONAR
    && a.role === b.role
    && a.living === b.living
    && a.total === b.total
    && a.canKill === b.canKill
    && a.killCooldown === b.killCooldown
    && a.killSpent === b.killSpent
    && a.canUseMoonSight === b.canUseMoonSight
    && a.moonSightActive === b.moonSightActive
    && a.canReport === b.canReport
    && a.taskPrompt === b.taskPrompt
    && a.taskMode === b.taskMode
    && a.humanAlive === b.humanAlive
    && a.message === b.message
    && a.localPlayerId === b.localPlayerId
    && a.stationStatus?.label === b.stationStatus?.label
    && a.stationStatus?.completed === b.stationStatus?.completed
    && a.stationStatus?.reward === b.stationStatus?.reward
    && a.rewardNotice?.item === b.rewardNotice?.item
    && a.rewardNotice?.station === b.rewardNotice?.station
  );
}

class OrdealEngine {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  mask: HTMLCanvasElement;
  maskCtx: CanvasRenderingContext2D;
  bgCanvas: HTMLCanvasElement;
  bgCtx: CanvasRenderingContext2D;
  players: Player[] = [];
  stations: Station[] = [];
  stationRound = 1;
  private lastStationCompletionSequence = 0;
  bodies: Body[] = [];
  flares: Flare[] = [];
  particles: Particle[] = [];
  suspicion = new Map<string, Map<string, number>>();
  keys = new Set<string>();
  touchKeys = new Set<string>();
  mouse = { x: W * 0.72, y: H * 0.45 };
  phase: Phase = "CALM";
  phaseTime = 15;
  hazard: Hazard = "BLACKOUT";
  taskProgress = 0;
  selectedItem: ItemKind = "FLASHLIGHT";
  charges: Record<ItemKind, number> = { FLASHLIGHT: 0, FLARE: 0, SONAR: 0 };
  itemActiveUntil = 0;
  taskHold = 0;
  killCooldownUntil = 0;
  killUsedThisOrdeal = false;
  moonSightUntil = 0;
  moonSightUsedThisOrdeal = false;
  rewardNotice: { item: ItemKind; station: string } | null = null;
  rewardNoticeUntil = 0;

  burst(x: number, y: number, color: string, count = 20) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 120;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.6 + Math.random() * 0.5,
        max: 1.1,
        size: 2 + Math.random() * 3.5,
        color,
      });
    }
  }
  frame = 0;
  last = 0;
  elapsed = 0;
  emitAt = 0;
  running = true;
  paused = false;
  roleRevealActive = false;
  gameOver = false;
  activeMeeting: Meeting | null = null;
  activePuzzle: TaskPuzzle | null = null;
  message = "Approach a moon shrine. Press or hold E to restore its ward.";
  messageUntil = 4;
  onSnapshot: (snapshot: Snapshot) => void;
  onMeeting: (meeting: Meeting | null) => void;
  onPuzzle: (puzzle: TaskPuzzle | null) => void;
  onKill: (event: KillNotice) => void;
  onDeath: (death: DeathReveal) => void;
  onEnd: (result: string) => void;
  multiplayerClient: MultiplayerClient | null = null;
  localPlayerId: string = "you";
  private unsubscribeNet: (() => void) | null = null;
  private inputSendTimer = 0;
  private movementBuffer = new MovementBuffer();
  private pendingInputs = new Map<number, { x: number; y: number }>();
  private lastInputHeartbeat = 0;
  private canvasRect: DOMRect | null = null;
  private lastSnapshot: Snapshot | null = null;
  private lastSentInput = { x: -1, y: -1, vx: 0, vy: 0, angle: 0, flashlight: false };

  constructor(
    canvas: HTMLCanvasElement,
    count: number,
    roleChoice: RoleChoice,
    onSnapshot: (snapshot: Snapshot) => void,
    onMeeting: (meeting: Meeting | null) => void,
    onPuzzle: (puzzle: TaskPuzzle | null) => void,
    onKill: (event: KillNotice) => void,
    onDeath: (death: DeathReveal) => void,
    onEnd: (result: string) => void,
    multiplayerClient?: MultiplayerClient | null,
    initialPlayers?: NetPlayer[],
    assignedRole?: Role,
  ) {
    this.canvas = canvas;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is not supported in this browser.");
    this.ctx = context;
    this.mask = document.createElement("canvas");
    this.mask.width = W;
    this.mask.height = H;
    const maskContext = this.mask.getContext("2d");
    if (!maskContext) throw new Error("Offscreen canvas is not supported.");
    this.maskCtx = maskContext;
    this.bgCanvas = document.createElement("canvas");
    this.bgCanvas.width = W;
    this.bgCanvas.height = H;
    const bgContext = this.bgCanvas.getContext("2d");
    if (!bgContext) throw new Error("Offscreen background canvas is not supported.");
    this.bgCtx = bgContext;
    this.renderStaticBackground();
    this.onSnapshot = onSnapshot;
    this.onMeeting = onMeeting;
    this.onPuzzle = onPuzzle;
    this.onKill = onKill;
    this.onDeath = onDeath;
    this.onEnd = onEnd;
    this.makeStations();
    this.multiplayerClient = multiplayerClient || null;
    if (this.multiplayerClient && initialPlayers && initialPlayers.length > 0) {
      this.localPlayerId = this.multiplayerClient.playerId;
      this.initMultiplayerPlayers(initialPlayers, assignedRole);
      this.unsubscribeNet = this.multiplayerClient.onMessage((msg) => this.handleNetworkMessage(msg));
    } else {
      this.makePlayers(count, roleChoice);
    }
    this.resize();
    window.addEventListener("resize", this.resize);
    window.addEventListener("scroll", this.updateRect, { passive: true });
    window.addEventListener("keydown", this.keyDown);
    window.addEventListener("keyup", this.keyUp);
    canvas.addEventListener("pointermove", this.pointerMove);
    canvas.addEventListener("pointerdown", this.pointerMove);
    canvas.addEventListener("contextmenu", this.contextMenu);
    this.emit(true);
    this.frame = requestAnimationFrame(this.loop);
  }

  get human() {
    return this.players.find((p) => p.id === this.localPlayerId) || this.players[0];
  }

  initMultiplayerPlayers(initialPlayers: NetPlayer[], assignedRole?: Role) {
    this.players = initialPlayers.map((p) => {
      const isLocal = p.id === this.localPlayerId;
      return {
        id: p.id,
        name: isLocal ? `${p.name} (YOU)` : p.name,
        role: isLocal ? (assignedRole || p.role || "CREWMATE") : "CREWMATE",
        x: p.x,
        y: p.y,
        vx: p.vx,
        vy: p.vy,
        angle: p.angle,
        color: p.color,
        hat: p.hat,
        alive: p.alive,
        ai: !!p.isAi,
        targetX: p.x,
        targetY: p.y,
        thinkAt: 0,
        atStation: 0,
        flashlight: p.flashlight,
        flareDropped: false,
        gearCharges: { FLASHLIGHT: 0, FLARE: 0, SONAR: 0 },
      };
    });
  }

  handleNetworkMessage(msg: S2CMessage) {
    switch (msg.type) {
      case "KILL_RESULT":
        this.killUsedThisOrdeal = msg.spent;
        if (!msg.accepted) this.flashMessage(msg.spent ? "Your single strike is already spent for this Ordeal." : "Strike missed — the target moved out of reach. Your strike is still available.");
        this.emit(true);
        break;
      case "GEAR_SYNC": {
        if (msg.roundId !== undefined && msg.roundId < this.stationRound) break;
        if (msg.roundId !== undefined && msg.roundId > this.stationRound) this.resetStations(msg.roundId);
        this.charges = { ...msg.charges };
        if (msg.stationId) {
          const station = this.stations.find((s) => s.label === msg.stationId);
          if (station) station.completed = Boolean(msg.stationCompleted);
        }
        if (!msg.accepted) {
          if (msg.item === this.selectedItem) this.itemActiveUntil = 0;
          this.rewardNotice = null;
          this.flashMessage(msg.stationId ? "That shrine was already sealed or the trial ended. No item was awarded." : "That gear charge is no longer available.");
        }
        this.emit(true);
        break;
      }
      case "STATION_COMPLETED": {
        if (msg.roundId < this.stationRound || msg.sequence <= this.lastStationCompletionSequence) break;
        if (msg.roundId > this.stationRound) this.resetStations(msg.roundId);
        this.lastStationCompletionSequence = msg.sequence;
        const station = this.stations.find((entry) => entry.label === msg.stationId);
        if (station) station.completedAt = this.elapsed;
        break;
      }
      case "SYNC_MOVEMENT": {
        this.applyMovement(msg.players, msg.serverTime);
        break;
      }
      case "SYNC_PLAYERS": {
        for (const p of msg.players) {
          if (p.id === this.localPlayerId) {
            if (!p.alive && this.human.alive) {
              this.human.alive = false;
            }
            continue;
          }
          let existing = this.players.find((x) => x.id === p.id);
          if (!existing) {
            existing = {
              id: p.id,
              name: p.name,
              role: "CREWMATE",
              x: p.x,
              y: p.y,
              vx: p.vx,
              vy: p.vy,
              angle: p.angle,
              color: p.color,
              hat: p.hat,
              alive: p.alive,
              ai: !!p.isAi,
              targetX: p.x,
              targetY: p.y,
              thinkAt: 0,
              atStation: 0,
              flashlight: p.flashlight,
              flareDropped: false,
              gearCharges: { FLASHLIGHT: 0, FLARE: 0, SONAR: 0 },
            };
            this.players.push(existing);
          } else {
            existing.color = p.color;
            existing.hat = p.hat;
            if (Math.hypot(p.x - existing.x, p.y - existing.y) > 190) {
              existing.x = p.x;
              existing.y = p.y;
            }
            existing.targetX = p.x;
            existing.targetY = p.y;
            existing.vx = p.vx;
            existing.vy = p.vy;
            existing.angle = p.angle;
            existing.alive = p.alive;
            existing.flashlight = p.flashlight;
          }
        }
        this.applyMovement(msg.players);
        break;
      }

      case "PLAYER_LEFT":
        this.players = this.players.filter((p) => p.id !== msg.playerId);
        this.movementBuffer.remove(msg.playerId);
        this.emit(true);
        break;

      case "SYNC_WORLD": {
        if (msg.roundId !== undefined && msg.roundId < this.stationRound) break;
        const previousPhase = this.phase;
        const stationResetNow = msg.roundId !== undefined
          ? msg.roundId > this.stationRound
          : previousPhase !== "CALM" && msg.phase === "CALM";
        if (stationResetNow) this.resetStations(msg.roundId ?? this.stationRound + 1);
        this.phase = msg.phase;
        if (previousPhase !== msg.phase || Math.abs(this.phaseTime - msg.time) > 0.45) {
          this.phaseTime = msg.time;
        } else {
          this.phaseTime += (msg.time - this.phaseTime) * 0.35;
        }
        this.hazard = msg.hazard;
        this.taskProgress = msg.taskProgress;
        this.bodies = msg.bodies.map((b) => ({ id: b.id, x: b.x, y: b.y, color: b.color, name: b.name, age: b.age }));
        this.flares = msg.flares.map((f) => ({ x: f.x, y: f.y, life: f.life, owner: f.owner }));
        let stationSealedNow = false;
        if (msg.completedStations) {
          const sealedSet = new Set(msg.completedStations);
          for (const station of this.stations) {
            if (sealedSet.has(station.label) && !station.completed) {
              station.completed = true;
              station.cooldown = 0;
              stationSealedNow = true;
              // A fallback for a client that missed the completion event.
              station.completedAt ??= this.elapsed;
              if (this.activePuzzle && this.stations[this.activePuzzle.stationIndex]?.label === station.label) {
                this.cancelPuzzle(`${station.label} was just sealed by another Warden!`);
              }
            }
          }
        }
        if (this.activeMeeting && msg.phase !== "DISCUSSION") {
          this.activeMeeting = null;
          this.onMeeting(null);
          if (!this.gameOver) this.paused = false;
        }
        if (this.phase === "ORDEAL" && previousPhase !== "ORDEAL") {
          this.killUsedThisOrdeal = false;
          this.moonSightUsedThisOrdeal = false;
          this.moonSightUntil = 0;
        }
        if (this.phase !== "ORDEAL") this.moonSightUntil = 0;
        if (this.phase === "ORDEAL" && this.activePuzzle) {
          this.cancelPuzzle("An Ordeal began! Shrines are locked.");
        }
        this.emit(stationSealedNow || stationResetNow);
        break;
      }

      case "BODY_SPAWNED": {
        const b = msg.body;
        if (!this.bodies.some((x) => x.id === b.id)) {
          this.bodies.push({ id: b.id, x: b.x, y: b.y, color: b.color, name: b.name, age: b.age });
          this.burst(b.x, b.y + 20, b.color, 34);
          this.onKill({ key: `${b.id}-${performance.now()}` });
        }
        break;
      }

      case "FLARE_SPAWNED": {
        this.flares.push({ x: msg.flare.x, y: msg.flare.y, life: msg.flare.life, owner: msg.flare.owner });
        break;
      }

      case "MEETING_CALLED": {
        this.movementBuffer.clear();
        this.pendingInputs.clear();
        for (const player of this.players) { player.vx = 0; player.vy = 0; }
        this.cancelPuzzle("");
        this.paused = true;
        this.phase = "DISCUSSION";
        this.activeMeeting = {
          reason: msg.reason,
          reporter: msg.reporter,
          candidates: msg.candidates.map((c) => ({
            id: c.id,
            name: c.id === this.localPlayerId ? `${c.name} (YOU)` : c.name,
            role: "CREWMATE",
            x: c.x,
            y: c.y,
            vx: 0,
            vy: 0,
            color: c.color,
            hat: c.hat,
            alive: c.alive,
            ai: !!c.isAi,
            targetX: c.x,
            targetY: c.y,
            thinkAt: 0,
            atStation: 0,
            flashlight: false,
            flareDropped: false,
            gearCharges: { FLASHLIGHT: 0, FLARE: 0, SONAR: 0 },
          })),
          accusations: {},
        };
        this.onMeeting(this.activeMeeting);
        this.emit(true);
        break;
      }

      case "MEETING_CONCLUDED": {
        if (this.activeMeeting) {
          this.activeMeeting = {
            ...this.activeMeeting,
            tally: msg.tally,
            ejectedId: msg.ejectedId,
            tied: msg.tied,
            verdict: msg.verdict,
          };
          this.onMeeting(this.activeMeeting);
          this.emit(true);
        }
        break;
      }

      case "DEATH_EVENT": {
        this.human.alive = false;
        this.human.vx = 0;
        this.human.vy = 0;
        this.cancelPuzzle("");
        this.paused = true;
        this.onDeath({ killerName: msg.killerName, killerColor: msg.killerColor });
        this.flashMessage(`You were splattered by ${msg.killerName}. Spectating the remaining crew.`);
        break;
      }

      case "MATCH_RESULT": {
        this.gameOver = true;
        this.paused = true;
        this.onEnd(msg.result);
        break;
      }
    }
  }

  private applyMovement(players: NetMovement[], serverTime?: number) {
    this.movementBuffer.push(players.filter((p) => p.id !== this.localPlayerId), serverTime, performance.now());
    for (const next of players) {
      const player = this.players.find((p) => p.id === next.id);
      if (!player) continue;
      player.alive = next.alive;
      if (player.id !== this.localPlayerId) {
        player.flashlight = next.flashlight;
        continue;
      }
      if (!next.alive) { player.vx = 0; player.vy = 0; }
      if (next.inputSeq === undefined) continue;
      const sent = this.pendingInputs.get(next.inputSeq);
      if (sent) {
        // Correct the acknowledged input while preserving movement made since it.
        const dx = next.x - sent.x;
        const dy = next.y - sent.y;
        if (Math.hypot(dx, dy) > 2) {
          player.x += dx;
          player.y += dy;
          for (const [seq, pending] of this.pendingInputs) {
            if (seq > next.inputSeq) { pending.x += dx; pending.y += dy; }
          }
        }
      }
      for (const seq of this.pendingInputs.keys()) if (seq <= next.inputSeq) this.pendingInputs.delete(seq);
    }
  }

  makeStations() {
    this.stations = [
      { x: 250, y: 104, side: "top", label: "FROST FONT", pulse: 0, cooldown: 0, completed: false, reward: "FLASHLIGHT", puzzle: "MATH" },
      { x: 640, y: 104, side: "top", label: "STAR ALTAR", pulse: 1.2, cooldown: 0, completed: false, reward: "SONAR", puzzle: "LINK" },
      { x: 1038, y: 104, side: "top", label: "OWL TOTEM", pulse: 2.4, cooldown: 0, completed: false, reward: "FLARE", puzzle: "LINK" },
      { x: 1164, y: 390, side: "right", label: "EAST WARD", pulse: 3.1, cooldown: 0, completed: false, reward: "FLASHLIGHT", puzzle: "MATH" },
      { x: 844, y: 658, side: "bottom", label: "MOONWELL", pulse: 4.2, cooldown: 0, completed: false, reward: "FLARE" },
      { x: 116, y: 402, side: "left", label: "ROOT SEAL", pulse: 5.1, cooldown: 0, completed: false, reward: "SONAR", puzzle: "LINK" },
    ];
  }

  resetStations(roundId = this.stationRound + 1) {
    this.stationRound = roundId;
    this.cancelPuzzle("");
    this.taskHold = 0;
    for (const station of this.stations) {
      station.completed = false;
      station.completedAt = undefined;
      station.cooldown = 0;
    }
  }

  makePlayers(count: number, roleChoice: RoleChoice) {
    let impostorIndex = Math.floor(Math.random() * count);
    if (roleChoice === "IMPOSTOR") impostorIndex = 0;
    if (roleChoice === "CREWMATE") impostorIndex = 1 + Math.floor(Math.random() * (count - 1));
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2;
      this.players.push({
        id: i === 0 ? "you" : `bot-${i}`,
        name: i === 0 ? "YOU" : NAMES[i - 1],
        role: i === impostorIndex ? "IMPOSTOR" : "CREWMATE",
        x: 640 + Math.cos(angle) * 170,
        y: 384 + Math.sin(angle) * 116,
        vx: 0,
        vy: 0,
        color: COLORS[i % COLORS.length],
        hat: HATS[i % HATS.length],
        alive: true,
        ai: i !== 0,
        targetX: 640,
        targetY: 380,
        thinkAt: 0,
        atStation: i % this.stations.length,
        flashlight: false,
        flareDropped: false,
        gearCharges: { FLASHLIGHT: 0, FLARE: 0, SONAR: 0 },
      });
    }
  }

  updateRect = () => {
    this.canvasRect = this.canvas.getBoundingClientRect();
  };

  resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.canvasRect = this.canvas.getBoundingClientRect();
  };

  keyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    const tag = target?.tagName;
    // Never steal keystrokes from text entry (e.g. the meeting chat).
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;
    // Let focused buttons keep their native Space/Enter activation.
    if (tag === "BUTTON" && (event.code === "Space" || event.code === "Enter" || event.code === "NumpadEnter")) return;
    if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyE", "KeyF", "KeyR", "KeyQ", "KeyV", "Space", "Escape"].includes(event.code)) {
      event.preventDefault();
    }
    this.keys.add(event.code);
    if (this.activePuzzle) {
      if (!event.repeat && ["Digit1", "Digit2", "Digit3"].includes(event.code)) this.submitPuzzle(Number(event.code.slice(-1)) - 1);
      if (!event.repeat && event.code === "Escape") this.cancelPuzzle();
      return;
    }
    if (event.repeat || this.paused || this.roleRevealActive) return;
    if (event.code === "KeyE") this.tryOpenPuzzle();
    if (event.code === "KeyF") this.useItem();
    if (event.code === "KeyR") this.report();
    if (event.code === "KeyQ" || event.code === "Space") this.kill();
    if (event.code === "KeyV") this.useMoonSight();
    if (event.code === "Digit1") this.selectItem("FLASHLIGHT");
    if (event.code === "Digit2") this.selectItem("FLARE");
    if (event.code === "Digit3") this.selectItem("SONAR");
  };

  keyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code);
  };

  pointerMove = (event: PointerEvent) => {
    const rect = (this.canvasRect && this.canvasRect.width > 0)
      ? this.canvasRect
      : (this.canvasRect = this.canvas.getBoundingClientRect());
    if (rect.width <= 0 || rect.height <= 0) return;
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * W;
    this.mouse.y = ((event.clientY - rect.top) / rect.height) * H;
  };

  contextMenu = (event: MouseEvent) => {
    event.preventDefault();
    this.useItem();
  };

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.frame);
    if (this.unsubscribeNet) {
      this.unsubscribeNet();
      this.unsubscribeNet = null;
    }
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("scroll", this.updateRect);
    window.removeEventListener("keydown", this.keyDown);
    window.removeEventListener("keyup", this.keyUp);
    this.canvas.removeEventListener("pointermove", this.pointerMove);
    this.canvas.removeEventListener("pointerdown", this.pointerMove);
    this.canvas.removeEventListener("contextmenu", this.contextMenu);
  }

  setTouch(code: string, down: boolean) {
    if (down) this.touchKeys.add(code);
    else this.touchKeys.delete(code);
  }

  selectItem(item: ItemKind) {
    this.selectedItem = item;
    this.emit(true);
  }

  tryOpenPuzzle() {
    if (this.phase !== "CALM" || !this.human.alive || this.paused || this.activePuzzle) return;
    const stationIndex = this.stations.findIndex((station) => dist(station, this.human) < 84 && !station.completed && station.cooldown <= 0 && station.puzzle);
    if (stationIndex < 0) return;
    const station = this.stations[stationIndex];
    const puzzle = station.puzzle === "MATH" ? this.createMathPuzzle(station, stationIndex) : this.createLinkPuzzle(station, stationIndex);
    // The world keeps running while a puzzle is open: the phase timer and bots
    // continue, and the human simply stands still at the shrine.
    this.activePuzzle = puzzle;
    this.taskHold = 0;
    this.human.vx = 0;
    this.human.vy = 0;
    this.onPuzzle(puzzle);
    this.emit(true);
  }

  createMathPuzzle(station: Station, stationIndex: number): TaskPuzzle {
    const operator = choose(["+", "−", "×"] as const);
    let a = 2 + Math.floor(Math.random() * 9);
    let b = 2 + Math.floor(Math.random() * 8);
    if (operator === "−" && b > a) [a, b] = [b, a];
    const answer = operator === "+" ? a + b : operator === "−" ? a - b : a * b;
    const choices = new Set<number>([answer]);
    while (choices.size < 3) {
      const offset = choose([-5, -3, -2, -1, 1, 2, 3, 5]);
      choices.add(Math.max(0, answer + offset));
    }
    const options = [...choices].sort(() => Math.random() - 0.5).map(String);
    return {
      stationIndex,
      stationLabel: station.label,
      reward: station.reward,
      kind: "MATH",
      prompt: `${a} ${operator} ${b} = ?`,
      options,
      answerIndex: options.indexOf(String(answer)),
    };
  }

  createLinkPuzzle(station: Station, stationIndex: number): TaskPuzzle {
    const patterns = [
      { sequence: ["●", "◆", "●", "◆"], answer: "●", decoys: ["◆", "▲"] },
      { sequence: ["▲", "▲", "○", "▲", "▲"], answer: "○", decoys: ["▲", "◆"] },
      { sequence: ["◇", "○", "□", "◇", "○"], answer: "□", decoys: ["◇", "○"] },
      { sequence: ["I", "II", "III", "I", "II"], answer: "III", decoys: ["I", "IV"] },
    ];
    const pattern = choose(patterns);
    const options = [pattern.answer, ...pattern.decoys].sort(() => Math.random() - 0.5);
    return {
      stationIndex,
      stationLabel: station.label,
      reward: station.reward,
      kind: "LINK",
      prompt: "Choose the next node to complete the signal chain.",
      sequence: pattern.sequence,
      options,
      answerIndex: options.indexOf(pattern.answer),
    };
  }

  submitPuzzle(optionIndex: number) {
    if (!this.activePuzzle) return;
    if (optionIndex !== this.activePuzzle.answerIndex) {
      this.activePuzzle = { ...this.activePuzzle, error: this.activePuzzle.kind === "MATH" ? "That calculation is off. Try another answer." : "That link breaks the circuit. Try another node." };
      this.onPuzzle(this.activePuzzle);
      return;
    }
    const station = this.stations[this.activePuzzle.stationIndex];
    const wasFake = this.human.role === "IMPOSTOR";
    this.completeStation(station, wasFake);
    this.activePuzzle = null;
    this.onPuzzle(null);
    this.keys.delete("KeyE");
    this.emit(true);
  }

  completeStation(station: Station, wasFake: boolean) {
    if (station.completed) return;
    station.completed = true;
    station.cooldown = 0;
    const reward = station.reward;
    this.charges[reward] = Math.min(3, this.charges[reward] + 1);
    this.selectedItem = reward;
    this.rewardNotice = { item: reward, station: station.label };
    this.rewardNoticeUntil = this.elapsed + 5.5;
    if (this.multiplayerClient) {
      this.multiplayerClient.sendTask(station.label, reward, this.stationRound);
    } else if (!wasFake) {
      this.taskProgress = Math.min(100, this.taskProgress + TASK_PROGRESS_REWARD);
    }
    const prefix = wasFake ? "Counterfeit rite accepted" : `${station.label} sealed`;
    this.flashMessage(`${prefix}. ${ITEM_LABELS[reward]} acquired for the next Ordeal.`);
    if (!this.multiplayerClient) station.completedAt = this.elapsed;
    if (!wasFake && !this.multiplayerClient) this.checkWin();
  }

  cancelPuzzle(message = "Shrine trial paused. Return when the sanctuary is calm.") {
    if (!this.activePuzzle) return;
    this.activePuzzle = null;
    this.onPuzzle(null);
    this.keys.delete("KeyE");
    if (message) this.flashMessage(message);
  }

  useItem() {
    if (this.phase !== "ORDEAL" || !this.human.alive || this.paused) {
      this.flashMessage("Survival gear only activates during an Ordeal.");
      return;
    }
    if (this.charges[this.selectedItem] <= 0) {
      this.flashMessage(`No ${ITEM_LABELS[this.selectedItem]} charge. Complete its marked moon shrine first.`);
      return;
    }
    this.charges[this.selectedItem] -= 1;
    this.multiplayerClient?.useItem(this.selectedItem, this.human.x, this.human.y);
    if (this.selectedItem === "FLARE") {
      if (!this.multiplayerClient) {
        this.flares.push({ x: this.human.x, y: this.human.y, life: 5, owner: "you" });
      }
      this.flashMessage("Signal flare deployed — shared light holds for 5 seconds.");
    } else {
      this.itemActiveUntil = this.elapsed + (this.selectedItem === "FLASHLIGHT" ? 7 : 6);
      this.flashMessage(this.selectedItem === "FLASHLIGHT" ? "Flashlight online. Aim with your cursor." : "Proximity sonar sweeping nearby movement.");
    }
    this.emit(true);
  }

  useMoonSight() {
    if (this.human.role !== "IMPOSTOR" || this.phase !== "ORDEAL" || !this.human.alive || this.paused) return;
    if (this.moonSightUsedThisOrdeal) {
      this.flashMessage("Moon Sight is already spent for this Ordeal.");
      return;
    }
    this.moonSightUsedThisOrdeal = true;
    this.moonSightUntil = this.elapsed + MOON_SIGHT_SECONDS;
    this.flashMessage("MOON SIGHT AWAKENED — every living aura is exposed for a moment.");
    this.emit(true);
  }

  report() {
    if (!this.human.alive || this.paused) return;
    const nearby = this.bodies.find((body) => dist(this.human, body) < 96);
    const atEmergency = dist(this.human, { x: 640, y: 382 }) < 92 && this.phase === "CALM";
    if (this.multiplayerClient) {
      if (nearby || atEmergency) {
        this.multiplayerClient.sendReport(nearby?.id);
      } else {
        this.flashMessage("No body nearby. Emergency button is available during Calm.");
      }
      return;
    }
    if (nearby) this.startMeeting(`${nearby.name.toUpperCase()} WAS FOUND AS A JELLY PUDDLE`, "YOU");
    else if (atEmergency) this.startMeeting("EMERGENCY MEETING", "YOU");
    else this.flashMessage("No body nearby. Emergency button is available during Calm.");
  }

  kill() {
    if (this.human.role !== "IMPOSTOR" || this.phase !== "ORDEAL" || !this.human.alive || this.paused) return;
    if (this.killUsedThisOrdeal) {
      this.flashMessage("Your single strike is already spent for this Ordeal.");
      return;
    }
    if (this.elapsed < this.killCooldownUntil) return;
    if (this.multiplayerClient) {
      const victims = this.players.filter((player) =>
        player.alive
        && player.id !== this.human.id
        && dist(player, this.human) < 84
        && (this.hazard !== "ROOTWAKE" || sharesRootCell(player, this.human))
      );
      const victim = victims.sort((a, b) => dist(a, this.human) - dist(b, this.human))[0];
      if (!victim) {
        this.flashMessage("No crewmate in melee range.");
        return;
      }
      this.multiplayerClient.sendKill(victim.id);
      this.killUsedThisOrdeal = true;
      this.killCooldownUntil = this.elapsed + KILL_COOLDOWN_SECONDS;
      this.flashMessage("Strike sent — awaiting the sanctuary's verdict.");
      return;
    }
    const victims = this.players.filter((player) =>
      player.alive
      && player.role === "CREWMATE"
      && dist(player, this.human) < 84
      && (this.hazard !== "ROOTWAKE" || sharesRootCell(player, this.human))
    );
    const victim = victims.sort((a, b) => dist(a, this.human) - dist(b, this.human))[0];
    if (!victim) {
      this.flashMessage("No crewmate in melee range.");
      return;
    }
    this.eliminate(victim, this.human);
    this.killCooldownUntil = this.elapsed + KILL_COOLDOWN_SECONDS;
    this.flashMessage("Strike complete. Your claws are spent until the next Ordeal.");
  }

  eliminate(victim: Player, killer: Player) {
    victim.alive = false;
    victim.vx = 0;
    victim.vy = 0;
    this.killUsedThisOrdeal = true;
    this.bodies.push({ id: victim.id, x: victim.x, y: victim.y, color: victim.color, name: victim.name, age: 0 });
    this.burst(victim.x, victim.y + 20, victim.color, 34);
    this.onKill({ key: `${victim.id}-${performance.now()}` });
    this.recordWitnesses(victim, killer);
    if (victim.id === "you") {
      this.cancelPuzzle("");
      this.paused = true;
      this.onDeath({ killerName: killer.name, killerColor: killer.color });
      this.flashMessage(`You were splattered by ${killer.name}. Spectating the remaining crew.`);
    }
    killer.targetX = ROOM.left + 130 + Math.random() * (ROOM.right - ROOM.left - 260);
    killer.targetY = ROOM.top + 120 + Math.random() * (ROOM.bottom - ROOM.top - 240);
    this.checkWin();
  }

  /** Adds suspicion `amount` that `observer` holds against `suspect`. */
  suspect(observer: Player, suspectId: string, amount: number) {
    let ledger = this.suspicion.get(observer.id);
    if (!ledger) {
      ledger = new Map();
      this.suspicion.set(observer.id, ledger);
    }
    ledger.set(suspectId, (ledger.get(suspectId) || 0) + amount);
  }

  /** Can `observer` make out `target` right now, given the hazard and light sources? */
  canSee(observer: Player, target: Player) {
    const d = dist(observer, target);
    if (this.phase !== "ORDEAL") return d < 420;
    if (this.hazard === "ROOTWAKE") return sharesRootCell(observer, target) && d < 420;
    if (this.hazard === "PHANTOMS") return d < 58;
    if (this.flares.some((flare) => dist(flare, target) < 146)) return d < 420;
    if (observer.flashlight) {
      const aim = Math.atan2(observer.vy, observer.vx);
      const toward = Math.atan2(target.y - observer.y, target.x - observer.x);
      const delta = Math.atan2(Math.sin(toward - aim), Math.cos(toward - aim));
      if (Math.abs(delta) < Math.PI / 8 && d < 330) return true;
    }
    return d < (this.hazard === "BLACKOUT" ? 104 : this.hazard === "MOONGLARE" ? 72 : 140);
  }

  recordWitnesses(victim: Player, killer: Player) {
    for (const observer of this.players) {
      if (!observer.ai || !observer.alive || observer.id === killer.id) continue;
      if (this.canSee(observer, killer)) this.suspect(observer, killer.id, 4);
      // Anyone else lingering near the body is mildly suspicious too.
      for (const other of this.players) {
        if (!other.alive || other.id === observer.id || other.id === killer.id) continue;
        if (dist(other, victim) < 170) this.suspect(observer, other.id, 0.8);
      }
      if (dist(killer, victim) < 170) this.suspect(observer, killer.id, 0.8);
    }
  }

  /** The living player `observer` distrusts most, or null when it has no evidence. */
  primeSuspect(observer: Player) {
    const ledger = this.suspicion.get(observer.id);
    let best: string | null = null;
    let bestScore = 0.5;
    for (const player of this.players) {
      if (!player.alive || player.id === observer.id) continue;
      const score = ledger?.get(player.id) || 0;
      if (score > bestScore) {
        best = player.id;
        bestScore = score;
      }
    }
    return best;
  }

  resumeAfterDeathReveal() {
    if (!this.gameOver && !this.activeMeeting) this.paused = false;
  }

  startMeeting(reason: string, reporter: string) {
    if (this.paused) return;
    this.cancelPuzzle("");
    this.paused = true;
    this.phase = "DISCUSSION";
    const accusations: Record<string, string | null> = {};
    for (const player of this.players) {
      if (player.ai && player.alive) accusations[player.id] = this.primeSuspect(player);
    }
    this.activeMeeting = { reason, reporter, candidates: this.players.map((player) => ({ ...player })), accusations };
    this.onMeeting(this.activeMeeting);
    this.emit(true);
  }

  vote(targetId: string | null) {
    if (!this.paused || !this.activeMeeting || this.activeMeeting.tally) return;
    if (this.multiplayerClient) {
      this.multiplayerClient.sendVote(targetId);
      this.flashMessage(targetId ? "Vote submitted." : "Skip vote submitted.");
      return;
    }
    const tally = new Map<string, number>();
    const cast = (accusedId: string | null) => {
      const tallyId = accusedId || "SKIP";
      tally.set(tallyId, (tally.get(tallyId) || 0) + 1);
    };
    if (this.human.alive) cast(targetId);
    const living = this.players.filter((player) => player.alive);
    // Combined table suspicion, used by the impostor bot to bandwagon convincingly.
    const tableSuspicion = new Map<string, number>();
    for (const ledger of this.suspicion.values()) {
      for (const [id, score] of ledger) tableSuspicion.set(id, (tableSuspicion.get(id) || 0) + score);
    }
    for (const voter of living.filter((player) => player.ai)) {
      const options = living.filter((player) => player.id !== voter.id);
      let pick: Player | undefined;
      if (voter.role === "IMPOSTOR") {
        const crew = options.filter((player) => player.role !== "IMPOSTOR");
        const scapegoat = [...crew].sort((a, b) => (tableSuspicion.get(b.id) || 0) - (tableSuspicion.get(a.id) || 0))[0];
        if (Math.random() < 0.15) {
          cast(null);
          continue;
        }
        pick = scapegoat && (tableSuspicion.get(scapegoat.id) || 0) > 0 ? scapegoat : choose(crew);
      } else {
        const primeId = this.primeSuspect(voter);
        const confidence = primeId ? this.suspicion.get(voter.id)?.get(primeId) || 0 : 0;
        const followChance = confidence >= 3 ? 0.88 : 0.55;
        if (primeId && Math.random() < followChance) {
          pick = options.find((player) => player.id === primeId);
        } else if (!primeId && Math.random() < 0.4) {
          pick = choose(options);
        } else {
          cast(null);
          continue;
        }
      }
      if (pick) cast(pick.id);
    }
    const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1]);
    const tied = ranked.length > 1 && ranked[0][1] === ranked[1][1];
    const ejectedId = tied || ranked[0][0] === "SKIP" ? null : ranked[0][0];
    const maxVotes = ranked[0][1];
    const voteTally: VoteTally[] = [
      ...living.map((player) => ({
        targetId: player.id,
        targetName: player.name,
        targetColor: player.color,
        votes: tally.get(player.id) || 0,
        isTop: (tally.get(player.id) || 0) === maxVotes,
      })),
      {
        targetId: null,
        targetName: "SKIP",
        targetColor: null,
        votes: tally.get("SKIP") || 0,
        isTop: (tally.get("SKIP") || 0) === maxVotes,
      },
    ].sort((a, b) => b.votes - a.votes);
    if (ejectedId) {
      const ejected = this.players.find((player) => player.id === ejectedId);
      if (ejected) {
        ejected.alive = false;
        this.activeMeeting = {
          ...this.activeMeeting,
          tally: voteTally,
          ejectedId,
          tied: false,
          verdict: `${ejected.name} was ejected — ${ejected.role === "IMPOSTOR" ? "THE IMPOSTOR" : "CREWMATE"}`,
        };
      }
    } else {
      this.activeMeeting = {
        ...this.activeMeeting,
        tally: voteTally,
        ejectedId: null,
        tied,
        verdict: tied ? "Vote tied — no one was ejected" : "Vote skipped — no one was ejected",
      };
    }
    this.onMeeting(this.activeMeeting);
    this.emit(true);
  }

  resolveMeeting() {
    if (!this.activeMeeting?.tally) return;
    if (this.multiplayerClient) {
      this.multiplayerClient.resolveMeeting();
      return;
    }
    this.bodies = [];
    this.flares = [];
    this.itemActiveUntil = 0;
    for (const player of this.players) player.flashlight = false;
    // Evidence fades between meetings, but a witnessed kill is never fully forgotten.
    for (const ledger of this.suspicion.values()) {
      for (const [id, score] of ledger) ledger.set(id, score * 0.75);
    }
    this.activeMeeting = null;
    this.onMeeting(null);
    this.paused = false;
    if (!this.checkWin()) {
      this.phase = "CALM";
      this.phaseTime = 15;
      this.resetStations();
      this.killCooldownUntil = 0;
      this.moonSightUntil = 0;
    }
    this.emit(true);
  }

  checkWin() {
    if (this.multiplayerClient) return false;
    if (this.gameOver) return true;
    const impostor = this.players.find((player) => player.role === "IMPOSTOR");
    const crewLiving = this.players.filter((player) => player.role === "CREWMATE" && player.alive).length;
    if (!impostor?.alive) {
      this.end("CREW VICTORY — THE IMPOSTOR WAS EJECTED");
      return true;
    }
    if (this.taskProgress >= 100) {
      this.end("CREW VICTORY — ALL MOON WARDS RESTORED");
      return true;
    }
    if (crewLiving <= 1) {
      this.end("IMPOSTOR VICTORY — THE CREW IS AT PARITY");
      return true;
    }
    return false;
  }

  end(result: string) {
    if (this.gameOver) return;
    this.gameOver = true;
    this.paused = true;
    this.cancelPuzzle("");
    this.onEnd(result);
  }

  flashMessage(message: string) {
    this.message = message;
    this.messageUntil = this.elapsed + 3.5;
    this.emit(true);
  }

  snapshot(): Snapshot {
    const nearbyBody = this.bodies.some((body) => dist(body, this.human) < 96);
    const nearButton = this.phase === "CALM" && dist(this.human, { x: 640, y: 382 }) < 92;
    const nearestStation = this.stations.find((station) => dist(station, this.human) < 84);
    const victimNear = this.players.some(
      (player) =>
        player.alive
        && player.id !== this.human.id
        && player.role === "CREWMATE"
        && dist(player, this.human) < 84
        && (this.hazard !== "ROOTWAKE" || sharesRootCell(player, this.human)),
    );
    const rawKillCooldown = Math.max(0, this.killCooldownUntil - this.elapsed);
    const killCooldown = Math.round(rawKillCooldown * 10) / 10;
    const moonSightActive = this.elapsed < this.moonSightUntil;
    return {
      phase: this.phase,
      time: Math.ceil(Math.max(0, this.phaseTime)),
      hazard: this.hazard,
      taskProgress: Math.floor(this.taskProgress),
      selectedItem: this.selectedItem,
      charges: { ...this.charges },
      role: this.human.role,
      living: this.players.filter((player) => player.alive).length,
      total: this.players.length,
      canKill: this.human.role === "IMPOSTOR" && this.phase === "ORDEAL" && !this.killUsedThisOrdeal && rawKillCooldown <= 0 && victimNear,
      killCooldown,
      killSpent: this.killUsedThisOrdeal,
      canUseMoonSight: this.human.role === "IMPOSTOR" && this.phase === "ORDEAL" && !this.moonSightUsedThisOrdeal,
      moonSightActive,
      canReport: this.human.alive && (nearbyBody || nearButton),
      taskPrompt: Boolean(nearestStation && !nearestStation.completed && nearestStation.cooldown <= 0) && this.phase === "CALM" && this.human.alive,
      taskMode: nearestStation && !nearestStation.completed ? (nearestStation.puzzle ? "PUZZLE" : "HOLD") : null,
      stationStatus: nearestStation ? { label: nearestStation.label, completed: nearestStation.completed, reward: nearestStation.reward } : null,
      rewardNotice: this.rewardNotice && this.elapsed < this.rewardNoticeUntil ? this.rewardNotice : null,
      humanAlive: this.human.alive,
      message: this.elapsed < this.messageUntil ? this.message : "",
      localPlayerId: this.human.id,
    };
  }

  emit(force = false) {
    if (!force && this.elapsed < this.emitAt) return;
    this.emitAt = this.elapsed + 0.1;
    const next = this.snapshot();
    if (!force && this.lastSnapshot && snapshotsEqual(this.lastSnapshot, next)) return;
    this.lastSnapshot = next;
    this.onSnapshot(next);
  }

  loop = (now: number) => {
    if (!this.running) return;
    const dt = this.last ? Math.min((now - this.last) / 1000, 0.035) : 0;
    this.last = now;
    this.elapsed += dt;
    if (!this.paused && (!this.roleRevealActive || this.multiplayerClient)) {
      this.update(dt);
    }
    this.draw();
    this.emit();
    this.frame = requestAnimationFrame(this.loop);
  };

  update(dt: number) {
    if (this.multiplayerClient) {
      this.phaseTime = Math.max(0, this.phaseTime - dt);
    } else {
      this.phaseTime -= dt;
      if (this.phaseTime <= 0) {
        if (this.phase === "CALM") {
          this.phase = "COUNTDOWN";
          this.phaseTime = 3;
          this.cancelPuzzle("");
          this.flashMessage("ORDEAL INCOMING — remember who is nearby.");
        } else if (this.phase === "COUNTDOWN") {
          this.phase = "ORDEAL";
          this.phaseTime = 10;
          this.hazard = choose<Hazard>(["BLACKOUT", "FOG", "MOONGLARE", "ROOTWAKE", "PHANTOMS"]);
          this.killCooldownUntil = 0;
          this.killUsedThisOrdeal = false;
          this.moonSightUntil = 0;
          this.moonSightUsedThisOrdeal = false;
          for (const player of this.players) player.flareDropped = false;
          this.flashMessage(
            this.hazard === "BLACKOUT"
              ? "TOTAL BLACKOUT — light is survival."
              : this.hazard === "FOG"
                ? "THICK SEA FOG — only anonymous shapes remain beyond your light."
                : this.hazard === "MOONGLARE"
                  ? "MOON GLARE — searing moonlight has bleached every identity into shadow."
                  : this.hazard === "ROOTWAKE"
                    ? "ROOTWAKE — six moon cells have sealed. Only your chamber remains visible."
                    : "PHANTOM PROCESSION — false wardens now walk among the living.",
          );
        } else if (this.phase === "ORDEAL") {
          this.phase = "CALM";
          this.phaseTime = 15;
          this.resetStations();
          this.itemActiveUntil = 0;
          this.moonSightUntil = 0;
          this.flashMessage("The sanctums have awakened. New trials are available for this round.");
        }
      }
    }

    for (const station of this.stations) {
      station.cooldown = Math.max(0, station.cooldown - dt);
      const targetClosure = this.phase === "CALM" ? 0 : 1;
      station.rootClosure = (station.rootClosure ?? targetClosure) + (targetClosure - (station.rootClosure ?? targetClosure)) * Math.min(1, dt * 8);
    }
    for (const body of this.bodies) body.age += dt;
    this.flares = this.flares.filter((flare) => (flare.life -= dt) > 0);
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(0.1, dt);
      p.vy *= Math.pow(0.1, dt);
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    if (!this.roleRevealActive) {
      this.updateHuman(dt);
    }

    if (this.multiplayerClient) {
      const rootLocked = rootwakeStrength(this.phase, this.hazard, this.phaseTime) > 0.72;
      for (const p of this.players) {
        if (p.id === this.localPlayerId) continue;
        const sample = this.movementBuffer.sample(p.id, performance.now());
        if (sample) {
          const predX = clamp(sample.x, ROOM.left + 36, ROOM.right - 36);
          const predY = clamp(sample.y, ROOM.top + 48, ROOM.bottom - 32);
          const resolved = rootLocked ? resolveRootPosition(predX, predY) : { x: predX, y: predY };
          p.targetX = resolved.x;
          p.targetY = resolved.y;
          p.x = p.targetX;
          p.y = p.targetY;
          p.vx = sample.vx;
          p.vy = sample.vy;
          p.angle = sample.angle;
        }
      }
      this.inputSendTimer = (this.inputSendTimer || 0) + dt;
      if (this.inputSendTimer >= 0.05) {
        this.inputSendTimer = 0;
        const aim = Number(Math.atan2(this.mouse.y - this.human.y, this.mouse.x - this.human.x).toFixed(2));
        const rx = Math.round(this.human.x);
        const ry = Math.round(this.human.y);
        const rvx = Math.round(this.human.vx);
        const rvy = Math.round(this.human.vy);
        const fl = this.human.flashlight;
        const prev = this.lastSentInput;
        if (
          rx !== prev.x
          || ry !== prev.y
          || rvx !== prev.vx
          || rvy !== prev.vy
          || Math.abs(aim - prev.angle) > 0.04
          || fl !== prev.flashlight
          || this.elapsed - this.lastInputHeartbeat >= 0.5
        ) {
          this.lastInputHeartbeat = this.elapsed;
          this.lastSentInput = { x: rx, y: ry, vx: rvx, vy: rvy, angle: aim, flashlight: fl };
          const seq = this.multiplayerClient.sendInput(rx, ry, rvx, rvy, aim, fl);
          this.pendingInputs.set(seq, { x: rx, y: ry });
          if (this.pendingInputs.size > 180) this.pendingInputs.delete(this.pendingInputs.keys().next().value!);
        }
      }
    } else {
      this.updateBots(dt);
    }
  }

  updateHuman(dt: number) {
    const player = this.human;
    if (!player.alive) return;
    if (this.multiplayerClient && !this.multiplayerClient.connected) { player.vx = 0; player.vy = 0; return; }
    player.flashlight = this.phase === "ORDEAL" && this.selectedItem === "FLASHLIGHT" && this.elapsed < this.itemActiveUntil;
    if (this.activePuzzle) {
      player.vx = 0;
      player.vy = 0;
      return;
    }
    const pressed = (code: string) => this.keys.has(code) || this.touchKeys.has(code);
    let dx = Number(pressed("KeyD") || pressed("ArrowRight")) - Number(pressed("KeyA") || pressed("ArrowLeft"));
    let dy = Number(pressed("KeyS") || pressed("ArrowDown")) - Number(pressed("KeyW") || pressed("ArrowUp"));
    const length = Math.hypot(dx, dy) || 1;
    dx /= length;
    dy /= length;
    const speed = 184;
    player.vx += (dx * speed - player.vx) * Math.min(1, dt * 12);
    player.vy += (dy * speed - player.vy) * Math.min(1, dt * 12);
    if (!dx) player.vx *= Math.pow(0.004, dt);
    if (!dy) player.vy *= Math.pow(0.004, dt);
    const nextX = clamp(player.x + player.vx * dt, ROOM.left + 36, ROOM.right - 36);
    const nextY = clamp(player.y + player.vy * dt, ROOM.top + 48, ROOM.bottom - 32);
    const next = rootwakeStrength(this.phase, this.hazard, this.phaseTime) > 0.72
      ? resolveRootPosition(nextX, nextY)
      : { x: nextX, y: nextY };
    if (next.x !== nextX) player.vx *= 0.08;
    if (next.y !== nextY) player.vy *= 0.08;
    player.x = next.x;
    player.y = next.y;

    const station = this.stations.find((entry) => dist(entry, player) < 84 && !entry.completed && entry.cooldown <= 0);
    if (station && !station.puzzle && pressed("KeyE") && this.phase === "CALM") {
      this.taskHold += dt;
      if (this.taskHold >= 1.8) {
        this.taskHold = 0;
        this.completeStation(station, player.role === "IMPOSTOR");
      }
    } else {
      this.taskHold = Math.max(0, this.taskHold - dt * 1.4);
    }
  }

  updateBots(dt: number) {
    for (const player of this.players) {
      if (!player.ai || !player.alive) continue;
      const discoveredBody = this.bodies.find((body) => dist(player, body) < 72);
      if (discoveredBody && Math.random() < dt * (player.role === "IMPOSTOR" ? 0.18 : 0.7)) {
        this.startMeeting(`${discoveredBody.name.toUpperCase()} WAS FOUND AS A JELLY PUDDLE`, player.name.toUpperCase());
        return;
      }
      if (this.elapsed > player.thinkAt || dist(player, { x: player.targetX, y: player.targetY }) < 22) {
        player.thinkAt = this.elapsed + 1.2 + Math.random() * 2.2;
        if (this.phase === "CALM" || this.phase === "COUNTDOWN") {
          const station = this.stations[player.atStation % this.stations.length];
          player.targetX = station.x + (Math.random() - 0.5) * 28;
          player.targetY = station.y + (station.side === "top" ? 66 : station.side === "bottom" ? -62 : 0) + (Math.random() - 0.5) * 24;
          if (station.side === "left") player.targetX += 66;
          if (station.side === "right") player.targetX -= 66;
        } else if (player.role === "IMPOSTOR" && !this.killUsedThisOrdeal && this.elapsed >= this.killCooldownUntil) {
          const victims = this.players.filter((entry) =>
            entry.alive
            && entry.role === "CREWMATE"
            && (this.hazard !== "ROOTWAKE" || sharesRootCell(entry, player))
          );
          const victim = victims.sort((a, b) => dist(a, player) - dist(b, player))[0];
          if (victim) {
            player.targetX = victim.x;
            player.targetY = victim.y;
          }
        } else {
          player.targetX = ROOM.left + 100 + Math.random() * (ROOM.right - ROOM.left - 200);
          player.targetY = ROOM.top + 90 + Math.random() * (ROOM.bottom - ROOM.top - 150);
        }
      }

      const dx = player.targetX - player.x;
      const dy = player.targetY - player.y;
      const length = Math.hypot(dx, dy) || 1;
      const speed = player.role === "IMPOSTOR" && this.phase === "ORDEAL" ? 148 : 122;
      player.vx += ((dx / length) * speed - player.vx) * Math.min(1, dt * 5);
      player.vy += ((dy / length) * speed - player.vy) * Math.min(1, dt * 5);
      const nextX = clamp(player.x + player.vx * dt, ROOM.left + 36, ROOM.right - 36);
      const nextY = clamp(player.y + player.vy * dt, ROOM.top + 48, ROOM.bottom - 32);
      const next = rootwakeStrength(this.phase, this.hazard, this.phaseTime) > 0.72
        ? resolveRootPosition(nextX, nextY)
        : { x: nextX, y: nextY };
      if (next.x !== nextX) player.vx *= -0.18;
      if (next.y !== nextY) player.vy *= -0.18;
      player.x = next.x;
      player.y = next.y;

      if (this.phase === "CALM" && player.role === "CREWMATE") {
        const station = this.stations[player.atStation % this.stations.length];
        if (station.completed) {
          player.atStation = (player.atStation + 1) % this.stations.length;
        } else if (dist(player, station) < 78 && station.cooldown <= 0) {
          this.taskProgress = Math.min(100, this.taskProgress + dt * 0.34);
          if (Math.random() < dt * 0.2) {
            station.cooldown = 3;
            player.gearCharges[station.reward] = Math.min(3, player.gearCharges[station.reward] + 1);
            player.atStation = (player.atStation + 1 + Math.floor(Math.random() * 3)) % this.stations.length;
          }
        }
      }

      if (this.phase === "ORDEAL") {
        if (!player.flashlight && player.gearCharges.FLASHLIGHT > 0 && Math.random() < dt * 0.12) {
          player.flashlight = true;
          player.gearCharges.FLASHLIGHT -= 1;
        }
        if (!player.flareDropped && player.gearCharges.FLARE > 0 && Math.random() < dt * 0.055) {
          this.flares.push({ x: player.x, y: player.y, life: 5, owner: player.id });
          player.flareDropped = true;
          player.gearCharges.FLARE -= 1;
        }
        if (player.role === "IMPOSTOR" && !this.killUsedThisOrdeal && this.elapsed >= this.killCooldownUntil && this.phaseTime < 8.4) {
          const victim = this.players
            .filter((entry) =>
              entry.alive
              && entry.role === "CREWMATE"
              && (this.hazard !== "ROOTWAKE" || sharesRootCell(entry, player))
            )
            .sort((a, b) => dist(a, player) - dist(b, player))[0];
          if (victim && dist(victim, player) < 66) {
            this.eliminate(victim, player);
            this.killCooldownUntil = this.elapsed + KILL_COOLDOWN_SECONDS;
          }
        }
      } else {
        player.flashlight = false;
      }
    }
    this.checkWin();
  }

  getPhantoms() {
    const time = 10 - clamp(this.phaseTime, 0, 10);
    return PHANTOM_SEEDS.map((seed, index): Player => {
      const theta = time * seed.speed + seed.phase;
      const verticalTheta = time * seed.speed * 0.82 + seed.phase * 1.35;
      return {
        id: `phantom-${index}`,
        name: "",
        role: "CREWMATE",
        x: seed.x + Math.sin(theta) * seed.rx,
        y: seed.y + Math.cos(verticalTheta) * seed.ry,
        vx: Math.cos(theta) * seed.rx * seed.speed,
        vy: -Math.sin(verticalTheta) * seed.ry * seed.speed * 0.82,
        color: "#77828c",
        hat: "mooncap",
        alive: true,
        ai: true,
        targetX: seed.x,
        targetY: seed.y,
        thinkAt: 0,
        atStation: 0,
        flashlight: false,
        flareDropped: false,
        gearCharges: { FLASHLIGHT: 0, FLARE: 0, SONAR: 0 },
      };
    });
  }

  draw() {
    const dpr = this.canvas.width / W;
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    this.drawRoom(ctx);
    this.drawBeams(ctx);
    for (const body of this.bodies) this.drawBody(ctx, body);
    const moonGlareActive = this.phase === "ORDEAL" && this.hazard === "MOONGLARE";
    const phantomProcessionActive = this.phase === "ORDEAL" && this.hazard === "PHANTOMS";
    const rootwakeActive = this.phase === "ORDEAL" && this.hazard === "ROOTWAKE";
    if (moonGlareActive) this.drawLighting(ctx);
    const ordered = [
      ...this.players.filter((player) => player.alive).map((player) => ({ player, phantom: false })),
      ...(phantomProcessionActive ? this.getPhantoms().map((player) => ({ player, phantom: true })) : []),
    ].sort((a, b) => a.player.y - b.player.y);
    const moonSightActive = this.human.role === "IMPOSTOR" && this.elapsed < this.moonSightUntil;
    const sonarActive = this.selectedItem === "SONAR" && this.elapsed < this.itemActiveUntil;
    for (const entry of ordered) {
      const { player } = entry;
      if (entry.phantom) {
        this.drawSlime(ctx, player, true, false, false, 0.78);
        if (sonarActive) this.drawPhantomMarker(ctx, player);
        continue;
      }
      const isLocal = player.id === this.localPlayerId;
      const revealed = isLocal || moonSightActive || this.isRevealed(player);
      if (this.phase === "ORDEAL" && this.hazard === "BLACKOUT" && !revealed) continue;
      const silhouette = moonGlareActive || phantomProcessionActive || (this.phase === "ORDEAL" && this.hazard === "FOG" && !revealed);
      const colorMuted = this.phase === "ORDEAL" && !silhouette && (this.hazard === "BLACKOUT" || this.hazard === "FOG");
      const visibilityAlpha = this.phase !== "ORDEAL"
        ? 1
        : this.hazard === "BLACKOUT"
          ? 0.56
          : this.hazard === "FOG"
            ? silhouette ? 0.48 : 0.7
            : this.hazard === "PHANTOMS"
              ? 0.78
            : 1;
      this.drawSlime(ctx, player, silhouette, moonSightActive && !isLocal, colorMuted, visibilityAlpha);
    }
    if (!moonGlareActive) this.drawLighting(ctx);
    this.drawParticles(ctx);
    if (rootwakeActive) {
      this.drawRootwakeOcclusion(ctx);
      this.drawRootwake(ctx);
    }
    this.drawCanvasLabels(ctx);
  }

  drawRootwakeOcclusion(ctx: CanvasRenderingContext2D) {
    const strength = rootwakeStrength(this.phase, this.hazard, this.phaseTime);
    if (strength <= 0) return;
    const cell = getRootCell(this.human.x, this.human.y);
    ctx.save();
    ctx.fillStyle = `rgba(1,4,10,${0.985 * strength})`;
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.rect(cell.x, cell.y, cell.w, cell.h);
    ctx.fill("evenodd");

    const pulse = 0.5 + Math.sin(this.elapsed * 4.8) * 0.5;
    ctx.strokeStyle = `rgba(108,255,181,${strength * (0.14 + pulse * 0.12)})`;
    ctx.lineWidth = 9;
    ctx.strokeRect(cell.x + 3, cell.y + 3, cell.w - 6, cell.h - 6);
    ctx.strokeStyle = `rgba(139,247,181,${strength * (0.5 + pulse * 0.22)})`;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(cell.x + 3, cell.y + 3, cell.w - 6, cell.h - 6);
    ctx.fillStyle = `rgba(205,255,222,${strength * 0.82})`;
    ctx.font = "900 11px ui-monospace, monospace";
    ctx.textAlign = "left";
    ctx.fillText(`CELL ${cell.index + 1}  •  LOCAL WARD`, cell.x + 16, cell.y + 24);
    ctx.restore();
  }

  drawRootwake(ctx: CanvasRenderingContext2D) {
    const strength = rootwakeStrength(this.phase, this.hazard, this.phaseTime);
    if (strength <= 0) return;
    ctx.save();
    for (const [barrierIndex, barrier] of ROOT_BARRIERS.entries()) {
      const horizontal = barrier.w > barrier.h;
      const rootWidth = horizontal ? barrier.h : barrier.w;
      const rootLength = horizontal ? barrier.w : barrier.h;
      const centerX = barrier.x + barrier.w / 2;
      const centerY = barrier.y + barrier.h / 2;
      const pulse = 0.5 + Math.sin(this.elapsed * 6 + barrierIndex) * 0.5;
      ctx.save();
      ctx.translate(centerX, centerY);
      if (horizontal) ctx.rotate(Math.PI / 2);
      ctx.scale(0.75 + strength * 0.25, 0.08 + strength * 0.92);
      const rootGradient = ctx.createLinearGradient(-rootWidth / 2, 0, rootWidth / 2, 0);
      rootGradient.addColorStop(0, "#13291f");
      rootGradient.addColorStop(0.45, "#3c744c");
      rootGradient.addColorStop(0.7, "#203d2b");
      rootGradient.addColorStop(1, "#091a13");
      ctx.fillStyle = rootGradient;
      ctx.beginPath();
      ctx.roundRect(-rootWidth / 2, -rootLength / 2, rootWidth, rootLength, 18);
      ctx.fill();
      ctx.strokeStyle = `rgba(111,255,181,${0.14 + pulse * 0.14})`;
      ctx.lineWidth = 11;
      ctx.stroke();
      ctx.strokeStyle = "rgba(139,238,172,.72)";
      ctx.lineWidth = 3;
      ctx.stroke();
      for (let strand = -1; strand <= 1; strand += 1) {
        ctx.strokeStyle = strand === 0 ? "rgba(204,255,199,.5)" : "rgba(72,123,78,.9)";
        ctx.lineWidth = strand === 0 ? 3 : 5;
        ctx.beginPath();
        ctx.moveTo(strand * 9, -rootLength / 2);
        for (let y = -rootLength / 2; y <= rootLength / 2; y += 28) {
          ctx.lineTo(strand * 9 + Math.sin(y * 0.065 + barrierIndex) * 8, y);
        }
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(188,244,147,.72)";
      ctx.beginPath();
      for (let y = -rootLength / 2 + 22; y < rootLength / 2; y += 43) {
        const side = (Math.floor(y / 43) + barrierIndex) % 2 ? 1 : -1;
        ctx.moveTo(side * rootWidth * 0.34, y);
        ctx.lineTo(side * (rootWidth * 0.5 + 13), y - 7);
        ctx.lineTo(side * rootWidth * 0.43, y + 8);
        ctx.closePath();
      }
      ctx.fill();
      ctx.restore();
    }
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = `rgba(83,222,143,${0.05 + strength * 0.05})`;
    ctx.beginPath();
    for (let i = 0; i < 24; i += 1) {
      const barrier = ROOT_BARRIERS[i % ROOT_BARRIERS.length];
      const horizontal = barrier.w > barrier.h;
      const travel = ((i * 0.173 + this.elapsed * 0.035) % 1) - 0.5;
      const x = barrier.x + barrier.w / 2 + (horizontal ? travel * barrier.w : Math.sin(this.elapsed * 1.8 + i) * 30);
      const y = barrier.y + barrier.h / 2 + (horizontal ? Math.sin(this.elapsed * 1.8 + i) * 30 : travel * barrier.h);
      const r = 2 + (i % 3);
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.restore();
  }

  drawPhantomMarker(ctx: CanvasRenderingContext2D, phantom: Player) {
    const pulse = 1 + Math.sin(this.elapsed * 10 + Number(phantom.id.replace(/\D/g, ""))) * 0.08;
    ctx.save();
    ctx.translate(phantom.x, phantom.y);
    ctx.scale(pulse, pulse);
    ctx.strokeStyle = "rgba(79,241,255,.92)";
    ctx.fillStyle = "rgba(5,25,34,.78)";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(0, 0, 50, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(-24, -24);
    ctx.lineTo(24, 24);
    ctx.moveTo(24, -24);
    ctx.lineTo(-24, 24);
    ctx.stroke();
    ctx.fillRect(-34, -67, 68, 16);
    ctx.fillStyle = "#8ff7ff";
    ctx.font = "900 8px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText("FALSE ECHO", 0, -56);
    ctx.restore();
  }

  renderStaticBackground() {
    const ctx = this.bgCtx;
    ctx.clearRect(0, 0, W, H);

    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#11132f");
    bg.addColorStop(0.52, "#091421");
    bg.addColorStop(1, "#020609");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const moonGlow = ctx.createRadialGradient(1030, 74, 10, 1030, 74, 118);
    moonGlow.addColorStop(0, "rgba(244,247,225,.95)");
    moonGlow.addColorStop(0.27, "rgba(213,224,231,.48)");
    moonGlow.addColorStop(1, "rgba(160,181,229,0)");
    ctx.fillStyle = moonGlow;
    ctx.beginPath();
    ctx.arc(1030, 74, 118, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e9ecd9";
    ctx.beginPath();
    ctx.arc(1030, 74, 52, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(157,166,172,.18)";
    ctx.beginPath();
    ctx.arc(1012, 58, 12, 0, Math.PI * 2);
    ctx.arc(1048, 87, 8, 0, Math.PI * 2);
    ctx.fill();

    // Layered peaks make the sanctuary feel suspended over a mountain range.
    ctx.fillStyle = "#10172a";
    ctx.beginPath();
    ctx.moveTo(0, 244);
    ctx.lineTo(160, 82);
    ctx.lineTo(286, 215);
    ctx.lineTo(432, 61);
    ctx.lineTo(610, 226);
    ctx.lineTo(760, 92);
    ctx.lineTo(925, 222);
    ctx.lineTo(1110, 74);
    ctx.lineTo(W, 210);
    ctx.lineTo(W, 310);
    ctx.lineTo(0, 310);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(173,190,217,.2)";
    ctx.beginPath();
    ctx.moveTo(128, 116);
    ctx.lineTo(160, 82);
    ctx.lineTo(197, 121);
    ctx.lineTo(178, 112);
    ctx.lineTo(161, 129);
    ctx.lineTo(145, 109);
    ctx.closePath();
    ctx.moveTo(388, 108);
    ctx.lineTo(432, 61);
    ctx.lineTo(478, 105);
    ctx.lineTo(451, 94);
    ctx.lineTo(432, 118);
    ctx.lineTo(414, 93);
    ctx.closePath();
    ctx.fill();

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.8)";
    ctx.shadowBlur = 38;
    const outerStone = ctx.createLinearGradient(0, ROOM.top, 0, ROOM.bottom);
    outerStone.addColorStop(0, "#65727e");
    outerStone.addColorStop(0.4, "#36434a");
    outerStone.addColorStop(1, "#202b2c");
    ctx.fillStyle = outerStone;
    ctx.strokeStyle = "#0b1014";
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.roundRect(ROOM.left, ROOM.top, ROOM.right - ROOM.left, ROOM.bottom - ROOM.top, 64);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "rgba(194,211,228,.46)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();

    const sanctuaryFloor = ctx.createRadialGradient(640, 360, 50, 640, 380, 680);
    sanctuaryFloor.addColorStop(0, "#263e3b");
    sanctuaryFloor.addColorStop(0.46, "#172e2d");
    sanctuaryFloor.addColorStop(1, "#0b1b1d");
    ctx.fillStyle = sanctuaryFloor;
    ctx.beginPath();
    ctx.roundRect(ROOM.left + 22, ROOM.top + 22, ROOM.right - ROOM.left - 44, ROOM.bottom - ROOM.top - 44, 46);
    ctx.fill();

    // Open stone arches look out over the moonlit peaks.
    this.drawMountainVista(ctx, 290, 104, 282, 78, 0);
    this.drawMountainVista(ctx, 708, 104, 282, 78, 1);

    // Ancient slate rings and radial runes define the playable sanctuary.
    ctx.save();
    ctx.strokeStyle = "rgba(177,203,210,.12)";
    ctx.lineWidth = 2;
    for (let radius = 108; radius < 590; radius += 76) {
      ctx.beginPath();
      ctx.ellipse(W / 2, 386, radius * 1.45, radius * 0.63, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(180,197,242,.17)";
    for (let i = 0; i < 18; i += 1) {
      const angle = (i / 18) * Math.PI * 2;
      const innerX = 640 + Math.cos(angle) * 92;
      const innerY = 382 + Math.sin(angle) * 58;
      ctx.beginPath();
      ctx.moveTo(innerX, innerY);
      ctx.lineTo(640 + Math.cos(angle) * 525, 382 + Math.sin(angle) * 250);
      ctx.stroke();
    }
    ctx.restore();

    // A crescent medallion replaces the mechanical centerpiece.
    ctx.save();
    ctx.translate(640, 382);
    const medallion = ctx.createRadialGradient(0, 0, 18, 0, 0, 105);
    medallion.addColorStop(0, "rgba(123,157,185,.34)");
    medallion.addColorStop(1, "rgba(9,29,34,.18)");
    ctx.fillStyle = medallion;
    ctx.strokeStyle = "rgba(200,216,236,.42)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 0, 112, 78, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(205,221,235,.16)";
    ctx.beginPath();
    ctx.arc(-9, -4, 50, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#193331";
    ctx.beginPath();
    ctx.arc(12, -15, 48, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(199,219,243,.3)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * 65, Math.sin(angle) * 43);
      ctx.lineTo(Math.cos(angle) * 82, Math.sin(angle) * 53);
      ctx.stroke();
    }
    ctx.restore();

    this.drawRuneBorder(ctx, ROOM.left + 42, ROOM.top + 31, ROOM.right - ROOM.left - 84);
    this.drawRuneBorder(ctx, ROOM.left + 42, ROOM.bottom - 35, ROOM.right - ROOM.left - 84);

    this.drawPineGrove(ctx, 145, 628, 1);
    this.drawPineGrove(ctx, 1137, 628, -1);

    // Moonstone pillars and climbing roots frame the glade.
    for (const side of [-1, 1]) {
      const x = side < 0 ? 116 : 1164;
      ctx.strokeStyle = "rgba(82,109,91,.72)";
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(x, 188);
      ctx.bezierCurveTo(x + side * 28, 270, x - side * 24, 492, x + side * 18, 580);
      ctx.stroke();
      for (let y = 205; y < 590; y += 58) {
        ctx.fillStyle = y % 116 ? "#455258" : "#59666c";
        ctx.strokeStyle = "#182126";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(x - 15, y, 30, 43, 9);
        ctx.fill();
        ctx.stroke();
      }
    }

    ctx.font = "800 12px Georgia, serif";
    ctx.letterSpacing = "2px";
    ctx.fillStyle = "rgba(202,216,232,.65)";
    ctx.textAlign = "center";
    ctx.fillText("MOONWARDEN SANCTUARY  •  SILVERPINE SUMMIT", W / 2, ROOM.bottom - 56);
    ctx.letterSpacing = "0px";
  }

  drawRoom(ctx: CanvasRenderingContext2D) {
    // 1. Blit the pre-rendered static mountain sanctuary in 0.05ms
    ctx.drawImage(this.bgCanvas, 0, 0);

    // 2. Dynamic twinkling stars (batched into 3 alpha buckets for 24x fewer draw calls)
    for (let bucket = 0; bucket < 3; bucket += 1) {
      const twinkle = 0.22 + (Math.sin(this.elapsed * (0.75 + bucket * 0.22) + bucket * 2.1) + 1) * 0.18;
      ctx.fillStyle = `rgba(215,229,255,${twinkle.toFixed(2)})`;
      ctx.beginPath();
      for (let i = bucket; i < 72; i += 3) {
        const x = (i * 149 + 37) % W;
        const y = 12 + ((i * 83) % 260);
        const r = i % 9 === 0 ? 1.8 : 0.9;
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    // Living moon-tech lines give the old sanctuary a cleaner, modern pulse.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const circuitPulse = 0.08 + (Math.sin(this.elapsed * 1.7) + 1) * 0.035;
    ctx.strokeStyle = `rgba(77,231,218,${circuitPulse})`;
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.ellipse(640, 382, 168 + i * 102, 92 + i * 55, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    const sweepAngle = this.elapsed * 0.22;
    const sweep = ctx.createLinearGradient(640, 382, 640 + Math.cos(sweepAngle) * 500, 382 + Math.sin(sweepAngle) * 260);
    sweep.addColorStop(0, "rgba(104,246,221,.3)");
    sweep.addColorStop(1, "rgba(130,94,224,0)");
    ctx.strokeStyle = sweep;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(640, 382);
    ctx.lineTo(640 + Math.cos(sweepAngle) * 520, 382 + Math.sin(sweepAngle) * 270);
    ctx.stroke();
    ctx.restore();

    // 3. Dynamic stations and emergency bell
    for (const station of this.stations) this.drawStation(ctx, station);
    this.drawEmergency(ctx);
  }

  drawMountainVista(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, seed: number) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 28);
    ctx.clip();
    const sky = ctx.createLinearGradient(0, y, 0, y + height);
    sky.addColorStop(0, "#202c55");
    sky.addColorStop(1, "#71809a");
    ctx.fillStyle = sky;
    ctx.fillRect(x, y, width, height);
    for (let i = 0; i < 12; i += 1) {
      ctx.fillStyle = "rgba(229,238,255,.55)";
      ctx.beginPath();
      ctx.arc(x + ((i * 47 + seed * 31) % width), y + 9 + ((i * 17) % 37), i % 4 === 0 ? 1.4 : .7, 0, Math.PI * 2);
      ctx.fill();
    }
    if (seed === 1) {
      ctx.fillStyle = "rgba(237,239,219,.86)";
      ctx.beginPath();
      ctx.arc(x + width - 48, y + 25, 17, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#344354";
    ctx.beginPath();
    ctx.moveTo(x - 8, y + height);
    ctx.lineTo(x + 65, y + 22 + seed * 7);
    ctx.lineTo(x + 129, y + height);
    ctx.lineTo(x + 196, y + 31 - seed * 5);
    ctx.lineTo(x + width + 8, y + height);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#152824";
    for (let i = 0; i < 11; i += 1) {
      const pineX = x + 7 + i * (width / 10);
      const pineHeight = 17 + ((i * 7 + seed * 9) % 24);
      ctx.beginPath();
      ctx.moveTo(pineX, y + height - pineHeight);
      ctx.lineTo(pineX - 10, y + height);
      ctx.lineTo(pineX + 10, y + height);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = "#7d898e";
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 28);
    ctx.stroke();
    ctx.strokeStyle = "rgba(215,228,240,.42)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  drawRuneBorder(ctx: CanvasRenderingContext2D, x: number, y: number, width: number) {
    ctx.save();
    ctx.strokeStyle = "rgba(190,210,229,.44)";
    ctx.lineWidth = 2;
    for (let cursor = 0; cursor < width; cursor += 37) {
      ctx.beginPath();
      ctx.moveTo(x + cursor, y + 6);
      ctx.lineTo(x + cursor + 9, y - 3);
      ctx.lineTo(x + cursor + 18, y + 6);
      ctx.lineTo(x + cursor + 27, y - 3);
      ctx.lineTo(x + cursor + 36, y + 6);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawPineGrove(ctx: CanvasRenderingContext2D, x: number, y: number, direction: number) {
    ctx.save();
    ctx.translate(x, y);
    for (let i = 0; i < 5; i += 1) {
      const treeX = direction * (-34 + i * 18);
      const treeHeight = 42 + ((i * 13) % 39);
      ctx.fillStyle = "#172823";
      ctx.strokeStyle = "#08120f";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(treeX, -treeHeight);
      ctx.lineTo(treeX - 23, 5);
      ctx.lineTo(treeX + 23, 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(142,183,170,.22)";
      ctx.beginPath();
      ctx.moveTo(treeX, -treeHeight + 7);
      ctx.lineTo(treeX - 7, -treeHeight + 28);
      ctx.lineTo(treeX + 2, -treeHeight + 21);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = "#273732";
    ctx.beginPath();
    ctx.ellipse(0, 9, 61, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawStation(ctx: CanvasRenderingContext2D, station: Station) {
    drawForestSanctum(ctx, station, this.elapsed, this.phase !== "CALM", dist(station, this.human) < 128);
  }

  drawEmergency(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.translate(640, 382);
    ctx.fillStyle = "rgba(1,8,12,.58)";
    ctx.beginPath();
    ctx.ellipse(0, 39, 91, 42, 0, 0, Math.PI * 2);
    ctx.fill();
    const base = ctx.createRadialGradient(-18, -18, 5, 0, 0, 70);
    base.addColorStop(0, "#9ca8aa");
    base.addColorStop(0.5, "#596769");
    base.addColorStop(1, "#283437");
    ctx.fillStyle = base;
    ctx.strokeStyle = "#11191c";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.ellipse(0, 0, 70, 58, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "rgba(216,230,242,.52)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 48, Math.PI * 0.1, Math.PI * 1.9);
    ctx.stroke();
    for (let i = 0; i < 7; i += 1) {
      const angle = -Math.PI * 0.84 + i * 0.28;
      ctx.strokeStyle = i % 2 ? "#839599" : "#b7c7ca";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * 20, Math.sin(angle) * 20 - 5);
      ctx.quadraticCurveTo(Math.cos(angle) * 42, Math.sin(angle) * 35 - 12, Math.cos(angle) * 53, Math.sin(angle) * 50 - 2);
      ctx.stroke();
    }

    // Hardware-accelerated radial bloom for bell orb
    const bellHalo = ctx.createRadialGradient(0, -7, 6, 0, -7, 36);
    bellHalo.addColorStop(0, "rgba(207,220,255,.75)");
    bellHalo.addColorStop(0.45, "rgba(155,188,255,.22)");
    bellHalo.addColorStop(1, "rgba(155,188,255,0)");
    ctx.fillStyle = bellHalo;
    ctx.beginPath();
    ctx.arc(0, -7, 36, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#cfdcff";
    ctx.beginPath();
    ctx.arc(0, -7, 20 + Math.sin(this.elapsed * 3) * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.65)";
    ctx.beginPath();
    ctx.arc(-7, -14, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#18262a";
    ctx.strokeStyle = "#9cabb5";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-52, 31, 104, 21, 10);
    ctx.fill();
    ctx.stroke();
    ctx.font = "900 9px Georgia, serif";
    ctx.fillStyle = "#e3edf5";
    ctx.textAlign = "center";
    ctx.fillText("WARDEN BELL", 0, 45);
    ctx.restore();
  }

  drawBeams(ctx: CanvasRenderingContext2D) {
    if (this.phase !== "ORDEAL") return;
    for (const player of this.players) {
      if (!player.alive) continue;
      const isLocal = player.id === this.localPlayerId;
      const humanActive = isLocal && this.selectedItem === "FLASHLIGHT" && this.elapsed < this.itemActiveUntil;
      if (!player.flashlight && !humanActive) continue;
      const angle = isLocal
        ? Math.atan2(this.mouse.y - player.y, this.mouse.x - player.x)
        : (typeof player.angle === "number" ? player.angle : Math.atan2(player.vy, player.vx));
      const gradient = ctx.createRadialGradient(player.x, player.y, 15, player.x, player.y, 330);
      gradient.addColorStop(0, "rgba(255,244,181,.24)");
      gradient.addColorStop(1, "rgba(255,244,181,0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(player.x, player.y);
      ctx.arc(player.x, player.y, 330, angle - Math.PI / 8, angle + Math.PI / 8);
      ctx.closePath();
      ctx.fill();
    }
    for (const flare of this.flares) {
      const radius = 142 * Math.min(1, flare.life * 2);
      const gradient = ctx.createRadialGradient(flare.x, flare.y, 5, flare.x, flare.y, radius);
      gradient.addColorStop(0, "rgba(255,92,73,.55)");
      gradient.addColorStop(0.45, "rgba(255,154,74,.2)");
      gradient.addColorStop(1, "rgba(255,92,73,0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(flare.x, flare.y, radius, 0, Math.PI * 2);
      ctx.fill();

      // Hardware-accelerated radial flare core glow
      const flareHalo = ctx.createRadialGradient(flare.x, flare.y, 2, flare.x, flare.y, 20);
      flareHalo.addColorStop(0, "#fff2ac");
      flareHalo.addColorStop(0.45, "rgba(255,82,61,0.6)");
      flareHalo.addColorStop(1, "rgba(255,82,61,0)");
      ctx.fillStyle = flareHalo;
      ctx.beginPath();
      ctx.arc(flare.x, flare.y, 20, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#fff2ac";
      ctx.beginPath();
      ctx.arc(flare.x, flare.y, 6 + Math.sin(this.elapsed * 20) * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  bodyPath(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, lean = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.transform(width / 64, 0, -lean / 70, height / 68, 0, 0);
    slimeOutline(ctx);
    ctx.restore();
  }

  drawSlime(ctx: CanvasRenderingContext2D, player: Player, silhouette = false, moonSightMarked = false, colorMuted = false, visibilityAlpha = 1) {
    const speed = Math.hypot(player.vx, player.vy);
    const seed = Array.from(player.id).reduce((sum, letter) => (sum * 31 + letter.charCodeAt(0)) % 997, 0);
    const stride = this.elapsed * 4.2 + seed * 0.13;
    const bounce = Math.sin(stride) * Math.min(0.6, speed / 240);
    const squash = 1 + Math.sin(stride) * Math.min(0.022, speed / 7000) + Math.sin(this.elapsed * 1.6 + seed) * 0.006;
    const width = 64 * squash;
    const height = 68 / squash;
    const lean = clamp(player.vx / 60, -3, 3);
    const x = player.x;
    const y = player.y + bounce;
    const baseColor = colorMuted ? muteHexColor(player.color) : player.color;

    ctx.save();
    ctx.globalAlpha = visibilityAlpha;
    if (moonSightMarked) {
      const aura = ctx.createRadialGradient(x, y, 18, x, y, 64);
      aura.addColorStop(0, "rgba(244,116,255,.24)");
      aura.addColorStop(0.58, "rgba(138,92,255,.14)");
      aura.addColorStop(1, "rgba(83,232,255,0)");
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(x, y, 64, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(225,132,255,.72)";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 7]);
      ctx.beginPath();
      ctx.arc(x, y, 48 + Math.sin(this.elapsed * 7) * 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const contact = ctx.createRadialGradient(x, player.y + 29, 4, x, player.y + 29, 39);
    contact.addColorStop(0, "rgba(1,8,13,.52)");
    contact.addColorStop(1, "rgba(1,8,13,0)");
    ctx.fillStyle = contact;
    ctx.beginPath();
    ctx.ellipse(x, player.y + 31, 40, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    if (speed > 55 && !silhouette) {
      ctx.fillStyle = baseColor;
      ctx.globalAlpha = visibilityAlpha * 0.075;
      ctx.beginPath();
      ctx.ellipse(x - clamp(player.vx / speed, -1, 1) * 19, y + 29 - clamp(player.vy / speed, -1, 1) * 10, 18, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = visibilityAlpha;
    }

    if (silhouette) {
      this.bodyPath(ctx, x, y, width, height, lean);
      const gradient = ctx.createLinearGradient(x - 25, y - 38, x + 28, y + 38);
      gradient.addColorStop(0, "rgba(137,150,157,.94)");
      gradient.addColorStop(1, "rgba(63,75,84,.96)");
      ctx.fillStyle = gradient;
      ctx.strokeStyle = "rgba(31,42,49,.9)";
      ctx.lineWidth = 1.3;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.transform(squash, 0, -lean / 70, 1 / squash, 0, 0);
    ctx.drawImage(slimeSkin(baseColor), -48, -54, 96, 112);
    ctx.restore();

    const blink = (this.elapsed + seed * 0.037) % 6.3 < 0.16;
    const gazeX = clamp(player.vx / 160, -0.8, 0.8) + lean * 0.2;
    const gazeY = clamp(player.vy / 220, -0.6, 0.6);
    ctx.fillStyle = "rgba(7,22,29,.82)";
    ctx.beginPath();
    ctx.ellipse(x - 7 + gazeX, y + 1 + gazeY, 2, blink ? 0.5 : 2.6, 0, 0, Math.PI * 2);
    ctx.moveTo(x + 10 + gazeX, y + 1 + gazeY);
    ctx.ellipse(x + 8 + gazeX, y + 1 + gazeY, 2, blink ? 0.5 : 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
    if (!blink) {
      ctx.fillStyle = "rgba(170,199,206,.4)";
      ctx.beginPath();
      ctx.arc(x - 7.5 + gazeX, y + gazeY, 0.5, 0, Math.PI * 2);
      ctx.moveTo(x + 8 + gazeX, y + gazeY);
      ctx.arc(x + 7.5 + gazeX, y + gazeY, 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    this.drawHat(ctx, player.hat, x + lean * 0.6, y - 43, colorMuted);
    ctx.font = "900 12px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(5,10,15,.92)";
    const privateRed = player.id === this.localPlayerId && this.human.role === "IMPOSTOR";
    const label = player.name;
    ctx.strokeText(label, x, y - 61);
    ctx.fillStyle = privateRed ? "#ff5362" : (colorMuted ? "#cfd8dc" : "#ffffff");
    ctx.fillText(label, x, y - 61);
    ctx.restore();
  }

  drawHat(ctx: CanvasRenderingContext2D, hat: Hat, x: number, y: number, muted: boolean) {
    ctx.save();
    ctx.translate(x, y + 5);
    ctx.scale(0.82, 0.82);
    x = 0;
    y = 0;
    const pale = muted ? "#9ca9ae" : "#a1b4b8";
    const cloth = ctx.createLinearGradient(-25, -15, 25, 20);
    cloth.addColorStop(0, muted ? "#69767d" : "#475361");
    cloth.addColorStop(1, muted ? "#48545b" : "#1b2935");
    const night = cloth;
    ctx.strokeStyle = "rgba(10,22,30,.6)";
    ctx.lineWidth = 1.5;
    if (hat === "antlers") {
      ctx.strokeStyle = muted ? "#66716f" : "#817b69";
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x - 14, y + 17);
      ctx.quadraticCurveTo(x - 27, y + 2, x - 23, y - 13);
      ctx.moveTo(x - 24, y - 5);
      ctx.lineTo(x - 34, y - 12);
      ctx.moveTo(x - 24, y + 2);
      ctx.lineTo(x - 36, y + 1);
      ctx.moveTo(x + 14, y + 17);
      ctx.quadraticCurveTo(x + 27, y + 2, x + 23, y - 13);
      ctx.moveTo(x + 24, y - 5);
      ctx.lineTo(x + 34, y - 12);
      ctx.moveTo(x + 24, y + 2);
      ctx.lineTo(x + 36, y + 1);
      ctx.stroke();
      ctx.lineCap = "butt";
      ctx.fillStyle = night;
      ctx.beginPath();
      ctx.ellipse(x, y + 14, 25, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(10,22,30,.6)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else if (hat === "hood") {
      ctx.fillStyle = night;
      ctx.beginPath();
      ctx.moveTo(x - 26, y + 18);
      ctx.quadraticCurveTo(x - 23, y - 13, x, y - 18);
      ctx.quadraticCurveTo(x + 23, y - 13, x + 26, y + 18);
      ctx.quadraticCurveTo(x, y + 6, x - 26, y + 18);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(10,22,30,.6)";
      ctx.stroke();
      ctx.fillStyle = pale;
      ctx.beginPath();
      ctx.arc(x - 2, y - 2, 8, -Math.PI * .6, Math.PI * .6);
      ctx.fill();
    } else if (hat === "moth") {
      ctx.fillStyle = muted ? "#839093" : "#9ca9bb";
      ctx.strokeStyle = "rgba(10,22,30,.6)";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.ellipse(x - 14, y + 5, 17, 10, -.48, 0, Math.PI * 2);
      ctx.ellipse(x + 14, y + 5, 17, 10, .48, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = muted ? "#647275" : "#5d6c81";
      ctx.beginPath();
      ctx.ellipse(x, y + 7, 7, 15, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = night;
      ctx.strokeStyle = "rgba(10,22,30,.6)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - 27, y + 17);
      ctx.quadraticCurveTo(x - 8, y - 7, x + 7, y - 22);
      ctx.quadraticCurveTo(x + 17, y - 4, x + 25, y + 17);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = pale;
      ctx.beginPath();
      ctx.arc(x + 2, y + 1, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = night;
      ctx.beginPath();
      ctx.arc(x + 6, y - 2, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawBody(ctx: CanvasRenderingContext2D, body: Body) {
    const wobble = Math.sin(this.elapsed * 3 + body.age) * 2;
    ctx.save();
    ctx.translate(body.x, body.y + 28);
    ctx.fillStyle = `${body.color}a8`;
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-45, 5);
    ctx.bezierCurveTo(-38, -18, -12, -15 - wobble, -2, -9);
    ctx.bezierCurveTo(9, -26, 34, -15, 43, 2);
    ctx.bezierCurveTo(56, 14, 22, 22, 7, 15);
    ctx.bezierCurveTo(-9, 26, -47, 20, -45, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.55)";
    ctx.beginPath();
    ctx.ellipse(-14, -8, 12, 4, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f2f7e8";
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-5, -28, 12, 33, 5);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  isRevealed(player: Player) {
    if (player.id === this.localPlayerId) return true;
    if (player.flashlight) return true;
    if (dist(player, this.human) < (this.hazard === "BLACKOUT" ? 66 : 92)) return true;
    if (this.flares.some((flare) => dist(player, flare) < 146)) return true;
    if (this.selectedItem === "FLASHLIGHT" && this.elapsed < this.itemActiveUntil) {
      const aim = Math.atan2(this.mouse.y - this.human.y, this.mouse.x - this.human.x);
      const target = Math.atan2(player.y - this.human.y, player.x - this.human.x);
      const delta = Math.atan2(Math.sin(target - aim), Math.cos(target - aim));
      if (Math.abs(delta) < Math.PI / 8 && dist(player, this.human) < 330) return true;
    }
    return false;
  }

  cutRadial(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
    const glow = ctx.createRadialGradient(x, y, radius * 0.15, x, y, radius);
    glow.addColorStop(0, "rgba(0,0,0,1)");
    glow.addColorStop(0.62, "rgba(0,0,0,.98)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  drawLighting(ctx: CanvasRenderingContext2D) {
    if (this.phase !== "ORDEAL") return;
    if (this.hazard === "MOONGLARE") {
      const pulse = 0.5 + Math.sin(this.elapsed * 4.6) * 0.5;
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      const glare = ctx.createRadialGradient(W * 0.78, 34, 16, W * 0.55, H * 0.4, W * 0.92);
      glare.addColorStop(0, "rgba(255,255,247,.99)");
      glare.addColorStop(0.16, `rgba(255,250,221,${0.92 + pulse * 0.06})`);
      glare.addColorStop(0.48, "rgba(226,239,255,.88)");
      glare.addColorStop(1, "rgba(186,217,239,.72)");
      ctx.fillStyle = glare;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = `rgba(250,253,255,${0.25 + pulse * 0.08})`;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = `rgba(255,255,246,${0.3 + pulse * 0.22})`;
      ctx.lineWidth = 30 + pulse * 18;
      ctx.beginPath();
      ctx.arc(W * 0.78, 34, 126 + pulse * 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      return;
    }
    if (this.hazard !== "BLACKOUT" && this.hazard !== "FOG") return;
    const mask = this.maskCtx;
    const moonSightActive = this.human.role === "IMPOSTOR" && this.elapsed < this.moonSightUntil;
    mask.clearRect(0, 0, W, H);
    mask.globalCompositeOperation = "source-over";
    mask.fillStyle = moonSightActive
      ? "rgba(28,4,42,.44)"
      : this.hazard === "BLACKOUT"
        ? "rgba(1,3,9,.992)"
        : "rgba(177,202,209,.82)";
    mask.fillRect(0, 0, W, H);
    if (!moonSightActive) {
      mask.globalCompositeOperation = "destination-out";
      this.cutRadial(mask, this.human.x, this.human.y, this.hazard === "BLACKOUT" ? 76 : 108);
      if (this.selectedItem === "FLASHLIGHT" && this.elapsed < this.itemActiveUntil) {
        const angle = Math.atan2(this.mouse.y - this.human.y, this.mouse.x - this.human.x);
        const cone = mask.createRadialGradient(this.human.x, this.human.y, 28, this.human.x, this.human.y, 360);
        cone.addColorStop(0, "rgba(0,0,0,1)");
        cone.addColorStop(0.72, "rgba(0,0,0,.9)");
        cone.addColorStop(1, "rgba(0,0,0,0)");
        mask.fillStyle = cone;
        mask.beginPath();
        mask.moveTo(this.human.x, this.human.y);
        mask.arc(this.human.x, this.human.y, 360, angle - Math.PI / 8, angle + Math.PI / 8);
        mask.closePath();
        mask.fill();
      }
      for (const flare of this.flares) this.cutRadial(mask, flare.x, flare.y, 152);
      if (this.selectedItem === "SONAR" && this.elapsed < this.itemActiveUntil) {
        const ring = ((this.elapsed * 110) % 190) + 30;
        mask.strokeStyle = "rgba(0,0,0,.9)";
        mask.lineWidth = 22;
        mask.beginPath();
        mask.arc(this.human.x, this.human.y, ring, 0, Math.PI * 2);
        mask.stroke();
      }
    } else {
      mask.globalCompositeOperation = "destination-out";
      this.cutRadial(mask, this.human.x, this.human.y, 178);
    }
    mask.globalCompositeOperation = "source-over";
    ctx.drawImage(this.mask, 0, 0);
  }

  drawParticles(ctx: CanvasRenderingContext2D) {
    if (this.particles.length > 0) {
      ctx.save();
      for (const p of this.particles) {
        ctx.globalAlpha = Math.max(0, p.life / p.max);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    if (this.phase === "ORDEAL" && this.hazard === "MOONGLARE") {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      for (let i = 0; i < 24; i += 1) {
        const drift = this.elapsed * (18 + (i % 5) * 7);
        const x = ((i * 83 + drift) % (W + 90)) - 45;
        const y = 34 + ((i * 59 + Math.sin(this.elapsed * 1.8 + i) * 18) % (H - 68));
        const radius = 1.5 + (i % 4) * 1.2;
        ctx.globalAlpha = 0.22 + (i % 3) * 0.1;
        ctx.fillStyle = i % 2 ? "#fffbd4" : "#d9efff";
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      return;
    }
    if (this.phase !== "ORDEAL" || this.hazard !== "FOG") return;
    ctx.save();
    ctx.globalAlpha = this.human.role === "IMPOSTOR" ? 0.12 : 0.34;
    ctx.fillStyle = "#d7eaeb";
    ctx.beginPath();
    for (let i = 0; i < 18; i += 1) {
      const x = ((i * 137 + this.elapsed * (12 + (i % 4) * 5)) % (W + 180)) - 90;
      const y = 90 + ((i * 73) % 570);
      const rx = 58 + (i % 3) * 25;
      const ry = 9 + (i % 4) * 3;
      ctx.moveTo(x + rx, y);
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.restore();
  }

  drawCanvasLabels(ctx: CanvasRenderingContext2D) {
    if (this.phase === "COUNTDOWN") {
      const alpha = 0.62 + Math.sin(this.elapsed * 12) * 0.2;
      ctx.fillStyle = `rgba(166,18,30,${alpha})`;
      ctx.fillRect(0, 330, W, 94);
      ctx.strokeStyle = "#ff6670";
      ctx.lineWidth = 3;
      ctx.strokeRect(0, 330, W, 94);
      ctx.fillStyle = "#fff";
      ctx.font = "1000 34px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText("⚠  ORDEAL COUNTDOWN", W / 2, 369);
      ctx.font = "800 17px ui-monospace, monospace";
      ctx.fillStyle = "#ffd9d9";
      ctx.fillText(`${Math.ceil(this.phaseTime)}  •  MEMORIZE WHO IS NEARBY`, W / 2, 399);
    }
    if (this.phase === "ORDEAL") {
      const moonSightActive = this.human.role === "IMPOSTOR" && this.elapsed < this.moonSightUntil;
      let label = "THICK SEA FOG • IDENTITIES CONCEALED";
      let labelColor = "rgba(181,244,233,.9)";
      if (this.hazard === "BLACKOUT") {
        label = "TOTAL BLACKOUT • LIGHT REQUIRED";
        labelColor = "rgba(242,205,66,.9)";
      } else if (this.hazard === "MOONGLARE") {
        label = "MOON GLARE • IDENTITIES BLEACHED";
        labelColor = "rgba(51,63,78,.94)";
      } else if (this.hazard === "ROOTWAKE") {
        label = "ROOTWAKE • YOUR MOON CELL IS SEALED";
        labelColor = "rgba(137,245,170,.96)";
      } else if (this.hazard === "PHANTOMS") {
        label = "PHANTOM PROCESSION • TRUST YOUR SONAR";
        labelColor = "rgba(172,159,255,.96)";
      }
      if (moonSightActive) {
        label = "MOON SIGHT • LIVING AURAS EXPOSED";
        labelColor = "rgba(239,151,255,.96)";
      }
      ctx.fillStyle = labelColor;
      ctx.font = "900 13px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(label, W / 2, 53);
    }
  }
}

function Logo() {
  return (
    <div className="brand" aria-label="Moonwarden">
      <span className="brand-mark"><i /><i /><i /></span>
      <span>MOON<b>WARDEN</b></span>
    </div>
  );
}

const COLOR_NAMES: Record<string, string> = {
  "#20d8ed": "Frost Cyan",
  "#95ef45": "Moss Glow",
  "#ff5d9e": "Briar Rose",
  "#ffd94a": "Sun Amber",
  "#a879ff": "Twilight Violet",
  "#ff9843": "Ember Ochre",
  "#5ea7ff": "Astral Blue",
  "#48e0a4": "Sanctuary Mint",
};

const HAT_META: Record<Hat, { label: string; title: string }> = {
  antlers: { label: "ANTLERS", title: "Elder Bough" },
  hood: { label: "HOOD", title: "Nightveil" },
  moth: { label: "MOTH", title: "Lunar Crest" },
  mooncap: { label: "MOONCAP", title: "Star Point" },
};

const WARDEN_CALLSIGNS = [
  "Sylph",
  "Bramble",
  "Lumen",
  "Vesper",
  "Mochi",
  "Cinder",
  "Nori",
  "Thistle",
  "Solstice",
  "Glimmer",
  "Rune",
  "Zephyr",
];

function HatGraphic({ hat }: { hat: Hat }) {
  if (hat === "antlers") {
    return (
      <svg className="slime-hat-svg hat-antlers" viewBox="0 0 80 44" aria-hidden="true">
        <path
          d="M27 38 L22 18 L11 12 M22 22 L15 24 M22 18 L28 9 M53 38 L58 18 L69 12 M58 22 L65 24 M58 18 L52 9"
          fill="none"
          stroke="#0c151f"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M27 38 L22 18 L11 12 M22 22 L15 24 M22 18 L28 9 M53 38 L58 18 L69 12 M58 22 L65 24 M58 18 L52 9"
          fill="none"
          stroke="#dfd0ad"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="11" cy="12" r="2.5" fill="#6cf5e3" />
        <circle cx="69" cy="12" r="2.5" fill="#6cf5e3" />
      </svg>
    );
  }
  if (hat === "hood") {
    return (
      <svg className="slime-hat-svg hat-hood" viewBox="0 0 80 44" aria-hidden="true">
        <path
          d="M14 39 C14 17 28 7 40 5 C52 7 66 17 66 39 C54 33 26 33 14 39 Z"
          fill="#262f52"
          stroke="#0c151f"
          strokeWidth="3.5"
          strokeLinejoin="round"
        />
        <path
          d="M22 36 C26 22 34 15 40 13 C46 15 54 22 58 36"
          fill="none"
          stroke="#54dbef"
          strokeWidth="2"
          strokeOpacity="0.65"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (hat === "moth") {
    return (
      <svg className="slime-hat-svg hat-moth" viewBox="0 0 80 44" aria-hidden="true">
        <path
          d="M33 36 C28 21 19 13 11 11 C15 21 22 29 31 35 Z M47 36 C52 21 61 13 69 11 C65 21 58 29 49 35 Z"
          fill="#d9c6ff"
          stroke="#0c151f"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <circle cx="16" cy="15" r="3" fill="#6cf5e3" />
        <circle cx="64" cy="15" r="3" fill="#6cf5e3" />
        <circle cx="40" cy="34" r="4" fill="#ffee99" stroke="#0c151f" strokeWidth="2.5" />
      </svg>
    );
  }
  return (
    <svg className="slime-hat-svg hat-mooncap" viewBox="0 0 80 44" aria-hidden="true">
      <path
        d="M16 37 C18 17 35 7 60 11 C53 20 51 28 58 36 C42 33 28 34 16 37 Z"
        fill="#313968"
        stroke="#0c151f"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <circle cx="62" cy="12" r="5.5" fill="#ffd94a" stroke="#0c151f" strokeWidth="2.5" />
    </svg>
  );
}

function SlimeAvatar({
  color,
  hat,
  size = "md",
  isBot = false,
}: {
  color: string;
  hat: Hat;
  size?: "sm" | "md" | "lg";
  isBot?: boolean;
}) {
  return (
    <div
      className={`slime-avatar slime-avatar-${size} ${isBot ? "is-bot" : ""}`}
      style={{ "--slime": color } as React.CSSProperties}
      aria-hidden="true"
    >
      <HatGraphic hat={hat} />
      <div className="slime-avatar-body">
        <span className="shine" />
        <span className="eye e1" />
        <span className="eye e2" />
        <span className="mouth" />
      </div>
    </div>
  );
}

function Lobby({
  onLaunch,
  multiplayerClient,
  mpState,
}: {
  onLaunch: (count: number, role: RoleChoice) => void;
  multiplayerClient?: MultiplayerClient | null;
  mpState?: MultiplayerState | null;
}) {
  const [tab, setTab] = useState<"SOLO" | "MULTI">("SOLO");
  const [players, setPlayers] = useState(6);
  const [role, setRole] = useState<RoleChoice>("RANDOM");

  // Multiplayer form state
  const [nickname, setNickname] = useState("Warden");
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [selectedHat, setSelectedHat] = useState<Hat>("antlers");
  const [joinCode, setJoinCode] = useState("");
  const [botFill, setBotFill] = useState(true);
  const [targetPlayers, setTargetPlayers] = useState(6);
  const [copied, setCopied] = useState(false);
  const [hideRoomCode, setHideRoomCode] = useState(false);
  const [editingInRoom, setEditingInRoom] = useState(false);
  const [lobbyChatDraft, setLobbyChatDraft] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRefreshingRooms, setIsRefreshingRooms] = useState(false);
  const [mpError, setMpError] = useState("");

  const inRoom = Boolean(mpState?.roomCode);
  const activeTargetPlayers = inRoom && mpState ? mpState.targetPlayers : targetPlayers;
  const activeBotFill = inRoom && mpState ? mpState.botFill : botFill;
  const myNetPlayer = inRoom && mpState ? mpState.players.find((p) => p.id === mpState.playerId) : undefined;
  const readyCount = inRoom && mpState ? mpState.players.filter((p) => p.ready || p.isHost).length : 0;
  const displayError = mpError || mpState?.lastError || "";
  const occupiedColors = new Set(mpState?.players.filter((p) => p.id !== mpState.playerId).map((p) => p.color) ?? []);

  useEffect(() => {
    if (!multiplayerClient) return;
    const unsubscribe = multiplayerClient.onStateChange((state) => {
      const own = state.players.find((p) => p.id === state.playerId);
      if (own) {
        setSelectedColor(own.color);
        setSelectedHat(own.hat);
      }
    });
    return () => { unsubscribe(); };
  }, [multiplayerClient]);

  const handleRefreshRooms = async () => {
    if (!multiplayerClient) return;
    setIsRefreshingRooms(true);
    try {
      await multiplayerClient.connect();
      multiplayerClient.requestRoomsList();
    } catch {
      // Quietly ignore background room list errors until explicit action
    } finally {
      window.setTimeout(() => setIsRefreshingRooms(false), 260);
    }
  };

  const handleSwitchTab = (nextTab: "SOLO" | "MULTI") => {
    setTab(nextTab);
    setMpError("");
    multiplayerClient?.clearError();
    if (nextTab === "MULTI" && !inRoom) {
      void handleRefreshRooms();
    }
  };

  const handleRandomizeProfile = () => {
    const randomName = WARDEN_CALLSIGNS[Math.floor(Math.random() * WARDEN_CALLSIGNS.length)];
    const available = COLORS.filter((color) => !occupiedColors.has(color));
    const randomColor = available[Math.floor(Math.random() * available.length)] ?? selectedColor;
    const randomHat = HATS[Math.floor(Math.random() * HATS.length)];
    setNickname(randomName);
    setSelectedColor(randomColor);
    setSelectedHat(randomHat);
    if (inRoom && multiplayerClient) {
      multiplayerClient.updateProfile(randomName, randomColor, randomHat);
    }
  };

  const handleProfileChange = (nextName: string, nextColor: string, nextHat: Hat) => {
    setNickname(nextName);
    setSelectedColor(nextColor);
    setSelectedHat(nextHat);
    if (inRoom && multiplayerClient) {
      multiplayerClient.updateProfile(nextName.trim() || "Warden", nextColor, nextHat);
    }
  };

  const handleCreateRoom = async () => {
    if (!multiplayerClient) return;
    setMpError("");
    multiplayerClient.clearError();
    setIsConnecting(true);
    try {
      await multiplayerClient.connect();
      multiplayerClient.createRoom(nickname.trim() || "Warden", selectedColor, selectedHat);
    } catch {
      setMpError("Failed to connect to game server. Verify server is running.");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleJoinRoom = async (codeOverride?: string) => {
    const codeToJoin = (codeOverride ?? joinCode).trim().toUpperCase();
    if (!multiplayerClient || !codeToJoin) return;
    setMpError("");
    multiplayerClient.clearError();
    setIsConnecting(true);
    try {
      await multiplayerClient.connect();
      multiplayerClient.joinRoom(codeToJoin, nickname.trim() || "Warden", selectedColor, selectedHat);
    } catch {
      setMpError("Failed to connect to room. Verify code and server connection.");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleCopyCode = () => {
    if (!mpState?.roomCode) return;
    navigator.clipboard.writeText(mpState.roomCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const handleHostConfigUpdate = (nextTarget: number, nextBotFill: boolean) => {
    setTargetPlayers(nextTarget);
    setBotFill(nextBotFill);
    if (inRoom && mpState?.isHost && multiplayerClient) {
      multiplayerClient.updateRoomConfig(nextTarget, nextBotFill);
    }
  };

  const handleSendLobbyChat = (textOverride?: string) => {
    const text = (textOverride ?? lobbyChatDraft).trim();
    if (!text || !multiplayerClient || !inRoom) return;
    multiplayerClient.sendChat(text);
    if (!textOverride) setLobbyChatDraft("");
  };

  return (
    <main className="lobby-shell">
      <header className="lobby-nav">
        <Logo />
        <div className="nav-status">
          <span />
          {inRoom
            ? `${mpState?.connected ? mpState.transport === "HTTP" ? "HTTP RELAY" : "REALTIME" : "DISCONNECTED"} • ROOM ${hideRoomCode ? "••••" : mpState?.roomCode} • ${mpState?.ping || "—"}MS`
            : tab === "MULTI"
              ? "SANCTUARY RELAY • WEBSOCKET READY"
              : "LOCAL NIGHT TRIAL"}
        </div>
      </header>

      <section className={`lobby-grid ${tab === "MULTI" ? "lobby-grid-multi" : ""} ${inRoom ? "lobby-grid-room" : ""}`}>
        <div className="lobby-copy">
          <div className="eyebrow"><span>SILVERPINE SUMMIT</span><span>MOONRISE 07</span></div>
          <h1>Guard the moon.<br /><em>Question every shadow.</em></h1>
          <p className="lede">An ancient sanctuary above the clouds. One hidden saboteur. Restore the moon wards before your circle becomes a collection of suspicious puddles.</p>
          <div className="phase-ribbon" aria-label="Match phases">
            <div><small>01</small><b>CALM</b><span>15 SEC</span></div>
            <i>→</i>
            <div className="warning-phase"><small>02</small><b>WARNING</b><span>3 SEC</span></div>
            <i>→</i>
            <div className="ordeal-phase"><small>03</small><b>ORDEAL</b><span>10 SEC</span></div>
          </div>

          <div className="crew-showcase" aria-hidden="true">
            {COLORS.slice(0, 5).map((color, index) => {
              const showcaseColor = index === 2 && tab === "MULTI" ? selectedColor : color;
              const showcaseHat = index === 2 && tab === "MULTI" ? selectedHat : HATS[index % HATS.length];
              return (
                <div
                  className={`mini-slime mini-${index} hat-style-${showcaseHat}`}
                  style={{ "--slime": showcaseColor } as React.CSSProperties}
                  key={color}
                >
                  <span className="mini-hat"><HatGraphic hat={showcaseHat} /></span>
                  <span className="eye e1" />
                  <span className="eye e2" />
                  <span className="shine" />
                </div>
              );
            })}
          </div>
        </div>

        <div className={`lobby-console ${tab === "MULTI" ? "lobby-console-multi" : ""} ${inRoom ? "lobby-console-room" : ""}`}>
          <div className="console-head">
            <div>
              <span className="status-dot" />
              {tab === "SOLO"
                ? "PRIVATE PLAYTEST"
                : inRoom
                  ? `SANCTUARY CIRCLE • ROOM ${hideRoomCode ? "••••" : mpState?.roomCode}`
                  : "MULTIPLAYER SANCTUARY GATEWAY"}
            </div>
            <span>{inRoom ? `${mpState?.players.length ?? 1}/${activeTargetPlayers} WARDENS` : "BUILD 0.9.5"}</span>
          </div>

          <div className="console-body">
            <div className="lobby-mode-switch" role="tablist" aria-label="Game Mode">
              <button
                role="tab"
                aria-selected={tab === "SOLO"}
                className={tab === "SOLO" ? "active" : ""}
                onClick={() => handleSwitchTab("SOLO")}
              >
                <span>✦ SOLO TRIAL (BOTS)</span>
              </button>
              <button
                role="tab"
                aria-selected={tab === "MULTI"}
                className={tab === "MULTI" ? "active" : ""}
                onClick={() => handleSwitchTab("MULTI")}
              >
                <span>⚡ MULTIPLAYER</span>
                <span className="live-pill">{inRoom ? "IN ROOM" : "WS"}</span>
              </button>
            </div>

            {tab === "SOLO" ? (
              <>
                <label className="field-label" htmlFor="player-count">WARDEN CIRCLE <span>{players} SLOTS</span></label>
                <input id="player-count" className="player-range" type="range" min="4" max="8" value={players} onChange={(event) => setPlayers(Number(event.target.value))} />
                <div className="range-labels"><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span></div>

                <div className="field-label role-label">TEST IDENTITY <span>PRIVATE TO THIS CLIENT</span></div>
                <div className="role-switch" role="group" aria-label="Choose test role">
                  {(["RANDOM", "CREWMATE", "IMPOSTOR"] as RoleChoice[]).map((value) => (
                    <button key={value} className={role === value ? "active" : ""} onClick={() => setRole(value)}>{value === "RANDOM" ? "AUTO" : value}</button>
                  ))}
                </div>
                <p className="role-note">Role information never leaves your private HUD. Every slime uses the same movement, face, and silhouette.</p>

                <button className="launch-button" onClick={() => onLaunch(players, role)}>
                  <span>ENTER THE MOONWARD</span><kbd>ENTER</kbd>
                </button>
                <div className="console-log">
                  <span><i className="green" /> WARDENS GATHERED</span>
                  <span><i className="amber" /> HAZARDS ARMED</span>
                  <span><i className="green" /> ZERO VISUAL TELLS</span>
                </div>
              </>
            ) : inRoom && mpState ? (
              <div className="waiting-room">
                {/* Room Code & Controls Banner */}
                <div className="room-code-banner">
                  <div className="room-code-display">
                    <small>SANCTUARY WARD CODE • SHARE WITH FRIENDS</small>
                    <div className="room-code-row">
                      <strong>{hideRoomCode ? "••••" : mpState.roomCode}</strong>
                      <span className="room-ping-pill">
                        <i /> {mpState.ping}ms
                      </span>
                    </div>
                  </div>
                  <div className="room-banner-actions">
                    <button
                      type="button"
                      className="ghost-code-btn"
                      onClick={() => setHideRoomCode((v) => !v)}
                      title={hideRoomCode ? "Reveal room code" : "Hide room code for stream"}
                    >
                      {hideRoomCode ? "SHOW" : "HIDE"}
                    </button>
                    <button type="button" className="copy-code-btn" onClick={handleCopyCode}>
                      {copied ? "COPIED! ✓" : "COPY CODE"}
                    </button>
                  </div>
                </div>

                {/* Live Wardrobe / Profile Bar inside Waiting Room */}
                <div className="inroom-profile-bar">
                  <div className="inroom-profile-summary">
                    <SlimeAvatar
                      color={myNetPlayer?.color || selectedColor}
                      hat={myNetPlayer?.hat || selectedHat}
                      size="sm"
                    />
                    <div>
                      <small>YOUR WARDEN</small>
                      <strong>{myNetPlayer?.name || nickname}</strong>
                      <span>
                        {COLOR_NAMES[myNetPlayer?.color || selectedColor] || "Custom"} •{" "}
                        {HAT_META[myNetPlayer?.hat || selectedHat].title}
                      </span>
                    </div>
                  </div>
                  <div className="inroom-profile-actions">
                    <button
                      type="button"
                      className={`wardrobe-toggle-btn ${editingInRoom ? "active" : ""}`}
                      onClick={() => setEditingInRoom((v) => !v)}
                    >
                      {editingInRoom ? "✓ DONE" : "✎ WARDROBE"}
                    </button>
                    {!mpState.isHost && (
                      <button
                        type="button"
                        className={`ready-toggle-btn ${myNetPlayer?.ready ? "is-ready" : ""}`}
                        onClick={() => multiplayerClient?.toggleReady()}
                      >
                        {myNetPlayer?.ready ? "✓ READY" : "MARK READY"}
                      </button>
                    )}
                  </div>
                </div>

                {editingInRoom && (
                  <div className="inroom-wardrobe-drawer">
                    <div className="wardrobe-row">
                      <label className="field-label" htmlFor="inroom-nickname">
                        CALLSIGN <span>{nickname.length}/16</span>
                      </label>
                      <div className="mp-input-with-btn">
                        <input
                          id="inroom-nickname"
                          className="mp-field"
                          maxLength={16}
                          value={nickname}
                          onChange={(e) => handleProfileChange(e.target.value, selectedColor, selectedHat)}
                          placeholder="Warden callsign…"
                        />
                        <button type="button" className="mp-random-btn" onClick={handleRandomizeProfile}>
                          🎲 RANDOM
                        </button>
                      </div>
                    </div>

                    <div className="mp-palette" role="radiogroup" aria-label="Slime Color">
                      {COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className={`mp-color-btn ${selectedColor === c ? "active" : ""}`}
                          style={{ backgroundColor: c, color: c }}
                          role="radio"
                          aria-checked={selectedColor === c}
                          disabled={occupiedColors.has(c)}
                          onClick={() => handleProfileChange(nickname, c, selectedHat)}
                          title={`${COLOR_NAMES[c]}${occupiedColors.has(c) ? " — taken" : ""}`}
                          aria-label={`Select slime color ${COLOR_NAMES[c] || c}`}
                        />
                      ))}
                    </div>

                    <div className="mp-hat-row" role="radiogroup" aria-label="Hat selection">
                      {HATS.map((h) => (
                        <button
                          key={h}
                          type="button"
                          className={`mp-hat-btn ${selectedHat === h ? "active" : ""}`}
                          onClick={() => handleProfileChange(nickname, selectedColor, h)}
                        >
                          <span className="hat-btn-preview">
                            <HatGraphic hat={h} />
                          </span>
                          <b>{HAT_META[h].label}</b>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Visual 4-8 Slot Warden Circle Grid */}
                <div className="field-label">
                  SANCTUARY CIRCLE ROSTER{" "}
                  <span>
                    {mpState.players.length} HUMAN • {readyCount}/{mpState.players.length} READY
                  </span>
                </div>

                <div className="waiting-slot-grid" role="list">
                  {Array.from({ length: Math.max(activeTargetPlayers, mpState.players.length) }).map((_, slotIdx) => {
                    const p = mpState.players[slotIdx];
                    if (p) {
                      const isYou = p.id === mpState.playerId;
                      const isReady = Boolean(p.ready || p.isHost);
                      return (
                        <div
                          className={`warden-slot-card occupied ${isYou ? "is-you" : ""} ${isReady ? "is-ready" : ""}`}
                          key={p.id}
                          role="listitem"
                        >
                          <div className="slot-card-top">
                            <div className="slot-badges">
                              {p.isHost && <span className="roster-badge host">👑 HOST</span>}
                              {isYou && <span className="roster-badge you">YOU</span>}
                            </div>
                            <span className={`slot-ready-pill ${isReady ? "ready" : "waiting"}`}>
                              {isReady ? "✓ READY" : "PREP"}
                            </span>
                          </div>
                          <div className="slot-avatar-stage">
                            <SlimeAvatar color={p.color} hat={p.hat} size="md" />
                          </div>
                          <div className="slot-card-meta">
                            <strong className="roster-name">{p.name}</strong>
                            <small>{HAT_META[p.hat]?.title || p.hat}</small>
                          </div>
                        </div>
                      );
                    }

                    const botNum = slotIdx - mpState.players.length + 1;
                    if (activeBotFill) {
                      const botColor = COLORS[slotIdx % COLORS.length];
                      const botHat = HATS[slotIdx % HATS.length];
                      return (
                        <div className="warden-slot-card bot-slot" key={`bot-slot-${slotIdx}`} role="listitem">
                          <div className="slot-card-top">
                            <span className="roster-badge bot">AI WARDEN</span>
                            <span className="slot-ready-pill bot">AUTO</span>
                          </div>
                          <div className="slot-avatar-stage">
                            <SlimeAvatar color={botColor} hat={botHat} size="md" isBot />
                          </div>
                          <div className="slot-card-meta">
                            <strong className="roster-name">Bot #{botNum}</strong>
                            <small>Fills on start</small>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div className="warden-slot-card empty-slot" key={`empty-slot-${slotIdx}`} role="listitem">
                        <div className="slot-card-top">
                          <span className="roster-badge empty">SLOT 0{slotIdx + 1}</span>
                        </div>
                        <div className="slot-empty-sigil">✦</div>
                        <div className="slot-card-meta">
                          <strong className="roster-name">Open Ward</strong>
                          <small>Awaiting player…</small>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Pre-Game Sanctuary Comms (Lobby Chat) */}
                <div className="lobby-comms-box">
                  <div className="lobby-comms-head">
                    <span>SANCTUARY COMMS</span>
                    <div className="quick-comms-chips">
                      {["Ready! 🌙", "Wait a sec", "Let's go! ⚡"].map((phrase) => (
                        <button
                          key={phrase}
                          type="button"
                          onClick={() => handleSendLobbyChat(phrase)}
                        >
                          {phrase}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="lobby-comms-feed" role="log" aria-live="polite">
                    {mpState.lobbyChat.length === 0 ? (
                      <div className="lobby-comms-empty">
                        Circle channel open. Greet your fellow Wardens before the trial begins.
                      </div>
                    ) : (
                      mpState.lobbyChat.slice(-12).map((m) => (
                        <div
                          key={m.id}
                          className={`lobby-comms-line ${m.system ? "system" : ""}`}
                        >
                          {!m.system && (
                            <span
                              className="comms-author"
                              style={{ color: m.playerColor || "#54dbef" }}
                            >
                              {m.playerName}:
                            </span>
                          )}
                          <span className="comms-text">{m.text}</span>
                        </div>
                      ))
                    )}
                  </div>
                  <form
                    className="lobby-comms-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSendLobbyChat();
                    }}
                  >
                    <input
                      className="mp-field"
                      maxLength={140}
                      value={lobbyChatDraft}
                      onChange={(e) => setLobbyChatDraft(e.target.value)}
                      placeholder="Message the waiting circle…"
                      aria-label="Lobby chat message"
                    />
                    <button type="submit" disabled={!lobbyChatDraft.trim()}>
                      SEND
                    </button>
                  </form>
                </div>

                {/* Host Controls or Guest Status */}
                {mpState.isHost ? (
                  <div className="host-panel">
                    <div className="host-config-header">
                      <label className="field-label" htmlFor="mp-player-count">
                        TARGET CIRCLE <span>{activeTargetPlayers} SLOTS</span>
                      </label>
                      <div className="slot-Count-pills" role="group" aria-label="Target player count">
                        {[4, 5, 6, 7, 8].map((n) => (
                          <button
                            key={n}
                            type="button"
                            className={activeTargetPlayers === n ? "active" : ""}
                            onClick={() => handleHostConfigUpdate(n, activeBotFill)}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                    <input
                      id="mp-player-count"
                      className="player-range"
                      type="range"
                      min="4"
                      max="8"
                      value={activeTargetPlayers}
                      onChange={(e) => handleHostConfigUpdate(Number(e.target.value), activeBotFill)}
                    />

                    <label className="bot-checkbox-row">
                      <input
                        type="checkbox"
                        checked={activeBotFill}
                        onChange={(e) => handleHostConfigUpdate(activeTargetPlayers, e.target.checked)}
                      />
                      <span>FILL EMPTY SLOTS WITH AI BOTS ON START</span>
                    </label>

                    <button
                      className="launch-button"
                      onClick={() => multiplayerClient?.startMatch(activeBotFill, activeTargetPlayers)}
                    >
                      <span>
                        START MATCH ({mpState.players.length} HUMAN
                        {activeBotFill && activeTargetPlayers > mpState.players.length
                          ? ` + ${activeTargetPlayers - mpState.players.length} AI`
                          : ""}
                        )
                      </span>
                      <kbd>START</kbd>
                    </button>
                  </div>
                ) : (
                  <div className="waiting-status">
                    <span>
                      ✦ Waiting for host to initiate the moonward trial ({activeTargetPlayers} slots
                      {activeBotFill ? " • AI fill enabled" : ""})…
                    </span>
                  </div>
                )}

                <button className="mp-btn-secondary" onClick={() => multiplayerClient?.leaveRoom()}>
                  LEAVE ROOM
                </button>
              </div>
            ) : (
              <div className="mp-config">
                {/* Live Character Customizer Card */}
                <div className="mp-customizer-card">
                  <div className="mp-avatar-pedestal">
                    <div className="pedestal-glow" style={{ "--slime": selectedColor } as React.CSSProperties} />
                    <SlimeAvatar color={selectedColor} hat={selectedHat} size="lg" />
                    <div className="pedestal-caption">
                      <strong>{nickname.trim() || "Warden"}</strong>
                      <small>
                        {COLOR_NAMES[selectedColor] || "Slime"} • {HAT_META[selectedHat].title}
                      </small>
                    </div>
                    <button
                      type="button"
                      className="mp-random-btn"
                      onClick={handleRandomizeProfile}
                      title="Randomize Warden Identity"
                    >
                      🎲 RANDOMIZE
                    </button>
                  </div>

                  <div className="mp-customizer-controls">
                    <label className="field-label" htmlFor="mp-nickname">
                      WARDEN IDENTITY <span>{nickname.length}/16</span>
                    </label>
                    <input
                      id="mp-nickname"
                      className="mp-field"
                      maxLength={16}
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      placeholder="Enter your warden name…"
                    />

                    <div className="field-label" style={{ marginTop: 12 }}>
                      SLIME HUE <span>{COLOR_NAMES[selectedColor]}</span>
                    </div>
                    <div className="mp-palette" role="radiogroup" aria-label="Slime Color">
                      {COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className={`mp-color-btn ${selectedColor === c ? "active" : ""}`}
                          style={{ backgroundColor: c, color: c }}
                          onClick={() => setSelectedColor(c)}
                          title={COLOR_NAMES[c]}
                          aria-label={`Select slime color ${COLOR_NAMES[c] || c}`}
                        />
                      ))}
                    </div>

                    <div className="field-label">
                      HEADDRESS <span>{HAT_META[selectedHat].title.toUpperCase()}</span>
                    </div>
                    <div className="mp-hat-row" role="radiogroup" aria-label="Hat selection">
                      {HATS.map((h) => (
                        <button
                          key={h}
                          type="button"
                          className={`mp-hat-btn ${selectedHat === h ? "active" : ""}`}
                          onClick={() => setSelectedHat(h)}
                        >
                          <span className="hat-btn-preview">
                            <HatGraphic hat={h} />
                          </span>
                          <b>{HAT_META[h].label}</b>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {displayError && (
                  <div className="puzzle-feedback error" style={{ marginBottom: 10 }}>
                    {displayError}
                  </div>
                )}

                {/* Host or Join Gateway */}
                <div className="mp-actions-grid">
                  <div className="mp-action-card host-card">
                    <div className="mp-card-header">
                      <small>HOST PRIVATE OR PUBLIC CIRCLE</small>
                      <b>NEW SANCTUARY</b>
                    </div>
                    <p className="mp-card-desc">
                      Generate a 4-letter ward code and invite up to 8 players (with optional AI bots).
                    </p>
                    <button className="mp-btn-primary" onClick={handleCreateRoom} disabled={isConnecting}>
                      {isConnecting ? "CONNECTING..." : "✦ CREATE ROOM"}
                    </button>
                  </div>

                  <div className="mp-action-card join-card">
                    <div className="mp-card-header">
                      <small>HAVE AN INVITE CODE?</small>
                      <b>JOIN BY WARD CODE</b>
                    </div>
                    <form
                      className="mp-code-entry-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void handleJoinRoom();
                      }}
                    >
                      <div className="mp-code-input-wrap">
                        <input
                          className="mp-field mp-code-input"
                          maxLength={6}
                          value={joinCode}
                          onChange={(e) =>
                            setJoinCode(e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())
                          }
                          placeholder="LUNA"
                          aria-label="4-letter room code"
                        />
                        <div className="mp-code-slots" aria-hidden="true">
                          {[0, 1, 2, 3].map((idx) => (
                            <span key={idx} className={joinCode[idx] ? "filled" : ""}>
                              {joinCode[idx] || "•"}
                            </span>
                          ))}
                        </div>
                      </div>
                      <button
                        type="submit"
                        className="mp-btn-secondary"
                        disabled={isConnecting || !joinCode.trim()}
                      >
                        JOIN ROOM →
                      </button>
                    </form>
                  </div>
                </div>

                {/* Live Open Rooms Browser */}
                <div className="mp-open-rooms">
                  <div className="mp-open-rooms-head">
                    <div className="field-label">
                      ACTIVE SANCTUARIES{" "}
                      <span>{mpState?.openRooms.length ?? 0} OPEN</span>
                    </div>
                    <button
                      type="button"
                      className="mp-refresh-btn"
                      onClick={handleRefreshRooms}
                      disabled={isRefreshingRooms}
                    >
                      {isRefreshingRooms ? "SCANNING…" : "↻ REFRESH"}
                    </button>
                  </div>

                  {mpState?.openRooms && mpState.openRooms.length > 0 ? (
                    <div className="mp-open-rooms-list" role="list">
                      {mpState.openRooms.map((room) => (
                        <div className="open-room-item" key={room.code} role="listitem">
                          <div className="open-room-host">
                            <SlimeAvatar color={room.hostColor} hat={room.hostHat} size="sm" />
                            <div>
                              <strong>
                                {room.hostName}&apos;s Circle <span className="open-room-code">{room.code}</span>
                              </strong>
                              <small>
                                {room.playerCount}/{room.targetPlayers} Wardens{" "}
                                {room.botFill ? "• AI Bot Fill" : "• Humans Only"}
                              </small>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="open-room-join-btn"
                            onClick={() => handleJoinRoom(room.code)}
                            disabled={isConnecting}
                          >
                            JOIN →
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mp-open-rooms-empty">
                      <span>No open circles broadcasting right now. Create a room above to host the first trial!</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <footer className="lobby-footer"><span>WASD / ARROWS TO MOVE</span><span>E TASK</span><span>F ITEM</span><span>R REPORT</span><span>Q / SPACE KILL</span></footer>
    </main>
  );
}

function ItemIcon({ item }: { item: ItemKind }) {
  if (item === "FLASHLIGHT") return <span className="icon-flashlight" />;
  if (item === "FLARE") return <span className="icon-flare" />;
  return <span className="icon-sonar"><i /><i /></span>;
}

function openingChat(m: Meeting): ChatMessage[] {
  const livingBots = m.candidates.filter((player) => player.alive && player.ai);
  const lines: ChatMessage[] = [{
    id: `system-${m.reason}`,
    playerId: null,
    playerName: "WARDEN BELL",
    playerColor: null,
    text: "Discussion is open. Share what you saw before casting your vote.",
    system: true,
  }];
  for (const [index, player] of livingBots.slice(0, Math.min(3, livingBots.length)).entries()) {
    const accusedId = m.accusations[player.id];
    const accused = m.candidates.find((p) => p.id === accusedId && p.id !== player.id);
    let claim: string;
    if (accused) {
      const phrases = [
        `I saw ${accused.name} near the scene right when the lights flickered.`,
        `Watch out for ${accused.name} — their movement was erratic in the dark.`,
        `${accused.name} was heading toward the body. What do you have to say?`,
      ];
      claim = phrases[index % phrases.length];
    } else {
      const claims = [
        `I was restoring the ${["Frost Font", "Star Altar", "Root Seal"][index % 3]}. Who can confirm?`,
        "I was working on the moon wards before visibility dropped.",
        "Do not rush the vote. Everyone, tell us your path through the sanctuary.",
      ];
      claim = claims[index % claims.length];
    }
    lines.push({
      id: `bot-opening-${player.id}-${index}`,
      playerId: player.id,
      playerName: player.name,
      playerColor: player.color,
      text: claim,
    });
  }
  return lines;
}

function TouchButton({ code, children, onTouch }: { code: string; children: React.ReactNode; onTouch: (code: string, down: boolean) => void }) {
  return (
    <button
      type="button"
      onPointerDown={(event) => { event.preventDefault(); onTouch(code, true); }}
      onPointerUp={() => onTouch(code, false)}
      onPointerCancel={() => onTouch(code, false)}
      onPointerLeave={() => onTouch(code, false)}
    >
      {children}
    </button>
  );
}

function Game({
  count,
  roleChoice,
  multiplayerClient,
  initialPlayers,
  assignedRole,
  onExit,
}: {
  count: number;
  roleChoice: RoleChoice;
  multiplayerClient?: MultiplayerClient | null;
  initialPlayers?: NetPlayer[];
  assignedRole?: Role;
  onExit: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<OrdealEngine | null>(null);
  const normalMusicRef = useRef<HTMLAudioElement | null>(null);
  const ordealMusicRef = useRef<HTMLAudioElement | null>(null);
  const musicFadeRef = useRef<number | null>(null);
  const chatLogRef = useRef<HTMLDivElement>(null);
  const meetingSerialRef = useRef(0);
  const [snapshot, setSnapshot] = useState<Snapshot>(initialSnapshot());
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [puzzle, setPuzzle] = useState<TaskPuzzle | null>(null);
  const [killNotice, setKillNotice] = useState<KillNotice | null>(null);
  const [deathReveal, setDeathReveal] = useState<DeathReveal | null>(null);
  const [result, setResult] = useState("");
  const [roleReveal, setRoleReveal] = useState<Role | null>(null);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [musicReady, setMusicReady] = useState(false);
  const [musicBlocked, setMusicBlocked] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [networkState, setNetworkState] = useState<MultiplayerState | null>(() => multiplayerClient?.getSnapshot() ?? null);

  useEffect(() => {
    const unsubscribe = multiplayerClient?.onStateChange(setNetworkState);
    return () => { unsubscribe?.(); };
  }, [multiplayerClient]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const handleMeeting = (next: Meeting | null) => {
      setMeeting(next);
      if (!next) {
        meetingSerialRef.current += 1;
        setChatMessages([]);
        setChatDraft("");
      } else if (!next.tally) {
        meetingSerialRef.current += 1;
        setChatMessages(openingChat(next));
        setChatDraft("");
      }
    };
    const engine = new OrdealEngine(
      canvasRef.current,
      count,
      roleChoice,
      setSnapshot,
      handleMeeting,
      setPuzzle,
      setKillNotice,
      setDeathReveal,
      setResult,
      multiplayerClient,
      initialPlayers,
      assignedRole,
    );
    engineRef.current = engine;
    engine.roleRevealActive = true;
    engine.paused = !multiplayerClient;
    setRoleReveal(engine.human.role);
    const revealTimer = window.setTimeout(() => {
      setRoleReveal(null);
      engine.roleRevealActive = false;
      if (!engine.activeMeeting && !engine.gameOver) engine.paused = false;
    }, 4900);
    let unsubChat: (() => void) | undefined;
    if (multiplayerClient) {
      unsubChat = multiplayerClient.onMessage((msg) => {
        if (msg.type === "CHAT_MESSAGE") {
          setChatMessages((messages) => [
            ...messages,
            {
              id: msg.message.id,
              playerId: msg.message.playerId,
              playerName: msg.message.playerName,
              playerColor: msg.message.playerColor,
              text: msg.message.text,
              system: msg.message.system,
            },
          ]);
        }
      });
    }
    return () => {
      window.clearTimeout(revealTimer);
      if (unsubChat) unsubChat();
      engine.destroy();
    };
  }, [count, roleChoice, multiplayerClient, initialPlayers, assignedRole]);

  useEffect(() => {
    const normalMusic = new Audio("/audio/moonlit-deduction.mp3");
    const ordealMusic = new Audio("/audio/hostile-moon.mp3");
    for (const track of [normalMusic, ordealMusic]) {
      track.loop = true;
      track.preload = "auto";
      track.volume = 0;
    }
    normalMusicRef.current = normalMusic;
    ordealMusicRef.current = ordealMusic;
    return () => {
      if (musicFadeRef.current !== null) window.cancelAnimationFrame(musicFadeRef.current);
      normalMusic.pause();
      ordealMusic.pause();
      normalMusicRef.current = null;
      ordealMusicRef.current = null;
    };
  }, []);

  useEffect(() => {
    const normalMusic = normalMusicRef.current;
    const ordealMusic = ordealMusicRef.current;
    if (!normalMusic || !ordealMusic) return;
    if (musicFadeRef.current !== null) window.cancelAnimationFrame(musicFadeRef.current);

    const crossfadeTo = (normalTarget: number, ordealTarget: number, duration: number) => {
      const normalInitial = normalMusic.volume;
      const ordealInitial = ordealMusic.volume;
      const startedAt = performance.now();
      const step = (now: number) => {
        const progress = clamp((now - startedAt) / duration, 0, 1);
        normalMusic.volume = clamp(normalInitial + (normalTarget - normalInitial) * progress, 0, 1);
        ordealMusic.volume = clamp(ordealInitial + (ordealTarget - ordealInitial) * progress, 0, 1);
        if (progress < 1) {
          musicFadeRef.current = window.requestAnimationFrame(step);
        } else {
          musicFadeRef.current = null;
          if (normalTarget === 0) normalMusic.pause();
          if (ordealTarget === 0) ordealMusic.pause();
        }
      };
      musicFadeRef.current = window.requestAnimationFrame(step);
    };

    if (musicEnabled && musicReady) {
      const ordealActive = snapshot.phase === "ORDEAL";
      const activeTrack = ordealActive ? ordealMusic : normalMusic;
      void activeTrack.play()
        .then(() => {
          setMusicBlocked(false);
          crossfadeTo(ordealActive ? 0 : 0.2, ordealActive ? 0.26 : 0, 900);
        })
        .catch(() => {
          setMusicBlocked(true);
          setMusicReady(false);
        });
    } else {
      crossfadeTo(0, 0, 620);
    }

    return () => {
      if (musicFadeRef.current !== null) {
        window.cancelAnimationFrame(musicFadeRef.current);
        musicFadeRef.current = null;
      }
    };
  }, [snapshot.phase, musicEnabled, musicReady]);

  useEffect(() => {
    if (!deathReveal) return;
    const deathTimer = window.setTimeout(() => {
      setDeathReveal(null);
      engineRef.current?.resumeAfterDeathReveal();
    }, 4800);
    return () => window.clearTimeout(deathTimer);
  }, [deathReveal]);

  useEffect(() => {
    if (!killNotice) return;
    const noticeTimer = window.setTimeout(() => setKillNotice(null), 2400);
    return () => window.clearTimeout(noticeTimer);
  }, [killNotice]);

  useEffect(() => {
    const chatLog = chatLogRef.current;
    if (chatLog) chatLog.scrollTop = chatLog.scrollHeight;
  }, [chatMessages]);

  const phaseLabel = snapshot.phase === "ORDEAL" ? HAZARD_LABELS[snapshot.hazard] : snapshot.phase;
  const primeBackgroundMusic = () => {
    const normalMusic = normalMusicRef.current;
    const ordealMusic = ordealMusicRef.current;
    if (!normalMusic || !ordealMusic) return;
    const ordealActive = snapshot.phase === "ORDEAL";
    const activeTrack = ordealActive ? ordealMusic : normalMusic;
    const inactiveTrack = ordealActive ? normalMusic : ordealMusic;
    activeTrack.volume = 0;
    inactiveTrack.volume = 0;
    void inactiveTrack.play()
      .then(() => inactiveTrack.pause())
      .catch(() => undefined);
    void activeTrack.play()
      .then(() => {
        setMusicBlocked(false);
        setMusicReady(true);
        setMusicEnabled(true);
      })
      .catch(() => {
        setMusicBlocked(true);
        setMusicReady(false);
      });
  };
  const dismissRoleReveal = () => {
    if (musicEnabled) primeBackgroundMusic();
    setRoleReveal(null);
    if (engineRef.current) {
      engineRef.current.roleRevealActive = false;
      if (!engineRef.current.activeMeeting && !engineRef.current.gameOver) {
        engineRef.current.paused = false;
      }
    }
  };
  const dismissDeathReveal = () => {
    setDeathReveal(null);
    engineRef.current?.resumeAfterDeathReveal();
  };
  const sendChatMessage = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = chatDraft.trim();
    if (!text || !meeting || meeting.tally || !snapshot.humanAlive) return;

    if (multiplayerClient) {
      multiplayerClient.sendChat(text);
      setChatDraft("");
      return;
    }

    const you = meeting.candidates.find((player) => player.id === "you");
    setChatMessages((messages) => [...messages, {
      id: `you-${Date.now()}`,
      playerId: "you",
      playerName: "YOU",
      playerColor: you?.color || COLORS[0],
      text: text.slice(0, 160),
    }]);
    setChatDraft("");

    const responders = meeting.candidates.filter((player) => player.alive && player.ai);
    const responder = choose(responders);
    if (!responder) return;
    const accusedId = meeting.accusations[responder.id];
    const accused = meeting.candidates.find((player) => player.id === accusedId && player.id !== responder.id);
    const currentSerial = meetingSerialRef.current;
    window.setTimeout(() => {
      if (currentSerial !== meetingSerialRef.current) return;
      const responses = accused
        ? [
          `That could fit. But I still saw ${accused.name} too close to the body.`,
          `Noted. My vote is leaning toward ${accused.name}.`,
          `${accused.name}, you have been quiet. Explain where you were.`,
        ]
        : [
          "I did not see that, but I crossed the north path just before the Ordeal.",
          "I honestly saw nothing in the dark. I might skip unless someone has proof.",
          "That could fit. I want to hear from the others first.",
        ];
      setChatMessages((messages) => [...messages, {
        id: `bot-reply-${responder.id}-${Date.now()}`,
        playerId: responder.id,
        playerName: responder.name,
        playerColor: responder.color,
        text: choose(responses),
      }]);
    }, 650 + Math.random() * 650);
  };
  const handleTouch = useCallback((code: string, down: boolean) => {
    engineRef.current?.setTouch(code, down);
  }, []);
  const toggleBackgroundMusic = () => {
    if (musicEnabled && musicReady && !musicBlocked) {
      setMusicEnabled(false);
      return;
    }
    if (musicReady && !musicBlocked) {
      setMusicEnabled(true);
      return;
    }
    primeBackgroundMusic();
  };

  return (
    <main className="game-shell">
      <header className="game-nav">
        <Logo />
        <div className={`phase-chip phase-${snapshot.phase.toLowerCase()}`}><span />{phaseLabel}<b>{Math.ceil(snapshot.time).toString().padStart(2, "0")}</b></div>
        <div className="game-nav-actions">
          <button
            className={`music-button ${musicEnabled && musicReady && !musicBlocked ? "active" : ""} ${!musicReady || musicBlocked ? "blocked" : ""}`}
            onClick={toggleBackgroundMusic}
            aria-pressed={musicEnabled && musicReady && !musicBlocked}
            aria-label={!musicReady || musicBlocked ? "Enable background music" : `${musicEnabled ? "Disable" : "Enable"} background music`}
          >
            <span aria-hidden="true">♪</span>{!musicReady || musicBlocked ? "ENABLE BGM" : musicEnabled ? "BGM ON" : "BGM OFF"}
          </button>
          <button className="leave-button" onClick={onExit}>LEAVE SIM</button>
        </div>
      </header>

      <section className="game-stage">
        <canvas ref={canvasRef} aria-label="Top-down view of the Moonwarden mountain sanctuary" />
        {networkState && !networkState.connected && (
          <div className="connection-lost" role="alert">
            <b>CONNECTION LOST</b>
            <p>{networkState.lastError || "Return to the lobby to reconnect with your party."}</p>
            <button type="button" onClick={onExit}>RETURN TO LOBBY</button>
          </div>
        )}

        <div className="task-hud">
          <div className="task-label"><span>MOON WARDS</span><b>{Math.floor(snapshot.taskProgress)}%</b></div>
          <div className="task-track"><i style={{ width: `${snapshot.taskProgress}%` }} /></div>
        </div>

        <div className="crew-count"><span className="crew-dot" />{snapshot.living}<small> / {snapshot.total} ALIVE</small></div>

        {snapshot.role === "IMPOSTOR" && (
          <div className="private-role"><small>PRIVATE ROLE</small><b>IMPOSTOR</b><span>Moon Sight <kbd>V</kbd> • one strike per Ordeal</span></div>
        )}

        {snapshot.message && <div className="toast-message">{snapshot.message}</div>}
        {!snapshot.humanAlive && <div className="spectator-chip">SPECTATING • YOU ARE JELLY</div>}

        {snapshot.rewardNotice && (
          <aside className="reward-toast" aria-live="polite">
            <span className="reward-icon"><ItemIcon item={snapshot.rewardNotice.item} /></span>
            <div><small>ITEM ACQUIRED • {snapshot.rewardNotice.station}</small><b>{ITEM_LABELS[snapshot.rewardNotice.item]}</b><p>{ITEM_DESCRIPTIONS[snapshot.rewardNotice.item]}.</p></div>
          </aside>
        )}

        <div className="item-dock">
          <div className="dock-title"><span>TASK-EARNED GEAR</span><small>COMPLETE A MARKED SHRINE • USE F</small></div>
          <div className="dock-items">
            {(["FLASHLIGHT", "FLARE", "SONAR"] as ItemKind[]).map((item, index) => (
              <button
                key={item}
                className={`${snapshot.selectedItem === item ? "selected" : ""} ${snapshot.charges[item] <= 0 ? "locked" : "acquired"}`}
                onClick={() => engineRef.current?.selectItem(item)}
                aria-label={`Select ${ITEM_LABELS[item]}, ${snapshot.charges[item]} charges`}
                title={ITEM_DESCRIPTIONS[item]}
              >
                <kbd>{index + 1}</kbd><ItemIcon item={item} /><span>{ITEM_LABELS[item]}</span><b>{snapshot.charges[item] > 0 ? `×${snapshot.charges[item]}` : "LOCKED"}</b>
              </button>
            ))}
          </div>
        </div>

        <div className="action-dock">
          <button className={`action report ${snapshot.canReport ? "ready" : ""}`} onClick={() => engineRef.current?.report()}><kbd>R</kbd><span>REPORT</span></button>
          {snapshot.role === "IMPOSTOR" && <button className={`action sight ${snapshot.canUseMoonSight || snapshot.moonSightActive ? "ready" : ""}`} onClick={() => engineRef.current?.useMoonSight()} disabled={snapshot.phase !== "ORDEAL" || !snapshot.canUseMoonSight}><kbd>V</kbd><span>{snapshot.moonSightActive ? "SEEING" : "SIGHT"}</span></button>}
          {snapshot.role === "IMPOSTOR" && <button className={`action kill ${snapshot.canKill ? "ready" : ""}`} onClick={() => engineRef.current?.kill()} disabled={snapshot.phase !== "ORDEAL" || snapshot.killSpent || snapshot.killCooldown > 0}><kbd>Q</kbd><span>{snapshot.killSpent ? "SPENT" : snapshot.killCooldown > 0 ? snapshot.killCooldown.toFixed(1) : "KILL"}</span></button>}
          <button className={`action use ${snapshot.charges[snapshot.selectedItem] > 0 ? "ready" : ""}`} onClick={() => engineRef.current?.useItem()}><kbd>F</kbd><span>USE</span></button>
        </div>

        {snapshot.taskPrompt && (
          <button
            type="button"
            className="interaction-prompt interaction-prompt-button"
            onClick={() => engineRef.current?.tryOpenPuzzle()}
            onPointerDown={() => { if (snapshot.taskMode === "HOLD") engineRef.current?.setTouch("KeyE", true); }}
            onPointerUp={() => engineRef.current?.setTouch("KeyE", false)}
            onPointerCancel={() => engineRef.current?.setTouch("KeyE", false)}
            onPointerLeave={() => engineRef.current?.setTouch("KeyE", false)}
          >
            <kbd>E</kbd>
            <span>{snapshot.taskMode === "PUZZLE" ? (snapshot.role === "IMPOSTOR" ? "OPEN FAKE PUZZLE" : "OPEN QUICK PUZZLE") : (snapshot.role === "IMPOSTOR" ? "HOLD FAKE CALIBRATION" : "HOLD TO CALIBRATE")} • EARNS {snapshot.stationStatus ? ITEM_LABELS[snapshot.stationStatus.reward].toUpperCase() : "GEAR"}</span>
          </button>
        )}

        {snapshot.stationStatus?.completed && snapshot.phase === "CALM" && (
          <div className="station-sealed-prompt" role="status">
            <span>✓</span><div><b>WARD SEALED</b><small>{snapshot.stationStatus.label} reopens next round • choose another sanctum</small></div>
          </div>
        )}

        <div className="touch-pad" aria-label="Touch movement controls">
          <TouchButton code="ArrowUp" onTouch={handleTouch}>▲</TouchButton>
          <TouchButton code="ArrowLeft" onTouch={handleTouch}>◀</TouchButton>
          <TouchButton code="ArrowDown" onTouch={handleTouch}>▼</TouchButton>
          <TouchButton code="ArrowRight" onTouch={handleTouch}>▶</TouchButton>
        </div>
      </section>

      <footer className="game-footer">
        <span>MOVE <kbd>WASD</kbd></span>
        <span>AIM <kbd>MOUSE</kbd></span>
        <span>TASK <kbd>E / HOLD E</kbd></span>
        <span>REPORT <kbd>R</kbd></span>
        {snapshot.role === "IMPOSTOR" && <span>MOON SIGHT <kbd>V</kbd></span>}
        {multiplayerClient ? (
          <span className="latency"><i style={{ background: networkState?.connected ? "#43efba" : "#ff687c" }} /> {networkState?.connected ? networkState.transport === "HTTP" ? "HTTP RELAY" : "REALTIME" : "DISCONNECTED"} • ROOM {multiplayerClient.roomCode} • {networkState?.ping || "—"}ms</span>
        ) : (
          <span className="latency"><i /> AI LINK 12ms</span>
        )}
      </footer>

      {roleReveal && (
        <div className={`impostor-reveal ${roleReveal === "IMPOSTOR" ? "impostor-theme" : "warden-theme"}`} role="dialog" aria-modal="true" aria-labelledby="role-reveal-title">
          <div className="reveal-vignette" />
          <div className="reveal-scanline" />
          <div className="reveal-core" aria-hidden="true">
            <span className="reveal-orbit orbit-one" />
            <span className="reveal-orbit orbit-two" />
            <span className="impostor-sigil"><i /><i /><b /></span>
          </div>
          <div className="reveal-copy">
            <small>{roleReveal === "IMPOSTOR" ? "PRIVATE IDENTITY // DECRYPTING" : "CIRCLE IDENTITY // ATTUNING"}</small>
            <p className="reveal-lead">YOU ARE {roleReveal === "IMPOSTOR" ? "THE" : "A"}</p>
            <h2 id="role-reveal-title">{roleReveal === "IMPOSTOR" ? "IMPOSTOR" : "WARDEN"}</h2>
            <p className="reveal-order">{roleReveal === "IMPOSTOR" ? "Hide in plain sight. Hunt freely during the Ordeal." : "Restore the moon wards. Keep your circle alive."}</p>
            <div className="reveal-progress" aria-hidden="true"><i /><i /><i /><i /><i /></div>
            <button onClick={dismissRoleReveal}>ENTER THE SANCTUARY</button>
          </div>
        </div>
      )}

      {killNotice && (
        <div key={killNotice.key} className="kill-notice" role="status" aria-live="polite" aria-atomic="true">
          <span aria-hidden="true">☾</span>
          <div className="kill-notice-copy">
            <strong>A Warden was dissolved</strong>
            <small>Stay alert. The hunt continues.</small>
          </div>
        </div>
      )}

      {deathReveal && (
        <div className="death-reveal" role="dialog" aria-modal="true" aria-labelledby="death-reveal-title">
          <div className="death-ripple" aria-hidden="true"><i /><i /><i /></div>
          <div className="death-reveal-card">
            <small>IDENTITY CONFIRMED // PRIVATE</small>
            <h2 id="death-reveal-title">YOU WERE DISSOLVED</h2>
            <div className="killer-label">KILLED BY</div>
            <div className="killer-portrait" style={{ "--killer-color": deathReveal.killerColor } as React.CSSProperties} aria-hidden="true">
              <span><i /><i /><b /></span>
            </div>
            <strong>{deathReveal.killerName}</strong>
            <p>You now know the Impostor—but the living crew cannot hear you.</p>
            <button onClick={dismissDeathReveal}>CONTINUE AS SPECTATOR</button>
          </div>
        </div>
      )}

      {puzzle && (
        <div className="modal-backdrop task-backdrop" role="dialog" aria-modal="true" aria-labelledby="task-puzzle-title">
          <div className="task-puzzle-card">
            <div className="task-puzzle-head">
              <div><small>MOON SHRINE // {puzzle.kind === "MATH" ? "RUNE CALCULATION" : "CONSTELLATION LINK"}</small><h2 id="task-puzzle-title">{puzzle.stationLabel}</h2><span className="puzzle-reward">REWARD • {ITEM_LABELS[puzzle.reward].toUpperCase()}</span></div>
              <button onClick={() => engineRef.current?.cancelPuzzle()} aria-label="Close puzzle">×</button>
            </div>
            <div className="task-puzzle-body">
              {puzzle.kind === "MATH" ? (
                <>
                  <p>Balance the ward by solving this short rune calculation.</p>
                  <div className="math-question">{puzzle.prompt}</div>
                </>
              ) : (
                <>
                  <p>{puzzle.prompt}</p>
                  <div className="signal-chain" aria-label="Signal pattern">
                    {puzzle.sequence?.map((node, index) => <span key={`${node}-${index}`}><b>{node}</b><i /></span>)}
                    <span className="missing-node"><b>?</b></span>
                  </div>
                </>
              )}
              <div className="puzzle-options">
                {puzzle.options.map((option, index) => (
                  <button key={`${option}-${index}`} onClick={() => engineRef.current?.submitPuzzle(index)}><kbd>{index + 1}</kbd><b>{option}</b></button>
                ))}
              </div>
              <div className={`puzzle-feedback ${puzzle.error ? "error" : ""}`}>{puzzle.error || `Choose one answer. This sanctum seals for the current round and grants one ${ITEM_LABELS[puzzle.reward]} charge. It reopens at the next Calm.`}</div>
            </div>
          </div>
        </div>
      )}

      {meeting && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="meeting-title">
          <div className="meeting-card">
            <div className="meeting-alert"><span>!</span><div><small>{meeting.tally ? "VOTES COUNTED" : `REPORTED BY ${meeting.reporter}`}</small><h2 id="meeting-title">{meeting.reason}</h2></div><b>{meeting.tally ? "FINAL TALLY" : "DISCUSS + VOTE"}</b></div>
            <div className="meeting-content">
              {meeting.tally ? (
                <div className="vote-tally-screen">
                  <div className={`vote-verdict ${meeting.ejectedId ? "ejected" : "no-ejection"}`}>
                    <small>FINAL VERDICT</small>
                    <h3>{meeting.verdict}</h3>
                    <p>The crew’s votes have been counted.</p>
                  </div>
                  <div className="tally-grid" aria-label="Vote totals by player">
                    {meeting.tally.map((entry) => (
                      <div className={`tally-card ${entry.isTop ? "top-tally" : ""} ${entry.targetId === meeting.ejectedId ? "ejected" : ""} ${entry.targetId ? "" : "skip-tally"}`} key={entry.targetId || "SKIP"}>
                        <b className="tally-name">{entry.targetName}</b>
                        {entry.targetColor ? (
                          <span className="tally-slime" style={{ "--tally-color": entry.targetColor } as React.CSSProperties}><i /><i /><em /></span>
                        ) : (
                          <span className="tally-skip-mark">—</span>
                        )}
                        <strong>{entry.votes}</strong>
                        <small>{entry.votes === 1 ? "VOTE" : "VOTES"}</small>
                        {entry.targetId === meeting.ejectedId && <span className="tally-status">EJECTED</span>}
                        {!meeting.ejectedId && meeting.tied && entry.isTop && entry.votes > 0 && <span className="tally-status">TIED</span>}
                      </div>
                    ))}
                  </div>
                  <button className="continue-vote" onClick={() => engineRef.current?.resolveMeeting()}>CONTINUE MATCH</button>
                </div>
              ) : (
                <div className="discussion-layout">
                  <section className="meeting-chat" aria-label="Meeting discussion">
                    <div className="chat-heading"><div><small>LIVE DISCUSSION</small><b>WARDEN CHANNEL</b></div><span>{snapshot.living} ONLINE</span></div>
                    <div className="chat-log" ref={chatLogRef} role="log" aria-live="polite">
                      {chatMessages.map((message) => message.system ? (
                        <div className="chat-system" key={message.id}><span>◆</span>{message.text}</div>
                      ) : (
                        <div className={`chat-message ${message.playerId === "you" ? "from-you" : ""}`} key={message.id}>
                          <span className="chat-avatar" style={{ "--chat-color": message.playerColor } as React.CSSProperties}><i /><i /></span>
                          <div><b>{message.playerName}</b><p>{message.text}</p></div>
                        </div>
                      ))}
                    </div>
                    <form className="chat-composer" onSubmit={sendChatMessage}>
                      <input
                        value={chatDraft}
                        onChange={(event) => setChatDraft(event.target.value)}
                        maxLength={160}
                        disabled={!snapshot.humanAlive}
                        aria-label="Meeting message"
                        placeholder={snapshot.humanAlive ? "Share an alibi or suspicion…" : "Ghosts cannot speak to the living"}
                      />
                      <button type="submit" disabled={!snapshot.humanAlive || !chatDraft.trim()} aria-label="Send meeting message">SEND</button>
                    </form>
                    <small className="chat-rule">Living players only • Messages close when voting ends</small>
                  </section>

                  <section className="vote-panel" aria-label="Cast your vote">
                    <p>Discuss first, then select the slime you distrust. The next screen shows the final tally.</p>
                    <div className="vote-grid">
                      {meeting.candidates.map((player) => {
                        const isYou = player.id === snapshot.localPlayerId;
                        return (
                          <button key={player.id} disabled={!player.alive || isYou || !snapshot.humanAlive} onClick={() => engineRef.current?.vote(player.id)}>
                            <span className="vote-slime" style={{ "--vote-color": player.alive ? player.color : "#53616b" } as React.CSSProperties}><i /><i /></span>
                            <b>{player.name}</b><small>{player.alive ? (isYou ? "YOU" : "VOTE") : "ELIMINATED"}</small>
                          </button>
                        );
                      })}
                    </div>
                    <button className="skip-vote" onClick={() => engineRef.current?.vote(null)}>{snapshot.humanAlive ? "SKIP VOTE" : "REVEAL CREW VOTE"}</button>
                  </section>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {result && (
        <div className="modal-backdrop result-backdrop" role="dialog" aria-modal="true" aria-labelledby="result-title">
          <div className="result-card">
            <small>SIMULATION COMPLETE</small>
            <h2 id="result-title">{result}</h2>
            <p>The hidden role was assigned privately. No public character trait revealed allegiance.</p>
            <button onClick={onExit}>RETURN TO LOBBY</button>
          </div>
        </div>
      )}
    </main>
  );
}

export default function Home() {
  const [match, setMatch] = useState<
    | { mode: "SOLO"; count: number; role: RoleChoice }
    | { mode: "MULTI"; client: MultiplayerClient; initialPlayers: NetPlayer[]; assignedRole: Role }
    | null
  >(null);

  const [client] = useState(() => new MultiplayerClient());
  const [mpState, setMpState] = useState<MultiplayerState | null>(null);

  useEffect(() => {
    const unsubState = client.onStateChange((next) => {
      setMpState(next);
    });

    const unsubMsg = client.onMessage((msg) => {
      if (msg.type === "MATCH_STARTED") {
        setMatch({
          mode: "MULTI",
          client,
          initialPlayers: msg.players,
          assignedRole: msg.role,
        });
      }
    });

    return () => {
      unsubState();
      unsubMsg();
      client.disconnect();
    };
  }, [client]);

  const handleExit = () => {
    if (match?.mode === "MULTI") {
      match.client.leaveRoom();
    }
    setMatch(null);
  };

  return match ? (
    <Game
      count={match.mode === "SOLO" ? match.count : match.initialPlayers.length}
      roleChoice={match.mode === "SOLO" ? match.role : match.assignedRole}
      multiplayerClient={match.mode === "MULTI" ? match.client : null}
      initialPlayers={match.mode === "MULTI" ? match.initialPlayers : undefined}
      assignedRole={match.mode === "MULTI" ? match.assignedRole : undefined}
      onExit={handleExit}
    />
  ) : (
    <Lobby
      onLaunch={(count, role) => setMatch({ mode: "SOLO", count, role })}
      multiplayerClient={client}
      mpState={mpState}
    />
  );
}
