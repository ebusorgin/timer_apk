# Деплой Voice Room на сервер aiternitas.ru

## 🚀 Быстрый старт

### 1. Первоначальная настройка сервера

Подключитесь к серверу и запустите скрипт настройки:

```bash
ssh root@82.146.44.126
cd /opt
# Скопируйте setup-server.sh на сервер или клонируйте репозиторий
bash setup-server.sh
```

### 2. Настройка nginx и SSL

```bash
# Скопируйте конфигурацию nginx
cp nginx.conf /etc/nginx/sites-available/aiternitas.ru
ln -s /etc/nginx/sites-available/aiternitas.ru /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Проверьте конфигурацию
nginx -t

# Получите SSL сертификат
certbot --nginx -d aiternitas.ru -d www.aiternitas.ru
```

### 3. Развертывание приложения

```bash
# Клонируйте репозиторий
cd /opt/voice-room
git clone YOUR_REPO_URL .

# Настройте переменные окружения
cp .env.example .env
nano .env  # Отредактируйте файл (см. ниже)

# Установите зависимости
npm ci --production

# Установите systemd service
cp voice-room.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable voice-room
systemctl start voice-room
```

**Минимальная конфигурация `.env`:**
```env
PORT=3000
HOST=127.0.0.1
CORS_ORIGIN=https://aiternitas.ru
NODE_ENV=production
MAX_USERS_PER_ROOM=10
ROOM_TIMEOUT_MINUTES=30
```

### 4. Автоматический деплой

```bash
# Запустите скрипт деплоя
cd /opt/voice-room
chmod +x deploy.sh
export GIT_REPO_URL="YOUR_REPO_URL"
bash deploy.sh main
```

## Подготовка сервера

### Первоначальная настройка

1. **Подключитесь к серверу:**
```bash
ssh root@82.146.44.126
```

2. **Запустите скрипт первоначальной настройки:**
```bash
cd /opt
wget https://raw.githubusercontent.com/YOUR_REPO/voice-room/main/setup-server.sh
chmod +x setup-server.sh
bash setup-server.sh
```

Или скопируйте файл `setup-server.sh` на сервер и выполните:
```bash
bash setup-server.sh
```

### Установка зависимостей вручную (если скрипт не использовался)

```bash
# Обновление системы
apt update && apt upgrade -y

# Установка Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Установка PM2
npm install -g pm2
pm2 startup systemd -u root --hp /root

# Установка nginx
apt install -y nginx

# Установка certbot для SSL
apt install -y certbot python3-certbot-nginx

# Установка базовых инструментов
apt install -y git curl wget build-essential ufw
```

## Настройка nginx

1. **Скопируйте конфигурацию nginx:**
```bash
cp nginx.conf /etc/nginx/sites-available/aiternitas.ru
```

2. **Активируйте конфигурацию:**
```bash
ln -s /etc/nginx/sites-available/aiternitas.ru /etc/nginx/sites-enabled/
```

3. **Удалите дефолтную конфигурацию (если есть):**
```bash
rm -f /etc/nginx/sites-enabled/default
```

4. **Проверьте конфигурацию:**
```bash
nginx -t
```

5. **Перезагрузите nginx:**
```bash
systemctl reload nginx
```

## Получение SSL сертификата

1. **Убедитесь, что домен указывает на сервер:**
```bash
# Проверка DNS
nslookup aiternitas.ru
```

2. **Получите SSL сертификат:**
```bash
certbot --nginx -d aiternitas.ru -d www.aiternitas.ru
```

3. **Проверьте автообновление сертификата:**
```bash
certbot renew --dry-run
```

4. **Настройте автообновление (уже настроено в cron):**
```bash
# Проверка cron задачи
systemctl status certbot.timer
```

## Развертывание приложения

1. **Создайте директорию для приложения:**
```bash
mkdir -p /opt/voice-room
chown -R voice-room:voice-room /opt/voice-room
```

2. **Клонируйте репозиторий:**
```bash
cd /opt/voice-room
git clone YOUR_REPO_URL .
```

Или если репозиторий уже существует:
```bash
cd /opt/voice-room
git pull origin main
```

3. **Настройте переменные окружения:**
```bash
cd /opt/voice-room
cp .env.example .env
nano .env  # Отредактируйте файл
```

Минимальная конфигурация `.env`:
```env
PORT=3000
HOST=127.0.0.1
CORS_ORIGIN=https://aiternitas.ru
NODE_ENV=production
MAX_USERS_PER_ROOM=10
ROOM_TIMEOUT_MINUTES=30
```

4. **Установите зависимости:**
```bash
cd /opt/voice-room
npm ci --production
```

5. **Скопируйте systemd service файл:**
```bash
cp voice-room.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable voice-room
systemctl start voice-room
```

6. **Проверьте статус:**
```bash
systemctl status voice-room
journalctl -u voice-room -f  # Просмотр логов
```

## Автоматический деплой

### Использование скрипта deploy.sh

1. **Скопируйте скрипт на сервер:**
```bash
scp deploy.sh root@82.146.44.126:/opt/voice-room/
```

2. **Установите URL репозитория (если нужно):**
```bash
export GIT_REPO_URL="https://github.com/YOUR_USERNAME/YOUR_REPO.git"
```

3. **Запустите деплой:**
```bash
cd /opt/voice-room
chmod +x deploy.sh
bash deploy.sh main
```

### Настройка CI/CD через GitHub Actions

Файл `.github/workflows/deploy.yml` уже создан в репозитории.

**Настройка Secrets в GitHub:**

1. Перейдите в Settings → Secrets → Actions → New repository secret
2. Добавьте следующие секреты:
   - `SSH_PASSWORD` = `carFds43` (пароль для SSH)
   - `GIT_REPO_URL` = URL вашего репозитория (например: `https://github.com/user/voice-room.git`)

После настройки, каждый push в ветку `main` автоматически запустит деплой на сервер.

**Проверка GitHub Actions:**
- Перейдите в Actions вкладку репозитория
- После первого push в main ветку появится workflow "Deploy to Production Server"
- Проверьте статус выполнения и логи

## Проверка развертывания

1. **Проверьте статус сервиса:**
```bash
systemctl status voice-room
```

2. **Проверьте доступность приложения:**
```bash
curl http://127.0.0.1:3000
```

3. **Проверьте логи:**
```bash
journalctl -u voice-room -n 50 -f
```

4. **Проверьте HTTPS:**
```bash
curl https://aiternitas.ru
```

5. **Проверьте WebSocket соединение:**
Откройте в браузере: `https://aiternitas.ru` и проверьте работу приложения.

## Управление сервисом

```bash
# Запуск
systemctl start voice-room

# Остановка
systemctl stop voice-room

# Перезапуск
systemctl restart voice-room

# Статус
systemctl status voice-room

# Логи
journalctl -u voice-room -f

# Просмотр последних 100 строк логов
journalctl -u voice-room -n 100
```

## Обновление приложения

### Ручное обновление:
```bash
cd /opt/voice-room
git pull origin main
npm ci --production
systemctl restart voice-room
```

### Автоматическое обновление через скрипт:
```bash
bash /opt/voice-room/deploy.sh main
```

## Устранение неполадок

### Приложение не запускается

1. **Проверьте логи:**
```bash
journalctl -u voice-room -n 50
```

2. **Проверьте переменные окружения:**
```bash
cat /opt/voice-room/.env
```

3. **Проверьте права доступа:**
```bash
ls -la /opt/voice-room
```

### Nginx не работает

1. **Проверьте конфигурацию:**
```bash
nginx -t
```

2. **Проверьте логи:**
```bash
tail -f /var/log/nginx/aiternitas.ru-error.log
```

3. **Проверьте статус:**
```bash
systemctl status nginx
```

### SSL сертификат не работает

1. **Проверьте сертификаты:**
```bash
certbot certificates
```

2. **Обновите сертификат:**
```bash
certbot renew --force-renewal
```

3. **Проверьте срок действия:**
```bash
openssl x509 -in /etc/letsencrypt/live/aiternitas.ru/fullchain.pem -noout -dates
```

### Порт 3000 занят

1. **Найдите процесс:**
```bash
lsof -i :3000
# или
netstat -tulpn | grep 3000
```

2. **Остановите процесс:**
```bash
kill -9 <PID>
```

3. **Перезапустите сервис:**
```bash
systemctl restart voice-room
```

## Безопасность

### Настройка firewall

```bash
# Проверка правил
ufw status

# Разрешить только необходимые порты
ufw allow ssh
ufw allow 'Nginx Full'
ufw deny 3000/tcp  # Закрыть прямой доступ к порту 3000 (только через nginx)
```

### Обновление системы

```bash
# Регулярно обновляйте систему
apt update && apt upgrade -y

# Настройте автоматические обновления безопасности
apt install -y unattended-upgrades
dpkg-reconfigure unattended-upgrades
```

## Мониторинг

### Использование PM2 (альтернатива systemd)

Если хотите использовать PM2 вместо systemd:

```bash
cd /opt/voice-room
pm2 start server/server.mjs --name voice-room
pm2 save
pm2 startup
```

### Мониторинг ресурсов

```bash
# Использование CPU и памяти
htop

# Мониторинг приложения
systemctl status voice-room
pm2 monit  # Если используется PM2
```

## Резервное копирование

Рекомендуется настроить регулярное резервное копирование:

```bash
# Создание бэкапа
tar -czf /backup/voice-room-$(date +%Y%m%d).tar.gz /opt/voice-room

# Настройка cron для автоматического бэкапа
crontab -e
# Добавьте строку:
# 0 2 * * * tar -czf /backup/voice-room-$(date +\%Y\%m\%d).tar.gz /opt/voice-room
```

