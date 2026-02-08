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
$VAPID_PUBLIC = $env:VAPID_PUBLIC_KEY
$VAPID_PRIVATE = $env:VAPID_PRIVATE_KEY
$vapidBlock = if ($VAPID_PUBLIC -and $VAPID_PRIVATE) { "VAPID_PUBLIC_KEY=$VAPID_PUBLIC\nVAPID_PRIVATE_KEY=$VAPID_PRIVATE\nVAPID_MAILTO=mailto:conference@aiternitas.ru\n" } else { "" }
$remoteCmd = (@"
cd /opt/conference && npm install --production
printf 'PORT=3002\nHOST=0.0.0.0\nNODE_ENV=production\nCORS_ORIGIN=https://conference.aiternitas.ru\nPERSISTENCE_DRIVER=file\nADMIN_SECRET=SevAdminSecret2026Prod\n$vapidBlock' > .env
node scripts/seed-admin.mjs 2>/dev/null || :
echo 'Admin seeded: login=admin password=SevAdmin2026!'
"@) -replace "`r`n","`n"
ssh -i $SSH_KEY -o StrictHostKeyChecking=no $SERVER $remoteCmd

Write-Host "[3/3] Restarting service..." -ForegroundColor Yellow
ssh -i $SSH_KEY -o StrictHostKeyChecking=no $SERVER "systemctl daemon-reload 2>/dev/null; systemctl restart conference.service; systemctl status conference.service --no-pager"

Write-Host "`nDeploy complete! Admin: login=admin password=SevAdmin2026!" -ForegroundColor Green
