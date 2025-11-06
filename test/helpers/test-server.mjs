import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let testServer = null;
let testIo = null;
let testHttpServer = null;
const TEST_DB_PATH = path.join(__dirname, '..', '..', 'data', 'test-users.json');

// Инициализация тестовой БД
function initTestDB() {
    const testDbDir = path.dirname(TEST_DB_PATH);
    if (!existsSync(testDbDir)) {
        mkdirSync(testDbDir, { recursive: true });
    }
    const initialData = {
        users: [],
        lastId: 0
    };
    writeFileSync(TEST_DB_PATH, JSON.stringify(initialData, null, 2), 'utf8');
}

// Чтение тестовой БД
function readTestDB() {
    try {
        const data = readFileSync(TEST_DB_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        initTestDB();
        return { users: [], lastId: 0 };
    }
}

// Запись тестовой БД
function writeTestDB(data) {
    writeFileSync(TEST_DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// Получение пользователя по ID
function getUserById(userId) {
    const db = readTestDB();
    return db.users.find(u => u.id === userId);
}

// Получение пользователя по deviceId
function getUserByDeviceId(deviceId) {
    const db = readTestDB();
    return db.users.find(u => u.deviceId === deviceId);
}

// Сохранение пользователя
function saveUser(user) {
    const db = readTestDB();
    const existingIndex = db.users.findIndex(u => u.id === user.id);
    
    if (existingIndex >= 0) {
        db.users[existingIndex] = { ...db.users[existingIndex], ...user };
    } else {
        db.lastId = (db.lastId || 0) + 1;
        user.id = user.id || db.lastId;
        db.users.push(user);
    }
    
    writeTestDB(db);
    return user;
}

// Запуск тестового сервера
export async function startTestServer(port = 3001) {
    if (testServer) {
        return { server: testServer, io: testIo, port };
    }

    initTestDB();

    const app = express();
    testHttpServer = createServer(app);
    
    testIo = new Server(testHttpServer, {
        cors: { origin: "*" }
    });

    const connections = new Map();

    testIo.on('connection', (socket) => {
        socket.on('register', async ({ userId, deviceId, name }, callback) => {
            try {
                let user;
                
                if (userId && getUserById(userId)) {
                    user = getUserById(userId);
                    user.online = true;
                    user.lastSeen = new Date().toISOString();
                } else if (deviceId && getUserByDeviceId(deviceId)) {
                    user = getUserByDeviceId(deviceId);
                    user.online = true;
                    user.lastSeen = new Date().toISOString();
                } else {
                    user = {
                        id: null,
                        role: 'participant',
                        deviceId: deviceId || socket.id,
                        name: name || `User_${Date.now()}`,
                        online: true,
                        createdAt: new Date().toISOString(),
                        lastSeen: new Date().toISOString()
                    };
                }

                user = saveUser(user);
                connections.set(socket.id, { userId: user.id, role: user.role, deviceId: user.deviceId });

                const db = readTestDB();
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

                socket.broadcast.emit('user-connected', {
                    user: {
                        id: user.id,
                        name: user.name,
                        deviceId: user.deviceId
                    }
                });

                socket.emit('users-list', {
                    users: allOnlineUsers.map(u => ({
                        id: u.id,
                        name: u.name,
                        deviceId: u.deviceId
                    }))
                });

            } catch (error) {
                callback({ error: error.message });
            }
        });

        socket.on('init-peer', ({ targetUserId }, callback) => {
            const connection = connections.get(socket.id);
            if (!connection) {
                callback({ error: 'Не авторизован' });
                return;
            }

            const initiator = getUserById(connection.userId);
            const target = getUserById(targetUserId);
            
            if (!target || !target.online) {
                callback({ error: 'Целевой пользователь не найден или не в сети' });
                return;
            }

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

            testIo.to(targetSocketId).emit('peer-init', {
                fromUserId: initiator.id,
                fromName: initiator.name,
                fromDeviceId: initiator.deviceId
            });

            callback({ success: true });
        });

        socket.on('webrtc-signal', ({ targetUserId, signal, type }) => {
            const connection = connections.get(socket.id);
            if (!connection) return;

            const sender = getUserById(connection.userId);
            if (!sender) return;

            const target = getUserById(targetUserId);
            if (!target || !target.online) return;

            let targetSocketId = null;
            for (const [sid, conn] of connections.entries()) {
                if (conn.userId === target.id) {
                    targetSocketId = sid;
                    break;
                }
            }

            if (targetSocketId) {
                testIo.to(targetSocketId).emit('webrtc-signal', {
                    fromUserId: sender.id,
                    fromName: sender.name,
                    signal,
                    type
                });
            }
        });

        socket.on('disconnect', () => {
            const connection = connections.get(socket.id);
            if (connection) {
                const user = getUserById(connection.userId);
                if (user) {
                    user.online = false;
                    user.lastSeen = new Date().toISOString();
                    saveUser(user);
                    
                    socket.broadcast.emit('user-disconnected', {
                        userId: user.id
                    });
                }
                connections.delete(socket.id);
            }
        });
    });

    return new Promise((resolve, reject) => {
        testHttpServer.once('error', (err) => {
            reject(err);
        });
        
        testHttpServer.listen(port, '127.0.0.1', () => {
            testServer = { app, server: testHttpServer, io: testIo };
            resolve({ server: testServer, io: testIo, port });
        });
    });
}

// Остановка тестового сервера
export async function stopTestServer() {
    return new Promise((resolve) => {
        if (testHttpServer) {
            testHttpServer.close(() => {
                testServer = null;
                testIo = null;
                testHttpServer = null;
                resolve();
            });
        } else {
            resolve();
        }
    });
}

// Очистка тестовой БД
export function cleanupTestDB() {
    if (existsSync(TEST_DB_PATH)) {
        unlinkSync(TEST_DB_PATH);
    }
    initTestDB();
}

