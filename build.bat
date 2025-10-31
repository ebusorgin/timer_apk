@echo off
echo ========================================
echo Сборка Android APK приложения
echo ========================================
echo.
if not exist platforms\android (
    echo Инициализация платформы Android...
    call npm run init
    echo.
)
echo Компиляция APK...
call npm run build
echo.
echo ========================================
if exist platforms\android\app\build\outputs\apk\debug\app-debug.apk (
    echo Готово! APK файл успешно создан!
    echo.
    echo Расположение APK:
    echo %cd%\platforms\android\app\build\outputs\apk\debug\app-debug.apk
    echo.
) else (
    echo Сборка завершена. Проверьте путь к APK файлу.
    echo.
)
pause

