#!/bin/bash
# Деплой remote.aiternitas.ru на поддомен (тот же сервер).
# Python + FastAPI + uvicorn, systemd + nginx.

SERVER="root@82.146.44.126"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_rsa_aiternitas}"
REMOTE_DIR="/opt/remote"
SERVICE_NAME="remote.aiternitas.service"
PORT=3005
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

set -e

echo "=== Деплой remote.aiternitas.ru ==="

# 1. Подготовка каталогов на сервере
echo ""
echo "[1/5] Подготовка каталогов на сервере..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SERVER" "mkdir -p $REMOTE_DIR/server $REMOTE_DIR/web"

# 2. Загрузка файлов
echo ""
echo "[2/5] Загрузка файлов..."
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SCRIPT_DIR/requirements.txt" "$SERVER:$REMOTE_DIR/"
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no -r "$SCRIPT_DIR/server/"* "$SERVER:$REMOTE_DIR/server/"
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no -r "$SCRIPT_DIR/web/"* "$SERVER:$REMOTE_DIR/web/"
echo "✅ Файлы загружены"

# 3. Python venv, зависимости, .env
echo ""
echo "[3/5] Python venv и зависимости..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SERVER" "cd $REMOTE_DIR && \
  mkdir -p data && \
  (test -f .env || (printf 'JWT_SECRET=%s\nREMOTE_DB_PATH=/opt/remote/data/remote.db\n' \"\$(openssl rand -hex 32)\" > .env)) && \
  (test -d venv || python3 -m venv venv) && \
  ./venv/bin/python -m pip install -r requirements.txt -q"
echo "✅ Зависимости установлены"

# 4. Systemd-сервисы (Xvfb + Remote)
echo ""
echo "[4/5] Systemd-сервисы..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SERVER" "apt install -y xvfb python3-tk 2>/dev/null || true"
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SCRIPT_DIR/xvfb.service" "$SERVER:/etc/systemd/system/xvfb.service"
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SCRIPT_DIR/remote.aiternitas.service" "$SERVER:/etc/systemd/system/$SERVICE_NAME"
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SERVER" "systemctl daemon-reload && systemctl enable xvfb.service && systemctl start xvfb.service && systemctl enable $SERVICE_NAME && systemctl restart $SERVICE_NAME"
echo "✅ Сервис перезапущен"

# 5. Nginx (HTTP-only для первого деплоя; после certbot — заменить на nginx-remote.conf)
echo ""
echo "[5/5] Nginx..."
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SCRIPT_DIR/nginx-remote-http-only.conf" "$SERVER:/etc/nginx/sites-available/remote.aiternitas.ru"
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SERVER" "ln -sf /etc/nginx/sites-available/remote.aiternitas.ru /etc/nginx/sites-enabled/remote.aiternitas.ru 2>/dev/null || true; nginx -t && systemctl reload nginx"
echo "✅ Nginx перезагружен"

echo ""
echo "=== ✅ Деплой завершён ==="
echo "Сайт: https://remote.aiternitas.ru"
echo "Проверка: curl -s https://remote.aiternitas.ru/health"
echo ""
echo "Если 502: certbot --nginx -d remote.aiternitas.ru"
