import { Provider } from '@angular/core';
import { OFFLINE_SAVERS } from '@domains/navigation';
import { RoadOfflineSaver } from './application/road-offline';
import { RoadSource } from './domain/road';
import { TrafficSource } from './domain/traffic';
import { OsmRoadSource } from './infrastructure/osm-road.source';
import { OnlineTrafficSource } from './infrastructure/traffic.sources';

export function provideRoad(): Provider[] {
  return [
    { provide: OFFLINE_SAVERS, useClass: RoadOfflineSaver, multi: true },
    { provide: RoadSource, useClass: OsmRoadSource },
    { provide: TrafficSource, useClass: OnlineTrafficSource },
  ];
}
