import { Routes } from '@angular/router';

/**
 * Every route renders in the side sheet of the shell; '' means sheet closed.
 * Each domain is loaded lazily through its own `<domain>.routes.ts`.
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', children: [] },
  { path: 'engine', loadChildren: () => import('@domains/telemetry/telemetry.routes') },
  {
    path: 'obd',
    loadComponent: () =>
      import('@domains/telemetry/feature/obd-setup-page').then((m) => m.ObdSetupPage),
  },
  {
    path: 'esp',
    loadComponent: () =>
      import('@domains/media/feature/esp-setup-page').then((m) => m.EspSetupPage),
  },
  { path: 'logbook', loadChildren: () => import('@domains/logbook/logbook.routes') },
  { path: 'maintenance', loadChildren: () => import('@domains/maintenance/maintenance.routes') },
  { path: 'settings', loadChildren: () => import('@domains/settings/settings.routes') },
  { path: 'selftest', loadChildren: () => import('@domains/selftest/selftest.routes') },
  // The map is always on the stage; this closes the sheet and focuses the search.
  { path: 'navigation', children: [] },
  {
    path: 'chart',
    loadComponent: () => import('@domains/telemetry/feature/chart-page').then((m) => m.ChartPage),
  },
  {
    path: 'diagnostics',
    loadChildren: () => import('@domains/diagnostics/diagnostics.routes'),
  },
  { path: 'copilot', loadChildren: () => import('@domains/copilot/copilot.routes') },
  { path: 'fuel', loadChildren: () => import('@domains/fuel/fuel.routes') },
  { path: 'parking', loadChildren: () => import('@domains/parking/parking.routes') },
  { path: 'media', loadChildren: () => import('@domains/media/media.routes') },
  { path: 'lighting', loadChildren: () => import('@domains/lighting/lighting.routes') },
  { path: '**', redirectTo: '' },
];
