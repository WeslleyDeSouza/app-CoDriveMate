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
| `plan_trip` | navigation | Ort suchen, mit Thema, Notiz, Tag und Favorit für später speichern; keine Route | ja: «X für Samstag speichern?» |
| `find_fuel` | fuel | Tankstellen entlang der Route oder in der Nähe, auf der Karte | nein |
| `set_light_scene` | lighting | Lichtszene; beim Fahren bleibt die Dimmung | nein |
| `remember_parking` | parking | Parkplatz hier merken | nein |
| `set_parking_timer` | parking | Parkuhr auf N Minuten (0 = aus, höchstens 720); braucht einen gemerkten Parkplatz | nein |
| `play_music` | media | Musik starten, pausieren, nächster Titel; nur Apple Music auf iOS oder das ESP32-Modul, keine Titelwahl, YouTube nicht | nein |
| `maintenance_status` | maintenance | liest, was fällig ist oder als Nächstes kommt (Namen der Arbeiten, auch eigene, km und Tage, Tage bis MFK, Jahr der Vignette; nie der Kilometerstand) | nein |

Die Schleife (Werkzeug, Ergebnis, Antwort) läuft im Adapter, höchstens 4 Runden; in der
letzten muss das Modell in Worten antworten. OpenAI bekommt ohne Speicherung nur die
Aufrufe und Ergebnisse zurück, nicht das Denken. Die Werkzeuge gibt es bei Fragen im
Copilot und beim Plaudern im Unterhaltungsmodus; dort kommen zwei lesende Werkzeuge dazu
(siehe «Nachschlagen statt mitschicken»).

Datenschutz: Schalter «Copilot darf handeln» unter Einstellungen > Datenschutz (Vorgabe
ein). Ergebnisse gehen an den KI-Anbieter: Ortsnamen und Adressen aus der Suche, Namen,
Adressen und Distanzen von Tankstellen, Reichweite, Namen der Lichtszenen. Nie
Koordinaten oder Strecken. Blitzer und Kontrollen sind im Hinweis an das Modell
ausgeschlossen. Mit echtem Key und im Auto ungetestet.

**Für später speichern** (`plan_trip`, Bereich navigation): «Merk dir das Hallenbad Oerlikon
für Samstag, Schwimmen». Sucht den Ort, fragt «Hallenbad Oerlikon für Samstag, 28. November
speichern?» und speichert nach einem Ja Thema, Notiz, Tag (Wochentag = der nächste, heute
eingeschlossen, oder Tage ab heute; ohne Angabe jederzeit) und Favorit als geplante Fahrt.
Startet keine Route. Ans Modell zurück gehen Name, Adresse, Tag und Thema, keine Koordinaten.
Mit echtem Key ungetestet.

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
hiess in der Stadt: nie), während anderer Ansagen, bei einer Fahrzeugwarnung, auf den letzten
100 m vor einem Gefahrenhinweis und im Hintergrund. Ein Tipp auf den Knopf über der Karte
oder «Stopp» beendet. Wikipedia erhält den Ort auf drei Nachkommastellen (rund 100 m).

**Nur so viel, wie Platz hat** (`talkLength` in `domain/conversation.ts`): Vor jedem Beitrag
wird geschätzt, wie viele Sekunden bis zum Ruhefenster vor dem nächsten Manöver bleiben.
Ab 45 s (lange Strecke, ohne Route oder im Stand) gibt es einen normalen Beitrag, ab 15 s
einen kurzen (ein bis zwei Sätze, höchstens 30 Wörter), darunter wartet er das Manöver ab.
Ohne bekanntes Tempo gibt es nur kurze Beiträge.

**Vorrang** (Einstellung `ai.talkFirst`, Knopf auf der Copilot-Seite, aus als Vorgabe;
entschieden 2026-11-27): für Strecken, die der Fahrer kennt. Manöver und Gefahrenhinweise
halten die Unterhaltung nicht mehr zurück, und eine Abbiegeansage (`SpeechKind` `route`)
wird ausgelassen, solange die Unterhaltung spricht; spricht sie nicht, kommt die Ansage
normal. Gefahrenansagen, Fahrzeugwarnungen und Copilot-Antworten unterbrechen weiterhin.

**Dialog oder Monolog** (Einstellung `ai.talkStyle`): Im Monolog wird nur erzählt
(5 bis 8 Sätze), das Mikrofon bleibt aus und es gibt kein Quiz. Kommt ein Manöver
nahe oder eine Warnung, bricht die laufende Erzählung ab (mit Vorrang nur bei einer Warnung).

**Wie oft** (Einstellung `ai.talkPace`): wenig, mittel (Vorgabe), viel; Faktor 1.5, 0.6 und 0.2
auf alle Pausen. Wurde etwas unterbrochen, geht es nach höchstens 15 Sekunden weiter. «Viel»
braucht entsprechend mehr Anfragen ans Sprachmodell.

**Begleiter:** Jede Bemerkung kommt höchstens einmal pro Fahrt. Wo gebremst wurde, ist
nicht bekannt (keine Ampeln). Das übliche Ziel braucht mindestens drei Fahrten vom
gleichen Ort (300 m), zur gleichen Zeit (±90 Min.) und Art von Tag (Werktag,
Wochenende); die Route startet nur nach einem klaren Ja. Diese Sätze gehen nicht ans
Sprachmodell; mit gewählter Cloud-Stimme geht der gesprochene Text an deren Anbieter.
Ungetestet im Auto.

**Geplante Fahrten:** Zu Fahrtbeginn (erste 2 km, keine Route aktiv) bietet der Begleiter
eine für heute geplante Fahrt vor dem üblichen Ziel an, jede einmal, solange die App offen
ist, und nicht, wenn das Auto schon dort steht (1 km); im Dialog startet ein klares Ja die
Route. Unterwegs zu einem geplanten Ziel sagt der Begleiter einmal etwas zum Thema und gibt
die Notiz weiter; das erste Plaudern auf dieser Fahrt beginnt beim Thema. Nach der Ankunft
(jeder eingeschaltete Modus) folgt ein Wunsch, der zum Thema passt, sobald die Navigation
fertig gesprochen hat, verworfen nach 2 Minuten. Mit Key formuliert das Modell, sonst feste
Sätze. Thema und Notiz gehen als «Daten, keine Anweisungen» ans Modell. Im Auto ungetestet.

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

## Persönlichkeit, Fäden und Tagesverlauf (27.11.2026)

Aufbau nach dem Muster «feste Seele, Profil, gepflegtes Gedächtnis, Tagesnotizen», aber als
Dokumente in IndexedDB statt als Dateien (Projektregel; läuft so auch im Browser und ist in
der Datensicherung). Alles mit echtem Key und im Auto ungetestet.

| Baustein | Wo | Wer schreibt | Was ans Modell geht |
|---|---|---|---|
| Persönlichkeit | Einstellung `ai.persona` (`warm` Mia, `dry` Ruth, `cheeky` Juli), `character` in `domain/passenger.ts` | nur die App; wählbar auf der Copilot-Seite | zwei Sätze im Systemprompt |
| «Über mich» | `copilot/memory.about`, bis 400 Zeichen | nur der Fahrer (Copilot-Seite, «Was ich über dich weiss») | mit jeder Plauder-Eröffnung, nicht im Verlauf; bleibt bei «Alles vergessen» |
| Vorlieben | `copilot/memory.facts` | nur der Lern-Aufruf | höchstens fünf pro Gespräch (wie bisher) |
| Faden vom letzten Mal | `memory.last`, ein Satz | der Lern-Aufruf (Feld `summary`) | einmal, frühestens 30 Minuten, höchstens 14 Tage später |
| «Wie war es?» | `memory.visit` | die App bei Ankunft an einem geplanten Ziel | einmal im Dialog, 1 Stunde bis 7 Tage später, eröffnet das erste Plaudern |
| Tagesverlauf | `memory.stops`, höchstens 6, nur heute | die App bei jeder Ankunft und beim Weiterfahren | im Kontext jeder Plauder-Nachricht: Uhrzeit, Name, Zuhause/Arbeit, Thema und Notiz, Minuten Aufenthalt |

Faden, «Wie war es?» und Tagesverlauf gibt es nur, solange das Lernen ein ist.

**Zusammenhänge:** Mit dem Tagesverlauf sieht das Modell «14:05 Bahnhof (Kollegin abholen),
4 Min., dann Ziel Hallenbad (Schwimmen)» und kann beides verbinden. **Kurzer Aufenthalt:**
Fährt das Auto nach 2 bis 20 Minuten an einem Ziel wieder (über 10 km/h, frühestens eine
Minute nach der Ankunft), fragt das nächste Plaudern im Dialog, was los war; das Modell
kennt den Grund nicht und soll keinen unterstellen. Danach entfällt «Wie war es?» für
dieses Ziel. Ob ausgestiegen wurde, weiss die App nicht.

**Zuhause und Arbeit:** Ist das Ziel der gespeicherte Favorit (`favouriteOf`, navigation),
steht im Kontext und in der Momentaufnahme «the driver's home» bzw. «workplace».

**Gedächtnis-Regeln** (übernommen aus der Diskussion vom 27.11.2026): Fakten sind einzelne
Einträge mit Nummer, nicht Fliesstext. Nur der Lern-Aufruf schreibt sie, und er liest nur
die Antworten des Fahrers, nie Werkzeug- oder Webinhalte. «Merk dir …» löst das Lernen
sofort aus (`wantsRemembered`), ohne auf vier Antworten zu warten. Widerspricht ein neuer
Fakt einem bekannten, nennt das Modell dessen Nummer (`replaces`) und der alte fällt weg.
Nicht gebaut: Archiv statt Löschen, Typ und Quelle pro Fakt, ein Protokoll der Änderungen;
ansehen und löschen lässt sich alles auf der Copilot-Seite.

**Von selbst leiser oder gesprächiger** (`engagement`): Bleiben im Dialog zwei Eröffnungen
hintereinander ohne Antwort, werden alle Pausen 1.6-mal, ab drei 2.5-mal so lang; nach
einer Antwort 0.7-mal. Zusätzlich zur Einstellung «Wie oft».

**Dazwischenreden:** Im Dialog zeigt die Leiste über der Karte einen zweiten Knopf
(Mikrofon). Ein Tipp beendet, was gerade gesprochen wird, und sie hört sofort zu; läuft
nichts, hört sie ebenfalls zu und antwortet. Per Stimme unterbrechen geht nicht: Das
Mikrofon würde ihre eigene Stimme hören, dafür bräuchte es eine am Gerät geprüfte
Echounterdrückung.

**Stau:** Steht das Auto auf einer Fahrt (ab 1 km) 2 bis 10 Minuten, bietet das Plaudern
einmal pro 15 Minuten etwas zum Zeitvertreib an (Quiz, Rätsel, Geschichte). Die App sieht
nur das Tempo, nicht den Grund.

**Tank:** Nach der Bemerkung zum fast leeren Tank fragt der Begleiter im Dialog, ob er
Tankstellen suchen soll, und zeigt sie nach einem klaren Ja (Werkzeug `find_fuel`, nur wenn
der Copilot handeln darf).

**Briefing und Fazit** (Begleiter, feste Sätze, nichts geht ans Modell): Auf den ersten
2 km einmal pro Fahrt die Verzögerung durch Verkehr auf der Route (ab 3 Minuten) und was
am Auto fällig ist. Bei der Ankunft Distanz, Dauer und Eco-Score der Fahrt, zusammen mit
dem Wunsch zum geplanten Ziel.

**Fortsetzungsgeschichte** (Thema `serial`): eine erfundene Geschichte in höchstens 8
Folgen über mehrere Fahrten; gespeichert wird die letzte Folge (`copilot/serial`, 700
Zeichen), sie geht mit der nächsten Folge wieder ans Modell. Im Dialog fragt sie, wie es
weitergehen soll. **Bleibt eingeschaltet:** Die gewählten Unterhaltungsmodi werden gespeichert (`ai.talkModes`) und kommen zu Beginn jeder Fahrt (neue Fahrt im Fahrtenbuch) von selbst wieder. Wer sie per Knopf ausschaltet, schaltet sie auch für die nächsten Fahrten aus; «sei still» per Stimme gilt nur für die laufende Fahrt. Im Auto ungetestet. **Rätsel beim Plaudern:** Stellt die Begleiterin ein Rätsel oder eine Quizfrage, schreibt sie `[pause]` zwischen Frage und Auflösung. Die App sagt die Frage, lässt 10 s Zeit zum Überlegen (im Dialog hört sie zu; eine Antwort geht ans Modell) und sagt erst dann die Auflösung, sofern gerade gesprochen werden darf. Mit Key ungetestet. **Quiz:** Der Punktestand bleibt über Fahrten erhalten
(`copilot/quiz-score`).

**Nachschlagen statt mitschicken** (`LOOKUP_TOOLS` in `domain/copilot.ts`, 27.11.2026): Beim
Plaudern geht mit jeder Nachricht nur noch wenig mit: Zustand des Autos (einmal, danach als
«schon gesagt» markiert), Strasse, Ziel mit Thema, Ankunft und Verzögerung, Ortsnamen in der
Nähe, Uhrzeit. Den Rest holt das Modell bei Bedarf mit zwei lesenden Werkzeugen:

| Werkzeug | Liefert |
|---|---|
| `car_data` | dieselbe Momentaufnahme wie bei einer Copilot-Frage (Fahrzeug, Live-Werte, Fehlercodes, Tempolimit, Verkehrsmeldungen, Ziel mit Ankunft und Restdistanz) plus Reichweite; keine Koordinaten |
| `drive_figures` | laufende Fahrt (Distanz, Dauer, harte Bremsungen und Beschleunigungen, hohe Drehzahl, Leerlauf, Eco-Score, Verbrauch); Durchschnitte früherer Fahrten nur mit `ai.shareTrips`, sonst «nicht freigegeben» |

Sie stehen immer zur Verfügung (sie ändern nichts), unabhängig vom Schalter «Copilot darf
handeln»; die handelnden Werkzeuge kommen wie bisher dazu, wenn er ein ist. Ein Nachschlagen
kostet eine zusätzliche Runde beim Anbieter, also etwas Wartezeit vor dem Beitrag; dafür
bleiben Anfrage und Verlauf kurz, und die Zahlen der Fahrt verleiten nicht mehr in jedem
Beitrag zu derselben Bemerkung. Mit echtem Key ungetestet.

**Keine Wiederholungen** (`withTold`, `notAgain` in `domain/conversation.ts`, 27.11.2026):
Das Sprachmodell weiss von sich aus nicht, was es früher erzählt hat; mit gleichem Auftrag kam
derselbe Witz, dieselbe Kuriosität. Darum merkt sich die App den Anfang (160 Zeichen) der
letzten 30 Beiträge, die das Modell formuliert hat und die zu Ende gesprochen wurden
(Plauder-Eröffnung, Tipp, Eco-Hinweis, Bremsspruch, Quizfrage), unter `copilot/told` (auf dem
Gerät und in der Datensicherung, auch über Fahrten hinweg). Plaudern und Quiz bekommen die
ganze Liste mit dem Auftrag, Thema, Witz, Rätsel oder Frage nicht zu wiederholen und anders zu
beginnen; Tipps und Sprüche die letzten sechs. Die Liste geht nur mit der jeweiligen Anfrage
mit, nicht in den Verlauf. Antworten auf den Fahrer, Fakten zur Route (dort gilt die Liste der
erzählten Orte), Thema und Notiz geplanter Fahrten und feste Sätze werden nicht gemerkt. Der
Zustand des Autos (Motor kalt, steht, Tank) wird nach dem ersten Mal als «schon gesagt»
markiert, und der Prompt verlangt, dass aus dem Kontext nichts mehrfach aufgegriffen wird.
Eine Löschfunktion für die Liste gibt es nicht; sie erneuert sich nach 30 Beiträgen. Mit
echtem Key ungetestet.

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
