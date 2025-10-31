@echo off
echo ========================================
echo Копирование APK на устройство
echo ========================================
echo.
set APK_PATH=platforms\android\app\build\outputs\apk\debug\app-debug.apk

if not exist "%APK_PATH%" (
    echo APK файл не найден!
    echo Сначала выполните: npm run build
    pause
    exit /b 1
)

echo APK файл найден: %APK_PATH%
echo.
echo ИНСТРУКЦИЯ:
echo 1. Убедитесь, что телефон подключен по USB
echo 2. На телефоне выберите режим "Передача файлов" (MTP)
echo 3. Скопируйте APK файл на телефон (в любую папку)
echo 4. На телефоне откройте файловый менеджер
echo 5. Найдите скопированный APK файл и установите его
echo.
echo Открываю папку с APK файлом...
echo.
explorer /select,"%CD%\%APK_PATH%"

echo.
echo Альтернативный способ:
echo 1. Скопируйте APK файл на телефон через USB
echo 2. Или отправьте APK на телефон через облако (Google Drive, Dropbox и т.д.)
echo 3. Или отправьте себе по email и откройте с телефона
echo.
pause

