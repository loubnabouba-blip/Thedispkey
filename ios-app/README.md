# Discipline Key als iPhone-app (met Apple Gezondheid)

Status: **voorbereid, nog niet gebouwd of getest.** De bouw draait in de cloud op een Mac van GitHub, je hebt zelf geen Mac of Xcode nodig.

## Wat is er klaar
- De web-app staat in de repo-root. `ios-app/` verpakt die met Capacitor tot een echte iOS-app.
- De app herkent de native Gezondheid-plug-in (`@capgo/capacitor-health`) al: in de iOS-app verschijnt “Koppel Apple Gezondheid” en stappen worden automatisch bijgewerkt.
- `.github/workflows/ios-testflight.yml` bouwt de app, zet HealthKit aan, ondertekent automatisch en uploadt naar TestFlight.

## Wat jij moet doen (eenmalig, zodra je een Developer-account hebt)
1. Neem een Apple Developer-account (€99 per jaar): developer.apple.com/programs.
2. Maak een App ID `nl.thediscipline.key` met HealthKit aan (Certificates, Identifiers & Profiles). Je kunt het app-ID ook aanpassen in `capacitor.config.json`.
3. Maak in App Store Connect de app aan (Mijn apps > + > Nieuwe app) met dezelfde Bundle ID.
4. App Store Connect > Gebruikers en toegang > Integraties > API-sleutels: maak een sleutel met rol **App Manager**. Bewaar het .p8-bestand, het Key ID en het Issuer ID.
5. GitHub-repo > Settings > Secrets and variables > Actions, voeg toe:
   - `APPLE_TEAM_ID` (10 tekens, bij Membership)
   - `ASC_KEY_ID`, `ASC_ISSUER_ID`
   - `ASC_KEY_P8_BASE64`: de inhoud van het .p8-bestand in base64 (`base64 -i AuthKey_XXXX.p8`)
6. GitHub > Actions > “iOS build naar TestFlight” > Run workflow.
7. Na ±15 minuten staat de build in TestFlight. Voeg testers toe (intern tot 100 mensen zonder review; extern tot 10.000 na een korte Apple-controle) en nodig ze uit via hun e-mail. Zij installeren via de TestFlight-app.

## Let op
- Capacitor en de Gezondheid-plug-in staan vast op versie 8: de plug-in compileert niet tegen nieuwere Capacitor-versies.
- De Gezondheid-koppeling leest nu **stappen**. Gewicht en slaap kunnen later worden toegevoegd in de adapter in `index.html` (`StepSensor`).
- Voor de App Store (niet nodig voor TestFlight) heb je nog een privacyverklaring, schermafbeeldingen en een beschrijving nodig.
