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
    cors: { origin: CORS_ORIGIN }
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
    connections.add(socket.id);

    // Отправляем новому пользователю список всех подключенных (кроме него самого)
    const otherConnections = Array.from(connections).filter(id => id !== socket.id);
    socket.emit('users-list', { users: otherConnections });

    // Уведомляем всех других о новом подключении
    socket.broadcast.emit('user-connected', { socketId: socket.id });

    // WebRTC сигнализация - просто передаем сигналы между сокетами
    socket.on('webrtc-signal', ({ targetSocketId, signal, type }) => {
        if (connections.has(targetSocketId)) {
            io.to(targetSocketId).emit('webrtc-signal', {
                fromSocketId: socket.id,
                signal,
                type
            });
        }
    });

    // Отключение
    socket.on('disconnect', () => {
        connections.delete(socket.id);
        console.log('👋 Клиент отключен:', socket.id);
        
        // Уведомляем других
        socket.broadcast.emit('user-disconnected', { socketId: socket.id });
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
