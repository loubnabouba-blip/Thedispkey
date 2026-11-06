#!/bin/bash
# Na elke nieuwe versie: haalt de nieuwste app op en zet hem in Xcode.
# Gebruik:  bash ios-app/update.sh
set -e
cd "$(dirname "$0")"
echo ""
echo "== Discipline Key: bijwerken =="
if [ ! -d ios ]; then
  echo "Het iOS-project bestaat nog niet. Draai eerst:  bash ios-app/setup.sh"
  exit 1
fi
echo "[1/4] Nieuwste versie ophalen..."
git -C .. pull --ff-only || { git -C .. stash; git -C .. pull --ff-only; }
echo "[2/4] App klaarzetten..."
npm install --no-fund --no-audit
npm run prepare-web
npx cap sync ios
echo "[3/4] Apple Gezondheid controleren..."
bash scripts/healthkit.sh
echo "[4/4] Xcode openen..."
npx cap open ios
echo ""
echo "Klaar. Druk in Xcode op de afspeelknop."
