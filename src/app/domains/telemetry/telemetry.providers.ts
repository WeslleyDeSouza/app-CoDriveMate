import { EnvironmentProviders, Provider, inject, provideAppInitializer } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { ADAPTER_LINKS } from './application/adapter.store';
import { HistoryStore } from './application/history.store';
import {
  DEMO_TELEMETRY_SOURCE,
  OBD_TELEMETRY_SOURCE,
  TelemetryStore,
} from './application/telemetry.store';
import { AdapterRepository } from './domain/adapter';
import { BleAdapterLink, IdbAdapterRepository } from './infrastructure/ble-adapter.link';
import { DemoTelemetrySource } from './infrastructure/demo-telemetry.source';
import { ObdTelemetrySource } from './infrastructure/obd-telemetry.source';
import { MfiAdapterLink, TcpAdapterLink } from './infrastructure/serial-adapter.links';

/** Wires the telemetry ports to their adapters. */
export function provideTelemetry(): (Provider | EnvironmentProviders)[] {
  return [
    { provide: AdapterRepository, useClass: IdbAdapterRepository },
    { provide: ADAPTER_LINKS, useClass: BleAdapterLink, multi: true },
    // Browsers have no raw TCP; MFi accessories exist on iOS only.
    ...(Capacitor.isNativePlatform()
      ? [{ provide: ADAPTER_LINKS, useClass: TcpAdapterLink, multi: true }]
      : []),
    ...(Capacitor.getPlatform() === 'ios'
      ? [{ provide: ADAPTER_LINKS, useClass: MfiAdapterLink, multi: true }]
      : []),
    { provide: OBD_TELEMETRY_SOURCE, useClass: ObdTelemetrySource },
    { provide: DEMO_TELEMETRY_SOURCE, useClass: DemoTelemetrySource },
    // Runs beside the start of the app, does not delay it.
    provideAppInitializer(() => {
      const store = inject(TelemetryStore);
      inject(HistoryStore);
      const demo =
        store.demoEnabled && new URLSearchParams(globalThis.location?.search ?? '').has('demo');
      void (demo ? store.startDemo() : store.autoConnect());
    }),
  ];
}
