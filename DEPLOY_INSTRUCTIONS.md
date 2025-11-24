# Инструкции по деплою на сервер

## Настройка SSH ключа

SSH ключ для доступа к серверу уже настроен: `~/.ssh/id_rsa_aiternitas`

## Информация о сервере

- **Сервер**: `root@82.146.44.126`
- **Путь к репозиторию**: `/opt/voice-room-test`
- **Сервис**: `voice-room-test.service`
- **Ветка**: `production`

## Процесс деплоя

### 1. Автоматический деплой (рекомендуется)

Используйте скрипты:

```bash
# Проверка статуса на сервере
./deploy-check.sh

# Обновление и перезапуск
./deploy-update.sh
```

### 2. Ручной деплой

```bash
# Подключение к серверу
ssh -i ~/.ssh/id_rsa_aiternitas root@82.146.44.126

# Переход в директорию репозитория
cd /opt/voice-room-test

# Переключение на ветку production (если нужно)
git checkout production

# Получение обновлений
git fetch origin

# Обновление кода
git pull origin production

# Установка зависимостей (если нужно)
npm install

# Перезапуск сервиса
systemctl restart voice-room-test.service

# Проверка статуса
systemctl status voice-room-test.service
```

## Проверка после деплоя

```bash
# Проверка логов
ssh -i ~/.ssh/id_rsa_aiternitas root@82.146.44.126 "journalctl -u voice-room-test.service -n 20 --no-pager"

# Проверка статуса сервиса
ssh -i ~/.ssh/id_rsa_aiternitas root@82.146.44.126 "systemctl status voice-room-test.service"

# Проверка последнего коммита
ssh -i ~/.ssh/id_rsa_aiternitas root@82.146.44.126 "cd /opt/voice-room-test && git log --oneline -1"
```

## Решение проблем

### Проблема: Git запрашивает пароль

Убедитесь, что используется правильный SSH ключ:
```bash
ssh -i ~/.ssh/id_rsa_aiternitas root@82.146.44.126
```

### Проблема: Сервис не запускается

Проверьте логи:
```bash
ssh -i ~/.ssh/id_rsa_aiternitas root@82.146.44.126 "journalctl -u voice-room-test.service -n 50 --no-pager"
```

Частые причины:
- Не установлены зависимости: `npm install`
- Неправильная ветка: убедитесь что на `production`
- Ошибки в коде: проверьте логи

### Проблема: Изменения не применяются

1. Убедитесь, что код обновлен: `git pull origin production`
2. Убедитесь, что на правильной ветке: `git branch`
3. Перезапустите сервис: `systemctl restart voice-room-test.service`
4. Очистите кеш браузера (если изменения в фронтенде)

## Автоматизация (опционально)

Для автоматического деплоя можно настроить GitHub Actions или webhook, который будет выполнять `git pull` и перезапуск сервиса при пуше в ветку `production`.

