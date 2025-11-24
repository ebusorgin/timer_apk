#!/bin/bash
# Скрипт для обновления на сервере

SERVER="root@82.146.44.126"
SSH_KEY="$HOME/.ssh/id_rsa_aiternitas"
REPO_PATH="/opt/voice-room-test"
SERVICE_NAME="voice-room-test.service"

echo "Обновление репозитория на сервере..."

ssh -i "$SSH_KEY" $SERVER "cd $REPO_PATH && git pull origin production" || {
    echo "Ошибка при выполнении git pull"
    exit 1
}

echo "Проверка статуса после обновления..."
ssh -i "$SSH_KEY" $SERVER "cd $REPO_PATH && git status"

echo ""
echo "Перезапуск сервиса..."
ssh -i "$SSH_KEY" $SERVER "systemctl restart $SERVICE_NAME && sleep 2 && systemctl status $SERVICE_NAME | head -10"

echo ""
echo "Обновление завершено!"

