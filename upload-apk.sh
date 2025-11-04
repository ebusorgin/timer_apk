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
LOCAL_APK=""
if [ -f "app-release.apk" ]; then
    LOCAL_APK="app-release.apk"
elif [ -f "platforms/android/app/build/outputs/apk/release/app-release-unsigned.apk" ]; then
    LOCAL_APK="platforms/android/app/build/outputs/apk/release/app-release-unsigned.apk"
elif [ -f "platforms/android/app/build/outputs/apk/debug/app-debug.apk" ]; then
    LOCAL_APK="platforms/android/app/build/outputs/apk/debug/app-debug.apk"
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
echo "📤 Загрузка на сервер $SERVER_USER@$SERVER_HOST:$APP_DIR/app-release.apk..."

# Проверка наличия sshpass для использования пароля
if command -v sshpass &> /dev/null; then
    echo "📝 Использование sshpass для аутентификации..."
    sshpass -p "$SSH_PASSWORD" scp -o StrictHostKeyChecking=no "$LOCAL_APK" "$SERVER_USER@$SERVER_HOST:$APP_DIR/app-release.apk"
else
    echo "⚠️  sshpass не установлен. Потребуется ввод пароля вручную."
    echo "   Для автоматической загрузки установите sshpass:"
    echo "   - Linux: sudo apt-get install sshpass"
    echo "   - macOS: brew install hudochenkov/sshpass/sshpass"
    echo ""
    scp "$LOCAL_APK" "$SERVER_USER@$SERVER_HOST:$APP_DIR/app-release.apk"
fi

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ APK файл успешно загружен на сервер!"
    echo "🌐 Файл доступен по адресу: https://aiternitas.ru/download/apk"
    echo ""
    echo "📋 Проверка файла на сервере..."
    sshpass -p "$SSH_PASSWORD" ssh -o StrictHostKeyChecking=no "$SERVER_USER@$SERVER_HOST" "ls -lh $APP_DIR/app-release.apk" 2>/dev/null || \
    ssh "$SERVER_USER@$SERVER_HOST" "ls -lh $APP_DIR/app-release.apk" 2>/dev/null || echo "⚠️  Не удалось проверить файл на сервере"
else
    echo ""
    echo "❌ Ошибка при загрузке APK файла"
    echo ""
    echo "Попробуйте вручную:"
    echo "  scp $LOCAL_APK $SERVER_USER@$SERVER_HOST:$APP_DIR/app-release.apk"
    exit 1
fi

