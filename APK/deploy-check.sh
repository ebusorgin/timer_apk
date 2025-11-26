#!/bin/bash
# Скрипт для проверки и обновления на сервере

SERVER="root@82.146.44.126"
SSH_KEY="$HOME/.ssh/id_rsa_aiternitas"
REPO_PATH="/opt/voice-room-test"
SERVICE_NAME="voice-room-test.service"

echo "Проверка подключения к серверу..."
ssh -i "$SSH_KEY" -o ConnectTimeout=10 $SERVER "echo 'Подключение успешно'" || {
    echo "Ошибка: Не удалось подключиться к серверу"
    echo "Проверьте SSH ключи и доступность сервера"
    exit 1
}

echo "Проверка наличия репозитория..."
ssh -i "$SSH_KEY" $SERVER "test -d $REPO_PATH" || {
    echo "Ошибка: Репозиторий не найден по пути $REPO_PATH"
    echo "Ищу репозиторий..."
    ssh -i "$SSH_KEY" $SERVER "find /root /var/www /opt /home -name '.git' -type d 2>/dev/null | head -5"
    exit 1
}

echo "Переход в директорию репозитория..."
ssh -i "$SSH_KEY" $SERVER "cd $REPO_PATH && pwd"

echo "Проверка статуса git..."
ssh -i "$SSH_KEY" $SERVER "cd $REPO_PATH && git status"

echo "Проверка удаленных репозиториев..."
ssh -i "$SSH_KEY" $SERVER "cd $REPO_PATH && git remote -v"

echo "Проверка последних коммитов..."
ssh -i "$SSH_KEY" $SERVER "cd $REPO_PATH && git log --oneline -5"

echo "Проверка наличия обновлений..."
ssh -i "$SSH_KEY" $SERVER "cd $REPO_PATH && git fetch origin"

echo "Сравнение локальной и удаленной ветки production..."
ssh -i "$SSH_KEY" $SERVER "cd $REPO_PATH && git log HEAD..origin/production --oneline"

echo ""
echo "Для обновления выполните:"
echo "ssh -i "$SSH_KEY" $SERVER 'cd $REPO_PATH && git pull origin production'"

