# Быстрая настройка автоматического деплоя

## Шаг 1: Получить SSH ключ

Выполните в PowerShell:

```powershell
Get-Content $env:USERPROFILE\.ssh\id_rsa_aiternitas
```

Скопируйте весь вывод (весь ключ от `-----BEGIN` до `-----END`)

## Шаг 2: Добавить ключ в GitHub

1. Откройте: https://github.com/ebusorgin/timer_apk/settings/secrets/actions
2. Нажмите **"New repository secret"**
3. Имя: `SSH_PRIVATE_KEY`
4. Значение: вставьте скопированный ключ
5. Нажмите **"Add secret"**

## Готово!

Теперь при каждом `git push origin production` будет автоматически:
- ✅ Запускаться тесты
- ✅ Обновляться код на сервере
- ✅ Устанавливаться зависимости
- ✅ Перезапускаться сервис

Проверить можно в: https://github.com/ebusorgin/timer_apk/actions

