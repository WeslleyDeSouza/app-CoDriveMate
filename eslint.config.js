// @ts-check
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

/** Architecture boundaries, see CLAUDE.md "Architecture". */
const DEEP_DOMAIN = {
  regex: '^@domains/[^/]+/.+',
  message: 'Import a domain only through its index.ts.',
};
const OTHER_DOMAIN_RELATIVE = {
  regex: '^\\.\\./\\.\\./',
  message: 'No relative imports out of a domain; use @domains/<name>.',
};
const BLE_PLUGIN = {
  regex: '^@capacitor-community/bluetooth-le',
  message: 'Use BleTransport from @core/bluetooth.',
};
const INFRASTRUCTURE = {
  regex: '/infrastructure/',
  message: 'Depend on a port, not on an adapter.',
};
const FEATURE = { regex: '/feature/', message: 'Only outer layers may use feature/.' };
const APPLICATION = { regex: '/application/', message: 'domain/ must not use application/.' };

const boundaries = (...patterns) => ({
  'no-restricted-imports': ['error', { patterns }],
});
const DOMAIN_BASE = [DEEP_DOMAIN, OTHER_DOMAIN_RELATIVE, BLE_PLUGIN];
const BROWSER_IO = ['fetch', 'indexedDB', 'localStorage', 'sessionStorage'];

module.exports = tseslint.config(
  { ignores: ['dist/', 'android/', 'ios/', 'node_modules/', '.angular/', 'tools/', 'plugins/', '*.js'] },
  {
    files: ['**/*.ts'],
    extends: [eslint.configs.recommended, tseslint.configs.recommended, angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    rules: {
      'no-undef': 'off',
      ...boundaries(DEEP_DOMAIN, BLE_PLUGIN),
    },
  },
  // Specs may use a domain's test doubles (@domains/<name>/testing).
  {
    files: ['src/app/**/*.spec.ts'],
    ignores: ['src/app/domains/**', 'src/app/core/**', 'src/app/shared/**'],
    rules: boundaries(BLE_PLUGIN, { ...DEEP_DOMAIN, regex: '^@domains/[^/]+/(?!testing$).+' }),
  },
  { files: ['src/app/app.routes.ts'], rules: boundaries(BLE_PLUGIN) },
  {
    // Specs outside a domain may use its test doubles (`<domain>/testing.ts`).
    files: ['src/app/*.spec.ts', 'src/app/shell/**/*.spec.ts'],
    rules: boundaries({ ...DEEP_DOMAIN, regex: '^@domains/[^/]+/(?!testing$).+' }, BLE_PLUGIN),
  },
  {
    files: ['src/app/core/**/*.ts', 'src/app/shared/**/*.ts'],
    rules: boundaries({ regex: '^@(domains|shell)/', message: 'core/ and shared/ know no domains.' }),
  },
  {
    files: ['src/app/domains/**/*.ts'],
    rules: boundaries(...DOMAIN_BASE),
  },
  {
    files: ['src/app/domains/*/domain/**/*.ts'],
    rules: {
      ...boundaries(...DOMAIN_BASE, INFRASTRUCTURE, FEATURE, APPLICATION, {
        regex: '^(@angular|@capacitor|@core|@domains|@shell|@shared/ui|idb)',
        message: 'domain/ is framework-free.',
      }),
      'no-restricted-globals': ['error', ...BROWSER_IO, 'window', 'document', 'navigator'],
    },
  },
  {
    files: ['src/app/domains/*/application/**/*.ts'],
    rules: {
      ...boundaries(...DOMAIN_BASE, INFRASTRUCTURE, FEATURE),
      'no-restricted-globals': ['error', ...BROWSER_IO],
    },
  },
  {
    files: ['src/app/domains/*/feature/**/*.ts'],
    rules: {
      ...boundaries(...DOMAIN_BASE, INFRASTRUCTURE),
      'no-restricted-globals': ['error', ...BROWSER_IO],
    },
  },
  {
    files: [
      'src/app/domains/*/{feature,application}/**/*.spec.ts',
      'src/app/domains/*/testing.ts',
    ],
    rules: boundaries(
      { ...DEEP_DOMAIN, regex: '^@domains/[^/]+/(?!testing$).+' },
      OTHER_DOMAIN_RELATIVE,
      BLE_PLUGIN,
      INFRASTRUCTURE,
    ),
  },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
  },
);
