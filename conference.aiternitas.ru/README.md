# Conference

Платформа видеоконференций с поддержкой WebRTC, комнат и множества участников.

## Возможности

- Видео и аудио конференции через WebRTC
- Поддержка множественных комнат
- Приглашения пользователей
- Push-уведомления
- Адаптивный интерфейс

## Установка

```bash
npm install
```

## Запуск

```bash
npm start
```

Приложение будет доступно на `http://localhost:3000`

## Деплой

Проект автоматически деплоится на `https://conference.aiternitas.ru` при push в ветку `production`.

## Структура проекта

- `server/` - серверная часть (Express, Socket.IO)
- `www/` - клиентская часть (HTML, CSS, JavaScript)
- `tests/` - тесты

## Технологии

- Node.js
- Express
- Socket.IO
- WebRTC
- PostgreSQL (опционально)

