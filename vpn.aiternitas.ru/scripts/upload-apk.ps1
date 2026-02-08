# Upload APK and nginx config to server
$ErrorActionPreference = "Stop"
$root = "$PSScriptRoot\.."
$apk = "$root\web\public\vpn-app.apk"
$nginx = "$root\nginx-vpn-full.conf"
$key = "C:\Users\evg\.ssh\id_rsa_aiternitas"
$server = "root@82.146.44.126"

if (!(Test-Path $apk)) { throw "APK not found: $apk" }

# Upload APK
scp -i $key -o StrictHostKeyChecking=no $apk "${server}:/opt/vpn/public/vpn-app.apk"

# Upload nginx config
scp -i $key -o StrictHostKeyChecking=no $nginx "${server}:/etc/nginx/sites-available/vpn.aiternitas.ru"

# Reload nginx
ssh -i $key -o StrictHostKeyChecking=no $server "nginx -t && systemctl reload nginx"
