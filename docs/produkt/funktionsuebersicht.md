# Funktionsübersicht

Stand: 24.11.2026. Nichts davon ist im echten Auto oder am echten Adapter getestet.

| Bereich | Stand |
|---|---|
| Cockpit | Tempo, Gang, Tempolimit, Trip, Schnitt, Verbrauch, Kühlmittel, Batterie, Reichweite; Kacheln färben sich bei Warnungen |
| Fahrzeugwarnungen | gebaut wie im Prototyp: Temperatur, Ladespannung, Reichweite, Motorkontrollleuchte; Karte, Ansage, «Verstanden» |
| Diagnose | gebaut: Fehlercodes lesen, im Stand löschen, KI fragen; am Auto ungetestet |
| Verlauf | gebaut: sechs Werte über zwei Minuten |
| Gefahrenhinweise, Tempolimit | gebaut aus OpenStreetMap (Overpass, oft überlastet); nie Kontrollen |
| Verkehrsmeldungen | TomTom mit Key; Schweizer Meldungen: siehe «Offen»; ungetestet |
| Innenlicht | gebaut nach dem Protokoll des Prototyps; am Modul ungetestet |
| Google-Karte | gebaut; ohne Key ungetestet |
| Stimme (Gerät, Google, OpenAI, ElevenLabs) | in den Einstellungen wählbar; mit Keys und auf dem iPad ungetestet |
| OBD2 über BLE | Assistent mit Geräteliste in der App («Passt vermutlich»), Verbindungstest, automatisch verbinden und wiederverbinden; am Gerät ungetestet |
| Einheiten | Distanz, Temperatur, Verbrauch, Volumen, Druck; Eingaben (Kilometerstand, Tank, Preis) bleiben metrisch |
| Demo-Fahrt | gebaut |
| Motorwerte | gebaut |
| Einstellungen | gebaut nach Mock; wirksam sind Sprache, Design, Fahrzeug und Datensicherung |
| Fahrtenbuch | zeichnet automatisch auf (OBD, sonst GPS), Monate, Summen, Karte, CSV, Eco-Tipps; im Auto ungetestet |
| Wartung | gebaut: Intervalle, eigene Einträge, MFK, Vignette, Hinweis beim Start, Punkt im Dock; Kilometerstand zählt bei OBD mit, im Auto ungetestet |
| Gerätetest | gebaut: prüft Gerät, Sensoren, Plugins, Dienste und Keys; Bericht ohne Keys und Standort teilbar |
| Hintergrund | gebaut: Standort läuft bei OBD oder aktiver Route weiter, abschaltbar; am Gerät ungetestet |
| OSM-Karte ohne Netz | gebaut: geladene Gebiete und gespeicherte Routen; am Tablet ungetestet |
| Gespeicherte Ziele ohne Netz | gebaut; am Tablet ungetestet |
| Route ohne Netz | gebaut: auf dem Gerät aus gespeicherten Karten gerechnet, ohne Abbiegeverbote und Verkehr; am Tablet ungetestet |
| OBD über WLAN und MFi | gebaut mit eigenem Plugin; nicht kompiliert, nicht getestet |
| Karte und Navigation | gebaut: Suche, Route, Führung, Ansagen, Verkehr, Wetter auf der Route, Routenübersicht, Route offline speichern; natives Mapbox-SDK ungetestet |
| 3D-Ansicht | gebaut: vier Umgebungen (Luftbild, Schlicht, Mapbox, Google), vier Kameras, Route; Gelände, Gebäude und Bäume von swisstopo, Himmel nach Tageszeit, Schatten, Fassaden, Strassendetails, alles einzeln schaltbar; Google und Tablet ungeprüft |
| Suche | Vorschläge beim Tippen, Spracheingabe, Zuhause, Arbeit, letzte Ziele, parkiertes Auto |
| Parkplatz | gebaut: merken (von Hand oder nach OBD-Fahrt), Karte, Rückweg, Notiz, Parkuhr mit Ansage und Mitteilung, QR-Code fürs Handy, Parkplätze am Ziel; Mitteilungen am Gerät ungetestet |
| KI-Copilot | gebaut: Fragen mit Fahrzeugdaten, Sprache; mit echtem Key ungetestet |
| Unterhaltung | Begleiter, Plaudern, Fakten, Quiz; Dialog oder Monolog; im Auto ungetestet |
| Kleine Bildschirme (Breite < 860 oder Höhe < 400) | Bereiche und «Wohin» als schwebende Knöpfe; auf dem Gerät ungetestet |
| 3D-Ansicht | ganz ausblendbar |
| Zu schnell | Tempo gelb ab 4, rot ab 10 km/h über dem Limit (OpenStreetMap), mit Differenz; im Auto ungetestet |
| Unterhaltungsmodus | gebaut: Plaudern, Fakten zur Route (ohne Key), Quiz; Fahrzeugwarnungen unterbrechen noch nicht, weil nicht portiert |
| Tank und Tankstellen | gebaut: Füllstand (Sensor oder gezählt), Reichweite, Kosten, Tankstellen in der Nähe und auf der Route, Warnung unter 80 km; Zählung im Auto ungetestet, keine Preise |
| Kartenansicht | drei Zustände: frei, hinter dem Pfeil, Norden oben; Zoom frei wählbar |
| Musik | gebaut: Apple Music (iPad, ungetestet), YouTube und YouTube-Music-Links; jede andere App über das ESP32-Modul mit Anleitung (ungetestet) |

## Offen, technisch

- Zum Schluss: realistischeres Automodell
- Demo: nur in Entwicklungs-Builds; `?demo` und `fault=cool\|volt\|fuel\|mil`
- Schweizer Verkehrsmeldungen (opentransportdata.swiss): liefern keine Koordinaten, nur TMC-Ortscodes. Nötig sind ein API-Key und die TMC-Ortstabelle, die das ASTRA auf Anfrage abgibt (verkehrsdaten-plattform@astra.admin.ch). Vorher ist ein Proxy nicht sinnvoll
- Mapbox Navigation SDK für Routen ohne Netz auf der Mapbox-Karte: nach dem ersten iOS-Build (entschieden 24.11.2026)
- Freie Ortssuche ohne Netz
- Aus dem Mock fehlen in den Einstellungen: aktueller Tankstand, Vollgetankt
- Startpaket liegt knapp über der Warngrenze von 800 kB
