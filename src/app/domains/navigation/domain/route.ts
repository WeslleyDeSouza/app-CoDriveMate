import { Coordinate, Polyline } from './geo';
import { TripPurpose } from './planned-trips';

export type ProviderId = 'mapbox' | 'google' | 'osm';

export interface Maneuver {
  readonly type: string;
  readonly modifier: string;
  /** roundabout exit number */
  readonly exit: number | null;
}

export interface RouteStep {
  readonly maneuver: Maneuver;
  readonly street: string;
  /** metres from the start of the route */
  readonly alongM: number;
  /** finished instruction, if the provider has one */
  readonly text?: string;
}

export interface Congestion {
  readonly level: 'slow' | 'jam';
  readonly points: readonly Coordinate[];
}

export interface Route {
  readonly provider: ProviderId;
  readonly line: Polyline;
  readonly durationS: number;
  /** part of the duration caused by traffic */
  readonly delayS: number;
  readonly steps: readonly RouteStep[];
  readonly congestion: readonly Congestion[];
}

export interface Place {
  readonly name: string;
  readonly detail: string;
  readonly coordinate: Coordinate;
  /** who found it */
  readonly source?: ProviderId;
  /** why the driver goes there, if it was planned */
  readonly purpose?: TripPurpose;
}

/** The service refused the key; using it again is pointless until it changes. */
export class KeyRejectedError extends Error {
  constructor(readonly providerId: ProviderId) {
    super(`Key rejected by "${providerId}"`);
    this.name = 'KeyRejectedError';
  }
}

export class NoRouteError extends Error {
  constructor() {
    super('No route found.');
    this.name = 'NoRouteError';
  }
}
