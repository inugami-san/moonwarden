import type { EyeStyle } from "./appearance";

export type Role = "CREWMATE" | "IMPOSTOR";
export type RoleChoice = Role | "RANDOM";
export type Phase = "CALM" | "COUNTDOWN" | "ORDEAL" | "DISCUSSION";
export type Hazard = "BLACKOUT" | "FOG" | "MOONGLARE" | "ROOTWAKE" | "PHANTOMS" | "MIRROR_POOL";
export type ItemKind = "FLASHLIGHT" | "FLARE" | "SONAR";
export type Hat = "antlers" | "hood" | "moth" | "mooncap";
export type OrdealAbility = "MOON_SIGHT" | "ECHO_LURE";
export type KillStyle = "NORMAL" | "STEALTH";
export type SoundCue = { id: string; x: number; y: number; expiresAt: number };

export type NetPlayer = {
  id: string;
  name: string;
  color: string;
  hat: Hat;
  eyeStyle?: EyeStyle;
  role?: Role;
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  flashlight: boolean;
  working?: boolean;
  isHost: boolean;
  ready?: boolean;
  isAi?: boolean;
  inputSeq?: number;
};

export type NetMovement = Pick<NetPlayer, "id" | "x" | "y" | "vx" | "vy" | "angle" | "alive" | "flashlight" | "working" | "inputSeq">;

export type RoomSummary = {
  code: string;
  hostName: string;
  hostColor: string;
  hostHat: Hat;
  hostEyeStyle?: EyeStyle;
  playerCount: number;
  targetPlayers: number;
  botFill: boolean;
  hollowCount?: number;
};

export type NetBody = {
  id: string;
  x: number;
  y: number;
  color: string;
  name: string;
  age: number;
  delayed?: boolean;
};

export type NetFlare = {
  x: number;
  y: number;
  life: number;
  owner: string;
};

export type NetVoteTally = {
  targetId: string | null;
  targetName: string;
  targetColor: string | null;
  targetEyeStyle?: EyeStyle;
  votes: number;
  isTop: boolean;
};

export type NetChatMessage = {
  id: string;
  playerId: string | null;
  playerName: string;
  playerColor: string | null;
  text: string;
  system?: boolean;
};

export type C2SMessage =
  | { type: "CLIENT_HELLO"; worldVersion: string }
  | { type: "PING"; sentAt: number }
  | { type: "CREATE_ROOM"; playerName: string; color: string; hat: Hat; eyeStyle?: EyeStyle }
  | { type: "JOIN_ROOM"; roomCode: string; playerName: string; color: string; hat: Hat; eyeStyle?: EyeStyle }
  | { type: "UPDATE_PROFILE"; playerName: string; color: string; hat: Hat; eyeStyle?: EyeStyle }
  | { type: "TOGGLE_READY"; ready?: boolean }
  | { type: "UPDATE_ROOM_CONFIG"; targetPlayers: number; botFill: boolean; hollowCount?: number }
  | { type: "LIST_ROOMS" }
  | { type: "START_MATCH"; botFill?: boolean; targetPlayers?: number; hollowCount?: number }
  | { type: "PLAYER_INPUT"; x: number; y: number; vx: number; vy: number; angle: number; flashlight: boolean; working?: boolean; seq?: number }
  | { type: "TRIGGER_KILL"; victimId: string; style?: KillStyle }
  | { type: "TRIGGER_REPORT"; bodyId?: string }
  | { type: "USE_ITEM"; item: ItemKind; x: number; y: number }
  | { type: "USE_ABILITY"; ability: OrdealAbility; x: number; y: number; roundId: number }
  | { type: "TASK_UPDATE"; stationId: string; reward: ItemKind; roundId?: number }
  | { type: "SEND_CHAT"; text: string }
  | { type: "CAST_VOTE"; targetId: string | null }
  | { type: "RESOLVE_MEETING" }
  | { type: "LEAVE_ROOM" };

export type S2CMessage =
  | { type: "SERVER_INFO"; worldVersion: string; compatible: boolean; version?: string }
  | { type: "PONG"; sentAt: number }
  | { type: "ABILITY_STATE"; accepted: boolean; used: boolean; sightRemainingMs: number; roundId: number }
  | { type: "SOUND_CUE"; cue: SoundCue }
  | { type: "KILL_RESULT"; accepted: boolean; spent: boolean; stealthRemainingMs?: number; stealthOrdealsLeft?: number }
  | { type: "STRIKE_STATE"; spent: boolean; stealthRemainingMs: number; stealthOrdealsLeft: number }
  | { type: "GEAR_SYNC"; charges: Record<ItemKind, number>; accepted: boolean; item?: ItemKind; stationId?: string; stationCompleted?: boolean; completedStations?: string[]; wardProgressGain?: number; roundId?: number }
  | { type: "STATION_COMPLETED"; stationId: string; roundId: number; sequence: number }
  | {
      type: "ROOM_STATE";
      roomCode: string;
      playerId: string;
      isHost: boolean;
      players: NetPlayer[];
      state: "LOBBY" | "PLAYING" | "ENDED";
      targetPlayers?: number;
      botFill?: boolean;
      hollowCount?: number;
      chatHistory?: NetChatMessage[];
    }
  | {
      type: "LOBBY_UPDATED";
      players: NetPlayer[];
      targetPlayers: number;
      botFill: boolean;
      hollowCount?: number;
      hostId: string;
    }
  | { type: "ROOMS_LIST"; rooms: RoomSummary[] }
  | { type: "PLAYER_JOINED"; player: NetPlayer }
  | { type: "PLAYER_LEFT"; playerId: string; newHostId?: string }
  | { type: "MATCH_STARTED"; role: Role; players: NetPlayer[]; layoutSeed?: number; hollowCount?: number; hollowAllies?: string[] }
  | { type: "SYNC_PLAYERS"; players: NetPlayer[] }
  | { type: "SYNC_MOVEMENT"; players: NetMovement[]; serverTime: number }
  | {
      type: "SYNC_WORLD";
      phase: Phase;
      time: number;
      hazard: Hazard;
      taskProgress: number;
      bodies: NetBody[];
      flares: NetFlare[];
      completedStations?: string[];
      serverTime?: number;
      roundId?: number;
      ordealSeed?: number;
    }
  | { type: "BODY_SPAWNED"; body: NetBody }
  | { type: "FLARE_SPAWNED"; flare: NetFlare }
  | {
      type: "MEETING_CALLED";
      reason: string;
      reporter: string;
      bodyReporterId?: string | null;
      candidates: NetPlayer[];
    }
  | { type: "CHAT_MESSAGE"; message: NetChatMessage }
  | { type: "VOTE_CAST_ACK"; voterId: string }
  | { type: "VOTE_RECEIPT"; accepted: boolean; targetId: string | null; shifted: boolean }
  | {
      type: "MEETING_CONCLUDED";
      tally: NetVoteTally[];
      ejectedId: string | null;
      verdict: string;
      tied: boolean;
    }
  | { type: "DEATH_EVENT"; killerName: string; killerColor: string }
  | { type: "MATCH_RESULT"; result: string; impostorName: string }
  | { type: "ERROR_ALERT"; message: string };
