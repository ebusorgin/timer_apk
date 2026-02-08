#!/bin/bash
# Deploy VPN to server via Docker
set -e

SERVER="root@82.146.44.126"
SSH_KEY="C:/Users/evg/.ssh/id_rsa_aiternitas"
REMOTE_DIR="/opt/vpn"

echo "=== Deploying VPN (Docker) ==="

# 1. Build web locally
echo "[1/6] Building web..."
cd "$(dirname "$0")/web"
npm install --silent 2>/dev/null
npx prisma generate
npm run build
cd ..

# 2. Stop existing vpn service
echo "[2/6] Stopping vpn.service..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no $SERVER "systemctl stop vpn.service 2>/dev/null || true"

# 3. Prepare prisma-data with existing DB
echo "[3/6] Preparing server..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no $SERVER << 'REMOTE'
mkdir -p /opt/vpn/prisma-data /opt/vpn/docker/vpn-tor
# Preserve existing DB
if [ -f /opt/vpn/prisma/prod.db ]; then
  cp /opt/vpn/prisma/prod.db /opt/vpn/prisma-data/
fi
# Copy schema and migrations
cp -r /opt/vpn/prisma/*.prisma /opt/vpn/prisma-data/ 2>/dev/null || true
REMOTE

# 4. Upload files
echo "[4/6] Uploading files..."

# docker/vpn-tor
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no docker/vpn-tor/Dockerfile docker/vpn-tor/entrypoint.sh $SERVER:$REMOTE_DIR/docker/vpn-tor/
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no -r docker/vpn-tor/wg-manager $SERVER:$REMOTE_DIR/docker/vpn-tor/

# prisma (schema + migrations)
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no web/prisma/schema.prisma $SERVER:$REMOTE_DIR/prisma-data/
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no $SERVER "mkdir -p $REMOTE_DIR/prisma-data/migrations"
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no web/prisma/migrations/migration_lock.toml $SERVER:$REMOTE_DIR/prisma-data/migrations/
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no -r web/prisma/migrations/* $SERVER:$REMOTE_DIR/prisma-data/migrations/

# Restore prod.db if we overwrote
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no $SERVER "if [ -f /opt/vpn/prisma/prod.db ]; then cp /opt/vpn/prisma/prod.db /opt/vpn/prisma-data/; fi"

# Web built output
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no web/.next/standalone/server.js web/.next/standalone/package.json $SERVER:$REMOTE_DIR/
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no -r web/.next/standalone/node_modules $SERVER:$REMOTE_DIR/
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no $SERVER "rm -rf $REMOTE_DIR/.next"
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no -r web/.next/standalone/.next $SERVER:$REMOTE_DIR/
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no -r web/.next/static $SERVER:$REMOTE_DIR/.next/
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no -r web/public $SERVER:$REMOTE_DIR/

# 5. Create Dockerfile.web and docker-compose on server
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no $SERVER "cat > $REMOTE_DIR/Dockerfile.web << 'DF'
FROM node:20-alpine
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY server.js package.json ./
COPY node_modules ./node_modules/
COPY .next ./.next/
COPY public ./public/
COPY prisma-data ./prisma
RUN npm install prisma --no-save 2>/dev/null || true
RUN chown -R nextjs:nodejs /app
USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD sh -c 'npx prisma migrate deploy 2>/dev/null || true && node server.js'
DF"

# Get existing JWT_SECRET
JWT_SECRET=$(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no $SERVER "grep JWT_SECRET $REMOTE_DIR/.env 2>/dev/null | cut -d= -f2- | tr -d '\"'"'"' 2>/dev/null" || echo "")
if [ -z "$JWT_SECRET" ]; then
  JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || echo "change-me-$(date +%s)")
fi

ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no $SERVER "cat > $REMOTE_DIR/docker-compose.yml << COMPOSE
services:
  web:
    build:
      context: .
      dockerfile: Dockerfile.web
    ports:
      - \"3000:3000\"
    volumes:
      - ./prisma-data:/app/prisma
    environment:
      - DATABASE_URL=file:/app/prisma/prod.db
      - JWT_SECRET=$JWT_SECRET
      - WG_MANAGER_URL=http://vpn-tor:9999
      - SERVER_ENDPOINT=vpn.aiternitas.ru:51820
      - TOR_ENABLED=0
    depends_on:
      - vpn-tor
    restart: unless-stopped

  vpn-tor:
    build: ./docker/vpn-tor
    cap_add:
      - NET_ADMIN
    sysctls:
      - net.ipv4.conf.all.src_valid_mark=1
    ports:
      - \"51820:51820/udp\"
    volumes:
      - vpn-config:/config
    environment:
      - INTERNAL_SUBNET=10.0.0
      - LISTEN_PORT=51820
      - EXIT_COUNTRY=de
      - TOR_ENABLED=0
    restart: unless-stopped

volumes:
  vpn-config:
COMPOSE"

# 6. Build and start
echo "[5/6] Building Docker images..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no $SERVER "cd $REMOTE_DIR && docker compose build web 2>&1 | tail -15"

echo "[6/6] Building vpn-tor..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no $SERVER "cd $REMOTE_DIR && docker compose build vpn-tor 2>&1 | tail -10"

echo "Starting containers..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no $SERVER "cd $REMOTE_DIR && docker compose up -d"

echo ""
echo "Waiting for services..."
sleep 8
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no $SERVER "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
echo ""
HTTP=$(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no $SERVER "curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/ 2>/dev/null" || echo "000")
echo "Web HTTP status: $HTTP"
echo ""
echo "Done. https://vpn.aiternitas.ru"
