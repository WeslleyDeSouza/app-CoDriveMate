import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideBluetooth } from '@core/bluetooth';
import { provideDevice } from '@core/device';
import { provideHttp } from '@core/http';
import { provideI18n } from '@core/i18n';
import { provideCopilot } from '@domains/copilot';
import { provideFuel } from '@domains/fuel';
import { provideLighting } from '@domains/lighting';
import { provideLogbook } from '@domains/logbook';
import { provideMaintenance } from '@domains/maintenance';
import { provideMedia } from '@domains/media';
import { provideNavigation } from '@domains/navigation';
import { provideParking } from '@domains/parking';
import { provideRoad } from '@domains/road';
import { provideScene3d } from '@domains/scene3d';
import { provideSettings } from '@domains/settings';
import { provideTelemetry } from '@domains/telemetry';
import { routes } from './app.routes';

/** Locale files loaded at start: one per area, see public/assets/locales. */
const LOCALE_SECTIONS = [
  'app',
  'telemetry',
  'navigation',
  'scene3d',
  'media',
  'parking',
  'copilot',
  'fuel',
  'diagnostics',
  'road',
  'selftest',
  'lighting',
  'logbook',
  'maintenance',
  'settings',
];

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Hash URLs work the same in the browser, as a file and inside the native shells.
    provideRouter(routes, withHashLocation()),
    provideHttpClient(withInterceptorsFromDi()),
    provideI18n(LOCALE_SECTIONS),
    provideBluetooth(),
    provideHttp(),
    provideDevice(),
    // Domains: each wires its own ports to adapters.
    provideSettings(),
    provideTelemetry(),
    provideNavigation(),
    provideScene3d(),
    provideMedia(),
    provideRoad(),
    provideLighting(),
    provideFuel(),
    provideParking(),
    provideCopilot(),
    provideLogbook(),
    provideMaintenance(),
  ],
};
