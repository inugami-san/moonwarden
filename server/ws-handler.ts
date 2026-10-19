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

  const leaveCurrentRoom = () => {
    if (!currentRoomCode) return;
    const previousCode = currentRoomCode;
    currentRoomCode = null;
    const room = gameRegistry.getRoom(previousCode);
    room?.removeClient(playerId);
    if (room?.clients.size === 0) gameRegistry.removeRoom(previousCode);
  };

  const onMessage = (dataString: string) => {
    let msg: C2SMessage;
    try {
      msg = JSON.parse(dataString);
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object" || typeof msg.type !== "string") return;
    if ((msg.type === "CREATE_ROOM" || msg.type === "JOIN_ROOM" || msg.type === "UPDATE_PROFILE")
      && (typeof msg.playerName !== "string" || typeof msg.color !== "string" || typeof msg.hat !== "string")) return;
    if (msg.type === "JOIN_ROOM" && typeof msg.roomCode !== "string") return;
    if (msg.type === "SEND_CHAT" && typeof msg.text !== "string") return;
    if (msg.type === "UPDATE_ROOM_CONFIG" && !Number.isFinite(msg.targetPlayers)) return;
    if (msg.type === "START_MATCH" && msg.targetPlayers !== undefined && !Number.isFinite(msg.targetPlayers)) return;
    if (msg.type === "CAST_VOTE" && msg.targetId !== null && typeof msg.targetId !== "string") return;
    if (msg.type === "USE_ITEM" && !["FLASHLIGHT", "FLARE", "SONAR"].includes(msg.item)) return;
    if (msg.type === "USE_ABILITY" && (!["MOON_SIGHT", "ECHO_LURE"].includes(msg.ability)
      || ![msg.x, msg.y].every(Number.isFinite) || !Number.isSafeInteger(msg.roundId))) return;
    if (msg.type === "TASK_UPDATE" && msg.roundId !== undefined && (!Number.isSafeInteger(msg.roundId) || msg.roundId < 1)) return;

    if (msg.type === "PING") {
      if (Number.isFinite(msg.sentAt)) send({ type: "PONG", sentAt: msg.sentAt });
      return;
    }

    if (msg.type === "LIST_ROOMS") {
      send({ type: "ROOMS_LIST", rooms: gameRegistry.listOpenRooms() });
      return;
    }

    if (msg.type === "CREATE_ROOM") {
      leaveCurrentRoom();
      const room = gameRegistry.createRoom();
      currentRoomCode = room.code;
      room.addClient(playerId, socket, msg.playerName, msg.color, msg.hat, msg.eyeStyle);
      return;
    }

    if (msg.type === "JOIN_ROOM") {
      if (currentRoomCode === msg.roomCode.toUpperCase()) return;
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
      leaveCurrentRoom();
      currentRoomCode = room.code;
      room.addClient(playerId, socket, msg.playerName, msg.color, msg.hat, msg.eyeStyle);
      return;
    }

    if (currentRoomCode) {
      const room = gameRegistry.getRoom(currentRoomCode);
      if (room) {
        room.handleMessage(playerId, msg);
        if (msg.type === "LEAVE_ROOM") {
          if (room.clients.size === 0) gameRegistry.removeRoom(currentRoomCode);
          currentRoomCode = null;
        }
      }
    }
  };

  const onClose = leaveCurrentRoom;

  return { onMessage, onClose };
}
