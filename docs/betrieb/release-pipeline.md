# Release-Pipeline

Stand: 25.11.2026. Gebaut wird mit Capawesome Cloud (console.cloud.capawesome.io).
Ionic Appflow endet am 31.12.2027; Ionic empfiehlt Capawesome als Nachfolger. Ionic
ist aus dem Repository entfernt. Die Pipeline ist noch nie gelaufen.

## Einmalig einrichten

1. **Repository:** privates Git-Repository mit den Ordnern `android` und `ios`
   (Capawesome führt `cap sync` aus, aber nie `cap add`).
2. **App in Capawesome** anlegen (Typ Capacitor, Bundle ID `app.codrivemate.ch`),
   Git-Verbindung auf Ebene Organisation anlegen und das Repository auswählen.
   Für CoDriveMate gibt es in Appflow nichts zu übernehmen (die App-ID war nie
   eingetragen). Andere Apps (llumi): `npx @capawesome/cli apps:import`. Der Export
   aus Appflow enthält Geheimnisse im Klartext und wird danach gelöscht.
3. **Environment** anlegen und beim Build auswählen:
   - Secret `NPM_TOKEN`: Token der privaten Registry
   - Variablen `NODE_VERSION` = `24`, `JAVA_VERSION` = `21`
4. **Apple:** App-ID `app.codrivemate.ch`, App in App Store Connect,
   Distributionszertifikat (`.p12`) und Provisioning Profile unter «Signing
   certificates». Das Passwort kennt nur der Inhaber.
5. **Destination** «App Store Connect» mit API-Key (`.p8`, Key ID, Issuer ID, Team ID).
   Jede Übermittlung geht zu TestFlight.
6. **Icon und Splash** fehlen noch (heute die Vorlage von Capacitor).

## Build

Stack `macos-golden-gate` (Standard, Xcode 27.2) oder `macos-tahoe` (Xcode 26.5);
Capacitor 8 und Apple verlangen Xcode ab 26. Die Schritte stehen in
`capawesome.config.json`:

1. `npm ci --userconfig=.npmrc.example --legacy-peer-deps`: Registry aus der Vorlage.
   `@app-galaxy/translate-ui` verlangt offiziell Angular 20, daher `legacy-peer-deps`
2. `npm run capawesome:build` (Capawesome nimmt dieses Skript vor `build`): Web-Build
   plus Version und Build-Nummer
3. Capawesome: `cap sync`, Bauen, Signieren

Das Live-Update-Plugin ist freiwillig und nicht installiert.
Die `.npmrc` mit Token ist von Git ausgeschlossen. (In llumi ist sie eingecheckt;
dort sollte das Token ersetzt und entfernt werden.)

## CocoaPods

Das iOS-Projekt nutzt CocoaPods, weil das bisher so angelegt ist; CocoaPods ist auf den Stacks
installiert. Zu Swift Package Manager wurde in der Capawesome-Doku nichts gefunden. Die eigenen Plugins haben beides (Podspec und
`Package.swift`). Mapbox veröffentlicht neue Versionen nicht mehr
über CocoaPods; die letzte dort ist 11.34.1 (29.10.2026, im Podspec fest eingetragen).
Für neuere Versionen ist der Wechsel auf SPM nötig
(`npx cap add ios --packagemanager SPM`, `Info.plist` sichern).

## Version und Build-Nummer

```bash
npm run version:set 1.0.1   # package.json, iOS und Android
npm run native:bump         # Build-Nummer: lokal = Anzahl Git-Commits
```

In Capawesome gilt `CI_BUILD_NUMBER`, weil dort nur der gebaute Commit geklont wird.
Die Startnummer lässt sich in den App-Einstellungen setzen («next build number»).

Neue Version vor jedem Upload einer abgeschlossenen Version.

## Lokal

Node ab 22. Android: JDK 21 (gefunden wurden nur 16 und 17), SDK 36. iOS nur auf macOS.
Android- und iOS-Build sind noch nie gelaufen.

Quellen: capawesome.io/docs/cloud/migrations/ionic-appflow, /native-builds/build-stacks,
/native-builds/environment-variables, /native-builds/npm-private-registry,
/native-builds/auto-incrementing-build-numbers; capacitorjs.com/docs/updating/8-0;
developer.apple.com/news/upcoming-requirements.

## Demo-Seite (GitHub Pages)

Ein Produktions-Build mit Demo-Fahrt: `npm run build:demo` (Konfiguration `demo` in
`angular.json`, ersetzt `core/environment/environment.ts` durch `environment.demo.ts`).
Der normale Build und die Apps bieten die Demo nicht an. Keine Keys im Build; Keys gibt
der Besucher selbst in den Einstellungen ein, sie bleiben in seinem Browser.

Workflow `.github/workflows/demo-page.yml`: bei jedem Push auf `main` (oder von Hand)
bauen mit `--base-href /<repo>/` und auf GitHub Pages veröffentlichen. Die App nutzt
Hash-Routen (`#/…`), deshalb braucht Pages keine Weiterleitung für Unterseiten.

Einmalig einzurichten:
- Repository > Settings > Pages > Source: «GitHub Actions»
- Repository > Settings > Secrets and variables > Actions: Secret `NPM_TOKEN` (Token
  der privaten Registry, wie bei Capawesome)

Adresse: `https://<user>.github.io/<repo>/?demo` startet die Demo sofort, sonst über den
Demo-Knopf im Dock. Ein Mapbox-Token mit Domain-Beschränkung muss `*.github.io` erlauben.
Nicht auf Pages: die Schweizer Verkehrsmeldungen (Netlify-Funktion).

Fehler `E401 … Sonatype Nexus` beim Installieren (Capawesome oder Actions): Das Secret
`NPM_TOKEN` fehlt, ist falsch oder das Environment ist beim Build nicht ausgewählt.
Lokal mit dem Token aus `.npmrc` geprüft (26.11.2026): mit Token 200, ohne 401.
