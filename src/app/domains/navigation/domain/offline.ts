import { Coordinate } from './geo';

export interface OfflineSaveJob {
  /** 0 to 1 */
  progress(share: number): void;
  cancelled(): boolean;
}

/** Port: keeps something on the device for a route. Several may be registered. */
export abstract class OfflineSaver {
  /** False if not everything could be saved. */
  abstract save(points: readonly Coordinate[], job: OfflineSaveJob): Promise<boolean>;
}
