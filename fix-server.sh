#!/bin/bash
# Скрипт проверки и исправления проблем на сервере
# Использование: bash fix-server.sh

set -e

SERVER_HOST="82.146.44.126"
SERVER_USER="root"
SERVER_PASS="carFds43"
REPO_URL="https://github.com/ebusorgin/timer_apk.git"

echo "🔍 Проверка и исправление проблем на сервере..."

# Функция для выполнения команд на сервере
ssh_exec() {
    sshpass -p "$SERVER_PASS" ssh -o StrictHostKeyChecking=no "$SERVER_USER@$SERVER_HOST" "$1"
}

# Функция для копирования файлов
scp_copy() {
    sshpass -p "$SERVER_PASS" scp -o StrictHostKeyChecking=no "$1" "$SERVER_USER@$SERVER_HOST:$2"
}

APP_DIR="/opt/voice-room"

echo "1️⃣ Проверка подключения к серверу..."
if ! ssh_exec "echo 'Connected'" > /dev/null 2>&1; then
    echo "❌ Не удается подключиться к серверу!"
    exit 1
fi
echo "✅ Подключение к серверу установлено"

echo "2️⃣ Проверка и установка зависимостей..."
ssh_exec "apt update && apt install -y nodejs npm nginx certbot python3-certbot-nginx git curl || true"

echo "3️⃣ Проверка Node.js..."
NODE_VERSION=$(ssh_exec "node --version || echo 'not installed'")
if [[ "$NODE_VERSION" == "not installed" ]]; then
    echo "📦 Установка Node.js..."
    ssh_exec "curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt install -y nodejs"
else
    echo "✅ Node.js установлен: $NODE_VERSION"
fi

echo "4️⃣ Проверка директории приложения..."
ssh_exec "mkdir -p $APP_DIR && chown -R voice-room:voice-room $APP_DIR 2>/dev/null || (useradd -r -s /bin/bash -d $APP_DIR -m voice-room && chown -R voice-room:voice-room $APP_DIR)"

echo "5️⃣ Клонирование/обновление репозитория..."
ssh_exec "cd $APP_DIR && if [ -d '.git' ]; then git pull origin master || git pull origin main || true; else git clone $REPO_URL .; fi"
ssh_exec "chown -R voice-room:voice-room $APP_DIR"

echo "6️⃣ Настройка переменных окружения..."
ssh_exec "cd $APP_DIR && cat > .env << 'EOF'
PORT=3000
HOST=127.0.0.1
CORS_ORIGIN=https://aiternitas.ru
NODE_ENV=production
MAX_USERS_PER_ROOM=10
ROOM_TIMEOUT_MINUTES=30
EOF"
ssh_exec "chown voice-room:voice-room $APP_DIR/.env"

echo "7️⃣ Установка зависимостей..."
ssh_exec "cd $APP_DIR && sudo -u voice-room npm ci --production || sudo -u voice-room npm install --production"

echo "8️⃣ Копирование конфигурации nginx..."
scp_copy "nginx.conf" "/tmp/nginx.conf"
ssh_exec "cp /tmp/nginx.conf /etc/nginx/sites-available/aiternitas.ru"
ssh_exec "ln -sf /etc/nginx/sites-available/aiternitas.ru /etc/nginx/sites-enabled/"
ssh_exec "rm -f /etc/nginx/sites-enabled/default"

echo "9️⃣ Проверка конфигурации nginx..."
if ssh_exec "nginx -t" 2>&1 | grep -q "successful"; then
    echo "✅ Конфигурация nginx корректна"
    ssh_exec "systemctl reload nginx || systemctl restart nginx"
else
    echo "⚠️ Проблемы с конфигурацией nginx, исправляю..."
    ssh_exec "nginx -t"
fi

echo "🔟 Получение SSL сертификата..."
if ssh_exec "certbot certificates 2>/dev/null | grep -q aiternitas.ru"; then
    echo "✅ SSL сертификат уже существует"
else
    echo "📜 Получение SSL сертификата..."
    ssh_exec "certbot --nginx -d aiternitas.ru -d www.aiternitas.ru --non-interactive --agree-tos --email admin@aiternitas.ru --redirect || echo 'SSL setup failed, continuing...'"
fi

echo "1️⃣1️⃣ Настройка systemd service..."
scp_copy "voice-room.service" "/tmp/voice-room.service"
ssh_exec "cp /tmp/voice-room.service /etc/systemd/system/"
ssh_exec "systemctl daemon-reload"
ssh_exec "systemctl enable voice-room || true"

echo "1️⃣2️⃣ Запуск приложения..."
ssh_exec "cd $APP_DIR && sudo -u voice-room node server/server.mjs &" || true
sleep 2
ssh_exec "systemctl restart voice-room || systemctl start voice-room"

echo "1️⃣3️⃣ Проверка статуса сервиса..."
sleep 3
if ssh_exec "systemctl is-active voice-room" > /dev/null 2>&1; then
    echo "✅ Сервис запущен"
else
    echo "⚠️ Проблемы с запуском сервиса, проверяю логи..."
    ssh_exec "journalctl -u voice-room -n 50 --no-pager"
    echo "Попытка запуска напрямую..."
    ssh_exec "cd $APP_DIR && sudo -u voice-room nohup node server/server.mjs > /tmp/voice-room.log 2>&1 &"
fi

echo "1️⃣4️⃣ Проверка firewall..."
ssh_exec "ufw allow ssh || true"
ssh_exec "ufw allow 'Nginx Full' || true"
ssh_exec "ufw allow 3000/tcp || true"
ssh_exec "ufw --force enable || true"

echo "1️⃣5️⃣ Проверка доступности приложения..."
sleep 5
if ssh_exec "curl -f http://127.0.0.1:3000 > /dev/null 2>&1"; then
    echo "✅ Приложение отвечает на порту 3000"
else
    echo "⚠️ Приложение не отвечает на порту 3000"
    echo "Проверка процесса..."
    ssh_exec "ps aux | grep node || echo 'Node процесс не найден'"
    echo "Проверка порта..."
    ssh_exec "netstat -tulpn | grep 3000 || ss -tulpn | grep 3000 || echo 'Порт 3000 не прослушивается'"
fi

echo "1️⃣6️⃣ Финальная проверка nginx..."
ssh_exec "systemctl status nginx --no-pager | head -10 || true"

echo ""
echo "✅ Проверка и исправление завершены!"
echo "🌐 Проверьте сайт: https://aiternitas.ru"
echo "📋 Для просмотра логов: ssh $SERVER_USER@$SERVER_HOST 'journalctl -u voice-room -f'"

