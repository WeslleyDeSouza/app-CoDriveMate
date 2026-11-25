import { Injectable, computed, inject, signal } from '@angular/core';
import {
  AppSettings,
  DEFAULT_SETTINGS,
  DeepPartial,
  SettingsRepository,
  mergeSettings,
} from '../domain/settings';

@Injectable({ providedIn: 'root' })
export class SettingsStore {
  private readonly repository = inject(SettingsRepository);
  private readonly _settings = signal<AppSettings>(DEFAULT_SETTINGS);
  private loaded?: Promise<void>;

  readonly settings = this._settings.asReadonly();
  readonly theme = computed(() => this._settings().theme);

  /** Loads the stored settings once; safe to call repeatedly. */
  load(): Promise<void> {
    this.loaded ??= this.repository
      .load()
      .then((stored) => this._settings.set(mergeSettings(DEFAULT_SETTINGS, stored)))
      .catch((error: unknown) => console.error('Loading settings failed', error));
    return this.loaded;
  }

  async update(patch: DeepPartial<AppSettings>): Promise<void> {
    await this.load();
    const next = mergeSettings(this._settings(), patch);
    this._settings.set(next);
    await this.repository.save(next);
  }
}
