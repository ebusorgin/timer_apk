# Aiternitas Platform

Платформа инновационных проектов, состоящая из двух основных компонентов:

## 📁 Структура проекта

```
apk/
├── conference.aiternitas.ru/  # Проект видеоконференций
│   ├── server/               # Серверная часть
│   ├── www/                  # Клиентская часть
│   ├── tests/                # Тесты
│   └── package.json          # Зависимости проекта конференций
│
└── aiternitas.ru/            # Главная страница
    ├── index.html            # Лендинг
    ├── server.mjs            # Express сервер
    └── package.json          # Зависимости главной страницы
```

## 🚀 Запуск

```bash
npm install
npm start
```

Приложение будет доступно на `http://localhost:3000` или `https://conference.aiternitas.ru`

## 📝 Описание

Полнофункциональное приложение видеоконференций с WebRTC, Socket.IO и поддержкой комнат.
