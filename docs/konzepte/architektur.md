# Architektur

Stand: 24.11.2026.

Modular nach Fachbereichen (DDD). Jeder Bereich unter `src/app/domains/` hat die
Schichten `domain` (reine Regeln und Ports), `application` (Stores),
`infrastructure` (Adapter) und `feature` (Oberfläche). Die verbindlichen Regeln
stehen in `CLAUDE.md`; `npm run lint` prüft sie.

## Neuer Bereich

1. Ordner mit den vier Schichten und `index.ts` anlegen.
2. Logik aus `_index.html` mit Tests nach `domain/` übertragen.
3. `<name>.providers.ts` in `app.config.ts` eintragen.
4. Route in `app.routes.ts`, Eintrag in `shell/dock.ts`, Textdatei pro Sprache.

## Performance

- Zoneless mit Signals und `OnPush`; ein neuer Messwert-Stand wird nur
  veröffentlicht, wenn sich ein Wert geändert hat.
- Jeder Bereich lädt erst beim Öffnen. Schwere Bibliotheken (Karte, three.js)
  gehören in Lazy-Chunks, nie ins Startpaket.
- Startpaket: Warnung ab 700 kB, Fehler ab 1 MB (roh). Davon sind rund 250 kB
  das Stylesheet der Tabler-Icons. Es auf die benutzten Icons zu verkleinern
  ist der nächste grosse Hebel.

## Tests der Oberfläche

Jede fertige Ansicht hat eine `*.spec.ts` neben der Komponente. Die Tests
bedienen die Ansicht über das DOM (Eingabe ändern, Knopf drücken) und prüfen,
was angezeigt und was gespeichert wird. Ports werden durch einfache Speicher im
Arbeitsspeicher ersetzt, die Stores laufen echt mit.

- Elemente werden nur über `data-section-test` gefunden: `hook`, `hooks`,
  `findHook` und `textOf` aus `@shared/testing`.
- Texte: `provideI18nTesting()` aus `@core/i18n/testing` liefert jeden Schlüssel
  unverändert zurück. Geprüft wird der Schlüssel, nicht der deutsche Text.
- Fahrzeugdaten: `telemetryTesting()` aus `@domains/telemetry/testing` stellt den
  echten `TelemetryStore` auf zwei steuerbare Quellen (`emit`, `end`,
  `startResult`). Tests ausserhalb des Bereichs dürfen nur diese Datei direkt
  importieren (Ausnahme in `eslint.config.js`).
