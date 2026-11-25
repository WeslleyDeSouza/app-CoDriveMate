import { Routes } from '@angular/router';

export default [
  { path: '', loadComponent: () => import('./feature/light-page').then((m) => m.LightPage) },
] satisfies Routes;
