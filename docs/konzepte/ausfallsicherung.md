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
| Stimme | Google, sonst Browserstimme | wählbar Google, OpenAI (Realtime-API, `gpt-realtime-2.1-mini`; weicht das Gesprochene vom Text ab, spricht das Gerät) oder ElevenLabs, sonst Gerätestimme; nach 6 Sekunden (lange Texte 25) ohne Antwort spricht das Gerät; nur Google-Sätze werden gespeichert; die Ansagen der nächsten 5 Manöver werden vorgeladen (nur im Arbeitsspeicher, auch im Funkloch; gesagt wird 800 oder 300 m, wenn es höchstens 15 % abweicht); mit echten Keys ungetestet. iOS nimmt die beste installierte (Premium, Erweitert, Standard), auf dem iPad ungetestet |

In den Einstellungen lassen sich gesperrte Dienste von Hand freigeben.
Ein aufgebrauchtes Kontingent sperrt den Dienst bis zum nächsten Tag, jeder
andere Fehler geht nur für diesen Aufruf zum nächsten Dienst. Der Wechsel wird
kurz angezeigt.

Das native Mapbox-SDK ist eingebaut, die Offline-Stufe darin noch nicht, siehe
[mapbox-offline.md](../analysen/mapbox-offline.md).
