# KI-Copilot und Unterhaltung

Stand: 24.11.2026. Im Browser geprüft: «Fakten zur Route». **Nicht geprüft:** Antworten
mit echtem Anthropic-Key, Spracheingabe, iPad.

## Copilot

Anthropic-SDK (`@anthropic-ai/sdk`), geladen erst bei der ersten Frage, über den
HTTP-Port. Modell und Key aus den Einstellungen, oder eigener Proxy (`proxyUrl`, nur Claude). ChatGPT läuft
über die Responses API mit `store: false` (Modelle laut developers.openai.com, 24.11.2026); der
Anbieter folgt aus dem Modell. Bei
Sonnet und Opus ist der serverseitige Ersatz bei Fehlalarm der Filter eingeschaltet
(`fallbacks: default`). Gesendet wird nur, was in CLAUDE.md unter «Privacy» steht; nie
Koordinaten. Verkehrsmeldungen, Tempolimit, Aussentemperatur und Fehlercodes fehlen, weil
diese Bereiche nicht portiert sind.

Beide Prompts verbieten Hinweise auf Kontrollen und Blitzer.

## Werkzeuge (Copilot handelt)

Jede Domain bringt ihre Werkzeuge selbst mit (`ASSISTANT_TOOLS` in `core/assistant`,
Multi-Provider in `<domain>.providers.ts`); der Copilot kennt die Domains nicht.

| Werkzeug | Domain | Was es tut | Bestätigung |
|---|---|---|---|
| `set_destination` | navigation | Ort suchen, Route starten | ja: «Route nach X starten?», per Stimme oder Antippen (12 s, sonst nein) |
| `find_fuel` | fuel | Tankstellen entlang der Route oder in der Nähe, auf der Karte | nein |
| `set_light_scene` | lighting | Lichtszene; beim Fahren bleibt die Dimmung | nein |
| `remember_parking` | parking | Parkplatz hier merken | nein |

Die Schleife (Werkzeug, Ergebnis, Antwort) läuft im Adapter, höchstens 4 Runden; in der
letzten muss das Modell in Worten antworten. OpenAI bekommt ohne Speicherung nur die
Aufrufe und Ergebnisse zurück, nicht das Denken. Die Werkzeuge gibt es bei Fragen im
Copilot und beim Plaudern im Unterhaltungsmodus.

Datenschutz: Schalter «Copilot darf handeln» unter Einstellungen > Datenschutz (Vorgabe
ein). Ergebnisse gehen an den KI-Anbieter: Ortsnamen und Adressen aus der Suche, Namen,
Adressen und Distanzen von Tankstellen, Reichweite, Namen der Lichtszenen. Nie
Koordinaten oder Strecken. Blitzer und Kontrollen sind im Hinweis an das Modell
ausgeschlossen. Mit echtem Key und im Auto ungetestet.

## Unterhaltung

| Modus | Quelle | Key nötig |
|---|---|---|
| Begleiter zur Fahrt | Auf dem Gerät: Tank, Pause, kalter Motor, Bremsen, Beschleunigen, Drehzahl, Leerlauf; übliches Ziel | nein |
| Tipps | Auf dem Gerät: zur Fahrt (kalter Motor, knappe Bremsungen, kräftiges Anfahren, Pause, ruhiger oder unruhiger als sonst), sonst allgemeine Tipps | nein (mit Key umformuliert) |
| Eco | Auf dem Gerät: Eco-Score und Verbrauch im Vergleich mit früheren Fahrten, Drehzahl, Leerlauf, sonst allgemeine Spartipps | nein (mit Key umformuliert) |
| Plaudern | Sprachmodell mit wechselnden Themen, hört bis 6-mal zu | ja |
| Fakten zur Route | Wikipedia, 10 km Umkreis | nein (mit Key umformuliert) |
| Quiz | Anthropic, Antwort per Stimme oder Tippen | ja |

Still 20 Sekunden vor einem Manöver (300 bis 700 m, je nach Tempo aus OBD oder GPS; fest 700 m
hiess in der Stadt: nie), während anderer Ansagen und im Hintergrund. Ein Tipp
auf den Knopf über der Karte oder «Stopp» beendet. Wikipedia erhält den Ort auf drei
Nachkommastellen (rund 100 m).

**Dialog oder Monolog** (Einstellung `ai.talkStyle`): Im Monolog wird nur erzählt
(5 bis 8 Sätze), das Mikrofon bleibt aus und es gibt kein Quiz. Kommt ein Manöver
nahe oder eine Warnung, bricht die laufende Erzählung ab.

**Wie oft** (Einstellung `ai.talkPace`): wenig, mittel (Vorgabe), viel; Faktor 1.5, 0.6 und 0.2
auf alle Pausen. Wurde etwas unterbrochen, geht es nach höchstens 15 Sekunden weiter. «Viel»
braucht entsprechend mehr Anfragen ans Sprachmodell.

**Begleiter:** Jede Bemerkung kommt höchstens einmal pro Fahrt. Wo gebremst wurde, ist
nicht bekannt (keine Ampeln). Das übliche Ziel braucht mindestens drei Fahrten vom
gleichen Ort (300 m), zur gleichen Zeit (±90 Min.) und Art von Tag (Werktag,
Wochenende); die Route startet nur nach einem klaren Ja. Diese Sätze gehen nicht ans
Sprachmodell; mit gewählter Cloud-Stimme geht der gesprochene Text an deren Anbieter.
Ungetestet im Auto.

**Tipps und Eco:** Jeder Hinweis kommt höchstens einmal pro Fahrt, dann 3 Minuten Pause
(mal Faktor «Wie oft»). Vergleiche brauchen mindestens 5 km der laufenden Fahrt und drei
frühere Fahrten ab 3 km (die letzten 30; Demo-Fahrten nur mit Demo-Fahrten). Gerechnet wird
immer auf dem Gerät (`domain/coach.ts`). Die Einstellung `ai.shareTrips` (Vorgabe aus,
Schalter unter Einstellungen > Datenschutz) entscheidet, ob Durchschnitte der früheren Fahrten (Eco-Score,
Verbrauch, harte Bremsungen und Beschleunigungen pro 10 km) ans Sprachmodell gehen. Aus:
Vergleichssätze werden fest gesprochen, nur die übrigen Tipps formuliert das Modell um.
Strecken, Orte und einzelne Fahrten gehen nie mit.

**Nach einer harten Bremsung** (jeder eingeschaltete Modus): 4 Sekunden später ein lockerer
Spruch, höchstens alle 3 Minuten, verworfen nach 30 Sekunden ohne ruhigen Moment. Mit Key
formuliert ihn das Modell (es erfährt nur, dass hart gebremst wurde), sonst einer von acht
festen Sprüchen. Im Auto ungetestet.

Mehrere Modi lassen sich zusammen einschalten; dann wechseln sie zufällig, nie zweimal
hintereinander derselbe.

## Gedächtnis

`domain/memory.ts`, gespeichert unter `copilot/memory` (nur auf dem Gerät und in der
Datensicherung). Nach vier Antworten oder beim Beenden sucht ein Aufruf höchstens drei
dauerhafte Vorlieben; heikle Themen, andere Personen und Orte sind im Prompt ausgeschlossen.
Höchstens 100 Notizen, die am längsten ungenutzten fallen weg. Pro Gespräch gehen höchstens
fünf passende (80 Wörter) mit der ersten Nachricht mit, der Systemprompt bleibt gleich.
Welche Themen beantwortet werden, zählt das Gerät selbst und gewichtet die Auswahl.
Gelernt wird nur im Dialog. Wer die App ohne «Beenden» schliesst, verliert höchstens drei
Antworten. Ansehen, löschen, abschalten: Copilot-Seite. Mit echtem Key ungetestet.

## Sprachvorrang

`SpeechOutput` kennt `nav` > `answer` > `talk`. Höheres unterbricht Tieferes sofort,
Gleiches wartet. Eine Ansage, die nie endet, wird nach 12 Sekunden (lange Texte 35) plus
0.15 Sekunden pro Zeichen abgebrochen, damit sie nicht alle weiteren blockiert.

## Ton auf iOS

`plugins/voice-native` spielt Cloud-Stimmen, spricht mit der Gerätestimme und hört zu. Die
Audiositzung stellt Musik anderer Apps leiser (`duckOthers`) und gibt sie eine halbe Sekunde
nach der Ansage wieder frei. Das Zuhören endet 1.6 Sekunden nach dem letzten Wort. Nach einer
Verbindungslücke werden abgelehnte Cloud-Stimmen neu versucht; Anfragen enden nach 60 Sekunden.
**Nicht kompiliert, am Gerät ungetestet.** Nicht abgedeckt: Musik in der eigenen App (YouTube)
und Android, dort entscheidet das System.

## Lizenzen

`@anthropic-ai/sdk` (Apache-2.0), `@capacitor-community/speech-recognition` (MIT),
`@capacitor/local-notifications` (MIT). Wikipedia-Texte: CC BY-SA,
nur vorgelesen und im Verlauf gezeigt; vor einer Veröffentlichung ist die Quellenangabe zu klären.
