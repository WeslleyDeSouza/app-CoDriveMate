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

## Unterhaltung

| Modus | Quelle | Key nötig |
|---|---|---|
| Begleiter zur Fahrt | Auf dem Gerät: Tank, Pause, kalter Motor, Bremsen, Beschleunigen, Drehzahl, Leerlauf; übliches Ziel | nein |
| Plaudern | Sprachmodell mit wechselnden Themen, hört bis 6-mal zu | ja |
| Fakten zur Route | Wikipedia, 10 km Umkreis | nein (mit Key umformuliert) |
| Quiz | Anthropic, Antwort per Stimme oder Tippen | ja |

Still unter 700 m vor einem Manöver, während anderer Ansagen und im Hintergrund. Ein Tipp
auf den Knopf über der Karte oder «Stopp» beendet. Wikipedia erhält den Ort auf drei
Nachkommastellen (rund 100 m).

**Dialog oder Monolog** (Einstellung `ai.talkStyle`): Im Monolog wird nur erzählt
(4 bis 6 Sätze), das Mikrofon bleibt aus und es gibt kein Quiz. Kommt ein Manöver auf
700 m heran oder eine Warnung, bricht die laufende Erzählung ab.

**Begleiter:** Jede Bemerkung kommt höchstens einmal pro Fahrt. Wo gebremst wurde, ist
nicht bekannt (keine Ampeln). Das übliche Ziel braucht mindestens drei Fahrten vom
gleichen Ort (300 m), zur gleichen Zeit (±90 Min.) und Art von Tag (Werktag,
Wochenende); die Route startet nur nach einem klaren Ja. Diese Sätze gehen nicht ans
Sprachmodell; mit gewählter Cloud-Stimme geht der gesprochene Text an deren Anbieter.
Ungetestet im Auto.

Mehrere Modi lassen sich zusammen einschalten; dann wechseln sie zufällig, nie zweimal
hintereinander derselbe.

## Sprachvorrang

`SpeechOutput` kennt `nav` > `answer` > `talk`. Höheres unterbricht Tieferes sofort,
Gleiches wartet.

## Lizenzen

`@anthropic-ai/sdk` (Apache-2.0), `@capacitor-community/speech-recognition` (MIT),
`@capacitor/local-notifications` (MIT). Wikipedia-Texte: CC BY-SA,
nur vorgelesen und im Verlauf gezeigt; vor einer Veröffentlichung ist die Quellenangabe zu klären.
