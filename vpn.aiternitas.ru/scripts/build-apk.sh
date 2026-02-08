#!/bin/bash
# Build VPN APK and copy to web/public for download
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
APP_DIR="$PROJECT_DIR/app"
WEB_PUBLIC="$PROJECT_DIR/web/public"

cd "$APP_DIR"
echo "Installing dependencies..."
npm install

echo "Building APK..."
if command -v eas &>/dev/null; then
    eas build --platform android --profile production --local --non-interactive
    APK_PATH=$(find . -name "*.apk" -path "*build*" | head -1)
else
    echo "EAS CLI not found. Using Docker (eas-like-local-builder)..."
    docker run --rm \
        -v "$(pwd):/app" \
        -w /app \
        -e PROFILE=production \
        -e EAS_NO_VCS=1 \
        erayalakese/eas-like-local-builder
    APK_PATH=$(find . -name "*.apk" 2>/dev/null | head -1)
fi

if [ -z "$APK_PATH" ] || [ ! -f "$APK_PATH" ]; then
    echo "APK not found. Build may have failed."
    exit 1
fi

mkdir -p "$WEB_PUBLIC"
cp "$APK_PATH" "$WEB_PUBLIC/vpn-app.apk"
echo "APK copied to $WEB_PUBLIC/vpn-app.apk"
echo "Done. Users can download from /vpn-app.apk"
