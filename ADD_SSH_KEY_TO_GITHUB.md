# Добавление SSH ключа в GitHub Secrets

## Ваш SSH ключ готов к использованию

Ключ находится в: `C:\Users\evg\.ssh\id_rsa_aiternitas`

## Пошаговая инструкция:

### Шаг 1: Откройте страницу Secrets в GitHub

Перейдите по ссылке:
**https://github.com/ebusorgin/timer_apk/settings/secrets/actions**

Или вручную:
1. Откройте https://github.com/ebusorgin/timer_apk
2. Нажмите **Settings** (вверху справа)
3. В левом меню выберите **Secrets and variables** → **Actions**

### Шаг 2: Добавьте новый секрет

1. Нажмите кнопку **"New repository secret"** (справа вверху)
2. В поле **Name** введите: `SSH_PRIVATE_KEY`
3. В поле **Secret** вставьте содержимое файла ключа (см. ниже)

### Шаг 3: Получите содержимое ключа

Выполните в PowerShell:

```powershell
Get-Content $env:USERPROFILE\.ssh\id_rsa_aiternitas
```

**ВАЖНО:** Скопируйте ВЕСЬ вывод, включая:
- `-----BEGIN OPENSSH PRIVATE KEY-----`
- Все строки между
- `-----END OPENSSH PRIVATE KEY-----`

### Шаг 4: Вставьте и сохраните

1. Вставьте скопированный ключ в поле **Secret** на GitHub
2. Нажмите **"Add secret"**

## Проверка

После добавления ключа:

1. Сделайте тестовый коммит:
   ```bash
   git commit --allow-empty -m "Test auto deploy"
   git push origin production
   ```

2. Перейдите в **Actions**: https://github.com/ebusorgin/timer_apk/actions

3. Вы увидите запуск workflow "Deploy to Production Server"

4. Если все настроено правильно - через 1-2 минуты код автоматически обновится на сервере

## Что происходит при деплое:

1. ✅ Запускаются тесты (автоматически перед деплоем)
2. ✅ GitHub Actions подключается к серверу по SSH
3. ✅ Выполняется `git pull origin production` на сервере
4. ✅ Устанавливаются зависимости: `npm install --production`
5. ✅ Перезапускается сервис: `systemctl restart voice-room-test.service`
6. ✅ Проверяется статус сервиса

## Если что-то не работает:

- Проверьте логи в GitHub Actions (вкладка Actions)
- Убедитесь, что ключ скопирован полностью (включая BEGIN и END строки)
- Проверьте, что сервер доступен: `ping 82.146.44.126`

