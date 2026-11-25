// Translates public/assets/locales/de into the other languages: npm run translate
// Needs AI_API_KEY in .env (OpenAI, see @transmart/cli). Languages must match
// APP_LANGUAGES in src/app/core/i18n/index.ts.
require('dotenv').config({ quiet: true });

module.exports = {
  baseLocale: 'de',
  locales: ['en'],
  localePath: './public/assets/locales/',
  openAIApiKey: process.env['AI_API_KEY'] || process.env['OPENAI_API_KEY'],
  overrides: {},
  context: 'Car cockpit app on a tablet: short labels, glanceable while driving',
};
