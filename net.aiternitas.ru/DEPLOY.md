# Деплой net.aiternitas.ru на поддомен

Поддомен разворачивается на **том же сервере**, что и основной домен aiternitas.ru.

- **Сервер:** `82.146.44.126` (root)
- **Ключ SSH:** `~/.ssh/id_rsa_aiternitas` (как у aiternitas, conference, vpn)
- **Каталог на сервере:** `/opt/net`
- **Порт приложения:** 3004 (aiternitas-main — 3001, conference — 3002, vpn — 3000, blagojevic — 3003)
- **Сайт:** https://net.aiternitas.ru

---

## Перед первым деплоем

1. **DNS:** A-запись `net.aiternitas.ru` → IP сервера `82.146.44.126`.

2. **SSL-сертификат** (один раз на сервере):
   ```bash
   ssh -i ~/.ssh/id_rsa_aiternitas root@82.146.44.126
   certbot --nginx -d net.aiternitas.ru
   ```
   Если certbot попросит выбрать виртуальный хост — выберите тот, где `server_name net.aiternitas.ru` (можно сначала выполнить деплой без HTTPS, потом добавить конфиг и снова запустить certbot).

3. **Первый деплой без HTTPS (если сертификата ещё нет):**  
   Временно закомментируйте в `nginx-net.conf` блок `server { listen 443 ... }`, оставьте только блок `listen 80`. Загрузите конфиг, выполните деплой. Затем на сервере: `certbot --nginx -d net.aiternitas.ru`, после чего верните в репозитории полный конфиг с 443 и задеплойьте снова.

---

## Деплой с локальной машины

Из корня проекта **net.aiternitas.ru**:

```bash
chmod +x deploy-local-build.sh
./deploy-local-build.sh
```

Скрипт:

1. Собирает веб-приложение (`npm run web:build` → `web/dist/`).
2. Создаёт на сервере каталоги `/opt/net/server`, `/opt/net/web/dist`, `/opt/net/data`.
3. Загружает `package.json`, `server/`, `web/dist/`.
4. Настраивает `.env` (PORT=3003, NODE_ENV=production, JWT_SECRET при первом запуске).
5. Ставит зависимости (`npm install --omit=dev`) и перезапускает systemd-сервис `net.aiternitas.service`.
6. Копирует `nginx-net.conf` в `/etc/nginx/sites-available/net.aiternitas.ru`, подключает в `sites-enabled`, проверяет nginx и перезагружает его.

**Windows (PowerShell):** можно вызвать bash-скрипт через Git Bash или WSL, либо использовать `deploy-local-build.ps1`.

---

## Проверка после деплоя

На сервере:

```bash
systemctl status net.aiternitas.service
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3003/
```

В браузере: https://net.aiternitas.ru — лендинг, https://net.aiternitas.ru/app — вход в приложение.

---

## Ручная настройка на сервере

Если нужно поднять всё вручную (код уже в `/opt/net`):

```bash
cd /opt/net
printf 'PORT=3003\nNODE_ENV=production\nJWT_SECRET=%s\n' "$(openssl rand -hex 32)" > .env
npm install --omit=dev
```

Сервис systemd — как в скрипте (см. `deploy-local-build.sh`, шаг 5). Nginx — скопировать `nginx-net.conf` в `/etc/nginx/sites-available/net.aiternitas.ru`, сделать симлинк в `sites-enabled`, `nginx -t && systemctl reload nginx`.
