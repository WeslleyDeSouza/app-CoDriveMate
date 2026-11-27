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

Seit 27.11.2026 ist `public/models/car.glb` ein **gekauftes Modell** des Citroën Xsara
Picasso (Mk1 Facelift, 2004), vom Inhaber erworben (Angabe vom 27.11.2026). Die Quelldatei
`models/Citroen_Xsara_Picasso_(Mk1f)_2004.blend` (60 MB, Blender 3.6) liegt nur lokal und
ist in `.gitignore`; das Nummernschild der Quelle trägt den Schriftzug «HUMSTER3D», der
Anbieter dürfte also Hum3D sein (Rückschluss, kein Beleg gesehen). **Vor einer
Veröffentlichung** sind die Lizenzbedingungen des Kaufs zu prüfen: ob das Modell in einer
App ausgeliefert werden darf und ob die reduzierte GLB-Datei dafür genügend geschützt ist.
Für den privaten Gebrauch kein Hindernis. Das Modell davor (aus dem prozeduralen Modell
des Prototyps, eigenes Werk) steht in der Git-Geschichte.

Umwandlung mit `tools/car-model-export.py` (Blender 5.3, im Hintergrund):

```bash
blender --background "models/Citroen_Xsara_Picasso_(Mk1f)_2004.blend"   --python tools/car-model-export.py -- public/models/car.glb [Ordner für Vorschaubilder]
```

Die Quelle hat rund 794'000 Dreiecke in 130 losen Teilen. Das Skript behält alles
(Innenraum hinter durchsichtigen Scheiben, Lampen hinter ihren Gläsern; Scheiben und
Lampengläser als Alpha-Blending, ohne Lichtbrechung), reduziert Teil für Teil auf rund
150'000 Dreiecke (3.1 MB, ohne Texturen und UVs), am stärksten, wo man am wenigsten
sieht, dreht die Front nach -Z, skaliert auf 4.28 m,
fasst die Karosserie zu einem Netz und jedes Rad (Reifen, Felge, Kappe, Bremsscheibe) zu
einem Knoten `wheel_FL/FR/RL/RR` mit Drehpunkt in der Radmitte zusammen und benennt die
Materialien so, wie die Szene sie erwartet. Schriftzüge bleiben unreduziert; die
Nummernschilder sind leer (der Schriftzug des Anbieters ist entfernt). Der Lack ist im
Modell schwarz; die Szene färbt ihn mit der Farbe aus den Einstellungen (Vorgabe neu
`#101216`; wer schon eine Farbe gespeichert hat, behält sie). Ein erster Export mit
48'000 Dreiecken, undurchsichtigem Glas und ohne Innenraum war in der Nachtszene nur eine
Silhouette und wurde verworfen.

**Eigene Glanzlichter:** Lack, Chrom und Glas des Autos spiegeln immer das Studio
(`RoomEnvironment`), nicht den Himmel der Szene, tagsüber mit Stärke 1, nachts 0.55
(`lightCar` in `three-scene.ts`). So zeichnet die Form auch bei schwarzem Lack und Nacht.

Im Browser mit `?demo` angesehen (Kameras Auto, Heck, Seite, Showroom; Nachtszene): Räder,
Ausrichtung, Rücklichter und Durchsicht stimmen. **Ungetestet:** Bildrate auf dem iPad (das
Auto allein hat jetzt rund 150'000 Dreiecke und wirft Schatten) und die Tagszene.

Eigene Modelle: Wurzelknoten `XsaraPicasso` (sonst wird skaliert und gedreht), Räder
heissen `wheel…`, Lack-Material `paint`, Rücklicht `tail`.
