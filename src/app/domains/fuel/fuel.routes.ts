import { Routes } from '@angular/router';

export default [
  { path: '', loadComponent: () => import('./feature/fuel-page').then((m) => m.FuelPage) },
] satisfies Routes;
