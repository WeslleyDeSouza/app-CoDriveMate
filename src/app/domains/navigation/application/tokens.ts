import { InjectionToken } from '@angular/core';
import { NavigationService } from '../domain/ports';

export const MAPBOX_SERVICE = new InjectionToken<NavigationService>('MAPBOX_SERVICE');
export const GOOGLE_SERVICE = new InjectionToken<NavigationService>('GOOGLE_SERVICE');
export const OSM_SERVICE = new InjectionToken<NavigationService>('OSM_SERVICE');
/** Routes on stored map data, without a network. */
export const OFFLINE_SERVICE = new InjectionToken<NavigationService>('OFFLINE_SERVICE');
