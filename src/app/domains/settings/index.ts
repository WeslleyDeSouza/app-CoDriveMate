/** Public API of the settings domain. */
export { SettingsStore } from './application/settings.store';
export { aiAvailable, aiProvider, DEFAULT_SETTINGS } from './domain/settings';
export type { AppSettings, Theme } from './domain/settings';
export { provideSettings } from './settings.providers';
