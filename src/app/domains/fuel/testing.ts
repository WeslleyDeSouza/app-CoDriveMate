import { Provider } from '@angular/core';
import { LonLat, Station, StationSource } from './domain/stations';
import { TankRepository, TankState } from './domain/tank';

export class FakeStationSource extends StationSource {
  quick: Station[] | Error = [];
  details: Station[] | null = null;
  readonly asked: (readonly LonLat[])[] = [];

  async around(points: readonly LonLat[]): Promise<Station[]> {
    this.asked.push(points);
    if (this.quick instanceof Error) throw this.quick;
    return this.quick;
  }
  async detailed(): Promise<Station[] | null> {
    return this.details;
  }
}

export class FakeTankRepository extends TankRepository {
  state?: TankState;

  async load(): Promise<TankState | undefined> {
    return this.state;
  }
  async save(state: TankState): Promise<void> {
    this.state = state;
  }
}

export function fuelTesting() {
  const fakes = { source: new FakeStationSource(), tank: new FakeTankRepository() };
  const providers: Provider[] = [
    { provide: StationSource, useValue: fakes.source },
    { provide: TankRepository, useValue: fakes.tank },
  ];
  return { ...fakes, providers };
}
