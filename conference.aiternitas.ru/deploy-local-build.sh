#!/bin/bash
# Script for deploying conference.aiternitas.ru

SERVER="root@82.146.44.126"
SSH_KEY="$HOME/.ssh/id_rsa_aiternitas"
REMOTE_DIR="/opt/conference"
SERVICE_NAME="conference.service"

# Ensure script stops on error
set -e

echo "=== Deploying Conference Service ==="

# 1. Upload Files
echo "[1/3] Uploading files to server..."
# Create directories
ssh -i "$SSH_KEY" $SERVER "mkdir -p $REMOTE_DIR/server $REMOTE_DIR/www $REMOTE_DIR/scripts"

# Upload Package Files
scp -i "$SSH_KEY" package.json package-lock.json $SERVER:$REMOTE_DIR/

# Upload Server Code
echo "  Uploading Server..."
scp -i "$SSH_KEY" -r server/* $SERVER:$REMOTE_DIR/server/

# Upload WWW (Frontend)
echo "  Uploading Frontend..."
scp -i "$SSH_KEY" -r www/* $SERVER:$REMOTE_DIR/www/

# Upload Scripts (seed-admin)
echo "  Uploading Scripts..."
scp -i "$SSH_KEY" -r scripts/* $SERVER:$REMOTE_DIR/scripts/

# 2. Install Dependencies & Seed Admin
echo "[2/3] Installing Dependencies and seeding admin..."
ssh -i "$SSH_KEY" $SERVER "cd $REMOTE_DIR && npm install --production && (node scripts/seed-admin.mjs 2>/dev/null || true)"

# 3. Configure & Restart Service
echo "[3/3] Configuring and Restarting Service..."

# Create .env file (ADMIN_SECRET, VAPID for push)
ADMIN_SECRET=$(openssl rand -hex 24 2>/dev/null || echo "SevAdminSecret2026")
VAPID_PUBLIC="${VAPID_PUBLIC_KEY:-BBBkgqKqGV3RSTUacZd5T0TS1Y-7CDIAo2zzNfUMrs4gj83b4n7Q2I2lF6cFOOMbKiEjU3N4Rt8mi74-t0LDa7Y}"
VAPID_PRIVATE="${VAPID_PRIVATE_KEY:-yidI8R79AEgpSyRplEo1O10dIxSX98nQRUYgNCyX6qw}"
ssh -i "$SSH_KEY" $SERVER "printf 'PORT=3002\nHOST=0.0.0.0\nNODE_ENV=production\nCORS_ORIGIN=https://conference.aiternitas.ru\nPERSISTENCE_DRIVER=file\nADMIN_SECRET=$ADMIN_SECRET\nVAPID_PUBLIC_KEY=$VAPID_PUBLIC\nVAPID_PRIVATE_KEY=$VAPID_PRIVATE\nVAPID_MAILTO=mailto:conference@aiternitas.ru\n' > $REMOTE_DIR/.env"

# Create Systemd Service
ssh -i "$SSH_KEY" $SERVER "cat > /etc/systemd/system/$SERVICE_NAME <<EOF
[Unit]
Description=Conference Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$REMOTE_DIR
ExecStart=/usr/bin/node server/server.mjs
Restart=always
EnvironmentFile=$REMOTE_DIR/.env

[Install]
WantedBy=multi-user.target
EOF"

# Restart Service
ssh -i "$SSH_KEY" $SERVER "systemctl daemon-reload && systemctl enable $SERVICE_NAME && systemctl restart $SERVICE_NAME"
ssh -i "$SSH_KEY" $SERVER "systemctl status $SERVICE_NAME --no-pager | head -n 20"

echo "✅ Service Deployed!"
