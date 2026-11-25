# Datenhaltung

Stand: 24.11.2026.

Eine IndexedDB `codrivemate`: `kv` (Einstellungen, Wartung), `trips` und `cache`
(Eimer wie `tile`, `vector`, `vector-overview`, `map-assets`, `trees`, `swiss3d`, `fuel`, `road`, `tts` mit Ablauf und Aufräumen). Ausnahme: die
Übersetzungs-Bibliothek merkt sich die Sprache in `localStorage` (`app.lang`).

## Übernahme der alten Daten

| Quelle | Ziel |
|---|---|
| `pdrive2`, `pd_tsize` | Einstellungen |
| `picasso-drive` / `trip` | Fahrten |
| `pd_maint` | Wartung |
| alle `pd_*` und `pdrive2` | unveränderte Kopie unter `legacy/<schlüssel>` |

Die Übernahme läuft pro Bereich einmal und löscht die Quelle nie. Scheitert sie,
wird sie beim nächsten Start wiederholt. Parkplatz und Licht werden aus der Kopie
übernommen, sobald ihre Bereiche gebaut sind.

**Der Browser-Speicher gilt pro Adresse.** Die automatische Übernahme greift nur,
wenn die neue App unter derselben Adresse läuft wie der Prototyp. Die Sicherung
in den Einstellungen überträgt Daten von der neuen Web-Version in die native App.

Die Sicherung enthält die API-Schlüssel. Auf Android ist die automatische
Cloud-Sicherung abgeschaltet (`allowBackup=false`).
