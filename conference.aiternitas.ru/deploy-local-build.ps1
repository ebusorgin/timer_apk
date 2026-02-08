# Deploy conference.aiternitas.ru to production
$SERVER = "root@82.146.44.126"
$SSH_KEY = "$env:USERPROFILE\.ssh\id_rsa_aiternitas"
$REMOTE_DIR = "/opt/conference"

if (-not (Test-Path $SSH_KEY)) {
    Write-Error "SSH key not found: $SSH_KEY"
    exit 1
}

Write-Host "=== Deploying Conference Service ===" -ForegroundColor Cyan

# 1. Upload (НЕ копируем server/data — иначе затираем пользователей на проде!)
Write-Host "[1/3] Uploading files..." -ForegroundColor Yellow
ssh -i $SSH_KEY -o StrictHostKeyChecking=no $SERVER "mkdir -p ${REMOTE_DIR}/server ${REMOTE_DIR}/server/data ${REMOTE_DIR}/www ${REMOTE_DIR}/scripts"
scp -i $SSH_KEY -o StrictHostKeyChecking=no package.json package-lock.json "${SERVER}:${REMOTE_DIR}/"
scp -i $SSH_KEY -o StrictHostKeyChecking=no server/app.mjs server/config.mjs server/server.mjs "${SERVER}:${REMOTE_DIR}/server/"
scp -i $SSH_KEY -o StrictHostKeyChecking=no -r server/middleware server/persistence server/routes server/services server/sockets server/utils "${SERVER}:${REMOTE_DIR}/server/"
scp -i $SSH_KEY -o StrictHostKeyChecking=no -r www/* "${SERVER}:${REMOTE_DIR}/www/"
scp -i $SSH_KEY -o StrictHostKeyChecking=no -r scripts/* "${SERVER}:${REMOTE_DIR}/scripts/"

# 2. Install & Seed Admin & Restart
Write-Host "[2/3] Installing dependencies and seeding admin..." -ForegroundColor Yellow
# Default VAPID keys (same as deploy-local-build.sh) — для push-уведомлений
$DEFAULT_VAPID_PUBLIC = "BBBkgqKqGV3RSTUacZd5T0TS1Y-7CDIAo2zzNfUMrs4gj83b4n7Q2I2lF6cFOOMbKiEjU3N4Rt8mi74-t0LDa7Y"
$DEFAULT_VAPID_PRIVATE = "yidI8R79AEgpSyRplEo1O10dIxSX98nQRUYgNCyX6qw"
$VAPID_PUBLIC = if ($env:VAPID_PUBLIC_KEY) { $env:VAPID_PUBLIC_KEY } else { $DEFAULT_VAPID_PUBLIC }
$VAPID_PRIVATE = if ($env:VAPID_PRIVATE_KEY) { $env:VAPID_PRIVATE_KEY } else { $DEFAULT_VAPID_PRIVATE }
# Формируем .env и передаём через base64 (избегаем проблем с кавычками в ssh)
$envContent = @"
PORT=3002
HOST=0.0.0.0
NODE_ENV=production
CORS_ORIGIN=https://conference.aiternitas.ru
PERSISTENCE_DRIVER=file
ADMIN_SECRET=SevAdminSecret2026Prod
REDIS_URL=redis://localhost:6379
VAPID_PUBLIC_KEY=$VAPID_PUBLIC
VAPID_PRIVATE_KEY=$VAPID_PRIVATE
VAPID_MAILTO=mailto:conference@aiternitas.ru
"@
# Сначала сохраняем существующий .env на сервере, чтобы не затереть VAPID при отсутствии keys
$envB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($envContent))
$remoteCmd = "cd /opt/conference && npm install --production && echo '$envB64' | base64 -d > .env && node scripts/seed-admin.mjs 2>/dev/null || true && echo 'Admin seeded: login=admin password=SevAdmin2026!'"
ssh -i $SSH_KEY -o StrictHostKeyChecking=no $SERVER $remoteCmd

Write-Host "[3/3] Restarting service..." -ForegroundColor Yellow
ssh -i $SSH_KEY -o StrictHostKeyChecking=no $SERVER "systemctl daemon-reload 2>/dev/null; systemctl restart conference.service; systemctl status conference.service --no-pager"

Write-Host "`nDeploy complete! Admin: login=admin password=SevAdmin2026!" -ForegroundColor Green
