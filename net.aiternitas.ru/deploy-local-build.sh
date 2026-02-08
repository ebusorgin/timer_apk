#!/bin/bash
# Деплой net.aiternitas.ru на поддомен (тот же сервер, что aiternitas.ru).
# Сборка веб-приложения локально, загрузка на сервер, systemd + nginx.

SERVER="root@82.146.44.126"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_rsa_aiternitas}"
REMOTE_DIR="/opt/net"
SERVICE_NAME="net.aiternitas.service"
PORT=3004
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

set -e

echo "=== Деплой net.aiternitas.ru (поддомен) ==="

# 1. Локальная сборка веб-приложения
echo ""
echo "[1/6] Сборка веб-приложения (web/dist)..."
cd "$SCRIPT_DIR"
npm run web:build || { echo "❌ Ошибка сборки web"; exit 1; }
echo "✅ Сборка web завершена"

# 2. Подготовка каталогов на сервере
echo ""
echo "[2/6] Подготовка каталогов на сервере..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SERVER" "mkdir -p $REMOTE_DIR/server $REMOTE_DIR/web/dist $REMOTE_DIR/data $REMOTE_DIR/shared $REMOTE_DIR/core"

# 3. Загрузка файлов
echo ""
echo "[3/6] Загрузка файлов на сервер..."
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SCRIPT_DIR/package.json" "$SERVER:$REMOTE_DIR/"
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no -r "$SCRIPT_DIR/server/"* "$SERVER:$REMOTE_DIR/server/"
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no -r "$SCRIPT_DIR/web/dist/"* "$SERVER:$REMOTE_DIR/web/dist/"
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no -r "$SCRIPT_DIR/shared/"* "$SERVER:$REMOTE_DIR/shared/"
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no -r "$SCRIPT_DIR/core/"* "$SERVER:$REMOTE_DIR/core/"
echo "  Загружены: package.json, server/, web/dist/, shared/, core/"
echo "✅ Файлы загружены"

# 4. .env и зависимости на сервере
echo ""
echo "[4/6] Настройка .env и установка зависимостей..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SERVER" "cd $REMOTE_DIR && \
  if [ -f .env ]; then \
    grep -q '^JWT_SECRET=' .env || echo \"JWT_SECRET=\$(openssl rand -hex 32)\" >> .env; \
    grep -q '^PORT=' .env && sed -i 's/^PORT=.*/PORT=$PORT/' .env || echo 'PORT=$PORT' >> .env; \
    grep -q '^NODE_ENV=' .env && sed -i 's/^NODE_ENV=.*/NODE_ENV=production/' .env || echo 'NODE_ENV=production' >> .env; \
  else \
    JWT=\$(openssl rand -hex 32); \
    printf 'PORT=%s\nNODE_ENV=production\nJWT_SECRET=%s\n' $PORT \"\$JWT\" > .env; \
  fi; \
  npm install --omit=dev"

# 5. Systemd-сервис
echo ""
echo "[5/6] Systemd-сервис $SERVICE_NAME..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SERVER" "cat > /etc/systemd/system/$SERVICE_NAME << 'EOF'
[Unit]
Description=net.aiternitas.ru (relay + web API)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$REMOTE_DIR
ExecStart=/usr/bin/node server/server.mjs
Restart=always
EnvironmentFile=$REMOTE_DIR/.env

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload && systemctl enable $SERVICE_NAME && systemctl restart $SERVICE_NAME"
echo "✅ Сервис перезапущен"

# 6. Nginx: конфиг поддомена
echo ""
echo "[6/6] Nginx: конфиг net.aiternitas.ru..."
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SCRIPT_DIR/nginx-net.conf" "$SERVER:/etc/nginx/sites-available/net.aiternitas.ru"
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SERVER" "ln -sf /etc/nginx/sites-available/net.aiternitas.ru /etc/nginx/sites-enabled/net.aiternitas.ru 2>/dev/null || true; nginx -t && systemctl reload nginx"
echo "✅ Nginx перезагружен"

echo ""
echo "=== ✅ Деплой завершён ==="
echo "Сайт: https://net.aiternitas.ru"
echo "Проверка: ssh -i $SSH_KEY $SERVER 'systemctl status $SERVICE_NAME --no-pager | head -15'"
echo ""
echo "Если при первом заходе 502: проверьте, что SSL-сертификат есть:"
echo "  ssh на сервер → certbot --nginx -d net.aiternitas.ru"
