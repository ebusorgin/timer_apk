// participantsByRoom: Map<roomId, Map<socketId, participant>>
// socketToRoom: Map<socketId, roomId>
const participantsByRoom = new Map();
const socketToRoom = new Map();

const ROOM_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
const DEFAULT_ROOM = 'general';

function sanitizeRoomId(input) {
  if (typeof input !== 'string' || !input.trim()) {
    return DEFAULT_ROOM;
  }
  const trimmed = input.trim();
  return ROOM_ID_PATTERN.test(trimmed) ? trimmed : DEFAULT_ROOM;
}

function sanitizeDisplayName(input) {
  if (typeof input !== 'string') {
    return '';
  }
  return input.trim().replace(/\s+/g, ' ').slice(0, 64);
}

function getRoomParticipants(roomId) {
  return participantsByRoom.get(roomId) || new Map();
}

function buildSnapshot(selfId, roomId) {
  const roomParticipants = getRoomParticipants(roomId);
  const participants = Array.from(roomParticipants.values()).map((p) => ({
    id: p.id,
    displayName: p.displayName || '',
    media: { ...p.media },
    connectedAt: p.connectedAt,
  }));
  return {
    selfId,
    roomId,
    participants,
  };
}

export function getRoomsSnapshot() {
  const rooms = [];
  participantsByRoom.forEach((participants, roomId) => {
    if (participants.size > 0) {
      rooms.push({ roomId, participantCount: participants.size });
    }
  });
  return rooms;
}

export function registerPresenceHandlers({ io, logger, metrics }) {
  if (!io) {
    throw new Error('registerPresenceHandlers: io instance is required');
  }

  const scopedLogger =
    logger && typeof logger.child === 'function'
      ? logger.child({ scope: 'sockets:presence' })
      : logger || console;

  io.on('connection', (socket) => {
    const connectedAt = Date.now();
    metrics?.recordSocketConnection(socket.id);
    scopedLogger.info('Клиент подключен к сокету', {
      socketId: socket.id,
    });

    socket.on('room:join', (payload = {}) => {
      const roomId = sanitizeRoomId(payload.roomId);
      const displayName = sanitizeDisplayName(payload.displayName);

      socket.join(roomId);
      socketToRoom.set(socket.id, roomId);

      let roomMap = participantsByRoom.get(roomId);
      if (!roomMap) {
        roomMap = new Map();
        participantsByRoom.set(roomId, roomMap);
      }

      const participantRecord = {
        id: socket.id,
        displayName,
        media: {
          cam: false,
          mic: true,
        },
        connectedAt,
        roomId,
      };
      roomMap.set(socket.id, participantRecord);

      scopedLogger.info('Участник присоединился к комнате', {
        socketId: socket.id,
        roomId,
        displayName,
        roomSize: roomMap.size,
      });

      if (socket.connected) {
        socket.emit('presence:sync', buildSnapshot(socket.id, roomId));
        socket.to(roomId).emit('presence:update', {
          action: 'join',
          participant: {
            id: participantRecord.id,
            displayName: participantRecord.displayName,
            media: { ...participantRecord.media },
            connectedAt: participantRecord.connectedAt,
          },
        });
      }
    });

    socket.on('webrtc-signal', ({ targetSocketId, signal, type }) => {
      const myRoomId = socketToRoom.get(socket.id);
      const targetRoomId = socketToRoom.get(targetSocketId);

      if (targetSocketId === socket.id) {
        scopedLogger.warn('Попытка отправить WebRTC сигнал самому себе', {
          socketId: socket.id,
          type,
        });
        return;
      }
      if (myRoomId !== targetRoomId || !targetRoomId) {
        scopedLogger.warn('Целевой сокет в другой комнате или не найден', {
          socketId: socket.id,
          targetSocketId,
          myRoomId,
          targetRoomId,
        });
        return;
      }

      const roomParticipants = getRoomParticipants(myRoomId);
      if (roomParticipants.has(targetSocketId)) {
        io.to(targetSocketId).emit('webrtc-signal', {
          fromSocketId: socket.id,
          signal,
          type,
        });
      }
    });

    socket.on('status:change', (payload = {}) => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return;

      const roomParticipants = getRoomParticipants(roomId);
      const participant = roomParticipants.get(socket.id);
      if (!participant) return;

      const { media = {} } = payload;
      let dirty = false;

      if (typeof media.cam === 'boolean' && participant.media.cam !== media.cam) {
        participant.media.cam = media.cam;
        dirty = true;
      }
      if (typeof media.mic === 'boolean' && participant.media.mic !== media.mic) {
        participant.media.mic = media.mic;
        dirty = true;
      }

      if (dirty) {
        roomParticipants.set(socket.id, participant);
        io.to(roomId).emit('status:update', {
          id: socket.id,
          media: { ...participant.media },
        });
      }
    });

    socket.on('disconnect', (reason) => {
      const roomId = socketToRoom.get(socket.id);
      socketToRoom.delete(socket.id);

      if (roomId) {
        const roomParticipants = participantsByRoom.get(roomId);
        if (roomParticipants) {
          roomParticipants.delete(socket.id);
          if (roomParticipants.size === 0) {
            participantsByRoom.delete(roomId);
          } else {
            socket.to(roomId).emit('presence:update', {
              action: 'leave',
              participantId: socket.id,
            });
            io.to(roomId).emit('status:update', {
              id: socket.id,
              media: { cam: false, mic: false },
            });
          }
        }
      }

      metrics?.recordSocketDisconnection(socket.id);
      scopedLogger.info('Клиент отключён', {
        socketId: socket.id,
        reason,
      });
    });
  });
}

export default registerPresenceHandlers;
