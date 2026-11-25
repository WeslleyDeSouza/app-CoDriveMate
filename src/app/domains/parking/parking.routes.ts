import { Routes } from '@angular/router';

export default [
  { path: '', loadComponent: () => import('./feature/parking-page').then((m) => m.ParkingPage) },
] satisfies Routes;
