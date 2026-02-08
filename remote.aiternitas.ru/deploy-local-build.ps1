# Deploy remote.aiternitas.ru to production

$Server = "root@82.146.44.126"
$SshKey = "$env:USERPROFILE\.ssh\id_rsa_aiternitas"
$RemoteDir = "/opt/remote"
$ServiceName = "remote.aiternitas.service"
$Root = $PSScriptRoot

Write-Host "=== Deploy remote.aiternitas.ru ===" -ForegroundColor Green

Write-Host ""
Write-Host "[1/5] Create dirs on server..." -ForegroundColor Yellow
ssh -i $SshKey -o StrictHostKeyChecking=no $Server "mkdir -p $RemoteDir/server $RemoteDir/web"

Write-Host ""
Write-Host "[2/5] Upload files..." -ForegroundColor Yellow
scp -i $SshKey -o StrictHostKeyChecking=no "$Root\requirements.txt" "${Server}:${RemoteDir}/"
scp -i $SshKey -o StrictHostKeyChecking=no -r "$Root\server\*" "${Server}:${RemoteDir}/server/"
scp -i $SshKey -o StrictHostKeyChecking=no -r "$Root\web\*" "${Server}:${RemoteDir}/web/"
Write-Host "OK" -ForegroundColor Green

Write-Host ""
Write-Host "[3/5] Python venv, dependencies, .env..." -ForegroundColor Yellow
ssh -i $SshKey -o StrictHostKeyChecking=no $Server "cd $RemoteDir && mkdir -p data && (test -f .env || printf 'JWT_SECRET=%s\nREMOTE_DB_PATH=/opt/remote/data/remote.db\n' `$(openssl rand -hex 32) > .env) && (test -d venv || python3 -m venv venv) && ./venv/bin/python -m pip install -r requirements.txt -q"
Write-Host "OK" -ForegroundColor Green

Write-Host ""
Write-Host "[4/5] Systemd services (Xvfb + Remote)..." -ForegroundColor Yellow
ssh -i $SshKey -o StrictHostKeyChecking=no $Server "apt install -y xvfb python3-tk 2>/dev/null || true"
scp -i $SshKey -o StrictHostKeyChecking=no "$Root\xvfb.service" "${Server}:/etc/systemd/system/xvfb.service"
scp -i $SshKey -o StrictHostKeyChecking=no "$Root\remote.aiternitas.service" "${Server}:/etc/systemd/system/$ServiceName"
ssh -i $SshKey -o StrictHostKeyChecking=no $Server "systemctl daemon-reload; systemctl enable xvfb.service; systemctl start xvfb.service; systemctl enable $ServiceName; systemctl restart $ServiceName"
Write-Host "OK" -ForegroundColor Green

Write-Host ""
Write-Host "[5/5] Nginx..." -ForegroundColor Yellow
# Используем HTTP-only если SSL ещё не настроен (certbot создаст полный конфиг)
scp -i $SshKey -o StrictHostKeyChecking=no "$Root\nginx-remote-http-only.conf" "${Server}:/etc/nginx/sites-available/remote.aiternitas.ru"
ssh -i $SshKey -o StrictHostKeyChecking=no $Server "ln -sf /etc/nginx/sites-available/remote.aiternitas.ru /etc/nginx/sites-enabled/remote.aiternitas.ru 2>/dev/null; nginx -t && systemctl reload nginx"
Write-Host "OK" -ForegroundColor Green

Write-Host ""
Write-Host "=== Deploy done ===" -ForegroundColor Green
Write-Host "Site: https://remote.aiternitas.ru"
Write-Host "If 502: run certbot --nginx -d remote.aiternitas.ru on server"
