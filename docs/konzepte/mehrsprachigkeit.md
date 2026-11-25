# Mehrsprachigkeit

Stand: 24.11.2026.

Wie in llumi mit `@app-galaxy/translate-ui`, eingebunden nur in `core/i18n`.
Deutsch ist die Quelle, Englisch ist vorhanden.

- Texte: `public/assets/locales/<sprache>/<bereich>.locale.json`
- Neuer Bereich: in `LOCALE_SECTIONS` (`app.config.ts`) eintragen
- Neue Sprache: `APP_LANGUAGES` (`core/i18n`) und `transmart.config.js`
- Übersetzen: `npm run translate`, braucht `AI_API_KEY` in `.env` (noch nicht ausgeführt)

Die Bibliothek nennt Angular 20 als Voraussetzung, das Projekt nutzt 22. Darum
steht `legacy-peer-deps` in der `.npmrc`.
