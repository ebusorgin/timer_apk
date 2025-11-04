#!/bin/bash
# Скрипт для загрузки APK файла на сервер
# Использование: 
#   Локально: bash upload-apk.sh
#   Или просто скопируйте APK файл вручную

set -e

SERVER_HOST="82.146.44.126"
SERVER_USER="root"
APP_DIR="/opt/voice-room"
LOCAL_APK=""

# Поиск локального APK файла
if [ -f "app-release.apk" ]; then
    LOCAL_APK="app-release.apk"
elif [ -f "platforms/android/app/build/outputs/apk/release/app-release-unsigned.apk" ]; then
    LOCAL_APK="platforms/android/app/build/outputs/apk/release/app-release-unsigned.apk"
elif [ -f "platforms/android/app/build/outputs/apk/debug/app-debug.apk" ]; then
    LOCAL_APK="platforms/android/app/build/outputs/apk/debug/app-debug.apk"
else
    echo "❌ APK файл не найден локально!"
    echo "Выполните сборку: npm run build"
    exit 1
fi

echo "📱 Найден APK файл: $LOCAL_APK"
echo "📤 Загрузка на сервер..."

# Используем scp для загрузки
scp "$LOCAL_APK" "$SERVER_USER@$SERVER_HOST:$APP_DIR/app-release.apk"

if [ $? -eq 0 ]; then
    echo "✅ APK файл успешно загружен на сервер!"
    echo "🌐 Файл доступен: https://aiternitas.ru/download/apk"
else
    echo "❌ Ошибка при загрузке APK файла"
    exit 1
fi

