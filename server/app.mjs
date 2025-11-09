import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';
import { promises as fs } from 'fs';

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
  app.use(express.json());

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

  const dataDirectory = path.join(__dirname, 'data');
  const subscribersFilePath = path.join(dataDirectory, 'subscribers.json');
  const callsFilePath = path.join(dataDirectory, 'calls.json');

  const ensureDataDirectory = () => {
    if (!existsSync(dataDirectory)) {
      mkdirSync(dataDirectory, { recursive: true });
    }
  };

  const ensureSubscribersStore = async () => {
    ensureDataDirectory();
    if (!existsSync(subscribersFilePath)) {
      await fs.writeFile(
        subscribersFilePath,
        JSON.stringify({ subscribers: [] }, null, 2),
        'utf-8'
      );
    }
  };

  const ensureCallsStore = async () => {
    ensureDataDirectory();
    if (!existsSync(callsFilePath)) {
      await fs.writeFile(
        callsFilePath,
        JSON.stringify({ calls: [] }, null, 2),
        'utf-8'
      );
    }
  };

  const readSubscribers = async () => {
    await ensureSubscribersStore();
    try {
      const fileContent = await fs.readFile(subscribersFilePath, 'utf-8');
      if (!fileContent) {
        return [];
      }
      const parsed = JSON.parse(fileContent);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      if (parsed && Array.isArray(parsed.subscribers)) {
        return parsed.subscribers;
      }
      return [];
    } catch (error) {
      console.warn('⚠️ Не удалось прочитать список подписчиков, возвращаем пустой массив.', error);
      return [];
    }
  };

  const readCalls = async () => {
    await ensureCallsStore();
    try {
      const fileContent = await fs.readFile(callsFilePath, 'utf-8');
      if (!fileContent) {
        return [];
      }
      const parsed = JSON.parse(fileContent);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      if (parsed && Array.isArray(parsed.calls)) {
        return parsed.calls;
      }
      return [];
    } catch (error) {
      console.warn('⚠️ Не удалось прочитать список звонков, возвращаем пустой массив.', error);
      return [];
    }
  };

  const writeSubscribers = async (subscribers = []) => {
    await ensureSubscribersStore();
    const payload = JSON.stringify({ subscribers }, null, 2);
    await fs.writeFile(subscribersFilePath, payload, 'utf-8');
  };

  const writeCalls = async (calls = []) => {
    await ensureCallsStore();
    const payload = JSON.stringify({ calls }, null, 2);
    await fs.writeFile(callsFilePath, payload, 'utf-8');
  };

  const sanitizeDisplayName = (value) => {
    if (typeof value !== 'string') {
      return '';
    }
    const trimmed = value.trim().replace(/\s+/g, ' ');
    return trimmed.slice(0, 64);
  };

  const sortSubscribers = (items = []) =>
    [...items].sort((a, b) => {
      const nameA = (a.name || '').toLocaleLowerCase();
      const nameB = (b.name || '').toLocaleLowerCase();
      if (nameA === nameB) {
        return (a.createdAt || 0) - (b.createdAt || 0);
      }
      return nameA.localeCompare(nameB, 'ru');
    });

  app.get('/cordova.js', (req, res) => {
    res.type('application/javascript');
    res.send('// Cordova.js placeholder\n');
  });

  app.get('/api/subscribers', async (req, res) => {
    try {
      const subscribers = await readSubscribers();
      res.json({
        success: true,
        subscribers: sortSubscribers(subscribers),
      });
    } catch (error) {
      console.error('❌ Ошибка чтения подписчиков:', error);
      res.status(500).json({
        success: false,
        error: 'Не удалось получить список подписчиков',
      });
    }
  });

  app.post('/api/subscribers', async (req, res) => {
    const { id, name } = req.body || {};
    const subscriberId = typeof id === 'string' ? id.trim() : '';
    const displayName = sanitizeDisplayName(name);

    if (!subscriberId || !displayName) {
      res.status(400).json({
        success: false,
        error: 'Необходимо указать идентификатор и имя подписчика',
      });
      return;
    }

    try {
      const subscribers = await readSubscribers();
      const timestamp = Date.now();
      const existingIndex = subscribers.findIndex((item) => item.id === subscriberId);

      if (existingIndex >= 0) {
        subscribers[existingIndex] = {
          ...subscribers[existingIndex],
          name: displayName,
          updatedAt: timestamp,
        };
      } else {
        subscribers.push({
          id: subscriberId,
          name: displayName,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }

      const ordered = sortSubscribers(subscribers);
      await writeSubscribers(ordered);

      const currentSubscriber =
        ordered.find((item) => item.id === subscriberId) ||
        subscribers.find((item) => item.id === subscriberId);

      io.emit('subscribers:update', {
        subscribers: ordered,
      });

      res.json({
        success: true,
        subscriber: currentSubscriber,
        subscribers: ordered,
      });
    } catch (error) {
      console.error('❌ Ошибка сохранения подписчика:', error);
      res.status(500).json({
        success: false,
        error: 'Не удалось сохранить подписчика',
      });
    }
  });

  app.get('/api/calls/pending/:subscriberId', async (req, res) => {
    const subscriberId = typeof req.params.subscriberId === 'string'
      ? req.params.subscriberId.trim()
      : '';

    if (!subscriberId) {
      res.status(400).json({
        success: false,
        error: 'Не указан идентификатор подписчика',
      });
      return;
    }

    try {
      const calls = await readCalls();
      const pending = calls
        .filter((call) => call?.to?.id === subscriberId && call.status === 'pending')
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

      res.json({
        success: true,
        calls: pending,
      });
    } catch (error) {
      console.error('❌ Ошибка получения ожидающих звонков:', error);
      res.status(500).json({
        success: false,
        error: 'Не удалось получить список звонков',
      });
    }
  });

  app.post('/api/calls/:callId/ack', async (req, res) => {
    const callId = typeof req.params.callId === 'string' ? req.params.callId.trim() : '';
    const { status = 'acknowledged' } = req.body || {};
    const allowedStatuses = new Set(['pending', 'acknowledged', 'accepted', 'declined', 'ignored']);
    const nextStatus = allowedStatuses.has(status) ? status : 'acknowledged';

    if (!callId) {
      res.status(400).json({
        success: false,
        error: 'Не указан идентификатор звонка',
      });
      return;
    }

    try {
      const calls = await readCalls();
      const index = calls.findIndex((call) => call.id === callId);
      if (index === -1) {
        res.status(404).json({
          success: false,
          error: 'Звонок не найден',
        });
        return;
      }

      const updated = {
        ...calls[index],
        status: nextStatus,
        updatedAt: Date.now(),
      };
      calls[index] = updated;

      const now = Date.now();
      const cleaned = calls.filter((call) => {
        if (call.status === 'pending') {
          return true;
        }
        return now - (call.updatedAt || call.createdAt || 0) < 1000 * 60 * 60;
      });

      await writeCalls(cleaned);

      io.emit('call:ack', {
        callId,
        status: nextStatus,
        call: updated,
      });

      res.json({
        success: true,
        call: updated,
      });
    } catch (error) {
      console.error('❌ Ошибка подтверждения звонка:', error);
      res.status(500).json({
        success: false,
        error: 'Не удалось обновить статус звонка',
      });
    }
  });

  app.post('/api/calls', async (req, res) => {
    const { fromId, toId, fromName } = req.body || {};
    const callerId = typeof fromId === 'string' ? fromId.trim() : '';
    const targetId = typeof toId === 'string' ? toId.trim() : '';

    if (!callerId || !targetId) {
      res.status(400).json({
        success: false,
        error: 'Необходимо указать инициатора и получателя звонка',
      });
      return;
    }

    try {
      const subscribers = await readSubscribers();
      const callerFromStore = subscribers.find((item) => item.id === callerId) || null;
      const targetFromStore = subscribers.find((item) => item.id === targetId) || null;

      const callerName =
        callerFromStore?.name || sanitizeDisplayName(fromName) || 'Неизвестный';
      const targetName = targetFromStore?.name || 'Неизвестный';

      const callRecord = {
        id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        from: {
          id: callerId,
          name: callerName,
        },
        to: {
          id: targetId,
          name: targetName,
        },
        createdAt: Date.now(),
        status: 'pending',
      };

      const calls = await readCalls();
      calls.push(callRecord);
      await writeCalls(calls);

      io.emit('call:initiated', callRecord);

      res.json({
        success: true,
        call: callRecord,
      });
    } catch (error) {
      console.error('❌ Ошибка инициирования звонка:', error);
      res.status(500).json({
        success: false,
        error: 'Не удалось инициировать звонок',
      });
    }
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
