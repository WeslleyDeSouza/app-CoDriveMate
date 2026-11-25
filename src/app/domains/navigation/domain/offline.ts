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

  /** False if something saved earlier along the line is gone. */
  covers(points: readonly Coordinate[]): Promise<boolean> {
    return Promise.resolve(points.length > 0);
  }
}
