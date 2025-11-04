#!/bin/bash

# Скрипт автоматического деплоя Voice Room
# Использование: bash deploy.sh [branch]
# Пример: bash deploy.sh main

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Переменные
APP_DIR="/opt/voice-room"
APP_USER="voice-room"
SERVICE_NAME="voice-room"
BRANCH="${1:-main}"
REPO_URL="${GIT_REPO_URL:-}" # Установите переменную окружения или вставьте URL репозитория

echo -e "${GREEN}🚀 Начало деплоя Voice Room...${NC}"

# Проверка прав root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}❌ Пожалуйста, запустите скрипт от имени root${NC}"
    exit 1
fi

# Переход в директорию приложения
cd "$APP_DIR" || {
    echo -e "${RED}❌ Директория $APP_DIR не найдена!${NC}"
    echo -e "${YELLOW}Запустите сначала setup-server.sh${NC}"
    exit 1
}

# Если репозиторий еще не клонирован
if [ ! -d ".git" ]; then
    if [ -z "$REPO_URL" ]; then
        echo -e "${RED}❌ Репозиторий не найден и REPO_URL не установлен!${NC}"
        echo -e "${YELLOW}Установите переменную: export GIT_REPO_URL=<your-repo-url>${NC}"
        exit 1
    fi
    
    echo -e "${YELLOW}📥 Клонирование репозитория...${NC}"
    git clone "$REPO_URL" "$APP_DIR"
    chown -R "$APP_USER:$APP_USER" "$APP_DIR"
fi

# Переключение на нужную ветку и обновление
echo -e "${YELLOW}📥 Обновление кода из репозитория (ветка: $BRANCH)...${NC}"
sudo -u "$APP_USER" git fetch origin || true
CURRENT_BRANCH=$(sudo -u "$APP_USER" git branch --show-current 2>/dev/null || echo "")
if [ "$CURRENT_BRANCH" != "$BRANCH" ]; then
    sudo -u "$APP_USER" git checkout "$BRANCH" 2>/dev/null || sudo -u "$APP_USER" git checkout -b "$BRANCH" origin/"$BRANCH" 2>/dev/null || sudo -u "$APP_USER" git checkout -b "$BRANCH" origin/master 2>/dev/null || true
fi
sudo -u "$APP_USER" git pull origin "$BRANCH" || sudo -u "$APP_USER" git pull origin master || true

# Проверка наличия .env файла
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}📝 Создание .env файла из примера...${NC}"
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo -e "${YELLOW}⚠️  Не забудьте отредактировать .env файл!${NC}"
    else
        echo -e "${YELLOW}⚠️  .env.example не найден, создаю базовый .env...${NC}"
        cat > .env << EOF
PORT=3000
HOST=127.0.0.1
CORS_ORIGIN=https://aiternitas.ru
NODE_ENV=production
MAX_USERS_PER_ROOM=10
ROOM_TIMEOUT_MINUTES=30
EOF
    fi
    chown "$APP_USER:$APP_USER" .env
fi

# Установка зависимостей
echo -e "${YELLOW}📦 Установка зависимостей...${NC}"
sudo -u "$APP_USER" npm ci --production || sudo -u "$APP_USER" npm install --production || {
    echo -e "${RED}❌ Ошибка при установке зависимостей${NC}"
    exit 1
}

# Сборка (если есть скрипт build)
if grep -q "\"build\"" package.json; then
    echo -e "${YELLOW}🔨 Сборка проекта...${NC}"
    sudo -u "$APP_USER" npm run build || echo -e "${YELLOW}⚠️  Сборка не требуется или завершилась с предупреждением${NC}"
    
    # Если сборка APK прошла успешно, копируем APK в корень для скачивания
    APK_SOURCE=""
    if [ -f "platforms/android/app/build/outputs/apk/release/app-release-unsigned.apk" ]; then
        APK_SOURCE="platforms/android/app/build/outputs/apk/release/app-release-unsigned.apk"
    elif [ -f "platforms/android/app/build/outputs/apk/debug/app-debug.apk" ]; then
        APK_SOURCE="platforms/android/app/build/outputs/apk/debug/app-debug.apk"
    fi
    
    if [ -n "$APK_SOURCE" ]; then
        echo -e "${YELLOW}📱 Копирование APK для скачивания...${NC}"
        sudo -u "$APP_USER" cp "$APK_SOURCE" "$APP_DIR/app-release.apk" 2>/dev/null || true
        echo -e "${GREEN}✅ APK готов для скачивания${NC}"
    fi
fi

# Перезапуск сервиса
if systemctl is-active --quiet "$SERVICE_NAME"; then
    echo -e "${YELLOW}🔄 Перезапуск сервиса $SERVICE_NAME...${NC}"
    systemctl restart "$SERVICE_NAME"
else
    echo -e "${YELLOW}▶️  Запуск сервиса $SERVICE_NAME...${NC}"
    systemctl start "$SERVICE_NAME"
    systemctl enable "$SERVICE_NAME"
fi

# Проверка статуса
sleep 2
if systemctl is-active --quiet "$SERVICE_NAME"; then
    echo -e "${GREEN}✅ Сервис успешно запущен!${NC}"
    systemctl status "$SERVICE_NAME" --no-pager -l
else
    echo -e "${RED}❌ Ошибка при запуске сервиса!${NC}"
    systemctl status "$SERVICE_NAME" --no-pager -l
    exit 1
fi

# Проверка доступности приложения
echo -e "${YELLOW}🔍 Проверка доступности приложения...${NC}"
sleep 3
if curl -f http://127.0.0.1:3000 > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Приложение доступно на порту 3000${NC}"
else
    echo -e "${YELLOW}⚠️  Приложение не отвечает на порту 3000 (возможно, еще запускается)${NC}"
fi

# Проверка и запуск nginx
if nginx -t 2>/dev/null; then
    echo -e "${GREEN}✅ Конфигурация nginx корректна${NC}"
    systemctl enable nginx || true
    systemctl start nginx || systemctl restart nginx || systemctl reload nginx || true
else
    echo -e "${RED}❌ Ошибка в конфигурации nginx!${NC}"
    nginx -t
fi

echo ""
echo -e "${GREEN}✅ Деплой завершен успешно!${NC}"
echo -e "${GREEN}🌐 Приложение доступно по адресу: https://aiternitas.ru${NC}"

