import { Routes } from '@angular/router';

export default [
  { path: '', loadComponent: () => import('./feature/settings-page').then((m) => m.SettingsPage) },
] satisfies Routes;
