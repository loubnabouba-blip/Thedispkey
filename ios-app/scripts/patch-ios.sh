#!/usr/bin/env bash
# Zet HealthKit aan in het gegenereerde iOS-project (draait in de cloud-build).
set -euo pipefail
cd "$(dirname "$0")/../ios/App/App"
/usr/libexec/PlistBuddy -c "Add :NSHealthShareUsageDescription string 'Discipline Key leest je stappen, gewicht en slaap om je dagdoelen bij te houden.'" Info.plist || true
/usr/libexec/PlistBuddy -c "Add :NSHealthUpdateUsageDescription string 'Discipline Key schrijft niets naar Gezondheid.'" Info.plist || true
/usr/libexec/PlistBuddy -c "Add :ITSAppUsesNonExemptEncryption bool false" Info.plist || true
cat > App.entitlements <<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>com.apple.developer.healthkit</key><true/>
<key>com.apple.developer.healthkit.access</key><array/>
</dict></plist>
XML
cd ..
ruby -e '
require "xcodeproj"
p = Xcodeproj::Project.open("App.xcodeproj")
t = p.targets.find { |x| x.name == "App" }
t.build_configurations.each { |c| c.build_settings["CODE_SIGN_ENTITLEMENTS"] = "App/App.entitlements"; c.build_settings["DEVELOPMENT_TEAM"] = ENV["APPLE_TEAM_ID"] }
t.add_system_capability("com.apple.HealthKit") rescue nil
p.save'
