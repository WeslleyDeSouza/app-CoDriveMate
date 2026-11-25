import { Routes } from '@angular/router';

export default [
  { path: '', loadComponent: () => import('./feature/logbook-page').then((m) => m.LogbookPage) },
] satisfies Routes;
