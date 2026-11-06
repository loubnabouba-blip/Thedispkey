#!/bin/bash
# Eenmalig: bouwt de iPhone-app helemaal opnieuw op, inclusief Apple Gezondheid.
# Gebruik:  bash ios-app/setup.sh
set -e
cd "$(dirname "$0")"
echo ""
echo "== Discipline Key: iPhone-app opbouwen =="
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js ontbreekt. Installeer de LTS-versie via https://nodejs.org en start dit script opnieuw."
  exit 1
fi
echo "[1/5] Oude bestanden opruimen..."
rm -rf node_modules ios package-lock.json www
echo "[2/5] Onderdelen installeren (dit kan een paar minuten duren)..."
npm install --no-fund --no-audit
echo "[3/5] App klaarzetten..."
npm run prepare-web
npx cap add ios
npx cap sync ios
echo "[4/5] Apple Gezondheid aanzetten..."
bash scripts/healthkit.sh
echo "[5/5] Xcode openen..."
npx cap open ios
echo ""
echo "Klaar. In Xcode: kies je Team bij Signing & Capabilities, kies je iPhone bovenin en druk op de afspeelknop."
