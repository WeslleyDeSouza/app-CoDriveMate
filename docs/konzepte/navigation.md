# Karte und Navigation

Stand: 24.11.2026.

| Umgebung | Mit Mapbox-Token | Ohne Token oder bei Ausfall |
|---|---|---|
| iOS, Android | Mapbox Maps SDK (`plugins/mapbox-native`; iOS 11.34.1 über CocoaPods, Android 11.35.2) | MapLibre mit OpenFreeMap |
| Browser | Mapbox GL JS 3 | MapLibre mit OpenFreeMap |
| Route, Suche | Mapbox Directions (Live-Verkehr), Geocoding | OSRM, Nominatim |

Karte und Route kommen immer vom gleichen Anbieter. Fällt die Mapbox-Route aus,
wechselt die Karte mit; fällt die Mapbox-Karte aus, wird die Route über OSRM neu
geholt. Ein aufgebrauchtes Kontingent pausiert Mapbox bis zum nächsten Tag, ein
abgelehntes Token, bis ein anderes eingetragen ist. Google ist nicht portiert;
die Einstellung «Google» wirkt wie «Automatisch».

## Aufbau

- `MapSurface` ist der Port für eine Karte. Quellen und Ebenen stehen einmal in
  `application/map-scene.ts`, in der Mapbox-Style-Spezifikation, die alle drei
  Bibliotheken verstehen.
- Das native Plugin ist eine dünne Brücke. Die native Ansicht liegt **hinter** der
  WebView, darüber ist alles durchsichtig (`html.native-map`). Weil die WebView
  alle Berührungen erhält, rechnet `NativeSurface` Ziehen, Zoomen und Drehen selbst.
- Das Token setzt die App zur Laufzeit, es steht nicht im Build.
- Nur Suche auf Absenden: Nominatim verbietet Autovervollständigung.

## Offline

«Route offline speichern» sichert für die aktive Route:

| | Browser | iOS, Android |
|---|---|---|
| 3D-Ansicht (Kacheln, Luftbild, Gelände, Gebäude, Bäume) | ja | ja |
| Mapbox-Karte entlang der Strecke | nein, von Mapbox nicht erlaubt | ja, über den TileStore des SDK |
| OSM-Karte (OpenFreeMap) entlang der Strecke | ja | ja |
| Laufende Route und Führung | ja, solange die App offen ist | gleich |
| Neue Route ohne Netz | ja, in gespeicherten Gebieten | gleich |

Das SDK erlaubt höchstens 750 Tile Packs; eine neue Route ersetzt die letzte.
LineString als Gebiet nennt die Doku, zeigt aber kein Beispiel dazu.

### OSM-Karte ohne Netz

`core/map` (`OpenFreeMap`) ist der einzige Weg zu OpenFreeMap: für die Karte
(MapLibre holt alles über das Protokoll `stored://`), die 3D-Ansicht und die
Route ohne Netz. Was einmal geladen wurde, bleibt auf dem Gerät und wird zuerst
benutzt; älter als 14 Tage wird es im Hintergrund erneuert. Die Kachelliste kommt
dagegen zuerst vom Netz, weil alte Kartenstände vom Server verschwinden.

| Eimer | Inhalt | höchstens |
|---|---|---|
| `vector` | Kacheln z14, gemeinsam mit 3D und Route | 4000 |
| `vector-overview` | Kacheln bis z13 | 1500 |
| `map-assets` | Stil hell und dunkel, Symbole, Schrift, Kachelliste | 300 |

«Route offline speichern» holt z4 bis z14 samt Nachbarkacheln, höchstens 3500
Kacheln, auch wenn gerade eine andere Karte gezeigt wird.
Nicht mitgespeichert werden die Reliefbilder des hellen Stils und andere Schriften
als die lateinische; Ausschnitte neben der Strecke bleiben leer.

### Gespeicherte Ziele ohne Netz

Ziele aus der OSM-Suche behalten ihre Koordinaten. Für Ziele aus Mapbox oder
Google ist das nicht erlaubt: Nach der Wahl wird ihr Name einmal über OSM gesucht
(der Name geht dabei an Photon/Nominatim) und die OSM-Koordinate behalten, wenn sie
höchstens 150 m entfernt ist. Mit Netz wird wie bisher neu gesucht, die
OSM-Koordinate gilt nur, wenn die Suche nichts liefert oder 5 s nicht antwortet.
Beim Tippen erscheinen passende gespeicherte Ziele zuerst. Früher gespeicherte
Mapbox- und Google-Ziele erhalten die Koordinate bei der nächsten Fahrt dorthin.

### Route ohne Netz berechnen

Antworten weder Mapbox noch OSRM, rechnet das Gerät die Route selbst
(`OfflineRoutingService`, letzter Dienst der Kette, Hinweis
`navigation.notice.offline_route`). Das gilt auch für das Neuberechnen während
der Fahrt.

- Grundlage sind die OpenFreeMap-Kacheln (z14), die für Karte und
  3D-Ansicht schon gespeichert sind (Cache `vector`).
  Es wird nichts nachgeladen. Dekodieren und Suchen (A* nach Zeit) laufen in einem
  Web Worker.
- `domain/road-graph.ts` fügt die Strassen der Kacheln zu einem Netz zusammen
  (Einbahnen, Brücken und Tunnel, Kachelgrenzen), `domain/offline-route.ts` macht
  daraus Route, Manöver (auch Kreisel mit Ausfahrt) und Strassennamen.
- Die Route gilt als OSM-Route und erscheint darum nie auf einer Mapbox-Karte.

Grenzen:

- Nur gespeicherte Gebiete; Start, Ziel und der Weg dazwischen müssen lückenlos
  vorhanden sein. Höchstens 120 km Luftlinie und 600 Kacheln um die direkte Linie
  (30 % Rand), Start und Ziel höchstens 300 m neben einer Strasse.
- Keine Abbiegeverbote (sie stehen nicht in den Kacheln), kein Verkehr, keine
  Sperrungen. Die Signalisation geht vor.
- Fahrzeiten aus Durchschnittstempo je Strassenklasse, ohne Tempolimiten.
- Kreisel sind in den Kacheln meist nicht als Einbahn bezeichnet und werden an der
  runden Form erkannt; unregelmässige bleiben gewöhnliche Strassen und könnten
  in der falschen Richtung in die Route kommen.
- Keine Ortssuche ohne Netz; Ziele kommen aus gespeicherten Orten.
- Gerechnet nur mit echten Kacheln auf dem Entwicklungsrechner geprüft, nicht auf dem Tablet.

## Hintergrund

Nativ liefert `@capacitor-community/background-geolocation` (MIT) den Standort
auch bei gesperrtem Bildschirm, aber nur mit OBD-Verbindung oder aktiver Route
(Einstellung «Im Hintergrund weiterlaufen»). Android zeigt dafür eine Mitteilung;
`useLegacyBridge` ist gesetzt, weil Android die Meldungen sonst nach fünf Minuten
anhält. Im Browser geht es nicht. Am Gerät ungetestet.

## Geprüft und ungeprüft

- Im Browser geprüft: Mapbox mit gültigem Token (Karte, Suche, Route) und
  OpenFreeMap mit OSRM, Führung mit Demo, Rückfall bei abgelehntem Token.
- **Nicht geprüft: das native Plugin** (weder kompiliert
  noch gestartet), GPS im Auto, Ansagen auf dem Tablet.
- Native Aufrufe für Quellen, Ebenen, Bilder und Kamera-Animation stehen so nicht
  auf den gelesenen Doku-Seiten; beim ersten Build zuerst dort nachsehen.
- Im nativen Plugin fehlen 3D-Gebäude im Stil «Mapbox Navigation».

## Offen

- Android-Foreground-Service, damit Ansagen im Hintergrund weiterlaufen
- Lizenz für Fahrzeugnutzung, siehe [mapbox-offline.md](../analysen/mapbox-offline.md)
- Tempolimit, Gefahrenstellen, Verkehrsmeldungen
