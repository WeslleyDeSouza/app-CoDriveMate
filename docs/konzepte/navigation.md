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
- **Neigung mit zwei Fingern:** Beide Finger zusammen nach oben oder unten kippen die
  Karte (0 bis 70 Grad), alles andere zoomt und dreht wie bisher
  (`domain/map-gesture.ts`). Mapbox GL JS und MapLibre bringen die Geste mit, bei Google
  ist sie eingeschaltet, `NativeSurface` rechnet sie selbst. Die Neigung bleibt gespeichert
  (`MapPreferences.pitch`); fast flach gilt als 2D. Auf keinem Gerät getestet.
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

Liegt eine Route ganz in vollständig gespeicherten Gebieten (auch der Rückweg), erscheint der
Knopf nicht. Verglichen werden Kacheln z14 (`domain/offline-areas.ts`) und der Kachelspeicher;
eine andere Karte oder andere 3D-Optionen zählen nicht, nach 90 Tagen erscheint er wieder.
Auf der Mapbox-Karte zählt nur die letzte Route.

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

### Ortssuche

Mit Mapbox-Key sucht die App über die Search Box API (`/search/searchbox/v1/forward`):
Die Geocoding-API v6 kennt keine Geschäfte, Bäder oder Fitnesscenter mehr. Search Box
rechnet pro Anfrage ab (laut Mapbox 25'000 im Monat frei; die Doku ist dazu nicht ganz
eindeutig), beim Tippen einmal pro Pause von 450 ms. Die Resultate dürfen nicht
gespeichert werden; gespeicherte Ziele behalten nur Name und Adresse. Findet Mapbox
nichts, fragt die App OpenStreetMap.

Die freien OSM-Suchen (Nominatim beim Absenden, Photon beim Tippen) verlangen jedes Wort
im Namen. Findet die ganze Eingabe nichts, wird mit hinten gekürzten Wörtern nachgesucht
(höchstens zwei weitere Versuche, über Photon, damit Nominatim nur eine Anfrage pro Suche
bekommt): «Lionsoul Zürich 24H Fitness» findet so «Lionsoul Zürich». Photon rät bei
Unbekanntem wild; seine Vorschläge bleiben nur, wenn ein Wort der Eingabe im Namen oder
in der Strasse vorkommt (`domain/search-text.ts`). Was OSM unter einem anderen Namen
kennt, findet die freie Suche nicht: Das Hürlimannbad heisst dort «Thermalbad & Spa
Zürich». Abhilfe wäre ein `alt_name` in OpenStreetMap.

### Geplante und gespeicherte Fahrten

Ein Ziel lässt sich für später speichern (`domain/planned-trips.ts`,
`PlannedTripsStore`, IndexedDB `kv` unter `navigation/trips`, Teil des Backups): Thema
(höchstens 60 Zeichen), Beschreibung (300), Tag (leer = jederzeit) und Favorit. Der Ort
wird wie ein gespeichertes Ziel behandelt: ohne Mapbox- oder Google-Koordinaten, dafür mit
OSM-Koordinate für die Zeit ohne Netz. Sortiert: heute, kommende Tage, jederzeit,
vergangene (blass, werden nicht automatisch gelöscht). Gestartet trägt das Ziel
(`Place.purpose`) Thema und Beschreibung mit; Copilot und Unterhaltung sehen sie, solange
die Route läuft. `NavigationStore.arrival` meldet das erreichte Ziel für den Wunsch bei
Ankunft. Höchstens 50 Einträge, die ältesten fallen weg.

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

## Standort schätzen

Ein iPad ohne GPS bekommt seinen Standort spät, selten und ungenau (WLAN, Hotspot des
iPhones). Im Auto am 28.11.2026: Karte hinkte nach, das 3D-Auto stand neben der Strasse
und schaute falsch; auf dem iPhone mit GPS stimmte alles. Seither rechnet
`domain/position-estimate.ts` zwischen den Meldungen des Geräts weiter:

- **Weiterfahren:** Viermal pro Sekunde rückt das Auto mit der bekannten Geschwindigkeit
  vor: OBD, sonst die des Geräts, sonst aus zwei Meldungen gerechnet. Mit Route der
  Routenlinie entlang (bis 60 s ohne neue Meldung), sonst der Strasse entlang (20 s),
  sonst geradeaus (8 s).
- **Verspätung:** Eine Meldung wird um die seit ihrer Messung gefahrene Strecke
  vorgeschoben (höchstens 5 s).
- **Ungenaue Meldungen** (über 20 m) ziehen die Schätzung nur an, statt sie zu ersetzen;
  über 150 m werden sie ausgelassen, solange die Schätzung frisch ist. Steht das Auto,
  bleibt es stehen.
- **Auf die Strasse:** Aus den gespeicherten OpenFreeMap-Kacheln (Zoom 14,
  `infrastructure/tile-road.source.ts`, kein Netz) wird die nächste Strasse gesucht, die
  zur Fahrtrichtung passt (`domain/road-match.ts`). Das Auto steht dann auf ihr und schaut
  in ihre Richtung. Bei guter Meldung nur bis 12 m und nur in Fahrt, bei ungenauer bis
  80 m. Am Ende einer Strasse geht es auf der geradesten Fortsetzung weiter; wo man
  abbiegen muss, wartet es auf die nächste Meldung. Ohne gespeicherte Kacheln (z. B. nur
  Mapbox-Karte benutzt) entfällt dieser Teil.
- **Richtung:** Liefert das Gerät keine, kommt sie aus zwei Meldungen oder von der Strasse.
- Mit Route gilt eine Meldung bis 40 m (bei ungenauer bis 150 m) neben der Linie als
  auf der Route; weiter weg wird frei geschätzt, damit die Neuberechnung greift.

**Im Auto ungetestet.** Grenzen: An Verzweigungen ohne Route rät die App geradeaus, bis
die nächste Meldung sie korrigiert; zwei parallele Strassen kann sie verwechseln. Ein
iPad ohne GPS bleibt ungenauer als ein Gerät mit GPS; ein externer GPS-Empfänger
(Bluetooth, vom System wie eingebautes GPS behandelt) wäre die saubere Lösung.

## Ansagen

Jedes Manöver wird je Distanzstufe (800 m, 300 m, 60 m) einmal angesagt.
Erkannt wird ein Manöver an Art und Ort (unter 40 m), nicht an der Schrittnummer:
eine neue Route zum gleichen Ziel (Umleitung, Verkehrs-Check alle 4 Minuten)
sagt dieselbe Abzweigung nicht nochmals an. Erst ein neues Ziel beginnt neu.

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
