# Build Conference Android APK (Capacitor WebView wrapper)
# Requires: Android SDK (ANDROID_HOME), Java, Node.js
# Auto-increments version on each build.

$ErrorActionPreference = "Stop"
$ProjectRoot = "$PSScriptRoot\.."
$AppDir = "$ProjectRoot\android-app"
$WwwDir = "$ProjectRoot\www"
$Server = "root@82.146.44.126"
$SshKey = "$env:USERPROFILE\.ssh\id_rsa_aiternitas"

$BuildDir = "C:\vb"
New-Item -ItemType Directory -Path $BuildDir -Force | Out-Null

Write-Host "=== Conference APK Build ===" -ForegroundColor Cyan

# 0. Auto-increment version (patch)
$pkgPath = "$AppDir\package.json"
$pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
$parts = ($pkg.version -split '\.')
$patch = [int]$parts[2] + 1
$newVersion = "$($parts[0]).$($parts[1]).$patch"
$pkg.version = $newVersion
$pkg | ConvertTo-Json -Depth 10 | Set-Content $pkgPath -Encoding UTF8 -NoNewline
Write-Host "Version: $newVersion" -ForegroundColor Cyan

$gradlePath = "$AppDir\android\app\build.gradle"
$gradleContent = Get-Content $gradlePath -Raw
$versionCodeMatch = [regex]::Match($gradleContent, 'versionCode\s+(\d+)')
$oldCode = if ($versionCodeMatch.Success) { [int]$versionCodeMatch.Groups[1].Value } else { 1 }
$newCode = $oldCode + 1
$gradleContent = $gradleContent -replace 'versionCode\s+\d+', "versionCode $newCode"
$gradleContent = $gradleContent -replace 'versionName\s+"[^"]*"', "versionName `"$newVersion`""
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($gradlePath, $gradleContent, $utf8NoBom)
Write-Host "versionCode: $newCode" -ForegroundColor Cyan

try {
    # 1. Copy android-app (exclude node_modules)
    Write-Host "`n[1/5] Copying to $BuildDir..." -ForegroundColor Yellow
    robocopy $AppDir $BuildDir /E /XD node_modules .git /NFL /NDL /NJH /NJS /nc /ns /np
    if ($LASTEXITCODE -ge 8) { throw "Copy failed" }

    Push-Location $BuildDir

    # 2. Install deps
    Write-Host "`n[2/5] Installing dependencies..." -ForegroundColor Yellow
    $ErrorActionPreference = "Continue"
    npm install --legacy-peer-deps 2>&1 | Out-Null
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

    # 5. Copy APK to www/ and create app-version.json
    $apkDir = "$androidDir\app\build\outputs\apk\release"
    $apkPath = Get-ChildItem -Path $apkDir -Filter "*.apk" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
    if (-not $apkPath) {
        Write-Host "  APK not found in $apkDir" -ForegroundColor Red
        exit 1
    }
    Copy-Item $apkPath "$WwwDir\conference-app.apk" -Force
    $pkg = Get-Content "$BuildDir\package.json" -Raw | ConvertFrom-Json
    $version = if ($pkg.version) { $pkg.version } else { "1.0.0" }
    @{ version = $version; downloadUrl = "/conference-app.apk" } | ConvertTo-Json | Set-Content "$WwwDir\app-version.json" -Encoding UTF8
    Write-Host "`n[5/5] APK copied to www/conference-app.apk, app-version.json ($version)" -ForegroundColor Green

    Write-Host "`nDone. Run deploy-local-build.ps1 to upload." -ForegroundColor Green
}
finally {
    Pop-Location -ErrorAction SilentlyContinue
    if (Test-Path $BuildDir) {
        Write-Host "`n  Cleaning..." -ForegroundColor Gray
        Remove-Item -Recurse -Force $BuildDir -ErrorAction SilentlyContinue
    }
}
