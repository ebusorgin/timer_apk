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

  const connections = new Set();

  io.on('connection', (socket) => {
    console.log('✅ Клиент подключен:', socket.id);
    console.log('📊 Всего подключений:', connections.size + 1);
    connections.add(socket.id);

    setTimeout(() => {
      const otherConnections = Array.from(connections).filter((id) => id !== socket.id);
      console.log(`📋 [${socket.id}] Подготовка к отправке списка пользователей:`, otherConnections.length, 'участников');
      console.log(`📋 [${socket.id}] Список участников:`, otherConnections);

      if (socket.connected) {
        socket.emit('users-list', { users: otherConnections });
        console.log(`✅ [${socket.id}] Событие users-list отправлено (${otherConnections.length} участников)`);
      } else {
        console.warn(`⚠️ [${socket.id}] Сокет уже отключен, не отправляем users-list`);
      }
    }, 100);

    setTimeout(() => {
      const otherConnections = Array.from(connections).filter((id) => id !== socket.id);
      if (otherConnections.length > 0 && socket.connected) {
        console.log(`📢 [${socket.id}] Уведомление ${otherConnections.length} участников о новом подключении`);
        socket.broadcast.emit('user-connected', { socketId: socket.id });
        console.log(`✅ [${socket.id}] Событие user-connected отправлено всем остальным`);
      }
    }, 100);

    socket.on('webrtc-signal', ({ targetSocketId, signal, type }) => {
      console.log(`📡 [${socket.id}] WebRTC сигнал -> ${targetSocketId}, тип: ${type}`);
      if (connections.has(targetSocketId)) {
        io.to(targetSocketId).emit('webrtc-signal', {
          fromSocketId: socket.id,
          signal,
          type,
        });
        console.log(`✅ [${socket.id}] Сигнал доставлен ${targetSocketId}`);
      } else {
        console.warn(`⚠️ [${socket.id}] Целевой сокет ${targetSocketId} не найден в connections`);
        console.warn(`⚠️ [${socket.id}] Доступные соединения:`, Array.from(connections));
      }
    });

    socket.on('disconnect', (reason) => {
      const wasConnected = connections.has(socket.id);
      connections.delete(socket.id);
      console.log(`👋 [${socket.id}] Клиент отключен, причина: ${reason}`);
      console.log(`📊 [${socket.id}] Всего подключений после отключения: ${connections.size}`);

      if (wasConnected) {
        socket.broadcast.emit('user-disconnected', { socketId: socket.id });
        console.log(`✅ [${socket.id}] Событие user-disconnected отправлено всем остальным`);
      }
    });
  });

  return { app, server, io };
}

export default createServerApp;
