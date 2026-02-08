# Deploy school.aiternitas.ru to production
# Требуется DATABASE_URL. Перед первым деплоем на сервере:
#   sudo -u postgres psql -c "CREATE DATABASE school;"
# Локально: $env:DATABASE_URL = "postgresql://user:pass@82.146.44.126:5432/school"

# Load .env if exists
if (Test-Path "$PSScriptRoot\.env") {
    Get-Content "$PSScriptRoot\.env" | ForEach-Object {
        if ($_ -match '^([^#=]+)=(.*)$') {
            [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process')
        }
    }
}

$SERVER = "root@82.146.44.126"
$SSH_KEY = "$env:USERPROFILE\.ssh\id_rsa_aiternitas"
$REMOTE_DIR = "/opt/school"
$Root = $PSScriptRoot

if (-not (Test-Path $SSH_KEY)) {
    Write-Error "SSH key not found: $SSH_KEY"
    exit 1
}

if (-not $env:DATABASE_URL) {
    Write-Host "DATABASE_URL не задан. Пытаюсь получить с сервера (conference/school)..." -ForegroundColor Yellow
    $remoteDb = ssh -i $SSH_KEY -o StrictHostKeyChecking=no $SERVER "grep -h '^DATABASE_URL=' /opt/conference/.env ${REMOTE_DIR}/.env 2>/dev/null | head -1 | cut -d= -f2-" 2>$null
    if ($remoteDb) {
        $env:DATABASE_URL = ($remoteDb.Trim() -replace '/([^/]+)$', '/school')
        Write-Host "Используется DATABASE_URL с сервера (db=school)." -ForegroundColor Green
    }
}
if (-not $env:DATABASE_URL) {
    Write-Error "DATABASE_URL не задан. Укажите: `$env:DATABASE_URL = 'postgresql://user:pass@host:5432/school'"
    exit 1
}

Write-Host "=== Deploying School.aiternitas.ru ===" -ForegroundColor Cyan

# 1. Build Angular
Write-Host "[1/6] Building Angular client..." -ForegroundColor Yellow
Set-Location "$Root\client"
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed" -ForegroundColor Red; exit 1 }
Set-Location $Root
Write-Host "OK" -ForegroundColor Green

# 2. Create dirs and upload
Write-Host "[2/6] Uploading files..." -ForegroundColor Yellow
ssh -i $SSH_KEY -o StrictHostKeyChecking=no $SERVER "mkdir -p ${REMOTE_DIR}/server ${REMOTE_DIR}/scripts ${REMOTE_DIR}/client/dist/client/browser"
scp -i $SSH_KEY -o StrictHostKeyChecking=no package.json package-lock.json "${SERVER}:${REMOTE_DIR}/"
scp -i $SSH_KEY -o StrictHostKeyChecking=no server/server.mjs server/config.mjs "${SERVER}:${REMOTE_DIR}/server/"
scp -i $SSH_KEY -o StrictHostKeyChecking=no -r server/middleware server/persistence server/routes server/services "${SERVER}:${REMOTE_DIR}/server/"
scp -i $SSH_KEY -o StrictHostKeyChecking=no -r client/dist/client/browser/* "${SERVER}:${REMOTE_DIR}/client/dist/client/browser/"
scp -i $SSH_KEY -o StrictHostKeyChecking=no -r scripts/*.mjs "${SERVER}:${REMOTE_DIR}/scripts/"
scp -i $SSH_KEY -o StrictHostKeyChecking=no nginx-school.conf "${SERVER}:/etc/nginx/sites-available/school.aiternitas.ru"
scp -i $SSH_KEY -o StrictHostKeyChecking=no scripts/school.service "${SERVER}:/etc/systemd/system/school.service"
Write-Host "OK" -ForegroundColor Green

# 3. .env
Write-Host "[3/6] Configuring .env..." -ForegroundColor Yellow
$ADMIN_EMAIL = if ($env:ADMIN_EMAIL) { $env:ADMIN_EMAIL } else { "admin@school.aiternitas.ru" }
$ADMIN_PASS = if ($env:ADMIN_PASSWORD) { $env:ADMIN_PASSWORD } else { "SchoolAdmin2026!" }
$JWT_SECRET = if ($env:JWT_SECRET) { $env:JWT_SECRET } else { "school-jwt-secret-prod-$(Get-Random)" }
$ADMIN_SECRET = if ($env:ADMIN_SECRET) { $env:ADMIN_SECRET } else { "SchoolAdminSecret2026" }
$DATABASE_URL_ESC = $env:DATABASE_URL -replace '"', '\"'
$envContent = @"
PORT=3010
HOST=0.0.0.0
NODE_ENV=production
CORS_ORIGIN=https://school.aiternitas.ru
DATABASE_URL=$DATABASE_URL_ESC
REDIS_URL=redis://localhost:6379
JWT_SECRET=$JWT_SECRET
ADMIN_SECRET=$ADMIN_SECRET
ADMIN_EMAIL=$ADMIN_EMAIL
ADMIN_PASSWORD=$ADMIN_PASS
"@
$envB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($envContent))
ssh -i $SSH_KEY -o StrictHostKeyChecking=no $SERVER "cd $REMOTE_DIR && echo '$envB64' | base64 -d > .env"
Write-Host "OK" -ForegroundColor Green

# 4. Create DB if needed, npm install, migrate, seed
Write-Host "[4/6] Installing and seeding..." -ForegroundColor Yellow
$remoteCmd = "sudo -u postgres psql -c 'CREATE DATABASE school;' 2>/dev/null || true; cd $REMOTE_DIR && npm install --production && node scripts/migrate-db.mjs && node scripts/seed-school-types.mjs && node scripts/seed-directions.mjs && node scripts/seed-programs.mjs && node scripts/seed-admin.mjs"
ssh -i $SSH_KEY -o StrictHostKeyChecking=no $SERVER $remoteCmd
Write-Host "OK" -ForegroundColor Green

# 5. Restart service and nginx
Write-Host "[5/6] Restarting service..." -ForegroundColor Yellow
ssh -i $SSH_KEY -o StrictHostKeyChecking=no $SERVER @"
systemctl daemon-reload
systemctl enable school.service 2>/dev/null
systemctl restart school.service
ln -sf /etc/nginx/sites-available/school.aiternitas.ru /etc/nginx/sites-enabled/school.aiternitas.ru 2>/dev/null
nginx -t 2>/dev/null && systemctl reload nginx
systemctl status school.service --no-pager
"@

# 6. Git push to production
Write-Host "[6/6] Pushing to production branch..." -ForegroundColor Yellow
$gitRoot = $Root
while (-not (Test-Path "$gitRoot\.git") -and $gitRoot) { $gitRoot = Split-Path $gitRoot -Parent }
if (Test-Path "$gitRoot\.git") {
    Push-Location $gitRoot
    try {
        $remotes = git remote 2>$null
        if ($remotes -notmatch "origin") {
            git remote add origin git@github.com:ebusorgin/school_aiternitas_ru.git 2>$null
        }
        git add -A 2>$null
        $status = git status --porcelain 2>$null
        if ($status) {
            git commit -m "deploy: $(Get-Date -Format 'yyyy-MM-dd HH:mm')" 2>$null
        }
        git push origin HEAD:production 2>$null
        if ($LASTEXITCODE -eq 0) { Write-Host "OK" -ForegroundColor Green } else { Write-Host "Push skipped or failed" -ForegroundColor Yellow }
    } catch { Write-Host "Git push skipped: $_" -ForegroundColor Yellow }
    Pop-Location
} else {
    Write-Host "No .git found, skip" -ForegroundColor Yellow
}

Write-Host "`n=== Deploy complete ===" -ForegroundColor Green
Write-Host "Site: https://school.aiternitas.ru"
Write-Host "Admin: $ADMIN_EMAIL / $ADMIN_PASS"
Write-Host "If 502: run on server: certbot --nginx -d school.aiternitas.ru"
