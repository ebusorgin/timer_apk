import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createServerApp(options = {}) {
  const {
    corsOrigin = process.env.CORS_ORIGIN || '*',
    pingTimeout = 60000,
    pingInterval = 25000,
  } = options;

  const app = express();
  const server = createServer(app);

  const io = new Server(server, {
    path: '/socket.io/',
    cors: {
      origin: corsOrigin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    pingTimeout,
    pingInterval,
  });

  const wwwPath = path.join(__dirname, '..', 'www');
  if (existsSync(wwwPath)) {
    app.use(express.static(wwwPath));
  }

  app.get('/cordova.js', (req, res) => {
    res.type('application/javascript');
    res.send('// Cordova.js placeholder\n');
  });

  const participants = new Map();

  const buildSnapshot = (selfId) => ({
    selfId,
    participants: Array.from(participants.values()).map((participant) => ({
      id: participant.id,
      media: { ...participant.media },
      connectedAt: participant.connectedAt,
    })),
  });

  const getHostId = () => {
    if (participants.size === 0) {
      return null;
    }
    return Array.from(participants.keys()).reduce((minId, currentId) => {
      if (minId === null) {
        return currentId;
      }
      return currentId < minId ? currentId : minId;
    }, null);
  };

  io.on('connection', (socket) => {
    console.log('✅ Клиент подключен:', socket.id);
    const participantRecord = {
      id: socket.id,
      media: {
        cam: false,
        mic: true,
      },
      connectedAt: Date.now(),
    };
    participants.set(socket.id, participantRecord);
    console.log('📊 Всего подключений:', participants.size);

    if (socket.connected) {
      socket.emit('presence:sync', buildSnapshot(socket.id));
      socket.broadcast.emit('presence:update', {
        action: 'join',
        participant: participantRecord,
      });
      console.log(`✅ [${socket.id}] Снимок присутствия отправлен, уведомление о новом участнике разослано`);
    }

    socket.on('webrtc-signal', ({ targetSocketId, signal, type }) => {
      console.log(`📡 [${socket.id}] WebRTC сигнал -> ${targetSocketId}, тип: ${type}`);
      if (targetSocketId === socket.id) {
        console.warn(`⚠️ [${socket.id}] Попытка отправить сигнал самому себе (${type}) — отклонено`);
        return;
      }
      if (participants.has(targetSocketId)) {
        io.to(targetSocketId).emit('webrtc-signal', {
          fromSocketId: socket.id,
          signal,
          type,
        });
        console.log(`✅ [${socket.id}] Сигнал доставлен ${targetSocketId}`);
      } else {
        console.warn(`⚠️ [${socket.id}] Целевой сокет ${targetSocketId} не найден в участниках`);
        console.warn(`⚠️ [${socket.id}] Доступные участники:`, Array.from(participants.keys()));
      }
    });

    socket.on('status:change', (payload = {}) => {
      const participant = participants.get(socket.id);
      if (!participant) {
        console.warn(`⚠️ [${socket.id}] Статус не обновлён: участник не найден`);
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
        console.log(`✅ [${socket.id}] Статус обновлён и разослан:`, participant.media);
      }
    });

    socket.on('conference:hangup-all', () => {
      const hostId = getHostId();
      if (hostId && socket.id !== hostId) {
        console.warn(`⚠️ [${socket.id}] Попытка завершить конференцию без прав. Текущий хост: ${hostId}`);
        return;
      }

      console.log(`🔴 [${socket.id}] Инициировано глобальное отключение участников.`);
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
      console.log(`👋 [${socket.id}] Клиент отключен, причина: ${reason}`);
      console.log(`📊 [${socket.id}] Всего подключений после отключения: ${participants.size}`);

      if (wasConnected) {
        socket.broadcast.emit('presence:update', {
          action: 'leave',
          participantId: socket.id,
        });
        io.emit('status:update', {
          id: socket.id,
          media: { cam: false, mic: false },
        });
        console.log(`✅ [${socket.id}] Отправлены события ухода, presence update и сброс статуса`);
      }
    });
  });

  return { app, server, io };
}

export default createServerApp;
