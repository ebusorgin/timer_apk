# Быстрая настройка сервера - выполните эти команды на сервере

# Подключитесь к серверу:
# ssh root@82.146.44.126

# Затем выполните:
cd /opt
mkdir -p voice-room
cd voice-room

# Клонируйте репозиторий или обновите
if [ -d ".git" ]; then
  git pull origin master
else
  git clone https://github.com/ebusorgin/timer_apk.git .
fi

# Выполните скрипт настройки
bash deploy.sh master || bash server-setup.sh

# Или выполните настройку вручную:
# 1. Установите зависимости
apt update && apt install -y nodejs npm nginx git curl

# 2. Настройте nginx
cp nginx.conf /etc/nginx/sites-available/aiternitas.ru
ln -sf /etc/nginx/sites-available/aiternitas.ru /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# 3. Настройте переменные окружения
cat > .env << EOF
PORT=3000
HOST=127.0.0.1
CORS_ORIGIN=https://aiternitas.ru
NODE_ENV=production
MAX_USERS_PER_ROOM=10
ROOM_TIMEOUT_MINUTES=30
EOF

# 4. Установите зависимости
npm ci --production || npm install --production

# 5. Настройте systemd service
cp voice-room.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable voice-room
systemctl start voice-room

# 6. Проверьте статус
systemctl status voice-room
curl http://127.0.0.1:3000

