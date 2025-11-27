#!/bin/bash
# Скрипт для проверки состояния деплоя aiternitas.ru на сервере

SERVER="root@82.146.44.126"
SSH_KEY="$HOME/.ssh/id_rsa_aiternitas"
REPO_PATH="/opt/aiternitas-main"
SERVICE_NAME="aiternitas-main.service"

echo "=========================================="
echo "Проверка деплоя aiternitas.ru на сервере"
echo "=========================================="
echo ""

# Проверка подключения к серверу
echo "1. Проверка подключения к серверу..."
ssh -i "$SSH_KEY" -o ConnectTimeout=10 $SERVER "echo '✅ Подключение успешно'" || {
    echo "❌ Ошибка: Не удалось подключиться к серверу"
    exit 1
}
echo ""

# Проверка существования директории
echo "2. Проверка директории репозитория..."
if ssh -i "$SSH_KEY" $SERVER "test -d $REPO_PATH"; then
    echo "✅ Директория $REPO_PATH существует"
else
    echo "❌ Директория $REPO_PATH не существует"
    exit 1
fi
echo ""

# Проверка git репозитория
echo "3. Проверка git репозитория..."
ssh -i "$SSH_KEY" $SERVER "cd $REPO_PATH && git rev-parse --git-dir > /dev/null 2>&1" && {
    echo "✅ Git репозиторий инициализирован"
    
    # Проверка remote
    REMOTE_URL=$(ssh -i "$SSH_KEY" $SERVER "cd $REPO_PATH && git remote get-url origin 2>/dev/null" || echo "")
    if [ -n "$REMOTE_URL" ]; then
        echo "   Remote origin: $REMOTE_URL"
        if [[ "$REMOTE_URL" == *"aiternitas.ru.git"* ]]; then
            echo "✅ Remote настроен правильно"
        else
            echo "⚠️  Remote может быть настроен неправильно (ожидается aiternitas.ru.git)"
        fi
    else
        echo "⚠️  Remote origin не настроен"
    fi
    
    # Текущая ветка
    CURRENT_BRANCH=$(ssh -i "$SSH_KEY" $SERVER "cd $REPO_PATH && git branch --show-current 2>/dev/null" || echo "unknown")
    echo "   Текущая ветка: $CURRENT_BRANCH"
    
    # Последний коммит
    echo ""
    echo "4. Последний коммит:"
    ssh -i "$SSH_KEY" $SERVER "cd $REPO_PATH && git log --oneline -1 2>/dev/null || echo 'Нет коммитов'" || echo "Ошибка получения коммита"
    
    # Статус репозитория
    echo ""
    echo "5. Статус репозитория:"
    ssh -i "$SSH_KEY" $SERVER "cd $REPO_PATH && git status --short 2>/dev/null | head -10 || echo 'Репозиторий чист'" || echo "Ошибка получения статуса"
} || {
    echo "❌ Директория не является git репозиторием"
}
echo ""

# Проверка файлов проекта
echo "6. Проверка файлов проекта..."
ssh -i "$SSH_KEY" $SERVER "cd $REPO_PATH && test -f package.json && echo '✅ package.json найден' || echo '❌ package.json не найден'"
ssh -i "$SSH_KEY" $SERVER "cd $REPO_PATH && test -f server.mjs && echo '✅ server.mjs найден' || echo '⚠️  server.mjs не найден'"
ssh -i "$SSH_KEY" $SERVER "cd $REPO_PATH && test -d dist && echo '✅ dist/ директория существует' || echo '⚠️  dist/ директория не найдена'"
echo ""

# Проверка systemd сервиса
echo "7. Проверка systemd сервиса..."
if ssh -i "$SSH_KEY" $SERVER "systemctl list-units --type=service | grep -q $SERVICE_NAME"; then
    echo "✅ Сервис $SERVICE_NAME найден"
    
    # Статус сервиса
    echo ""
    echo "   Статус сервиса:"
    ssh -i "$SSH_KEY" $SERVER "systemctl status $SERVICE_NAME --no-pager | head -15" || true
    
    # Проверка активен ли сервис
    if ssh -i "$SSH_KEY" $SERVER "systemctl is-active --quiet $SERVICE_NAME"; then
        echo "✅ Сервис активен (running)"
    else
        echo "❌ Сервис не активен"
    fi
    
    # Проверка включен ли автозапуск
    if ssh -i "$SSH_KEY" $SERVER "systemctl is-enabled --quiet $SERVICE_NAME"; then
        echo "✅ Сервис включен для автозапуска"
    else
        echo "⚠️  Сервис не включен для автозапуска"
    fi
else
    echo "❌ Сервис $SERVICE_NAME не найден"
fi
echo ""

# Проверка доступности приложения
echo "8. Проверка доступности приложения..."
HTTP_CODE=$(ssh -i "$SSH_KEY" $SERVER "curl -s -o /dev/null -w '%{http_code}' http://localhost:3001 2>/dev/null || echo '000'")
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "302" ]; then
    echo "✅ Приложение отвечает (HTTP $HTTP_CODE)"
elif [ "$HTTP_CODE" = "000" ]; then
    echo "❌ Приложение не отвечает (не удалось подключиться)"
else
    echo "⚠️  Приложение отвечает с кодом $HTTP_CODE"
fi
echo ""

# Проверка процессов Node.js
echo "9. Проверка процессов Node.js:"
ssh -i "$SSH_KEY" $SERVER "ps aux | grep -E 'node.*aiternitas|node.*server.mjs' | grep -v grep || echo 'Процессы Node.js не найдены'"
echo ""

echo "=========================================="
echo "Проверка завершена"
echo "=========================================="

