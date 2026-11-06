#!/bin/bash
# Zet HealthKit aan in het iOS-project (toestemmingsteksten + entitlement). Veilig om vaker te draaien.
set -e
cd "$(dirname "$0")/../ios/App"
PL="App/Info.plist"
PB="/usr/libexec/PlistBuddy"
$PB -c "Delete :NSHealthShareUsageDescription" "$PL" >/dev/null 2>&1 || true
$PB -c "Add :NSHealthShareUsageDescription string 'Discipline Key leest je stappen, gewicht en slaap om je dagdoelen bij te houden.'" "$PL"
$PB -c "Delete :NSHealthUpdateUsageDescription" "$PL" >/dev/null 2>&1 || true
$PB -c "Add :NSHealthUpdateUsageDescription string 'Discipline Key schrijft niets naar Gezondheid.'" "$PL"
cat > App/App.entitlements <<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>com.apple.developer.healthkit</key>
	<true/>
	<key>com.apple.developer.healthkit.access</key>
	<array/>
</dict>
</plist>
XML
PBX="App.xcodeproj/project.pbxproj"
if ! grep -q "CODE_SIGN_ENTITLEMENTS" "$PBX"; then
  perl -0pi -e 's#(INFOPLIST_FILE = App/Info\.plist;)#$1\n\t\t\t\tCODE_SIGN_ENTITLEMENTS = App/App.entitlements;#g' "$PBX"
fi
if grep -q "CODE_SIGN_ENTITLEMENTS = App/App.entitlements" "$PBX"; then
  echo "Apple Gezondheid staat aan."
else
  echo "Let op: HealthKit kon niet automatisch worden aangezet. Voeg het in Xcode toe via Signing & Capabilities > + Capability > HealthKit."
fi
