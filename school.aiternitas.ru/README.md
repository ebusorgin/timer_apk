# School.aiternitas.ru

Образовательная платформа для детей: программирование, робототехника, нейросети, микроконтроллеры, радиотехника.

## Стек

- **Backend**: Node.js, Express, PostgreSQL, Redis
- **Frontend**: Angular 19
- **База**: PostgreSQL

## Запуск

### 1. Настройка

```bash
cp .env.example .env
# Заполнить DATABASE_URL
```

### 2. База данных

```bash
npm run migrate-db
npm run seed-programs
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=secret npm run seed-admin
```

### 3. Сборка и запуск

```bash
cd client && npm install && npm run build
cd .. && npm start
```

Сервер: http://localhost:3010

### Разработка

В двух терминалах:

```bash
# 1. Backend
npm start

# 2. Frontend с hot-reload
cd client && npm start
```

Frontend: http://localhost:4200 (проксирует /api на 3010)

## API

- `POST /api/auth/register` — регистрация ученика
- `POST /api/auth/login` — вход
- `GET /api/programs` — список программ (публичный)
- `GET /api/programs/:id` — программа по ID
- `GET /api/me` — текущий пользователь (auth)
- `GET /api/me/enrollments` — мои записи (auth)
- `POST /api/me/enrollments` — записаться (auth, student)
- `GET /api/admin/*` — админ-панель (auth, admin)
