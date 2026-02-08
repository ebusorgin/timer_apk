# Деплой remote.aiternitas.ru

- **Сервер:** 82.146.44.126 (root)
- **Ключ SSH:** ~/.ssh/id_rsa_aiternitas
- **Каталог:** /opt/remote
- **Порт:** 3005
- **Сайт:** https://remote.aiternitas.ru

## Перед первым деплоем

1. **DNS:** A-запись `remote.aiternitas.ru` → 82.146.44.126

2. **На сервере** (один раз):
   ```bash
   apt install python3-venv python3-pip python3-tk xvfb
   ```

3. **Переменные окружения** — `/opt/remote/.env`:
   ```
   JWT_SECRET=<случайная строка, openssl rand -hex 32>
   REMOTE_DB_PATH=/opt/remote/data/remote.db
   ```

4. **SSL** (после первого деплоя):
   ```bash
   certbot --nginx -d remote.aiternitas.ru
   ```
   Затем заменить в sites-available конфиг на `nginx-remote.conf` (с SSL) и `nginx -t && systemctl reload nginx`.

## Деплой

```bash
cd remote.aiternitas.ru
chmod +x deploy-local-build.sh
./deploy-local-build.sh
```

Windows (PowerShell):
```powershell
.\deploy-local-build.ps1
```

## GitHub Actions

Push в ветку `production` (или `main`/`master`) — автоматический деплой при наличии секрета `SSH_PRIVATE_KEY`.

## Важно: экран на сервере

Приложение захватывает экран для стриминга. На headless-сервере (без монитора) нужен виртуальный дисплей:

```bash
# Установка Xvfb
apt install xvfb

# Запуск Xvfb перед сервисом (в unit-файле или отдельным сервисом)
Xvfb :99 -screen 0 1920x1080x24 &
export DISPLAY=:99
```

Либо добавьте в `remote.aiternitas.service`:
```
Environment=DISPLAY=:99
```
и настройте автозапуск Xvfb.
