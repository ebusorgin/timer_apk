# Инструкция по настройке сервера

## Вариант 1: Автоматический деплой через GitHub Actions (РЕКОМЕНДУЕТСЯ)

1. Перейдите в GitHub репозиторий: https://github.com/ebusorgin/timer_apk
2. Settings → Secrets → Actions → New repository secret
3. Добавьте секрет:
   - Name: `SSH_PASSWORD`
   - Value: `carFds43`
4. Перейдите в Actions и запустите workflow "Deploy to Production Server" вручную (кнопка "Run workflow")

## Вариант 2: Ручное выполнение на сервере

Подключитесь к серверу через SSH:
```bash
ssh root@82.146.44.126
# Пароль: carFds43
```

Затем выполните одну из команд:

### Быстрая настройка (рекомендуется):
```bash
curl -s https://raw.githubusercontent.com/ebusorgin/timer_apk/master/server-setup.sh | bash
```

### Или через репозиторий:
```bash
cd /opt
mkdir -p voice-room
cd voice-room
git clone https://github.com/ebusorgin/timer_apk.git .
bash server-setup.sh
```

## Вариант 3: Пошаговая настройка

Выполните команды по порядку на сервере:

```bash
# 1. Подключитесь к серверу
ssh root@82.146.44.126

# 2. Обновите систему
apt update && apt upgrade -y

# 3. Установите зависимости
apt install -y nodejs npm nginx git curl

# 4. Клонируйте репозиторий
cd /opt
git clone https://github.com/ebusorgin/timer_apk.git voice-room
cd voice-room

# 5. Настройте переменные окружения
cat > .env << EOF
PORT=3000
HOST=127.0.0.1
CORS_ORIGIN=https://aiternitas.ru
NODE_ENV=production
MAX_USERS_PER_ROOM=10
ROOM_TIMEOUT_MINUTES=30
EOF

# 6. Установите npm зависимости
npm ci --production

# 7. Настройте nginx
cp nginx.conf /etc/nginx/sites-available/aiternitas.ru
ln -sf /etc/nginx/sites-available/aiternitas.ru /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# 8. Настройте systemd service
cp voice-room.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable voice-room
systemctl start voice-room

# 9. Проверьте статус
systemctl status voice-room
curl http://127.0.0.1:3000
```

## Проверка работы

После настройки проверьте:
- http://aiternitas.ru - должен открываться сайт
- `systemctl status voice-room` - сервис должен быть активен
- `journalctl -u voice-room -f` - логи приложения

## Устранение проблем

Если сайт не работает:
1. Проверьте статус: `systemctl status voice-room`
2. Проверьте логи: `journalctl -u voice-room -n 50`
3. Проверьте nginx: `nginx -t && systemctl status nginx`
4. Проверьте порт: `curl http://127.0.0.1:3000`

