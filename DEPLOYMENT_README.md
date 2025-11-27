# Информация о деплое проектов Aiternitas

## Структура репозиториев

Проекты находятся в **отдельных репозиториях GitHub**, а не в монорепозитории:

1. **conference.aiternitas.ru** → `git@github.com:ebusorgin/conference.git`
2. **aiternitas.ru** → `git@github.com:ebusorgin/aiternitas.ru.git`
3. **balance.aiternitas.ru** → `git@github.com:ebusorgin/balans.git`

## Структура на сервере

На сервере (`82.146.44.126`) проекты развернуты в следующих директориях:

- `/opt/conference` - Conference проект
- `/opt/aiternitas-main` - Aiternitas Main проект  
- `/opt/balance-tracker` - Balance Tracker проект

## Systemd сервисы

Каждый проект имеет свой systemd сервис:

- `conference.service` - Conference (порт 3000)
- `aiternitas-main.service` - Aiternitas Main (порт 3001)
- `balance-tracker.service` - Balance Tracker (порт 3002)

## GitHub Actions Workflows

Каждый проект имеет свой workflow файл в `.github/workflows/deploy.yml`:

- `conference.aiternitas.ru/.github/workflows/deploy.yml`
- `aiternitas.ru/.github/workflows/deploy.yml`
- `balance.aiternitas.ru/.github/workflows/deploy.yml`

### Настройка GitHub Secrets

Для работы автодеплоя необходимо добавить в настройках каждого репозитория:

1. Перейдите в `Settings` → `Secrets and variables` → `Actions`
2. Добавьте секрет `SSH_PRIVATE_KEY` с содержимым приватного SSH ключа для доступа к серверу
3. Опционально: `SERVER_HOST` (по умолчанию `82.146.44.126`)
4. Опционально: `SERVER_USER` (по умолчанию `root`)

### Требования на сервере

Для каждого проекта на сервере должно быть:

1. **Git репозиторий** в соответствующей директории (`/opt/conference`, `/opt/aiternitas-main`, `/opt/balance-tracker`)
2. **SSH ключи** для доступа к GitHub репозиториям
3. **Node.js** установлен
4. **Systemd сервис** настроен и запущен

## Первоначальная настройка репозитория на сервере

Если репозиторий еще не настроен на сервере, выполните:

```bash
# Для aiternitas.ru
cd /opt/aiternitas-main
git init
git remote add origin git@github.com:ebusorgin/aiternitas.ru.git
git fetch origin
git checkout production

# Для conference
cd /opt/conference
git init
git remote add origin git@github.com:ebusorgin/conference.git
git fetch origin
git checkout production

# Для balance
cd /opt/balance-tracker
git init
git remote add origin git@github.com:ebusorgin/balans.git
git fetch origin
git checkout production
```

## Настройка SSH ключей на сервере для GitHub

Для работы `git pull` на сервере нужны SSH ключи для доступа к GitHub:

```bash
# На сервере
ssh-keygen -t ed25519 -C "deploy@server" -f ~/.ssh/github_deploy
cat ~/.ssh/github_deploy.pub
```

Затем добавьте публичный ключ в GitHub:
- Settings → SSH and GPG keys → New SSH key
- Или используйте Deploy Keys для каждого репозитория

## Как работает автодеплой

При push в ветку `production` (или `master`/`main`) GitHub Actions:

1. ✅ Проверяет наличие секрета `SSH_PRIVATE_KEY`
2. ✅ Подключается к серверу по SSH
3. ✅ Обновляет код из репозитория (`git pull` или `git reset --hard`)
4. ✅ Устанавливает зависимости (`npm install`)
5. ✅ Собирает приложение (если есть `npm run build`)
6. ✅ Перезапускает systemd сервис
7. ✅ Проверяет работоспособность

## Ручной деплой

Если нужно задеплоить вручную, используйте скрипты:

```bash
# aiternitas.ru
cd aiternitas.ru
./deploy-update.sh

# conference
cd conference.aiternitas.ru
./deploy-update.sh

# balance
cd balance.aiternitas.ru
./deploy-update.sh
```

## Важные замечания

⚠️ **Каждый проект в отдельном репозитории** - не путать с монорепозиторием!

⚠️ **SSH ключи должны быть настроены на сервере** для доступа к GitHub репозиториям

⚠️ **Workflow файлы находятся внутри каждого проекта**, а не в корне общего репозитория

⚠️ **Пути на сервере фиксированы** - не менять без обновления workflow и systemd сервисов

