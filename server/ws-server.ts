import http from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { handleSocketConnection } from "./ws-handler";

const PORT = Number(process.env.WS_PORT || 3001);

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "moonwarden-ws" }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

wss.on("connection", (socket: WebSocket) => {
  const { onMessage, onClose } = handleSocketConnection(socket);

  socket.on("message", (data: Buffer | string) => {
    onMessage(data.toString());
  });

  socket.on("close", () => {
    onClose();
  });

  socket.on("error", () => {
    onClose();
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[Moonwarden WS] Realtime WebSocket game server listening on port ${PORT}`);
});
