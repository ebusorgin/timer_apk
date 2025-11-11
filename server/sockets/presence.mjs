const participants = new Map();

const buildSnapshot = (selfId) => ({
  selfId,
  participants: Array.from(participants.values()).map((participant) => ({
    id: participant.id,
    media: { ...participant.media },
    connectedAt: participant.connectedAt,
  })),
});

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
    const participantRecord = {
      id: socket.id,
      media: {
        cam: false,
        mic: true,
      },
      connectedAt,
    };
    participants.set(socket.id, participantRecord);
    metrics?.recordSocketConnection(socket.id);
    scopedLogger.info('Клиент подключен к сокету', {
      socketId: socket.id,
      activeConnections: participants.size,
    });

    if (socket.connected) {
      socket.emit('presence:sync', buildSnapshot(socket.id));
      socket.broadcast.emit('presence:update', {
        action: 'join',
        participant: participantRecord,
      });
      scopedLogger.debug('Отправлен снимок присутствия', {
        socketId: socket.id,
      });
    }

    socket.on('webrtc-signal', ({ targetSocketId, signal, type }) => {
      scopedLogger.debug('Получен WebRTC сигнал', {
        socketId: socket.id,
        targetSocketId,
        type,
      });
      if (targetSocketId === socket.id) {
        scopedLogger.warn('Попытка отправить WebRTC сигнал самому себе', {
          socketId: socket.id,
          type,
        });
        return;
      }
      if (participants.has(targetSocketId)) {
        io.to(targetSocketId).emit('webrtc-signal', {
          fromSocketId: socket.id,
          signal,
          type,
        });
        scopedLogger.debug('WebRTC сигнал доставлен', {
          fromSocketId: socket.id,
          targetSocketId,
        });
      } else {
        scopedLogger.warn('Целевой сокет не найден', {
          socketId: socket.id,
          targetSocketId,
          availableParticipants: Array.from(participants.keys()),
        });
      }
    });

    socket.on('status:change', (payload = {}) => {
      const participant = participants.get(socket.id);
      if (!participant) {
        scopedLogger.warn('Статус не обновлён — участник не найден', {
          socketId: socket.id,
        });
        return;
      }

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
        participants.set(socket.id, participant);
        io.emit('status:update', {
          id: socket.id,
          media: { ...participant.media },
        });
        scopedLogger.debug('Статус участника обновлён', {
          socketId: socket.id,
          media: participant.media,
        });
      }
    });

    socket.on('conference:hangup-all', () => {
      scopedLogger.warn('Инициировано отключение всех участников конференции', {
        socketId: socket.id,
      });
      const targetIds = Array.from(io.sockets.sockets.keys());

      targetIds.forEach((id) => {
        io.to(id).emit('conference:force-disconnect', {
          initiatedBy: socket.id,
          reason: 'Организатор завершил конференцию',
        });
      });

      targetIds.forEach((id) => {
        const targetSocket = io.sockets.sockets.get(id);
        if (targetSocket) {
          targetSocket.disconnect(true);
        }
      });
    });

    socket.on('disconnect', (reason) => {
      const participant = participants.get(socket.id);
      const wasConnected = Boolean(participant);
      participants.delete(socket.id);
      metrics?.recordSocketDisconnection(socket.id);
      scopedLogger.info('Клиент отключён', {
        socketId: socket.id,
        reason,
        activeConnections: participants.size,
      });

      if (wasConnected) {
        socket.broadcast.emit('presence:update', {
          action: 'leave',
          participantId: socket.id,
        });
        io.emit('status:update', {
          id: socket.id,
          media: { cam: false, mic: false },
        });
        scopedLogger.debug('Отправлены события ухода и сброс статуса', {
          socketId: socket.id,
        });
      }
    });
  });
}

export default registerPresenceHandlers;

