"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MultiplayerClient, type MultiplayerState } from "./network";
import type { NetMovement, NetPlayer, S2CMessage } from "../server/game-types";
import { MovementBuffer } from "./movement";
import { slimeEyes, slimeOutline, slimeSkin } from "./slime-art";
import { SlimePortrait } from "./slime-portrait";
import { EyeStylePicker } from "./eye-style-picker";
import { EYE_LABELS } from "./slime-eyes";
import { SlimeAnimator } from "./slime-motion";
import { EYE_STYLES, normalizeEyeStyle, type EyeStyle } from "../server/appearance";
import { drawForestSanctum } from "./sanctum-art";
import { availablePlayerName, PLAYER_COLORS as COLORS, randomWardenCallsign, WARDEN_CALLSIGNS } from "../server/palette";
import {
  ECHO_RANGE,
  HEARING_RANGE,
  MIRROR_BUMP_COOLDOWN_MS,
  MIRROR_BUMP_DISTANCE,
  MOON_SIGHT_SECONDS,
  ORDEAL_TASK_PROGRESS_REWARD,
  SANCTUARY_OBSTACLES,
  TASK_PROGRESS_REWARD,
  isOccludedByObstacle,
  nextHazard,
  ordealDuration,
  phantomPaths,
  resolveObstaclePosition,
  sanctuaryZoneName,
  type SanctuaryObstacle,
} from "../server/ordeal-rules";
import { ForestAudio, soundDirection } from "./forest-audio";
import { drawMoonGlade } from "./moon-glade";
import { fittedCanvasBounds } from "./canvas-bounds";
import { HomeAtmosphere, HomeFieldGuide, HomeGrove } from "./home-field-guide";
import { DEVOUR_SECONDS, drawSlimeConsumption, type DevourVisual } from "./slime-devour";
import { ConsumptionPortrait } from "./consumption-portrait";

type Role = "CREWMATE" | "IMPOSTOR";
type RoleChoice = Role | "RANDOM";
type Phase = "CALM" | "COUNTDOWN" | "ORDEAL" | "DISCUSSION";
type Hazard = "BLACKOUT" | "FOG" | "MOONGLARE" | "ROOTWAKE" | "PHANTOMS" | "MIRROR_POOL";
type ItemKind = "FLASHLIGHT" | "FLARE" | "SONAR";
type Hat = "antlers" | "hood" | "moth" | "mooncap";
type SoloProfile = { name: string; color: string; hat: Hat; eyeStyle: EyeStyle };
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
  trueColor?: string;
  hat: Hat;
  eyeStyle: EyeStyle;
  alive: boolean;
  ai: boolean;
  targetX: number;
  targetY: number;
  thinkAt: number;
  atStation: number;
  flashlight: boolean;
  working?: boolean;
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
  soundCaption: string;
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
  victimColor?: string;
};

type DevourEvent = DevourVisual & {
  id: string;
  killerId?: string;
  startedAt: number;
  duration: number;
  lastChomp: number;
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
  targetEyeStyle?: EyeStyle;
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
const NAMES = ["Bubbles", "Mochi", "Gloop", "Pebble", "Nori", "Fizz", "Wobble", "Pip"];
const WARDEN_ALIBIS = ["Cute hat. Very convincing alibi.", "My alibi? Excellent moon-gazing.", "I swear the fog followed me here."];
const HATS: Hat[] = ["antlers", "hood", "moth", "mooncap"];
const ITEM_LABELS: Record<ItemKind, string> = { FLASHLIGHT: "Glowing Mushroom", FLARE: "Moonblossom", SONAR: "Echo Bell" };
const HAZARD_LABELS: Record<Hazard, string> = {
  BLACKOUT: "TOTAL BLACKOUT",
  FOG: "THICK SEA FOG",
  MOONGLARE: "MOON GLARE",
  ROOTWAKE: "ROOTWAKE",
  PHANTOMS: "PHANTOM PROCESSION",
  MIRROR_POOL: "MIRROR POOL",
};
const ITEM_DESCRIPTIONS: Record<ItemKind, string> = {
  FLASHLIGHT: "Aim its moonlit spores to light the path for seven seconds",
  FLARE: "Plant a shared circle of soft light for five seconds",
  SONAR: "Ring for six seconds of movement echoes and phantom detection",
};
const KILL_COOLDOWN_SECONDS = 1.6;

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
    soundCaption: "",
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
    && a.soundCaption === b.soundCaption
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
  devourEvents: DevourEvent[] = [];
  devourShakeUntil = 0;
  devourShakePower = 0;
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
  private pendingDevourVictimId: string | null = null;
  moonSightUntil = 0;
  moonSightUsedThisOrdeal = false;
  private abilityPending = false;
  private ordealSeed = 1;
  private phantomRoutes = phantomPaths(1);
  private echoes: { x: number; y: number; until: number; nextAt: number }[] = [];
  private heardCueIds = new Set<string>();
  private footsteps = new Map<string, { x: number; y: number; at: number }>();
  private caption = "";
  private captionUntil = 0;
  private lastCaptionAt = -1;
  audio = new ForestAudio();
  lowGlare = false;
  private slimeAnimator = new SlimeAnimator();
  private motionPreference: MediaQueryList | null = null;
  private reducedMotion = false;
  private onMotionPreferenceChange = (event: MediaQueryListEvent) => { this.reducedMotion = event.matches; };
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

  startDevour(bodyId: string, x: number, y: number, victimColor: string, killerId?: string, killerColor = "#ff4265") {
    const existing = this.devourEvents.find((event) => event.id === bodyId);
    if (existing) {
      // The victim's private reveal may arrive after the anonymous body packet.
      if (killerId) {
        const killer = this.players.find((player) => player.id === killerId);
        existing.killerId = killerId;
        existing.killerColor = killerColor;
        existing.startX = killer?.x ?? existing.startX;
        existing.startY = killer?.y ?? existing.startY;
      }
      return;
    }
    const isVictim = bodyId === this.localPlayerId || bodyId === `body-${this.localPlayerId}`;
    const isKiller = killerId === this.localPlayerId || Boolean(this.pendingDevourVictimId && bodyId === `body-${this.pendingDevourVictimId}`);
    if (isKiller) this.pendingDevourVictimId = null;
    const isDirect = isVictim || isKiller;
    // Do not guess another player's role from proximity or move their collider.
    const resolvedKillerId = killerId ?? (isKiller ? this.localPlayerId : undefined);
    const resolvedKiller = resolvedKillerId ? this.players.find((p) => p.id === resolvedKillerId) : undefined;
    this.devourEvents.push({
      id: bodyId,
      x,
      y,
      victimColor,
      killerId: resolvedKillerId,
      killerColor: resolvedKiller?.color || "#637a7b",
      startX: resolvedKiller?.x ?? x - 34,
      startY: resolvedKiller?.y ?? y,
      startedAt: this.elapsed,
      duration: DEVOUR_SECONDS,
      lastChomp: 0,
    });
    if (!this.reducedMotion) this.burst(x, y + 4, "#d9edc4", 8);
    if (!this.reducedMotion && (isDirect || dist(this.human, { x, y }) < 280)) {
      this.devourShakeUntil = this.elapsed + 0.32;
      this.devourShakePower = isDirect ? 3 : 1.2;
    }
    this.audio.devour(this.human, { x, y }, isDirect);
    if (!isDirect && this.human.alive && dist(this.human, { x, y }) <= HEARING_RANGE && (this.hazard !== "ROOTWAKE" || sharesRootCell(this.human, { x, y }))) {
      this.caption = "A strange gulp nearby";
      this.captionUntil = this.elapsed + 1.8;
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
  private lastSentInput = { x: -1, y: -1, vx: 0, vy: 0, angle: 0, flashlight: false, working: false };

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
    soloProfile?: SoloProfile,
  ) {
    this.canvas = canvas;
    this.motionPreference = window.matchMedia?.("(prefers-reduced-motion: reduce)") ?? null;
    this.reducedMotion = this.motionPreference?.matches ?? false;
    this.motionPreference?.addEventListener("change", this.onMotionPreferenceChange);
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
    this.audio.enabled = true;
    this.makeStations();
    this.multiplayerClient = multiplayerClient || null;
    if (this.multiplayerClient && initialPlayers && initialPlayers.length > 0) {
      this.localPlayerId = this.multiplayerClient.playerId;
      this.initMultiplayerPlayers(initialPlayers, assignedRole);
      this.unsubscribeNet = this.multiplayerClient.onMessage((msg) => this.handleNetworkMessage(msg));
    } else {
      this.makePlayers(count, roleChoice, soloProfile);
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

  private mirrorBumpCooldowns = new Map<string, number>();

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
        trueColor: p.color,
        hat: p.hat,
        eyeStyle: normalizeEyeStyle(p.eyeStyle),
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
      case "ABILITY_STATE":
        if (msg.roundId !== this.stationRound) break;
        this.abilityPending = false;
        this.moonSightUsedThisOrdeal = msg.used;
        this.moonSightUntil = msg.sightRemainingMs > 0 ? this.elapsed + msg.sightRemainingMs / 1000 : 0;
        if (!msg.accepted) this.flashMessage("Your special action is unavailable. Choose Sight OR Echo once per Ordeal.");
        this.emit(true);
        break;
      case "SOUND_CUE":
        if (this.phase !== "ORDEAL" || Date.now() > msg.cue.expiresAt || this.heardCueIds.has(msg.cue.id)) break;
        if (this.heardCueIds.size > 100) this.heardCueIds.clear();
        this.heardCueIds.add(msg.cue.id);
        this.hearRustle(msg.cue);
        break;
      case "KILL_RESULT":
        this.killUsedThisOrdeal = msg.spent;
        if (!msg.accepted) this.pendingDevourVictimId = null;
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
            if (this.human.color !== p.color) {
              this.human.color = p.color;
              this.burst(this.human.x, this.human.y, "#8be9fd", 22);
              if (this.phase === "ORDEAL" && this.hazard === "MIRROR_POOL") {
                this.flashMessage("MIRROR RIPPLE — your reflection swapped colors on impact!");
              }
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
              trueColor: p.color,
              hat: p.hat,
              eyeStyle: normalizeEyeStyle(p.eyeStyle),
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
            if (existing.color !== p.color) {
              this.burst(existing.x, existing.y, "#8be9fd", 18);
            }
            existing.color = p.color;
            existing.hat = p.hat;
            existing.eyeStyle = normalizeEyeStyle(p.eyeStyle);
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
            existing.working = Boolean(p.working);
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
        if (msg.ordealSeed !== undefined && msg.ordealSeed !== this.ordealSeed) {
          this.ordealSeed = msg.ordealSeed;
          this.phantomRoutes = phantomPaths(msg.ordealSeed);
        }
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
          this.pendingDevourVictimId = null;
          this.moonSightUsedThisOrdeal = false;
          this.moonSightUntil = 0;
          this.abilityPending = false;
          this.heardCueIds.clear();
        }
        if (this.phase !== "ORDEAL") this.moonSightUntil = 0;
        this.emit(stationSealedNow || stationResetNow);
        break;
      }

      case "BODY_SPAWNED": {
        const b = msg.body;
        if (!this.bodies.some((x) => x.id === b.id)) {
          this.bodies.push({ id: b.id, x: b.x, y: b.y, color: b.color, name: b.name, age: b.age });
          this.startDevour(b.id, b.x, b.y, b.color);
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
        for (const player of this.players) { player.vx = 0; player.vy = 0; player.working = false; }
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
            eyeStyle: normalizeEyeStyle(c.eyeStyle),
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
        this.audio.meetingAlert(msg.reason.includes("PUDDLE") || msg.reason.includes("BODY"));
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
        this.human.working = false;
        this.cancelPuzzle("");
        const privateKiller = this.players.find((player) => player.name === msg.killerName);
        this.startDevour(`body-${this.localPlayerId}`, this.human.x, this.human.y, this.human.color, privateKiller?.id, msg.killerColor);
        this.paused = true;
        this.onDeath({ killerName: msg.killerName, killerColor: msg.killerColor, victimColor: this.human.color });
        this.flashMessage(`You were devoured by ${msg.killerName}. Spectating the remaining crew.`);
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
        player.working = Boolean(next.working);
        continue;
      }
      if (!next.alive) { player.vx = 0; player.vy = 0; player.working = false; }
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

  makePlayers(count: number, roleChoice: RoleChoice, profile?: SoloProfile) {
    const colors = profile ? [profile.color, ...COLORS.filter(color => color !== profile.color)] : COLORS;
    const occupiedNames: string[] = [];
    let impostorIndex = Math.floor(Math.random() * count);
    if (roleChoice === "IMPOSTOR") impostorIndex = 0;
    if (roleChoice === "CREWMATE") impostorIndex = 1 + Math.floor(Math.random() * (count - 1));
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2;
      const callsign = availablePlayerName(i === 0 ? (profile?.name || "") : NAMES[i - 1], occupiedNames);
      occupiedNames.push(callsign);
      this.players.push({
        id: i === 0 ? "you" : `bot-${i}`,
        name: i === 0 ? `${callsign} (YOU)` : callsign,
        role: i === impostorIndex ? "IMPOSTOR" : "CREWMATE",
        x: 640 + Math.cos(angle) * 170,
        y: 384 + Math.sin(angle) * 116,
        vx: 0,
        vy: 0,
        color: colors[i % colors.length],
        trueColor: colors[i % colors.length],
        hat: i === 0 && profile ? profile.hat : HATS[i % HATS.length],
        eyeStyle: i === 0 && profile ? profile.eyeStyle : EYE_STYLES[i % EYE_STYLES.length],
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
    const bounds = fittedCanvasBounds(this.canvas.getBoundingClientRect());
    this.canvasRect = new DOMRect(bounds.left, bounds.top, bounds.width, bounds.height);
  };

  resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.updateRect();
  };

  keyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    const tag = target?.tagName;
    // Never steal keystrokes from text entry (e.g. the meeting chat).
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;
    // Let focused buttons keep their native Space/Enter activation.
    if (tag === "BUTTON" && (event.code === "Space" || event.code === "Enter" || event.code === "NumpadEnter")) return;
    void this.audio.unlock();
    if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyE", "KeyF", "KeyR", "KeyQ", "KeyV", "KeyC", "Space", "Escape"].includes(event.code)) {
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
    if (event.code === "KeyC") this.useEchoLure();
    if (event.code === "Digit1") this.selectItem("FLASHLIGHT");
    if (event.code === "Digit2") this.selectItem("FLARE");
    if (event.code === "Digit3") this.selectItem("SONAR");
  };

  keyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code);
  };

  pointerMove = (event: PointerEvent) => {
    if (event.type === "pointerdown") void this.audio.unlock();
    if (!this.canvasRect || this.canvasRect.width <= 0) this.updateRect();
    const rect = this.canvasRect;
    if (!rect) return;
    if (rect.width <= 0 || rect.height <= 0) return;
    this.mouse.x = clamp(((event.clientX - rect.left) / rect.width) * W, 0, W);
    this.mouse.y = clamp(((event.clientY - rect.top) / rect.height) * H, 0, H);
  };

  contextMenu = (event: MouseEvent) => {
    event.preventDefault();
    this.useItem();
  };

  destroy() {
    this.audio.destroy();
    this.slimeAnimator.clear();
    this.motionPreference?.removeEventListener("change", this.onMotionPreferenceChange);
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
    if (this.phase === "DISCUSSION" || !this.human.alive || this.paused || this.activePuzzle) return;
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
    this.human.working = true;
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
    this.human.working = false;
    this.onPuzzle(null);
    this.keys.delete("KeyE");
    this.emit(true);
  }

  completeStation(station: Station, wasFake: boolean) {
    if (station.completed) return;
    station.completed = true;
    station.cooldown = 0;
    this.human.working = false;
    const reward = station.reward;
    this.charges[reward] = Math.min(3, this.charges[reward] + 1);
    this.selectedItem = reward;
    this.rewardNotice = { item: reward, station: station.label };
    this.rewardNoticeUntil = this.elapsed + 5.5;
    const progressGain = this.phase === "ORDEAL" ? ORDEAL_TASK_PROGRESS_REWARD : TASK_PROGRESS_REWARD;
    if (this.multiplayerClient) {
      this.multiplayerClient.sendTask(station.label, reward, this.stationRound);
    } else if (!wasFake) {
      this.taskProgress = Math.min(100, this.taskProgress + progressGain);
    }
    const prefix = wasFake ? "Counterfeit rite accepted" : `${station.label} sealed (+${progressGain}% wards)`;
    this.flashMessage(`${prefix}. ${ITEM_LABELS[reward]} acquired for the next Ordeal.`);
    if (!this.multiplayerClient) station.completedAt = this.elapsed;
    if (!wasFake && !this.multiplayerClient) this.checkWin();
  }

  cancelPuzzle(message = "Shrine trial paused. Return when ready.") {
    if (!this.activePuzzle) return;
    this.activePuzzle = null;
    this.human.working = false;
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
      this.flashMessage("Moonblossom planted — shared light holds for 5 seconds.");
    } else {
      this.itemActiveUntil = this.elapsed + (this.selectedItem === "FLASHLIGHT" ? 7 : 6);
      this.flashMessage(this.selectedItem === "FLASHLIGHT" ? "Glowing Mushroom awakened. Aim its light with your cursor." : "Echo Bell ringing — listen for nearby movement.");
    }
    this.emit(true);
  }

  useMoonSight() {
    this.useSpecial("MOON_SIGHT");
  }

  useEchoLure() { this.useSpecial("ECHO_LURE"); }

  useSpecial(ability: "MOON_SIGHT" | "ECHO_LURE") {
    if (this.human.role !== "IMPOSTOR" || this.phase !== "ORDEAL" || !this.human.alive || this.paused || this.abilityPending) return;
    if (this.moonSightUsedThisOrdeal) {
      this.flashMessage("Special action spent. Choose Moon Sight OR Echo Lure once each Ordeal.");
      return;
    }
    if (this.multiplayerClient) {
      this.abilityPending = true;
      this.multiplayerClient.useAbility(ability, this.mouse.x, this.mouse.y, this.stationRound);
    } else {
      this.moonSightUsedThisOrdeal = true;
      if (ability === "MOON_SIGHT") this.moonSightUntil = this.elapsed + Math.min(MOON_SIGHT_SECONDS, this.phaseTime);
      else {
        const scale = Math.min(1, ECHO_RANGE / Math.max(1, dist(this.mouse, this.human)));
        let point = { x: clamp(this.human.x + (this.mouse.x - this.human.x) * scale, 112, 1168), y: clamp(this.human.y + (this.mouse.y - this.human.y) * scale, 120, 658) };
        if (this.hazard === "ROOTWAKE") {
          const cell = getRootCell(this.human.x, this.human.y);
          point = { x: clamp(point.x, cell.x + 30, cell.x + cell.w - 30), y: clamp(point.y, cell.y + 30, cell.y + cell.h - 30) };
        }
        this.echoes.push({ ...point, until: this.elapsed + 2, nextAt: 0 });
      }
    }
    this.flashMessage(ability === "MOON_SIGHT" ? "MOON SIGHT AWAKENED — all crewmate positions and colors revealed!" : "ECHO LURE — a false rustle follows your aim. Special action spent.");
    this.emit(true);
  }

  hearRustle(point: { x: number; y: number }) {
    if (!this.human.alive || dist(this.human, point) > HEARING_RANGE || (this.hazard === "ROOTWAKE" && this.human.role !== "IMPOSTOR" && !sharesRootCell(this.human, point))) return;
    this.audio.rustle(this.human, point);
    if (this.elapsed - this.lastCaptionAt < 0.7) return;
    this.lastCaptionAt = this.elapsed;
    this.caption = soundDirection(this.human, point);
    this.captionUntil = this.elapsed + 1.2;
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
    void this.audio.unlock();
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
      );
      const victim = victims.sort((a, b) => dist(a, this.human) - dist(b, this.human))[0];
      if (!victim) {
        this.flashMessage("No crewmate in melee range.");
        return;
      }
      this.pendingDevourVictimId = victim.id;
      this.multiplayerClient.sendKill(victim.id);
      this.killUsedThisOrdeal = true;
      this.killCooldownUntil = this.elapsed + KILL_COOLDOWN_SECONDS;
      this.flashMessage("Devouring target — awaiting the sanctuary's verdict.");
      return;
    }
    const victims = this.players.filter((player) =>
      player.alive
      && player.role === "CREWMATE"
      && dist(player, this.human) < 84
    );
    const victim = victims.sort((a, b) => dist(a, this.human) - dist(b, this.human))[0];
    if (!victim) {
      this.flashMessage("No crewmate in melee range.");
      return;
    }
    this.eliminate(victim, this.human);
    this.killCooldownUntil = this.elapsed + KILL_COOLDOWN_SECONDS;
    this.flashMessage("Prey devoured. Your jaws are spent until the next Ordeal.");
  }

  eliminate(victim: Player, killer: Player) {
    victim.alive = false;
    victim.working = false;
    victim.vx = 0;
    victim.vy = 0;
    this.killUsedThisOrdeal = true;
    this.bodies.push({ id: victim.id, x: victim.x, y: victim.y, color: victim.color, name: victim.name, age: 0 });
    this.startDevour(victim.id, victim.x, victim.y, victim.color, killer.id, killer.color);
    this.onKill({ key: `${victim.id}-${performance.now()}` });
    this.recordWitnesses(victim, killer);
    if (victim.id === "you") {
      this.cancelPuzzle("");
      this.paused = true;
      this.onDeath({ killerName: killer.name, killerColor: killer.color, victimColor: victim.color });
      this.flashMessage(`You were devoured by ${killer.name}. Spectating the remaining crew.`);
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
    const flareLit = this.flares.some((flare) => dist(flare, target) < 146);
    if (!flareLit && isOccludedByObstacle(observer, target)) return false;
    if (this.phase !== "ORDEAL") return d < 420;
    if (this.hazard === "ROOTWAKE") return sharesRootCell(observer, target) && d < 420;
    if (this.hazard === "PHANTOMS") return d < 58;
    if (flareLit) return d < 420;
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

  restoreTrueColors() {
    for (const player of this.players) {
      if (player.trueColor && player.color !== player.trueColor) {
        player.color = player.trueColor;
      }
    }
    this.mirrorBumpCooldowns.clear();
  }

  checkMirrorPoolBumps() {
    if (this.phase !== "ORDEAL" || this.hazard !== "MIRROR_POOL") return;
    const living = this.players.filter((p) => p.alive);
    for (let i = 0; i < living.length; i += 1) {
      for (let j = i + 1; j < living.length; j += 1) {
        const a = living[i];
        const b = living[j];
        if (dist(a, b) > MIRROR_BUMP_DISTANCE) continue;
        const pairKey = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
        if (this.elapsed < (this.mirrorBumpCooldowns.get(pairKey) ?? 0)) continue;
        this.mirrorBumpCooldowns.set(pairKey, this.elapsed + MIRROR_BUMP_COOLDOWN_MS / 1000);
        const temp = a.color;
        a.color = b.color;
        b.color = temp;
        this.burst((a.x + b.x) / 2, (a.y + b.y) / 2, "#8be9fd", 22);
        if (a.id === this.localPlayerId || b.id === this.localPlayerId) {
          this.flashMessage("MIRROR RIPPLE — your reflection swapped colors on impact!");
        }
      }
    }
  }

  startMeeting(reason: string, reporter: string) {
    if (this.paused) return;
    this.restoreTrueColors();
    this.cancelPuzzle("");
    for (const player of this.players) player.working = false;
    this.paused = true;
    this.phase = "DISCUSSION";
    const accusations: Record<string, string | null> = {};
    for (const player of this.players) {
      if (player.ai && player.alive) accusations[player.id] = this.primeSuspect(player);
    }
    this.activeMeeting = { reason, reporter, candidates: this.players.map((player) => ({ ...player })), accusations };
    this.audio.meetingAlert(reason.includes("PUDDLE") || reason.includes("BODY"));
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
        targetEyeStyle: player.eyeStyle,
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
        && dist(player, this.human) < 84,
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
      canUseMoonSight: this.human.alive && this.human.role === "IMPOSTOR" && this.phase === "ORDEAL" && !this.moonSightUsedThisOrdeal && !this.abilityPending,
      moonSightActive,
      soundCaption: this.phase === "ORDEAL" && this.elapsed < this.captionUntil ? this.caption : "",
      canReport: this.human.alive && (nearbyBody || nearButton),
      taskPrompt: Boolean(nearestStation && !nearestStation.completed && nearestStation.cooldown <= 0) && this.phase !== "DISCUSSION" && this.human.alive,
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
    this.updateDevourEffects(dt);
    if (!this.paused && (!this.roleRevealActive || this.multiplayerClient)) {
      this.update(dt);
    } else if (dt > 0) {
      for (const p of this.particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= Math.pow(0.1, dt);
        p.vy *= Math.pow(0.1, dt);
        p.life -= dt;
      }
      this.particles = this.particles.filter((p) => p.life > 0);
    }
    this.draw();
    this.emit();
    this.frame = requestAnimationFrame(this.loop);
  };

  updateDevourEffects(dt: number) {
    if (this.devourEvents.length === 0) return;
    for (const event of this.devourEvents) {
      const progress = (this.elapsed - event.startedAt) / event.duration;
      if (!this.reducedMotion && progress >= 0.65 && event.lastChomp < 1) {
        event.lastChomp = 1;
        this.burst(event.x, event.y + 8, "#e7f1d3", 10);
      }
    }
    this.devourEvents = this.devourEvents.filter((event) => this.elapsed - event.startedAt < event.duration);
    void dt;
  }

  update(dt: number) {
    if (this.multiplayerClient) {
      this.phaseTime = Math.max(0, this.phaseTime - dt);
    } else {
      this.phaseTime -= dt;
      if (this.phaseTime <= 0) {
        if (this.phase === "CALM") {
          this.phase = "COUNTDOWN";
          this.phaseTime = 3;
          this.hazard = nextHazard(this.hazard);
          this.phantomRoutes = phantomPaths(Math.floor(Math.random() * 4294967296));
          this.flashMessage(`${HAZARD_LABELS[this.hazard]} INCOMING — prepare your gear and position.`);
        } else if (this.phase === "COUNTDOWN") {
          this.restoreTrueColors();
          this.phase = "ORDEAL";
          this.phaseTime = ordealDuration(this.hazard);
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
                    : this.hazard === "MIRROR_POOL"
                      ? "MIRROR POOL — controls are inverted for 25s! Bumping another warden swaps your colors."
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
      const targetClosure = this.phase === "DISCUSSION" ? 1 : 0;
      station.rootClosure = (station.rootClosure ?? targetClosure) + (targetClosure - (station.rootClosure ?? targetClosure)) * Math.min(1, dt * 8);
    }
    if (!this.multiplayerClient && this.phase === "ORDEAL") {
      for (const player of this.players) {
        if (!player.alive) continue;
        const previous = this.footsteps.get(player.id);
        if (!previous || (this.elapsed - previous.at >= 0.5 && dist(previous, player) >= 34)) {
          this.footsteps.set(player.id, { x: player.x, y: player.y, at: this.elapsed });
          if (previous) this.hearRustle(player);
        }
      }
      this.echoes = this.echoes.filter(echo => echo.until > this.elapsed);
      for (const echo of this.echoes) if (this.elapsed >= echo.nextAt) { this.hearRustle(echo); echo.nextAt = this.elapsed + 0.36; }
    } else if (this.phase !== "ORDEAL") this.echoes = [];
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
        const wk = Boolean(this.human.working);
        const prev = this.lastSentInput;
        if (
          rx !== prev.x
          || ry !== prev.y
          || rvx !== prev.vx
          || rvy !== prev.vy
          || Math.abs(aim - prev.angle) > 0.04
          || fl !== prev.flashlight
          || wk !== prev.working
          || this.elapsed - this.lastInputHeartbeat >= 0.5
        ) {
          this.lastInputHeartbeat = this.elapsed;
          this.lastSentInput = { x: rx, y: ry, vx: rvx, vy: rvy, angle: aim, flashlight: fl, working: wk };
          const seq = this.multiplayerClient.sendInput(rx, ry, rvx, rvy, aim, fl, wk);
          this.pendingInputs.set(seq, { x: rx, y: ry });
          if (this.pendingInputs.size > 180) this.pendingInputs.delete(this.pendingInputs.keys().next().value!);
        }
      }
    } else {
      this.updateBots(dt);
      this.checkMirrorPoolBumps();
    }
  }

  updateHuman(dt: number) {
    const player = this.human;
    if (!player.alive) {
      player.working = false;
      return;
    }
    if (this.multiplayerClient && !this.multiplayerClient.connected) { player.vx = 0; player.vy = 0; player.working = false; return; }
    player.flashlight = this.phase === "ORDEAL" && this.selectedItem === "FLASHLIGHT" && this.elapsed < this.itemActiveUntil;
    if (this.activePuzzle) {
      player.vx = 0;
      player.vy = 0;
      player.working = true;
      return;
    }
    const pressed = (code: string) => this.keys.has(code) || this.touchKeys.has(code);
    const invert = this.phase === "ORDEAL" && this.hazard === "MIRROR_POOL" ? -1 : 1;
    let dx = (Number(pressed("KeyD") || pressed("ArrowRight")) - Number(pressed("KeyA") || pressed("ArrowLeft"))) * invert;
    let dy = (Number(pressed("KeyS") || pressed("ArrowDown")) - Number(pressed("KeyW") || pressed("ArrowUp"))) * invert;
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
    const impostorPhasing = this.phase === "ORDEAL" && this.hazard === "ROOTWAKE" && player.role === "IMPOSTOR";
    const rootChecked = rootwakeStrength(this.phase, this.hazard, this.phaseTime) > 0.72 && !impostorPhasing
      ? resolveRootPosition(nextX, nextY)
      : { x: nextX, y: nextY };
    const next = impostorPhasing ? rootChecked : resolveObstaclePosition(rootChecked.x, rootChecked.y);
    if (next.x !== nextX) player.vx *= 0.08;
    if (next.y !== nextY) player.vy *= 0.08;
    player.x = next.x;
    player.y = next.y;

    const station = this.stations.find((entry) => dist(entry, player) < 84 && !entry.completed && entry.cooldown <= 0);
    if (station && !station.puzzle && pressed("KeyE") && this.phase !== "DISCUSSION") {
      this.taskHold += dt;
      if (this.taskHold >= 1.8) {
        this.taskHold = 0;
        player.working = false;
        this.completeStation(station, player.role === "IMPOSTOR");
      } else {
        player.working = true;
      }
    } else {
      this.taskHold = Math.max(0, this.taskHold - dt * 1.4);
      player.working = this.taskHold > 0.08;
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
        if (this.phase === "CALM" || this.phase === "COUNTDOWN" || (this.phase === "ORDEAL" && player.role === "CREWMATE" && Math.random() < 0.65)) {
          const station = this.stations[player.atStation % this.stations.length];
          player.targetX = station.x + (Math.random() - 0.5) * 28;
          player.targetY = station.y + (station.side === "top" ? 66 : station.side === "bottom" ? -62 : 0) + (Math.random() - 0.5) * 24;
          if (station.side === "left") player.targetX += 66;
          if (station.side === "right") player.targetX -= 66;
        } else if (player.role === "IMPOSTOR" && !this.killUsedThisOrdeal && this.elapsed >= this.killCooldownUntil) {
          const victims = this.players.filter((entry) =>
            entry.alive
            && entry.role === "CREWMATE"
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
      const impostorPhasing = this.phase === "ORDEAL" && this.hazard === "ROOTWAKE" && player.role === "IMPOSTOR";
      const rootChecked = rootwakeStrength(this.phase, this.hazard, this.phaseTime) > 0.72 && !impostorPhasing
        ? resolveRootPosition(nextX, nextY)
        : { x: nextX, y: nextY };
      const next = impostorPhasing ? rootChecked : resolveObstaclePosition(rootChecked.x, rootChecked.y);
      if (next.x !== nextX) player.vx *= -0.18;
      if (next.y !== nextY) player.vy *= -0.18;
      player.x = next.x;
      player.y = next.y;

      player.working = false;
      if (this.phase !== "DISCUSSION" && player.role === "CREWMATE") {
        const station = this.stations[player.atStation % this.stations.length];
        if (station.completed) {
          player.atStation = (player.atStation + 1) % this.stations.length;
        } else if (dist(player, station) < 78 && station.cooldown <= 0) {
          player.working = true;
          this.taskProgress = Math.min(100, this.taskProgress + dt * (this.phase === "ORDEAL" ? 0.5 : 0.34));
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
        if (player.role === "IMPOSTOR" && !this.killUsedThisOrdeal && this.elapsed >= this.killCooldownUntil && this.phaseTime < ordealDuration(this.hazard) - 1.6) {
          const victim = this.players
            .filter((entry) =>
              entry.alive
              && entry.role === "CREWMATE"
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
    return this.phantomRoutes.map((seed, index): Player => {
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
        eyeStyle: "FIERCE",
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
    ctx.save();
    if (!this.reducedMotion && this.elapsed < this.devourShakeUntil) {
      const decay = clamp((this.devourShakeUntil - this.elapsed) / 0.88, 0, 1);
      const shakeX = Math.sin(this.elapsed * 68) * this.devourShakePower * decay;
      const shakeY = Math.cos(this.elapsed * 54) * this.devourShakePower * 0.78 * decay;
      ctx.translate(shakeX, shakeY);
    }
    this.drawRoom(ctx);
    this.drawBeams(ctx);
    for (const body of this.bodies) this.drawBody(ctx, body);
    const moonGlareActive = this.phase === "ORDEAL" && this.hazard === "MOONGLARE";
    const phantomProcessionActive = this.phase === "ORDEAL" && this.hazard === "PHANTOMS";
    const rootwakeActive = this.phase === "ORDEAL" && this.hazard === "ROOTWAKE";
    const moonSightActive = this.human.role === "IMPOSTOR" && this.elapsed < this.moonSightUntil;
    if (moonGlareActive && !moonSightActive) this.drawLighting(ctx);
    type RenderItem =
      | { kind: "PLAYER"; y: number; player: Player; phantom: boolean }
      | { kind: "OBSTACLE"; y: number; obstacle: SanctuaryObstacle };
    const ordered: RenderItem[] = [
      ...this.players.filter((player) => player.alive).map((player): RenderItem => ({ kind: "PLAYER", y: player.y, player, phantom: false })),
      ...(phantomProcessionActive ? this.getPhantoms().map((player): RenderItem => ({ kind: "PLAYER", y: player.y, player, phantom: true })) : []),
      ...SANCTUARY_OBSTACLES.map((obstacle): RenderItem => ({ kind: "OBSTACLE", y: obstacle.y, obstacle })),
    ].sort((a, b) => a.y - b.y);
    const sonarActive = this.selectedItem === "SONAR" && this.elapsed < this.itemActiveUntil;
    for (const entry of ordered) {
      if (entry.kind === "OBSTACLE") {
        this.drawObstacle(ctx, entry.obstacle);
        continue;
      }
      const { player } = entry;
      if (entry.phantom) {
        this.drawSlime(ctx, player, true, false, false, moonSightActive ? 0.25 : 0.78);
        if (sonarActive || moonSightActive) this.drawPhantomMarker(ctx, player);
        continue;
      }
      const isLocal = player.id === this.localPlayerId;
      const occludedBehindCover = !isLocal && !moonSightActive && isOccludedByObstacle(this.human, player) && !this.flares.some((f) => dist(f, player) < 146);
      const revealed = isLocal || moonSightActive || (!occludedBehindCover && this.isRevealed(player));
      if (this.phase === "ORDEAL" && this.hazard === "BLACKOUT" && !revealed) continue;
      const silhouette = !moonSightActive && (moonGlareActive || phantomProcessionActive || occludedBehindCover || (this.phase === "ORDEAL" && (this.hazard === "FOG" || this.hazard === "MIRROR_POOL") && !revealed));
      const colorMuted = !moonSightActive && this.phase === "ORDEAL" && !silhouette && (this.hazard === "BLACKOUT" || this.hazard === "FOG" || this.hazard === "MIRROR_POOL");
      const baseAlpha = moonSightActive || this.phase !== "ORDEAL"
        ? 1
        : this.hazard === "BLACKOUT"
          ? 0.56
          : this.hazard === "FOG" || this.hazard === "MIRROR_POOL"
            ? silhouette ? 0.48 : 0.78
            : this.hazard === "PHANTOMS"
              ? 0.78
            : 1;
      const visibilityAlpha = occludedBehindCover ? Math.min(baseAlpha, 0.34) : baseAlpha;
      this.drawSlime(ctx, player, silhouette, moonSightActive && !isLocal, colorMuted, visibilityAlpha);
    }
    for (const event of this.devourEvents) {
      // Known actors animate inside drawSlime, inheriting the same visibility.
      if (event.killerId) continue;
      const isParticipant = event.killerId === this.localPlayerId || event.id === this.localPlayerId || event.id === `body-${this.localPlayerId}`;
      if (isParticipant || moonSightActive || this.isRevealed({ ...this.human, id: event.id, x: event.x, y: event.y, flashlight: false })) {
        this.drawDevourEffect(ctx, event, !moonSightActive && this.phase === "ORDEAL");
      }
    }
    if (!moonGlareActive) this.drawLighting(ctx);
    this.drawParticles(ctx);
    if (rootwakeActive) {
      this.drawRootwakeOcclusion(ctx);
      this.drawRootwake(ctx);
    }
    if (moonSightActive) {
      this.drawMoonSightOverlay(ctx);
    }
    if (this.phase === "COUNTDOWN" && this.hazard === "ROOTWAKE") {
      ctx.save(); ctx.strokeStyle = "#d8edb6b0"; ctx.lineWidth = 3; ctx.setLineDash([10, 9]);
      for (const wall of ROOT_BARRIERS) ctx.strokeRect(wall.x, wall.y, wall.w, wall.h);
      ctx.restore();
    }
    this.drawCanvasLabels(ctx);
    ctx.restore();
  }

  drawMoonSightOverlay(ctx: CanvasRenderingContext2D) {
    const pulse = 0.5 + Math.sin(this.elapsed * 9) * 0.5;
    ctx.save();
    for (const player of this.players) {
      if (!player.alive) continue;
      const isLocal = player.id === this.localPlayerId;
      if (!isLocal) {
        // Directional tracking tether in the crewmate's exact slime color
        ctx.save();
        ctx.strokeStyle = player.color;
        ctx.globalAlpha = 0.45 + pulse * 0.25;
        ctx.lineWidth = 2.2;
        ctx.setLineDash([7, 7]);
        ctx.beginPath();
        ctx.moveTo(this.human.x, this.human.y);
        ctx.lineTo(player.x, player.y);
        ctx.stroke();
        ctx.restore();

        // Color-coded target ring around the crewmate
        ctx.save();
        ctx.strokeStyle = player.color;
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(player.x, player.y + 4, 42 + pulse * 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      // Re-draw living slimes in 100% vibrant color above darkness/fog/glare/roots
      this.drawSlime(ctx, player, false, !isLocal, false, 1);
    }
    ctx.restore();
  }

  drawRootwakeOcclusion(ctx: CanvasRenderingContext2D) {
    const strength = rootwakeStrength(this.phase, this.hazard, this.phaseTime);
    if (strength <= 0) return;
    const cell = getRootCell(this.human.x, this.human.y);
    const pulse = 0.5 + Math.sin(this.elapsed * 4.8) * 0.5;
    ctx.save();
    if (this.human.role !== "IMPOSTOR") {
      ctx.fillStyle = `rgba(1,4,10,${0.985 * strength})`;
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.rect(cell.x, cell.y, cell.w, cell.h);
      ctx.fill("evenodd");

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
    } else {
      // Impostor sees the entire map during Root Cage and phases through root barriers
      ctx.strokeStyle = `rgba(108,255,181,${strength * (0.28 + pulse * 0.18)})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(cell.x + 3, cell.y + 3, cell.w - 6, cell.h - 6);
      ctx.fillStyle = `rgba(205,255,222,${strength * 0.9})`;
      ctx.font = "900 11px ui-monospace, monospace";
      ctx.textAlign = "left";
      ctx.fillText(`CELL ${cell.index + 1}  •  IMPOSTOR ROOTWALK (FULL MAP VISION • PASS THROUGH ROOTS)`, ROOM.left + 16, ROOM.top + 24);
    }
    ctx.restore();
  }

  drawRootwake(ctx: CanvasRenderingContext2D) {
    const strength = rootwakeStrength(this.phase, this.hazard, this.phaseTime);
    if (strength <= 0) return;
    ctx.save();
    if (this.human.role === "IMPOSTOR") {
      ctx.globalAlpha = 0.55;
    }
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
    drawMoonGlade(this.bgCtx);
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

    // Soft drifting spores replace the old radar rings; no gameplay occlusion.
    ctx.save();
    ctx.fillStyle = "rgba(229,240,190,.45)";
    for (let i = 0; i < 16; i++) {
      const x = 130 + ((i * 173 + this.elapsed * 5) % 1020);
      const y = 150 + (i * 97 % 450) + Math.sin(this.elapsed + i) * 6;
      ctx.beginPath(); ctx.arc(x, y, 1.1, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();


    // 3. Dynamic stations and emergency bell
    for (const station of this.stations) this.drawStation(ctx, station);
    this.drawEmergency(ctx);
  }


  drawStation(ctx: CanvasRenderingContext2D, station: Station) {
    drawForestSanctum(ctx, station, this.elapsed, this.phase === "DISCUSSION", dist(station, this.human) < 128);
  }

  drawEmergency(ctx: CanvasRenderingContext2D) {
    ctx.save(); ctx.translate(640, 382);
    const nearby = dist(this.human, { x: 640, y: 382 }) < 92 && this.phase === "CALM";
    // A carved crescent and a small hanging chime, not a screen-shaped machine.
    ctx.fillStyle = "rgba(24,53,40,.24)"; ctx.beginPath(); ctx.ellipse(0, 26, 46, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#817c59"; ctx.lineWidth = 6; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-31, 19); ctx.bezierCurveTo(-41, -14, -22, -43, 0, -36); ctx.bezierCurveTo(28, -41, 39, -8, 30, 19); ctx.stroke();
    ctx.strokeStyle = "#b4c393"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -32); ctx.lineTo(0, -12); ctx.stroke();
    const bell = ctx.createLinearGradient(-14, -12, 14, 15);
    bell.addColorStop(0, "#e5e8ba"); bell.addColorStop(.5, "#b9c69d"); bell.addColorStop(1, "#749b7c");
    ctx.fillStyle = bell; ctx.beginPath(); ctx.moveTo(-14, 10); ctx.quadraticCurveTo(-12, -15, 0, -15); ctx.quadraticCurveTo(12, -15, 14, 10); ctx.quadraticCurveTo(0, 18, -14, 10); ctx.fill();
    ctx.fillStyle = "#eff3ca"; ctx.beginPath(); ctx.arc(0, 14, 3, 0, Math.PI * 2); ctx.fill();
    for (const side of [-1, 1]) { ctx.fillStyle = "#96b57b"; ctx.beginPath(); ctx.ellipse(side * 25, -18, 9, 3, side * -.6, 0, Math.PI * 2); ctx.fill(); }
    if (nearby) { ctx.strokeStyle = "#d7ecc280"; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 20, 62, 35, 0, 0, Math.PI * 2); ctx.stroke(); }
    ctx.font = "700 10px Georgia, serif"; ctx.textAlign = "center";
    ctx.fillStyle = nearby ? "#eff6d6" : "#d8e4c8"; ctx.fillText(nearby ? "R · CALL THE CIRCLE" : "WARDEN BELL", 0, 47);
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
      gradient.addColorStop(0, "rgba(231,242,181,.45)");
      gradient.addColorStop(0.45, "rgba(160,219,177,.2)");
      gradient.addColorStop(1, "rgba(160,219,177,0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(flare.x, flare.y, radius, 0, Math.PI * 2);
      ctx.fill();

      // Hardware-accelerated radial flare core glow
      const flareHalo = ctx.createRadialGradient(flare.x, flare.y, 2, flare.x, flare.y, 20);
      flareHalo.addColorStop(0, "#fff2ac");
      flareHalo.addColorStop(0.45, "rgba(185,232,170,0.6)");
      flareHalo.addColorStop(1, "rgba(185,232,170,0)");
      ctx.fillStyle = flareHalo;
      ctx.beginPath();
      ctx.arc(flare.x, flare.y, 20, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#dce8b5";
      for (let petal = 0; petal < 5; petal++) {
        const angle = petal * Math.PI * 2 / 5;
        ctx.beginPath(); ctx.ellipse(flare.x + Math.cos(angle) * 7, flare.y + Math.sin(angle) * 7, 7, 3.5, angle, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = "#fff4c4"; ctx.beginPath(); ctx.arc(flare.x, flare.y, 3, 0, Math.PI * 2); ctx.fill();
    }
  }

  drawWorkingStatus(ctx: CanvasRenderingContext2D, x: number, badgeY: number) {
    const pulse = 0.72 + Math.sin(this.elapsed * 5.2) * 0.28;
    const text = "✦ WORKING SHRINE";
    ctx.save();
    ctx.font = "800 10px ui-monospace, monospace";
    ctx.textAlign = "center";
    const width = Math.ceil(ctx.measureText(text).width) + 16;
    const height = 18;
    const rx = x - width / 2;
    const ry = badgeY - 12;
    ctx.fillStyle = "rgba(8, 22, 18, 0.88)";
    ctx.strokeStyle = `rgba(126, 244, 198, ${(0.55 * pulse).toFixed(2)})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(rx, ry, width, height, 9);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = `rgba(216, 255, 234, ${(0.82 + 0.18 * pulse).toFixed(2)})`;
    ctx.fillText(text, x, badgeY);
    ctx.restore();
  }

  drawSlime(ctx: CanvasRenderingContext2D, player: Player, silhouette = false, moonSightMarked = false, colorMuted = false, visibilityAlpha = 1) {
    const consumption = this.devourEvents.find((event) => event.killerId === player.id);
    if (consumption) {
      this.drawDevourEffect(ctx, consumption, silhouette, player, colorMuted, visibilityAlpha);
      return;
    }
    const speed = Math.hypot(player.vx, player.vy);
    const seed = Array.from(player.id).reduce((sum, letter) => (sum * 31 + letter.charCodeAt(0)) % 997, 0);
    const pose = this.slimeAnimator.sample(player, this.elapsed, this.reducedMotion);
    const scaleX = pose.scaleX;
    const scaleY = pose.scaleY;
    const x = player.x;
    const y = player.y + pose.offsetY;
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
    ctx.globalAlpha = visibilityAlpha * pose.shadowAlpha;
    ctx.beginPath();
    ctx.ellipse(x, player.y + 31, 40 * pose.shadowScale, 11 * pose.shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = visibilityAlpha;
    if (speed > 55 && !silhouette) {
      ctx.fillStyle = baseColor;
      ctx.globalAlpha = visibilityAlpha * 0.075;
      ctx.beginPath();
      ctx.ellipse(x - clamp(player.vx / speed, -1, 1) * 19, y + 29 - clamp(player.vy / speed, -1, 1) * 10, 18, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = visibilityAlpha;
    }

    ctx.save();
    // Deform around the feet. Body, eyes and costume share one transform.
    ctx.translate(x, y + 31);
    ctx.transform(scaleX, 0, pose.shear, scaleY, 0, 0);
    ctx.translate(0, -31);
    if (silhouette) {
      slimeOutline(ctx);
      const gradient = ctx.createLinearGradient(-25, -38, 28, 38);
      gradient.addColorStop(0, "rgba(137,150,157,.94)");
      gradient.addColorStop(1, "rgba(63,75,84,.96)");
      ctx.fillStyle = gradient;
      ctx.strokeStyle = "rgba(31,42,49,.9)";
      ctx.lineWidth = 1.3;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      if (player.working && player.alive) {
        this.drawWorkingStatus(ctx, x, Math.max(18, player.y - 76));
      }
      ctx.restore();
      return;
    }
    ctx.drawImage(slimeSkin(baseColor, !colorMuted), -48, -54, 96, 112);
    const blink = !this.reducedMotion && (this.elapsed + seed * 0.037) % 6.3 < 0.16;
    ctx.save();
    ctx.translate(pose.gazeX, pose.gazeY);
    slimeEyes(ctx, blink, colorMuted, player.eyeStyle);
    ctx.restore();
    ctx.save();
    ctx.translate(0, -43);
    ctx.rotate(pose.hatTilt);
    this.drawHat(ctx, player.hat, 0, 0, colorMuted);
    ctx.restore();
    ctx.restore();
    ctx.font = "900 12px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(5,10,15,.92)";
    const privateRed = player.id === this.localPlayerId && this.human.role === "IMPOSTOR";
    const label = player.name;
    const labelY = Math.max(18, player.y - 76);
    ctx.strokeText(label, x, labelY);
    ctx.fillStyle = privateRed ? "#ff5362" : (colorMuted ? "#cfd8dc" : "#ffffff");
    ctx.fillText(label, x, labelY);
    if (player.working && player.alive) {
      this.drawWorkingStatus(ctx, x, Math.max(16, labelY - 20));
    }
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

  drawDevourEffect(ctx: CanvasRenderingContext2D, event: DevourEvent, silhouette = false, killer?: Player, muted = false, alpha = 1) {
    drawSlimeConsumption(ctx, event, (this.elapsed - event.startedAt) / event.duration, {
      concealed: silhouette || !event.killerId,
      muted,
      alpha,
      reducedMotion: this.reducedMotion,
      returnTo: killer,
      eyes: killer?.eyeStyle,
      drawHat: killer ? (context) => this.drawHat(context, killer.hat, 0, 0, muted) : undefined,
    });
  }

  drawBody(ctx: CanvasRenderingContext2D, body: Body) {
    const activeDevour = this.devourEvents.find((e) => e.id === body.id);
    const devourProgress = activeDevour ? (this.elapsed - activeDevour.startedAt) / activeDevour.duration : 1;
    if (activeDevour && devourProgress < .72) return;
    const puddleScale = activeDevour ? clamp((devourProgress - .72) / .28, .05, 1) : 1;
    const seed = Array.from(body.id).reduce((sum, ch) => (sum * 31 + ch.charCodeAt(0)) % 997, 0);
    const t = this.elapsed * 2.6 + body.age + seed * 0.1;
    const wobble = Math.sin(t) * 2.4;
    const wobble2 = Math.cos(t * 0.85) * 2.1;

    ctx.save();
    ctx.translate(body.x, body.y + 26);
    ctx.scale(puddleScale, puddleScale);

    // 1. Damp ground shadow beneath the puddle
    const stain = ctx.createRadialGradient(0, 4, 8, 0, 4, 64);
    stain.addColorStop(0, "rgba(3, 9, 15, 0.62)");
    stain.addColorStop(0.7, "rgba(3, 9, 15, 0.28)");
    stain.addColorStop(1, "rgba(3, 9, 15, 0)");
    ctx.fillStyle = stain;
    ctx.beginPath();
    ctx.ellipse(0, 5, 62, 26, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. Satellite splatter droplets around the main puddle
    const droplets = [
      { x: -53, y: 9, rx: 8.5, ry: 5.2, rot: -0.25 },
      { x: 51, y: 11, rx: 7.5, ry: 4.8, rot: 0.3 },
      { x: -37, y: -17, rx: 6.2, ry: 4.0, rot: -0.4 },
      { x: 40, y: -14, rx: 7.0, ry: 4.4, rot: 0.35 },
      { x: 15, y: 23, rx: 6.8, ry: 3.8, rot: 0.12 },
      { x: -19, y: 22, rx: 5.2, ry: 3.2, rot: -0.18 },
    ];
    ctx.fillStyle = `${body.color}c4`;
    ctx.strokeStyle = "#0d1520";
    ctx.lineWidth = 2.6;
    for (const [idx, d] of droplets.entries()) {
      const pulse = Math.sin(t + idx * 1.3) * 0.6;
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, d.rx + pulse, d.ry - pulse * 0.4, d.rot, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // 3. Outer spreading slime puddle (multi-lobed organic shape)
    ctx.fillStyle = `${body.color}b8`;
    ctx.strokeStyle = "#0d1520";
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(-48, 4);
    ctx.bezierCurveTo(-52, -12, -32, -20 - wobble, -14, -15 + wobble2 * 0.5);
    ctx.bezierCurveTo(-2, -25 - wobble2, 22, -24 + wobble, 35, -12);
    ctx.bezierCurveTo(52, -6, 56, 10 + wobble, 41, 16);
    ctx.bezierCurveTo(28, 24 + wobble2, 8, 20, -5, 22 - wobble * 0.6);
    ctx.bezierCurveTo(-24, 25, -45, 18 - wobble2, -48, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 4. Inner thicker slime core pool
    ctx.fillStyle = body.color;
    ctx.globalAlpha = 0.88;
    ctx.beginPath();
    ctx.moveTo(-33, 3);
    ctx.bezierCurveTo(-35, -8, -18, -13 - wobble * 0.6, -4, -10);
    ctx.bezierCurveTo(10, -16 - wobble2 * 0.6, 27, -11, 31, 1);
    ctx.bezierCurveTo(36, 11, 16, 15 + wobble * 0.5, 2, 13);
    ctx.bezierCurveTo(-14, 16, -31, 12, -33, 3);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // 5. Glossy wet liquid highlights
    ctx.fillStyle = "rgba(255, 255, 255, 0.58)";
    ctx.beginPath();
    ctx.ellipse(-16, -8 - wobble * 0.3, 13, 4.2, -0.22, 0, Math.PI * 2);
    ctx.ellipse(14, -9 + wobble2 * 0.3, 8.5, 3.0, 0.28, 0, Math.PI * 2);
    ctx.ellipse(-4, 10, 9.5, 2.6, 0.08, 0, Math.PI * 2);
    ctx.fill();

    // 6. Simmering slime bubbles on the puddle surface
    const bubbles = [
      { x: -24, y: 4, baseR: 4.2, phase: 0 },
      { x: 21, y: 5, baseR: 3.6, phase: 2.1 },
      { x: 4, y: -5, baseR: 3.2, phase: 4.2 },
    ];
    for (const b of bubbles) {
      const cycle = (this.elapsed * 1.4 + b.phase + seed * 0.05) % 1;
      const r = b.baseR * (0.55 + cycle * 0.65);
      const alpha = cycle < 0.85 ? 0.75 : (1 - cycle) * 5;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
      ctx.strokeStyle = "#0d1520";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      ctx.beginPath();
      ctx.arc(b.x - r * 0.3, b.y - r * 0.3, Math.max(1, r * 0.28), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 7. Dissolved slime eyes floating in the puddle after the devouring maw finishes
    if (devourProgress >= 0.6) {
      const eyeAlpha = clamp((devourProgress - 0.6) / 0.25, 0, 1);
      ctx.save();
      ctx.globalAlpha = eyeAlpha * 0.9;
      ctx.fillStyle = "#11161f";
      ctx.beginPath();
      ctx.ellipse(-9, 1 + wobble * 0.25, 4.2, 3.0, -0.35, 0, Math.PI * 2);
      ctx.ellipse(9, 3 - wobble2 * 0.25, 4.0, 2.8, 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
      ctx.beginPath();
      ctx.arc(-10.2, 0.2 + wobble * 0.25, 1.2, 0, Math.PI * 2);
      ctx.arc(7.8, 2.2 - wobble2 * 0.25, 1.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  getCrystalBlink(seed = 0): number {
    if (this.phase !== "ORDEAL" || this.hazard !== "BLACKOUT") return 0;
    const t = this.elapsed + seed * 0.017;
    const slot = Math.floor(t * 2.3);
    const slotFrac = t * 2.3 - slot;
    const hash = Math.sin(slot * 127.1 + 311.7 + seed * 0.13) * 43758.5453;
    const rand = hash - Math.floor(hash);
    // Dormant ~68% of the time during Blackout; randomly blinks in the remaining slots
    if (rand > 0.32) return 0;
    const isDoubleBlink = rand < 0.14;
    const pulse = isDoubleBlink
      ? Math.max(
          Math.exp(-Math.pow((slotFrac - 0.24) / 0.1, 2)),
          0.88 * Math.exp(-Math.pow((slotFrac - 0.62) / 0.12, 2)),
        )
      : Math.exp(-Math.pow((slotFrac - 0.44) / 0.15, 2));
    return pulse > 0.08 ? clamp(pulse, 0, 1) : 0;
  }

  isRevealed(player: Player) {
    if (player.id === this.localPlayerId) return true;
    if (player.flashlight) return true;
    if (dist(player, this.human) < (this.hazard === "BLACKOUT" ? 66 : 92)) return true;
    if (this.flares.some((flare) => dist(player, flare) < 146)) return true;
    if (this.phase === "ORDEAL" && this.hazard === "BLACKOUT") {
      for (const obs of SANCTUARY_OBSTACLES) {
        if (obs.kind !== "CRYSTAL_SPIRE") continue;
        const blink = this.getCrystalBlink(obs.x);
        if (blink > 0.25 && dist(player, obs) < 118 * blink) return true;
      }
    }
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
      const pulse = 0.45;
      ctx.save();
      ctx.globalAlpha = this.lowGlare ? 0.4 : 0.88;
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
    if (this.hazard === "MIRROR_POOL") {
      ctx.save();
      ctx.fillStyle = "rgba(14, 38, 66, 0.38)";
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(139, 233, 253, 0.22)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (const player of this.players) {
        if (!player.alive) continue;
        const ripple = ((this.elapsed * 42) % 44) + 18;
        ctx.moveTo(player.x + ripple, player.y + 28);
        ctx.ellipse(player.x, player.y + 28, ripple, ripple * 0.36, 0, 0, Math.PI * 2);
      }
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
      if (this.hazard === "BLACKOUT") {
        for (const obs of SANCTUARY_OBSTACLES) {
          if (obs.kind !== "CRYSTAL_SPIRE") continue;
          const blink = this.getCrystalBlink(obs.x);
          if (blink > 0) {
            this.cutRadial(mask, obs.x, obs.y - 24, 132 * blink);
          }
        }
      }
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

    // Subtle cyan wash over blinking crystals during Blackout
    if (this.hazard === "BLACKOUT") {
      for (const obs of SANCTUARY_OBSTACLES) {
        if (obs.kind !== "CRYSTAL_SPIRE") continue;
        const blink = this.getCrystalBlink(obs.x);
        if (blink <= 0) continue;
        ctx.save();
        const flash = ctx.createRadialGradient(obs.x, obs.y - 26, 6, obs.x, obs.y - 20, 132 * blink);
        flash.addColorStop(0, `rgba(176, 250, 255, ${(0.34 * blink).toFixed(3)})`);
        flash.addColorStop(0.45, `rgba(52, 212, 255, ${(0.16 * blink).toFixed(3)})`);
        flash.addColorStop(1, "rgba(24, 130, 180, 0)");
        ctx.fillStyle = flash;
        ctx.beginPath();
        ctx.arc(obs.x, obs.y - 20, 132 * blink, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
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

  drawObstacle(ctx: CanvasRenderingContext2D, obs: SanctuaryObstacle) {
    const humanBehind =
      this.human.y < obs.y + 8
      && Math.abs(this.human.x - obs.x) < obs.canopyRadius + 16
      && this.human.y > obs.y - obs.canopyHeight - 16;
    const canopyAlpha = humanBehind ? 0.38 : 1;
    const sway = Math.sin(this.elapsed * 1.6 + obs.x * 0.03) * 2.2;
    const pulse = 0.5 + Math.sin(this.elapsed * 2.8 + obs.y * 0.05) * 0.5;

    ctx.save();
    ctx.translate(obs.x, obs.y);

    // 1. Soft ground shadow & mossy base ring
    const shadow = ctx.createRadialGradient(0, 6, 4, 0, 6, obs.r * 1.9);
    shadow.addColorStop(0, "rgba(4, 14, 16, 0.52)");
    shadow.addColorStop(0.65, "rgba(4, 14, 16, 0.24)");
    shadow.addColorStop(1, "rgba(4, 14, 16, 0)");
    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.ellipse(0, 7, obs.r * 1.9, obs.r * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();

    // Mossy stone/root base collar
    ctx.fillStyle = "#2b473f";
    ctx.strokeStyle = "rgba(164, 198, 168, 0.35)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(0, 3, obs.r * 1.15, obs.r * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 2. Upper 2.5D structure (auto-fades when player walks behind it for a clean POV)
    ctx.globalAlpha = canopyAlpha;

    if (obs.kind === "CRYSTAL_SPIRE") {
      // Dormant mineral sapphire cluster by default; blinks randomly ONLY during BLACKOUT Ordeal
      const blink = this.getCrystalBlink(obs.x);

      // Ambient ground & spire halo ONLY when actively blinking during Blackout
      if (blink > 0) {
        const halo = ctx.createRadialGradient(0, -32, 4, 0, -28, 72);
        halo.addColorStop(0, `rgba(164, 248, 255, ${(0.65 * blink).toFixed(3)})`);
        halo.addColorStop(0.45, `rgba(54, 214, 255, ${(0.32 * blink).toFixed(3)})`);
        halo.addColorStop(1, "rgba(18, 118, 168, 0)");
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(0, -28, 72, 0, Math.PI * 2);
        ctx.fill();
      }

      // Carved dark basalt stone socket at the base
      ctx.fillStyle = "#1c2c36";
      ctx.strokeStyle = "#0d171e";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-24, 6);
      ctx.lineTo(-27, -4);
      ctx.lineTo(-14, -11);
      ctx.lineTo(0, -8);
      ctx.lineTo(15, -12);
      ctx.lineTo(26, -3);
      ctx.lineTo(23, 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Helper to draw a multi-faceted crystal prism shard
      const drawShard = (
        cx: number,
        cy: number,
        rot: number,
        w: number,
        h: number,
      ) => {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rot);

        // Main crystal body gradient (dormant dark sapphire-slate vs active cyan-ice blink)
        const bodyGrad = ctx.createLinearGradient(-w, -h, w, 6);
        if (blink > 0) {
          bodyGrad.addColorStop(0, `rgba(232, 254, 255, ${0.75 + 0.25 * blink})`);
          bodyGrad.addColorStop(0.38, "#6ee7ff");
          bodyGrad.addColorStop(0.75, "#2593ba");
          bodyGrad.addColorStop(1, "#164863");
        } else {
          bodyGrad.addColorStop(0, "#4c7288");
          bodyGrad.addColorStop(0.38, "#2d4c60");
          bodyGrad.addColorStop(0.78, "#1c3342");
          bodyGrad.addColorStop(1, "#11212c");
        }

        ctx.fillStyle = bodyGrad;
        ctx.strokeStyle = blink > 0 ? "#b8f7ff" : "#0e1d26";
        ctx.lineWidth = 2.1;
        ctx.beginPath();
        ctx.moveTo(0, -h);
        ctx.lineTo(w * 0.92, -h * 0.64);
        ctx.lineTo(w, 0);
        ctx.lineTo(w * 0.55, 6);
        ctx.lineTo(-w * 0.55, 6);
        ctx.lineTo(-w, 0);
        ctx.lineTo(-w * 0.92, -h * 0.64);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Left lit bevel plane
        ctx.fillStyle = blink > 0
          ? `rgba(255, 255, 255, ${(0.36 + 0.42 * blink).toFixed(2)})`
          : "rgba(135, 184, 210, 0.18)";
        ctx.beginPath();
        ctx.moveTo(0, -h * 0.97);
        ctx.lineTo(-w * 0.86, -h * 0.62);
        ctx.lineTo(-w * 0.45, 4);
        ctx.lineTo(0, 2);
        ctx.closePath();
        ctx.fill();

        // Right deep shadow bevel plane
        ctx.fillStyle = blink > 0
          ? "rgba(14, 72, 104, 0.28)"
          : "rgba(7, 16, 24, 0.42)";
        ctx.beginPath();
        ctx.moveTo(0, -h * 0.97);
        ctx.lineTo(w * 0.86, -h * 0.62);
        ctx.lineTo(w * 0.48, 4);
        ctx.lineTo(0, 2);
        ctx.closePath();
        ctx.fill();

        // Internal crystalline ridge & cross-facet lines
        ctx.strokeStyle = blink > 0
          ? `rgba(240, 255, 255, ${(0.65 + 0.35 * blink).toFixed(2)})`
          : "rgba(116, 162, 186, 0.28)";
        ctx.lineWidth = blink > 0 ? 1.7 : 1.1;
        ctx.beginPath();
        ctx.moveTo(0, -h * 0.96);
        ctx.lineTo(-w * 0.14, -h * 0.42);
        ctx.lineTo(0, 4);
        ctx.moveTo(-w * 0.86, -h * 0.62);
        ctx.lineTo(-w * 0.14, -h * 0.42);
        ctx.lineTo(w * 0.86, -h * 0.62);
        ctx.stroke();

        ctx.restore();
      };

      // Rear angled secondary shards
      drawShard(-15, -6, -0.34, 8.5, 42);
      drawShard(16, -5, 0.31, 8, 39);

      // Central tall prime crystal obelisk
      drawShard(0, -2, 0.02, 15.5, 80);

      // Foreground flanking shards
      drawShard(-19, 1, -0.58, 7, 27);
      drawShard(19, 2, 0.54, 6.8, 25);

      // Base rim rocks overlapping the bottom of the shards
      ctx.fillStyle = "#263a45";
      ctx.strokeStyle = "#0e1920";
      ctx.lineWidth = 1.6;
      for (const [rx, ry, rw, rh] of [[-13, 3, 9, 5], [2, 4, 11, 5.5], [14, 3, 8, 4.5]]) {
        ctx.beginPath();
        ctx.ellipse(rx, ry, rw, rh, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Active Blackout blink spark & arcane discharge arcs
      if (blink > 0) {
        ctx.fillStyle = `rgba(235, 254, 255, ${(0.85 * blink).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(0, -82, 3.6 * blink, 0, Math.PI * 2);
        ctx.arc(-22 + sway * 0.6, -46, 2.5 * blink, 0, Math.PI * 2);
        ctx.arc(24 - sway * 0.6, -38, 2.2 * blink, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (obs.kind === "RUNED_MONOLITH") {
      // Weathered sanctuary standing stone with glowing lunar runes
      const stoneGrad = ctx.createLinearGradient(-16, -74, 18, 6);
      stoneGrad.addColorStop(0, "#8f9e95");
      stoneGrad.addColorStop(0.5, "#566862");
      stoneGrad.addColorStop(1, "#2c3d39");
      ctx.fillStyle = stoneGrad;
      ctx.strokeStyle = "#162421";
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(-13, 5);
      ctx.lineTo(-16, -54);
      ctx.lineTo(-4, -74);
      ctx.lineTo(11, -68);
      ctx.lineTo(16, -46);
      ctx.lineTo(14, 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Moss cap on monolith shoulder
      ctx.fillStyle = "#5f8c6c";
      ctx.beginPath();
      ctx.ellipse(-3, -64, 11, 5, -0.25, 0, Math.PI * 2);
      ctx.fill();

      // Pulsing carved moon rune sigils
      ctx.strokeStyle = `rgba(164, 245, 212, ${(0.52 + pulse * 0.38).toFixed(2)})`;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(0, -42, 7, 0.3, Math.PI * 1.7);
      ctx.moveTo(0, -31);
      ctx.lineTo(0, -14);
      ctx.moveTo(-5, -23);
      ctx.lineTo(5, -23);
      ctx.stroke();
    } else if (obs.kind === "ANCIENT_TREE") {
      // 1. Deep shadow foliage backdrop behind upper branches
      ctx.fillStyle = "#17312b";
      ctx.strokeStyle = "#0d1f1b";
      ctx.lineWidth = 2.2;
      for (const [bx, by, brx, bry] of [
        [-28 + sway * 0.4, -54, 24, 18],
        [28 + sway * 0.4, -52, 24, 18],
        [-14 + sway * 0.5, -72, 26, 20],
        [16 + sway * 0.5, -70, 25, 19],
      ]) {
        ctx.beginPath();
        ctx.ellipse(bx, by, brx, bry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // 2. Sculpted gnarled silverwood trunk with flaring root buttresses & 3 forked boughs
      const trunkGrad = ctx.createLinearGradient(-20, -56, 20, 10);
      trunkGrad.addColorStop(0, "#7c705b");
      trunkGrad.addColorStop(0.45, "#554c3d");
      trunkGrad.addColorStop(1, "#2b261e");
      ctx.fillStyle = trunkGrad;
      ctx.strokeStyle = "#17140f";
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      // Left root flare
      ctx.moveTo(-26, 7);
      ctx.quadraticCurveTo(-16, 1, -13, -16);
      // Left forked branch
      ctx.quadraticCurveTo(-14, -34, -25, -50);
      ctx.lineTo(-17, -54);
      ctx.quadraticCurveTo(-8, -38, -5, -34);
      // Center bough
      ctx.lineTo(-3, -58);
      ctx.lineTo(5, -58);
      ctx.lineTo(6, -35);
      // Right forked branch
      ctx.quadraticCurveTo(11, -39, 19, -52);
      ctx.lineTo(26, -47);
      ctx.quadraticCurveTo(15, -33, 13, -15);
      // Right root flare
      ctx.quadraticCurveTo(16, 1, 27, 7);
      ctx.quadraticCurveTo(12, 5, 6, 9);
      ctx.quadraticCurveTo(0, 4, -7, 9);
      ctx.quadraticCurveTo(-14, 5, -26, 7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Bark grain ridges & moonlit rim highlight on trunk
      ctx.strokeStyle = "rgba(182, 168, 138, 0.32)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-18, 4);
      ctx.quadraticCurveTo(-10, -14, -10, -34);
      ctx.moveTo(-4, 6);
      ctx.quadraticCurveTo(-2, -16, -1, -44);
      ctx.stroke();

      // Warm amber spirit hollow in the trunk
      ctx.fillStyle = "#14110c";
      ctx.beginPath();
      ctx.ellipse(1, -15, 5.2, 7.8, -0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(232, 206, 128, ${(0.28 + pulse * 0.22).toFixed(2)})`;
      ctx.beginPath();
      ctx.ellipse(1, -14, 3.1, 4.8, -0.08, 0, Math.PI * 2);
      ctx.fill();

      // 3. Multi-layered scalloped leaf clusters (mid-tone & moonlit crown puffs)
      const canopyClusters = [
        { x: -30 + sway * 0.5, y: -48, rx: 21, ry: 15, c1: "#4d826e", c2: "#24493e" },
        { x: 30 + sway * 0.5, y: -46, rx: 21, ry: 15, c1: "#497d69", c2: "#21443a" },
        { x: -17 + sway * 0.65, y: -62, rx: 25, ry: 18, c1: "#669e86", c2: "#2d594c" },
        { x: 18 + sway * 0.65, y: -60, rx: 24, ry: 17, c1: "#619880", c2: "#2b5548" },
        { x: sway * 0.6, y: -50, rx: 26, ry: 18, c1: "#5b917b", c2: "#285043" },
        { x: -8 + sway * 0.8, y: -76, rx: 24, ry: 17, c1: "#8bc2a7", c2: "#3b6e5d" },
        { x: 10 + sway * 0.8, y: -74, rx: 22, ry: 16, c1: "#82b99e", c2: "#386858" },
      ];
      for (const c of canopyClusters) {
        const g = ctx.createRadialGradient(c.x - c.rx * 0.3, c.y - c.ry * 0.35, 3, c.x, c.y, c.rx);
        g.addColorStop(0, c.c1);
        g.addColorStop(1, c.c2);
        ctx.fillStyle = g;
        ctx.strokeStyle = "#132b25";
        ctx.lineWidth = 1.9;
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, c.rx, c.ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Moonlit rim-highlight crescents on top leaf clusters
      ctx.fillStyle = "rgba(196, 240, 214, 0.32)";
      for (const [hx, hy, hrx, hry] of [
        [-11 + sway * 0.8, -82, 14, 6],
        [-22 + sway * 0.65, -69, 13, 5.5],
        [15 + sway * 0.7, -68, 12, 5],
      ]) {
        ctx.beginPath();
        ctx.ellipse(hx, hy, hrx, hry, -0.18, 0, Math.PI * 2);
        ctx.fill();
      }

      // Softly drifting firefly spores
      ctx.fillStyle = `rgba(226, 250, 184, ${(0.55 + pulse * 0.4).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(-20 + sway, -68, 2.2, 0, Math.PI * 2);
      ctx.arc(22 - sway, -58, 1.9, 0, Math.PI * 2);
      ctx.fill();
    } else if (obs.kind === "WEEPING_WILLOW") {
      // Redesigned Moonwell Spirit Willow: graceful forked silver-bark trunk,
      // lush multi-tiered cloud canopy, and tapered hanging leaf ribbons (no flat oval or stick lines)

      // 1. Rear shadow foliage clusters
      ctx.fillStyle = "#193833";
      ctx.strokeStyle = "#0e221f";
      ctx.lineWidth = 2;
      for (const [bx, by, brx, bry] of [
        [-28 + sway * 0.4, -50, 22, 16],
        [28 + sway * 0.4, -48, 22, 16],
        [sway * 0.5, -66, 28, 19],
      ]) {
        ctx.beginPath();
        ctx.ellipse(bx, by, brx, bry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // 2. Soft rear hanging leaf-ribbons (behind the trunk)
      ctx.fillStyle = "#2b5e54";
      for (const [lx, ly, len] of [[-32, -44, 24], [31, -42, 23]]) {
        const s = sway * 0.9;
        ctx.beginPath();
        ctx.moveTo(lx - 4 + s * 0.3, ly);
        ctx.quadraticCurveTo(lx - 6 + s, ly + len * 0.55, lx + s * 1.3, ly + len);
        ctx.quadraticCurveTo(lx + 5 + s * 0.8, ly + len * 0.55, lx + 4 + s * 0.3, ly);
        ctx.closePath();
        ctx.fill();
      }

      // 3. Graceful S-curved silver-ash trunk with flaring roots & 3 sweeping boughs
      const willowTrunk = ctx.createLinearGradient(-18, -56, 18, 8);
      willowTrunk.addColorStop(0, "#868272");
      willowTrunk.addColorStop(0.5, "#5c5749");
      willowTrunk.addColorStop(1, "#333027");
      ctx.fillStyle = willowTrunk;
      ctx.strokeStyle = "#191713";
      ctx.lineWidth = 2.3;
      ctx.beginPath();
      ctx.moveTo(-22, 7);
      ctx.quadraticCurveTo(-12, 0, -10, -18);
      ctx.quadraticCurveTo(-11, -34, -24, -48);
      ctx.lineTo(-16, -52);
      ctx.quadraticCurveTo(-5, -38, -3, -32);
      ctx.lineTo(0, -56);
      ctx.lineTo(7, -55);
      ctx.lineTo(6, -33);
      ctx.quadraticCurveTo(12, -38, 23, -49);
      ctx.lineTo(29, -44);
      ctx.quadraticCurveTo(14, -32, 11, -16);
      ctx.quadraticCurveTo(13, 1, 23, 7);
      ctx.quadraticCurveTo(9, 4, 4, 8);
      ctx.quadraticCurveTo(-2, 4, -8, 8);
      ctx.quadraticCurveTo(-14, 4, -22, 7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Silver-bark highlight veins
      ctx.strokeStyle = "rgba(205, 200, 180, 0.34)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-14, 4);
      ctx.quadraticCurveTo(-7, -14, -7, -32);
      ctx.moveTo(1, 5);
      ctx.quadraticCurveTo(2, -14, 3, -42);
      ctx.stroke();

      // 4. Foreground tapered leaf-ribbons & glowing dewdrop blossoms hanging beneath the boughs
      for (const [lx, ly, len, tone] of [
        [-22, -40, 24, "#4b8e7d"],
        [-9, -38, 21, "#5ca390"],
        [11, -38, 22, "#4b8e7d"],
        [23, -40, 25, "#5ca390"],
      ] as const) {
        const s = sway * 1.05;
        ctx.fillStyle = tone;
        ctx.strokeStyle = "#16352f";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(lx - 4.5 + s * 0.35, ly);
        ctx.quadraticCurveTo(lx - 6.5 + s, ly + len * 0.55, lx + s * 1.35, ly + len);
        ctx.quadraticCurveTo(lx + 5.5 + s * 0.85, ly + len * 0.55, lx + 4.5 + s * 0.35, ly);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Bioluminescent willow dewdrop bud at the tip of each frond
        ctx.fillStyle = `rgba(182, 250, 222, ${(0.65 + pulse * 0.3).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(lx + s * 1.35, ly + len + 1.5, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // 5. Lush scalloped willow cloud-canopy (7 overlapping volumetric foliage puffs)
      const willowPuffs = [
        { x: -27 + sway * 0.55, y: -46, rx: 19, ry: 13.5, c1: "#589c89", c2: "#275248" },
        { x: 27 + sway * 0.55, y: -45, rx: 19, ry: 13.5, c1: "#549683", c2: "#254e45" },
        { x: -14 + sway * 0.65, y: -57, rx: 22, ry: 15.5, c1: "#74b8a3", c2: "#316659" },
        { x: 15 + sway * 0.65, y: -56, rx: 22, ry: 15.5, c1: "#6eb29d", c2: "#2e6155" },
        { x: sway * 0.6, y: -48, rx: 23, ry: 15, c1: "#68ab96", c2: "#2c5c50" },
        { x: -6 + sway * 0.8, y: -69, rx: 21, ry: 14.5, c1: "#9cd9c4", c2: "#417a6b" },
        { x: 8 + sway * 0.8, y: -67, rx: 19, ry: 13.5, c1: "#92d0ba", c2: "#3d7365" },
      ];
      for (const p of willowPuffs) {
        const g = ctx.createRadialGradient(p.x - p.rx * 0.28, p.y - p.ry * 0.32, 3, p.x, p.y, p.rx);
        g.addColorStop(0, p.c1);
        g.addColorStop(1, p.c2);
        ctx.fillStyle = g;
        ctx.strokeStyle = "#15302a";
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.rx, p.ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Moonlit crown highlights
      ctx.fillStyle = "rgba(216, 252, 238, 0.36)";
      ctx.beginPath();
      ctx.ellipse(-7 + sway * 0.8, -74, 13, 5, -0.15, 0, Math.PI * 2);
      ctx.ellipse(14 + sway * 0.68, -62, 11, 4.5, 0.18, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // MOSS_PILLAR: Fluted sanctuary stone column wrapped in ivy & glowing moonblossom vines
      const colGrad = ctx.createLinearGradient(-15, -66, 15, 6);
      colGrad.addColorStop(0, "#aebba9");
      colGrad.addColorStop(0.5, "#6f8274");
      colGrad.addColorStop(1, "#3b4d44");
      ctx.fillStyle = colGrad;
      ctx.strokeStyle = "#192621";
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.roundRect(-14, -62, 28, 67, 5);
      ctx.fill();
      ctx.stroke();

      // Column capital & base plinth
      ctx.beginPath();
      ctx.roundRect(-19, -68, 38, 10, 4);
      ctx.roundRect(-18, -2, 36, 8, 3);
      ctx.fill();
      ctx.stroke();

      // Fluted vertical grooves
      ctx.strokeStyle = "rgba(26, 42, 36, 0.45)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (const gx of [-7, 0, 7]) {
        ctx.moveTo(gx, -55);
        ctx.lineTo(gx, -5);
      }
      ctx.stroke();

      // Wrapping ivy vine & glowing moonblossom
      ctx.strokeStyle = "#4d855c";
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(-14, -12);
      ctx.bezierCurveTo(16, -24, -16, -42, 13, -54);
      ctx.stroke();
      ctx.fillStyle = "#e8f7c8";
      ctx.beginPath();
      ctx.arc(4, -34, 3.2, 0, Math.PI * 2);
      ctx.arc(-5, -20, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  drawCanvasLabels(ctx: CanvasRenderingContext2D) {
    // Ambient current Sanctuary Zone indicator in top-left of the arena
    const currentZone = sanctuaryZoneName(this.human.x, this.human.y);
    ctx.save();
    ctx.font = "800 10px ui-monospace, monospace";
    const zoneText = `✦ ${currentZone}`;
    const zoneWidth = Math.ceil(ctx.measureText(zoneText).width) + 18;
    ctx.fillStyle = "rgba(7, 19, 22, 0.76)";
    ctx.strokeStyle = "rgba(158, 222, 196, 0.38)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(88, 82, zoneWidth, 22, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(218, 242, 226, 0.9)";
    ctx.textAlign = "left";
    ctx.fillText(zoneText, 97, 96);
    ctx.restore();

    if (this.phase === "COUNTDOWN") {
      // The accessible HTML preparation banner leaves the paths and cell warnings visible.
      ctx.fillStyle = "#e4edc7";
      ctx.font = "700 13px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText("MEMORIZE NEARBY WARDENS • PREPARE YOUR GEAR", W / 2, H - 20);
    }
    if (this.phase === "CALM" && this.human.trueColor && this.human.color !== this.human.trueColor) {
      ctx.fillStyle = "rgba(139,233,253,.95)";
      ctx.font = "900 12px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText("MIRROR GLAMOUR ACTIVE • YOUR SWAPPED COLOR PERSISTS UNTIL MEETING", W / 2, 53);
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
        label = "PHANTOM PROCESSION • TRUST YOUR ECHO BELL";
        labelColor = "rgba(172,159,255,.96)";
      } else if (this.hazard === "MIRROR_POOL") {
        label = "MIRROR POOL • CONTROLS INVERTED & BUMP SWAPS COLORS";
        labelColor = "rgba(139,233,253,.96)";
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
  eyeStyle,
  size = "md",
  isBot = false,
}: {
  color: string;
  hat: Hat;
  eyeStyle?: EyeStyle;
  size?: "sm" | "md" | "lg";
  isBot?: boolean;
}) {
  return (
    <div
      className={`slime-avatar slime-avatar-${size} ${isBot ? "is-bot" : ""}`}
      style={{ "--slime": color } as React.CSSProperties}
      aria-hidden="true"
    >
      <span className="slime-avatar-motion">
        <HatGraphic hat={hat} />
        <SlimePortrait color={color} eyeStyle={eyeStyle} />
      </span>
    </div>
  );
}

const CIRCLE_WARDEN_NAMES = ["Pebble", "Nori", "YOU", "Mochi", "Bubbles"] as const;
const CIRCLE_WARDEN_QUIPS: readonly (readonly string[])[] = [
  [
    "I was at the shrine. Probably.",
    "My lantern flickered right by the willow!",
    "Don’t look at me, I’m just a very round pebble.",
    "Whoever rang the Echo Bell owes me an explanation.",
  ],
  [
    "That shadow looked familiar…",
    "I saw two slimes near the Hollow, then only one.",
    "Check the moss prints! They lead toward the pond.",
    "Stay in pairs when the sea fog rolls in.",
  ],
  WARDEN_ALIBIS,
  [
    "Who turned off the moon?!",
    "I dropped my Moonblossom and ran for my life!",
    "Wait—can impostors squeeze through root cages?!",
    "If the blue crystal blinks, stand inside its light!",
  ],
  [
    "We can trust each other… right?",
    "Let’s stick together by the campfire.",
    "I’m 98% sure Mochi just vented into a bush.",
    "Boop me again and I’m calling an emergency meeting!",
  ],
];
const BOOP_EMOTES = ["✦", "♪", "♡", "!", "☽", "✿", "⚡"] as const;

let lobbyAudioCtx: AudioContext | null = null;
function playLobbySfx(
  kind: "boop" | "wave" | "switch" | "weather" | "customize" | "moon" | "launch",
  variant = 0
) {
  if (typeof window === "undefined") return;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!lobbyAudioCtx) lobbyAudioCtx = new Ctx();
    const ctx = lobbyAudioCtx;
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;

    if (kind === "boop") {
      const baseFreqs = [392, 440, 523.25, 587.33, 659.25];
      const f0 = baseFreqs[variant % baseFreqs.length];
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(f0 * 0.85, now);
      osc.frequency.exponentialRampToValueAtTime(f0 * 1.38, now + 0.09);
      osc.frequency.exponentialRampToValueAtTime(f0 * 1.12, now + 0.19);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.085, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.21);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.22);
    } else if (kind === "wave") {
      [392, 440, 523.25, 659.25, 783.99].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t = now + idx * 0.055;
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.18, t + 0.14);
        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.06, t + 0.018);
        gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.18);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.19);
      });
    } else if (kind === "customize") {
      const f0 = 480 + (variant % 6) * 45;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(f0, now);
      osc.frequency.exponentialRampToValueAtTime(f0 * 1.25, now + 0.08);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.06, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.11);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.12);
    } else if (kind === "switch") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(variant ? 540 : 460, now);
      osc.frequency.exponentialRampToValueAtTime(variant ? 680 : 580, now + 0.07);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.045, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.09);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (kind === "weather") {
      const chords = [
        [523.25, 659.25], // CALM
        [349.23, 466.16], // FOG
        [220, 277.18],    // BLACKOUT
      ];
      const pair = chords[variant % chords.length];
      pair.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t = now + idx * 0.04;
        osc.type = variant === 2 ? "sine" : "triangle";
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.05, t + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.28);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.3);
      });
    } else if (kind === "moon") {
      [783.99, 1046.5, 1318.5].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t = now + idx * 0.06;
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.045, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.36);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.38);
      });
    } else if (kind === "launch") {
      [261.63, 329.63, 392, 523.25].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t = now + idx * 0.05;
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.12, t + 0.28);
        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.065, t + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.36);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.38);
      });
    }
  } catch {
    // Ignore audio context restrictions before user gesture
  }
}

function Lobby({
  onLaunch,
  multiplayerClient,
  mpState,
}: {
  onLaunch: (count: number, role: RoleChoice, profile: SoloProfile) => void;
  multiplayerClient?: MultiplayerClient | null;
  mpState?: MultiplayerState | null;
}) {
  const [tab, setTab] = useState<"SOLO" | "MULTI">("MULTI");
  const [previewMood, setPreviewMood] = useState<"CALM" | "FOG" | "BLACKOUT">("CALM");
  const [previewSpeaker, setPreviewSpeaker] = useState(2);
  const [previewQuip, setPreviewQuip] = useState(0);
  const [studioView, setStudioView] = useState<"WARDEN" | "CIRCLE">("WARDEN");
  const [players, setPlayers] = useState(6);
  const [role, setRole] = useState<RoleChoice>("RANDOM");

  // Interactive preview stage state
  const [stagePointer, setStagePointer] = useState({ x: 50, y: 52, gazeX: 0, gazeY: 0, active: false });
  const [boopedWarden, setBoopedWarden] = useState<{ index: number; emote: string; seq: number } | null>(null);
  const [isGroupWaving, setIsGroupWaving] = useState(false);
  const [moonPulse, setMoonPulse] = useState(0);
  const [isLaunching, setIsLaunching] = useState(false);
  const [motionPaused, setMotionPaused] = useState(false);

  // Multiplayer form state (deterministic initial render, randomized callsign on mount)
  const [nickname, setNickname] = useState(WARDEN_CALLSIGNS[0]);
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [selectedHat, setSelectedHat] = useState<Hat>("antlers");
  const [selectedEyes, setSelectedEyes] = useState<EyeStyle>("FIERCE");
  const [joinCode, setJoinCode] = useState("");
  const [botFill, setBotFill] = useState(true);
  const [targetPlayers, setTargetPlayers] = useState(6);
  const [copied, setCopied] = useState(false);
  const [hideRoomCode, setHideRoomCode] = useState(false);
  const [editingInRoom, setEditingInRoom] = useState(true);
  const [lobbyChatDraft, setLobbyChatDraft] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRefreshingRooms, setIsRefreshingRooms] = useState(false);
  const [roomsChecked, setRoomsChecked] = useState(false);
  const [mpError, setMpError] = useState("");
  const lobbyConsoleRef = useRef<HTMLDivElement>(null);

  const inRoom = Boolean(mpState?.roomCode);
  const activeTargetPlayers = inRoom && mpState ? mpState.targetPlayers : targetPlayers;
  const activeBotFill = inRoom && mpState ? mpState.botFill : botFill;
  const myNetPlayer = inRoom && mpState ? mpState.players.find((p) => p.id === mpState.playerId) : undefined;
  const readyCount = inRoom && mpState ? mpState.players.filter((p) => p.ready || p.isHost).length : 0;
  const displayError = mpError || mpState?.lastError || "";
  const occupiedColors = new Set(mpState?.players.filter((p) => p.id !== mpState.playerId).map((p) => p.color) ?? []);
  const occupiedNames = mpState?.players.filter((p) => p.id !== mpState.playerId).map((p) => p.name) ?? [];
  const showRoomResults = Boolean(mpState?.connected && roomsChecked);

  useEffect(() => {
    // Randomize only after hydration so the server/client first render agrees.
    const frame = requestAnimationFrame(() => setNickname(randomWardenCallsign()));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    lobbyConsoleRef.current?.scrollTo(0, 0);
  }, [inRoom, tab]);

  useEffect(() => {
    if (!multiplayerClient) return;
    const unsubscribe = multiplayerClient.onStateChange((state) => {
      if (!state.connected) setRoomsChecked(false);
      const own = state.players.find((p) => p.id === state.playerId);
      if (own) {
        setNickname(own.name);
        setSelectedColor(own.color);
        setSelectedHat(own.hat);
        setSelectedEyes(normalizeEyeStyle(own.eyeStyle));
      }
    });
    const unsubscribeRooms = multiplayerClient.onMessage((message) => {
      if (message.type === "ROOMS_LIST") setRoomsChecked(true);
      if (message.type === "ROOM_STATE") setRoomsChecked(false);
    });
    return () => { unsubscribe(); unsubscribeRooms(); };
  }, [multiplayerClient]);

  const handleRefreshRooms = async () => {
    if (!multiplayerClient) return;
    setMpError("");
    multiplayerClient.clearError();
    setRoomsChecked(false);
    setIsRefreshingRooms(true);
    try {
      await multiplayerClient.connect();
      multiplayerClient.requestRoomsList();
    } catch (error) {
      setMpError(error instanceof Error ? error.message : "Could not find rooms. Please try again.");
    } finally {
      window.setTimeout(() => setIsRefreshingRooms(false), 260);
    }
  };

  const handleSwitchTab = (nextTab: "SOLO" | "MULTI") => {
    if (nextTab !== tab) playLobbySfx("switch", nextTab === "SOLO" ? 1 : 0);
    setTab(nextTab);
    setMpError("");
    multiplayerClient?.clearError();
    if (nextTab === "MULTI" && !inRoom) {
      void handleRefreshRooms();
    }
  };

  const triggerWardenBoop = (index: number, customEmote?: string) => {
    const emote = customEmote ?? BOOP_EMOTES[(index + previewQuip) % BOOP_EMOTES.length];
    setBoopedWarden((prev) => ({ index, emote, seq: (prev?.seq ?? 0) + 1 }));
    playLobbySfx("boop", index);
  };

  const handleStageWave = () => {
    playLobbySfx("wave");
    setIsGroupWaving(true);
    setPreviewQuip((q) => q + 1);
    window.setTimeout(() => setIsGroupWaving(false), 780);
  };

  const handleCycleColor = () => {
    const available = COLORS.filter((c) => !occupiedColors.has(c));
    const pool = available.length > 0 ? available : [...COLORS];
    const nextIdx = (pool.indexOf(selectedColor) + 1) % pool.length;
    const nextColor = pool[nextIdx] ?? selectedColor;
    playLobbySfx("customize", nextIdx);
    triggerWardenBoop(2, "🎨");
    handleProfileChange(nickname, nextColor, selectedHat, selectedEyes);
  };

  const handleCycleHat = () => {
    const nextIdx = (HATS.indexOf(selectedHat) + 1) % HATS.length;
    const nextHat = HATS[nextIdx] ?? selectedHat;
    playLobbySfx("customize", nextIdx + 2);
    triggerWardenBoop(2, "✦");
    handleProfileChange(nickname, selectedColor, nextHat, selectedEyes);
  };

  const handleCycleEyes = () => {
    const nextIdx = (EYE_STYLES.indexOf(selectedEyes) + 1) % EYE_STYLES.length;
    const nextEyes = EYE_STYLES[nextIdx] ?? selectedEyes;
    playLobbySfx("customize", nextIdx + 4);
    triggerWardenBoop(2, "👀");
    handleProfileChange(nickname, selectedColor, selectedHat, nextEyes);
  };

  const handleRandomizeProfile = () => {
    const randomName = randomWardenCallsign([...occupiedNames, nickname]);
    const available = COLORS.filter((color) => !occupiedColors.has(color));
    const randomColor = available[Math.floor(Math.random() * available.length)] ?? selectedColor;
    const randomHat = HATS[Math.floor(Math.random() * HATS.length)];
    const randomEyes = EYE_STYLES[Math.floor(Math.random() * EYE_STYLES.length)];
    playLobbySfx("wave");
    triggerWardenBoop(2, "🎲");
    setNickname(randomName);
    setSelectedColor(randomColor);
    setSelectedHat(randomHat);
    setSelectedEyes(randomEyes);
    if (inRoom && multiplayerClient) {
      multiplayerClient.updateProfile(randomName, randomColor, randomHat, randomEyes);
    }
  };

  const handleProfileChange = (nextName: string, nextColor: string, nextHat: Hat, nextEyes = selectedEyes) => {
    setNickname(nextName);
    setSelectedColor(nextColor);
    setSelectedHat(nextHat);
    setSelectedEyes(nextEyes);
    if (inRoom && multiplayerClient) {
      const fallbackName = myNetPlayer?.name || randomWardenCallsign(occupiedNames);
      multiplayerClient.updateProfile(nextName.trim() || fallbackName, nextColor, nextHat, nextEyes);
    }
  };

  const handleSoloLaunch = () => {
    if (isLaunching) return;
    playLobbySfx("launch");
    setIsLaunching(true);
    const launchProfile: SoloProfile = {
      name: availablePlayerName(nickname, []),
      color: selectedColor,
      hat: selectedHat,
      eyeStyle: selectedEyes,
    };
    window.setTimeout(() => {
      onLaunch(players, role, launchProfile);
    }, 380);
  };

  const handleCreateRoom = async () => {
    if (!multiplayerClient) return;
    setMpError("");
    multiplayerClient.clearError();
    setIsConnecting(true);
    try {
      await multiplayerClient.connect();
      const callsign = availablePlayerName(nickname, []);
      setNickname(callsign);
      multiplayerClient.createRoom(callsign, selectedColor, selectedHat, selectedEyes);
    } catch (error) {
      setMpError(error instanceof Error ? error.message : "Failed to connect to game server. Please retry.");
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
      const callsign = availablePlayerName(nickname, []);
      setNickname(callsign);
      multiplayerClient.joinRoom(codeToJoin, callsign, selectedColor, selectedHat, selectedEyes);
    } catch (error) {
      setMpError(error instanceof Error ? error.message : "Failed to connect to room. Verify code and server connection.");
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

  const handleStagePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (motionPaused) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    const gazeX = Number((((x - 50) / 50) * 4.5).toFixed(2));
    const gazeY = Number((((y - 52) / 50) * 3.2).toFixed(2));
    setStagePointer({ x, y, gazeX, gazeY, active: true });
  };

  const handleStagePointerLeave = () => {
    setStagePointer((prev) => ({ ...prev, gazeX: 0, gazeY: 0, active: false }));
  };

  const speakerQuipPool = CIRCLE_WARDEN_QUIPS[previewSpeaker] ?? WARDEN_ALIBIS;
  const activeDialogueLine = speakerQuipPool[previewQuip % speakerQuipPool.length];
  const cursorLitWarden =
    stagePointer.active && studioView === "CIRCLE"
      ? Math.min(4, Math.max(0, Math.floor((stagePointer.x / 100) * 5)))
      : -1;

  return (
    <main className={`lobby-shell moon-studio ${inRoom ? "studio-in-room" : "studio-at-home"} ${isLaunching ? "studio-launching" : ""} ${motionPaused ? "home-motion-paused" : ""}`}>
      {!inRoom && <HomeAtmosphere />}
      {isLaunching && (
        <div className="studio-launch-portal" aria-hidden="true">
          <div className="launch-portal-ring" />
          <span>ENTERING THE MOONWARD…</span>
        </div>
      )}
      <div className="studio-frame">
      <header className="lobby-nav">
        <Logo />
        {!inRoom && <button className="home-motion-toggle" type="button" aria-pressed={motionPaused} onClick={() => { setMotionPaused(!motionPaused); handleStagePointerLeave(); }}>{motionPaused ? "▷ Resume animations" : "Ⅱ Pause animations"}</button>}
        <div className="nav-status">
          <span />
          {inRoom
            ? `${mpState?.connected ? mpState.transport === "HTTP" ? "HTTP RELAY" : "REALTIME" : "DISCONNECTED"} • ROOM ${hideRoomCode ? "••••" : mpState?.roomCode} • ${mpState?.ping || "—"}MS`
            : tab === "MULTI"
              ? mpState?.connected
                ? mpState.transport === "HTTP" ? "SANCTUARY • HTTP RELAY" : "SANCTUARY • REALTIME CONNECTED"
                : "SANCTUARY • CONNECT TO PLAY"
              : "LOCAL NIGHT TRIAL"}
        </div>
      </header>

      <section className={`lobby-grid ${tab === "MULTI" ? "lobby-grid-multi" : ""} ${inRoom ? "lobby-grid-room" : ""}`}>
        <aside className="studio-guide" aria-label="Moonwarden game guide">
          <div className="eyebrow"><span>☽ SILVERPINE SUMMIT</span><small>A SOCIAL DEDUCTION ADVENTURE</small></div>
          <h1>Little slimes.<br /><em>Big suspicions.</em></h1>
          <p className="lede">Your friends. A magical forest.<br className="home-copy-break" /> One very convincing impostor.</p>
          {!inRoom && tab === "MULTI" && <div className="home-play-shortcuts"><button type="button" onClick={handleCreateRoom} disabled={isConnecting || !multiplayerClient}>{isConnecting ? "Connecting…" : "Create a room"}<span aria-hidden="true">↗</span></button><a href="#home-room-code">Join with a code <span aria-hidden="true">↓</span></a></div>}
          <div className="home-hero-tags"><span>✦ 4–8 wardens</span><span>No download</span><span>Free to play</span></div>
          <div className="lobby-mode-switch" role="tablist" aria-label="Game Mode">
            <button role="tab" aria-selected={tab === "MULTI"} className={tab === "MULTI" ? "active" : ""} onClick={() => handleSwitchTab("MULTI")}>
              <span>✦ MULTIPLAYER</span><span className="live-pill">{inRoom ? "IN ROOM" : "WITH FRIENDS"}</span>
            </button>
            <button role="tab" aria-selected={tab === "SOLO"} className={tab === "SOLO" ? "active" : ""} disabled={inRoom} title={inRoom ? "Leave your room before starting solo practice" : "Practice with AI wardens"} onClick={() => handleSwitchTab("SOLO")}>
              <span>Practice with AI</span>
            </button>
          </div>
          <details className="studio-guide-steps">
            <summary>How to Play</summary>
            <div><span>01</span><p><b>Gather your circle</b><small>Create a room. Share your ward code.</small></p></div>
            <div><span>02</span><p><b>Brave the Ordeals</b><small>Restore shrines. Earn gear. Stay close.</small></p></div>
            <div><span>03</span><p><b>Discuss. Vote. Repeat.</b><small>One of you has a very bad alibi.</small></p></div>
          </details>
          <div className="home-game-tags" aria-label="About the game">
            <span>4–8 wardens</span><span>One hidden impostor</span><span>Play in your browser</span>
          </div>
          <div className="studio-guide-note"><span aria-hidden="true">☽</span><p>Trust the light.<br /><b>Question everyone else.</b></p></div>
        </aside>

        <div className="lobby-copy studio-stage">
          <div className="studio-view-switch" role="group" aria-label="Character preview view">
            <button
              type="button"
              aria-pressed={studioView === "WARDEN"}
              onClick={() => {
                if (studioView !== "WARDEN") playLobbySfx("switch", 0);
                setStudioView("WARDEN");
                setPreviewSpeaker(2);
              }}
            >
              Your warden
            </button>
            <button
              type="button"
              aria-pressed={studioView === "CIRCLE"}
              onClick={() => {
                if (studioView !== "CIRCLE") playLobbySfx("switch", 1);
                setStudioView("CIRCLE");
              }}
            >
              The circle
            </button>
          </div>
          <div
            className={`sanctuary-preview preview-${previewMood.toLowerCase()} studio-view-${studioView.toLowerCase()} ${stagePointer.active ? "has-pointer" : ""}`}
            onPointerMove={handleStagePointerMove}
            onPointerLeave={handleStagePointerLeave}
            style={{
              "--cursor-x": `${stagePointer.x}%`,
              "--cursor-y": `${stagePointer.y}%`,
              "--gaze-x": `${stagePointer.gazeX}px`,
              "--gaze-y": `${stagePointer.gazeY}px`,
            } as React.CSSProperties}
          >
            <div className="studio-stage-title" key={studioView}>
              <small>{studioView === "WARDEN" ? "YOUR MOONLIT ALTER EGO" : "FRIENDLY FACES. QUESTIONABLE ALIBIS."}</small>
              <h2>{studioView === "WARDEN" ? nickname.trim() || WARDEN_CALLSIGNS[0] : "The usual suspects."}</h2>
              <p>{studioView === "WARDEN" ? `${COLOR_NAMES[selectedColor]} · ${HAT_META[selectedHat].title} · ${EYE_LABELS[selectedEyes]} eyes` : "Preview circle · tap any slime or sweep your lantern"}</p>
            </div>
            <div className="preview-heading"><span>✦ A PEEK INTO THE SANCTUARY</span><small>INTERACTIVE PREVIEW</small></div>
            <HomeGrove />
            <button
              type="button"
              className={`preview-moon ${moonPulse > 0 ? "is-pulsing" : ""}`}
              aria-label="Make a wish on the moon"
              onClick={() => {
                playLobbySfx("moon");
                setMoonPulse((p) => p + 1);
              }}
            />
            {moonPulse > 0 && <div key={moonPulse} className="preview-shooting-star" aria-hidden="true" />}
            <div className="preview-lantern-beam" aria-hidden="true" />
            <div className="preview-fog-layer" aria-hidden="true" />
            <div className="preview-orbit" aria-hidden="true" />
            <div className="preview-fireflies" aria-hidden="true">{Array.from({ length: 8 }, (_, i) => <i key={i} style={{ "--i": i, "--top": `${16 + (i * 23) % 70}%` } as React.CSSProperties} />)}</div>
            <div className="stage-quick-bar" role="toolbar" aria-label="Quick stage actions">
              <button type="button" onClick={handleCycleColor} title="Cycle slime color">🎨 Hue</button>
              <button type="button" onClick={handleCycleHat} title="Cycle headdress">🎩 Hat</button>
              <button type="button" onClick={handleCycleEyes} title="Cycle eye expression">👀 Eyes</button>
              <button type="button" onClick={handleStageWave} title="Make the wardens wave">✨ Wave</button>
            </div>
            <div className="preview-dialogue" role="status" aria-live="polite" key={`${previewSpeaker}-${previewQuip}`}>
              <b>{previewSpeaker === 2 ? nickname.trim() || WARDEN_CALLSIGNS[0] : CIRCLE_WARDEN_NAMES[previewSpeaker]}:</b>{" "}
              {activeDialogueLine}
            </div>
            <div className="preview-circle" role="group" aria-label="Meet the preview wardens">
            {COLORS.slice(0, 5).map((color, index) => {
              const showcaseColor = index === 2 ? selectedColor : COLORS.filter((hue) => hue !== selectedColor)[index < 2 ? index : index - 1];
              const showcaseHat = index === 2 ? selectedHat : HATS[index % HATS.length];
              const isBooped = boopedWarden?.index === index;
              const isCursorLit = cursorLitWarden === index;
              return (
                <button
                  type="button"
                  className={`preview-warden ${index === 2 ? "is-you" : ""} ${isBooped ? "is-booped" : ""} ${isGroupWaving ? "is-waving" : ""} ${isCursorLit ? "is-cursor-lit" : ""}`}
                  aria-label={index === 2 ? "Hear your warden’s alibi" : `Hear ${CIRCLE_WARDEN_NAMES[index]}’s alibi`}
                  aria-pressed={previewSpeaker === index}
                  inert={studioView === "WARDEN" && index !== 2}
                  onClick={() => {
                    setPreviewSpeaker(index);
                    setPreviewQuip((quip) => quip + 1);
                    triggerWardenBoop(index);
                  }}
                  key={color}
                >
                  {isBooped && boopedWarden && (
                    <span key={boopedWarden.seq} className="warden-emote-pop" aria-hidden="true">
                      {boopedWarden.emote}
                    </span>
                  )}
                  <SlimeAvatar color={showcaseColor} hat={showcaseHat} eyeStyle={index === 2 ? selectedEyes : EYE_STYLES[index % EYE_STYLES.length]} size="lg" />
                  <span className="preview-name">{index === 2 ? "YOU" : CIRCLE_WARDEN_NAMES[index]}</span>
                </button>
              );
            })}
            </div>
            <div className="preview-weather" role="group" aria-label="Preview an Ordeal">
              {(["CALM", "FOG", "BLACKOUT"] as const).map((mood, moodIdx) => (
                <button
                  type="button"
                  key={mood}
                  aria-pressed={previewMood === mood}
                  onClick={() => {
                    if (previewMood !== mood) playLobbySfx("weather", moodIdx);
                    setPreviewMood(mood);
                  }}
                >
                  {mood === "CALM" ? "☽ Moonlit calm" : mood === "FOG" ? "≋ Sea fog" : "✧ Blackout"}
                </button>
              ))}
            </div>
            <p className="preview-caption" aria-live="polite">{previewMood === "CALM" ? "Tap a slime to boop & hear an alibi, or use the quick pills above." : previewMood === "FOG" ? "In the fog, colors fade to silhouettes. Move your cursor to part the mist." : "When blackout falls, sweep your cursor like a lantern to reveal hidden wardens."}</p>
          </div>
        </div>

        <div ref={lobbyConsoleRef} className={`lobby-console ${tab === "MULTI" ? "lobby-console-multi" : ""} ${inRoom ? "lobby-console-room" : ""}`}>
          <div className="console-head">
            <div>
              <span className="status-dot" />
              {tab === "SOLO"
                ? "SOLO PRACTICE"
                : inRoom
                  ? `SANCTUARY CIRCLE • ROOM ${hideRoomCode ? "••••" : mpState?.roomCode}`
                  : "GATHER YOUR CIRCLE"}
            </div>
            <span>{inRoom ? `${mpState?.players.length ?? 1}/${activeTargetPlayers} WARDENS` : "MOONWARDEN"}</span>
          </div>

          <div className="console-body">
            {tab === "MULTI" && displayError && (
              <div className="puzzle-feedback error" role="alert" style={{ marginBottom: 12 }}>
                {displayError}
              </div>
            )}

            {tab === "MULTI" && !mpState?.connected && (isConnecting || isRefreshingRooms) && (
              <p className="role-note" role="status">Connecting to the sanctuary. A sleeping playtest server can take about a minute to wake up.</p>
            )}

            {tab === "MULTI" && inRoom && mpState && !mpState.connected && (
              <div className="lobby-reconnect" role="alert">
                <strong>CONNECTION LOST</strong>
                <p>This roster is no longer live. Reconnect before creating or joining a room; the old room may no longer exist.</p>
                <button type="button" className="mp-btn-secondary" onClick={() => {
                  multiplayerClient?.disconnect();
                  multiplayerClient?.clearError();
                  setMpError("");
                  setEditingInRoom(false);
                }}>RETURN TO LOBBY</button>
              </div>
            )}

            <div className="console-panel-stage" key={inRoom ? "room" : tab}>
            {tab === "SOLO" ? (
              <>
                <p className="solo-practice-note">A quiet rehearsal with AI wardens. Customize your slime, learn the shrines, and brave the Ordeals.</p>

                <section className="home-wardrobe solo-wardrobe" aria-label="Customize your Warden">
                  <div className="wardrobe-summary-bar">
                    <SlimeAvatar color={selectedColor} hat={selectedHat} eyeStyle={selectedEyes} size="sm" />
                    <span>
                      <small>YOUR WARDEN</small>
                      <strong>{nickname.trim() || WARDEN_CALLSIGNS[0]}</strong>
                      <em>{COLOR_NAMES[selectedColor]} · {HAT_META[selectedHat].label} · {EYE_LABELS[selectedEyes]} eyes</em>
                    </span>
                    <button type="button" className="wardrobe-surprise-pill" onClick={handleRandomizeProfile} title="Randomize Warden Identity">
                      🎲 RANDOM
                    </button>
                  </div>
                  <div className="mp-customizer-card">
                    <div className="mp-customizer-controls">
                      <label className="field-label" htmlFor="solo-nickname">
                        CALLSIGN <span>{nickname.length}/16</span>
                      </label>
                      <input
                        id="solo-nickname"
                        className="mp-field"
                        maxLength={16}
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                        placeholder="Enter your warden name…"
                      />

                      <div className="field-label" style={{ marginTop: 12 }}>
                        SLIME HUE <span>{COLOR_NAMES[selectedColor]}</span>
                      </div>
                      <div className="mp-palette" role="group" aria-label="Slime Color">
                        {COLORS.map((c, idx) => (
                          <button
                            key={c}
                            type="button"
                            className={`mp-color-btn ${selectedColor === c ? "active" : ""}`}
                            style={{ backgroundColor: c, color: c }}
                            aria-pressed={selectedColor === c}
                            onClick={() => { playLobbySfx("customize", idx); triggerWardenBoop(2, "🎨"); setSelectedColor(c); }}
                            title={COLOR_NAMES[c]}
                            aria-label={`Select slime color ${COLOR_NAMES[c] || c}`}
                          >
                            {selectedColor === c && <span className="color-check" aria-hidden="true">✓</span>}
                          </button>
                        ))}
                      </div>

                      <div className="field-label">
                        HEADDRESS <span>{HAT_META[selectedHat].title.toUpperCase()}</span>
                      </div>
                      <div className="mp-hat-row" role="group" aria-label="Hat selection">
                        {HATS.map((h, idx) => (
                          <button
                            key={h}
                            type="button"
                            className={`mp-hat-btn ${selectedHat === h ? "active" : ""}`}
                            aria-pressed={selectedHat === h}
                            onClick={() => { playLobbySfx("customize", idx + 2); triggerWardenBoop(2, "✦"); setSelectedHat(h); }}
                          >
                            <span className="hat-btn-preview">
                              <HatGraphic hat={h} />
                            </span>
                            <b>{HAT_META[h].label}</b>
                          </button>
                        ))}
                      </div>
                      <EyeStylePicker value={selectedEyes} onChange={(eyes) => { playLobbySfx("customize", 5); triggerWardenBoop(2, "👀"); setSelectedEyes(eyes); }} />
                    </div>
                  </div>
                </section>

                <label className="field-label" htmlFor="player-count" style={{ marginTop: 14 }}>WARDEN CIRCLE <span>{players} SLOTS</span></label>
                <input id="player-count" className="player-range" type="range" min="4" max="8" value={players} onChange={(event) => setPlayers(Number(event.target.value))} />
                <div className="range-labels"><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span></div>

                <div className="field-label role-label">TEST IDENTITY <span>PRIVATE TO THIS CLIENT</span></div>
                <div className="role-switch" role="group" aria-label="Choose test role">
                  {(["RANDOM", "CREWMATE", "IMPOSTOR"] as RoleChoice[]).map((value) => (
                    <button key={value} className={role === value ? "active" : ""} onClick={() => { playLobbySfx("switch", 1); setRole(value); }}>{value === "RANDOM" ? "AUTO" : value}</button>
                  ))}
                </div>
                <p className="role-note">Your role stays private. Eyes and headdresses are cosmetic; your role never changes your appearance or movement.</p>

                <button className="launch-button" disabled={isLaunching} onClick={handleSoloLaunch}>
                  <span>{isLaunching ? "OPENING SANCTUARY…" : "ENTER THE MOONWARD"}</span><kbd>ENTER</kbd>
                </button>
                <div className="console-log">
                  <span><i className="green" /> WARDENS GATHERED</span>
                  <span><i className="amber" /> HAZARDS ARMED</span>
                  <span><i className="green" /> ZERO VISUAL TELLS</span>
                </div>
              </>
            ) : inRoom && mpState ? (
              <div className="waiting-room">
                <fieldset className="waiting-room-controls" disabled={!mpState.connected}>
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
                      eyeStyle={myNetPlayer?.eyeStyle || selectedEyes}
                      size="sm"
                    />
                    <div>
                      <small>YOUR WARDEN</small>
                      <strong>{myNetPlayer?.name || nickname}</strong>
                      <span>
                        {COLOR_NAMES[myNetPlayer?.color || selectedColor] || "Custom"} •{" "}
                        {HAT_META[myNetPlayer?.hat || selectedHat].title} •{" "}
                        {EYE_LABELS[myNetPlayer?.eyeStyle || selectedEyes]} eyes
                      </span>
                    </div>
                  </div>
                  <div className="inroom-profile-actions">
                    <button
                      type="button"
                      className={`wardrobe-toggle-btn ${editingInRoom ? "active" : ""}`}
                      onClick={() => setEditingInRoom((v) => !v)}
                    >
                      {editingInRoom ? "▲ HIDE WARDROBE" : "✎ CUSTOMIZE"}
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

                    <div className="field-label">
                      SLIME HUE <span>{COLOR_NAMES[selectedColor]}</span>
                    </div>
                    <div className="mp-palette" role="group" aria-label="Slime Color">
                      {COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className={`mp-color-btn ${selectedColor === c ? "active" : ""}`}
                          style={{ backgroundColor: c, color: c }}
                          aria-pressed={selectedColor === c}
                          disabled={occupiedColors.has(c)}
                          onClick={() => handleProfileChange(nickname, c, selectedHat)}
                          title={`${COLOR_NAMES[c]}${occupiedColors.has(c) ? " — taken" : ""}`}
                          aria-label={`Select slime color ${COLOR_NAMES[c] || c}`}
                        >
                          {selectedColor === c && <span className="color-check" aria-hidden="true">✓</span>}
                        </button>
                      ))}
                    </div>

                    <div className="field-label">
                      HEADDRESS <span>{HAT_META[selectedHat].title.toUpperCase()}</span>
                    </div>
                    <div className="mp-hat-row" role="group" aria-label="Hat selection">
                      {HATS.map((h) => (
                        <button
                          key={h}
                          type="button"
                          className={`mp-hat-btn ${selectedHat === h ? "active" : ""}`}
                          aria-pressed={selectedHat === h}
                          onClick={() => handleProfileChange(nickname, selectedColor, h)}
                        >
                          <span className="hat-btn-preview">
                            <HatGraphic hat={h} />
                          </span>
                          <b>{HAT_META[h].label}</b>
                        </button>
                      ))}
                    </div>
                    <EyeStylePicker value={selectedEyes} onChange={eyes => handleProfileChange(nickname, selectedColor, selectedHat, eyes)} />
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
                            <SlimeAvatar color={p.color} hat={p.hat} eyeStyle={p.eyeStyle} size="md" />
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
                            <SlimeAvatar color={botColor} hat={botHat} eyeStyle={EYE_STYLES[slotIdx % EYE_STYLES.length]} size="md" isBot />
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
                      disabled={!mpState.connected}
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

                </fieldset>
                <button className="mp-btn-secondary" onClick={() => multiplayerClient?.leaveRoom()}>
                  LEAVE ROOM
                </button>
              </div>
            ) : (
              <div className="mp-config">
                <div className="home-gateway-intro">
                  <h2>PLAY WITH FRIENDS <span aria-hidden="true">↗</span></h2>
                  <p>Your next “it wasn’t me” moment starts here.</p>
                </div>
                <label className="play-name" htmlFor="play-nickname">Your name <small>Randomized callsign ready — or pick your own below.</small>
                  <input id="play-nickname" className="mp-field" maxLength={16} value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="Enter your warden name…" autoComplete="nickname" />
                </label>
                <div className="mp-actions-grid">
                  <div className="mp-action-card host-card">
                    <div className="mp-card-header">
                      <small>MAKE ROOM FOR YOUR FRIENDS</small>
                      <b>Host a game</b>
                    </div>
                    <p className="mp-card-desc">Get a code to invite your friends. 4–8 players, with optional AI.</p>
                    <button className="mp-btn-primary" onClick={handleCreateRoom} disabled={isConnecting || !multiplayerClient}>
                      {isConnecting ? "CONNECTING..." : "CREATE ROOM"}
                    </button>
                  </div>
                  <div className="mp-action-card join-card">
                    <div className="mp-card-header">
                      <small>HAVE AN INVITE CODE?</small>
                      <b>Join your friends</b>
                    </div>
                    <form className="mp-code-entry-form" onSubmit={(e) => { e.preventDefault(); void handleJoinRoom(); }}>
                      <input
                        id="home-room-code"
                        className="mp-field mp-code-input"
                        maxLength={4}
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value.replace(/[^a-zA-Z]/g, "").toUpperCase())}
                        placeholder="CODE"
                        aria-label="4-letter room code"
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <button type="submit" className="mp-btn-secondary" disabled={isConnecting || joinCode.length !== 4 || !multiplayerClient}>JOIN WITH CODE</button>
                    </form>
                  </div>
                </div>

                <details className="home-wardrobe" aria-label="Customize your Warden">
                  <summary className="wardrobe-summary-bar">
                    <SlimeAvatar color={selectedColor} hat={selectedHat} eyeStyle={selectedEyes} size="sm" />
                    <span><small>YOU’RE ENTERING AS</small><strong>{nickname.trim() || WARDEN_CALLSIGNS[0]}</strong><em>{COLOR_NAMES[selectedColor]} · {HAT_META[selectedHat].label} · {EYE_LABELS[selectedEyes]} eyes</em></span>
                    <b>Customize <span aria-hidden="true">＋</span></b>
                  </summary>
                <div className="mp-customizer-card">
                  <div className="mp-customizer-controls">
                    <div className="field-label" style={{ marginTop: 12 }}>
                      SLIME HUE <span>{COLOR_NAMES[selectedColor]}</span>
                    </div>
                    <div className="mp-palette" role="group" aria-label="Slime Color">
                      {COLORS.map((c, idx) => (
                        <button
                          key={c}
                          type="button"
                          className={`mp-color-btn ${selectedColor === c ? "active" : ""}`}
                          style={{ backgroundColor: c, color: c }}
                          aria-pressed={selectedColor === c}
                          onClick={() => { playLobbySfx("customize", idx); triggerWardenBoop(2, "🎨"); setSelectedColor(c); }}
                          title={COLOR_NAMES[c]}
                          aria-label={`Select slime color ${COLOR_NAMES[c] || c}`}
                        >
                          {selectedColor === c && <span className="color-check" aria-hidden="true">✓</span>}
                        </button>
                      ))}
                    </div>

                    <div className="field-label">
                      HEADDRESS <span>{HAT_META[selectedHat].title.toUpperCase()}</span>
                    </div>
                    <div className="mp-hat-row" role="group" aria-label="Hat selection">
                      {HATS.map((h, idx) => (
                        <button
                          key={h}
                          type="button"
                          className={`mp-hat-btn ${selectedHat === h ? "active" : ""}`}
                          aria-pressed={selectedHat === h}
                          onClick={() => { playLobbySfx("customize", idx + 2); triggerWardenBoop(2, "✦"); setSelectedHat(h); }}
                        >
                          <span className="hat-btn-preview">
                            <HatGraphic hat={h} />
                          </span>
                          <b>{HAT_META[h].label}</b>
                        </button>
                      ))}
                    </div>
                    <EyeStylePicker value={selectedEyes} onChange={(eyes) => { playLobbySfx("customize", 5); triggerWardenBoop(2, "👀"); setSelectedEyes(eyes); }} />
                    <button type="button" className="mp-random-btn" onClick={handleRandomizeProfile} title="Randomize Warden Identity">↻ SURPRISE ME</button>
                  </div>
                </div>
                </details>

                {/* Live Open Rooms Browser */}
                <div className="mp-open-rooms">
                  <div className="mp-open-rooms-head">
                    <div className="field-label">
                      ACTIVE SANCTUARIES{" "}
                      <span>{showRoomResults ? `${mpState?.openRooms.length ?? 0} OPEN` : "NOT CHECKED"}</span>
                    </div>
                    <button
                      type="button"
                      className="mp-refresh-btn"
                      onClick={handleRefreshRooms}
                      disabled={isRefreshingRooms}
                    >
                      {isRefreshingRooms ? "SCANNING…" : showRoomResults ? "↻ REFRESH" : "↻ FIND ROOMS"}
                    </button>
                  </div>

                  {showRoomResults && mpState?.openRooms && mpState.openRooms.length > 0 ? (
                    <div className="mp-open-rooms-list" role="list">
                      {mpState.openRooms.map((room) => (
                        <div className="open-room-item" key={room.code} role="listitem">
                          <div className="open-room-host">
                            <SlimeAvatar color={room.hostColor} hat={room.hostHat} eyeStyle={room.hostEyeStyle} size="sm" />
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
                      <span>{isRefreshingRooms ? "Listening for circles in the forest…" : showRoomResults ? "No open circles yet. Create one and bring your friends!" : "Looking for company? Find an open circle, or create your own above."}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            </div>
          </div>
        </div>
        {!inRoom && <HomeFieldGuide />}
      </section>

      <footer className="lobby-footer"><span>WASD / ARROWS TO MOVE</span><span>E TASK</span><span>F ITEM</span><span>R REPORT</span><span>Q / SPACE KILL</span></footer>
      </div>
    </main>
  );
}

function ItemIcon({ item }: { item: ItemKind }) {
  if (item === "FLASHLIGHT") return <span className="forest-item mushroom" aria-hidden="true">✦<i /></span>;
  if (item === "FLARE") return <span className="forest-item moonblossom" aria-hidden="true">✿</span>;
  return <svg className="forest-item echo-bell" viewBox="0 0 32 32" aria-hidden="true" fill="none"><path d="M16 3v5m-6 17h12M7 23c3-3 2-14 9-14s6 11 9 14c-5 3-13 3-18 0Z" fill="#b6c9a2" stroke="#e5edc6" strokeWidth="1.5" /><path d="M12 6c-4-6-9-2-7 1 2 2 5 1 7-1Zm8 0c4-6 9-2 7 1-2 2-5 1-7-1Z" fill="#91bba1" /><circle cx="16" cy="27" r="2" fill="#eff2c3" /></svg>;
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
  soloProfile,
  multiplayerClient,
  initialPlayers,
  assignedRole,
  onExit,
}: {
  count: number;
  roleChoice: RoleChoice;
  soloProfile?: SoloProfile;
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
  const [meetingKey, setMeetingKey] = useState(0);
  const [snapshot, setSnapshot] = useState<Snapshot>(initialSnapshot());
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [puzzle, setPuzzle] = useState<TaskPuzzle | null>(null);
  const [killNotice, setKillNotice] = useState<KillNotice | null>(null);
  const [deathReveal, setDeathReveal] = useState<DeathReveal | null>(null);
  const [result, setResult] = useState("");
  const [roleReveal, setRoleReveal] = useState<Role | null>(null);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [musicReady, setMusicReady] = useState(true);
  const [musicBlocked, setMusicBlocked] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lowGlare, setLowGlare] = useState(false);
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
        setMeetingKey(meetingSerialRef.current);
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
      soloProfile,
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
  }, [count, roleChoice, multiplayerClient, initialPlayers, assignedRole, soloProfile]);

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
    if (!musicEnabled || !musicBlocked) return;
    const unlockOnGesture = () => {
      const normalMusic = normalMusicRef.current;
      const ordealMusic = ordealMusicRef.current;
      if (!normalMusic || !ordealMusic) return;
      const ordealActive = snapshot.phase === "ORDEAL";
      const activeTrack = ordealActive ? ordealMusic : normalMusic;
      void activeTrack.play()
        .then(() => {
          setMusicBlocked(false);
          setMusicReady(true);
          activeTrack.volume = ordealActive ? 0.26 : 0.2;
        })
        .catch(() => undefined);
    };
    window.addEventListener("pointerdown", unlockOnGesture, { once: true });
    window.addEventListener("keydown", unlockOnGesture, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlockOnGesture);
      window.removeEventListener("keydown", unlockOnGesture);
    };
  }, [musicEnabled, musicBlocked, snapshot.phase]);

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
      });
  };
  const dismissRoleReveal = () => {
    if (musicEnabled) primeBackgroundMusic();
    if (soundEnabled) void engineRef.current?.audio.unlock();
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
    if (musicEnabled) {
      setMusicEnabled(false);
      return;
    }
    setMusicEnabled(true);
    primeBackgroundMusic();
  };

  return (
    <main className="game-shell">
      <header className="game-nav">
        <Logo />
        <div className={`phase-chip phase-${snapshot.phase.toLowerCase()}`}><span />{phaseLabel}<b>{Math.ceil(snapshot.time).toString().padStart(2, "0")}</b></div>
        <div className="game-nav-actions">
          <button className="music-button" aria-pressed={soundEnabled} onClick={async () => setSoundEnabled(await engineRef.current?.audio.toggle() ?? false)}>{soundEnabled ? "SFX ON" : "ENABLE SFX"}</button>
          <button className="music-button" aria-pressed={lowGlare} onClick={() => { const next = !lowGlare; setLowGlare(next); if (engineRef.current) engineRef.current.lowGlare = next; }}>{lowGlare ? "SOFT GLARE ON" : "SOFT GLARE"}</button>
          <button
            className={`music-button ${musicEnabled ? "active" : ""}`}
            onClick={toggleBackgroundMusic}
            aria-pressed={musicEnabled}
            aria-label={`${musicEnabled ? "Disable" : "Enable"} background music`}
          >
            <span aria-hidden="true">♪</span>{musicEnabled ? "BGM ON" : "BGM OFF"}
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
          <div className="private-role"><small>PRIVATE ROLE</small><b>IMPOSTOR</b><span>Sight V OR Echo C • one special action</span><span>one strike per Ordeal</span></div>
        )}

        {snapshot.message && <div className="toast-message">{snapshot.message}</div>}
        {snapshot.soundCaption && <div className="sound-caption" role="status" aria-live="polite">♬ {snapshot.soundCaption}</div>}
        {snapshot.phase === "COUNTDOWN" && <div className="ordeal-preparation" role="status"><b>{HAZARD_LABELS[snapshot.hazard]} INCOMING</b><span>{snapshot.hazard === "ROOTWAKE" ? "Choose your chamber before the roots seal." : snapshot.hazard === "PHANTOMS" ? "Ready your Echo Bell. Not every shape is real." : snapshot.hazard === "MOONGLARE" ? "Memorize nearby wardens. Identities will disappear." : snapshot.hazard === "MIRROR_POOL" ? "Controls will invert for 25s! Bumping another warden swaps your colors." : "Ready your Glowing Mushroom or Moonblossom."}</span></div>}
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
          {snapshot.role === "IMPOSTOR" && <button className={`action sight ${snapshot.canUseMoonSight ? "ready" : ""}`} title="Aim, then create a two-second false rustle. Shares one charge with Sight." onClick={() => engineRef.current?.useEchoLure()} disabled={!snapshot.canUseMoonSight}><kbd>C</kbd><span>ECHO</span></button>}
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
        {snapshot.role === "IMPOSTOR" && <span>SIGHT <kbd>V</kbd> OR ECHO <kbd>C</kbd> • AIM FIRST</span>}
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
            <p className="reveal-order">{roleReveal === "IMPOSTOR" ? "One strike. One trick: choose Moon Sight or Echo Lure each Ordeal." : "Restore the moon wards. Keep your circle alive."}</p>
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
            <h2 id="death-reveal-title">YOU WERE CONSUMED</h2>
            <div className="killer-label">KILLED BY</div>
            <ConsumptionPortrait killerColor={deathReveal.killerColor} victimColor={deathReveal.victimColor || "#63e6be"} />
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
        <div
          key={`meeting-${meetingKey}`}
          className={`modal-backdrop meeting-backdrop ${meeting.tally ? "is-tally" : "is-discussion"} ${meeting.reason.includes("PUDDLE") || meeting.reason.includes("BODY") ? "body-report" : "bell-report"}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="meeting-title"
        >
          <div className="meeting-shockwave" aria-hidden="true"><i /><i /><i /></div>
          <div className="meeting-card">
            <div className="meeting-alert">
              <span>{meeting.tally ? "⚖" : "!"}</span>
              <div>
                <small>{meeting.tally ? "VOTES COUNTED" : `REPORTED BY ${meeting.reporter}`}</small>
                <h2 id="meeting-title">{meeting.reason}</h2>
              </div>
              <b>{meeting.tally ? "FINAL TALLY" : "DISCUSS + VOTE"}</b>
            </div>
            <div className="meeting-content">
              {meeting.tally ? (
                <div className="vote-tally-screen">
                  <div className={`vote-verdict ${meeting.ejectedId ? "ejected" : "no-ejection"}`}>
                    <small>FINAL VERDICT</small>
                    <h3>{meeting.verdict}</h3>
                    <p>The crew’s votes have been counted.</p>
                  </div>
                  <div className="tally-grid" aria-label="Vote totals by player">
                    {meeting.tally.map((entry, idx) => (
                      <div
                        className={`tally-card ${entry.isTop ? "top-tally" : ""} ${entry.targetId === meeting.ejectedId ? "ejected" : ""} ${entry.targetId ? "" : "skip-tally"}`}
                        style={{ "--card-idx": idx } as React.CSSProperties}
                        key={entry.targetId || "SKIP"}
                      >
                        <b className="tally-name">{entry.targetName}</b>
                        {entry.targetColor ? (
                          <span className="tally-slime"><SlimePortrait color={entry.targetColor} eyeStyle={entry.targetEyeStyle} /></span>
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
                      {meeting.candidates.map((player, idx) => {
                        const isYou = player.id === snapshot.localPlayerId;
                        return (
                          <button
                            key={player.id}
                            style={{ "--card-idx": idx } as React.CSSProperties}
                            disabled={!player.alive || isYou || !snapshot.humanAlive}
                            onClick={() => engineRef.current?.vote(player.id)}
                          >
                            <span className="vote-slime"><SlimePortrait color={player.alive ? player.color : "#53616b"} eyeStyle={player.eyeStyle} /></span>
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
    | { mode: "SOLO"; count: number; role: RoleChoice; profile: SoloProfile }
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
      soloProfile={match.mode === "SOLO" ? match.profile : undefined}
      multiplayerClient={match.mode === "MULTI" ? match.client : null}
      initialPlayers={match.mode === "MULTI" ? match.initialPlayers : undefined}
      assignedRole={match.mode === "MULTI" ? match.assignedRole : undefined}
      onExit={handleExit}
    />
  ) : (
    <Lobby
      onLaunch={(count, role, profile) => setMatch({ mode: "SOLO", count, role, profile })}
      multiplayerClient={client}
      mpState={mpState}
    />
  );
}
