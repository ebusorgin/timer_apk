# Разделение репозиториев: Conference и Aiternitas

## Цель

Разделить текущий монолитный репозиторий на два независимых репозитория:
1. **Conference** - проект видеоконференций (папка `Conference/`)
2. **Aiternitas** - главная страница и лендинг (папка `Aiternitas/`)

## План действий

### Шаг 1: Создание репозитория Conference

1. **На GitHub:**
   - Создать новый репозиторий: `conference`
   - URL: `git@github.com:ebusorgin/conference.git`

2. **Локально:**
```bash
# Создать временную копию папки Conference
cp -r Conference /tmp/conference-repo
cd /tmp/conference-repo

# Инициализировать git репозиторий
git init
git add .
git commit -m "Initial commit: Conference project from timer_apk"

# Добавить remote и запушить
git branch -M main
git remote add origin git@github.com:ebusorgin/conference.git
git push -u origin main

# Создать ветку production
git checkout -b production
git push -u origin production
```

3. **Обновить workflow для Conference:**
   - Файл `.github/workflows/deploy.yml` уже обновлен
   - Файл `.github/workflows/test.yml` уже обновлен

### Шаг 2: Создание репозитория Aiternitas

1. **На GitHub:**
   - Создать новый репозиторий: `aiternitas`
   - URL: `git@github.com:ebusorgin/aiternitas.git`

2. **Локально:**
```bash
# Создать временную копию папки Aiternitas
cp -r Aiternitas /tmp/aiternitas-repo
cd /tmp/aiternitas-repo

# Инициализировать git репозиторий
git init
git add .
git commit -m "Initial commit: Aiternitas landing page"

# Добавить remote и запушить
git branch -M main
git remote add origin git@github.com:ebusorgin/aiternitas.git
git push -u origin main

# Создать ветку production
git checkout -b production
git push -u origin production
```

3. **Workflow для Aiternitas:**
   - Файл `Aiternitas/.github/workflows/deploy.yml` уже создан

### Шаг 3: Настройка на сервере

#### Для Conference:

```bash
# Создать директорию для Conference
mkdir -p /opt/conference
cd /opt/conference

# Клонировать репозиторий
git clone git@github.com:ebusorgin/conference.git .

# Переключиться на production
git checkout production

# Установить зависимости
cd Conference  # Если структура сохранится
npm install --production

# Создать/обновить systemd сервис
# Файл: /etc/systemd/system/conference.service
```

**Содержимое `/etc/systemd/system/conference.service`:**
```ini
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

[Install]
WantedBy=multi-user.target
```

#### Для Aiternitas:

```bash
# Создать директорию для Aiternitas
mkdir -p /opt/aiternitas
cd /opt/aiternitas

# Клонировать репозиторий
git clone git@github.com:ebusorgin/aiternitas.git .

# Переключиться на production
git checkout production

# Установить зависимости
npm install --production

# Обновить systemd сервис
# Файл: /etc/systemd/system/aiternitas-main.service
```

**Обновить `/etc/systemd/system/aiternitas-main.service`:**
```ini
[Unit]
Description=Aiternitas Main Page
After=network.target

[Service]
Type=simple
User=voice-room
WorkingDirectory=/opt/aiternitas
Environment=NODE_ENV=production
Environment=PORT=3001
Environment=HOST=0.0.0.0
ExecStart=/usr/bin/node server.mjs
Restart=always

[Install]
WantedBy=multi-user.target
```

### Шаг 4: Обновление workflow файлов

После создания отдельных репозиториев, обновить пути в workflow:

**Conference `.github/workflows/deploy.yml`:**
- Изменить `REPO_DIR="/opt/voice-room-test"` на `REPO_DIR="/opt/conference"`
- Изменить `cd "$REPO_DIR/Conference"` на `cd "$REPO_DIR"` (если Conference будет в корне)

**Aiternitas `.github/workflows/deploy.yml`:**
- Изменить `REPO_DIR="/opt/voice-room-test"` на `REPO_DIR="/opt/aiternitas"`
- Изменить `cd "$REPO_DIR/Aiternitas"` на `cd "$REPO_DIR"` (если Aiternitas будет в корне)

## Текущая структура

- `Conference/` - проект видеоконференций (будет отдельный репозиторий `conference`)
- `Aiternitas/` - главная страница (будет отдельный репозиторий `aiternitas`)

## После разделения

- **Conference:** `https://apk.aiternitas.ru` (порт 3000)
- **Aiternitas:** `https://aiternitas.ru` (порт 3001)

## Миграция существующего репозитория

Текущий репозиторий `timer_apk` можно:
1. Оставить как есть (для истории)
2. Переименовать в `conference` и удалить папку `Aiternitas/`
3. Или архивировать

## Важные замечания

1. **GitHub Secrets:** Оба репозитория должны иметь одинаковые secrets:
   - `SSH_PRIVATE_KEY`
   - `SERVER_HOST`
   - `SERVER_USER`

2. **Серверные пути:** После разделения пути на сервере изменятся:
   - Conference: `/opt/conference` (вместо `/opt/voice-room-test/Conference`)
   - Aiternitas: `/opt/aiternitas` (вместо `/opt/voice-room-test/Aiternitas`)

3. **Systemd сервисы:**
   - `voice-room-test.service` → `conference.service` (для Conference)
   - `aiternitas-main.service` (остается для Aiternitas)
