#!/bin/bash
# Script for deploying vpn.aiternitas.ru (Local Build -> Remote)

SERVER="root@82.146.44.126"
SSH_KEY="$HOME/.ssh/id_rsa_aiternitas"
REMOTE_DIR="/opt/vpn"
SERVICE_NAME="vpn.service"

# Ensure script stops on error
set -e

echo "=== Deploying VPN Service ==="

# 1. Build
echo "[1/4] Building locally..."
cd web
npm install
# Ensure we have the correct Prisma engine for Linux
npx prisma generate
npm run build
cd ..

# 2. Upload
echo "[2/4] Uploading files to server..."
# Create directories
ssh -i "$SSH_KEY" $SERVER "mkdir -p $REMOTE_DIR/.next/static $REMOTE_DIR/public $REMOTE_DIR/prisma $REMOTE_DIR/docker/vpn-tor"

# Upload Standalone Build
echo "  Uploading Standalone Build..."
scp -i "$SSH_KEY" web/.next/standalone/server.js web/.next/standalone/package.json $SERVER:$REMOTE_DIR/
scp -i "$SSH_KEY" -r web/.next/standalone/node_modules $SERVER:$REMOTE_DIR/

# Upload Standalone .next (Critical: Remove existing .next first to ensure clean state and correct path)
echo "  Uploading Standalone .next..."
ssh -i "$SSH_KEY" $SERVER "rm -rf $REMOTE_DIR/.next"
scp -i "$SSH_KEY" -r web/.next/standalone/.next $SERVER:$REMOTE_DIR/

# Upload Static Assets (Required for standalone)
echo "  Uploading Static Assets..."
# We need to put static/ into .next/
scp -i "$SSH_KEY" -r web/.next/static $SERVER:$REMOTE_DIR/.next/
scp -i "$SSH_KEY" -r web/public/* $SERVER:$REMOTE_DIR/public/

# Upload Prisma (Schema & Migrations, preserve existing DB)
echo "  Uploading Prisma..."
ssh -i "$SSH_KEY" $SERVER "cp $REMOTE_DIR/prisma/prod.db $REMOTE_DIR/prisma/prod.db.bak 2>/dev/null || cp $REMOTE_DIR/prisma/dev.db $REMOTE_DIR/prisma/prod.db 2>/dev/null || true"
scp -i "$SSH_KEY" web/prisma/schema.prisma web/prisma/migrations/migration_lock.toml $SERVER:$REMOTE_DIR/prisma/
scp -i "$SSH_KEY" -r web/prisma/migrations $SERVER:$REMOTE_DIR/prisma/
ssh -i "$SSH_KEY" $SERVER "test -f $REMOTE_DIR/prisma/prod.db.bak && mv $REMOTE_DIR/prisma/prod.db.bak $REMOTE_DIR/prisma/prod.db || true"
scp -i "$SSH_KEY" web/package.json $SERVER:$REMOTE_DIR/

# Upload docker/vpn-tor (WireGuard + wg-manager)
echo "  Uploading vpn-tor..."
scp -i "$SSH_KEY" docker/vpn-tor/Dockerfile docker/vpn-tor/entrypoint.sh $SERVER:$REMOTE_DIR/docker/vpn-tor/
scp -i "$SSH_KEY" -r docker/vpn-tor/wg-manager $SERVER:$REMOTE_DIR/docker/vpn-tor/

# 3. Server Setup (Dependencies & Migrations)
echo "[3/4] Configuring Server..."

# Install WireGuard and Prisma
ssh -i "$SSH_KEY" $SERVER "apt-get update && apt-get install -y wireguard wireguard-tools"
ssh -i "$SSH_KEY" $SERVER "cd $REMOTE_DIR && npm install prisma"

# Run Migrations
echo "  Running Migrations..."
ssh -i "$SSH_KEY" $SERVER "cd $REMOTE_DIR && export DATABASE_URL='file:$REMOTE_DIR/prisma/prod.db' && npx prisma migrate deploy"

# 4. Configure & Restart Service
echo "[4/4] Configuring Service..."

# Create .env file (preserve existing JWT_SECRET if present)
ssh -i "$SSH_KEY" $SERVER "JWT=\$(grep JWT_SECRET $REMOTE_DIR/.env 2>/dev/null | cut -d= -f2 | tr -d '\"') || JWT=\$(openssl rand -hex 32); printf 'DATABASE_URL=\"file:$REMOTE_DIR/prisma/prod.db\"\nPORT=3000\nJWT_SECRET=\"'\$JWT'\"\nWG_MANAGER_URL=\"http://127.0.0.1:9999\"\nSERVER_ENDPOINT=\"vpn.aiternitas.ru:51820\"\n' > $REMOTE_DIR/.env"

# Create Systemd Service
ssh -i "$SSH_KEY" $SERVER "cat > /etc/systemd/system/$SERVICE_NAME <<EOF
[Unit]
Description=VPN Web Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$REMOTE_DIR
ExecStart=/usr/bin/node server.js
Restart=always
EnvironmentFile=$REMOTE_DIR/.env

[Install]
WantedBy=multi-user.target
EOF"

# Restart Service
ssh -i "$SSH_KEY" $SERVER "systemctl daemon-reload && systemctl enable $SERVICE_NAME && systemctl restart $SERVICE_NAME"

# Start vpn-tor container (WireGuard + wg-manager)
echo "  Starting vpn-tor container..."
scp -i "$SSH_KEY" docker-compose.standalone.yml $SERVER:$REMOTE_DIR/
ssh -i "$SSH_KEY" $SERVER "cd $REMOTE_DIR && docker compose -f docker-compose.standalone.yml up -d --build 2>/dev/null" || echo "  (vpn-tor: run 'docker compose -f docker-compose.standalone.yml up -d' in $REMOTE_DIR)"

ssh -i "$SSH_KEY" $SERVER "systemctl status $SERVICE_NAME --no-pager | head -n 20"

echo "✅ VPN Service Deployed!"
