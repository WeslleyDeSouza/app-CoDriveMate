import { Provider } from '@angular/core';
import {
  LightConnection,
  LightDevice,
  LightModule,
  LightRepository,
  LightSearch,
  LightState,
} from './domain/lighting';

export class FakeLightModule extends LightModule {
  readonly sent: Uint8Array[] = [];
  readonly searched: LightSearch[] = [];
  failure?: Error;
  drop: () => void = () => undefined;

  async choose(search: LightSearch): Promise<LightDevice> {
    this.searched.push(search);
    return { id: 'l1', name: 'Licht' };
  }
  async open(
    _device: LightDevice,
    _onState: (data: Uint8Array) => void,
    onClose: () => void,
  ): Promise<LightConnection> {
    if (this.failure) throw this.failure;
    this.drop = onClose;
    return {
      send: async (command) => void this.sent.push(command),
      close: async () => undefined,
    };
  }
}

export class FakeLightRepository extends LightRepository {
  state?: LightState;
  device?: LightDevice;

  async load(): Promise<LightState | undefined> {
    return this.state;
  }
  async save(state: LightState): Promise<void> {
    this.state = state;
  }
  async loadDevice(): Promise<LightDevice | undefined> {
    return this.device;
  }
  async saveDevice(device: LightDevice): Promise<void> {
    this.device = device;
  }
}

export function lightingTesting() {
  const fakes = { module: new FakeLightModule(), repository: new FakeLightRepository() };
  const providers: Provider[] = [
    { provide: LightModule, useValue: fakes.module },
    { provide: LightRepository, useValue: fakes.repository },
  ];
  return { ...fakes, providers };
}
