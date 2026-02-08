#!/bin/bash
set -e

CONFIG_DIR="/config"
KEYS_DIR="$CONFIG_DIR/keys"
SERVER_KEY="$KEYS_DIR/server"
INTERNAL_SUBNET="${INTERNAL_SUBNET:-10.0.0}"
SERVER_IP="$INTERNAL_SUBNET.1"
LISTEN_PORT="${LISTEN_PORT:-51820}"
EXIT_COUNTRY="${EXIT_COUNTRY:-de}"

mkdir -p "$KEYS_DIR" "$CONFIG_DIR" /etc/wireguard

# Generate server keys if not exist
if [ ! -f "$SERVER_KEY" ]; then
    wg genkey | tee "$SERVER_KEY" | wg pubkey > "$SERVER_KEY.pub"
    chmod 600 "$SERVER_KEY" "$SERVER_KEY.pub"
    echo "Generated new server keys"
fi

SERVER_PRIVATE=$(cat "$SERVER_KEY")
SERVER_PUBLIC=$(cat "$SERVER_KEY.pub")
echo "Server public key: $SERVER_PUBLIC"

# Create WireGuard config in standard location
cat > /etc/wireguard/wg0.conf << EOF
[Interface]
Address = $SERVER_IP/24
ListenPort = $LISTEN_PORT
PrivateKey = $SERVER_PRIVATE
EOF

# Start WireGuard
wg-quick up wg0

# Enable IP forwarding (set via sysctls in docker-compose, or try write)
echo 1 > /proc/sys/net/ipv4/ip_forward 2>/dev/null || sysctl -w net.ipv4.ip_forward=1 2>/dev/null || true
iptables -t nat -A POSTROUTING -s ${INTERNAL_SUBNET}.0/24 ! -d ${INTERNAL_SUBNET}.0/24 -j MASQUERADE 2>/dev/null || true

# Restore peers from persisted file
if [ -f "$CONFIG_DIR/peers.json" ]; then
    PEERS_FILE="$CONFIG_DIR/peers.json" node -e '
    const fs=require("fs"),{execSync}=require("child_process");
    const f=process.env.PEERS_FILE;
    try{JSON.parse(fs.readFileSync(f,"utf8")).forEach(p=>{try{execSync("wg set wg0 peer "+p.publicKey+" allowed-ips "+p.address+"/32")}catch(e){}})}catch(e){}
    '
fi

# Start Tor if enabled (for stage 3)
if [ "${TOR_ENABLED:-0}" = "1" ] && command -v tor &>/dev/null; then
    mkdir -p /etc/tor
    cat > /etc/tor/torrc << TORRC
VirtualAddrNetworkIPv4 172.16.0.0/12
AutomapHostsOnResolve 1
AutomapHostsSuffixes .onion,.exit
DNSPort $SERVER_IP:53530
TransPort $SERVER_IP:9040
ExitNodes {$EXIT_COUNTRY}
StrictNodes 1
TORRC
    tor -f /etc/tor/torrc &
    echo "Tor started with ExitNodes {$EXIT_COUNTRY}"
    # Route WG client traffic through Tor
    iptables -t nat -A PREROUTING -s ${INTERNAL_SUBNET}.0/24 -d $SERVER_IP -p udp --dport 53 -j REDIRECT --to-ports 53530 2>/dev/null || true
    iptables -t nat -A PREROUTING -s ${INTERNAL_SUBNET}.0/24 -d $SERVER_IP -p tcp --dport 53 -j REDIRECT --to-ports 53530 2>/dev/null || true
    iptables -t nat -A PREROUTING -s ${INTERNAL_SUBNET}.0/24 -p tcp ! -d ${INTERNAL_SUBNET}.0/24 ! --dport 51820 -j REDIRECT --to-ports 9040 2>/dev/null || true
fi

# Start wg-manager (keeps container running)
export SERVER_PUBLIC_KEY="$SERVER_PUBLIC"
exec node /app/wg-manager/index.mjs
