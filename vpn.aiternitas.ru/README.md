# VPN через Tor

VPN-приложение с маршрутизацией трафика через Tor и выбором страны выхода.

## Архитектура

- **Web** (Next.js) — API, аутентификация, конфигурация
- **vpn-tor** (Docker) — WireGuard + Tor + wg-manager
- **App** (Expo/React Native) — Android APK с WireGuard VPN

## Запуск в Docker

```bash
cp .env.example .env
docker compose up -d
```

Web: http://localhost:3000. WireGuard: UDP 51820.

Переменные: `JWT_SECRET`, `SERVER_ENDPOINT`, `EXIT_COUNTRY`, `TOR_ENABLED` (0/1).

## Сборка APK

```bash
./scripts/build-apk.sh
```

Требуется EAS CLI или Docker (образ eas-like-local-builder). APK → `web/public/vpn-app.apk`.

## Использование

1. Открыть https://vpn.aiternitas.ru (или localhost:3000)
2. Зарегистрироваться
3. Скачать APK с dashboard
4. Установить, войти, выбрать страну выхода, Connect
