import { gameRegistry, IWebSocketClient } from "./game-room";
import type { C2SMessage, S2CMessage } from "./game-types";

export function handleSocketConnection(socket: IWebSocketClient, customPlayerId?: string) {
  let currentRoomCode: string | null = null;
  const playerId: string =
    customPlayerId || `player-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  const send = (msg: S2CMessage) => {
    try {
      if (socket.readyState === 1) socket.send(JSON.stringify(msg));
    } catch {}
  };

  const onMessage = (dataString: string) => {
    let msg: C2SMessage;
    try {
      msg = JSON.parse(dataString);
    } catch {
      return;
    }

    if (msg.type === "LIST_ROOMS") {
      send({ type: "ROOMS_LIST", rooms: gameRegistry.listOpenRooms() });
      return;
    }

    if (msg.type === "CREATE_ROOM") {
      const room = gameRegistry.createRoom();
      currentRoomCode = room.code;
      room.addClient(playerId, socket, msg.playerName, msg.color, msg.hat);
      return;
    }

    if (msg.type === "JOIN_ROOM") {
      const room = gameRegistry.getRoom(msg.roomCode);
      if (!room) {
        send({ type: "ERROR_ALERT", message: `Room "${msg.roomCode.toUpperCase()}" not found.` });
        return;
      }
      if (room.state !== "LOBBY") {
        send({ type: "ERROR_ALERT", message: `Match in room "${msg.roomCode.toUpperCase()}" is already in progress.` });
        return;
      }
      if (room.players.size >= 8) {
        send({ type: "ERROR_ALERT", message: `Room "${msg.roomCode.toUpperCase()}" is full (8/8 Wardens).` });
        return;
      }
      currentRoomCode = room.code;
      room.addClient(playerId, socket, msg.playerName, msg.color, msg.hat);
      return;
    }

    if (currentRoomCode) {
      const room = gameRegistry.getRoom(currentRoomCode);
      if (room) {
        room.handleMessage(playerId, msg);
        if (msg.type === "LEAVE_ROOM") {
          currentRoomCode = null;
        }
      }
    }
  };

  const onClose = () => {
    if (currentRoomCode) {
      const room = gameRegistry.getRoom(currentRoomCode);
      if (room) {
        room.removeClient(playerId);
        if (room.clients.size === 0) {
          gameRegistry.removeRoom(currentRoomCode);
        }
      }
      currentRoomCode = null;
    }
  };

  return { onMessage, onClose };
}
