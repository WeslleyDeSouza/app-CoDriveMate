# Funktionsübersicht

Stand: 24.11.2026. Nichts davon ist im echten Auto oder am echten Adapter getestet.

| Bereich | Stand |
|---|---|
| Cockpit | Tempo, Gang, Tempolimit, Trip, Schnitt, Verbrauch, Kühlmittel, Batterie, Reichweite; Kacheln färben sich bei Warnungen |
| Fahrzeugwarnungen | gebaut wie im Prototyp: Temperatur, Ladespannung, Reichweite, Motorkontrollleuchte; Karte, Ansage, «Verstanden» |
| Diagnose | gebaut: Fehlercodes lesen, im Stand löschen, KI fragen; am Auto ungetestet |
| Verlauf | gebaut: sechs Werte live, pro Fahrt, und Fahrten im Vergleich nach Tag, Woche, Monat; im Auto ungetestet |
| Gefahrenhinweise, Tempolimit | gebaut aus OpenStreetMap (Overpass, oft überlastet); nie Kontrollen |
| Verkehrsmeldungen | TomTom mit Key; Schweizer Meldungen: siehe «Offen»; ungetestet |
| Innenlicht | gebaut nach dem Protokoll des Prototyps; am Modul ungetestet |
| Google-Karte | gebaut; ohne Key ungetestet |
| Stimme (Gerät, Google, OpenAI, ElevenLabs) | in den Einstellungen wählbar; stellt auf iOS Musik leiser (`voice-native`, nicht kompiliert); mit Keys und auf dem Gerät ungetestet |
| OBD2 über BLE | Assistent mit Geräteliste in der App («Passt vermutlich»), Verbindungstest, automatisch verbinden und wiederverbinden; am 28.11.2026 im Auto verbunden und Werte gelesen (Vgate, iPad), Wiederverbinden und die schnellere Abfrage (`010C1`) ungetestet |
| Einheiten | Distanz, Temperatur, Verbrauch, Volumen, Druck; Eingaben (Kilometerstand, Tank, Preis) bleiben metrisch |
| Demo-Fahrt | gebaut |
| Motorwerte | gebaut |
| Einstellungen | gebaut nach Mock; wirksam sind Sprache, Design, Fahrzeug und Datensicherung |
| Fahrtenbuch | zeichnet automatisch auf (OBD, sonst GPS), Monate, Summen, Karte, CSV, Eco-Tipps; zeigt geplante und gespeicherte Fahrten; im Auto ungetestet |
| Wartung | gebaut: Intervalle, eigene Einträge, MFK, Vignette, Hinweis beim Start, Punkt im Dock; Kilometerstand zählt bei OBD mit, im Auto ungetestet |
| Gerätetest | gebaut: prüft Gerät, Sensoren, Plugins, Dienste und Keys; Bericht ohne Keys und Standort teilbar |
| Daten auslesen | gebaut (Einstellungen): OBD, ESP32 (letzte 120 Bluetooth-Pakete je Modul) und 3D-Zustand als JSON zum Kopieren; die letzte Auslesung je Modul bleibt mit Datum gespeichert (kein Verlauf, `kv` `selftest/readings`, in der Datensicherung); nur lesend (`domain/obd-report.ts`), ohne Fahrgestellnummer; OBD-Bericht am 28.11.2026 im Auto gelaufen, ESP32 und 3D am Gerät ungetestet |
| Standort schätzen | gebaut: fährt zwischen zwei Standortmeldungen mit der OBD-Geschwindigkeit weiter, setzt das Auto auf Route oder Strasse (gespeicherte OSM-Kacheln) und richtet es aus; für iPads ohne GPS; im Auto ungetestet |
| Dock | Leiste unten oder schwebender Knopf, auf grossen Bildschirmen einstellbar (Anzeige), auf kleinen immer der Knopf |
| Hintergrund | gebaut: Standort läuft bei OBD oder aktiver Route weiter, abschaltbar; am Gerät ungetestet |
| OSM-Karte ohne Netz | gebaut: geladene Gebiete und gespeicherte Routen; am Tablet ungetestet |
| Gespeicherte Ziele ohne Netz | gebaut; am Tablet ungetestet |
| Route ohne Netz | gebaut: auf dem Gerät aus gespeicherten Karten gerechnet, ohne Abbiegeverbote und Verkehr; am Tablet ungetestet |
| OBD über WLAN und MFi | gebaut mit eigenem Plugin; nicht kompiliert, nicht getestet |
| Karte und Navigation | gebaut: Suche, Route, Führung, Ansagen, Verkehr, Wetter auf der Route, Routenübersicht, Route offline speichern; natives Mapbox-SDK ungetestet |
| 3D-Ansicht | gebaut: vier Umgebungen (Luftbild, Schlicht, Mapbox, Google), vier Kameras, Route; Gelände, Gebäude und Bäume von swisstopo, Himmel nach Tageszeit, Schatten, Fassaden, Strassendetails, alles einzeln schaltbar; Google und Tablet ungeprüft |
| Suche | Vorschläge beim Tippen (Mapbox mit Geschäften, sonst OSM), sucht mit weniger Wörtern nach, wenn nichts gefunden wird, Spracheingabe, Zuhause, Arbeit, Favoriten, geplante und letzte Ziele, parkiertes Auto |
| Geplante Fahrten | gebaut: Ziel für später speichern mit Thema, Beschreibung, optionalem Tag und Favorit (Kalender-Symbol bei Suchresultat oder letztem Ziel); Liste in der Suche (heute und kommend) und im Fahrtenbuch («Geplant & gespeichert», alle, ändern, entfernen); Favoriten als Schnellwahl neben Zuhause/Arbeit. Per Sprache über den Copilot speichern («Merk dir das Hallenbad für Samstag, Schwimmen»), mit Bestätigung. Unterhaltung: bietet die Fahrt am geplanten Tag zu Fahrtbeginn an, bemerkt unterwegs einmal Thema und Notiz, Plaudern beginnt beim Thema, bei Ankunft ein passender Wunsch («Viel Spass beim Schwimmen»); ohne Key feste Sätze; im Auto ungetestet |
| Parkplatz | gebaut: merken (von Hand oder nach OBD-Fahrt), Karte, Rückweg, Notiz, Parkuhr mit Ansage und Mitteilung, QR-Code fürs Handy, Parkplätze am Ziel; Mitteilungen am Gerät ungetestet |
| Gewohnheiten | gebaut: erkennt wiederkehrende Fahrten aus dem Fahrtenbuch (gleicher Start und Ziel, Startzeit ±45 Min., mind. 3 Fahrten der letzten 8 Wochen, ab 5 Fahrten nach Wochentag); zur üblichen Zeit am üblichen Ort Karte «Wie immer nach X?» mit Fahrzeit, ein Tipp startet; Begleiter mit Spruch für frühe Fahrten; alles auf dem Gerät; nicht in der Demo (braucht echte Fahrten), im Auto ungetestet |
| KI-Copilot | gebaut: Fragen mit Fahrzeugdaten, Sprache; handelt mit Werkzeugen (Ziel setzen mit Bestätigung, Ziel für später speichern, Tankstellen, Lichtszene, Parkplatz), abschaltbar unter Datenschutz; mit echtem Key ungetestet |
| Unterhaltung | Begleiter, Tipps, Eco (mit Vergleich zu früheren Fahrten, an die KI nur wenn erlaubt), Spruch nach harter Bremsung, Plaudern, Fakten, Quiz; Rätsel beim Plaudern mit Bedenkzeit vor der Auflösung; Dialog oder Monolog; wenig, mittel oder viel; kurze Beiträge zwischen zwei Manövern, längere auf langen Strecken; «Vorrang» für bekannte Strecken (Abbiegeansagen und Gefahrenhinweise halten sie nicht zurück, Warnungen schon); merkt sich Vorlieben (abschaltbar) und was sie schon erzählt hat, auch von früheren Fahrten, damit sie sich nicht wiederholt; schlägt Auto, Route und Fahrtanalyse bei Bedarf selbst nach, statt sie mit jeder Nachricht zu bekommen ; drei wählbare Persönlichkeiten (Mia, Ruth, Juli); eigener Text «Über mich»; weiss, ob das Ziel Zuhause oder Arbeit ist; kennt die Ziele von heute mit Zweck und Aufenthalt, verbindet sie und fragt nach einem kurzen Aufenthalt, was los war; fragt beim nächsten Mal, wie es am geplanten Ziel war, und knüpft ans letzte Gespräch an; «Merk dir …» wird sofort gelernt, Widersprüche ersetzen Altes; wird von selbst stiller ohne Antwort; Knopf zum Dazwischenreden; Zeitvertreib im Stau; Tankstellen-Angebot bei leerem Tank; Briefing zu Fahrtbeginn (Verkehr, Fälliges) und Fazit bei Ankunft; Fortsetzungsgeschichte über mehrere Fahrten; Quiz-Punktestand bleibt; neue Werkzeuge Musik, Parkuhr, Wartung (alles mit Key ungetestet); im Auto ungetestet |
| Handys (unter 744 Breite, oder quer bis 500 Höhe); ab iPad mini Tablet-Ansicht; Tastatur schiebt die App auf iOS nicht mehr hoch (`@capacitor/keyboard` 8, MIT) | Bereiche und «Wohin» als schwebende Knöpfe; auf dem Gerät ungetestet |
| Anzeige links | 3D-Ansicht, runder Tacho (Tempo, Drehzahl, Gang, Limit), beides (ab 1100 × 700) oder ausgeblendet; Idee für später: Widgets selbst anordnen; im Auto ungetestet |
| Vorlesen | Navigation, Warnungen, Infos und Unterhaltung einzeln schaltbar; natürliche Stimmen lauter einstellbar (normal, lauter, sehr laut; auf dem Gerät ungetestet) |
| Zu schnell | Tempo gelb ab 4, rot ab 10 km/h über dem Limit (OpenStreetMap), mit Differenz; im Auto ungetestet |
| Unterhaltungsmodus | gebaut: Plaudern, Fakten zur Route (ohne Key), Quiz; Fahrzeugwarnungen unterbrechen noch nicht, weil nicht portiert |
| Tank und Tankstellen | gebaut: Füllstand (Sensor oder gezählt), Reichweite, Kosten, Tankstellen in der Nähe und auf der Route, Warnung unter 80 km; Zählung im Auto ungetestet, keine Preise |
| Kartenansicht | drei Zustände: frei, hinter dem Pfeil, Norden oben; Zoom frei wählbar; Fahrtinfo einklappbar (nur Ankunft und Restzeit, gemerkt); «Route offline speichern» nach 20 s ausgeblendet, Wetter nach 20 s ausgeblendet und alle 10 Min. oder bei Wetterwechsel kurz wieder da |
| Musik | gebaut: Apple Music (iPad, ungetestet), YouTube und YouTube-Music-Links; jede andere App über das ESP32-Modul mit Anleitung (ungetestet) |

## Offen, technisch

- Zum Schluss: realistischeres Automodell
- Demo: in Entwicklungs-Builds und im Demo-Build (`npm run build:demo`, Demo-Seite auf GitHub Pages); `?demo` und `fault=cool\|volt\|fuel\|mil`
- Schweizer Verkehrsmeldungen (opentransportdata.swiss): liefern keine Koordinaten, nur TMC-Ortscodes. Nötig sind ein API-Key und die TMC-Ortstabelle, die das ASTRA auf Anfrage abgibt (verkehrsdaten-plattform@astra.admin.ch). Vorher ist ein Proxy nicht sinnvoll
- Mapbox Navigation SDK für Routen ohne Netz auf der Mapbox-Karte: nach dem ersten iOS-Build (entschieden 24.11.2026)
- Freie Ortssuche ohne Netz
- Aus dem Mock fehlen in den Einstellungen: aktueller Tankstand, Vollgetankt
- Startpaket liegt knapp über der Warngrenze von 800 kB

## Ideen für später

Notiert am 26.11.2026, nicht gebaut und nicht geplant:

- **Auto als Willkommen:** Beim Einsteigen erkennt das iPad das Auto per BLE (OBD-Adapter oder Lichtmodul), startet das Cockpit, das Licht fährt eine Begrüssungsszene und der Copilot sagt Wetter und Verkehr zum üblichen Ziel an. Offen: Start im Hintergrund auf iOS (BLE-Wiederherstellung) und ob die App dafür offen sein muss.
- **Gewohnheiten, weiter:** Sprüche und Vorbereitung je Gewohnheit lernen (z.B. Wetter am Ziel, Parkplatz), mehrere Ziele pro Zeitfenster unterscheiden.
