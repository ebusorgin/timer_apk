FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    wireguard wireguard-tools \
    iptables \
    iproute2 \
    nodejs \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Tor for traffic routing (stage 3)
RUN apt-get update && apt-get install -y --no-install-recommends tor \
    && rm -rf /var/lib/apt/lists/*

COPY wg-manager /app/wg-manager/
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 51820/udp 9999

ENTRYPOINT ["/entrypoint.sh"]
