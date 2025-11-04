#!/bin/bash
# Скрипт для первоначальной настройки сервера через SSH
# Использование: bash remote-setup.sh

set -e

SERVER_HOST="82.146.44.126"
SERVER_USER="root"
SERVER_PASS="carFds43"
REPO_URL="https://github.com/ebusorgin/timer_apk.git"

echo "🚀 Начало настройки сервера $SERVER_HOST"

# Установка sshpass если нужно (для автоматизации)
if ! command -v sshpass &> /dev/null; then
    echo "⚠️  sshpass не установлен. Установите: sudo apt install sshpass (Linux) или используйте SSH ключи"
    echo "Продолжаем без sshpass..."
    USE_SSHPASS=false
else
    USE_SSHPASS=true
fi

# Функция для выполнения команд на сервере
ssh_exec() {
    local cmd="$1"
    if [ "$USE_SSHPASS" = true ]; then
        sshpass -p "$SERVER_PASS" ssh -o StrictHostKeyChecking=no "$SERVER_USER@$SERVER_HOST" "$cmd"
    else
        ssh -o StrictHostKeyChecking=no "$SERVER_USER@$SERVER_HOST" "$cmd"
    fi
}

# Функция для копирования файлов
scp_copy() {
    local src="$1"
    local dst="$2"
    if [ "$USE_SSHPASS" = true ]; then
        sshpass -p "$SERVER_PASS" scp -o StrictHostKeyChecking=no "$src" "$SERVER_USER@$SERVER_HOST:$dst"
    else
        scp -o StrictHostKeyChecking=no "$src" "$SERVER_USER@$SERVER_HOST:$dst"
    fi
}

echo "📤 Копирование файлов на сервер..."
scp_copy "setup-server.sh" "/tmp/"
scp_copy "deploy.sh" "/tmp/"
scp_copy "nginx.conf" "/tmp/"
scp_copy "voice-room.service" "/tmp/"

echo "⚙️  Выполнение первоначальной настройки сервера..."
ssh_exec "bash /tmp/setup-server.sh"

echo "📁 Настройка директории приложения..."
APP_DIR="/opt/voice-room"
ssh_exec "mkdir -p $APP_DIR && chown -R voice-room:voice-room $APP_DIR"

echo "🌐 Настройка nginx..."
ssh_exec "cp /tmp/nginx.conf /etc/nginx/sites-available/aiternitas.ru"
ssh_exec "ln -sf /etc/nginx/sites-available/aiternitas.ru /etc/nginx/sites-enabled/"
ssh_exec "rm -f /etc/nginx/sites-enabled/default"
ssh_exec "nginx -t && systemctl reload nginx || echo 'Nginx уже настроен'"

echo "🔒 Получение SSL сертификата..."
ssh_exec "certbot --nginx -d aiternitas.ru -d www.aiternitas.ru --non-interactive --agree-tos --email admin@aiternitas.ru || echo 'SSL уже настроен или требуется ручная настройка'"

echo "📦 Клонирование репозитория..."
ssh_exec "cd $APP_DIR && git clone $REPO_URL . || (cd $APP_DIR && git pull origin master)"

echo "⚙️  Настройка systemd service..."
ssh_exec "cp /tmp/voice-room.service /etc/systemd/system/"
ssh_exec "systemctl daemon-reload"

echo "📝 Настройка переменных окружения..."
ssh_exec "cd $APP_DIR && cp .env.example .env 2>/dev/null || echo 'PORT=3000
HOST=127.0.0.1
CORS_ORIGIN=https://aiternitas.ru
NODE_ENV=production
MAX_USERS_PER_ROOM=10
ROOM_TIMEOUT_MINUTES=30' > .env"
ssh_exec "chown voice-room:voice-room $APP_DIR/.env"

echo "📦 Установка зависимостей..."
ssh_exec "cd $APP_DIR && sudo -u voice-room npm ci --production"

echo "📋 Копирование скрипта деплоя..."
ssh_exec "cp /tmp/deploy.sh $APP_DIR/ && chmod +x $APP_DIR/deploy.sh"

echo "🚀 Запуск приложения..."
ssh_exec "cd $APP_DIR && export GIT_REPO_URL='$REPO_URL' && bash deploy.sh master"

echo "✅ Настройка сервера завершена!"
echo "🌐 Приложение доступно: https://aiternitas.ru"
echo "📱 APK доступен: https://aiternitas.ru/download/apk"

