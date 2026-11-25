import { Routes } from '@angular/router';

export default [
  { path: '', loadComponent: () => import('./feature/media-page').then((m) => m.MediaPage) },
] satisfies Routes;
