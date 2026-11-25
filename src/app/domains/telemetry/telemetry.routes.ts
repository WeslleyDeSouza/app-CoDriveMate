import { Routes } from '@angular/router';

export default [
  { path: '', loadComponent: () => import('./feature/engine-page').then((m) => m.EnginePage) },
] satisfies Routes;
