# Настройка автоматического деплоя

## Как это работает

При выполнении `git push origin production` автоматически:
1. Запускаются тесты
2. Если тесты прошли - выполняется деплой на сервер
3. На сервере обновляется код, устанавливаются зависимости
4. Сервис перезапускается автоматически

## Настройка (один раз)

### 1. Получить приватный SSH ключ

На вашем компьютере выполните:

```powershell
# Windows PowerShell
Get-Content $env:USERPROFILE\.ssh\id_rsa_aiternitas
```

Или вручную откройте файл: `C:\Users\evg\.ssh\id_rsa_aiternitas`

### 2. Добавить ключ в GitHub Secrets

1. Перейдите в репозиторий на GitHub: https://github.com/ebusorgin/timer_apk
2. Откройте: **Settings** → **Secrets and variables** → **Actions**
3. Нажмите **New repository secret**
4. Имя: `SSH_PRIVATE_KEY`
5. Значение: вставьте содержимое файла `id_rsa_aiternitas` (весь ключ, включая `-----BEGIN OPENSSH PRIVATE KEY-----` и `-----END OPENSSH PRIVATE KEY-----`)
6. Нажмите **Add secret**

### 3. Опционально: другие секреты

Если нужны переменные окружения для базы данных:
- `SERVER_HOST` (по умолчанию: `82.146.44.126`)
- `SERVER_USER` (по умолчанию: `root`)
- `DATABASE_URL` (если используется PostgreSQL)

## Проверка работы

После настройки:

1. Сделайте любое изменение в коде
2. Выполните:
   ```bash
   git add .
   git commit -m "Test auto deploy"
   git push origin production
   ```

3. Перейдите в **Actions** на GitHub и посмотрите выполнение workflow
4. Через 1-2 минуты изменения должны автоматически появиться на сервере

## Что происходит при деплое

1. **Тесты** - запускаются автоматически перед деплоем
2. **Подключение** - GitHub Actions подключается к серверу по SSH
3. **Обновление кода** - выполняется `git pull origin production`
4. **Установка зависимостей** - `npm install --production`
5. **Перезапуск** - `systemctl restart voice-room-test.service`
6. **Проверка** - проверяется статус сервиса

## Устранение проблем

### Деплой не запускается

- Проверьте, что секрет `SSH_PRIVATE_KEY` добавлен в GitHub
- Проверьте вкладку **Actions** на GitHub - там будут ошибки

### Ошибка подключения

- Убедитесь, что SSH ключ правильный (скопирован полностью)
- Проверьте, что сервер доступен: `ping 82.146.44.126`

### Ошибка на сервере

- Проверьте логи в GitHub Actions
- На сервере: `journalctl -u voice-room-test.service -n 50`

## Ручной деплой (если автоматический не работает)

```bash
ssh -i ~/.ssh/id_rsa_aiternitas root@82.146.44.126
cd /opt/voice-room-test
./deploy-update.sh
```

Или используйте скрипт локально (если настроен SSH):
```bash
./deploy-update.sh
```

