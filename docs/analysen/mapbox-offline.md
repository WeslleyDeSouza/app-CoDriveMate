# Faktencheck: natives Mapbox-SDK und Offline

Stand: 24.11.2026. Recherche eines Agenten in den Quellen unten, keine
Rechtsberatung. «Folgerung» steht nicht wörtlich in einer Quelle.

| Aussage | Urteil |
|---|---|
| Natives SDK speichert Kartengebiete offline | Stimmt, höchstens 750 Tile Packs |
| Navigations-SDK rechnet Routen ohne Netz | Stimmt, wenn die Region vorher geladen wurde; auch Neuberechnung |
| Mit der Web-Karte geht das nicht | Für Mapbox GL JS keine Offline-API gefunden, systematisches Vorladen ist laut Bedingungen nicht erlaubt. Für MapLibre falsch: PMTiles funktioniert; ein Offline-Routing fehlt dort |
| Kein fertiges Capacitor-Plugin | Teilweise: es gibt einige, gefunden wurde keines mit Karte, Navigation und Offline auf beiden Plattformen für Capacitor 8 |
| Native Karte ist eine eigene Ebene | Stimmt (Folgerung aus einem vergleichbaren Plugin). HTML kann darüber bleiben, was im WebGL der Karte liegt, wird neu gebaut |
| SDK zeigt eigene GLB-Modelle | Stimmt, ohne glTF-Animationen, höchstens 65'536 Punkte pro Mesh |
| Abrechnung pro Nutzer oder Fahrt, privat gratis | Nutzer **und** Fahrten: 100 Nutzer und 1'000 Fahrten frei, danach 0.30 und 0.08 USD (gestaffelt). Rechnerisch gratis, aber siehe unten |

## Was in den Aussagen fehlt

- **Fahrzeuglizenz:** Product Terms §1.2.2 verlangt für Apps mit Fahrzeugbezug eine
  zusätzliche Lizenz, auch für Entwicklung. Das stellt «gratis» in Frage und
  betrifft wohl schon die heutige Nutzung (Folgerung).
- **§2.9.1:** In mobilen Apps sind die Mobile SDKs der einzige erlaubte Zugang.
  Mapbox GL JS in der Capacitor-App könnte das verletzen (Folgerung).
- Routen dürfen nicht gespeichert werden (§2.10.1), Karten im Gerätecache 30 Tage.
- Telemetrie und Attribution sind Pflicht, das SDK darf höchstens 12 Monate alt sein.
- Das Navigations-SDK braucht ein geheimes Download-Token, auch in der CI.

## Empfehlung

Empfohlen war, die Lizenz vor einem nativen Plugin zu klären. Entschieden am
24.11.2026: das native Maps SDK wird gebaut. Die Lizenzfrage bleibt offen.

## Quellen

- https://docs.mapbox.com/help/dive-deeper/mobile-offline/
- https://docs.mapbox.com/android/navigation/guides/advanced/offline/
- https://docs.mapbox.com/ios/navigation/guides/advanced/offline/
- https://www.mapbox.com/legal/product-terms (Stand 20.10.2026)
- https://www.mapbox.com/pricing
- https://docs.mapbox.com/style-spec/guides/using-3d-models/
- https://maplibre.org/maplibre-gl-js/docs/examples/pmtiles-source-and-protocol/
- https://capawesome.io/docs/sdks/capacitor/maplibre/
