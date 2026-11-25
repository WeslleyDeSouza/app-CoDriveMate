import { Provider } from '@angular/core';
import { LonLat, RoadData, RoadSource } from './domain/road';
import { Incident, TrafficSource } from './domain/traffic';

export class FakeRoadSource extends RoadSource {
  data: RoadData | null = null;
  readonly asked: LonLat[] = [];

  async load(cell: LonLat): Promise<RoadData | null> {
    this.asked.push(cell);
    return this.data;
  }
}

export class FakeTrafficSource extends TrafficSource {
  incidents: Incident[] | null = null;
  asked = 0;

  async around(): Promise<Incident[] | null> {
    this.asked++;
    return this.incidents;
  }
}

export function roadTesting() {
  const fakes = { road: new FakeRoadSource(), traffic: new FakeTrafficSource() };
  const providers: Provider[] = [
    { provide: RoadSource, useValue: fakes.road },
    { provide: TrafficSource, useValue: fakes.traffic },
  ];
  return { ...fakes, providers };
}
