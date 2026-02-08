# Запустите этот скрипт для полного деплоя VPN (APK + Web)
# Требуется: Node.js, Android SDK (для APK), SSH-ключ

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot

Write-Host "`n=== VPN: Build & Deploy ===" -ForegroundColor Cyan

# 1. APK
$apk = "$Root\web\public\vpn-app.apk"
if (-not (Test-Path $apk)) {
    Write-Host "`n[1/3] Building APK..." -ForegroundColor Yellow
    & "$Root\scripts\build-apk-local.ps1"
    if ($LASTEXITCODE -ne 0) { exit 1 }
} else {
    Write-Host "`n[1/3] APK found: web\public\vpn-app.apk" -ForegroundColor Green
}

# 2. Web build
Write-Host "`n[2/3] Building Next.js (npm run build)..." -ForegroundColor Yellow
Push-Location "$Root\web"
if (Test-Path .next) { Remove-Item -Recurse -Force .next }
npm run build
if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Host "Build failed." -ForegroundColor Red; exit 1 }
Pop-Location
Write-Host "  OK" -ForegroundColor Green

# 3. Deploy
Write-Host "`n[3/3] Deploying to server..." -ForegroundColor Yellow
& "$Root\deploy-local-build.ps1"
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "`n=== Done ===" -ForegroundColor Green
Write-Host "APK: https://vpn.aiternitas.ru/api/apk" -ForegroundColor Cyan
Write-Host "Dashboard: https://vpn.aiternitas.ru/dashboard" -ForegroundColor Cyan
