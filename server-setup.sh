#!/bin/bash
# Автоматическая настройка сервера
# Запуск на сервере: bash <(curl -s https://raw.githubusercontent.com/ebusorgin/timer_apk/master/server-setup.sh)

set -e

APP_DIR="/opt/voice-room"
REPO_URL="https://github.com/ebusorgin/timer_apk.git"
DOMAIN="aiternitas.ru"

echo "🚀 Начало автоматической настройки сервера..."

# Обновление системы
echo "📦 Обновление системы..."
apt update && apt upgrade -y

# Установка базовых зависимостей
echo "📦 Установка зависимостей..."
apt install -y curl wget git build-essential ufw certbot python3-certbot-nginx nginx

# Установка Node.js
if ! command -v node &> /dev/null; then
    echo "📦 Установка Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
else
    echo "✅ Node.js уже установлен: $(node --version)"
fi

# Создание пользователя
if ! id "voice-room" &>/dev/null; then
    echo "👤 Создание пользователя voice-room..."
    useradd -r -s /bin/bash -d "$APP_DIR" -m voice-room
else
    echo "✅ Пользователь voice-room уже существует"
fi

# Создание директории
mkdir -p "$APP_DIR"
chown -R voice-room:voice-room "$APP_DIR"

# Клонирование репозитория
echo "📥 Клонирование репозитория..."
cd "$APP_DIR"
if [ -d ".git" ]; then
    echo "Обновление существующего репозитория..."
    sudo -u voice-room git fetch origin || true
    sudo -u voice-room git reset --hard origin/master || sudo -u voice-room git reset --hard origin/main || true
    sudo -u voice-room git clean -fd || true
else
    echo "Клонирование нового репозитория..."
    if [ "$(ls -A $APP_DIR)" ]; then
        echo "Директория не пустая, очищаю..."
        rm -rf "$APP_DIR"/* "$APP_DIR"/.[!.]* 2>/dev/null || true
    fi
    sudo -u voice-room git clone "$REPO_URL" .
fi
chown -R voice-room:voice-room "$APP_DIR"

# Настройка переменных окружения
echo "📝 Настройка переменных окружения..."
cat > "$APP_DIR/.env" << EOF
PORT=3000
HOST=127.0.0.1
CORS_ORIGIN=https://aiternitas.ru
NODE_ENV=production
MAX_USERS_PER_ROOM=10
ROOM_TIMEOUT_MINUTES=30
EOF
chown voice-room:voice-room "$APP_DIR/.env"

# Установка зависимостей
echo "📦 Установка npm зависимостей..."
cd "$APP_DIR"
sudo -u voice-room npm ci --production || sudo -u voice-room npm install --production

# Настройка nginx
echo "🌐 Настройка nginx..."
cat > /etc/nginx/sites-available/aiternitas.ru << 'NGINX_EOF'
# HTTP сервер
server {
    listen 80;
    listen [::]:80;
    server_name aiternitas.ru www.aiternitas.ru;

    # Для Let's Encrypt
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Проксирование на Node.js приложение
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        proxy_cache_bypass $http_upgrade;
        proxy_buffering off;
    }

    # WebSocket поддержка для Socket.IO
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        proxy_cache_bypass $http_upgrade;
        proxy_buffering off;
    }
}
NGINX_EOF

ln -sf /etc/nginx/sites-available/aiternitas.ru /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Проверка и перезапуск nginx
nginx -t && systemctl reload nginx

# Настройка systemd service
echo "⚙️ Настройка systemd service..."
cat > /etc/systemd/system/voice-room.service << 'SERVICE_EOF'
[Unit]
Description=Voice Room Application
After=network.target

[Service]
Type=simple
User=voice-room
WorkingDirectory=/opt/voice-room
Environment="NODE_ENV=production"
Environment="PORT=3000"
Environment="HOST=127.0.0.1"
Environment="CORS_ORIGIN=https://aiternitas.ru"
EnvironmentFile=-/opt/voice-room/.env
ExecStart=/usr/bin/node server/server.mjs
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=voice-room

# Безопасность
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/voice-room

[Install]
WantedBy=multi-user.target
SERVICE_EOF

systemctl daemon-reload
systemctl enable voice-room

# Запуск сервиса
echo "🚀 Запуск приложения..."
systemctl restart voice-room || systemctl start voice-room

# Настройка firewall
echo "🔥 Настройка firewall..."
ufw --force enable || true
ufw allow ssh || true
ufw allow 'Nginx Full' || true
ufw allow 3000/tcp || true

# Проверка статуса
sleep 10
echo "🔍 Проверка статуса..."
if systemctl is-active --quiet voice-room; then
    echo "✅ Сервис запущен"
    systemctl status voice-room --no-pager | head -10
else
    echo "⚠️ Проблемы с запуском сервиса, проверяю логи..."
    journalctl -u voice-room -n 30 --no-pager || true
    echo "Попытка перезапуска..."
    systemctl restart voice-room || systemctl start voice-room || true
    sleep 5
    if systemctl is-active --quiet voice-room; then
        echo "✅ Сервис запущен после перезапуска"
    else
        echo "❌ Сервис не запускается, проверяю процесс..."
        ps aux | grep node | grep -v grep || echo "Node процесс не найден"
        echo "Попытка запуска напрямую..."
        cd "$APP_DIR"
        sudo -u voice-room nohup node server/server.mjs > /tmp/voice-room.log 2>&1 &
        sleep 3
    fi
fi

# Проверка доступности
sleep 5
if curl -f http://127.0.0.1:3000 > /dev/null 2>&1; then
    echo "✅ Приложение отвечает на порту 3000"
else
    echo "⚠️ Приложение не отвечает, проверяю процесс..."
    ps aux | grep node | grep -v grep || echo "Node процесс не найден"
    netstat -tulpn | grep 3000 || ss -tulpn | grep 3000 || echo "Порт 3000 не прослушивается"
    if [ -f "/tmp/voice-room.log" ]; then
        echo "Логи приложения:"
        tail -20 /tmp/voice-room.log || true
    fi
fi

echo ""
echo "✅ Настройка завершена!"
echo "🌐 Сайт доступен: http://aiternitas.ru"
echo "📋 Логи: journalctl -u voice-room -f"

