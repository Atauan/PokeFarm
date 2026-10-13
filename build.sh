#!/bin/bash
# Compila o PokeFarm e gera o PokeFarm.app. CI: --universal --no-open.
set -euo pipefail
cd "$(dirname "$0")"
OPEN_APP=true
UNIVERSAL=false
for option in "$@"; do
    case "$option" in
        --no-open) OPEN_APP=false ;;
        --universal) UNIVERSAL=true ;;
        *) echo "Opção desconhecida: $option" >&2; exit 1 ;;
    esac
done
APP="PokeFarm.app"
rm -rf "$APP" KickMulti.app
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
BUILD_TEMP="$(mktemp -d)"
trap 'rm -rf "$BUILD_TEMP"' EXIT
if $UNIVERSAL; then
    for arch in arm64 x86_64; do
        swiftc -parse-as-library -O -target "${arch}-apple-macos13.0" LiveAutomation.swift ReleaseUpdates.swift KickMulti.swift -o "$BUILD_TEMP/PokeFarm-$arch"
    done
    lipo -create "$BUILD_TEMP/PokeFarm-arm64" "$BUILD_TEMP/PokeFarm-x86_64" -output "$APP/Contents/MacOS/PokeFarm"
else
    swiftc -parse-as-library -O -target "$(uname -m)-apple-macos13.0" LiveAutomation.swift ReleaseUpdates.swift KickMulti.swift -o "$APP/Contents/MacOS/PokeFarm"
fi
cp Info.plist "$APP/Contents/Info.plist"
cp PokeFarm/game-channels.js "$APP/Contents/Resources/game-channels.js"
cp PokeFarm/twitch-economy.js "$APP/Contents/Resources/twitch-economy.js"
cp PokeFarm/kick-economy.js "$APP/Contents/Resources/kick-economy.js"

# Ícone
ICONSET="$BUILD_TEMP/AppIcon.iconset"
swift make_icon.swift "$ICONSET"
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"

codesign --force --deep -s - "$APP"
touch "$APP"
echo "Pronto! $APP gerado."
if $OPEN_APP; then open "$APP"; fi
