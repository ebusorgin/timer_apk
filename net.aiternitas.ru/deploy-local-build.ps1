# Deploy net.aiternitas.ru to subdomain (same server as aiternitas.ru)

$Server = "root@82.146.44.126"
$SshKey = "$env:USERPROFILE\.ssh\id_rsa_aiternitas"
$RemoteDir = "/opt/net"
$ServiceName = "net.aiternitas.service"
$Port = 3004
$Root = $PSScriptRoot

Write-Host "=== Deploy net.aiternitas.ru ===" -ForegroundColor Green

Write-Host ""
Write-Host "[1/7] Package extension zip..." -ForegroundColor Yellow
if (Test-Path "$Root\web\public\extension.zip") { Remove-Item "$Root\web\public\extension.zip" -Force }
Compress-Archive -Path "$Root\chrome-extension\*" -DestinationPath "$Root\web\public\extension.zip" -Force
Write-Host "OK" -ForegroundColor Green

Write-Host ""
Write-Host "[2/7] Build web..." -ForegroundColor Yellow
Set-Location $Root
npm run web:build
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed" -ForegroundColor Red; exit 1 }
Write-Host "OK" -ForegroundColor Green

Write-Host ""
Write-Host "[3/7] Create dirs on server..." -ForegroundColor Yellow
ssh -i $SshKey -o StrictHostKeyChecking=no $Server "mkdir -p $RemoteDir/server $RemoteDir/web/dist $RemoteDir/data $RemoteDir/shared $RemoteDir/core"

Write-Host ""
Write-Host "[4/7] Upload files..." -ForegroundColor Yellow
scp -i $SshKey -o StrictHostKeyChecking=no "$Root\package.json" "${Server}:${RemoteDir}/"
scp -i $SshKey -o StrictHostKeyChecking=no -r "$Root\server\*" "${Server}:${RemoteDir}/server/"
scp -i $SshKey -o StrictHostKeyChecking=no -r "$Root\web\dist\*" "${Server}:${RemoteDir}/web/dist/"
scp -i $SshKey -o StrictHostKeyChecking=no -r "$Root\shared\*" "${Server}:${RemoteDir}/shared/"
scp -i $SshKey -o StrictHostKeyChecking=no -r "$Root\core\*" "${Server}:${RemoteDir}/core/"
scp -i $SshKey -o StrictHostKeyChecking=no "$Root\nginx-net.conf" "${Server}:/etc/nginx/sites-available/net.aiternitas.ru"
Write-Host "OK" -ForegroundColor Green

Write-Host ""
Write-Host "[5/7] .env and npm install..." -ForegroundColor Yellow
scp -i $SshKey -o StrictHostKeyChecking=no "$Root\scripts\setup-env.sh" "${Server}:${RemoteDir}/"
ssh -i $SshKey -o StrictHostKeyChecking=no $Server "chmod +x $RemoteDir/setup-env.sh; $RemoteDir/setup-env.sh"

Write-Host ""
Write-Host "[6/7] Systemd service..." -ForegroundColor Yellow
scp -i $SshKey -o StrictHostKeyChecking=no "$Root\net.aiternitas.service" "${Server}:/etc/systemd/system/$ServiceName"
ssh -i $SshKey -o StrictHostKeyChecking=no $Server "systemctl daemon-reload; systemctl enable $ServiceName; systemctl restart $ServiceName"

Write-Host ""
Write-Host "[7/7] Nginx..." -ForegroundColor Yellow
ssh -i $SshKey -o StrictHostKeyChecking=no $Server "ln -sf /etc/nginx/sites-available/net.aiternitas.ru /etc/nginx/sites-enabled/net.aiternitas.ru 2>/dev/null; nginx -t && systemctl reload nginx"

Write-Host ""
Write-Host "=== Deploy done ===" -ForegroundColor Green
Write-Host "Site: https://net.aiternitas.ru"
Write-Host "If 502: run certbot on server for net.aiternitas.ru"
