import { Routes } from '@angular/router';
import { ProbeSource } from './domain/selftest';
import { ReadingRepository } from './domain/readings';
import { DeviceProbes } from './infrastructure/device-probes';
import { IdbReadingRepository } from './infrastructure/idb-reading.repository';

export default [
  {
    path: '',
    providers: [{ provide: ProbeSource, useClass: DeviceProbes }],
    loadComponent: () => import('./feature/selftest-page').then((m) => m.SelftestPage),
  },
  {
    path: 'data',
    providers: [{ provide: ReadingRepository, useClass: IdbReadingRepository }],
    loadComponent: () => import('./feature/data-page').then((m) => m.DataPage),
  },
] satisfies Routes;
