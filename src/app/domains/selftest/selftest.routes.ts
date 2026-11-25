import { Routes } from '@angular/router';
import { ProbeSource } from './domain/selftest';
import { DeviceProbes } from './infrastructure/device-probes';

export default [
  {
    path: '',
    providers: [{ provide: ProbeSource, useClass: DeviceProbes }],
    loadComponent: () => import('./feature/selftest-page').then((m) => m.SelftestPage),
  },
  { path: 'data', loadComponent: () => import('./feature/data-page').then((m) => m.DataPage) },
] satisfies Routes;
