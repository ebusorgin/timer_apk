# Ручное восстановление

Сервер vpn.aiternitas.ru нестабилен (SSH отваливается). Автоматика не может завершить установку.

## Инструкция
1. Подключись к серверу, когда он будет стабилен:
   `ssh -i C:\Users\evg\.ssh\id_rsa_aiternitas root@vpn.aiternitas.ru`

2. Скопируй и вставь эту команду целиком, чтобы создать и запустить скрипт восстановления:

```bash
cat > /root/restore.sh << 'EOF'
#!/bin/bash
set -e
echo ">>> Recovery Start"

# 1. Зависимости и БД
cd /var/www/vpn
export DATABASE_URL="file:./prod.db"
npm install --omit=dev --no-audit --no-fund
npx prisma generate
npx prisma migrate deploy
npm run build

# 2. Перезапуск приложения
npm install -g pm2
pm2 delete vpn || true
pm2 start npm --name vpn -- start --port 3000
pm2 save

# 3. SSL и Nginx
systemctl stop nginx || true
if ! command -v certbot &> /dev/null; then
  snap install --classic certbot
fi

certbot certonly --standalone -d vpn.aiternitas.ru --non-interactive --agree-tos -m admin@aiternitas.ru

cat > /etc/nginx/sites-available/default <<nginxconf
server {
    listen 80;
    server_name vpn.aiternitas.ru;
    return 301 https://\$host\$request_uri;
}
server {
    listen 443 ssl;
    server_name vpn.aiternitas.ru;
    ssl_certificate /etc/letsencrypt/live/vpn.aiternitas.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/vpn.aiternitas.ru/privkey.pem;
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
nginxconf

systemctl start nginx
echo ">>> DONE! https://vpn.aiternitas.ru"
EOF

chmod +x /root/restore.sh
bash /root/restore.sh
```

3. После появления сообщения "DONE", сайт заработает.
