import { Routes } from '@angular/router';
import { ProbeSource } from './domain/selftest';
import { DeviceProbes } from './infrastructure/device-probes';

export default [
  {
    path: '',
    providers: [{ provide: ProbeSource, useClass: DeviceProbes }],
    loadComponent: () => import('./feature/selftest-page').then((m) => m.SelftestPage),
  },
] satisfies Routes;
