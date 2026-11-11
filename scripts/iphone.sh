#!/bin/sh
# Zet de huidige site klaar, bouwt de iOS-app en installeert hem op de aangesloten iPhone.
# Gebruik: npm run iphone
set -e
cd "$(dirname "$0")/.."

DEVICE_ID="00008110-001279A03A8BA01E"   # iPhone LB
APP="ios/DerivedData/Build/Products/Debug-iphoneos/App.app"
IOS_DEPLOY="$(command -v ios-deploy || echo "$HOME/.npm-global/bin/ios-deploy")"

echo "1/3 Site klaarzetten…"
node scripts/prepare-web.mjs
npx cap sync ios > /dev/null

echo "2/3 Bouwen…"
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -destination "id=$DEVICE_ID" -derivedDataPath ios/DerivedData \
  -allowProvisioningUpdates -quiet build

echo "3/3 Installeren op iPhone (ontgrendeld houden)…"
LOG="$(mktemp)"
if "$IOS_DEPLOY" --id "$DEVICE_ID" --bundle "$APP" > "$LOG" 2>&1; then
  echo "Klaar: Thedispkey staat op je iPhone."
else
  tail -3 "$LOG"
  echo "Installeren mislukt. Ontgrendel je iPhone, controleer de kabel en probeer opnieuw."
  rm -f "$LOG"; exit 1
fi
rm -f "$LOG"
