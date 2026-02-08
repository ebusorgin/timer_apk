# Деплой school.aiternitas.ru

## Требования

- Node.js 20+
- PostgreSQL 15+
- Redis (опционально)

## Подготовка

1. Создать БД PostgreSQL:
```sql
CREATE DATABASE school;
```

2. Скопировать `.env.example` в `.env` и заполнить:
```env
DATABASE_URL=postgres://user:password@localhost:5432/school
REDIS_URL=redis://localhost:6379
JWT_SECRET=random-secret
ADMIN_SECRET=admin-secret
```

3. Миграции и сиды:
```bash
npm run migrate-db
npm run seed-programs
ADMIN_EMAIL=admin@school.aiternitas.ru ADMIN_PASSWORD=secure npm run seed-admin
```

4. Сборка фронтенда:
```bash
cd client && npm run build
```

5. Запуск:
```bash
npm start
```

## Systemd

Скопировать `scripts/school.service` в `/etc/systemd/system/` и настроить:

```bash
sudo cp scripts/school.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable school
sudo systemctl start school
```

## Nginx

См. `nginx-school.conf`. После настройки SSL:

```bash
certbot --nginx -d school.aiternitas.ru
```
