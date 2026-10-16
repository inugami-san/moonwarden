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
  transport: "NONE" | "WS" | "HTTP";
}

export class MultiplayerClient {
  private ws: WebSocket | null = null;
  private transport: "NONE" | "WS" | "HTTP" = "NONE";
  private httpSessionId: string = "";
  private httpOutbox: C2SMessage[] = [];
  private httpPollTimer: number | null = null;
  private httpInFlight: boolean = false;
  private httpFlushRequested: boolean = false;
  private lastHttpFlushAt: number = 0;
  private connectPromise: Promise<void> | null = null;
  private cancelConnect: (() => void) | null = null;
  private generation = 0;
  private inputSeq = 0;
  private httpFailures = 0;
  private httpRequestId = 0;
  private httpRetry: { messages: C2SMessage[]; requestId: number } | null = null;
  private lastLatencyNotification = 0;
  private lastReceivedAt = 0;

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
  public ping: number = 0;
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
      transport: this.transport,
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

  private async startHttpTransport(): Promise<void> {
    if (this.transport === "HTTP" && this.connected) return;
    const generation = this.generation;
    const t0 = performance.now();
    const res = await fetch("/api/mp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: this.httpSessionId || undefined,
        messages: [],
      }),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`HTTP relay failed with status ${res.status}`);
    }
    const data = (await res.json()) as {
      ok?: boolean;
      sessionId?: string;
      messages?: S2CMessage[];
    };
    if (generation !== this.generation) throw new Error("Connection cancelled");
    this.ping = Math.max(1, Math.round(performance.now() - t0));
    if (data.sessionId) {
      this.httpSessionId = data.sessionId;
    }
    this.transport = "HTTP";
    this.connected = true;
    this.lastError = "";
    this.notifyState();

    if (Array.isArray(data.messages)) {
      for (const msg of data.messages) {
        this.handleIncoming(msg);
      }
    }

    if (this.httpPollTimer) {
      window.clearInterval(this.httpPollTimer);
    }
    this.httpPollTimer = window.setInterval(() => {
      const targetInterval = this.state === "PLAYING" ? 55 : 140;
      if (performance.now() - this.lastHttpFlushAt >= targetInterval) {
        void this.flushHttp();
      }
    }, 30);
  }

  private async flushHttp(): Promise<void> {
    if (this.transport !== "HTTP" || !this.connected) return;
    if (this.httpInFlight) {
      this.httpFlushRequested = true;
      return;
    }
    this.httpInFlight = true;
    this.httpFlushRequested = false;
    this.lastHttpFlushAt = performance.now();

    const request = this.httpRetry ?? { messages: this.httpOutbox.splice(0, this.httpOutbox.length), requestId: ++this.httpRequestId };
    const batch = request.messages;
    const t0 = this.lastHttpFlushAt;
    const generation = this.generation;

    try {
      const res = await fetch("/api/mp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: this.httpSessionId || undefined,
          messages: batch,
          requestId: request.requestId,
        }),
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
      });
      if (generation !== this.generation) return;
      if (res.status === 409) {
        this.connected = false;
        this.lastError = "The room session expired or moved to another server. Return to the lobby to reconnect.";
        this.notifyState();
        return;
      }
      if (!res.ok) throw new Error(`Relay returned ${res.status}`);
      {
        this.ping = Math.max(1, Math.round(performance.now() - t0));
        this.httpFailures = 0;
        this.httpRetry = null;
        const data = (await res.json()) as {
          sessionId?: string;
          messages?: S2CMessage[];
        };
        if (data.sessionId) {
          this.httpSessionId = data.sessionId;
        }
        if (Array.isArray(data.messages)) {
          for (const msg of data.messages) {
            this.handleIncoming(msg);
          }
        }
        if (performance.now() - this.lastLatencyNotification > 2000) {
          this.lastLatencyNotification = performance.now();
          this.notifyState();
        }
      }
    } catch {
      if (generation !== this.generation) return;
      // Retry the same request ID. The relay replays its response rather than
      // charging gear twice or duplicating chat after a dropped response.
      this.httpRetry = request;
      this.httpFailures += 1;
      if (this.httpFailures >= 3) {
        this.connected = false;
        this.lastError = "Connection to the game room was lost. Return to the lobby to reconnect.";
        this.notifyState();
      }
    } finally {
      if (generation === this.generation) {
        this.httpInFlight = false;
        if (this.httpFlushRequested && this.httpOutbox.length > 0) {
          void this.flushHttp();
        }
      }
    }
  }

  public connect(): Promise<void> {
    if (this.connected && (this.transport === "HTTP" || (this.ws && this.ws.readyState === WebSocket.OPEN))) {
      return Promise.resolve();
    }

    if (this.connectPromise) return this.connectPromise;
    if (this.transport !== "NONE") this.disconnect();
    const generation = this.generation;
    this.connectPromise = new Promise<void>((resolve, reject) => {
      this.cancelConnect = () => reject(new Error("Connection cancelled"));
      if (typeof window === "undefined") {
        reject(new Error("Cannot connect on server side"));
        return;
      }

      const customWsUrl = process.env.NEXT_PUBLIC_WS_URL;
      const isVercelDomain = window.location.hostname.endsWith(".vercel.app");

      // On *.vercel.app without an external NEXT_PUBLIC_WS_URL, connect directly via the built-in /api/mp route
      if (isVercelDomain && !customWsUrl) {
        this.startHttpTransport().then(resolve).catch(reject);
        return;
      }

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.host;
      const primaryUrl = customWsUrl || `${protocol}//${host}/api/ws`;

      let hasResolved = false;
      let tryingHttp = false;

      const fallbackToHttp = () => {
        if (hasResolved || tryingHttp || generation !== this.generation) return;
        tryingHttp = true;
        this.startHttpTransport()
          .then(() => {
            if (!hasResolved) {
              hasResolved = true;
              resolve();
            }
          })
          .catch((err) => {
            if (!hasResolved) {
              hasResolved = true;
              reject(err);
            }
          });
      };

      const tryConnect = (url: string, isFallback = false) => {
        try {
          const socket = new WebSocket(url);
          this.ws = socket;

          let failed = false;
          const fail = () => {
            if (failed || hasResolved || generation !== this.generation) return;
            failed = true;
            window.clearTimeout(connectTimeout);
            socket.onopen = socket.onclose = socket.onerror = socket.onmessage = null;
            socket.close();
            if (customWsUrl) {
              hasResolved = true;
              this.lastError = "The realtime game server is unavailable. Please try again.";
              this.notifyState();
              reject(new Error(this.lastError));
            } else if (!isFallback && ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname)) {
              tryConnect(`${protocol}//${window.location.hostname}:3001`, true);
            } else {
              fallbackToHttp();
            }
          };
          const connectTimeout = window.setTimeout(fail, customWsUrl ? 12_000 : 4000);

          socket.onopen = () => {
            if (generation !== this.generation) { socket.close(); reject(new Error("Connection cancelled")); return; }
            window.clearTimeout(connectTimeout);
            this.transport = "WS";
            this.connected = true;
            this.lastError = "";
            this.lastReceivedAt = Date.now();
            if (this.pingInterval) window.clearInterval(this.pingInterval);
            const ping = () => {
              if (socket.readyState !== WebSocket.OPEN) return;
              if (Date.now() - this.lastReceivedAt > 30_000 && document.visibilityState === "visible") {
                socket.close();
                return;
              }
              this.send({ type: "PING", sentAt: performance.now() });
            };
            this.pingInterval = window.setInterval(ping, 2500);
            ping();
            this.notifyState();
            if (!hasResolved) {
              hasResolved = true;
              resolve();
            }
          };

          socket.onmessage = (event) => {
            if (generation !== this.generation || this.ws !== socket) return;
            this.lastReceivedAt = Date.now();
            try {
              const msg: S2CMessage = JSON.parse(event.data);
              this.handleIncoming(msg);
            } catch (err) {
              console.error("[MP Client] Failed to parse message:", err);
            }
          };

          socket.onclose = () => {
            window.clearTimeout(connectTimeout);
            if (generation !== this.generation || this.ws !== socket) return;
            if (this.transport === "WS") {
              this.connected = false;
              this.lastError = "Connection to the game room was lost. Return to the lobby to reconnect.";
              if (this.pingInterval) window.clearInterval(this.pingInterval);
              this.pingInterval = null;
              this.notifyState();
            }
            fail();
          };

          socket.onerror = fail;
        } catch {
          if (customWsUrl) { hasResolved = true; reject(new Error("Invalid realtime server URL")); }
          else fallbackToHttp();
        }
      };

      tryConnect(primaryUrl);
    }).finally(() => {
      if (generation === this.generation) { this.connectPromise = null; this.cancelConnect = null; }
    });
    return this.connectPromise;
  }

  private handleIncoming(msg: S2CMessage) {
    switch (msg.type) {
      case "PONG":
        this.ping = Math.max(1, Math.round(performance.now() - msg.sentAt));
        this.notifyState();
        return;
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
    if (this.transport === "WS" && this.ws && this.ws.readyState === WebSocket.OPEN) {
      // Drop disposable movement packets instead of building seconds of lag.
      if (msg.type === "PLAYER_INPUT" && this.ws.bufferedAmount > 16_384) return;
      this.ws.send(JSON.stringify(msg));
      return;
    }
    if (this.transport === "HTTP" && this.connected) {
      if (msg.type === "PLAYER_INPUT") {
        const existingIdx = this.httpOutbox.findIndex((m) => m.type === "PLAYER_INPUT");
        if (existingIdx >= 0) {
          this.httpOutbox[existingIdx] = msg;
        } else {
          this.httpOutbox.push(msg);
        }
        if (!this.httpInFlight && performance.now() - this.lastHttpFlushAt >= 48) {
          void this.flushHttp();
        }
      } else {
        this.httpOutbox.push(msg);
        void this.flushHttp();
      }
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
    const seq = ++this.inputSeq;
    this.send({ type: "PLAYER_INPUT", x, y, vx, vy, angle, flashlight, seq });
    return seq;
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

  public sendTask(stationId: string, reward: ItemKind, roundId?: number) {
    this.send({ type: "TASK_UPDATE", stationId, reward, roundId });
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
    this.httpOutbox = this.httpOutbox.filter((msg) => msg.type !== "PLAYER_INPUT");
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
    this.cancelConnect?.();
    this.cancelConnect = null;
    this.generation += 1;
    this.connectPromise = null;
    this.httpOutbox = [];
    this.httpInFlight = false;
    this.httpFlushRequested = false;
    this.httpFailures = 0;
    this.httpRetry = null;
    if (this.pingInterval) {
      window.clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.httpPollTimer) {
      window.clearInterval(this.httpPollTimer);
      this.httpPollTimer = null;
    }
    if (this.transport === "HTTP" && this.httpSessionId && typeof window !== "undefined") {
      try {
        void fetch("/api/mp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: this.httpSessionId, disconnect: true }),
          keepalive: true,
        });
      } catch {}
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.transport = "NONE";
    this.httpSessionId = "";
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
