# Dokumentation CoDriveMate

Stand der Ablage: 24.11.2026. Ein Ordner pro Zweck, eine Zeile pro Datei.
Wer eine Datei dazulegt, trägt sie hier ein.

| Ordner | Inhalt |
|---|---|
| [`produkt/`](produkt) | Was die App kann, Stand pro Bereich |
| [`konzepte/`](konzepte) | Aufbau und Entscheidungen |
| [`betrieb/`](betrieb) | Build, Versionen, Release |
| [`analysen/`](analysen) | Untersuchungen und Faktenchecks |
| [`screenshots/`](screenshots) | Bilder aus der Demo-Fahrt für das README (1366 × 1024, `?demo`) |

| Datei | Inhalt |
|---|---|
| [funktionsuebersicht.md](produkt/funktionsuebersicht.md) | Stand pro Bereich, offene Punkte |
| [architektur.md](konzepte/architektur.md) | Module, Schichten, Performance-Regeln |
| [bluetooth.md](konzepte/bluetooth.md) | Gemeinsame BLE-Schicht, UUIDs, Berechtigungen |
| [datenhaltung.md](konzepte/datenhaltung.md) | IndexedDB, Cache, Übernahme der alten Daten |
| [ausfallsicherung.md](konzepte/ausfallsicherung.md) | Was einspringt, wenn ein Dienst ausfällt |
| [navigation.md](konzepte/navigation.md) | Karte, Route, natives Mapbox-Plugin, was geprüft ist |
| [szene3d.md](konzepte/szene3d.md) | 3D-Ansicht: Datenquellen, Performance, Modell |
| [copilot.md](konzepte/copilot.md) | KI-Copilot, Unterhaltung, Sprachvorrang |
| [musik.md](konzepte/musik.md) | Apple Music, YouTube, Spotify: was geht und warum |
| [mehrsprachigkeit.md](konzepte/mehrsprachigkeit.md) | Sprachen, Textdateien, Übersetzen |
| [release-pipeline.md](betrieb/release-pipeline.md) | Capawesome Cloud, Versionsnummer, Registry |
| [mapbox-offline.md](analysen/mapbox-offline.md) | Faktencheck natives Mapbox-SDK und Offline |

Die Funktionsübersicht wandert bei jeder Funktionsänderung mit.
