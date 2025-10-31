@echo off
echo ========================================
echo Проверка драйверов Android устройства
echo ========================================
echo.
echo Открываю Диспетчер устройств...
echo.
echo ИНСТРУКЦИЯ:
echo 1. В Диспетчере устройств найдите ваше Android устройство
echo    - Может быть в разделе "Портативные устройства" или "Другие устройства"
echo    - Если устройство отображается с желтым треугольником - драйвер не установлен
echo.
echo 2. Если устройство НЕ найдено:
echo    - Отключите и снова подключите телефон
echo    - Попробуйте другой USB порт
echo    - Попробуйте другой USB кабель
echo.
echo 3. Если устройство найдено, но с ошибкой:
echo    - Правый клик на устройство -^> Обновить драйвер
echo    - Выбрать "Выполнить поиск драйверов на этом компьютере"
echo    - Если у вас есть папка с драйверами, укажите путь
echo    - Или выберите "Выбрать драйвер из списка" и попробуйте "Android ADB Interface"
echo.
echo Нажмите любую клавишу для открытия Диспетчера устройств...
pause >nul

start devmgmt.msc

echo.
echo ========================================
echo Также можно установить универсальные драйверы:
echo ========================================
echo.
echo 1. Скачайте Universal ADB Driver:
echo    https://github.com/koush/UniversalAdbDriver/releases
echo.
echo 2. Или скачайте драйверы от производителя:
echo    Samsung: https://developer.samsung.com/mobile/android-usb-driver.html
echo    Xiaomi: Установите Mi PC Suite
echo    Huawei: Установите HiSuite
echo    OnePlus: Установите OnePlus USB Driver
echo.
echo Нажмите любую клавишу для проверки устройства через ADB...
pause >nul

adb devices

echo.
pause

