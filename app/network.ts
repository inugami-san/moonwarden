import type {
  C2SMessage,
  Hat,
  ItemKind,
  NetChatMessage,
  NetPlayer,
  RoomSummary,
  S2CMessage,
} from "../server/game-types";

export type ConnectionState = "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "ERROR";

export interface MultiplayerState {
  roomCode: string;
  playerId: string;
  isHost: boolean;
  players: NetPlayer[];
  state: "LOBBY" | "PLAYING" | "ENDED";
  targetPlayers: number;
  botFill: boolean;
  openRooms: RoomSummary[];
  lobbyChat: NetChatMessage[];
  lastError: string;
  connected: boolean;
  ping: number;
}

export class MultiplayerClient {
  private ws: WebSocket | null = null;
  private messageHandlers = new Set<(msg: S2CMessage) => void>();
  private stateHandlers = new Set<(state: MultiplayerState) => void>();

  public roomCode: string = "";
  public playerId: string = "";
  public isHost: boolean = false;
  public players: NetPlayer[] = [];
  public state: "LOBBY" | "PLAYING" | "ENDED" = "LOBBY";
  public targetPlayers: number = 6;
  public botFill: boolean = true;
  public openRooms: RoomSummary[] = [];
  public lobbyChat: NetChatMessage[] = [];
  public lastError: string = "";
  public connected: boolean = false;
  public ping: number = 14;
  private pingInterval: number | null = null;

  constructor() {
    this.handleIncoming = this.handleIncoming.bind(this);
  }

  public onMessage(handler: (msg: S2CMessage) => void) {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  public onStateChange(handler: (state: MultiplayerState) => void) {
    this.stateHandlers.add(handler);
    handler(this.getSnapshot());
    return () => this.stateHandlers.delete(handler);
  }

  public getSnapshot(): MultiplayerState {
    return {
      roomCode: this.roomCode,
      playerId: this.playerId,
      isHost: this.isHost,
      players: [...this.players],
      state: this.state,
      targetPlayers: this.targetPlayers,
      botFill: this.botFill,
      openRooms: [...this.openRooms],
      lobbyChat: [...this.lobbyChat],
      lastError: this.lastError,
      connected: this.connected,
      ping: this.ping,
    };
  }

  private notifyState() {
    const snapshot = this.getSnapshot();
    for (const handler of this.stateHandlers) {
      handler(snapshot);
    }
  }

  public clearError() {
    if (this.lastError) {
      this.lastError = "";
      this.notifyState();
    }
  }

  public connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      if (typeof window === "undefined") {
        reject(new Error("Cannot connect on server side"));
        return;
      }

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.host;
      const primaryUrl = `${protocol}//${host}/api/ws`;

      let hasResolved = false;

      const tryConnect = (url: string, isFallback = false) => {
        try {
          const socket = new WebSocket(url);
          this.ws = socket;

          socket.onopen = () => {
            this.connected = true;
            this.lastError = "";
            this.notifyState();
            if (!hasResolved) {
              hasResolved = true;
              resolve();
            }
          };

          socket.onmessage = (event) => {
            try {
              const msg: S2CMessage = JSON.parse(event.data);
              this.handleIncoming(msg);
            } catch (err) {
              console.error("[MP Client] Failed to parse message:", err);
            }
          };

          socket.onclose = () => {
            this.connected = false;
            this.notifyState();
            if (!hasResolved && !isFallback) {
              const fallbackUrl = `${protocol}//${window.location.hostname}:3001`;
              tryConnect(fallbackUrl, true);
            }
          };

          socket.onerror = (err) => {
            if (!hasResolved && !isFallback) {
              socket.close();
              const fallbackUrl = `${protocol}//${window.location.hostname}:3001`;
              tryConnect(fallbackUrl, true);
            } else if (!hasResolved) {
              hasResolved = true;
              reject(err);
            }
          };
        } catch (err) {
          if (!hasResolved && !isFallback) {
            const fallbackUrl = `${protocol}//${window.location.hostname}:3001`;
            tryConnect(fallbackUrl, true);
          } else if (!hasResolved) {
            hasResolved = true;
            reject(err);
          }
        }
      };

      tryConnect(primaryUrl);
    });
  }

  private handleIncoming(msg: S2CMessage) {
    switch (msg.type) {
      case "ROOM_STATE":
        this.roomCode = msg.roomCode;
        this.playerId = msg.playerId;
        this.isHost = msg.isHost;
        this.players = msg.players;
        this.state = msg.state;
        this.targetPlayers = msg.targetPlayers ?? 6;
        this.botFill = msg.botFill ?? true;
        this.lobbyChat = msg.chatHistory ? [...msg.chatHistory] : [];
        this.lastError = "";
        this.notifyState();
        break;

      case "LOBBY_UPDATED":
        this.players = msg.players;
        this.targetPlayers = msg.targetPlayers;
        this.botFill = msg.botFill;
        this.isHost = msg.hostId === this.playerId;
        this.notifyState();
        break;

      case "ROOMS_LIST":
        this.openRooms = msg.rooms;
        this.notifyState();
        break;

      case "PLAYER_JOINED":
        if (!this.players.some((p) => p.id === msg.player.id)) {
          this.players = [...this.players, msg.player];
          this.lobbyChat = [
            ...this.lobbyChat.slice(-35),
            {
              id: `sys-join-${msg.player.id}-${Date.now()}`,
              playerId: null,
              playerName: "SANCTUARY",
              playerColor: null,
              text: `${msg.player.name} entered the moonward circle.`,
              system: true,
            },
          ];
          this.notifyState();
        }
        break;

      case "PLAYER_LEFT": {
        const departed = this.players.find((p) => p.id === msg.playerId);
        this.players = this.players.filter((p) => p.id !== msg.playerId);
        if (msg.newHostId) {
          this.isHost = msg.newHostId === this.playerId;
          this.players = this.players.map((p) =>
            p.id === msg.newHostId ? { ...p, isHost: true, ready: true } : p
          );
        }
        if (departed && this.state === "LOBBY") {
          this.lobbyChat = [
            ...this.lobbyChat.slice(-35),
            {
              id: `sys-leave-${msg.playerId}-${Date.now()}`,
              playerId: null,
              playerName: "SANCTUARY",
              playerColor: null,
              text: `${departed.name} left the circle.`,
              system: true,
            },
          ];
        }
        this.notifyState();
        break;
      }

      case "CHAT_MESSAGE":
        if (this.state === "LOBBY") {
          this.lobbyChat = [...this.lobbyChat.slice(-35), msg.message];
          this.notifyState();
        }
        break;

      case "ERROR_ALERT":
        this.lastError = msg.message;
        this.notifyState();
        break;

      case "MATCH_STARTED":
        this.state = "PLAYING";
        this.players = msg.players;
        this.notifyState();
        break;

      case "MATCH_RESULT":
        this.state = "ENDED";
        this.notifyState();
        break;
    }

    for (const handler of this.messageHandlers) {
      handler(msg);
    }
  }

  public send(msg: C2SMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  public createRoom(playerName: string, color: string, hat: Hat) {
    this.send({ type: "CREATE_ROOM", playerName, color, hat });
  }

  public joinRoom(roomCode: string, playerName: string, color: string, hat: Hat) {
    this.send({ type: "JOIN_ROOM", roomCode: roomCode.toUpperCase().trim(), playerName, color, hat });
  }

  public updateProfile(playerName: string, color: string, hat: Hat) {
    this.send({ type: "UPDATE_PROFILE", playerName, color, hat });
  }

  public toggleReady(ready?: boolean) {
    this.send({ type: "TOGGLE_READY", ready });
  }

  public updateRoomConfig(targetPlayers: number, botFill: boolean) {
    this.send({ type: "UPDATE_ROOM_CONFIG", targetPlayers, botFill });
  }

  public requestRoomsList() {
    this.send({ type: "LIST_ROOMS" });
  }

  public startMatch(botFill = true, targetPlayers = 6) {
    this.send({ type: "START_MATCH", botFill, targetPlayers });
  }

  public sendInput(x: number, y: number, vx: number, vy: number, angle: number, flashlight: boolean) {
    this.send({ type: "PLAYER_INPUT", x, y, vx, vy, angle, flashlight });
  }

  public sendKill(victimId: string) {
    this.send({ type: "TRIGGER_KILL", victimId });
  }

  public sendReport(bodyId?: string) {
    this.send({ type: "TRIGGER_REPORT", bodyId });
  }

  public useItem(item: ItemKind, x: number, y: number) {
    this.send({ type: "USE_ITEM", item, x, y });
  }

  public sendTask(stationId: string, reward: ItemKind) {
    this.send({ type: "TASK_UPDATE", stationId, reward });
  }

  public sendChat(text: string) {
    this.send({ type: "SEND_CHAT", text });
  }

  public sendVote(targetId: string | null) {
    this.send({ type: "CAST_VOTE", targetId });
  }

  public resolveMeeting() {
    this.send({ type: "RESOLVE_MEETING" });
  }

  public leaveRoom() {
    this.send({ type: "LEAVE_ROOM" });
    this.roomCode = "";
    this.playerId = "";
    this.isHost = false;
    this.players = [];
    this.lobbyChat = [];
    this.state = "LOBBY";
    this.notifyState();
  }

  public disconnect() {
    if (this.pingInterval) {
      window.clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.roomCode = "";
    this.playerId = "";
    this.isHost = false;
    this.players = [];
    this.lobbyChat = [];
    this.state = "LOBBY";
    this.notifyState();
  }
}
