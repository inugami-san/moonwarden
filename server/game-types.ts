export type Role = "CREWMATE" | "IMPOSTOR";
export type RoleChoice = Role | "RANDOM";
export type Phase = "CALM" | "COUNTDOWN" | "ORDEAL" | "DISCUSSION";
export type Hazard = "BLACKOUT" | "FOG" | "MOONGLARE" | "ROOTWAKE" | "PHANTOMS";
export type ItemKind = "FLASHLIGHT" | "FLARE" | "SONAR";
export type Hat = "antlers" | "hood" | "moth" | "mooncap";

export type NetPlayer = {
  id: string;
  name: string;
  color: string;
  hat: Hat;
  role?: Role;
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  flashlight: boolean;
  isHost: boolean;
  ready?: boolean;
  isAi?: boolean;
};

export type RoomSummary = {
  code: string;
  hostName: string;
  hostColor: string;
  hostHat: Hat;
  playerCount: number;
  targetPlayers: number;
  botFill: boolean;
};

export type NetBody = {
  id: string;
  x: number;
  y: number;
  color: string;
  name: string;
  age: number;
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
  | { type: "CREATE_ROOM"; playerName: string; color: string; hat: Hat }
  | { type: "JOIN_ROOM"; roomCode: string; playerName: string; color: string; hat: Hat }
  | { type: "UPDATE_PROFILE"; playerName: string; color: string; hat: Hat }
  | { type: "TOGGLE_READY"; ready?: boolean }
  | { type: "UPDATE_ROOM_CONFIG"; targetPlayers: number; botFill: boolean }
  | { type: "LIST_ROOMS" }
  | { type: "START_MATCH"; botFill?: boolean; targetPlayers?: number }
  | { type: "PLAYER_INPUT"; x: number; y: number; vx: number; vy: number; angle: number; flashlight: boolean }
  | { type: "TRIGGER_KILL"; victimId: string }
  | { type: "TRIGGER_REPORT"; bodyId?: string }
  | { type: "USE_ITEM"; item: ItemKind; x: number; y: number }
  | { type: "TASK_UPDATE"; stationId: string; reward: ItemKind }
  | { type: "SEND_CHAT"; text: string }
  | { type: "CAST_VOTE"; targetId: string | null }
  | { type: "RESOLVE_MEETING" }
  | { type: "LEAVE_ROOM" };

export type S2CMessage =
  | {
      type: "ROOM_STATE";
      roomCode: string;
      playerId: string;
      isHost: boolean;
      players: NetPlayer[];
      state: "LOBBY" | "PLAYING" | "ENDED";
      targetPlayers?: number;
      botFill?: boolean;
      chatHistory?: NetChatMessage[];
    }
  | {
      type: "LOBBY_UPDATED";
      players: NetPlayer[];
      targetPlayers: number;
      botFill: boolean;
      hostId: string;
    }
  | { type: "ROOMS_LIST"; rooms: RoomSummary[] }
  | { type: "PLAYER_JOINED"; player: NetPlayer }
  | { type: "PLAYER_LEFT"; playerId: string; newHostId?: string }
  | { type: "MATCH_STARTED"; role: Role; players: NetPlayer[] }
  | { type: "SYNC_PLAYERS"; players: NetPlayer[] }
  | {
      type: "SYNC_WORLD";
      phase: Phase;
      time: number;
      hazard: Hazard;
      taskProgress: number;
      bodies: NetBody[];
      flares: NetFlare[];
    }
  | { type: "BODY_SPAWNED"; body: NetBody }
  | { type: "FLARE_SPAWNED"; flare: NetFlare }
  | {
      type: "MEETING_CALLED";
      reason: string;
      reporter: string;
      candidates: NetPlayer[];
    }
  | { type: "CHAT_MESSAGE"; message: NetChatMessage }
  | { type: "VOTE_CAST_ACK"; voterId: string }
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
