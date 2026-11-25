# Ausfallsicherung

Stand: 24.11.2026. Route und grosse Karte sind portiert, siehe
[navigation.md](navigation.md). 3D-Kamera, Offline und Google-Stimme sind portiert.

| Dienst | Prototyp | Zielbild |
|---|---|---|
| Route und Verkehr | Google, Mapbox, OSM | Immer passend zur Karte: Mapbox mit Mapbox, sonst OSRM mit OSM; Google nur auf der Google-Karte |
| Route ohne Netz | keine | zuletzt auf dem Gerät aus gespeicherten Karten, nur auf der OSM-Karte |
| Parkplätze, Tankstellen | keine | Photon, dann Overpass |
| Grosse Karte | folgt dem Dienst, sonst OpenFreeMap | gleich |
| OSM-Karte ohne Netz | keine | gespeicherte Kacheln, siehe navigation.md |
| Gespeicherte Ziele | keine | neu gesucht, sonst gespeicherte OSM-Koordinate |
| 3D-Kamera | fällt auf die eigene 3D-Welt zurück | gleich |
| Offline | nur OSM und swisstopo gespeichert | gleich; Google nie speichern |
| Stimme | Google, sonst Browserstimme | gleich |

In den Einstellungen lassen sich gesperrte Dienste von Hand freigeben.
Ein aufgebrauchtes Kontingent sperrt den Dienst bis zum nächsten Tag, jeder
andere Fehler geht nur für diesen Aufruf zum nächsten Dienst. Der Wechsel wird
kurz angezeigt.

Das native Mapbox-SDK ist eingebaut, die Offline-Stufe darin noch nicht, siehe
[mapbox-offline.md](../analysen/mapbox-offline.md).
