import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, createReadStream, statSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Проверка наличия папки node_modules
const nodeModulesPath = path.join(__dirname, '..', 'node_modules');
if (!existsSync(nodeModulesPath)) {
    console.error('❌ Ошибка: Папка node_modules не найдена!');
    console.log('Выполните: npm install');
    process.exit(1);
}

const app = express();
const server = createServer(app);

// CORS настройки из переменных окружения
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const io = new Server(server, {
    cors: { origin: CORS_ORIGIN }
});

// Проверка наличия папки www
const wwwPath = path.join(__dirname, '..', 'www');
if (!existsSync(wwwPath)) {
    console.error('❌ Ошибка: Папка www не найдена!');
    process.exit(1);
}

// Используем www папку как статические файлы (общая папка для веб и Cordova)
app.use(express.static(wwwPath));

// Эндпоинт для скачивания APK
app.get('/download/apk', (req, res) => {
    const apkPaths = [
        path.join(__dirname, '..', 'app-release.apk'), // Главный путь - сюда копируется APK после сборки
        path.join(__dirname, '..', 'app-debug.apk'),
        path.join(__dirname, '..', 'platforms', 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release-unsigned.apk'),
        path.join(__dirname, '..', 'platforms', 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'),
        path.join(__dirname, '..', 'platforms', 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'), // Если есть подписанный
    ];
    
    let apkPath = null;
    for (const testPath of apkPaths) {
        if (existsSync(testPath)) {
            apkPath = testPath;
            console.log(`✅ Найден APK файл: ${apkPath}`);
            break;
        }
    }
    
    if (!apkPath) {
        // Логируем для отладки
        console.log('❌ APK файл не найден. Проверяемые пути:');
        apkPaths.forEach(p => console.log(`   - ${p}`));
        
        // Если файл не найден, отправляем понятное HTML сообщение с инструкциями
        res.status(404).type('text/html');
        res.send(`
            <!DOCTYPE html>
            <html lang="ru">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>APK не найден</title>
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                        max-width: 600px;
                        margin: 50px auto;
                        padding: 20px;
                        background: #f5f5f5;
                    }
                    .container {
                        background: white;
                        padding: 30px;
                        border-radius: 8px;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    }
                    h1 {
                        color: #e74c3c;
                        margin-top: 0;
                    }
                    .info {
                        background: #fff3cd;
                        border-left: 4px solid #ffc107;
                        padding: 15px;
                        margin: 20px 0;
                        border-radius: 4px;
                    }
                    code {
                        background: #f4f4f4;
                        padding: 2px 6px;
                        border-radius: 3px;
                        font-family: 'Courier New', monospace;
                        color: #c7254e;
                    }
                    .steps {
                        background: #e7f3ff;
                        border-left: 4px solid #2196F3;
                        padding: 15px;
                        margin: 20px 0;
                        border-radius: 4px;
                    }
                    .steps ol {
                        margin: 10px 0;
                        padding-left: 20px;
                    }
                    .steps li {
                        margin: 8px 0;
                    }
                    a {
                        color: #2196F3;
                        text-decoration: none;
                    }
                    a:hover {
                        text-decoration: underline;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>📱 APK файл не найден</h1>
                    
                    <div class="info">
                        <strong>Причина:</strong> APK файл еще не собран или не загружен на сервер.
                        Сборка APK требует Android SDK и Gradle, которые обычно не устанавливаются на сервере.
                    </div>
                    
                    <div class="steps">
                        <strong>Как загрузить APK на сервер:</strong>
                        <ol>
                            <li><strong>Соберите APK локально:</strong><br>
                                <code>npm run build</code><br>
                                APK будет в папке <code>platforms/android/app/build/outputs/apk/</code>
                            </li>
                            <li><strong>Загрузите APK на сервер:</strong><br>
                                <code>scp app-release.apk root@82.146.44.126:/opt/voice-room/app-release.apk</code><br>
                                Или используйте скрипт: <code>bash upload-apk.sh</code>
                            </li>
                            <li><strong>Проверьте доступность:</strong><br>
                                После загрузки файл будет доступен по ссылке:<br>
                                <a href="/download/apk">https://aiternitas.ru/download/apk</a>
                            </li>
                        </ol>
                    </div>
                    
                    <p><small>Проверяемые пути на сервере:</small></p>
                    <ul>
                        <li><code>app-release.apk</code> (главный путь)</li>
                        <li><code>platforms/android/app/build/outputs/apk/release/app-release-unsigned.apk</code></li>
                        <li><code>platforms/android/app/build/outputs/apk/debug/app-debug.apk</code></li>
                    </ul>
                </div>
            </body>
            </html>
        `);
        return;
    }
    
    // Устанавливаем правильные заголовки для скачивания APK файла
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', 'attachment; filename="voice-room.apk"');
    res.setHeader('Content-Length', statSync(apkPath).size);
    
    // Отправляем файл как бинарный поток
    const fileStream = createReadStream(apkPath);
    
    fileStream.on('error', (err) => {
        console.error('Ошибка при чтении APK файла:', err);
        if (!res.headersSent) {
            res.status(500).type('text/html');
            res.send(`
                <html>
                    <head><meta charset="UTF-8"><title>Ошибка</title></head>
                    <body>
                        <h1>Ошибка при чтении APK файла</h1>
                    </body>
                </html>
            `);
        }
    });
    
    fileStream.pipe(res);
});

const rooms = new Map();

// Константы для валидации из переменных окружения
const MAX_USERNAME_LENGTH = 20;
const MIN_USERNAME_LENGTH = 1;
const MAX_USERS_PER_ROOM = parseInt(process.env.MAX_USERS_PER_ROOM || '10', 10);
const ROOM_ID_LENGTH = 6;
const ROOM_TIMEOUT_MS = parseInt(process.env.ROOM_TIMEOUT_MINUTES || '30', 10) * 60 * 1000;

// Функция для санитизации строки (защита от XSS)
function sanitizeString(str) {
    if (typeof str !== 'string') return '';
    return str
        .replace(/[<>]/g, '') // Удаляем HTML теги
        .trim();
}

// Валидация username
function validateUsername(username) {
    if (!username || typeof username !== 'string') {
        return { valid: false, error: 'Username is required' };
    }
    
    const sanitized = sanitizeString(username);
    
    if (sanitized.length < MIN_USERNAME_LENGTH) {
        return { valid: false, error: `Username must be at least ${MIN_USERNAME_LENGTH} character` };
    }
    
    if (sanitized.length > MAX_USERNAME_LENGTH) {
        return { valid: false, error: `Username must be at most ${MAX_USERNAME_LENGTH} characters` };
    }
    
    // Проверка на допустимые символы (буквы, цифры, пробелы, дефисы, подчеркивания)
    if (!/^[a-zA-Zа-яА-ЯёЁ0-9\s\-_]+$/.test(sanitized)) {
        return { valid: false, error: 'Username contains invalid characters' };
    }
    
    return { valid: true, username: sanitized };
}

// Валидация roomId
function validateRoomId(roomId) {
    if (!roomId || typeof roomId !== 'string') {
        return { valid: false, error: 'Room ID is required' };
    }
    
    const sanitized = roomId.trim().toUpperCase();
    
    if (sanitized.length !== ROOM_ID_LENGTH) {
        return { valid: false, error: `Room ID must be ${ROOM_ID_LENGTH} characters long` };
    }
    
    // Проверка на допустимые символы (буквы и цифры)
    if (!/^[A-Z0-9]+$/.test(sanitized)) {
        return { valid: false, error: 'Room ID contains invalid characters' };
    }
    
    return { valid: true, roomId: sanitized };
}

function generateRoomId() {
    let roomId;
    do {
        roomId = Math.random().toString(36).substring(2, 2 + ROOM_ID_LENGTH).toUpperCase();
    } while (rooms.has(roomId)); // Гарантируем уникальность
    return roomId;
}

// Автоматическая очистка пустых комнат
function cleanupEmptyRooms() {
    const now = Date.now();
    for (const [roomId, room] of rooms.entries()) {
        // Удаляем комнаты, которые пустые и старые
        if (room.users.size === 0 && (now - room.created) > ROOM_TIMEOUT_MS) {
            rooms.delete(roomId);
            console.log(`🧹 Cleaned up empty room: ${roomId}`);
        }
    }
}

// Запускаем очистку каждые 5 минут
setInterval(cleanupEmptyRooms, 5 * 60 * 1000);

io.on('connection', (socket) => {
    console.log('✅ Client connected:', socket.id);

    socket.on('create-room', ({ username }, callback) => {
        // Валидация username
        const usernameValidation = validateUsername(username);
        if (!usernameValidation.valid) {
            console.error('❌ Invalid username:', usernameValidation.error);
            if (callback && typeof callback === 'function') {
                callback({ error: usernameValidation.error });
            }
            return;
        }
        
        const sanitizedUsername = usernameValidation.username;
        console.log('📝 Creating room for user:', sanitizedUsername);
        
        const roomId = generateRoomId();
        const userId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
        
        rooms.set(roomId, {
            users: new Map([[userId, { socketId: socket.id, username: sanitizedUsername }]]),
            created: Date.now(),
            lastActivity: Date.now()
        });
        
        socket.join(roomId);
        console.log('✅ Room created:', roomId, 'User ID:', userId);
        
        if (callback && typeof callback === 'function') {
            callback({ roomId, userId });
        } else {
            console.error('❌ Callback is not a function');
            socket.emit('room-created', { roomId, userId });
        }
    });

    socket.on('join-room', ({ roomId, username }, callback) => {
        // Валидация roomId
        const roomIdValidation = validateRoomId(roomId);
        if (!roomIdValidation.valid) {
            console.error('❌ Invalid room ID:', roomIdValidation.error);
            if (callback && typeof callback === 'function') {
                callback({ error: roomIdValidation.error });
            }
            return;
        }
        
        // Валидация username
        const usernameValidation = validateUsername(username);
        if (!usernameValidation.valid) {
            console.error('❌ Invalid username:', usernameValidation.error);
            if (callback && typeof callback === 'function') {
                callback({ error: usernameValidation.error });
            }
            return;
        }
        
        const sanitizedRoomId = roomIdValidation.roomId;
        const sanitizedUsername = usernameValidation.username;
        
        const room = rooms.get(sanitizedRoomId);
        if (!room) {
            console.error('❌ Room not found:', sanitizedRoomId);
            if (callback && typeof callback === 'function') {
                callback({ error: 'Room not found' });
            }
            return;
        }
        
        // Проверка количества пользователей
        if (room.users.size >= MAX_USERS_PER_ROOM) {
            console.error('❌ Room is full:', sanitizedRoomId);
            if (callback && typeof callback === 'function') {
                callback({ error: `Room is full (max ${MAX_USERS_PER_ROOM} users)` });
            }
            return;
        }
        
        const userId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
        room.users.set(userId, { socketId: socket.id, username: sanitizedUsername });
        room.lastActivity = Date.now();
        socket.join(sanitizedRoomId);
        
        const existingUsers = Array.from(room.users.entries())
            .filter(([id]) => id !== userId)
            .map(([id, u]) => ({ userId: id, username: u.username }));
        
        console.log('✅ User joined room:', sanitizedRoomId, 'User ID:', userId);
        
        if (callback && typeof callback === 'function') {
        callback({ userId, users: existingUsers });
        }
        
        socket.to(sanitizedRoomId).emit('user-joined', { userId, username: sanitizedUsername });
    });

    socket.on('leave-room', (data) => {
        if (!data || !data.roomId) return;
        const { roomId } = data;
        
        const roomIdValidation = validateRoomId(roomId);
        if (!roomIdValidation.valid) {
            console.error('❌ Invalid room ID in leave-room:', roomId);
            return;
        }
        
        const sanitizedRoomId = roomIdValidation.roomId;
        const room = rooms.get(sanitizedRoomId);
        if (!room) return;

        for (const [userId, user] of room.users.entries()) {
            if (user.socketId === socket.id) {
                room.users.delete(userId);
                socket.to(sanitizedRoomId).emit('user-left', userId);
                console.log('👋 User left room:', sanitizedRoomId, 'User ID:', userId);
                
                if (room.users.size === 0) {
                    rooms.delete(sanitizedRoomId);
                    console.log(`🗑️ Room deleted: ${sanitizedRoomId}`);
                }
                break;
            }
        }
    });

    socket.on('offer', (data) => {
        if (!data || !data.roomId) return;
        const { roomId, offer, targetUserId, fromUserId } = data;
        
        const roomIdValidation = validateRoomId(roomId);
        if (!roomIdValidation.valid) {
            console.error('❌ Invalid room ID in offer:', roomId);
            return;
        }
        
        const room = rooms.get(roomIdValidation.roomId);
        if (!room) {
            console.error('❌ Room not found in offer:', roomId);
            return;
        }
        
        // Проверяем, что оба пользователя в комнате
        const fromUserExists = Array.from(room.users.values()).some(u => u.socketId === socket.id);
        const targetUserExists = room.users.has(targetUserId);
        
        if (!fromUserExists || !targetUserExists) {
            console.error('❌ Invalid users in offer:', { roomId, fromUserId, targetUserId });
            return;
        }
        
        room.lastActivity = Date.now();
        socket.to(roomIdValidation.roomId).emit('offer', { offer, targetUserId, fromUserId });
    });

    socket.on('answer', (data) => {
        if (!data || !data.roomId) return;
        const { roomId, answer, targetUserId, fromUserId } = data;
        
        const roomIdValidation = validateRoomId(roomId);
        if (!roomIdValidation.valid) {
            console.error('❌ Invalid room ID in answer:', roomId);
            return;
        }
        
        const room = rooms.get(roomIdValidation.roomId);
        if (!room) {
            console.error('❌ Room not found in answer:', roomId);
            return;
        }
        
        room.lastActivity = Date.now();
        socket.to(roomIdValidation.roomId).emit('answer', { answer, targetUserId, fromUserId });
    });

    socket.on('ice-candidate', (data) => {
        if (!data || !data.roomId) return;
        const { roomId, candidate, targetUserId, fromUserId } = data;
        
        const roomIdValidation = validateRoomId(roomId);
        if (!roomIdValidation.valid) {
            console.error('❌ Invalid room ID in ice-candidate:', roomId);
            return;
        }
        
        const room = rooms.get(roomIdValidation.roomId);
        if (!room) {
            console.error('❌ Room not found in ice-candidate:', roomId);
            return;
        }
        
        room.lastActivity = Date.now();
        socket.to(roomIdValidation.roomId).emit('ice-candidate', { candidate, targetUserId, fromUserId });
    });

    socket.on('disconnect', () => {
        console.log('⚠️ Client disconnected:', socket.id);
        for (const [roomId, room] of rooms.entries()) {
            for (const [userId, user] of room.users.entries()) {
                if (user.socketId === socket.id) {
                    room.users.delete(userId);
                    socket.to(roomId).emit('user-left', userId);
                    console.log('👋 User disconnected from room:', roomId, 'User ID:', userId);
                    
                    if (room.users.size === 0) {
                        rooms.delete(roomId);
                        console.log('🗑️ Room deleted (empty):', roomId);
                    }
                    break;
                }
            }
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
        console.log(`   Используйте другой порт: PORT=3001 npm run server`);
    } else {
        console.error('❌ Ошибка при запуске сервера:', err.message);
    }
    process.exit(1);
});
