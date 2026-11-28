import { Provider } from '@angular/core';
import { ASSISTANT_TOOLS } from '@core/assistant';
import { LEGACY_MIGRATIONS } from '@core/storage';
import { destinationTool, planTripTool } from './application/navigation.tools';
import { OFFLINE_SAVERS } from './application/route-extras.store';
import { WeatherSource } from './domain/weather';
import { MapboxOfflineSaver } from './infrastructure/mapbox-offline.saver';
import { OfmOfflineSaver } from './infrastructure/ofm-offline.saver';
import { OpenMeteoSource } from './infrastructure/open-meteo.source';
import { GOOGLE_SERVICE, MAPBOX_SERVICE, OFFLINE_SERVICE, OSM_SERVICE } from './application/tokens';
import { MapSurfaceFactory, NavigationRepository, PositionSource } from './domain/ports';
import { RoadSource } from './domain/road-match';
import { CapacitorPositionSource } from './infrastructure/capacitor-position.source';
import { TileRoadSource } from './infrastructure/tile-road.source';
import {
  IdbNavigationRepository,
  navigationLegacyMigration,
} from './infrastructure/idb-navigation.repository';
import { GoogleNavigationService } from './infrastructure/google-service';
import { DefaultMapSurfaceFactory } from './infrastructure/map-surface.factory';
import {
  MapboxNavigationService,
  OsmNavigationService,
} from './infrastructure/navigation-services';
import { OfflineRoutingService } from './infrastructure/offline-routing.service';

export function provideNavigation(): Provider[] {
  return [
    { provide: WeatherSource, useClass: OpenMeteoSource },
    { provide: OFFLINE_SAVERS, useClass: MapboxOfflineSaver, multi: true },
    { provide: OFFLINE_SAVERS, useClass: OfmOfflineSaver, multi: true },
    { provide: PositionSource, useClass: CapacitorPositionSource },
    { provide: RoadSource, useClass: TileRoadSource },
    { provide: NavigationRepository, useClass: IdbNavigationRepository },
    { provide: MapSurfaceFactory, useClass: DefaultMapSurfaceFactory },
    { provide: MAPBOX_SERVICE, useClass: MapboxNavigationService },
    { provide: GOOGLE_SERVICE, useClass: GoogleNavigationService },
    { provide: OSM_SERVICE, useClass: OsmNavigationService },
    { provide: OFFLINE_SERVICE, useClass: OfflineRoutingService },
    { provide: LEGACY_MIGRATIONS, useValue: navigationLegacyMigration, multi: true },
    { provide: ASSISTANT_TOOLS, useFactory: destinationTool, multi: true },
    { provide: ASSISTANT_TOOLS, useFactory: planTripTool, multi: true },
  ];
}
