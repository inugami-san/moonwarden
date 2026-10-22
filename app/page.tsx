"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MultiplayerClient, type MultiplayerState } from "./network";
import type { NetMovement, NetPlayer, PairRitualState, S2CMessage } from "../server/game-types";
import { FloatingJoystick } from "./floating-joystick";
import { movementVector, type MoveVector } from "./joystick-input";
import { PairedRituals } from "../server/pair-ritual";
import { FieldNotebook, MeetingObservations } from "./field-notebook";
import type { KnownName, ObservationNote } from "./field-notes";
import { ROLE_LABELS, ejectionVerdict, matchResultLabel, meetingVerdictLabel } from "../server/role-presentation";
import { GAME_RELEASE_LABEL, GAME_RELEASE_VERSION, GAME_WORLD_VERSION } from "../server/game-version";
import { createMatchLayout } from "../server/match-layout";
import { clampHollowCount, hollowVictory, ritualProgress, resolveReporterVote, REPORTER_VOTE_DRIFT_CHANCE, type VoteReceipt, WARD_SETTLE_SECONDS, STEALTH_BODY_DELAY_SECONDS, STEALTH_COOLDOWN_SECONDS, STEALTH_ORDEAL_LOCKOUT } from "../server/match-rules";
import { MovementBuffer } from "./movement";
import { slimeEyes, slimeOutline, slimeSkin } from "./slime-art";
import { SlimePortrait } from "./slime-portrait";
import { EyeStylePicker } from "./eye-style-picker";
import { EYE_LABELS } from "./slime-eyes";
import { SlimeAnimator } from "./slime-motion";
import { ACCESSORY_FRAME, drawAccessory } from "./accessory-art";
import { EYE_STYLES, normalizeEyeStyle, type EyeStyle } from "../server/appearance";
import { drawForestSanctum, drawSanctumStatus } from "./sanctum-art";
import { availablePlayerName, PLAYER_COLORS as COLORS, randomWardenCallsign, WARDEN_CALLSIGNS } from "../server/palette";
import {
  ECHO_RANGE,
  HEARING_RANGE,
  MIRROR_BUMP_COOLDOWN_MS,
  MIRROR_BUMP_DISTANCE,
  MOON_SIGHT_SECONDS,
  SANCTUARY_OBSTACLES,
  isOccludedByObstacle,
  nextHazard,
  ordealDuration,
  phantomPaths,
  resolveObstacleMovement,
  resolveObstaclePosition,
  sanctuaryZoneName,
  type SanctuaryObstacle,
} from "../server/ordeal-rules";
import { ForestAudio, soundDirection } from "./forest-audio";
import { drawMoonGlade } from "./moon-glade";
import { drawForestObstacle, drawGroundResponse } from "./forest-art";
import { fittedCanvasBounds } from "./canvas-bounds";
import { HomeAtmosphere, HomeFieldGuide, HomeGrove } from "./home-field-guide";
import { DEVOUR_SECONDS, drawSlimeConsumption, type DevourVisual } from "./slime-devour";
import { ConsumptionPortrait } from "./consumption-portrait";
import { trackGameEvent } from "./analytics";
import { GameAnalyticsLifecycle } from "./analytics-game";
import { AnalyticsSettingsButton } from "./analytics-consent";
import { NavigationMap } from "./navigation-map";
import { WORLD_WIDTH, WORLD_HEIGHT, VIEW_WIDTH, VIEW_HEIGHT, ROOM, PLAYER_BOUNDS, CENTER, CALM_SECONDS, ROOT_BARRIERS, STATIONS, getRootCell, sharesRootCell, clampWorldPoint, keepInRootCell } from "../server/sanctuary-map";
import { planRoute } from "../server/sanctuary-paths";
import { cameraViewport, cameraTarget, followCamera, viewportToWorld } from "./world-camera";
import { ORDEAL_PREPARATION, preparationStation, restorationMilestone } from "./warden-objectives";
import "./warden-exploration.css";
import "./next-chapter.css";

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
  teamRestored?: boolean;
  pending?: boolean;
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
  stealthCooldown: number;
  stealthOrdealsLeft: number;
  taskFailure: string;
  canUseMoonSight: boolean;
  moonSightActive: boolean;
  soundCaption: string;
  canReport: boolean;
  taskPrompt: boolean;
  taskMode: "PUZZLE" | "HOLD" | null;
  stationStatus: { label: string; completed: boolean; reward: ItemKind; teamRestored?: boolean; pending?: boolean } | null;
  rewardNotice: { item: ItemKind; station: string; progress?: number } | null;
  navigation: { x: number; y: number; personalCompleted: string[]; teamRestored: string[]; destinationId: string | null };
  humanAlive: boolean;
  message: string;
  localPlayerId: string;
  pairRitual: PairRitualState | null;
  locationName: string;
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
  bodyReporterId?: string | null;
  localVote?: VoteReceipt;
  votePending?: boolean;
  voteError?: string;
  candidates: Player[];
  tally?: VoteTally[];
  ejectedId?: string | null;
  verdict?: string;
  tied?: boolean;
  /** Each living bot's current prime suspect, derived from what it witnessed. */
  accusations: Record<string, string | null>;
};

type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string };
const W = WORLD_WIDTH;
const H = WORLD_HEIGHT;
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

function initialSnapshot(role: Role = "CREWMATE"): Snapshot {
  return {
    phase: "CALM",
    time: CALM_SECONDS,
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
    stealthCooldown: 0,
    stealthOrdealsLeft: 0,
    taskFailure: "",
    canUseMoonSight: false,
    moonSightActive: false,
    soundCaption: "",
    canReport: false,
    taskPrompt: false,
    taskMode: null,
    stationStatus: null,
    rewardNotice: null,
    navigation: { x: CENTER.x, y: CENTER.y, personalCompleted: [], teamRestored: [], destinationId: null },
    humanAlive: true,
    message: "",
    localPlayerId: "you",
    pairRitual: null,
    locationName: "WARDEN COURTYARD",
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
    && a.stealthCooldown === b.stealthCooldown && a.stealthOrdealsLeft === b.stealthOrdealsLeft && a.taskFailure === b.taskFailure
    && a.canUseMoonSight === b.canUseMoonSight
    && a.moonSightActive === b.moonSightActive
    && a.soundCaption === b.soundCaption
    && a.canReport === b.canReport
    && a.taskPrompt === b.taskPrompt
    && a.taskMode === b.taskMode
    && a.humanAlive === b.humanAlive
    && a.message === b.message
    && a.localPlayerId === b.localPlayerId
    && a.locationName === b.locationName
    && a.pairRitual?.stationId === b.pairRitual?.stationId
    && a.pairRitual?.progress === b.pairRitual?.progress
    && a.pairRitual?.participants === b.pairRitual?.participants
    && a.stationStatus?.label === b.stationStatus?.label
    && a.stationStatus?.completed === b.stationStatus?.completed
    && a.stationStatus?.reward === b.stationStatus?.reward
    && a.stationStatus?.teamRestored === b.stationStatus?.teamRestored
    && a.stationStatus?.pending === b.stationStatus?.pending
    && a.rewardNotice?.item === b.rewardNotice?.item
    && a.rewardNotice?.station === b.rewardNotice?.station
    && a.rewardNotice?.progress === b.rewardNotice?.progress
    && a.navigation.x === b.navigation.x && a.navigation.y === b.navigation.y
    && a.navigation.destinationId === b.navigation.destinationId
    && a.navigation.personalCompleted.join() === b.navigation.personalCompleted.join()
    && a.navigation.teamRestored.join() === b.navigation.teamRestored.join()
  );
}

class OrdealEngine {
  layoutSeed = 0;
  obstacles = [...SANCTUARY_OBSTACLES];
  private hollowIds = new Set<string>();
  private initialHollows = 1;
  private initialWardens = 0;
  private pendingWardDelta = 0;
  private wardSettleTimer = 0;
  private stealthUntil = 0;
  private stealthAvailableOrdeal = 0;
  private ordealNumber = 0;
  private botStrikeSpent = new Set<string>();
  private pendingBodies: { body: Body; at: number }[] = [];
  private pendingKillStealth = false;
  private taskFailure = "";
  private taskFailureUntil = 0;
  private lastQuestions = new Map<string, string>();
  private wardClaims = new Set<string>();
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
  moveVector: MoveVector = { vx: 0, vy: 0 };
  private joystickAim: { x: number; y: number } | null = null;
  chaosMoonsway = false;
  pairRitual: PairRitualState | null = null;
  private pairedRituals = new PairedRituals();
  private pairStationId: string | null = null;
  private pairHeartbeatAt = 0;
  notebookOpen = false;
  mouse = { x: W * 0.72, y: H * 0.45 };
  phase: Phase = "CALM";
  phaseTime = CALM_SECONDS;
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
  private localStep = { x: 0, y: 0, at: -1 };
  audio = new ForestAudio();
  lowGlare = false;
  private slimeAnimator = new SlimeAnimator();
  private motionPreference: MediaQueryList | null = null;
  private reducedMotion = false;
  private onMotionPreferenceChange = (event: MediaQueryListEvent) => { this.reducedMotion = event.matches; };
  rewardNotice: { item: ItemKind; station: string; progress?: number } | null = null;
  rewardNoticeUntil = 0;
  viewWidth = VIEW_WIDTH;
  viewHeight = VIEW_HEIGHT;
  camera = { x: 0, y: 0 };
  private pointerViewport = { x: VIEW_WIDTH * 0.72, y: VIEW_HEIGHT * 0.45 };
  navigationOpen = false;
  private destinationId: string | null = null;
  private botRites = new Map<string, Set<string>>();
  private botWork = new Map<string, { station: string; duration: number }>();
  private botRoutes = new Map<string, { targetX: number; targetY: number; root: boolean; points: { x: number; y: number }[] }>();

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
    const sameChamber = this.phase !== "ORDEAL" || this.hazard !== "ROOTWAKE" || sharesRootCell(this.human, { x, y });
    if (isDirect || sameChamber) this.audio.devour(this.human, { x, y }, isDirect);
    if (!isDirect && sameChamber && this.human.alive && dist(this.human, { x, y }) <= HEARING_RANGE) {
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
    matchOptions?: { layoutSeed?: number; hollowCount?: number; hollowAllies?: string[]; chaosMoonsway?: boolean },
  ) {
    this.canvas = canvas;
    this.resetInput = this.resetInput.bind(this);
    this.motionPreference = window.matchMedia?.("(prefers-reduced-motion: reduce)") ?? null;
    this.reducedMotion = this.motionPreference?.matches ?? false;
    this.motionPreference?.addEventListener("change", this.onMotionPreferenceChange);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is not supported in this browser.");
    this.ctx = context;
    this.mask = document.createElement("canvas");
    this.mask.width = VIEW_WIDTH;
    this.mask.height = VIEW_HEIGHT;
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
    this.layoutSeed = matchOptions?.layoutSeed ?? Math.floor(Math.random() * 4294967296);
    const layout = createMatchLayout(this.layoutSeed);
    this.obstacles = layout.obstacles;
    this.makeStations(layout.stations);
    this.renderStaticBackground();
    this.hollowIds = new Set(matchOptions?.hollowAllies ?? []);
    this.chaosMoonsway = matchOptions?.chaosMoonsway === true;
    this.initialHollows = clampHollowCount(matchOptions?.hollowCount, count);
    this.initialWardens = count - this.initialHollows;
    this.multiplayerClient = multiplayerClient || null;
    if (this.multiplayerClient && initialPlayers && initialPlayers.length > 0) {
      this.localPlayerId = this.multiplayerClient.playerId;
      this.initMultiplayerPlayers(initialPlayers, assignedRole);
      this.unsubscribeNet = this.multiplayerClient.onMessage((msg) => this.handleNetworkMessage(msg));
    } else {
      this.makePlayers(count, roleChoice, soloProfile, this.initialHollows);
      this.hazard = nextHazard(this.hazard);
    }
    this.resize();
    window.addEventListener("resize", this.resize);
    window.addEventListener("scroll", this.updateRect, { passive: true });
    window.addEventListener("keydown", this.keyDown);
    window.addEventListener("keyup", this.keyUp);
    window.addEventListener("blur", this.resetInput);
    document.addEventListener("visibilitychange", this.visibilityChanged);
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
        role: isLocal ? (assignedRole || p.role || "CREWMATE") : this.hollowIds.has(p.id) ? "IMPOSTOR" : "CREWMATE",
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
      case "PAIR_RITUAL_STATE":
        if (msg.ritual.roundId !== this.stationRound) break;
        this.pairRitual = msg.ritual.participants ? msg.ritual : null;
        this.emit(true);
        break;
      case "ABILITY_STATE":
        if (msg.roundId !== this.stationRound) break;
        this.abilityPending = false;
        this.moonSightUsedThisOrdeal = msg.used;
        this.moonSightUntil = msg.sightRemainingMs > 0 ? this.elapsed + msg.sightRemainingMs / 1000 : 0;
        if (!msg.accepted) this.flashMessage("Your special action is unavailable. Choose Sight OR Echo once per Ordeal.");
        this.emit(true);
        break;
      case "SOUND_CUE":
        if ((this.phase !== "ORDEAL" && msg.cue.kind !== "RITUAL") || Date.now() > msg.cue.expiresAt || this.heardCueIds.has(msg.cue.id)) break;
        if (this.heardCueIds.size > 100) this.heardCueIds.clear();
        this.heardCueIds.add(msg.cue.id);
        if (msg.cue.kind === "RITUAL") this.hearRitual(msg.cue);
        else this.hearRustle(msg.cue);
        break;
      case "KILL_RESULT":
        this.killUsedThisOrdeal = msg.spent;
        this.stealthUntil = this.elapsed + (msg.stealthRemainingMs ?? 0) / 1000;
        this.stealthAvailableOrdeal = this.ordealNumber + (msg.stealthOrdealsLeft ?? 0);
        if (msg.accepted && this.pendingKillStealth && this.pendingDevourVictimId) {
          const victim = this.players.find(p => p.id === this.pendingDevourVictimId);
          if (victim) this.startDevour(`body-${victim.id}`, victim.x, victim.y, victim.color, this.human.id, this.human.color);
        }
        if (!msg.accepted) this.pendingDevourVictimId = null;
        if (!msg.accepted) this.flashMessage(msg.spent ? "Your single strike is already spent for this Ordeal." : "Strike missed — the target moved out of reach. Your strike is still available.");
        this.emit(true);
        break;
      case "STRIKE_STATE":
        this.killUsedThisOrdeal = msg.spent;
        this.stealthUntil = this.elapsed + msg.stealthRemainingMs / 1000;
        this.stealthAvailableOrdeal = this.ordealNumber + msg.stealthOrdealsLeft;
        break;
      case "GEAR_SYNC": {
        if (msg.roundId !== undefined && msg.roundId < this.stationRound) break;
        if (msg.roundId !== undefined && msg.roundId > this.stationRound) this.resetStations(msg.roundId);
        this.charges = { ...msg.charges };
        if (msg.completedStations) {
          const personal = new Set(msg.completedStations);
          for (const station of this.stations) station.completed = personal.has(station.label);
        }
        if (msg.stationId) {
          const station = this.stations.find((s) => s.label === msg.stationId);
          if (station) {
            station.pending = false;
            station.completed = Boolean(msg.stationCompleted);
            if (msg.accepted) {
              this.selectedItem = station.reward;
              this.rewardNotice = { item: station.reward, station: station.label, progress: msg.wardProgressGain ?? 0 };
              this.rewardNoticeUntil = this.elapsed + 5.5;
              station.completedAt = this.elapsed;
              this.flashMessage(msg.wardProgressGain ? `Ritual accepted (${msg.wardProgressGain > 0 ? "+" : ""}${msg.wardProgressGain}% queued). ${ITEM_LABELS[station.reward]} is ready.` : `Your personal ritual is complete. ${ITEM_LABELS[station.reward]} is ready.`);
            }
          }
        }
        if (!msg.accepted) {
          if (msg.item === this.selectedItem) this.itemActiveUntil = 0;
          this.rewardNotice = null;
          this.flashMessage(msg.stationId ? "Your rite is already complete, out of reach, or the round ended. No item was awarded." : "That gear charge is no longer available.");
          this.audio.cue("task-error");
        } else if (msg.stationId) {
          this.audio.cue("task-complete");
        } else if (msg.item) {
          this.audio.cue("item-use");
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
        const previousHazard = this.hazard;
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
            if (sealedSet.has(station.label) && !station.teamRestored) {
              station.teamRestored = true;
              stationSealedNow = true;
              // A fallback for a client that missed the completion event.
              station.completedAt ??= this.elapsed;
            }
          }
        }
        if (this.activeMeeting && msg.phase !== "DISCUSSION") {
          this.activeMeeting = null;
          this.onMeeting(null);
          if (!this.gameOver) this.paused = false;
        }
        if (this.phase === "ORDEAL" && previousPhase !== "ORDEAL") {
          this.ordealNumber += 1;
          this.audio.cue("ordeal-start");
          this.killUsedThisOrdeal = false;
          this.pendingDevourVictimId = null;
          this.moonSightUsedThisOrdeal = false;
          this.moonSightUntil = 0;
          this.abilityPending = false;
          this.heardCueIds.clear();
        }
        if (this.phase === "CALM" && previousPhase !== "CALM") this.audio.cue("calm");
        if (this.phase !== "ORDEAL") this.moonSightUntil = 0;
        this.emit(stationSealedNow || stationResetNow || previousPhase !== this.phase || previousHazard !== this.hazard);
        break;
      }

      case "BODY_SPAWNED": {
        const b = msg.body;
        if (!this.bodies.some((x) => x.id === b.id)) {
          this.bodies.push({ id: b.id, x: b.x, y: b.y, color: b.color, name: b.name, age: b.age });
          if (!b.delayed) this.startDevour(b.id, b.x, b.y, b.color);
          this.onKill({ key: `${b.id}-${performance.now()}` });
        }
        break;
      }

      case "FLARE_SPAWNED": {
        this.flares.push({ x: msg.flare.x, y: msg.flare.y, life: msg.flare.life, owner: msg.flare.owner });
        break;
      }

      case "MEETING_CALLED": {
        this.resetInput();
        this.taskFailure = "";
        this.movementBuffer.clear();
        this.pendingInputs.clear();
        for (const player of this.players) { player.vx = 0; player.vy = 0; player.working = false; }
        this.cancelPuzzle("");
        this.paused = true;
        this.phase = "DISCUSSION";
        this.activeMeeting = {
          reason: msg.reason,
          reporter: msg.reporter,
          bodyReporterId: msg.bodyReporterId ?? null,
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

      case "VOTE_RECEIPT": {
        if (this.activeMeeting && !this.activeMeeting.tally) {
          this.activeMeeting = {
            ...this.activeMeeting,
            votePending: false,
            localVote: msg.accepted ? { targetId: msg.targetId, shifted: msg.shifted } : undefined,
            voteError: msg.accepted ? "" : "That player is no longer available. Choose another vote.",
          };
          this.onMeeting(this.activeMeeting);
          this.emit(true);
        }
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
        this.resetInput();
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
        this.playResultSound(msg.result);
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

  makeStations(stations: readonly Omit<Station, "cooldown" | "completed">[] = STATIONS) {
    this.stations = stations.map(station => ({ ...station, cooldown: 0, completed: false, teamRestored: false, pending: false }));
  }

  resetStations(roundId = this.stationRound + 1) {
    this.setPairRitual(false); this.pairedRituals?.clear();
    this.wardClaims.clear();
    this.stationRound = roundId;
    this.cancelPuzzle("");
    this.taskHold = 0;
    this.botRites?.clear();
    this.botWork?.clear();
    this.botRoutes?.clear();
    for (const station of this.stations) {
      station.completed = false;
      station.completedAt = undefined;
      station.cooldown = 0;
      station.teamRestored = false;
      station.pending = false;
    }
  }

  makePlayers(count: number, roleChoice: RoleChoice, profile?: SoloProfile, hollowCount = 1) {
    const colors = profile ? [profile.color, ...COLORS.filter(color => color !== profile.color)] : COLORS;
    const occupiedNames: string[] = [];
    let impostorIndex = Math.floor(Math.random() * count);
    if (roleChoice === "IMPOSTOR") impostorIndex = 0;
    if (roleChoice === "CREWMATE") impostorIndex = 1 + Math.floor(Math.random() * (count - 1));
    const hollowIndexes = new Set([impostorIndex]);
    const candidates = Array.from({ length: count }, (_, i) => i).filter(i => i !== impostorIndex && !(roleChoice === "CREWMATE" && i === 0));
    while (hollowIndexes.size < clampHollowCount(hollowCount, count) && candidates.length) hollowIndexes.add(candidates.splice(Math.floor(Math.random() * candidates.length), 1)[0]);
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2;
      const callsign = availablePlayerName(i === 0 ? (profile?.name || "") : NAMES[i - 1], occupiedNames);
      occupiedNames.push(callsign);
      this.players.push({
        id: i === 0 ? "you" : `bot-${i}`,
        name: i === 0 ? `${callsign} (YOU)` : callsign,
        role: hollowIndexes.has(i) ? "IMPOSTOR" : "CREWMATE",
        x: CENTER.x + Math.cos(angle) * 170,
        y: CENTER.y + Math.sin(angle) * 116,
        vx: 0,
        vy: 0,
        color: colors[i % colors.length],
        trueColor: colors[i % colors.length],
        hat: i === 0 && profile ? profile.hat : HATS[i % HATS.length],
        eyeStyle: i === 0 && profile ? profile.eyeStyle : EYE_STYLES[i % EYE_STYLES.length],
        alive: true,
        ai: i !== 0,
        targetX: CENTER.x,
        targetY: CENTER.y,
        thinkAt: 0,
        atStation: i % this.stations.length,
        flashlight: false,
        flareDropped: false,
        gearCharges: { FLASHLIGHT: 0, FLARE: 0, SONAR: 0 },
      });
    }
  }

  updateRect = () => {
    const bounds = fittedCanvasBounds(this.canvas.getBoundingClientRect(), this.viewWidth, this.viewHeight);
    this.canvasRect = new DOMRect(bounds.left, bounds.top, bounds.width, bounds.height);
  };

  resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const viewport = cameraViewport(this.canvas.clientWidth, this.canvas.clientHeight);
    this.viewWidth = viewport.width;
    this.viewHeight = viewport.height;
    this.canvas.width = Math.round(this.viewWidth * dpr);
    this.canvas.height = Math.round(this.viewHeight * dpr);
    this.mask.width = Math.ceil(this.viewWidth);
    this.mask.height = Math.ceil(this.viewHeight);
    this.camera = cameraTarget(this.human, viewport);
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
    if (event.repeat || this.paused || this.roleRevealActive || this.navigationOpen || this.notebookOpen) return;
    if (event.code === "KeyH") this.setPairRitual(true);
    if (event.code === "KeyE") this.tryOpenPuzzle();
    if (event.code === "KeyF") this.useItem();
    if (event.code === "KeyR") this.report();
    if (event.code === "KeyQ" || event.code === "Space") this.kill();
    if (event.code === "KeyX") this.kill(true);
    if (event.code === "KeyV") this.useMoonSight();
    if (event.code === "KeyC") this.useEchoLure();
    if (event.code === "Digit1") this.selectItem("FLASHLIGHT");
    if (event.code === "Digit2") this.selectItem("FLARE");
    if (event.code === "Digit3") this.selectItem("SONAR");
  };

  keyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code);
    if (event.code === "KeyH") this.setPairRitual(false);
  };

  pointerMove = (event: PointerEvent) => {
    if (event.type === "pointerdown") void this.audio.unlock();
    if (event.pointerType === "touch") return;
    this.joystickAim = null;
    if (!this.canvasRect || this.canvasRect.width <= 0) this.updateRect();
    const rect = this.canvasRect;
    if (!rect) return;
    if (rect.width <= 0 || rect.height <= 0) return;
    this.pointerViewport = { x: clamp(((event.clientX - rect.left) / rect.width) * this.viewWidth, 0, this.viewWidth), y: clamp(((event.clientY - rect.top) / rect.height) * this.viewHeight, 0, this.viewHeight) };
    this.mouse = viewportToWorld(this.pointerViewport, this.camera, { width: this.viewWidth, height: this.viewHeight });
  };

  setNavigationDestination(id: string) {
    if (!this.stations.some(station => station.label === id && !station.completed)) return;
    this.destinationId = id;
    this.emit(true);
  }

  setNavigationOpen(open: boolean) {
    this.navigationOpen = open;
    this.resetInput();
    if (this.human) { this.human.vx = 0; this.human.vy = 0; this.human.working = false; }
  }

  contextMenu = (event: MouseEvent) => {
    event.preventDefault();
    this.useItem();
  };

  destroy() {
    this.resetInput();
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
    window.removeEventListener("blur", this.resetInput);
    document.removeEventListener("visibilitychange", this.visibilityChanged);
    this.canvas.removeEventListener("pointermove", this.pointerMove);
    this.canvas.removeEventListener("pointerdown", this.pointerMove);
    this.canvas.removeEventListener("contextmenu", this.contextMenu);
  }

  setTouch(code: string, down: boolean) {
    if (down) { void this.audio.unlock(); this.touchKeys.add(code); }
    else this.touchKeys.delete(code);
  }

  setMoveVector(vector: MoveVector) {
    this.moveVector = movementVector(0, 0, vector);
    if (Math.hypot(this.moveVector.vx, this.moveVector.vy) > .02) {
      this.joystickAim = { x: this.moveVector.vx, y: this.moveVector.vy };
    }
  }

  resetInput() {
    this.keys.clear(); this.touchKeys.clear();
    this.moveVector = { vx: 0, vy: 0 };
    this.setPairRitual(false);
    if (this.human) { this.human.vx = 0; this.human.vy = 0; this.human.working = false; }
  }
  visibilityChanged = () => { if (document.hidden) this.resetInput(); };

  setNotebookOpen(open: boolean) { this.notebookOpen = open; this.resetInput(); }

  setPairRitual(active: boolean) {
    if (!active) {
      if (this.pairStationId && this.multiplayerClient?.connected) this.multiplayerClient.pairRitual(this.pairStationId, false, this.stationRound);
      this.pairedRituals?.release(this.localPlayerId);
      this.pairStationId = null; this.pairRitual = null;
      return;
    }
    if (this.paused || this.activePuzzle || this.navigationOpen || this.notebookOpen || this.roleRevealActive || !this.human.alive) return;
    const station = this.stations.find(station => !station.completed && !station.pending && station.cooldown <= 0 && dist(station, this.human) <= 84);
    if (!station) return;
    this.pairStationId = station.label; this.pairHeartbeatAt = -1;
    this.human.vx = 0; this.human.vy = 0;
    void this.audio.unlock();
  }

  hearRitual(point: { x: number; y: number }) {
    if (!this.human.alive || dist(this.human, point) > HEARING_RANGE || (this.phase === "ORDEAL" && this.hazard === "ROOTWAKE" && !sharesRootCell(this.human, point))) return;
    this.audio.ritualHum(this.human, point);
    this.caption = "A shrine is humming nearby";
    this.captionUntil = this.elapsed + 1.2;
  }

  selectItem(item: ItemKind) {
    if (this.selectedItem !== item) this.audio.cue("ui");
    this.selectedItem = item;
    this.emit(true);
  }

  tryOpenPuzzle() {
    if (this.phase === "DISCUSSION" || !this.human.alive || this.paused || this.activePuzzle) return;
    const stationIndex = this.stations.findIndex((station) => dist(station, this.human) < 84 && !station.completed && !station.pending && station.cooldown <= 0 && station.puzzle);
    if (stationIndex < 0) return;
    const station = this.stations[stationIndex];
    this.setPairRitual(false);
    this.taskFailure = "";
    let puzzle = station.puzzle === "MATH" ? this.createMathPuzzle(station, stationIndex) : this.createLinkPuzzle(station, stationIndex);
    const signature = (question: TaskPuzzle) => `${question.prompt}:${question.sequence?.join() ?? ""}`;
    for (let retry = 0; retry < 16 && signature(puzzle) === this.lastQuestions.get(station.label); retry++) puzzle = station.puzzle === "MATH" ? this.createMathPuzzle(station, stationIndex) : this.createLinkPuzzle(station, stationIndex);
    this.lastQuestions.set(station.label, signature(puzzle));
    // The world keeps running while a puzzle is open: the phase timer and bots
    // continue, and the human simply stands still at the shrine.
    this.activePuzzle = puzzle;
    this.audio.cue("task-open");
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
    if (this.lastQuestions.get(station.label)?.startsWith(`${a} ${operator} ${b} = ?:`)) a += 1;
    const answer = operator === "+" ? a + b : operator === "−" ? a - b : a * b;
    const choices = new Set<number>([answer]);
    for (const offset of [-5, -3, -2, -1, 1, 2, 3, 5].sort(() => Math.random() - .5)) {
      choices.add(Math.max(0, answer + offset));
      if (choices.size === 3) break;
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
    const previous = this.lastQuestions.get(station.label);
    const pattern = choose(patterns.filter(pattern => !previous?.endsWith(`:${pattern.sequence.join()}`)));
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
      this.audio.cue("task-error");
      this.stations[this.activePuzzle.stationIndex].cooldown = 1.5;
      this.taskFailure = "Incorrect answer. No item earned — try the shrine again.";
      this.taskFailureUntil = this.elapsed + 3.5;
      this.cancelPuzzle("");
      this.emit(true);
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
    if (station.completed || station.pending) return;
    station.cooldown = 0;
    this.human.working = false;
    const reward = station.reward;
    const wardens = this.players.filter(p => p.alive && p.role === "CREWMATE").length;
    const progressGain = ritualProgress(wardens, this.phase === "ORDEAL", wasFake, this.initialHollows);
    if (this.multiplayerClient) {
      station.pending = true;
      this.multiplayerClient.sendTask(station.label, reward, this.stationRound);
      this.flashMessage("Attuning your ritual — waiting for the sanctuary.");
      return;
    }
    station.completed = true;
    this.charges[reward] = Math.min(3, this.charges[reward] + 1);
    this.selectedItem = reward;
    const earnedProgress = wasFake || !this.wardClaims.has(station.label) ? progressGain : 0;
    if (earnedProgress) {
      if (!wasFake) this.wardClaims.add(station.label);
      station.teamRestored = true;
      this.pendingWardDelta += earnedProgress;
    }
    this.rewardNotice = { item: reward, station: station.label, progress: earnedProgress };
    this.rewardNoticeUntil = this.elapsed + 5.5;
    const prefix = wasFake ? "Siphon rite accepted — ward reduction queued" : earnedProgress ? `Your ritual queued +${earnedProgress}% wards` : "Your personal ritual is complete";
    this.flashMessage(`${prefix}. ${ITEM_LABELS[reward]} acquired for the next Ordeal.`);
    station.completedAt = this.elapsed;
    this.audio.cue("task-complete");
    if (!wasFake) this.checkWin();
  }

  dismissTaskFailure() { this.taskFailure = ""; this.taskFailureUntil = 0; this.emit(true); }

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
      this.audio.cue("task-error");
      this.flashMessage(`No ${ITEM_LABELS[this.selectedItem]} charge. Complete its marked moon shrine first.`);
      return;
    }
    this.charges[this.selectedItem] -= 1;
    if (!this.multiplayerClient) this.audio.cue("item-use");
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
        let point = clampWorldPoint(this.human.x + (this.mouse.x - this.human.x) * scale, this.human.y + (this.mouse.y - this.human.y) * scale);
        if (this.hazard === "ROOTWAKE") {
          const cell = getRootCell(this.human.x, this.human.y);
          point = { x: clamp(point.x, cell.x + 30, cell.x + cell.w - 30), y: clamp(point.y, cell.y + 30, cell.y + cell.h - 30) };
        }
        this.echoes.push({ ...point, until: this.elapsed + 2, nextAt: 0 });
      }
    }
    this.flashMessage(ability === "MOON_SIGHT" ? "MOON SIGHT AWAKENED — all Warden positions and colors revealed!" : "ECHO LURE — a false rustle follows your aim. Special action spent.");
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
    const atEmergency = dist(this.human, CENTER) < 92 && this.phase === "CALM";
    if (this.multiplayerClient) {
      if (nearby || atEmergency) {
        this.multiplayerClient.sendReport(nearby?.id);
      } else {
        this.flashMessage("No body nearby. Emergency button is available during Calm.");
      }
      return;
    }
    if (nearby) this.startMeeting(`${nearby.name.toUpperCase()} WAS FOUND AS A JELLY PUDDLE`, "YOU", this.localPlayerId);
    else if (atEmergency) this.startMeeting("EMERGENCY MEETING", "YOU");
    else this.flashMessage("No body nearby. Emergency button is available during Calm.");
  }

  kill(stealth = false) {
    void this.audio.unlock();
    if (this.human.role !== "IMPOSTOR" || this.phase !== "ORDEAL" || !this.human.alive || this.paused) return;
    if (this.killUsedThisOrdeal) {
      this.flashMessage("Your single strike is already spent for this Ordeal.");
      return;
    }
    if (this.elapsed < this.killCooldownUntil) return;
    if (stealth && (this.elapsed < this.stealthUntil || this.ordealNumber < this.stealthAvailableOrdeal)) { this.flashMessage("Veiled Bite is recovering. Use your normal strike instead."); return; }
    if (this.multiplayerClient) {
      const victims = this.players.filter((player) =>
        player.alive
        && player.id !== this.human.id
        && player.role !== "IMPOSTOR"
        && dist(player, this.human) < 84
      );
      const victim = victims.sort((a, b) => dist(a, this.human) - dist(b, this.human))[0];
      if (!victim) {
        this.flashMessage("No Warden in melee range.");
        return;
      }
      this.pendingDevourVictimId = victim.id;
      this.pendingKillStealth = stealth;
      this.multiplayerClient.sendKill(victim.id, stealth ? "STEALTH" : "NORMAL");
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
      this.flashMessage("No Warden in melee range.");
      return;
    }
    this.eliminate(victim, this.human, stealth);
    this.killCooldownUntil = this.elapsed + KILL_COOLDOWN_SECONDS;
    this.flashMessage("Prey devoured. Your jaws are spent until the next Ordeal.");
  }

  eliminate(victim: Player, killer: Player, stealth = false) {
    victim.alive = false;
    victim.working = false;
    victim.vx = 0;
    victim.vy = 0;
    if (killer.id === this.human.id) this.killUsedThisOrdeal = true;
    this.botStrikeSpent.add(killer.id);
    if (stealth) { this.stealthUntil = this.elapsed + STEALTH_COOLDOWN_SECONDS; this.stealthAvailableOrdeal = this.ordealNumber + STEALTH_ORDEAL_LOCKOUT; }
    const body = { id: victim.id, x: victim.x, y: victim.y, color: victim.color, name: victim.name, age: 0 };
    if (stealth) this.pendingBodies.push({ body, at: this.elapsed + STEALTH_BODY_DELAY_SECONDS });
    else this.bodies.push(body);
    this.startDevour(victim.id, victim.x, victim.y, victim.color, killer.id, killer.color);
    if (!stealth) this.onKill({ key: `${victim.id}-${performance.now()}` });
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
    if (!flareLit && isOccludedByObstacle(observer, target, this.obstacles)) return false;
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

  startMeeting(reason: string, reporter: string, bodyReporterId: string | null = null) {
    if (this.paused) return;
    this.resetInput(); this.pairedRituals?.clear();
    this.taskFailure = "";
    this.restoreTrueColors();
    this.cancelPuzzle("");
    for (const player of this.players) player.working = false;
    this.paused = true;
    this.phase = "DISCUSSION";
    const accusations: Record<string, string | null> = {};
    for (const player of this.players) {
      if (player.ai && player.alive) accusations[player.id] = this.primeSuspect(player);
    }
    this.activeMeeting = { reason, reporter, bodyReporterId, candidates: this.players.map((player) => ({ ...player })), accusations };
    this.audio.meetingAlert(reason.includes("PUDDLE") || reason.includes("BODY"));
    this.onMeeting(this.activeMeeting);
    this.emit(true);
  }

  vote(targetId: string | null) {
    if (!this.paused || !this.activeMeeting || this.activeMeeting.tally || this.activeMeeting.votePending || this.activeMeeting.localVote) return;
    if (targetId !== null && !this.players.some(player => player.id === targetId && player.alive)) return;
    this.audio.cue("vote");
    if (this.multiplayerClient) {
      if (!this.human.alive) return;
      this.activeMeeting = { ...this.activeMeeting, votePending: true, voteError: "" };
      this.onMeeting(this.activeMeeting);
      this.multiplayerClient.sendVote(targetId);
      return;
    }
    const tally = new Map<string, number>();
    const living = this.players.filter((player) => player.alive);
    const cast = (voter: Player, accusedId: string | null) => {
      const receipt = resolveReporterVote(voter.id, accusedId, living.map(player => player.id), this.activeMeeting?.bodyReporterId, Math.random, this.chaosMoonsway);
      if (voter.id === this.localPlayerId) this.activeMeeting = { ...this.activeMeeting!, localVote: receipt };
      const tallyId = receipt.targetId || "SKIP";
      tally.set(tallyId, (tally.get(tallyId) || 0) + 1);
    };
    if (this.human.alive) cast(this.human, targetId);
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
          cast(voter, null);
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
          cast(voter, null);
          continue;
        }
      }
      if (pick) cast(voter, pick.id);
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
          verdict: ejectionVerdict(ejected.name, ejected.role),
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
    this.pendingBodies = [];
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
      this.phaseTime = CALM_SECONDS;
      this.hazard = nextHazard(this.hazard);
      this.resetStations();
      this.killCooldownUntil = 0;
      this.moonSightUntil = 0;
    }
    this.emit(true);
  }

  checkWin() {
    if (this.multiplayerClient) return false;
    if (this.gameOver) return true;
    const hollows = this.players.filter((player) => player.role === "IMPOSTOR" && player.alive);
    const crewLiving = this.players.filter((player) => player.role === "CREWMATE" && player.alive).length;
    if (!hollows.length) {
      this.end("CREW VICTORY — ALL HOLLOWS WERE EXPOSED");
      return true;
    }
    if (this.taskProgress >= 100) {
      this.end("CREW VICTORY — ALL MOON WARDS RESTORED");
      return true;
    }
    if (hollowVictory(crewLiving, hollows.length, this.initialWardens, this.initialHollows)) {
      this.end("IMPOSTOR VICTORY — THE CREW IS AT PARITY");
      return true;
    }
    return false;
  }

  end(result: string) {
    if (this.gameOver) return;
    this.resetInput();
    this.playResultSound(result);
    this.gameOver = true;
    this.paused = true;
    this.cancelPuzzle("");
    this.onEnd(result);
  }

  private playResultSound(result: string) {
    const crewWon = result.startsWith("CREW VICTORY");
    const won = crewWon === (this.human.role === "CREWMATE");
    this.audio.cue(won ? "victory" : "defeat");
  }

  flashMessage(message: string) {
    this.message = message;
    this.messageUntil = this.elapsed + 3.5;
    this.emit(true);
  }

  snapshot(): Snapshot {
    const nearbyBody = this.bodies.some((body) => dist(body, this.human) < 96);
    const nearButton = this.phase === "CALM" && dist(this.human, CENTER) < 92;
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
      stealthCooldown: Math.ceil(Math.max(0, this.stealthUntil - this.elapsed)),
      stealthOrdealsLeft: Math.max(0, this.stealthAvailableOrdeal - this.ordealNumber),
      taskFailure: this.elapsed < this.taskFailureUntil ? this.taskFailure : "",
      canUseMoonSight: this.human.alive && this.human.role === "IMPOSTOR" && this.phase === "ORDEAL" && !this.moonSightUsedThisOrdeal && !this.abilityPending,
      moonSightActive,
      soundCaption: this.elapsed < this.captionUntil ? this.caption : "",
      canReport: this.human.alive && (nearbyBody || nearButton),
      taskPrompt: Boolean(nearestStation && !nearestStation.completed && !nearestStation.pending && nearestStation.cooldown <= 0) && this.phase !== "DISCUSSION" && this.human.alive,
      taskMode: nearestStation && !nearestStation.completed ? (nearestStation.puzzle ? "PUZZLE" : "HOLD") : null,
      stationStatus: nearestStation ? { label: nearestStation.label, completed: nearestStation.completed, reward: nearestStation.reward, teamRestored: nearestStation.teamRestored, pending: nearestStation.pending } : null,
      rewardNotice: this.rewardNotice && this.elapsed < this.rewardNoticeUntil ? this.rewardNotice : null,
      humanAlive: this.human.alive,
      message: this.elapsed < this.messageUntil ? this.message : "",
      localPlayerId: this.human.id,
      pairRitual: this.pairRitual ?? null,
      locationName: sanctuaryZoneName(this.human.x, this.human.y),
      navigation: {
        x: Math.round(this.human.x / 12) * 12,
        y: Math.round(this.human.y / 12) * 12,
        personalCompleted: this.stations.filter(station => station.completed).map(station => station.label),
        teamRestored: this.stations.filter(station => station.teamRestored).map(station => station.label),
        destinationId: this.destinationId && this.stations.some(station => station.label === this.destinationId && !station.completed)
          ? this.destinationId
          : preparationStation(this.hazard, this.human, this.stations.filter(station => station.completed).map(station => station.label), this.stations.map(station => ({ ...station, id: station.label }))),
      },
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
    const viewport = { width: this.viewWidth, height: this.viewHeight };
    this.camera = followCamera(this.camera, this.human, viewport, dt, this.reducedMotion);
    this.mouse = viewportToWorld(this.pointerViewport, this.camera, viewport);
    if (this.joystickAim) this.mouse = { x: this.human.x + this.joystickAim.x * 200, y: this.human.y + this.joystickAim.y * 200 };
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
    if (!this.multiplayerClient) {
      this.wardSettleTimer += dt;
      if (this.wardSettleTimer >= WARD_SETTLE_SECONDS) {
        this.wardSettleTimer %= WARD_SETTLE_SECONDS;
        this.taskProgress = clamp(Math.round((this.taskProgress + this.pendingWardDelta) * 10) / 10, 0, 100);
        this.pendingWardDelta = 0;
        if (this.checkWin()) return;
      }
      for (const entry of this.pendingBodies.filter(entry => entry.at <= this.elapsed)) { this.bodies.push(entry.body); this.onKill({ key: `${entry.body.id}-delayed` }); }
      this.pendingBodies = this.pendingBodies.filter(entry => entry.at > this.elapsed);
    }
    if (this.multiplayerClient) {
      this.phaseTime = Math.max(0, this.phaseTime - dt);
    } else {
      this.phaseTime -= dt;
      if (this.phaseTime <= 0) {
        if (this.phase === "CALM") {
          this.phase = "COUNTDOWN";
          this.phaseTime = 3;
          this.phantomRoutes = phantomPaths(Math.floor(Math.random() * 4294967296));
          this.flashMessage(`${HAZARD_LABELS[this.hazard]} INCOMING — prepare your gear and position.`);
        } else if (this.phase === "COUNTDOWN") {
          this.audio.cue("ordeal-start");
          this.restoreTrueColors();
          this.phase = "ORDEAL";
          this.phaseTime = ordealDuration(this.hazard);
          this.killCooldownUntil = 0;
          this.killUsedThisOrdeal = false;
          this.botStrikeSpent.clear(); this.ordealNumber += 1;
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
          this.audio.cue("calm");
          this.phase = "CALM";
          this.phaseTime = CALM_SECONDS;
          this.hazard = nextHazard(this.hazard);
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
    this.updatePairedRituals(dt);
    // Only the local slime gets a soft movement texture. Remote sounds remain
    // the server's range-limited anonymous cues, never a second location feed.
    const stepDistance = Math.hypot(this.human.x - this.localStep.x, this.human.y - this.localStep.y);
    if (this.localStep.at < 0 || stepDistance > 80) {
      this.localStep = { x: this.human.x, y: this.human.y, at: this.elapsed };
    } else if (this.human.alive && this.elapsed - this.localStep.at > .28 && stepDistance > 26) {
      this.audio.cue("step");
      this.localStep = { x: this.human.x, y: this.human.y, at: this.elapsed };
    }

    if (this.multiplayerClient) {
      for (const p of this.players) {
        if (p.id === this.localPlayerId) continue;
        const sample = this.movementBuffer.sample(p.id, performance.now());
        if (sample) {
          const predX = clamp(sample.x, ROOM.left + 36, ROOM.right - 36);
          const predY = clamp(sample.y, ROOM.top + 48, ROOM.bottom - 32);
          // Remote roles stay private. Render the authoritative movement rather
          // than incorrectly applying Warden walls to an allowed Rootwalk.
          p.targetX = predX;
          p.targetY = predY;
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

  updatePairedRituals(dt: number) {
    if (!this.pairedRituals) return;
    if (!this.human.alive || this.phase === "DISCUSSION" || this.roleRevealActive || this.navigationOpen || this.notebookOpen || this.activePuzzle || this.paused) {
      this.setPairRitual(false); this.pairedRituals.clear(); return;
    }
    const station = this.stations.find(station => station.label === this.pairStationId && !station.completed && !station.pending);
    if (this.pairStationId && (!station || dist(station, this.human) > 84)) this.setPairRitual(false);
    if (station && this.pairStationId && this.elapsed >= this.pairHeartbeatAt) {
      this.pairHeartbeatAt = this.elapsed + .25;
      if (this.multiplayerClient) this.multiplayerClient.pairRitual(station.label, true, this.stationRound);
      else this.pairedRituals.hold(this.human.id, station.label, this.stationRound, this.elapsed * 1000);
    }
    if (this.multiplayerClient) return;
    const result = this.pairedRituals.tick(this.players, this.stations.map(station => ({ ...station, id: station.label })), (id, label) => id === this.human.id ? this.stations.some(station => station.label === label && station.completed) : this.botRites.get(id)?.has(label) ?? false, this.stationRound, this.elapsed * 1000, dt);
    for (const { playerId, ...ritual } of result.updates) if (playerId === this.human.id) this.pairRitual = ritual.participants ? ritual : null;
    for (const point of result.sounds) this.hearRitual(point);
    for (const completion of result.completions) {
      const actor = this.players.find(player => player.id === completion.playerId), shrine = this.stations.find(station => station.label === completion.stationId);
      if (!actor || !shrine) continue;
      if (actor.id === this.human.id) { this.completeStation(shrine, actor.role === "IMPOSTOR"); this.setPairRitual(false); }
      else this.completeBotRitual(actor, shrine);
    }
  }

  private completeBotRitual(player: Player, station: Station) {
    let rites = this.botRites.get(player.id);
    if (!rites) { rites = new Set(); this.botRites.set(player.id, rites); }
    if (rites.has(station.label)) return;
    rites.add(station.label); this.botWork.delete(player.id);
    player.working = false;
    player.gearCharges[station.reward] = Math.min(3, player.gearCharges[station.reward] + 1);
    station.completedAt = this.elapsed;
    if (player.role === "IMPOSTOR" || !this.wardClaims.has(station.label)) {
      if (player.role === "CREWMATE") this.wardClaims.add(station.label);
      station.teamRestored = true;
      this.pendingWardDelta += ritualProgress(this.players.filter(p => p.alive && p.role === "CREWMATE").length, this.phase === "ORDEAL", player.role === "IMPOSTOR", this.initialHollows);
    }
    player.atStation = (player.atStation + 1) % this.stations.length;
    player.thinkAt = 0;
  }

  updateHuman(dt: number) {
    const player = this.human;
    if (!player.alive) {
      player.working = false;
      return;
    }
    if (this.multiplayerClient && !this.multiplayerClient.connected) { player.vx = 0; player.vy = 0; player.working = false; return; }
    if (this.navigationOpen || this.notebookOpen) { player.vx = 0; player.vy = 0; player.working = false; return; }
    player.flashlight = this.phase === "ORDEAL" && this.selectedItem === "FLASHLIGHT" && this.elapsed < this.itemActiveUntil;
    if (this.activePuzzle) {
      player.vx = 0;
      player.vy = 0;
      player.working = true;
      return;
    }
    const pressed = (code: string) => this.keys.has(code) || this.touchKeys.has(code);
    const invert = this.phase === "ORDEAL" && this.hazard === "MIRROR_POOL";
    const input = movementVector(Number(pressed("KeyD") || pressed("ArrowRight")) - Number(pressed("KeyA") || pressed("ArrowLeft")), Number(pressed("KeyS") || pressed("ArrowDown")) - Number(pressed("KeyW") || pressed("ArrowUp")), this.moveVector, invert);
    const dx = input.vx, dy = input.vy;
    if (this.pairStationId && !dx && !dy) { player.vx = 0; player.vy = 0; player.working = true; return; }
    if (this.pairStationId && (dx || dy)) this.setPairRitual(false);
    const speed = 184;
    player.vx += (dx * speed - player.vx) * Math.min(1, dt * 12);
    player.vy += (dy * speed - player.vy) * Math.min(1, dt * 12);
    if (!dx) player.vx *= Math.pow(0.004, dt);
    if (!dy) player.vy *= Math.pow(0.004, dt);
    const intendedX = player.x + player.vx * dt;
    const intendedY = player.y + player.vy * dt;
    const nextX = clamp(intendedX, PLAYER_BOUNDS.left, PLAYER_BOUNDS.right);
    const nextY = clamp(intendedY, PLAYER_BOUNDS.top, PLAYER_BOUNDS.bottom);
    const impostorPhasing = this.phase === "ORDEAL" && this.hazard === "ROOTWAKE" && player.role === "IMPOSTOR";
    const rootChecked = rootwakeStrength(this.phase, this.hazard, this.phaseTime) > 0.72 && !impostorPhasing
      ? keepInRootCell(player, { x: nextX, y: nextY })
      : { x: nextX, y: nextY };
    const vx = rootChecked.x !== intendedX ? 0 : player.vx;
    const vy = rootChecked.y !== intendedY ? 0 : player.vy;
    const next = impostorPhasing
      ? { ...rootChecked, vx, vy }
      : resolveObstacleMovement(rootChecked.x, rootChecked.y, vx, vy, 22, this.obstacles);
    player.vx = next.vx;
    player.vy = next.vy;
    player.x = next.x;
    player.y = next.y;

    const station = this.stations.find((entry) => dist(entry, player) < 84 && !entry.completed && !entry.pending && entry.cooldown <= 0);
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
      let personalRites = this.botRites.get(player.id);
      if (!personalRites) { personalRites = new Set(); this.botRites.set(player.id, personalRites); }
      const discoveredBody = this.bodies.find((body) => dist(player, body) < 72);
      if (discoveredBody && Math.random() < dt * (player.role === "IMPOSTOR" ? 0.18 : 0.7)) {
        this.startMeeting(`${discoveredBody.name.toUpperCase()} WAS FOUND AS A JELLY PUDDLE`, player.name.toUpperCase(), player.id);
        return;
      }
      if (this.elapsed > player.thinkAt || dist(player, { x: player.targetX, y: player.targetY }) < 22) {
        player.thinkAt = this.elapsed + 1.2 + Math.random() * 2.2;
        if (this.phase === "CALM" || this.phase === "COUNTDOWN" || (this.phase === "ORDEAL" && player.role === "CREWMATE" && Math.random() < 0.65)) {
          if (personalRites.has(this.stations[player.atStation % this.stations.length].label)) {
            const nextAvailable = this.stations.findIndex(station => !personalRites!.has(station.label));
            if (nextAvailable >= 0) player.atStation = nextAvailable;
          }
          const station = this.stations[player.atStation % this.stations.length];
          player.targetX = station.x;
          player.targetY = station.y + (station.side === "top" ? 48 : station.side === "bottom" ? -48 : 0);
          if (station.side === "left") player.targetX += 48;
          if (station.side === "right") player.targetX -= 48;
        } else if (player.role === "IMPOSTOR" && !this.botStrikeSpent.has(player.id)) {
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

      const rootLocked = rootwakeStrength(this.phase, this.hazard, this.phaseTime) > 0.72 && player.role !== "IMPOSTOR";
      let route = this.botRoutes.get(player.id);
      if (!route || route.targetX !== player.targetX || route.targetY !== player.targetY || route.root !== rootLocked) {
        route = { targetX: player.targetX, targetY: player.targetY, root: rootLocked, points: planRoute(player, { x: player.targetX, y: player.targetY }, rootLocked, this.obstacles) };
        this.botRoutes.set(player.id, route);
      }
      while (route.points.length > 1 && dist(player, route.points[0]) < 20) route.points.shift();
      const waypoint = route.points[0] ?? player;
      const dx = waypoint.x - player.x;
      const dy = waypoint.y - player.y;
      const length = Math.hypot(dx, dy) || 1;
      const speed = player.role === "IMPOSTOR" && this.phase === "ORDEAL" ? 148 : 122;
      const riteStation = this.stations[player.atStation % this.stations.length];
      const holdingRite = this.phase !== "DISCUSSION"
        && !personalRites.has(riteStation.label) && dist(player, riteStation) < 84;
      if (holdingRite) {
        player.vx = 0;
        player.vy = 0;
      } else {
        player.vx += ((dx / length) * speed - player.vx) * Math.min(1, dt * 5);
        player.vy += ((dy / length) * speed - player.vy) * Math.min(1, dt * 5);
      }
      const nextX = clamp(player.x + player.vx * dt, ROOM.left + 36, ROOM.right - 36);
      const nextY = clamp(player.y + player.vy * dt, ROOM.top + 48, ROOM.bottom - 32);
      const impostorPhasing = this.phase === "ORDEAL" && this.hazard === "ROOTWAKE" && player.role === "IMPOSTOR";
      const rootChecked = rootwakeStrength(this.phase, this.hazard, this.phaseTime) > 0.72 && !impostorPhasing
        ? keepInRootCell(player, { x: nextX, y: nextY })
        : { x: nextX, y: nextY };
      const next = impostorPhasing ? rootChecked : resolveObstaclePosition(rootChecked.x, rootChecked.y, 22, this.obstacles);
      if (next.x !== nextX) player.vx *= -0.18;
      if (next.y !== nextY) player.vy *= -0.18;
      player.x = next.x;
      player.y = next.y;

      player.working = false;
      if (this.phase !== "DISCUSSION") {
        const station = this.stations[player.atStation % this.stations.length];
        if (personalRites.has(station.label)) {
          player.atStation = (player.atStation + 1) % this.stations.length;
          this.botWork.delete(player.id);
        } else if (dist(player, station) < 84) {
          player.working = true;
          if (this.pairedRituals?.intents.get(this.human.id)?.stationId === station.label) {
            this.pairedRituals.hold(player.id, station.label, this.stationRound, this.elapsed * 1000);
            continue;
          }
          const work = this.botWork.get(player.id);
          const duration = work?.station === station.label ? work.duration + dt : dt;
          this.botWork.set(player.id, { station: station.label, duration });
          if (duration >= 2.6) {
            this.completeBotRitual(player, station);
          }
        } else {
          this.botWork.delete(player.id);
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
        if (player.role === "IMPOSTOR" && !this.botStrikeSpent.has(player.id) && this.phaseTime < ordealDuration(this.hazard) - 1.6) {
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
    const dpr = this.canvas.width / this.viewWidth;
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.viewWidth, this.viewHeight);
    ctx.save();
    ctx.translate(-this.camera.x, -this.camera.y);
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
      ...this.obstacles.map((obstacle): RenderItem => ({ kind: "OBSTACLE", y: obstacle.y, obstacle })),
    ].sort((a, b) => a.y - b.y);
    const sonarActive = this.selectedItem === "SONAR" && this.elapsed < this.itemActiveUntil;
    for (const entry of ordered) {
      const point = entry.kind === "PLAYER" ? entry.player : entry.obstacle;
      // Leave enough margin for crowns, labels, canopies, and bounce. This is
      // rendering-only: all offscreen physics and visibility still simulate.
      if (point.x < this.camera.x - 160 || point.x > this.camera.x + this.viewWidth + 160 || point.y < this.camera.y - 160 || point.y > this.camera.y + this.viewHeight + 160) continue;
      if (entry.kind === "OBSTACLE") {
        this.drawObstacle(ctx, entry.obstacle);
        continue;
      }
      const { player } = entry;
      if (entry.phantom) {
        this.drawSlime(ctx, player, true, false, false, moonSightActive ? 0.25 : 0.78);
        if (moonSightActive || (sonarActive && dist(this.human, player) <= HEARING_RANGE)) this.drawPhantomMarker(ctx, player);
        continue;
      }
      const isLocal = player.id === this.localPlayerId;
      const occludedBehindCover = !isLocal && !moonSightActive && isOccludedByObstacle(this.human, player, this.obstacles) && !this.flares.some((f) => dist(f, player) < 146);
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
    // Draw state badges above actors, but beneath visibility masks so a sealed
    // shrine stays readable without exposing other Rootwake chambers.
    for (const station of this.stations) {
      drawSanctumStatus(ctx, station, this.elapsed, this.phase === "DISCUSSION", dist(station, this.human) < 128);
    }
    if (!moonGlareActive) this.drawLighting(ctx);
    this.drawParticles(ctx);
    this.drawSonarEchoes(ctx);
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
    ctx.restore();
    this.drawCanvasLabels(ctx);
  }

  drawSonarEchoes(ctx: CanvasRenderingContext2D) {
    if (this.phase !== "ORDEAL" || !this.human.alive || this.selectedItem !== "SONAR" || this.elapsed >= this.itemActiveUntil) return;
    const sweep = (this.elapsed * 1.4) % 1;
    // Brief neutral movement contacts, never another player's identity or a
    // body. The navigation map deliberately never receives these contacts.
    if (sweep > 0.65) return;
    const contacts = this.hazard === "PHANTOMS" ? [...this.players, ...this.getPhantoms()] : this.players;
    ctx.save();
    ctx.strokeStyle = "#d9ecff";
    ctx.fillStyle = "#d9ecff";
    ctx.globalAlpha = (1 - sweep / 0.65) * 0.8;
    ctx.lineWidth = 2;
    for (const contact of contacts) {
      if (!contact.alive || contact.id === this.localPlayerId || Math.hypot(contact.vx, contact.vy) < 8 || dist(this.human, contact) > HEARING_RANGE) continue;
      if (this.hazard === "ROOTWAKE" && !sharesRootCell(this.human, contact)) continue;
      ctx.beginPath();
      ctx.arc(contact.x, contact.y + 5, 15 + sweep * 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(contact.x, contact.y + 5, 3, 0, Math.PI * 2);
      ctx.fill();
    }
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
      ctx.fillText(`CELL ${cell.index + 1}  •  THE HOLLOW ROOTWALK (FULL MAP VISION • PASS THROUGH ROOTS)`, ROOM.left + 16, ROOM.top + 24);
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
    this.bgCtx.save(); this.bgCtx.strokeStyle = "rgba(210,221,178,.13)"; this.bgCtx.lineWidth = 40; this.bgCtx.lineCap = "round";
    for (const station of this.stations) {
      const path = planRoute(CENTER, station, false, this.obstacles);
      this.bgCtx.beginPath(); this.bgCtx.moveTo(CENTER.x, CENTER.y);
      for (const point of path) this.bgCtx.lineTo(point.x, point.y);
      this.bgCtx.stroke();
    }
    this.bgCtx.restore();
  }


  drawRoom(ctx: CanvasRenderingContext2D) {
    // 1. Blit the pre-rendered static mountain sanctuary in 0.05ms
    ctx.drawImage(this.bgCanvas, 0, 0);
    this.drawRestoration(ctx);

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
    if (this.pairRitual?.stationId === station.label && this.pairRitual.participants > 0) {
      ctx.save(); ctx.strokeStyle = "#e4d3f3a0"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(station.x, station.y + 18, 57, 24, 0, -.5 * Math.PI, -.5 * Math.PI + Math.max(.04, this.pairRitual.progress) * Math.PI * 2); ctx.stroke(); ctx.restore();
    }
  }

  drawRestoration(ctx: CanvasRenderingContext2D) {
    const milestone = Math.min(4, Math.floor(this.taskProgress / 25));
    ctx.save();
    for (let i = 0; i < 4; i++) {
      const angle = Math.PI / 4 + i * Math.PI / 2;
      const x = CENTER.x + Math.cos(angle) * 115, y = CENTER.y + Math.sin(angle) * 78;
      const lit = i < milestone;
      ctx.fillStyle = lit ? "#cfe9b7" : "#4f6766";
      ctx.strokeStyle = lit ? "#e8e1ae" : "#82988a";
      ctx.lineWidth = lit ? 3 : 1;
      ctx.beginPath(); ctx.ellipse(x, y, 12, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (lit) {
        ctx.fillStyle = "#c3e9ac24";
        ctx.beginPath(); ctx.ellipse(x, y, 35, 24, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  drawEmergency(ctx: CanvasRenderingContext2D) {
    ctx.save(); ctx.translate(CENTER.x, CENTER.y);
    const nearby = dist(this.human, CENTER) < 92 && this.phase === "CALM";
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
    if (this.phase === "CALM" && !silhouette && !colorMuted) {
      drawGroundResponse(ctx, x, player.y, speed, this.elapsed, this.reducedMotion);
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
    drawAccessory(ctx, hat, x, y, muted);
  }

  drawDevourEffect(ctx: CanvasRenderingContext2D, event: DevourEvent, silhouette = false, killer?: Player, muted = false, alpha = 1) {
    drawSlimeConsumption(ctx, event, (this.elapsed - event.startedAt) / event.duration, {
      concealed: silhouette || !event.killerId,
      muted,
      alpha,
      reducedMotion: this.reducedMotion,
      returnTo: killer,
      motion: killer ? this.slimeAnimator.sample(killer, this.elapsed, this.reducedMotion) : undefined,
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
      for (const obs of this.obstacles) {
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
    mask.setTransform(1, 0, 0, 1, 0, 0);
    mask.clearRect(0, 0, this.viewWidth, this.viewHeight);
    mask.setTransform(1, 0, 0, 1, -this.camera.x, -this.camera.y);
    mask.globalCompositeOperation = "source-over";
    mask.fillStyle = moonSightActive
      ? "rgba(28,4,42,.44)"
      : this.hazard === "BLACKOUT"
        ? "rgba(1,3,9,.992)"
        : "rgba(177,202,209,.82)";
    mask.fillRect(this.camera.x, this.camera.y, this.viewWidth, this.viewHeight);
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
        for (const obs of this.obstacles) {
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
    ctx.drawImage(this.mask, this.camera.x, this.camera.y);

    // Subtle cyan wash over blinking crystals during Blackout
    if (this.hazard === "BLACKOUT") {
      for (const obs of this.obstacles) {
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
    drawForestObstacle(ctx, obs, this.elapsed, this.human, this.reducedMotion, obs.kind === "CRYSTAL_SPIRE" ? this.getCrystalBlink(obs.x) : 0);
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
    ctx.roundRect(this.viewWidth / 2 - zoneWidth / 2, this.viewHeight - 35, zoneWidth, 22, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(218, 242, 226, 0.9)";
    ctx.textAlign = "left";
    ctx.fillText(zoneText, this.viewWidth / 2 - zoneWidth / 2 + 9, this.viewHeight - 20);
    ctx.restore();

    if (this.phase === "COUNTDOWN") {
      // The accessible HTML preparation banner leaves the paths and cell warnings visible.
      ctx.fillStyle = "#e4edc7";
      ctx.font = "700 13px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText("MEMORIZE NEARBY WARDENS • PREPARE YOUR GEAR", this.viewWidth / 2, this.viewHeight - 48);
    }
    if (this.phase === "CALM" && this.human.trueColor && this.human.color !== this.human.trueColor) {
      ctx.fillStyle = "rgba(139,233,253,.95)";
      ctx.font = "900 12px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText("MIRROR GLAMOUR • SWAPPED COLOR PERSISTS UNTIL MEETING", this.viewWidth / 2, this.viewHeight - 49);
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
      ctx.fillText(label, this.viewWidth / 2, this.viewHeight - 49);
    }
  }
}

function Logo() {
  return (
    <div className="brand" aria-label="Moonwarden">
      <span className="brand-mark"><i /><i /><i /></span>
      <div className="brand-copy">
        <span className="brand-name">MOON<b>WARDEN</b></span>
        <small className="release-badge" data-game-version={GAME_RELEASE_VERSION} title={`Release ${GAME_RELEASE_VERSION}. Multiplayer compatibility: ${GAME_WORLD_VERSION}.`}>{GAME_RELEASE_LABEL}</small>
      </div>
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
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = ref.current?.getContext("2d");
    if (!context) return;
    const { width, height, anchorX, anchorY, pixelRatio } = ACCESSORY_FRAME;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);
    drawAccessory(context, hat, anchorX, anchorY);
  }, [hat]);
  return <canvas ref={ref} width={ACCESSORY_FRAME.width * ACCESSORY_FRAME.pixelRatio} height={ACCESSORY_FRAME.height * ACCESSORY_FRAME.pixelRatio} className={`slime-hat-svg hat-${hat}`} aria-hidden="true" />;
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
    "Wait—can The Hollow squeeze through root cages?!",
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
  onLaunch: (count: number, role: RoleChoice, profile: SoloProfile, hollowCount: number, chaosMoonsway: boolean) => void;
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
  const [hollowCount, setHollowCount] = useState(1);
  const [chaosMoonsway, setChaosMoonsway] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hideRoomCode, setHideRoomCode] = useState(false);
  const [editingInRoom, setEditingInRoom] = useState(true);
  const [lobbyChatDraft, setLobbyChatDraft] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRefreshingRooms, setIsRefreshingRooms] = useState(false);
  const [roomsChecked, setRoomsChecked] = useState(false);
  const [mpError, setMpError] = useState("");
  const lobbyConsoleRef = useRef<HTMLDivElement>(null);
  const roomAttemptRef = useRef<{ entry: "create" | "join" } | null>(null);

  const inRoom = Boolean(mpState?.roomCode);
  const activeTargetPlayers = inRoom && mpState ? mpState.targetPlayers : targetPlayers;
  const activeBotFill = inRoom && mpState ? mpState.botFill : botFill;
  const activeHollowCount = inRoom && mpState ? mpState.hollowCount : hollowCount;
  const activeChaosMoonsway = inRoom && mpState ? mpState.chaosMoonsway : chaosMoonsway;
  const roomPopulation = activeBotFill ? activeTargetPlayers : mpState?.players.length ?? 4;
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
      if (message.type === "ROOM_STATE") {
        setRoomsChecked(false);
        const attempt = roomAttemptRef.current;
        if (attempt && message.roomCode) {
          roomAttemptRef.current = null;
          trackGameEvent("room_entered", {
            mode: "multiplayer",
            entry: attempt.entry,
            player_count: message.players.length,
          });
        }
      }
      if (message.type === "ERROR_ALERT" && roomAttemptRef.current) {
        const attempt = roomAttemptRef.current;
        roomAttemptRef.current = null;
        if (attempt.entry === "join") {
          trackGameEvent("room_join_failed", { mode: "multiplayer", reason: "rejected" });
        }
      }
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
      onLaunch(players, role, launchProfile, clampHollowCount(hollowCount, players), chaosMoonsway);
    }, 380);
  };

  const handleCreateRoom = async () => {
    if (!multiplayerClient) return;
    const attempt = { entry: "create" as const };
    roomAttemptRef.current = attempt;
    trackGameEvent("room_create_attempt", { mode: "multiplayer" });
    setMpError("");
    multiplayerClient.clearError();
    setIsConnecting(true);
    try {
      await multiplayerClient.connect();
      const callsign = availablePlayerName(nickname, []);
      setNickname(callsign);
      multiplayerClient.createRoom(callsign, selectedColor, selectedHat, selectedEyes);
    } catch (error) {
      if (roomAttemptRef.current === attempt) {
        roomAttemptRef.current = null;
      }
      setMpError(error instanceof Error ? error.message : "Failed to connect to game server. Please retry.");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleJoinRoom = async (codeOverride?: string) => {
    const codeToJoin = (codeOverride ?? joinCode).trim().toUpperCase();
    if (!multiplayerClient || !codeToJoin) return;
    const attempt = { entry: "join" as const };
    roomAttemptRef.current = attempt;
    trackGameEvent("room_join_attempt", { mode: "multiplayer", method: codeOverride ? "list" : "code" });
    setMpError("");
    multiplayerClient.clearError();
    setIsConnecting(true);
    try {
      await multiplayerClient.connect();
      const callsign = availablePlayerName(nickname, []);
      setNickname(callsign);
      multiplayerClient.joinRoom(codeToJoin, callsign, selectedColor, selectedHat, selectedEyes);
    } catch (error) {
      if (roomAttemptRef.current === attempt) {
        roomAttemptRef.current = null;
        trackGameEvent("room_join_failed", { mode: "multiplayer", reason: "connection" });
      }
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

  const handleHostConfigUpdate = (nextTarget: number, nextBotFill: boolean, nextHollows = activeHollowCount, nextChaos = activeChaosMoonsway) => {
    setTargetPlayers(nextTarget);
    setBotFill(nextBotFill);
    if (inRoom && mpState?.isHost && multiplayerClient) {
      multiplayerClient.updateRoomConfig(nextTarget, nextBotFill, nextHollows, nextChaos);
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
          <p className="lede">Your friends. A magical forest.<br className="home-copy-break" /> One friend is secretly The Hollow.</p>
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
            <div><span>03</span><p><b>Discuss. Vote. Repeat.</b><small>Uncover The Hollow hiding in your circle.</small></p></div>
          </details>
          <div className="home-game-tags" aria-label="About the game">
            <span>4–8 wardens</span><span>One hidden Hollow</span><span>Play in your browser</span>
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
                <label className="field-label" htmlFor="solo-hollow-count">HOLLOWS <span>DEFAULT 1 · MAX HALF THE CIRCLE</span></label>
                <select id="solo-hollow-count" className="mp-field" value={clampHollowCount(hollowCount, players)} onChange={event => setHollowCount(Number(event.target.value))}>
                  {Array.from({ length: Math.floor(players / 2) }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1} {i ? "Hollows" : "Hollow"}</option>)}
                </select>
                <label className="chaos-setting"><input type="checkbox" checked={chaosMoonsway} onChange={event => setChaosMoonsway(event.target.checked)} /><span>Chaos · Moonsway<small>Optional: body reporters have a 25% chance of a redirected vote. Off by default.</small></span></label>
                <div className="role-switch" role="group" aria-label="Choose test role">
                  {(["RANDOM", "CREWMATE", "IMPOSTOR"] as RoleChoice[]).map((value) => (
                    <button key={value} className={role === value ? "active" : ""} onClick={() => { playLobbySfx("switch", 1); setRole(value); }}>{value === "RANDOM" ? "AUTO" : ROLE_LABELS[value].toUpperCase()}</button>
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
                    <label className="field-label" htmlFor="mp-hollow-count">HOLLOWS <span>1–{Math.max(1, Math.floor(roomPopulation / 2))} · DEFAULT 1</span></label>
                    <select id="mp-hollow-count" className="mp-field" value={clampHollowCount(activeHollowCount, roomPopulation)} onChange={event => handleHostConfigUpdate(activeTargetPlayers, activeBotFill, Number(event.target.value))}>
                      {Array.from({ length: Math.max(1, Math.floor(roomPopulation / 2)) }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1} {i ? "Hollows" : "Hollow"}</option>)}
                    </select>
                    {activeHollowCount * 2 === roomPopulation && <p className="role-note">High difficulty: half the circle is Hollow. The opening tie does not end the match.</p>}
                    <label className="chaos-setting"><input type="checkbox" checked={activeChaosMoonsway} onChange={event => handleHostConfigUpdate(activeTargetPlayers, activeBotFill, activeHollowCount, event.target.checked)} /><span>Chaos · Moonsway<small>Optional vote shifting for body reporters. Off by default; applies to everyone.</small></span></label>
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
                      onClick={() => multiplayerClient?.startMatch(activeBotFill, activeTargetPlayers, activeHollowCount, activeChaosMoonsway)}
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
                    <p>{activeChaosMoonsway ? "CHAOS MOONSWAY ON · body-reporter votes may shift" : "STANDARD VOTING · your vote stays on your choice"}</p>
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
                <div className="home-entry-column">
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
                </div>

                <div className="home-social-column">
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
                                {room.botFill ? "• AI Bot Fill" : "• Humans Only"}{room.chaosMoonsway ? " • Chaos Moonsway" : " • Standard votes"}
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

function Game({
  count,
  roleChoice,
  soloProfile,
  multiplayerClient,
  initialPlayers,
  assignedRole,
  layoutSeed = 0,
  hollowCount = 1,
  hollowAllies,
  chaosMoonsway = false,
  onExit,
  onMatchComplete,
}: {
  count: number;
  roleChoice: RoleChoice;
  soloProfile?: SoloProfile;
  multiplayerClient?: MultiplayerClient | null;
  initialPlayers?: NetPlayer[];
  assignedRole?: Role;
  layoutSeed?: number;
  hollowCount?: number;
  hollowAllies?: string[];
  chaosMoonsway?: boolean;
  onExit: () => void;
  onMatchComplete: (result: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const [mapLayout] = useState(() => createMatchLayout(layoutSeed));
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
  const [navigationExpanded, setNavigationExpanded] = useState(false);
  const [notebookOpen, setNotebookOpen] = useState(false);
  const [observations, setObservations] = useState<ObservationNote[]>([]);
  const [knownNames, setKnownNames] = useState<KnownName[]>([]);

  useEffect(() => {
    const unsubscribe = multiplayerClient?.onStateChange(setNetworkState);
    return () => { unsubscribe?.(); };
  }, [multiplayerClient]);

  useEffect(() => {
    if (!canvasRef.current) return;
    let discussionCandidates: Player[] | null = null;
    const handleMeeting = (next: Meeting | null) => {
      setMeeting(next);
      if (!next) {
        discussionCandidates = null;
        meetingSerialRef.current += 1;
        setChatMessages([]);
        setChatDraft("");
      } else if (!next.tally && next.candidates !== discussionCandidates) {
        discussionCandidates = next.candidates;
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
      (nextResult) => {
        onMatchComplete(nextResult);
        setResult(nextResult);
      },
      multiplayerClient,
      initialPlayers,
      assignedRole,
      soloProfile,
      { layoutSeed, hollowCount, hollowAllies, chaosMoonsway },
    );
    engineRef.current = engine;
    setKnownNames(engine.players.map(({ id, name }) => ({ id, name })));
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
  }, [count, roleChoice, multiplayerClient, initialPlayers, assignedRole, soloProfile, layoutSeed, hollowCount, hollowAllies, chaosMoonsway, onMatchComplete]);

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
    if (soundEnabled) void engineRef.current?.audio.unlock().then((ready) => { if (ready) engineRef.current?.audio.cue("ui"); });
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
  const handleMoveVector = useCallback((vector: MoveVector) => engineRef.current?.setMoveVector(vector), []);
  const handleDestinationChange = useCallback((id: string) => engineRef.current?.setNavigationDestination(id), []);
  const handleNavigationExpanded = useCallback((open: boolean) => { setNavigationExpanded(open); engineRef.current?.setNavigationOpen(open); }, []);
  const handleNotebookOpen = useCallback((open: boolean) => { setNotebookOpen(open); engineRef.current?.setNotebookOpen(open); }, []);
  const recordObservation = useCallback((note: ObservationNote) => setObservations(previous => [note, ...previous].slice(0, 8)), []);
  const toggleBackgroundMusic = () => {
    if (musicEnabled) {
      setMusicEnabled(false);
      return;
    }
    setMusicEnabled(true);
    primeBackgroundMusic();
  };

  return (
    <main className="game-shell" onPointerDownCapture={() => { void engineRef.current?.audio.unlock(); }} onKeyDownCapture={() => { void engineRef.current?.audio.unlock(); }}>
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

      <section className="game-stage" ref={stageRef}>
        <canvas ref={canvasRef} aria-label="Top-down view of the Moonwarden mountain sanctuary" />
        <NavigationMap
          position={snapshot.navigation}
          phase={snapshot.phase}
          hazard={snapshot.hazard}
          layoutSeed={layoutSeed}
          stations={mapLayout.stations.map(station => ({ ...station, personalCompleted: snapshot.navigation.personalCompleted.includes(station.id), teamRestored: snapshot.navigation.teamRestored.includes(station.id) }))}
          destinationId={snapshot.navigation.destinationId}
          onDestinationChange={handleDestinationChange}
          onExpandedChange={handleNavigationExpanded}
          enabled={!meeting && !puzzle && !roleReveal && !deathReveal && !result && (!networkState || networkState.connected)}
        />
        <FieldNotebook roster={knownNames} notes={observations} onRecord={recordObservation} open={notebookOpen} onOpenChange={handleNotebookOpen} enabled={snapshot.humanAlive && !meeting && !puzzle && !roleReveal && !deathReveal && !result && !navigationExpanded && (!networkState || networkState.connected)} />
        {networkState && !networkState.connected && (
          <div className="connection-lost" role="alert">
            <b>CONNECTION LOST</b>
            <p>{networkState.lastError || "Return to the lobby to reconnect with your party."}</p>
            <button type="button" onClick={onExit}>RETURN TO LOBBY</button>
          </div>
        )}

        <div className="task-hud">
          <div className="task-label"><span>RESTORE THE WARDS TO WIN</span><b>{Math.floor(snapshot.taskProgress)}%</b></div>
          <div className="task-track"><i style={{ width: `${snapshot.taskProgress}%` }} /></div>
          <div className="ward-milestones" aria-label="Forest restoration milestones">{[25, 50, 75, 100].map(value => <span key={value} className={snapshot.taskProgress >= value ? "is-restored" : ""}>{snapshot.taskProgress >= value ? "✦" : "◇"}<small>{value}%</small></span>)}</div>
          <div className="ward-restoration-caption">{restorationMilestone(snapshot.taskProgress)}</div>
        </div>

        {snapshot.phase === "CALM" && snapshot.humanAlive && snapshot.role === "CREWMATE" ? (
          <aside className={`warden-preparation${snapshot.stationStatus ? " is-at-shrine" : ""}`} aria-label="Prepare for the next Ordeal">
            <small>NEXT · {HAZARD_LABELS[snapshot.hazard]}</small>
            <b>{ORDEAL_PREPARATION[snapshot.hazard].title}</b>
            <p>{ORDEAL_PREPARATION[snapshot.hazard].reason}</p>
            <span>{snapshot.navigation.destinationId ? `Head to ${snapshot.navigation.destinationId.toLowerCase()}` : "Your ritual kit is complete for this round"}</span>
            <em>YOUR RITES {snapshot.navigation.personalCompleted.length}/6 · M FOR MAP</em>
          </aside>
        ) : null}

        <div className="crew-count"><span className="crew-dot" />{snapshot.living}<small> / {snapshot.total} ALIVE</small></div>
        <div className="current-landmark" aria-label="Your current landmark">⌖ {snapshot.locationName}</div>
        {chaosMoonsway && <div className="chaos-match-badge">CHAOS · MOONSWAY ON</div>}

        {snapshot.role === "IMPOSTOR" && (
          <div className="private-role"><small>PRIVATE ROLE</small><b>{ROLE_LABELS.IMPOSTOR.toUpperCase()}</b><span>Sight V OR Echo C • one special action</span><span>one strike per Ordeal · Veiled Bite X</span><span>{(hollowAllies ?? []).filter(id => id !== snapshot.localPlayerId).map(id => initialPlayers?.find(p => p.id === id)?.name).filter(Boolean).join(", ") || (hollowCount > 1 && !multiplayerClient ? "Other Hollows share your side" : "You hunt alone")}</span></div>
        )}

        {snapshot.message && <div className="toast-message">{snapshot.message}</div>}
        {snapshot.soundCaption && <div className="sound-caption" role="status" aria-live="polite">♬ {snapshot.soundCaption}</div>}
        {snapshot.phase === "COUNTDOWN" && <div className="ordeal-preparation" role="status"><b>{HAZARD_LABELS[snapshot.hazard]} INCOMING</b><span>{snapshot.hazard === "ROOTWAKE" ? "Choose your chamber before the roots seal." : snapshot.hazard === "PHANTOMS" ? "Ready your Echo Bell. Not every shape is real." : snapshot.hazard === "MOONGLARE" ? "Memorize nearby wardens. Identities will disappear." : snapshot.hazard === "MIRROR_POOL" ? "Controls will invert for 25s! Bumping another warden swaps your colors." : "Ready your Glowing Mushroom or Moonblossom."}</span></div>}
        {!snapshot.humanAlive && <div className="spectator-chip">SPECTATING • YOU ARE JELLY</div>}

        {snapshot.rewardNotice && (
          <aside className="reward-toast" aria-live="polite">
            <span className="reward-icon"><ItemIcon item={snapshot.rewardNotice.item} /></span>
            <div><small>{snapshot.rewardNotice.progress ? `${snapshot.rewardNotice.progress > 0 ? "RESTORATION" : "SIPHON"} QUEUED ${Math.abs(snapshot.rewardNotice.progress)}%` : "YOUR RITUAL IS COMPLETE"} • {snapshot.rewardNotice.station}</small><b>{ITEM_LABELS[snapshot.rewardNotice.item]} ready</b><p>{snapshot.role === "IMPOSTOR" ? "Siphon complete. The gauge settles anonymously every four seconds. " : "Gear earned. Shared ward changes settle every four seconds. "}{ITEM_DESCRIPTIONS[snapshot.rewardNotice.item]}.</p></div>
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
          {snapshot.role === "IMPOSTOR" && <button className={`action kill ${snapshot.canKill && !snapshot.stealthCooldown && !snapshot.stealthOrdealsLeft ? "ready" : ""}`} title="Veiled Bite: uses your strike; puddle appears 8s later. Cooldown: 45s and two Ordeal starts." onClick={() => engineRef.current?.kill(true)} disabled={!snapshot.humanAlive || snapshot.phase !== "ORDEAL" || snapshot.killSpent || snapshot.stealthCooldown > 0 || snapshot.stealthOrdealsLeft > 0}><kbd>X</kbd><span>{snapshot.stealthCooldown ? `${snapshot.stealthCooldown}s` : snapshot.stealthOrdealsLeft ? `${snapshot.stealthOrdealsLeft} ORDEALS` : "VEILED BITE"}</span></button>}
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
            <span>{snapshot.taskMode === "PUZZLE" ? (snapshot.role === "IMPOSTOR" ? "OPEN FAKE PUZZLE" : "OPEN QUICK PUZZLE") : (snapshot.role === "IMPOSTOR" ? "HOLD FAKE CALIBRATION" : "HOLD TO CALIBRATE")} • {snapshot.stationStatus?.teamRestored ? "PERSONAL GEAR RITE" : "RESTORE WARD + EARN GEAR"}</span>
          </button>
        )}

        {snapshot.stationStatus?.completed && snapshot.phase !== "DISCUSSION" && (
          <div className="station-sealed-prompt" role="status">
            <span>✓</span><div><b>YOUR RITE IS COMPLETE</b><small>{snapshot.stationStatus.label} reopens next round • your earned gear stays with you</small></div>
          </div>
        )}

        {snapshot.taskPrompt && !puzzle && !roleReveal && <button type="button" className="paired-ritual-button"
          onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); engineRef.current?.setPairRitual(true); }}
          onPointerUp={() => engineRef.current?.setPairRitual(false)} onPointerCancel={() => engineRef.current?.setPairRitual(false)} onLostPointerCapture={() => engineRef.current?.setPairRitual(false)} onBlur={() => engineRef.current?.setPairRitual(false)}
          onKeyDown={event => { if (["Space", "Enter"].includes(event.code)) { event.preventDefault(); engineRef.current?.setPairRitual(true); } }}
          onKeyUp={event => { if (["Space", "Enter"].includes(event.code)) { event.preventDefault(); engineRef.current?.setPairRitual(false); } }}>
          <span><kbd>H</kbd> HOLD TO HARMONIZE</span><small>{snapshot.pairRitual ? `${snapshot.pairRitual.participants}/2 SLIMES · ${Math.round(snapshot.pairRitual.progress * 100)}%` : "Optional paired rite · 2 slimes · makes noise"}</small>
          <i style={{ width: `${(snapshot.pairRitual?.progress ?? 0) * 100}%` }} />
        </button>}
        <FloatingJoystick surfaceRef={stageRef} onVector={handleMoveVector} enabled={snapshot.humanAlive && !meeting && !puzzle && !roleReveal && !deathReveal && !result && !navigationExpanded && !notebookOpen && (!networkState || networkState.connected)} />
      </section>

      <footer className="game-footer">
        <AnalyticsSettingsButton compact />
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
            <p className="reveal-lead">YOU ARE{roleReveal === "CREWMATE" ? " A" : ""}</p>
            <h2 id="role-reveal-title">{ROLE_LABELS[roleReveal].toUpperCase()}</h2>
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
            <p>You now know The Hollow—but the living Wardens cannot hear you.</p>
            <button onClick={dismissDeathReveal}>CONTINUE AS SPECTATOR</button>
          </div>
        </div>
      )}

      {snapshot.taskFailure && snapshot.humanAlive && !puzzle && !deathReveal && !result && snapshot.phase !== "DISCUSSION" && (
        <div className="task-failure-toast" role="alert" aria-atomic="true">
          <span aria-hidden="true">!</span>
          <div><strong>Ritual failed</strong><p>{snapshot.taskFailure}</p></div>
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
              {meeting.localVote && (
                <div className={`vote-receipt ${meeting.localVote.shifted ? "vote-shifted" : ""}`} role="status" aria-live="polite" aria-atomic="true">
                  <strong>{meeting.localVote.shifted ? "☾ MOONSWAY — YOUR VOTE SHIFTED" : "YOUR VOTE IS LOCKED"}</strong>
                  <span>Your vote counts toward {meeting.localVote.targetId ? meeting.candidates.find(player => player.id === meeting.localVote?.targetId)?.name ?? "the departed player" : "Skip"}. {meeting.localVote.shifted ? "The tally uses this destination." : meeting.tally ? "Shown in the final tally." : "Waiting for the circle."}</span>
                </div>
              )}
              {meeting.voteError && <p className="vote-receipt vote-error" role="alert">{meeting.voteError}</p>}
              {meeting.tally ? (
                <div className="vote-tally-screen">
                  <div className={`vote-verdict ${meeting.ejectedId ? "ejected" : "no-ejection"}`}>
                    <small>FINAL VERDICT</small>
                    <h3>{meeting.verdict && meetingVerdictLabel(meeting.verdict)}</h3>
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
                    <MeetingObservations roster={knownNames} notes={observations} onRecord={recordObservation} onDraft={setChatDraft} disabled={!snapshot.humanAlive} />
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
                    {chaosMoonsway && meeting.bodyReporterId ? <p className="moonsway-rule">☾ Chaos Moonsway: the body reporter’s player vote has a {Math.round(REPORTER_VOTE_DRIFT_CHANCE * 100)}% chance to drift. Skip votes are safe.</p> : <p className="moonsway-rule">Standard voting: your vote stays on the player you choose.</p>}
                    {meeting.votePending && <p className="vote-receipt" role="status">Sealing your vote…</p>}
                    <div className="vote-grid">
                      {meeting.candidates.map((player, idx) => {
                        const isYou = player.id === snapshot.localPlayerId;
                        return (
                          <button
                            key={player.id}
                            style={{ "--card-idx": idx } as React.CSSProperties}
                            disabled={!player.alive || isYou || !snapshot.humanAlive || !!meeting.localVote || !!meeting.votePending}
                            onClick={() => engineRef.current?.vote(player.id)}
                          >
                            <span className="vote-slime"><SlimePortrait color={player.alive ? player.color : "#53616b"} eyeStyle={player.eyeStyle} /></span>
                            <b>{player.name}</b><small>{player.alive ? (isYou ? "YOU" : "VOTE") : "ELIMINATED"}</small>
                          </button>
                        );
                      })}
                    </div>
                    <button className="skip-vote" disabled={!!meeting.localVote || !!meeting.votePending || Boolean(multiplayerClient && !snapshot.humanAlive)} onClick={() => engineRef.current?.vote(null)}>{snapshot.humanAlive ? "SKIP VOTE" : "REVEAL CREW VOTE"}</button>
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
            <h2 id="result-title">{matchResultLabel(result)}</h2>
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
    | { mode: "SOLO"; count: number; role: RoleChoice; profile: SoloProfile; hollowCount: number; layoutSeed: number; chaosMoonsway: boolean }
    | { mode: "MULTI"; client: MultiplayerClient; initialPlayers: NetPlayer[]; assignedRole: Role; hollowCount: number; layoutSeed: number; hollowAllies?: string[]; chaosMoonsway: boolean }
    | null
  >(null);

  const [client] = useState(() => new MultiplayerClient());
  const [gameAnalytics] = useState(() => new GameAnalyticsLifecycle());
  const [mpState, setMpState] = useState<MultiplayerState | null>(null);
  const handleMatchComplete = useCallback((result: string) => gameAnalytics.complete(result), [gameAnalytics]);

  useEffect(() => {
    const unsubState = client.onStateChange((next) => {
      setMpState(next);
    });

    const unsubMsg = client.onMessage((msg) => {
      if (msg.type === "MATCH_STARTED") {
        gameAnalytics.start("multiplayer", msg.players.length);
        setMatch({
          mode: "MULTI",
          client,
          initialPlayers: msg.players,
          assignedRole: msg.role,
          layoutSeed: msg.layoutSeed ?? 0,
          hollowCount: msg.hollowCount ?? 1,
          hollowAllies: msg.hollowAllies,
          chaosMoonsway: msg.chaosMoonsway === true,
        });
      }
    });

    return () => {
      unsubState();
      unsubMsg();
      client.disconnect();
    };
  }, [client, gameAnalytics]);

  const handleExit = () => {
    gameAnalytics.leave();
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
      layoutSeed={match.layoutSeed}
      hollowCount={match.hollowCount}
      chaosMoonsway={match.chaosMoonsway}
      hollowAllies={match.mode === "MULTI" ? match.hollowAllies : undefined}
      onExit={handleExit}
      onMatchComplete={handleMatchComplete}
    />
  ) : (
    <Lobby
      onLaunch={(count, role, profile, hollowCount, chaosMoonsway) => {
        gameAnalytics.start("solo", count);
        setMatch({ mode: "SOLO", count, role, profile, hollowCount, chaosMoonsway, layoutSeed: Math.floor(Math.random() * 4294967296) });
      }}
      multiplayerClient={client}
      mpState={mpState}
    />
  );
}
