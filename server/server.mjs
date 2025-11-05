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
// Обработка cordova.js - возвращаем пустой файл для браузера (в Cordova он будет доступен локально)
app.get('/cordova.js', (req, res) => {
    // Проверяем наличие реального файла cordova.js
    const cordovaPath = path.join(wwwPath, 'cordova.js');
    if (existsSync(cordovaPath)) {
        // Если файл существует, отдаем его (для разработки)
        res.type('application/javascript');
        createReadStream(cordovaPath).pipe(res);
    } else {
        // Если файла нет (что нормально для веб-версии), возвращаем пустой JS файл
        // Это предотвращает 404 ошибки и проблемы с MIME type
        res.type('application/javascript');
        res.send('// Cordova.js placeholder - этот файл доступен только в Cordova приложении\n');
    }
});

app.use(express.static(wwwPath));


// Эндпоинт для скачивания APK
app.get('/download/apk', (req, res) => {
    const apkPaths = [
        path.join(__dirname, '..', 'app-debug.apk'), // Приоритет debug APK - он подписан и готов к установке
        path.join(__dirname, '..', 'app-release.apk'),
        path.join(__dirname, '..', 'platforms', 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'),
        path.join(__dirname, '..', 'platforms', 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'), // Подписанный release
        path.join(__dirname, '..', 'platforms', 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release-unsigned.apk'),
    ];
    
    let apkPath = null;
    for (const testPath of apkPaths) {
        if (existsSync(testPath)) {
            const stats = statSync(testPath);
            // Проверка валидности APK - размер должен быть больше 1KB
            if (stats.size < 1000) {
                console.warn(`⚠️  APK файл слишком маленький (${stats.size} байт), пропускаем: ${testPath}`);
                continue;
            }
            apkPath = testPath;
            console.log(`✅ Найден APK файл: ${apkPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
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
    const fileStats = statSync(apkPath);
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', 'attachment; filename="voice-room.apk"');
    res.setHeader('Content-Length', fileStats.size);
    
    // Добавляем заголовки для предотвращения кеширования и повреждения файла
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    console.log(`Отправка APK файла: ${apkPath} (${(fileStats.size / 1024 / 1024).toFixed(2)} MB)`);
    
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

// Глобальный чат (одна "комната" без ID)
const globalChat = {
    users: new Map(),
    created: Date.now(),
    lastActivity: Date.now()
};

// Константы
const MAX_USERS_PER_CHAT = parseInt(process.env.MAX_USERS_PER_ROOM || '100', 10);

// Функция для санитизации строки (защита от XSS)
function sanitizeString(str) {
    if (typeof str !== 'string') return '';
    return str
        .replace(/[<>]/g, '') // Удаляем HTML теги
        .trim();
}


io.on('connection', (socket) => {
    console.log('✅ Client connected:', socket.id);

    socket.on('join-chat', ({ username }, callback) => {
        // Санитизируем username
        const sanitizedUsername = sanitizeString(username) || `User_${Date.now()}`;
        
        // Проверка количества пользователей
        if (globalChat.users.size >= MAX_USERS_PER_CHAT) {
            console.error('❌ Chat is full');
            if (callback && typeof callback === 'function') {
                callback({ error: `Chat is full (max ${MAX_USERS_PER_CHAT} users)` });
            }
            return;
        }
        
        const userId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
        globalChat.users.set(userId, { socketId: socket.id, username: sanitizedUsername });
        globalChat.lastActivity = Date.now();
        
        const existingUsers = Array.from(globalChat.users.entries())
            .filter(([id]) => id !== userId)
            .map(([id, u]) => ({ userId: id, username: u.username }));
        
        console.log('✅ User joined chat:', 'User ID:', userId);
        
        if (callback && typeof callback === 'function') {
            callback({ userId, users: existingUsers });
        }
        
        socket.broadcast.emit('user-joined', { userId, username: sanitizedUsername });
    });

    socket.on('leave-chat', () => {
        for (const [userId, user] of globalChat.users.entries()) {
            if (user.socketId === socket.id) {
                globalChat.users.delete(userId);
                socket.broadcast.emit('user-left', userId);
                console.log('👋 User left chat:', 'User ID:', userId);
                break;
            }
        }
    });

    socket.on('offer', (data) => {
        const targetUserId = data.targetUserId;
        const fromUserId = data.fromUserId;
        
        if (!targetUserId || !fromUserId) {
            console.error('❌ Missing targetUserId or fromUserId in offer:', data);
            return;
        }
        
        const { offer } = data;
        
        // Проверяем, что оба пользователя в чате
        const fromUserExists = Array.from(globalChat.users.values()).some(u => u.socketId === socket.id);
        const targetUserExists = globalChat.users.has(targetUserId);
        
        if (!fromUserExists || !targetUserExists) {
            console.error('❌ Invalid users in offer:', { fromUserId, targetUserId });
            return;
        }
        
        globalChat.lastActivity = Date.now();
        socket.broadcast.emit('offer', { offer, targetUserId, fromUserId });
    });

    socket.on('answer', (data) => {
        const targetUserId = data.targetUserId;
        const fromUserId = data.fromUserId;
        
        if (!targetUserId || !fromUserId) {
            console.error('❌ Missing targetUserId or fromUserId in answer:', data);
            return;
        }
        
        const { answer } = data;
        
        globalChat.lastActivity = Date.now();
        socket.broadcast.emit('answer', { answer, targetUserId, fromUserId });
    });

    socket.on('ice-candidate', (data) => {
        const targetUserId = data.targetUserId;
        const fromUserId = data.fromUserId;
        
        if (!targetUserId || !fromUserId) {
            console.error('❌ Missing targetUserId or fromUserId in ice-candidate:', data);
            return;
        }
        
        const { candidate } = data;
        
        globalChat.lastActivity = Date.now();
        socket.broadcast.emit('ice-candidate', { candidate, targetUserId, fromUserId });
    });
    
    socket.on('microphone-status', (data) => {
        const { enabled, userId } = data;
        
        // Проверяем, что пользователь в чате
        const userExists = globalChat.users.has(userId);
        if (!userExists) {
            console.error('❌ User not found in chat:', userId);
            return;
        }
        
        globalChat.lastActivity = Date.now();
        // Отправляем статус микрофона всем остальным участникам
        socket.broadcast.emit('microphone-status', { userId, enabled });
    });
    
    socket.on('request-microphone-status', (data) => {
        const { targetUserId } = data;
        
        // Проверяем, что целевой пользователь в чате
        const targetUserExists = globalChat.users.has(targetUserId);
        if (!targetUserExists) {
            console.error('❌ Target user not found in chat:', targetUserId);
            return;
        }
        
        // Находим socket ID целевого пользователя и отправляем ему запрос
        const targetUser = globalChat.users.get(targetUserId);
        if (targetUser && targetUser.socketId) {
            io.to(targetUser.socketId).emit('request-microphone-status', {});
        }
    });

    socket.on('disconnect', () => {
        console.log('⚠️ Client disconnected:', socket.id);
        
        for (const [userId, user] of globalChat.users.entries()) {
            if (user.socketId === socket.id) {
                globalChat.users.delete(userId);
                socket.broadcast.emit('user-left', userId);
                console.log('👋 User disconnected from chat:', 'User ID:', userId);
                break;
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
