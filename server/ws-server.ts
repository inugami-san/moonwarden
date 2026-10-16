import { createRoomServer } from "./ws-service";

const port = Number(process.env.PORT || process.env.WS_PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be an integer between 1 and 65535");
const { server, wss } = createRoomServer();

server.listen(port, "0.0.0.0", () => {
  console.log(`[Moonwarden WS] Realtime WebSocket game server listening on port ${port}`);
});

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const socket of wss.clients) socket.close(1012, "Room server restarting. Please reconnect.");
  server.close(() => process.exit(0));
  setTimeout(() => {
    for (const socket of wss.clients) socket.terminate();
    process.exit(0);
  }, 5000).unref();
}
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
