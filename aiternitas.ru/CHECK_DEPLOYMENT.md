# Проверка автодеплоя aiternitas.ru

## Способ 1: Проверка через скрипт (локально)

Запустите скрипт проверки на вашем компьютере:

```bash
cd aiternitas.ru
chmod +x deploy-check.sh
./deploy-check.sh
```

Скрипт проверит:
- ✅ Подключение к серверу
- ✅ Существование директории `/opt/aiternitas-main`
- ✅ Настройку git репозитория
- ✅ Последний коммит
- ✅ Статус systemd сервиса
- ✅ Доступность приложения на порту 3001

## Способ 2: Проверка через GitHub Actions

1. Перейдите в репозиторий `aiternitas.ru` на GitHub
2. Откройте вкладку **Actions**
3. Найдите последний запуск workflow "Deploy Aiternitas Main to Production"
4. Проверьте логи выполнения:
   - Должен быть шаг "Deploy Aiternitas Main" с детальной информацией
   - Должен быть шаг "Verify deployment" с проверкой сервиса

### Ручной запуск workflow

Если нужно запустить деплой вручную:

1. Перейдите в **Actions** → **Deploy Aiternitas Main to Production**
2. Нажмите **Run workflow**
3. Выберите ветку (обычно `production`)
4. Нажмите **Run workflow**

## Способ 3: Прямая проверка на сервере

Подключитесь к серверу и выполните команды:

```bash
# Проверка директории и git
cd /opt/aiternitas-main
pwd
git remote -v
git log --oneline -1
git status

# Проверка сервиса
systemctl status aiternitas-main.service
systemctl is-active aiternitas-main.service
systemctl is-enabled aiternitas-main.service

# Проверка приложения
curl -I http://localhost:3001
ps aux | grep node

# Проверка собранных файлов
ls -la dist/
```

## Что проверить

### ✅ Репозиторий настроен правильно
- Remote должен указывать на `git@github.com:ebusorgin/aiternitas.ru.git`
- Ветка должна быть `production`
- Последний коммит должен соответствовать последнему push в GitHub

### ✅ Сервис работает
- Сервис должен быть `active (running)`
- Сервис должен быть `enabled` (автозапуск)
- HTTP запрос к `localhost:3001` должен возвращать 200 или 302

### ✅ Файлы на месте
- Должен существовать `package.json`
- Должна существовать директория `dist/` (после сборки)
- Должен существовать `server.mjs`

## Устранение проблем

### Если репозиторий не настроен
```bash
cd /opt/aiternitas-main
git init
git remote add origin git@github.com:ebusorgin/aiternitas.ru.git
git fetch origin
git checkout production
```

### Если сервис не запущен
```bash
systemctl start aiternitas-main.service
systemctl enable aiternitas-main.service
systemctl status aiternitas-main.service
```

### Если приложение не отвечает
```bash
# Проверьте логи
journalctl -u aiternitas-main.service -n 50

# Перезапустите сервис
systemctl restart aiternitas-main.service

# Проверьте порт
netstat -tlnp | grep 3001
```

## Проверка через веб-интерфейс

Откройте в браузере:
- `https://aiternitas.ru` - должен открываться сайт
- Проверьте, что изменения из последнего коммита отображаются

