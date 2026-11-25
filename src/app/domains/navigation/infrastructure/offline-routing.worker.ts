import { Coordinate } from '../domain/geo';
import { offlineRoute } from '../domain/offline-route';
import { NoRouteError, Route } from '../domain/route';
import { RawTile, roadTile } from './road-tiles';

export interface RoutingRequest {
  readonly id: number;
  readonly tiles: readonly RawTile[];
  readonly from: Coordinate;
  readonly to: Coordinate;
}

/** `route` is null if there is none. */
export interface RoutingAnswer {
  readonly id: number;
  readonly route?: Route | null;
  readonly error?: string;
}

const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<RoutingRequest>) => void;
  postMessage(answer: RoutingAnswer): void;
};

scope.onmessage = ({ data: { id, tiles, from, to } }) => {
  try {
    scope.postMessage({ id, route: offlineRoute(tiles.map(roadTile), from, to) });
  } catch (error) {
    if (error instanceof NoRouteError) scope.postMessage({ id, route: null });
    else scope.postMessage({ id, error: String(error) });
  }
};
