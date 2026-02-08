# Build Conference Android APK (Capacitor WebView wrapper)
# Requires: Android SDK (ANDROID_HOME), Java, Node.js

$ErrorActionPreference = "Stop"
$ProjectRoot = "$PSScriptRoot\.."
$AppDir = "$ProjectRoot\android-app"
$WwwDir = "$ProjectRoot\www"
$Server = "root@82.146.44.126"
$SshKey = "$env:USERPROFILE\.ssh\id_rsa_aiternitas"

$BuildDir = "C:\vb"
New-Item -ItemType Directory -Path $BuildDir -Force | Out-Null

Write-Host "=== Conference APK Build ===" -ForegroundColor Cyan

try {
    # 1. Copy android-app (exclude node_modules)
    Write-Host "`n[1/5] Copying to $BuildDir..." -ForegroundColor Yellow
    robocopy $AppDir $BuildDir /E /XD node_modules .git /NFL /NDL /NJH /NJS /nc /ns /np
    if ($LASTEXITCODE -ge 8) { throw "Copy failed" }

    Push-Location $BuildDir

    # 2. Install deps
    Write-Host "`n[2/5] Installing dependencies..." -ForegroundColor Yellow
    $ErrorActionPreference = "Continue"
    npm install 2>&1 | Out-Null
    $ErrorActionPreference = "Stop"
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }

    # 3. Sync to Android
    Write-Host "`n[3/5] Syncing to Android..." -ForegroundColor Yellow
    $ErrorActionPreference = "Continue"
    npx cap sync android 2>&1 | Out-Null
    $ErrorActionPreference = "Stop"
    if ($LASTEXITCODE -ne 0) { throw "cap sync failed" }

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

    # 5. Copy APK to www/
    $apkDir = "$androidDir\app\build\outputs\apk\release"
    $apkPath = Get-ChildItem -Path $apkDir -Filter "*.apk" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
    if (-not $apkPath) {
        Write-Host "  APK not found in $apkDir" -ForegroundColor Red
        exit 1
    }
    Copy-Item $apkPath "$WwwDir\conference-app.apk" -Force
    Write-Host "`n[5/5] APK copied to www/conference-app.apk" -ForegroundColor Green

    Write-Host "`nDone. Run deploy-local-build.ps1 to upload." -ForegroundColor Green
}
finally {
    Pop-Location -ErrorAction SilentlyContinue
    if (Test-Path $BuildDir) {
        Write-Host "`n  Cleaning..." -ForegroundColor Gray
        Remove-Item -Recurse -Force $BuildDir -ErrorAction SilentlyContinue
    }
}
