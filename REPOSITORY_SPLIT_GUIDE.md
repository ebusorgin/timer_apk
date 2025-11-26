# Руководство по разделению репозиториев

## Цель

Разделить текущий репозиторий `timer_apk` на два независимых репозитория:
1. **conference** - проект видеоконференций (папка `conference.aiternitas.ru/`)
2. **aiternitas** - главная страница (папка `aiternitas.ru/`)

## Шаг 1: Создание репозиториев на GitHub

### 1.1 Создать репозиторий Conference

1. Перейти на GitHub: https://github.com/new
2. Имя репозитория: `conference`
3. Описание: "Платформа видеоконференций с WebRTC"
4. Создать репозиторий (можно пустой)

### 1.2 Создать репозиторий Aiternitas

1. Перейти на GitHub: https://github.com/new
2. Имя репозитория: `aiternitas`
3. Описание: "Главная страница платформы Aiternitas"
4. Создать репозиторий (можно пустой)

## Шаг 2: Подготовка Conference репозитория

```bash
# Перейти в папку conference.aiternitas.ru
cd conference.aiternitas.ru

# Инициализировать git (если еще не инициализирован)
git init

# Добавить все файлы
git add .

# Создать первый коммит
git commit -m "Initial commit: Conference project"

# Создать ветку production
git checkout -b production

# Добавить remote
git remote add origin git@github.com:ebusorgin/conference.git

# Запушить
git push -u origin production
git push -u origin main  # если нужна ветка main
```

## Шаг 3: Подготовка Aiternitas репозитория

```bash
# Перейти в папку aiternitas.ru
cd aiternitas.ru

# Инициализировать git (если еще не инициализирован)
git init

# Добавить все файлы
git add .

# Создать первый коммит
git commit -m "Initial commit: Aiternitas landing page"

# Создать ветку production
git checkout -b production

# Добавить remote
git remote add origin git@github.com:ebusorgin/aiternitas.git

# Запушить
git push -u origin production
git push -u origin main  # если нужна ветка main
```

## Шаг 4: Настройка на сервере

### 4.1 Настройка Conference

```bash
ssh -i ~/.ssh/id_rsa_aiternitas root@82.146.44.126

# Создать директорию
mkdir -p /opt/conference
cd /opt/conference

# Клонировать репозиторий
git clone git@github.com:ebusorgin/conference.git .

# Переключиться на production
git checkout production

# Установить зависимости
npm install --production

# Создать systemd сервис
cat > /etc/systemd/system/conference.service << 'EOF'
[Unit]
Description=Conference Application
After=network.target

[Service]
Type=simple
User=voice-room
WorkingDirectory=/opt/conference
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOST=0.0.0.0
Environment=CORS_ORIGIN=https://aiternitas.ru,https://apk.aiternitas.ru
ExecStart=/usr/bin/node server/server.mjs
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=conference

[Install]
WantedBy=multi-user.target
EOF

# Включить и запустить сервис
systemctl daemon-reload
systemctl enable conference.service
systemctl start conference.service

# Остановить старый сервис
systemctl stop voice-room-test.service
systemctl disable voice-room-test.service
```

### 4.2 Настройка Aiternitas

```bash
# Создать директорию
mkdir -p /opt/aiternitas
cd /opt/aiternitas

# Клонировать репозиторий
git clone git@github.com:ebusorgin/aiternitas.git .

# Переключиться на production
git checkout production

# Установить зависимости
npm install --production

# Обновить systemd сервис
sed -i 's|WorkingDirectory=/opt/voice-room-test/Aiternitas|WorkingDirectory=/opt/aiternitas|' /etc/systemd/system/aiternitas-main.service
systemctl daemon-reload
systemctl restart aiternitas-main.service
```

## Шаг 5: Настройка GitHub Secrets

Для обоих репозиториев нужно добавить одинаковые secrets:

1. Перейти в Settings > Secrets and variables > Actions
2. Добавить следующие secrets:
   - `SSH_PRIVATE_KEY` - содержимое `~/.ssh/id_rsa_aiternitas`
   - `SERVER_HOST` - `82.146.44.126` (опционально)
   - `SERVER_USER` - `root` (опционально)
   - `DATABASE_URL` - для Conference (если используется)

## Шаг 6: Проверка

После настройки проверить:

```bash
# Проверить статус сервисов
systemctl status conference.service
systemctl status aiternitas-main.service

# Проверить доступность
curl https://apk.aiternitas.ru
curl https://aiternitas.ru
```

## Текущий репозиторий timer_apk

После разделения текущий репозиторий `timer_apk` можно:
- Оставить как архив для истории
- Переименовать в `conference` (если Conference будет основным проектом)
- Удалить (после миграции всех данных)

## Важные замечания

1. **Пути на сервере изменятся:**
   - Conference: `/opt/conference` (вместо `/opt/voice-room-test/Conference`)
   - Aiternitas: `/opt/aiternitas` (вместо `/opt/voice-room-test/Aiternitas`)

2. **Systemd сервисы:**
   - `voice-room-test.service` → `conference.service`
   - `aiternitas-main.service` (остается)

3. **Nginx конфигурация:**
   - Не требует изменений (проксирует на те же порты)

