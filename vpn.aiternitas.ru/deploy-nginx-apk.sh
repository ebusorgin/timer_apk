#!/bin/bash
# Add APK location to nginx, then reload
# Run on server: bash deploy-nginx-apk.sh

CONF="/etc/nginx/sites-available/vpn.aiternitas.ru"
LOCATION_BLOCK='    location = /vpn-app.apk {
        alias /opt/vpn/public/vpn-app.apk;
        add_header Content-Type application/vnd.android.package-archive;
        add_header Content-Disposition "attachment; filename=vpn-app.apk";
    }
'

# Check if already added
if grep -q "location = /vpn-app.apk" "$CONF"; then
    echo "APK location already configured"
else
    # Insert before "location /"
    sed -i "/location \/ {/i\\
$LOCATION_BLOCK
" "$CONF"
    echo "Added APK location block"
fi

nginx -t && systemctl reload nginx && echo "Nginx reloaded OK"
