import { EnvironmentProviders, Provider, inject, provideAppInitializer } from '@angular/core';
import { TranslatePipe, TranslateService, provideTranslate } from '@app-galaxy/translate-ui';

/**
 * The one place the app touches the translation library. Everything else
 * imports `TranslatePipe` / `TranslateService` from here.
 *
 * Texts live in `public/assets/locales/<lang>/<section>.locale.json`; every
 * file has one top-level key equal to its section name. German is the source
 * language, the other languages are generated with `npm run translate`.
 */
export { TranslatePipe, TranslateService };

export interface AppLanguage {
  readonly languageId: number;
  readonly name: string;
  readonly label: string;
  readonly flag: string;
}

export const APP_LANGUAGES: readonly AppLanguage[] = [
  { languageId: 1, name: 'de', label: 'Deutsch', flag: 'ch' },
  { languageId: 2, name: 'en', label: 'English', flag: 'us' },
];

/** @param sections locale files to load at start, e.g. ['app', 'telemetry'] */
export function provideI18n(sections: string[]): (Provider | EnvironmentProviders)[] {
  return [
    ...provideTranslate({
      initialLocalesFiles: sections,
      languages: APP_LANGUAGES.map(({ languageId, name, flag }) => ({ languageId, name, flag })),
    }),
    // Hold the first paint until the texts are there, so no raw keys flash.
    provideAppInitializer(async () => {
      const translate = inject(TranslateService);
      const deadline = Date.now() + 5000;
      while (!translate.didLoad && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
    }),
  ];
}
