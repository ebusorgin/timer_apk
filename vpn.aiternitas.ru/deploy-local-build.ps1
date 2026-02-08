# Deploy VPN to server (Local Build -> Remote)
$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot
$Server = "root@82.146.44.126"
$SshKey = "C:\Users\evg\.ssh\id_rsa_aiternitas"
$RemoteDir = "/opt/vpn"
$ServiceName = "vpn.service"

# 1. Verify (tests + build)
& "$ProjectRoot\scripts\verify-before-deploy.ps1"
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "`n=== Deploying VPN Service ===" -ForegroundColor Cyan

# 2. Upload
Write-Host "`n[1/3] Uploading files to server..." -ForegroundColor Yellow
ssh -i $SshKey -o StrictHostKeyChecking=no $Server "mkdir -p $RemoteDir/.next/static $RemoteDir/public $RemoteDir/prisma $RemoteDir/docker/vpn-tor"

Write-Host "  Standalone Build..."
scp -i $SshKey -o StrictHostKeyChecking=no "$ProjectRoot\web\.next\standalone\server.js" "$ProjectRoot\web\.next\standalone\package.json" "${Server}:$RemoteDir/"

Write-Host "  node_modules..."
scp -i $SshKey -o StrictHostKeyChecking=no -r "$ProjectRoot\web\.next\standalone\node_modules" "${Server}:$RemoteDir/"

Write-Host "  .next..."
ssh -i $SshKey -o StrictHostKeyChecking=no $Server "rm -rf $RemoteDir/.next"
scp -i $SshKey -o StrictHostKeyChecking=no -r "$ProjectRoot\web\.next\standalone\.next" "${Server}:$RemoteDir/"

Write-Host "  static + public..."
scp -i $SshKey -o StrictHostKeyChecking=no -r "$ProjectRoot\web\.next\static" "${Server}:$RemoteDir/.next/"
Get-ChildItem "$ProjectRoot\web\public" -File | ForEach-Object { scp -i $SshKey -o StrictHostKeyChecking=no $_.FullName "${Server}:$RemoteDir/public/" }

Write-Host "  Prisma..."
ssh -i $SshKey -o StrictHostKeyChecking=no $Server "cp $RemoteDir/prisma/prod.db $RemoteDir/prisma/prod.db.bak 2>/dev/null || cp $RemoteDir/prisma/dev.db $RemoteDir/prisma/prod.db 2>/dev/null || true"
scp -i $SshKey -o StrictHostKeyChecking=no "$ProjectRoot\web\prisma\schema.prisma" "$ProjectRoot\web\prisma\migrations\migration_lock.toml" "${Server}:$RemoteDir/prisma/"
scp -i $SshKey -o StrictHostKeyChecking=no -r "$ProjectRoot\web\prisma\migrations" "${Server}:$RemoteDir/prisma/"
ssh -i $SshKey -o StrictHostKeyChecking=no $Server "test -f $RemoteDir/prisma/prod.db.bak && mv $RemoteDir/prisma/prod.db.bak $RemoteDir/prisma/prod.db || true"
scp -i $SshKey -o StrictHostKeyChecking=no "$ProjectRoot\web\package.json" "${Server}:$RemoteDir/"

Write-Host "  vpn-tor..."
scp -i $SshKey -o StrictHostKeyChecking=no "$ProjectRoot\docker\vpn-tor\Dockerfile" "$ProjectRoot\docker\vpn-tor\entrypoint.sh" "${Server}:$RemoteDir/docker/vpn-tor/"
scp -i $SshKey -o StrictHostKeyChecking=no -r "$ProjectRoot\docker\vpn-tor\wg-manager" "${Server}:$RemoteDir/docker/vpn-tor/"

# 3. Migrations & Restart
Write-Host "`n[2/3] Migrations..." -ForegroundColor Yellow
ssh -i $SshKey -o StrictHostKeyChecking=no $Server "cd $RemoteDir && npm install prisma 2>/dev/null; export DATABASE_URL='file:$RemoteDir/prisma/prod.db'; npx prisma migrate deploy"

# 4. .env & Service
Write-Host "`n[3/3] Restarting service..." -ForegroundColor Yellow
ssh -i $SshKey -o StrictHostKeyChecking=no $Server 'JWT=$(grep JWT_SECRET /opt/vpn/.env 2>/dev/null | cut -d= -f2 | tr -d "\""); [ -z "$JWT" ] && JWT=$(openssl rand -hex 32); printf "DATABASE_URL=\"file:/opt/vpn/prisma/prod.db\"\nPORT=3000\nJWT_SECRET=\"%s\"\nWG_MANAGER_URL=\"http://127.0.0.1:9999\"\nSERVER_ENDPOINT=\"vpn.aiternitas.ru:51820\"\n" "$JWT" > /opt/vpn/.env'

$svcPath = "$env:TEMP\vpn.service"
@"
[Unit]
Description=VPN Web Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$RemoteDir
ExecStart=/usr/bin/node server.js
Restart=always
EnvironmentFile=$RemoteDir/.env

[Install]
WantedBy=multi-user.target
"@ | Set-Content -Path $svcPath -Encoding UTF8
scp -i $SshKey -o StrictHostKeyChecking=no $svcPath "${Server}:/etc/systemd/system/$ServiceName"
Remove-Item $svcPath -ErrorAction SilentlyContinue

ssh -i $SshKey -o StrictHostKeyChecking=no $Server "systemctl daemon-reload && systemctl enable $ServiceName && systemctl restart $ServiceName"

Write-Host "`nDone. Checking status..." -ForegroundColor Green
ssh -i $SshKey -o StrictHostKeyChecking=no $Server "systemctl status $ServiceName --no-pager | head -n 15"
Write-Host "`nAPK: https://vpn.aiternitas.ru/api/apk" -ForegroundColor Green
