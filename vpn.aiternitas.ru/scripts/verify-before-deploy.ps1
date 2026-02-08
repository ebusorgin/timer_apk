# Verify before deploy: run tests and build
# Run this before deploy to catch bugs early

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot

Write-Host "=== Verify Before Deploy ===" -ForegroundColor Cyan

# 1. Web tests
Write-Host "`n[1/3] Web tests..." -ForegroundColor Yellow
Set-Location "$Root\web"
npm run test
if ($LASTEXITCODE -ne 0) {
    Write-Host "Web tests failed." -ForegroundColor Red
    exit 1
}
Write-Host "  OK" -ForegroundColor Green

# 2. Web build
Write-Host "`n[2/3] Web build..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Web build failed." -ForegroundColor Red
    exit 1
}
Write-Host "  OK" -ForegroundColor Green

# 3. Check standalone includes anon route
Write-Host "`n[3/3] Checking build output..." -ForegroundColor Yellow
$anonRoute = "$Root\web\.next\standalone\.next\server\app\api\config\anon"
if (-not (Test-Path $anonRoute)) {
    Write-Host "  WARNING: /api/config/anon not found in standalone build. Run 'npm run build' with clean .next" -ForegroundColor Yellow
} else {
    Write-Host "  OK" -ForegroundColor Green
}

Write-Host "`n=== Verify OK ===" -ForegroundColor Green
