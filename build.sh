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
# Resolve antes de gerar arquivos e grava apenas no bundle resultante.
BASE_VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' Info.plist)"
DISPLAY_VERSION="$(bash scripts/local-version.sh "$PWD" "$BASE_VERSION" "${RELEASE_VERSION:-}")"
NUMERIC_VERSION="${DISPLAY_VERSION%%+*}"
APP="PokeFarm.app"
rm -rf "$APP" KickMulti.app
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
BUILD_TEMP="$(mktemp -d)"
trap 'rm -rf "$BUILD_TEMP"' EXIT
if $UNIVERSAL; then
    for arch in arm64 x86_64; do
        swiftc -parse-as-library -O -target "${arch}-apple-macos13.0" LiveAutomation.swift ReleaseUpdates.swift SessionSummary.swift AboutView.swift TraySupport.swift KickMulti.swift -o "$BUILD_TEMP/PokeFarm-$arch"
    done
    lipo -create "$BUILD_TEMP/PokeFarm-arm64" "$BUILD_TEMP/PokeFarm-x86_64" -output "$APP/Contents/MacOS/PokeFarm"
else
    swiftc -parse-as-library -O -target "$(uname -m)-apple-macos13.0" LiveAutomation.swift ReleaseUpdates.swift SessionSummary.swift AboutView.swift TraySupport.swift KickMulti.swift -o "$APP/Contents/MacOS/PokeFarm"
fi
cp Info.plist "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $NUMERIC_VERSION" "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $NUMERIC_VERSION" "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Add :PokeFarmDisplayVersion string $DISPLAY_VERSION" "$APP/Contents/Info.plist"
cp PokeFarm/game-channels.js "$APP/Contents/Resources/game-channels.js"
cp PokeFarm/game-session.js "$APP/Contents/Resources/game-session.js"
cp -R PokeFarm/assets/donations "$APP/Contents/Resources/Donations"
mkdir -p "$APP/Contents/Resources/SessionSummary"
cp PokeFarm/renderer/session.html PokeFarm/renderer/session.css PokeFarm/renderer/session.js "$APP/Contents/Resources/SessionSummary/"
cp PokeFarm/twitch-economy.js "$APP/Contents/Resources/twitch-economy.js"
cp PokeFarm/kick-economy.js "$APP/Contents/Resources/kick-economy.js"

# Ícone
ICONSET="$BUILD_TEMP/AppIcon.iconset"
swift make_icon.swift "$ICONSET"
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"

codesign --force --deep -s - "$APP"
touch "$APP"
echo "Pronto! $APP $DISPLAY_VERSION gerado."
if $OPEN_APP; then open "$APP"; fi
