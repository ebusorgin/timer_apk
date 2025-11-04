#!/bin/bash

# Скрипт первоначальной настройки сервера для Voice Room
# Использование: bash setup-server.sh

set -e

echo "🚀 Настройка сервера для Voice Room..."

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Переменные
DOMAIN="aiternitas.ru"
APP_DIR="/opt/voice-room"
APP_USER="voice-room"
SERVICE_NAME="voice-room"

# Проверка прав root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}❌ Пожалуйста, запустите скрипт от имени root${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Проверка прав root пройдена${NC}"

# Обновление системы
echo -e "${YELLOW}📦 Обновление системы...${NC}"
apt update && apt upgrade -y

# Установка базовых зависимостей
echo -e "${YELLOW}📦 Установка базовых зависимостей...${NC}"
apt install -y \
    curl \
    wget \
    git \
    build-essential \
    ufw \
    certbot \
    python3-certbot-nginx

# Установка Node.js (LTS версия)
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}📦 Установка Node.js...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
else
    echo -e "${GREEN}✓ Node.js уже установлен: $(node --version)${NC}"
fi

# Установка PM2 для управления процессом
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}📦 Установка PM2...${NC}"
    npm install -g pm2
    pm2 startup systemd -u root --hp /root
else
    echo -e "${GREEN}✓ PM2 уже установлен${NC}"
fi

# Установка nginx
if ! command -v nginx &> /dev/null; then
    echo -e "${YELLOW}📦 Установка nginx...${NC}"
    apt install -y nginx
    systemctl enable nginx
    systemctl start nginx
else
    echo -e "${GREEN}✓ Nginx уже установлен${NC}"
fi

# Создание пользователя для приложения
if ! id "$APP_USER" &>/dev/null; then
    echo -e "${YELLOW}👤 Создание пользователя $APP_USER...${NC}"
    useradd -r -s /bin/bash -d "$APP_DIR" -m "$APP_USER"
else
    echo -e "${GREEN}✓ Пользователь $APP_USER уже существует${NC}"
fi

# Создание директории приложения
echo -e "${YELLOW}📁 Создание директории приложения...${NC}"
mkdir -p "$APP_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# Настройка firewall
echo -e "${YELLOW}🔥 Настройка firewall...${NC}"
ufw --force enable
ufw allow ssh
ufw allow 'Nginx Full'
ufw allow 3000/tcp comment 'Voice Room App'

# Проверка статуса nginx
if ! nginx -t 2>/dev/null; then
    echo -e "${RED}❌ Ошибка в конфигурации nginx${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Первоначальная настройка сервера завершена!${NC}"
echo ""
echo -e "${YELLOW}Следующие шаги:${NC}"
echo "1. Скопируйте конфигурацию nginx в /etc/nginx/sites-available/$DOMAIN"
echo "2. Активируйте конфигурацию: ln -s /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/"
echo "3. Проверьте конфигурацию: nginx -t"
echo "4. Перезагрузите nginx: systemctl reload nginx"
echo "5. Получите SSL сертификат: certbot --nginx -d $DOMAIN"
echo "6. Клонируйте репозиторий в $APP_DIR"
echo "7. Запустите скрипт деплоя: bash deploy.sh"

