# Инструкция по деплою

## Docker деплой

### Требования
- Docker и Docker Compose установлены
- Порты 3000 доступны

### Быстрый старт

1. **Клонировать репозиторий:**
```bash
git clone <repository-url>
cd apk
```

2. **Собрать и запустить контейнер:**
```bash
docker-compose up -d --build
```

3. **Проверить статус:**
```bash
docker-compose ps
```

4. **Просмотреть логи:**
```bash
docker-compose logs -f server
```

### Переменные окружения

Можно настроить через `.env` файл или docker-compose.yml:

- `PORT` - порт сервера (по умолчанию: 3000)
- `HOST` - хост сервера (по умолчанию: 0.0.0.0)
- `CORS_ORIGIN` - разрешенные источники CORS (по умолчанию: *)
- `NODE_ENV` - окружение (production/development)

### Структура деплоя

- **Dockerfile** - использует `node:20-alpine` для минимального размера образа
- **docker-compose.yml** - настройка сервисов и томов
- **Volumes:**
  - `./server:/app/server:ro` - серверный код (read-only)
  - `./data:/app/data` - база данных (read-write)
  - `./www:/app/www:ro` - веб-интерфейс (read-only)

### Проверка деплоя

1. **Проверить доступность сервера:**
```bash
curl http://localhost:3000
```

2. **Проверить WebSocket соединение:**
Откройте браузер и перейдите на `http://localhost:3000`

3. **Проверить логи:**
```bash
docker-compose logs server
```

### Остановка

```bash
docker-compose down
```

### Обновление

```bash
git pull
docker-compose up -d --build
```

## Production рекомендации

1. **Используйте reverse proxy (nginx)** для HTTPS
2. **Настройте переменные окружения** через `.env` файл
3. **Настройте мониторинг** и логирование
4. **Используйте volume для данных** для персистентности БД
5. **Настройте автоматический restart** (уже включен в docker-compose.yml)

