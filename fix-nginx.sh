#!/bin/bash
# Скрипт для принудительного исправления конфигурации nginx
# Использование: bash fix-nginx.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

APP_DIR="/opt/voice-room"

echo -e "${YELLOW}🔧 Исправление конфигурации nginx...${NC}"

# Переход в директорию приложения
cd "$APP_DIR" || {
    echo -e "${RED}❌ Директория $APP_DIR не найдена!${NC}"
    exit 1
}

# Проверка наличия nginx.conf
if [ ! -f "nginx.conf" ]; then
    echo -e "${RED}❌ Файл nginx.conf не найден в $APP_DIR${NC}"
    exit 1
fi

# Удаляем старые конфигурации
echo -e "${YELLOW}🗑️  Удаление старых конфигураций...${NC}"
rm -f /etc/nginx/sites-enabled/aiternitas.ru
rm -f /etc/nginx/sites-enabled/default

# Копируем новую конфигурацию
echo -e "${YELLOW}📋 Копирование новой конфигурации...${NC}"
cp nginx.conf /etc/nginx/sites-available/aiternitas.ru
ln -sf /etc/nginx/sites-available/aiternitas.ru /etc/nginx/sites-enabled/

# Проверка конфигурации
echo -e "${YELLOW}🔍 Проверка конфигурации nginx...${NC}"
if nginx -t; then
    echo -e "${GREEN}✅ Конфигурация nginx корректна${NC}"
    
    # Перезапуск nginx
    echo -e "${YELLOW}🔄 Перезапуск nginx...${NC}"
    systemctl enable nginx || true
    systemctl restart nginx || systemctl start nginx || true
    sleep 2
    systemctl reload nginx || true
    
    echo -e "${GREEN}✅ Nginx успешно перезапущен${NC}"
    
    # Проверка статуса
    if systemctl is-active --quiet nginx; then
        echo -e "${GREEN}✅ Nginx работает${NC}"
        systemctl status nginx --no-pager | head -10
    else
        echo -e "${RED}❌ Nginx не запущен${NC}"
        systemctl status nginx --no-pager
        exit 1
    fi
    
    # Проверка доступности
    echo -e "${YELLOW}🔍 Проверка доступности...${NC}"
    sleep 2
    if curl -f -k https://aiternitas.ru > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Сайт доступен по HTTPS${NC}"
    elif curl -f http://aiternitas.ru > /dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  Сайт доступен по HTTP${NC}"
    else
        echo -e "${YELLOW}⚠️  Сайт пока не доступен (может потребоваться время)${NC}"
    fi
else
    echo -e "${RED}❌ Ошибка в конфигурации nginx!${NC}"
    nginx -t
    exit 1
fi

echo ""
echo -e "${GREEN}✅ Исправление конфигурации nginx завершено!${NC}"

