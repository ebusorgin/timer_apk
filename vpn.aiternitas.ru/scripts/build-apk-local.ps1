# Local APK build: uses C:\vb (short path) to avoid Windows 260-char limit
# Requires: Android SDK (ANDROID_HOME), Java, Node.js

$ErrorActionPreference = "Stop"
$ProjectRoot = "$PSScriptRoot\.."
$AppDir = "$ProjectRoot\app"
$WebPublic = "$ProjectRoot\web\public"
$Server = "root@82.146.44.126"
$SshKey = "C:\Users\evg\.ssh\id_rsa_aiternitas"

$BuildDir = "C:\vb"
New-Item -ItemType Directory -Path $BuildDir -Force | Out-Null

Write-Host "=== Local APK Build ===" -ForegroundColor Cyan

try {
    # 1. Copy app (exclude android, node_modules)
    Write-Host "`n[1/5] Copying to $BuildDir..." -ForegroundColor Yellow
    robocopy $AppDir $BuildDir /E /XD android node_modules .expo .git /NFL /NDL /NJH /NJS /nc /ns /np
    if ($LASTEXITCODE -ge 8) { throw "Copy failed" }

    Push-Location $BuildDir

    # 2. Install deps
    Write-Host "`n[2/5] Installing dependencies..." -ForegroundColor Yellow
    npm install

    # 3. Prebuild
    Write-Host "`n[3/5] Running expo prebuild..." -ForegroundColor Yellow
    npx expo prebuild --platform android --no-install

    # 4. Build APK
    Write-Host "`n[4/5] Building APK with Gradle..." -ForegroundColor Yellow
    $androidDir = "$BuildDir\android"
    if (-not (Test-Path "$androidDir\gradlew.bat")) {
        Write-Host "  ERROR: gradlew.bat not found." -ForegroundColor Red
        exit 1
    }
    Set-Location $androidDir
    cmd /c "gradlew.bat assembleRelease"
    if ($LASTEXITCODE -ne 0) { exit 1 }

    # 5. Copy APK + upload
    $apkPath = "$androidDir\app\build\outputs\apk\release\app-release.apk"
    if (-not (Test-Path $apkPath)) {
        Write-Host "  APK not found at $apkPath" -ForegroundColor Red
        exit 1
    }
    New-Item -ItemType Directory -Path $WebPublic -Force | Out-Null
    Copy-Item $apkPath "$WebPublic\vpn-app.apk" -Force
    Write-Host "`n[5/5] APK copied to web/public/vpn-app.apk" -ForegroundColor Green

    Write-Host "`n  Uploading to server..." -ForegroundColor Yellow
    scp -i $SshKey -o StrictHostKeyChecking=no "$WebPublic\vpn-app.apk" "${Server}:/opt/vpn/public/"
    Write-Host "Done. https://vpn.aiternitas.ru/vpn-app.apk" -ForegroundColor Green
}
finally {
    Pop-Location -ErrorAction SilentlyContinue
    if (Test-Path $BuildDir) {
        Write-Host "`n  Cleaning..." -ForegroundColor Gray
        Remove-Item -Recurse -Force $BuildDir -ErrorAction SilentlyContinue
    }
}
