# Upload APK to server
# Usage: .\upload-apk.ps1

$ErrorActionPreference = "Continue"

$SERVER_HOST = "82.146.44.126"
$SERVER_USER = "root"
$APP_DIR = "/opt/voice-room"
$SSH_PASSWORD = if ($env:SSH_PASSWORD) { $env:SSH_PASSWORD } else { "carFds43" }

Write-Host "Searching for APK file..." -ForegroundColor Cyan

$LOCAL_APK = $null
if (Test-Path "app-release.apk") {
    $LOCAL_APK = "app-release.apk"
}
elseif (Test-Path "platforms\android\app\build\outputs\apk\release\app-release-unsigned.apk") {
    $LOCAL_APK = "platforms\android\app\build\outputs\apk\release\app-release-unsigned.apk"
}
elseif (Test-Path "platforms\android\app\build\outputs\apk\debug\app-debug.apk") {
    $LOCAL_APK = "platforms\android\app\build\outputs\apk\debug\app-debug.apk"
}

if (-not $LOCAL_APK) {
    Write-Host "APK file not found locally!" -ForegroundColor Red
    Write-Host "Run: npm run build" -ForegroundColor Yellow
    exit 1
}

Write-Host "Found APK file: $LOCAL_APK" -ForegroundColor Green
$apkSize = (Get-Item $LOCAL_APK).Length
Write-Host "File size: $([math]::Round($apkSize / 1MB, 2)) MB" -ForegroundColor Yellow
Write-Host ""
Write-Host "Uploading to server..." -ForegroundColor Cyan
Write-Host "When prompted for password, enter: $SSH_PASSWORD" -ForegroundColor Yellow
Write-Host ""

# Use scp directly - user will need to enter password
scp -o StrictHostKeyChecking=no "$LOCAL_APK" "${SERVER_USER}@${SERVER_HOST}:${APP_DIR}/app-release.apk"

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "APK file uploaded successfully!" -ForegroundColor Green
    Write-Host "Available at: https://aiternitas.ru/download/apk" -ForegroundColor Cyan
}
else {
    Write-Host ""
    Write-Host "Upload failed. Try manually:" -ForegroundColor Red
    Write-Host "scp $LOCAL_APK ${SERVER_USER}@${SERVER_HOST}:${APP_DIR}/app-release.apk" -ForegroundColor White
}
