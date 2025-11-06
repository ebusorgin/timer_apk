import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);

const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const io = new Server(server, {
    cors: { origin: CORS_ORIGIN }
});

// Путь к JSON БД
const DB_PATH = path.join(__dirname, '..', 'data', 'users.json');
const DB_DIR = path.dirname(DB_PATH);

// Создаем директорию если не существует
if (!existsSync(DB_DIR)) {
    mkdirSync(DB_DIR, { recursive: true });
}

// Инициализация БД
function initDB() {
    if (!existsSync(DB_PATH)) {
        const initialData = {
            users: [],
            lastId: 0
        };
        writeFileSync(DB_PATH, JSON.stringify(initialData, null, 2), 'utf8');
    }
}

// Чтение БД
function readDB() {
    try {
        const data = readFileSync(DB_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Ошибка чтения БД:', error);
        initDB();
        return { users: [], lastId: 0 };
    }
}

// Запись БД
function writeDB(data) {
    try {
        writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('Ошибка записи БД:', error);
        return false;
    }
}

// Получение пользователя по ID
function getUserById(userId) {
    const db = readDB();
    return db.users.find(u => u.id === userId);
}

// Получение пользователя по deviceId
function getUserByDeviceId(deviceId) {
    const db = readDB();
    return db.users.find(u => u.deviceId === deviceId);
}

// Добавление/обновление пользователя
function saveUser(user) {
    const db = readDB();
    const existingIndex = db.users.findIndex(u => u.id === user.id);
    
    if (existingIndex >= 0) {
        db.users[existingIndex] = { ...db.users[existingIndex], ...user };
    } else {
        db.lastId = (db.lastId || 0) + 1;
        user.id = user.id || db.lastId;
        db.users.push(user);
    }
    
    writeDB(db);
    return user;
}

// Удаление пользователя
function removeUser(userId) {
    const db = readDB();
    db.users = db.users.filter(u => u.id !== userId);
    writeDB(db);
}

// Получение всех онлайн пользователей в конференции
function getAllOnlineUsers() {
    const db = readDB();
    return db.users.filter(u => u.online);
}

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

// Хранение активных соединений
const connections = new Map(); // socketId -> { userId, role, deviceId }

// Подключение пользователя
io.on('connection', (socket) => {
    console.log('✅ Клиент подключен:', socket.id);

    // Регистрация пользователя в конференции
    socket.on('register', async ({ userId, deviceId, name }, callback) => {
        try {
            let user;
            
            if (userId && getUserById(userId)) {
                // Обновление существующего пользователя
                user = getUserById(userId);
                user.online = true;
                user.lastSeen = new Date().toISOString();
            } else if (deviceId && getUserByDeviceId(deviceId)) {
                // Обновление по deviceId
                user = getUserByDeviceId(deviceId);
                user.online = true;
                user.lastSeen = new Date().toISOString();
            } else {
                // Создание нового пользователя
                user = {
                    id: null, // Будет присвоен при сохранении
                    role: 'participant', // Все пользователи равны
                    deviceId: deviceId || socket.id,
                    name: name || `User_${Date.now()}`,
                    online: true,
                    createdAt: new Date().toISOString(),
                    lastSeen: new Date().toISOString()
                };
            }

            user = saveUser(user);
            connections.set(socket.id, { userId: user.id, role: user.role, deviceId: user.deviceId });

            console.log(`✅ Пользователь присоединился к конференции: ${user.name} (ID: ${user.id})`);

            // Получаем всех онлайн пользователей (кроме текущего)
            const db = readDB();
            const allOnlineUsers = db.users.filter(u => u.online && u.id !== user.id);

            callback({
                success: true,
                user: {
                    id: user.id,
                    name: user.name
                },
                users: allOnlineUsers.map(u => ({
                    id: u.id,
                    name: u.name,
                    deviceId: u.deviceId
                }))
            });

            // Уведомляем всех других участников о новом подключении
            socket.broadcast.emit('user-connected', {
                user: {
                    id: user.id,
                    name: user.name,
                    deviceId: user.deviceId
                }
            });

            // Отправляем новому пользователю список всех подключенных
            socket.emit('users-list', {
                users: allOnlineUsers.map(u => ({
                    id: u.id,
                    name: u.name,
                    deviceId: u.deviceId
                }))
            });

        } catch (error) {
            console.error('Ошибка регистрации:', error);
            callback({ error: error.message });
        }
    });

    // Инициализация соединения с участником конференции
    socket.on('init-peer', ({ targetUserId }, callback) => {
        const connection = connections.get(socket.id);
        if (!connection) {
            callback({ error: 'Не авторизован' });
            return;
        }

        const initiator = getUserById(connection.userId);
        if (!initiator) {
            callback({ error: 'Пользователь не найден' });
            return;
        }

        const target = getUserById(targetUserId);
        if (!target || !target.online) {
            callback({ error: 'Целевой пользователь не найден или не в сети' });
            return;
        }

        // Находим socket целевого пользователя
        let targetSocketId = null;
        for (const [sid, conn] of connections.entries()) {
            if (conn.userId === target.id) {
                targetSocketId = sid;
                break;
            }
        }

        if (!targetSocketId) {
            callback({ error: 'Соединение с целевым пользователем не найдено' });
            return;
        }

        console.log(`🔗 Инициализация соединения: ${initiator.name} -> ${target.name}`);

        // Уведомляем целевого пользователя о необходимости установить соединение
        io.to(targetSocketId).emit('peer-init', {
            fromUserId: initiator.id,
            fromName: initiator.name,
            fromDeviceId: initiator.deviceId
        });

        callback({ success: true });
    });

    // WebRTC сигнализация
    socket.on('webrtc-signal', ({ targetUserId, signal, type }) => {
        const connection = connections.get(socket.id);
        if (!connection) return;

        const sender = getUserById(connection.userId);
        if (!sender) return;

        const target = getUserById(targetUserId);
        if (!target || !target.online) return;

        // Находим socket целевого пользователя
        let targetSocketId = null;
        for (const [sid, conn] of connections.entries()) {
            if (conn.userId === target.id) {
                targetSocketId = sid;
                break;
            }
        }

        if (targetSocketId) {
            io.to(targetSocketId).emit('webrtc-signal', {
                fromUserId: sender.id,
                fromName: sender.name,
                signal,
                type
            });
        }
    });

        // Отключение
    socket.on('disconnect', () => {
        const connection = connections.get(socket.id);
        if (connection) {
            const user = getUserById(connection.userId);
            if (user) {
                user.online = false;
                user.lastSeen = new Date().toISOString();
                saveUser(user);
                
                console.log(`👋 Пользователь покинул конференцию: ${user.name}`);
                
                // Уведомляем других
                socket.broadcast.emit('user-disconnected', {
                    userId: user.id
                });
            }
            connections.delete(socket.id);
        }
        console.log('⚠️ Клиент отключен:', socket.id);
    });
});

// Инициализация БД при запуске
initDB();

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
    console.log(`✅ Сервер запущен на порту ${PORT}`);
    console.log(`📱 Веб-версия доступна: http://localhost:${PORT}`);
    console.log(`💾 БД: ${DB_PATH}`);
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ Порт ${PORT} уже занят!`);
    } else {
        console.error('❌ Ошибка при запуске сервера:', err.message);
    }
    process.exit(1);
});

