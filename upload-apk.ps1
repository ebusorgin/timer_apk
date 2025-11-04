# Upload APK to server
# Usage: .\upload-apk.ps1

$ErrorActionPreference = "Continue"

$SERVER_HOST = "82.146.44.126"
$SERVER_USER = "root"
$APP_DIR = "/opt/voice-room"
$SSH_PASSWORD = if ($env:SSH_PASSWORD) { $env:SSH_PASSWORD } else { "carFds43" }

Write-Host "🔍 Поиск локального APK файла..." -ForegroundColor Cyan

$LOCAL_APK = $null
# Приоритет debug APK - он подписан и готов к установке
if (Test-Path "app-debug.apk") {
    $LOCAL_APK = "app-debug.apk"
}
elseif (Test-Path "app-release.apk") {
    $LOCAL_APK = "app-release.apk"
}
elseif (Test-Path "platforms\android\app\build\outputs\apk\debug\app-debug.apk") {
    $LOCAL_APK = "platforms\android\app\build\outputs\apk\debug\app-debug.apk"
}
elseif (Test-Path "platforms\android\app\build\outputs\apk\release\app-release-unsigned.apk") {
    $LOCAL_APK = "platforms\android\app\build\outputs\apk\release\app-release-unsigned.apk"
}

if (-not $LOCAL_APK) {
    Write-Host "❌ APK файл не найден локально!" -ForegroundColor Red
    Write-Host "Выполните сборку: npm run build" -ForegroundColor Yellow
    exit 1
}

# Определяем имя файла на сервере - для debug используем app-debug.apk
$serverFileName = if ($LOCAL_APK -like "*debug*") { "app-debug.apk" } else { "app-release.apk" }

Write-Host "✅ Найден APK файл: $LOCAL_APK" -ForegroundColor Green
$apkSize = (Get-Item $LOCAL_APK).Length

# Проверка размера APK перед загрузкой
if ($apkSize -lt 1000) {
    Write-Host "❌ APK файл слишком маленький ($apkSize байт), возможно поврежден!" -ForegroundColor Red
    exit 1
}

Write-Host "📦 Размер APK: $([math]::Round($apkSize / 1MB, 2)) MB" -ForegroundColor Yellow
Write-Host ""
$uploadTarget = "${SERVER_USER}@${SERVER_HOST}:${APP_DIR}/${serverFileName}"
Write-Host "📤 Загрузка на сервер ${uploadTarget}..." -ForegroundColor Cyan
Write-Host "Пароль: $SSH_PASSWORD" -ForegroundColor Yellow
Write-Host ""

# Use scp directly - user will need to enter password
scp -o StrictHostKeyChecking=no "$LOCAL_APK" "$uploadTarget"

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ APK файл успешно загружен на сервер!" -ForegroundColor Green
    Write-Host "🌐 Файл доступен по адресу: https://aiternitas.ru/download/apk" -ForegroundColor Cyan
}
else {
    Write-Host ""
    Write-Host "❌ Ошибка при загрузке APK файла" -ForegroundColor Red
    Write-Host ""
    Write-Host "Попробуйте вручную:"
    Write-Host "scp `"$LOCAL_APK`" `"$uploadTarget`"" -ForegroundColor White
    exit 1
}
