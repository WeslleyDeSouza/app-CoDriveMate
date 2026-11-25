# 3D-Ansicht mit Auto

Stand: 24.11.2026.

three.js zeichnet `public/models/car.glb`. Das Auto steht still, die Welt dreht sich
darum. Der Knopf oben links wechselt durch die Umgebungen, die gerade möglich sind.

| Umgebung | Was sie zeigt | Voraussetzung |
|---|---|---|
| Luftbild | eigene Welt mit swisstopo-Luftbild | keine (Luftbild nur Schweiz) |
| Schlicht | eigene Welt ohne Luftbild | keine |
| Mapbox | Mapbox Standard, darüber das Auto | Mapbox-Token |
| Google | Photorealistic 3D Tiles | Google-Key mit Map Tiles API |

Lehnt der Anbieter den Key ab oder fehlt er, erscheint das Luftbild. Ohne Verbindung
wird die Umgebung nach zwei Minuten wieder angeboten.

## Teile der eigenen Welt

Alle einzeln schaltbar unter Einstellungen → «Anzeige und 3D» (`map.scene`).

| Option | Quelle / Umsetzung |
|---|---|
| Strassen, Wald, Strassennamen (immer) | OpenFreeMap-Vektorkacheln (OpenStreetMap) |
| Scharfes Luftbild | SWISSIMAGE Zoom 19 und 20 nahe am Auto, sonst 18 |
| Himmel und Tageszeit | Sonnenstand aus Ort und Uhrzeit, Dunst, Himmel als Lichtquelle, Scheinwerfer nachts |
| Schatten | Schattenkarte rund ums Auto, 1024 oder 2048 Punkte |
| Gelände | swisstopo `terrain.3d` (quantized-mesh, Zoom 15) |
| Genaue Gebäude | swisstopo `swissbuildings3d` (3D Tiles, Draco); sonst OSM-Klötze |
| Genaue Bäume | swisstopo `vegetation.3d`; sonst Overpass, wenn der Dienst antwortet |
| Fassaden | im Shader berechnet: Fenster, Rahmen, Ziegel, nachts Licht; keine Texturen |
| Strassendetails | Asphalt im Shader, Randlinien, gelbe Fussgängerstreifen (Overpass) |

Genaue Gebäude und Bäume schalten das Gelände ein, weil sie auf wahrer Höhe stehen.
Fassadenfarben, Fenster und Beleuchtung sind erfunden; nur die Form stimmt.

Qualität: bestimmt Pixelverhältnis (1 / 1.5 / 2), Schatten, Sichtweite und Feinheit.

## Mapbox-Umgebung

Eine zweite Mapbox-Karte (`MapSurface`, im Browser GL JS, in den Apps das native SDK)
liegt unter der durchsichtigen three.js-Fläche, die nur das Auto zeichnet. Beide Kameras
sind gleich gerechnet (`domain/backdrop.ts`). Alle 3 s wird vorausgeladen, was 200 und
500 m weiter vorne liegt (Browser). Nachts wechselt das Licht nach Sonnenstand. Das
native Plugin kann dafür mehrere Karten (`mapId`).

Eine zweite Karte zählt bei Mapbox als zusätzlicher Kartenaufruf.

## Route

In der Mapbox-Umgebung erscheint nur eine Mapbox-Route, in der Google-Umgebung keine.
Die eigene Welt zeigt jede Route, wie bisher auch eine von Mapbox. Vor einer
Veröffentlichung ist zu klären, ob das den Mapbox-Bedingungen entspricht.

## Offline

| Inhalt | beim Fahren | «Offline speichern» der Route |
|---|---|---|
| Strassen, OSM-Gebäude | ja | ja |
| Luftbild 18 | ja | ja, höchstens 2000 Kacheln |
| Luftbild 19 / 20 | ja | ja, je höchstens 2000 |
| Gelände, Gebäude, Bäume von swisstopo | ja (`swiss3d`, 3000 Dateien) | ja |
| Bäume und Streifen aus Overpass | ja | nein (Dienst begrenzt) |
| Mapbox | nur natives SDK | nur natives SDK |
| Google | nie (Bedingungen) | nie |

## Performance

- three.js lädt erst mit der Ansicht.
- Ein Web Worker liest die Kacheln und baut die Geometrie.
- Höchstens 30 Bilder pro Sekunde; wird es zu langsam, sinkt die Auflösung von selbst.
- Im Hintergrund, ausgeschaltet oder ausserhalb des Bilds wird nichts gezeichnet.
- Alle 1.5 km wird der Ursprung verschoben.

## Grenzen

- Das Geländemodell kennt keine Brücken und Unterführungen: dort folgt die Strasse dem
  Boden darunter und kann absinken.
- Neben steilen Mauern verzerrt sich das Luftbild.
- Genaue Gebäude, Bäume, Gelände und Luftbild gibt es nur in der Schweiz.

Geprüft im Chrome des Entwicklungsrechners, der ohne Grafikkarte rendert: Luftbild,
Schlicht und Mapbox bei Tag, Luftbild und Mapbox bei Nacht. **Nicht geprüft:** Google
(kein Key), die Leistung auf einem Tablet, das native Plugin mit zwei Karten (nicht
kompiliert), das Speichern einer Route im echten Betrieb.

## Lizenzen

- `3d-tiles-renderer` 0.5 (Apache-2.0), Draco-Decoder aus three.js (Apache-2.0),
  ausgeliefert unter `assets/draco`.
- swisstopo: freie Geodaten, Quellenangabe «© swisstopo» bleibt sichtbar.

## Modell

`car.glb` nennt als Erzeuger den three.js-Exporter r187 und hat dieselben Teile wie das
prozedurale Modell in `_index.html`, stammt also daraus (vom Inhaber am 24.11.2026
bestätigt). Keine Fremdlizenz. Eigene Modelle: Räder heissen `wheel…`, Lack-Material
`paint`, Rücklicht `tail`.
