import { Routes } from '@angular/router';

export default [
  {
    path: '',
    loadComponent: () => import('./feature/diagnostics-page').then((m) => m.DiagnosticsPage),
  },
] satisfies Routes;
