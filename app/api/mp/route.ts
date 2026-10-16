import { NextResponse } from "next/server";
import { gameRegistry, type IWebSocketClient } from "../../../server/game-room";
import type { C2SMessage, S2CMessage } from "../../../server/game-types";
import { handleSocketConnection } from "../../../server/ws-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface HttpPlayerSession {
  sessionId: string;
  outbox: S2CMessage[];
  lastSeen: number;
  socket: IWebSocketClient;
  handler: {
    onMessage: (data: string) => void;
    onClose: () => void;
  };
}

const globalForSessions = globalThis as unknown as {
  __moonwardenHttpSessions?: Map<string, HttpPlayerSession>;
};

const sessions =
  globalForSessions.__moonwardenHttpSessions ||
  (globalForSessions.__moonwardenHttpSessions = new Map<string, HttpPlayerSession>());

const SESSION_TIMEOUT_MS = 18_000;

function cleanupStaleSessions(now: number) {
  for (const [id, session] of sessions.entries()) {
    if (now - session.lastSeen > SESSION_TIMEOUT_MS) {
      session.socket.readyState = 3;
      try {
        session.handler.onClose();
      } catch {}
      sessions.delete(id);
    }
  }
}

function getOrCreateSession(requestedId?: string): HttpPlayerSession {
  if (requestedId && sessions.has(requestedId)) {
    const existing = sessions.get(requestedId)!;
    existing.lastSeen = Date.now();
    return existing;
  }

  const sessionId =
    requestedId || `player-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const outbox: S2CMessage[] = [];

  const socket: IWebSocketClient = {
    readyState: 1,
    send(data: string) {
      try {
        const parsed: S2CMessage = JSON.parse(data);
        if (parsed.type === "SYNC_PLAYERS" || parsed.type === "SYNC_WORLD") {
          const existingIdx = outbox.findIndex((m) => m.type === parsed.type);
          if (existingIdx >= 0) {
            outbox[existingIdx] = parsed;
            return;
          }
        }
        outbox.push(parsed);
      } catch {}
    },
    close() {
      this.readyState = 3;
    },
  };

  const handler = handleSocketConnection(socket, sessionId);
  const session: HttpPlayerSession = {
    sessionId,
    outbox,
    lastSeen: Date.now(),
    socket,
    handler,
  };
  sessions.set(sessionId, session);
  return session;
}

export async function POST(request: Request) {
  const now = Date.now();
  cleanupStaleSessions(now);

  let body: {
    sessionId?: string;
    messages?: C2SMessage[];
    disconnect?: boolean;
  } = {};

  try {
    body = await request.json();
  } catch {}

  if (body.disconnect && body.sessionId) {
    const existing = sessions.get(body.sessionId);
    if (existing) {
      existing.socket.readyState = 3;
      try {
        existing.handler.onClose();
      } catch {}
      sessions.delete(body.sessionId);
    }
    return NextResponse.json({ ok: true, sessionId: body.sessionId, messages: [] });
  }

  const session = getOrCreateSession(body.sessionId);
  session.lastSeen = now;

  if (Array.isArray(body.messages)) {
    for (const msg of body.messages) {
      if (msg && typeof msg.type === "string") {
        session.handler.onMessage(JSON.stringify(msg));
      }
    }
  }

  gameRegistry.tickActiveRooms();

  const drained = session.outbox.splice(0, session.outbox.length);
  return NextResponse.json({
    ok: true,
    sessionId: session.sessionId,
    messages: drained,
  });
}
