@echo off
REM Скрипт для настройки сервера через SSH с паролем
REM Требуется: sshpass или plink из PuTTY

set SERVER=82.146.44.126
set USER=root
set PASS=carFds43

echo 🚀 Настройка сервера %SERVER%...

REM Вариант 1: Использование plink (PuTTY)
REM Скачайте plink.exe с https://www.putty.org/
REM plink -ssh -pw %PASS% %USER%@%SERVER% "bash -s" < server-setup.sh

REM Вариант 2: Загрузка скрипта на сервер и выполнение
echo Загрузка скрипта на сервер...
echo Для выполнения на сервере выполните команды ниже вручную:
echo.
echo ssh %USER%@%SERVER%
echo После подключения выполните:
echo curl -s https://raw.githubusercontent.com/ebusorgin/timer_apk/master/server-setup.sh ^| bash
echo.
echo ИЛИ скопируйте содержимое server-setup.sh на сервер:
echo scp server-setup.sh %USER%@%SERVER%:/tmp/
echo ssh %USER%@%SERVER% "bash /tmp/server-setup.sh"
echo.
pause

