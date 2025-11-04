#!/bin/bash
# Скрипт полной настройки и деплоя на сервер
# Использование: bash full-deploy.sh

set -e

SERVER_HOST="82.146.44.126"
SERVER_USER="root"
SERVER_PASS="carFds43"
REPO_URL="https://github.com/ebusorgin/timer_apk.git"

echo "🚀 Начало полного деплоя на сервер $SERVER_HOST"

# Создаем временный скрипт для выполнения на сервере
cat > /tmp/deploy-remote.sh << 'REMOTE_SCRIPT'
#!/bin/bash
set -e

APP_DIR="/opt/voice-room"
DOMAIN="aiternitas.ru"

echo "📦 Установка зависимостей на сервере..."
apt update && apt upgrade -y
apt install -y curl wget git build-essential ufw certbot python3-certbot-nginx

# Node.js
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
fi

# Nginx
if ! command -v nginx &> /dev/null; then
    apt install -y nginx
    systemctl enable nginx
    systemctl start nginx
fi

# Создание пользователя
if ! id "voice-room" &>/dev/null; then
    useradd -r -s /bin/bash -d "$APP_DIR" -m voice-room
fi

mkdir -p "$APP_DIR"
chown -R voice-room:voice-room "$APP_DIR"

# Firewall
ufw --force enable
ufw allow ssh
ufw allow 'Nginx Full'
ufw allow 3000/tcp

echo "✅ Настройка сервера завершена"
REMOTE_SCRIPT

# Копируем файлы на сервер
echo "📤 Копирование файлов на сервер..."
sshpass -p "$SERVER_PASS" scp -o StrictHostKeyChecking=no setup-server.sh deploy.sh nginx.conf voice-room.service "$SERVER_USER@$SERVER_HOST:/tmp/"

# Выполняем настройку сервера
echo "⚙️  Выполнение настройки сервера..."
sshpass -p "$SERVER_PASS" ssh -o StrictHostKeyChecking=no "$SERVER_USER@$SERVER_HOST" 'bash /tmp/deploy-remote.sh'

# Копируем файлы деплоя
sshpass -p "$SERVER_PASS" ssh -o StrictHostKeyChecking=no "$SERVER_USER@$SERVER_HOST" "cp /tmp/deploy.sh $APP_DIR/ && cp /tmp/voice-room.service /etc/systemd/system/ && chmod +x $APP_DIR/deploy.sh"

# Настройка nginx
echo "🌐 Настройка nginx..."
sshpass -p "$SERVER_PASS" ssh -o StrictHostKeyChecking=no "$SERVER_USER@$SERVER_HOST" "
cp /tmp/nginx.conf /etc/nginx/sites-available/aiternitas.ru
ln -sf /etc/nginx/sites-available/aiternitas.ru /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
"

# Получение SSL
echo "🔒 Получение SSL сертификата..."
sshpass -p "$SERVER_PASS" ssh -o StrictHostKeyChecking=no "$SERVER_USER@$SERVER_HOST" "certbot --nginx -d aiternitas.ru -d www.aiternitas.ru --non-interactive --agree-tos --email admin@aiternitas.ru || echo 'SSL уже настроен'"

# Деплой приложения
echo "📦 Деплой приложения..."
sshpass -p "$SERVER_PASS" ssh -o StrictHostKeyChecking=no "$SERVER_USER@$SERVER_HOST" "
cd $APP_DIR
export GIT_REPO_URL='$REPO_URL'
bash deploy.sh master
"

echo "✅ Деплой завершен!"
echo "🌐 Приложение доступно: https://aiternitas.ru"

