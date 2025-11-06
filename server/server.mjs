import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);

const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const io = new Server(server, {
    path: '/socket.io/',
    cors: { 
        origin: CORS_ORIGIN,
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000
});

// Статический контент для веб-версии
const wwwPath = path.join(__dirname, '..', 'www');
if (existsSync(wwwPath)) {
    app.use(express.static(wwwPath));
}

// Обработка cordova.js
app.get('/cordova.js', (req, res) => {
    res.type('application/javascript');
    res.send('// Cordova.js placeholder\n');
});

// Хранение активных соединений: socketId -> socketId (просто список)
const connections = new Set();

// Подключение пользователя
io.on('connection', (socket) => {
    console.log('✅ Клиент подключен:', socket.id);
    console.log('📊 Всего подключений:', connections.size + 1);
    connections.add(socket.id);

    // Отправляем новому пользователю список всех подключенных (кроме него самого)
    // Используем setImmediate для асинхронной отправки, чтобы дать клиенту время зарегистрировать обработчики
    setImmediate(() => {
        const otherConnections = Array.from(connections).filter(id => id !== socket.id);
        console.log(`📋 [${socket.id}] Подготовка к отправке списка пользователей:`, otherConnections.length, 'участников');
        console.log(`📋 [${socket.id}] Список участников:`, otherConnections);
        
        if (socket.connected) {
            socket.emit('users-list', { users: otherConnections });
            console.log(`✅ [${socket.id}] Событие users-list отправлено (${otherConnections.length} участников)`);
        } else {
            console.warn(`⚠️ [${socket.id}] Сокет уже отключен, не отправляем users-list`);
        }
    });

    // Уведомляем всех других о новом подключении с небольшой задержкой
    setImmediate(() => {
        const otherConnections = Array.from(connections).filter(id => id !== socket.id);
        if (otherConnections.length > 0 && socket.connected) {
            console.log(`📢 [${socket.id}] Уведомление ${otherConnections.length} участников о новом подключении`);
            socket.broadcast.emit('user-connected', { socketId: socket.id });
            console.log(`✅ [${socket.id}] Событие user-connected отправлено всем остальным`);
        }
    });

    // WebRTC сигнализация - просто передаем сигналы между сокетами
    socket.on('webrtc-signal', ({ targetSocketId, signal, type }) => {
        console.log(`📡 [${socket.id}] WebRTC сигнал -> ${targetSocketId}, тип: ${type}`);
        if (connections.has(targetSocketId)) {
            io.to(targetSocketId).emit('webrtc-signal', {
                fromSocketId: socket.id,
                signal,
                type
            });
            console.log(`✅ [${socket.id}] Сигнал доставлен ${targetSocketId}`);
        } else {
            console.warn(`⚠️ [${socket.id}] Целевой сокет ${targetSocketId} не найден в connections`);
            console.warn(`⚠️ [${socket.id}] Доступные соединения:`, Array.from(connections));
        }
    });

    // Отключение
    socket.on('disconnect', (reason) => {
        const wasConnected = connections.has(socket.id);
        connections.delete(socket.id);
        console.log(`👋 [${socket.id}] Клиент отключен, причина: ${reason}`);
        console.log(`📊 [${socket.id}] Всего подключений после отключения: ${connections.size}`);
        
        if (wasConnected) {
            // Уведомляем других
            socket.broadcast.emit('user-disconnected', { socketId: socket.id });
            console.log(`✅ [${socket.id}] Событие user-disconnected отправлено всем остальным`);
        }
    });
});

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
    console.log(`✅ Сервер запущен на порту ${PORT}`);
    console.log(`📱 Веб-версия доступна: http://localhost:${PORT}`);
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ Порт ${PORT} уже занят!`);
    } else {
        console.error('❌ Ошибка при запуске сервера:', err.message);
    }
    process.exit(1);
});
