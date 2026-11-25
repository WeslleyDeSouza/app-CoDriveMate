import { Routes } from '@angular/router';

export default [
  {
    path: '',
    loadComponent: () => import('./feature/maintenance-page').then((m) => m.MaintenancePage),
  },
] satisfies Routes;
