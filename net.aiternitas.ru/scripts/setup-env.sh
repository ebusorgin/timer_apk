#!/bin/bash
# Запускать на сервере в /opt/net
set -e
cd /opt/net
if [ -f .env ]; then
  grep -q '^JWT_SECRET=' .env || echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env
  grep -q '^PORT=' .env && sed -i 's/^PORT=.*/PORT=3004/' .env || echo 'PORT=3004' >> .env
  grep -q '^NODE_ENV=' .env && sed -i 's/^NODE_ENV=.*/NODE_ENV=production/' .env || echo 'NODE_ENV=production' >> .env
else
  printf 'PORT=3004\nNODE_ENV=production\nJWT_SECRET=%s\n' "$(openssl rand -hex 32)" > .env
fi
npm install --omit=dev
