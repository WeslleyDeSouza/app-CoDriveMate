import { EventEmitter, Provider } from '@angular/core';
import { TranslateService } from '@app-galaxy/translate-ui';

/**
 * Translation service for unit tests: loads nothing and returns every key
 * unchanged, so tests assert on keys and do not break when a text is reworded.
 */
export class FakeTranslateService {
  lang = 'de';
  didLoad = true;
  readonly languageChanged$ = new EventEmitter<unknown>();
  readonly sectionChanged$ = new EventEmitter<unknown>();

  translate(key: string): string {
    return key;
  }
}

/** Use in `TestBed.configureTestingModule({ providers: [...] })` of any component spec. */
export function provideI18nTesting(): Provider[] {
  return [{ provide: TranslateService, useClass: FakeTranslateService }];
}
