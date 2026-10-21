import http from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { handleSocketConnection } from "./ws-handler";
import { GAME_WORLD_VERSION } from "./game-version";

/** One process owns every room. Do not horizontally scale without shared state. */
export function createRoomServer(options: { allowedOrigins?: string[]; heartbeatMs?: number } = {}) {
  const origins = new Set(options.allowedOrigins ?? (process.env.WS_ALLOWED_ORIGINS ?? "").split(",").map(value => value.trim()).filter(Boolean));
  const originAllowed = (origin?: string) => !origin || origins.size === 0 || origins.has(origin);
  const server = http.createServer((req, res) => {
    if (!originAllowed(req.headers.origin)) {
      res.writeHead(403).end();
      return;
    }
    if (req.headers.origin) res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "GET" && req.url?.split("?")[0] === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", service: "moonwarden-ws", worldVersion: GAME_WORLD_VERSION }));
      return;
    }
    res.writeHead(404).end();
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 16_384, perMessageDeflate: false });
  const alive = new WeakMap<WebSocket, boolean>();
  server.on("upgrade", (req, socket, head) => {
    if (!originAllowed(req.headers.origin)) {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    if (!["/", "/ws", "/api/ws"].includes((req.url ?? "").split("?")[0])) {
      socket.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
      return;
    }
    wss.handleUpgrade(req, socket, head, ws => wss.emit("connection", ws, req));
  });
  wss.on("connection", socket => {
    alive.set(socket, true);
    socket.on("pong", () => alive.set(socket, true));
    const { onMessage, onClose } = handleSocketConnection(socket);
    socket.on("message", (data, isBinary) => {
      if (isBinary) { socket.close(1003, "Text messages required"); return; }
      onMessage(data.toString());
    });
    socket.on("close", onClose);
    socket.on("error", () => { onClose(); socket.terminate(); });
  });
  // Protocol pongs are handled by the browser even if its JS timers are throttled.
  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (!alive.get(socket)) { socket.terminate(); continue; }
      alive.set(socket, false);
      if (socket.readyState === WebSocket.OPEN) socket.ping();
    }
  }, options.heartbeatMs ?? 30_000);
  heartbeat.unref();
  server.once("close", () => { clearInterval(heartbeat); wss.close(); });
  return { server, wss };
}
