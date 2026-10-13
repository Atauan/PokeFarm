#!/bin/bash
# Compila o PokeFarm e gera o PokeFarm.app
set -e
cd "$(dirname "$0")"
APP="PokeFarm.app"
rm -rf "$APP" KickMulti.app
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
swiftc -parse-as-library -O -target "$(uname -m)-apple-macos13.0" LiveAutomation.swift KickMulti.swift -o "$APP/Contents/MacOS/PokeFarm"
cp Info.plist "$APP/Contents/Info.plist"
cp PokeFarm/game-channels.js "$APP/Contents/Resources/game-channels.js"
cp PokeFarm/twitch-economy.js "$APP/Contents/Resources/twitch-economy.js"
cp PokeFarm/kick-economy.js "$APP/Contents/Resources/kick-economy.js"

# Ícone
ICONSET="$(mktemp -d)/AppIcon.iconset"
swift make_icon.swift "$ICONSET"
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"
rm -rf "$(dirname "$ICONSET")"

codesign --force --deep -s - "$APP"
touch "$APP"
echo "Pronto! Abrindo $APP ..."
open "$APP"
