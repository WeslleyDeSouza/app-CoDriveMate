import { Routes } from '@angular/router';

export default [
  { path: '', loadComponent: () => import('./feature/copilot-page').then((m) => m.CopilotPage) },
] satisfies Routes;
