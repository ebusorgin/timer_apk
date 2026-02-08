# Деплой VPN (APK + Web)

## Быстрый запуск

Откройте PowerShell в папке `vpn.aiternitas.ru` и выполните:

```powershell
.\DO-IT.ps1
```

Скрипт:
1. Соберёт APK (если ещё не собран)
2. Соберёт Next.js
3. Задеплоит на сервер

## Что изменено

- **APK** раздаётся через `/api/apk` (читает из `public/vpn-app.apk`)
- **Rewrite** `/vpn-app.apk` → `/api/apk` для совместимости
- **Дашборд** проверяет доступность через HEAD `/api/apk`

## Проверка перед деплоем

Перед деплоем запускаются тесты и сборка:

```powershell
.\scripts\verify-before-deploy.ps1
```

Или `deploy-local-build.ps1` вызывает verify автоматически.

Тесты: `cd web && npm run test`

## Ручные шаги (если скрипт не сработал)

```powershell
# 1. Сборка APK
.\scripts\build-apk-local.ps1

# 2. Проверка + сборка Web (тесты + build)
.\scripts\verify-before-deploy.ps1

# 3. Деплой
.\deploy-local-build.ps1
```

## После деплоя

- **APK:** https://vpn.aiternitas.ru/api/apk
- **Дашборд:** https://vpn.aiternitas.ru/dashboard
