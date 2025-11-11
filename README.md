# Severomorets

Веб-сервис голосовых звонков через браузер.

## Установка

```bash
npm install
```

## Запуск сервера

```bash
npm run server
```

Сервер будет доступен на `http://localhost:3000`

## Структура проекта

```
severomorets/
├── server/
│   ├── app.mjs            # Инициализация Express/Socket.IO
│   ├── persistence/       # Хранилище (файлы, PostgreSQL)
│   ├── routes/            # HTTP API
│   └── sockets/           # WebSocket-обработчики
├── www/
│   ├── index.html         # Веб-интерфейс конференции
│   ├── css/
│   └── js/
│       └── app.js         # Логика веб-приложения
├── data/
│   └── test-users.json    # Тестовые данные (опционально)
├── docker-compose.yml     # Конфигурация запуска в Docker
└── Dockerfile             # Контейнер для сервера и веб-клиента
```

## Использование

### Веб-версия

1. Откройте `http://localhost:3000` в браузере
2. Введите имя и подключитесь
3. Нажмите "Позвонить"

## Хранилище данных

Сервис поддерживает два варианта хранения:

- **Файлы (по умолчанию)** — JSON-файлы в каталоге `server/data/` (используются в dev-сценариях).
- **PostgreSQL** — полноценное постоянное хранилище для production.

Переключение выполняется переменной `PERSISTENCE_DRIVER` (`file` или `postgres`). Для PostgreSQL установите переменную `DATABASE_URL`, например:

```
DATABASE_URL=postgresql://voice_room:voice_room@localhost:5432/voice_room
PERSISTENCE_DRIVER=postgres
PGSSLMODE=disable
```

Docker-compose включает сервис PostgreSQL с автоматическим созданием базы `voice_room`:

```bash
docker compose up -d
```

Сервер будет ждать, пока база данных не будет готова (`depends_on` с healthcheck).

## Переменные окружения

- `PORT` — порт сервера (по умолчанию: 3000)
- `HOST` — хост сервера (по умолчанию: 0.0.0.0)
- `CORS_ORIGIN` — разрешенные источники CORS (по умолчанию: `*`)
- `PERSISTENCE_DRIVER` — `file` или `postgres`
- `DATABASE_URL` — строка подключения к PostgreSQL
- `PGSSLMODE` — задаёт SSL-режим для PostgreSQL (`require`, `disable`, и т.п.)
- `PG_POOL_MAX`, `PG_POOL_IDLE_TIMEOUT_MS`, `PG_STATEMENT_TIMEOUT_MS` — опции пула соединений

## Тестирование

- `npm run test` — запуск тестов в режиме наблюдения
- `npm run test:all` — прогон всех тестов (используется в CI)
