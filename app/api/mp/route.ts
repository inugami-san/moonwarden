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
  lastRequestId?: number;
  lastResponse?: { ok: boolean; sessionId: string; messages: S2CMessage[] };
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

// Background tabs can throttle polling to once a minute. Give them time to
// return without deleting the host and its room during a multi-tab playtest.
// This grace period does not make process memory shared across Vercel instances.
const SESSION_TIMEOUT_MS = 120_000;

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
        if (parsed.type === "SYNC_PLAYERS" || parsed.type === "SYNC_MOVEMENT" || parsed.type === "SYNC_WORLD") {
          const existingIdx = outbox.findIndex((m) => m.type === parsed.type);
          if (existingIdx >= 0) {
            // Keep events in chronological order; a newer world sync must not
            // arrive before a kill/meeting event that preceded it.
            outbox.splice(existingIdx, 1);
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
    requestId?: number;
  } = {};

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || (body.sessionId !== undefined && typeof body.sessionId !== "string")) {
    return NextResponse.json({ ok: false, error: "Invalid session" }, { status: 400 });
  }
  if (body.requestId !== undefined && (!Number.isSafeInteger(body.requestId) || body.requestId < 1)) {
    return NextResponse.json({ ok: false, error: "Invalid request ID" }, { status: 400 });
  }
  // Never silently manufacture a new player inside a different server instance.
  if (body.sessionId && !sessions.has(body.sessionId) && !body.disconnect) {
    return NextResponse.json({ ok: false, error: "SESSION_EXPIRED" }, { status: 409 });
  }

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
  if (body.requestId !== undefined && body.requestId === session.lastRequestId && session.lastResponse) {
    return NextResponse.json(session.lastResponse, { headers: { "Cache-Control": "no-store" } });
  }

  if (Array.isArray(body.messages)) {
    for (const msg of body.messages.slice(0, 64)) {
      if (msg && typeof msg.type === "string") {
        session.handler.onMessage(JSON.stringify(msg));
      }
    }
  }

  gameRegistry.tickActiveRooms();

  const drained = session.outbox.splice(0, session.outbox.length);
  const response = {
    ok: true,
    sessionId: session.sessionId,
    messages: drained,
  };
  session.lastRequestId = body.requestId;
  session.lastResponse = response;
  return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
}
