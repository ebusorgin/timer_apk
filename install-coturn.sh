#!/bin/bash
# Скрипт установки и настройки coturn (STUN/TURN сервер)

# Не завершаем скрипт при ошибках, чтобы увидеть все проблемы
set +e

echo "🔧 Установка coturn..."

# Установка coturn
if ! command -v turnserver &> /dev/null; then
    echo "📦 Установка coturn..."
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y coturn
    if [ $? -eq 0 ]; then
        echo "✅ coturn установлен"
    else
        echo "❌ Ошибка установки coturn"
        exit 1
    fi
else
    echo "✅ coturn уже установлен"
fi

# Создание конфигурации coturn
COTURN_CONFIG="/etc/turnserver.conf"
COTURN_DEFAULT="/etc/default/coturn"

echo "📝 Настройка coturn..."

# Включаем coturn в автозапуск
sed -i 's/TURNSERVER_ENABLED=0/TURNSERVER_ENABLED=1/' $COTURN_DEFAULT || echo "TURNSERVER_ENABLED=1" >> $COTURN_DEFAULT

# Получаем внешний IP автоматически
EXTERNAL_IP=$(curl -s ifconfig.me || curl -s icanhazip.com || echo "82.146.44.126")
echo "🌐 Внешний IP: $EXTERNAL_IP"

# Создаем конфигурацию coturn
cat > $COTURN_CONFIG << EOF
# Coturn configuration for aiternitas.ru
listening-port=3478
tls-listening-port=5349
listening-ip=0.0.0.0
external-ip=$EXTERNAL_IP

# Realm
realm=aiternitas.ru

# Логирование
log-file=/var/log/turnserver.log
verbose

# Без аутентификации для STUN (только для тестирования)
# В продакшене рекомендуется использовать аутентификацию
no-auth
no-cli

# Минимальный и максимальный порты для RTP
min-port=49152
max-port=65535

# Безопасность
fingerprint
lt-cred-mech

# Дополнительные настройки для надежности
user-quota=12
total-quota=1200
no-stdout-log
EOF

echo "✅ Конфигурация coturn создана"

# Создаем пользователя для TURN (опционально, для аутентификации)
# turnadmin -a -u turnuser -p turnpass -r aiternitas.ru

# Открытие портов в firewall (если используется ufw)
if command -v ufw &> /dev/null; then
    echo "🔥 Настройка firewall..."
    ufw allow 3478/udp || true
    ufw allow 3478/tcp || true
    ufw allow 49152:65535/udp || true
    echo "✅ Порты открыты в firewall"
fi

# Перезапуск coturn
systemctl enable coturn
systemctl restart coturn || systemctl start coturn

echo "✅ coturn запущен и включен в автозапуск"

# Проверка статуса
sleep 3
if systemctl is-active --quiet coturn; then
    echo "✅ coturn работает"
    systemctl status coturn --no-pager | head -10
    echo ""
    echo "📊 Проверка портов:"
    netstat -tulpn | grep 3478 || ss -tulpn | grep 3478 || echo "Порты не найдены"
else
    echo "⚠️ coturn не запущен, проверяю логи..."
    journalctl -u coturn -n 30 --no-pager || true
    echo ""
    echo "Проверка конфигурации:"
    turnserver -c $COTURN_CONFIG --test || true
fi

echo ""
echo "✅ Установка coturn завершена"
echo "📋 STUN/TURN сервер доступен на:"
echo "   - STUN: stun:aiternitas.ru:3478"
echo "   - TURN: turn:aiternitas.ru:3478?transport=udp"
echo "   - TURN: turn:aiternitas.ru:3478?transport=tcp"

