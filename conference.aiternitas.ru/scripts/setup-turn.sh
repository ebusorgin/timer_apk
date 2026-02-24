#!/bin/bash
set -e

# Install coturn
apt-get update
apt-get install -y coturn

# Stop service to configure
systemctl stop coturn

# Backup original config
if [ -f /etc/turnserver.conf ]; then
    mv /etc/turnserver.conf /etc/turnserver.conf.bak
fi

# Create new config
cat > /etc/turnserver.conf <<EOF
# Basic configuration
listening-port=3478
fingerprint
lt-cred-mech

# Network
listening-ip=0.0.0.0
external-ip=82.146.44.126

# Relay
relay-ip=82.146.44.126
min-port=49152
max-port=65535

# Authentication
user=turnuser:turnpass
realm=aiternitas.ru
server-name=aiternitas.ru

# Logs
log-file=/var/log/turnserver.log
simple-log

# Performance
cli-password=turnadmin
EOF

# Enable and start service
systemctl enable coturn
systemctl start coturn

# Check status
systemctl status coturn
