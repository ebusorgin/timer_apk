#!/bin/bash
# Скрипт для загрузки APK файла на сервер
# Использование: 
#   bash upload-apk.sh
#   Или с паролем: SSH_PASSWORD="your_password" bash upload-apk.sh

set -e

SERVER_HOST="82.146.44.126"
SERVER_USER="root"
APP_DIR="/opt/voice-room"
SSH_PASSWORD="${SSH_PASSWORD:-carFds43}"

echo "🔍 Поиск локального APK файла..."

# Поиск локального APK файла
# Приоритет debug APK - он подписан и готов к установке
LOCAL_APK=""
if [ -f "app-debug.apk" ]; then
    LOCAL_APK="app-debug.apk"
elif [ -f "app-release.apk" ]; then
    LOCAL_APK="app-release.apk"
elif [ -f "platforms/android/app/build/outputs/apk/debug/app-debug.apk" ]; then
    LOCAL_APK="platforms/android/app/build/outputs/apk/debug/app-debug.apk"
elif [ -f "platforms/android/app/build/outputs/apk/release/app-release-unsigned.apk" ]; then
    LOCAL_APK="platforms/android/app/build/outputs/apk/release/app-release-unsigned.apk"
else
    echo "❌ APK файл не найден локально!"
    echo ""
    echo "Выполните сборку:"
    echo "  npm run build"
    echo ""
    echo "После сборки APK будет находиться в:"
    echo "  - platforms/android/app/build/outputs/apk/release/app-release-unsigned.apk"
    echo "  - platforms/android/app/build/outputs/apk/debug/app-debug.apk"
    exit 1
fi

echo "✅ Найден APK файл: $LOCAL_APK"
# Определяем имя файла на сервере - для debug используем app-debug.apk
SERVER_FILE_NAME="app-release.apk"
if echo "$LOCAL_APK" | grep -q "debug"; then
    SERVER_FILE_NAME="app-debug.apk"
fi

echo "📤 Загрузка на сервер $SERVER_USER@$SERVER_HOST:$APP_DIR/$SERVER_FILE_NAME..."

# Проверка размера APK перед загрузкой
APK_SIZE=$(stat -f%z "$LOCAL_APK" 2>/dev/null || stat -c%s "$LOCAL_APK" 2>/dev/null || echo "0")
if [ "$APK_SIZE" -lt 1000 ]; then
    echo "❌ APK файл слишком маленький ($APK_SIZE байт), возможно поврежден!"
    exit 1
fi
APK_SIZE_MB=$(echo "scale=2; $APK_SIZE / 1024 / 1024" | bc 2>/dev/null || awk "BEGIN {printf \"%.2f\", $APK_SIZE / 1024 / 1024}")
echo "📦 Размер APK: ${APK_SIZE_MB} MB"

# Проверка наличия sshpass для использования пароля
if command -v sshpass &> /dev/null; then
    echo "📝 Использование sshpass для аутентификации..."
    sshpass -p "$SSH_PASSWORD" scp -o StrictHostKeyChecking=no "$LOCAL_APK" "$SERVER_USER@$SERVER_HOST:$APP_DIR/$SERVER_FILE_NAME"
else
    echo "⚠️  sshpass не установлен. Потребуется ввод пароля вручную."
    echo "   Для автоматической загрузки установите sshpass:"
    echo "   - Linux: sudo apt-get install sshpass"
    echo "   - macOS: brew install hudochenkov/sshpass/sshpass"
    echo ""
    scp "$LOCAL_APK" "$SERVER_USER@$SERVER_HOST:$APP_DIR/$SERVER_FILE_NAME"
fi

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ APK файл успешно загружен на сервер!"
    echo "🌐 Файл доступен по адресу: https://aiternitas.ru/download/apk"
    echo ""
    echo "📋 Проверка файла на сервере..."
    sshpass -p "$SSH_PASSWORD" ssh -o StrictHostKeyChecking=no "$SERVER_USER@$SERVER_HOST" "ls -lh $APP_DIR/$SERVER_FILE_NAME" 2>/dev/null || \
    ssh "$SERVER_USER@$SERVER_HOST" "ls -lh $APP_DIR/$SERVER_FILE_NAME" 2>/dev/null || echo "⚠️  Не удалось проверить файл на сервере"
else
    echo ""
    echo "❌ Ошибка при загрузке APK файла"
    echo ""
    echo "Попробуйте вручную:"
    echo "  scp $LOCAL_APK $SERVER_USER@$SERVER_HOST:$APP_DIR/$SERVER_FILE_NAME"
    exit 1
fi

