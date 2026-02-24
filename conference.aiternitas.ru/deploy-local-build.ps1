# Deploy conference.aiternitas.ru to production
# Требуется DATABASE_URL: перед деплоем задайте переменную окружения, например:
#   $env:DATABASE_URL = "postgresql://user:pass@host:5432/conference"
$SERVER = "root@82.146.44.126"
$SSH_KEY = "$env:USERPROFILE\.ssh\id_rsa_aiternitas"
$REMOTE_DIR = "/opt/conference"

if (-not (Test-Path $SSH_KEY)) {
    Write-Error "SSH key not found: $SSH_KEY"
    exit 1
}

if (-not $env:DATABASE_URL) {
    Write-Host "DATABASE_URL не задан локально. Пытаюсь получить с сервера..." -ForegroundColor Yellow
    $remoteDb = ssh -i $SSH_KEY -o StrictHostKeyChecking=no $SERVER "grep '^DATABASE_URL=' /opt/conference/.env 2>/dev/null | cut -d= -f2-" 2>$null
    if ($remoteDb) {
        $env:DATABASE_URL = $remoteDb.Trim()
        Write-Host "Используется DATABASE_URL с сервера." -ForegroundColor Green
    }
}
if (-not $env:DATABASE_URL) {
    Write-Error "DATABASE_URL не задан. Укажите: `$env:DATABASE_URL = 'postgresql://user:pass@host:5432/dbname'"
    exit 1
}

Write-Host "=== Deploying Conference Service ===" -ForegroundColor Cyan

# 0.5. Version Increment & Build
Write-Host "[0.5/4] Incrementing version and building APK..." -ForegroundColor Yellow

# Get current version from root package.json as source of truth
$rootPkgPath = "package.json"
$rootPkg = Get-Content $rootPkgPath | ConvertFrom-Json
$oldVersion = $rootPkg.version
$vParts = $oldVersion.Split('.')
if ($vParts.Length -ne 3) {
    $vParts = @(1, 0, 0)
}
$newVersion = "{0}.{1}.{2}" -f $vParts[0], $vParts[1], ([int]$vParts[2] + 1)

Write-Host "Bumping version: $oldVersion -> $newVersion" -ForegroundColor Cyan

# Update all JSON files
$jsonFiles = @("package.json", "android-app/package.json", "www/app-version.json")
foreach ($file in $jsonFiles) {
    if (Test-Path $file) {
        $json = Get-Content $file | ConvertFrom-Json
        $json.version = $newVersion
        $json | ConvertTo-Json -Depth 20 | Set-Content $file
        Write-Host "  Updated $file" -ForegroundColor Gray
    }
}

# Update build.gradle (versionCode and versionName)
$gradlePath = "android-app/android/app/build.gradle"
if (Test-Path $gradlePath) {
    $gradleContent = Get-Content $gradlePath -Raw
    $newCode = 1
    # Ищем versionCode, захватываем число
    if ($gradleContent -match 'versionCode\s+(\d+)') {
        # $matches[1] содержит захваченную группу (число)
        $newCode = [int]$matches[1] + 1
    }
    
    # Заменяем versionCode
    $gradleContent = $gradleContent -replace 'versionCode\s+\d+', "versionCode $newCode"
    # Заменяем versionName
    $gradleContent = $gradleContent -replace 'versionName\s+"[\d\.]+"', "versionName `"$newVersion`""
    
    $gradleContent | Set-Content $gradlePath
    Write-Host "  Updated $gradlePath (Code: $newCode)" -ForegroundColor Gray
}

# Build APK
Write-Host "Building Android APK (release)..." -ForegroundColor Yellow
cmd /c "cd android-app\android && .\gradlew.bat assembleRelease"
if ($LASTEXITCODE -ne 0) {
    Write-Error "Android build failed. Deployment aborted."
    exit 1
}

# Copy APK to www
$apkSource = "android-app/android/app/build/outputs/apk/release/app-release.apk"
$apkDest = "www/conference-app.apk"
cmd /c "copy $apkSource $apkDest /Y"
Write-Host "APK copied to $apkDest" -ForegroundColor Green

# 1. Upload (НЕ копируем server/data — иначе затираем пользователей на проде!)
Write-Host "[1/4] Uploading files..." -ForegroundColor Yellow
ssh -i $SSH_KEY -o StrictHostKeyChecking=no $SERVER "mkdir -p ${REMOTE_DIR}/server ${REMOTE_DIR}/server/data ${REMOTE_DIR}/www ${REMOTE_DIR}/scripts"
scp -i $SSH_KEY -o StrictHostKeyChecking=no package.json package-lock.json "${SERVER}:${REMOTE_DIR}/"
scp -i $SSH_KEY -o StrictHostKeyChecking=no server/app.mjs server/config.mjs server/server.mjs "${SERVER}:${REMOTE_DIR}/server/"
scp -i $SSH_KEY -o StrictHostKeyChecking=no -r server/middleware server/persistence server/routes server/services server/sockets server/utils "${SERVER}:${REMOTE_DIR}/server/"
if (Test-Path "server/firebase-service-account.json") {
    scp -i $SSH_KEY -o StrictHostKeyChecking=no server/firebase-service-account.json "${SERVER}:${REMOTE_DIR}/server/"
}
scp -i $SSH_KEY -o StrictHostKeyChecking=no -r www/* "${SERVER}:${REMOTE_DIR}/www/"
scp -i $SSH_KEY -o StrictHostKeyChecking=no -r scripts/* "${SERVER}:${REMOTE_DIR}/scripts/"

# 2. Create .env on server FIRST (перед npm install и миграцией)
Write-Host "[2/4] Creating .env and installing dependencies..." -ForegroundColor Yellow
$DEFAULT_VAPID_PUBLIC = "BBBkgqKqGV3RSTUacZd5T0TS1Y-7CDIAo2zzNfUMrs4gj83b4n7Q2I2lF6cFOOMbKiEjU3N4Rt8mi74-t0LDa7Y"
$DEFAULT_VAPID_PRIVATE = "yidI8R79AEgpSyRplEo1O10dIxSX98nQRUYgNCyX6qw"
$VAPID_PUBLIC = if ($env:VAPID_PUBLIC_KEY) { $env:VAPID_PUBLIC_KEY } else { $DEFAULT_VAPID_PUBLIC }
$VAPID_PRIVATE = if ($env:VAPID_PRIVATE_KEY) { $env:VAPID_PRIVATE_KEY } else { $DEFAULT_VAPID_PRIVATE }
$DATABASE_URL_ESC = $env:DATABASE_URL -replace '"', '\"'
$envContent = @"
PORT=3002
HOST=0.0.0.0
NODE_ENV=production
CORS_ORIGIN=https://conference.aiternitas.ru
PERSISTENCE_DRIVER=postgres
PGSSLMODE=disable
DATABASE_URL=$DATABASE_URL_ESC
ADMIN_SECRET=SevAdminSecret2026Prod
REDIS_URL=redis://localhost:6379
VAPID_PUBLIC_KEY=$VAPID_PUBLIC
VAPID_PRIVATE_KEY=$VAPID_PRIVATE
VAPID_MAILTO=mailto:conference@aiternitas.ru
"@
$envB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($envContent))

# Шаг 1: создаем .env
ssh -i $SSH_KEY -o StrictHostKeyChecking=no $SERVER "echo '$envB64' | base64 -d > /opt/conference/.env && echo '.env created'"

# Шаг 2: npm install
ssh -i $SSH_KEY -o StrictHostKeyChecking=no $SERVER "cd /opt/conference && npm install --production"

# Шаг 3: миграция БД (теперь .env уже на месте, DATABASE_URL доступен)
Write-Host "[3/4] Running DB migration..." -ForegroundColor Yellow
ssh -i $SSH_KEY -o StrictHostKeyChecking=no $SERVER "cd /opt/conference && set -a && source .env && set +a && node scripts/migrate-db.mjs"

# Шаг 4: seed admin
ssh -i $SSH_KEY -o StrictHostKeyChecking=no $SERVER "cd /opt/conference && set -a && source .env && set +a && node scripts/seed-admin.mjs 2>/dev/null; echo 'Admin seeded'"

# 4. Restart service
Write-Host "[4/4] Restarting service..." -ForegroundColor Yellow
ssh -i $SSH_KEY -o StrictHostKeyChecking=no $SERVER "systemctl daemon-reload 2>/dev/null; systemctl restart conference.service; systemctl status conference.service --no-pager"

Write-Host "`nDeploy complete! Version: $newVersion" -ForegroundColor Green
