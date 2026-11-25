import { Injectable, inject } from '@angular/core';
import { OfflineSaveJob, OfflineSaver } from '@domains/navigation';
import { LonLat, RoadSource, metresBetween, roadCell } from '../domain/road';

/** The public servers are not made for long routes. */
const MAX_CELLS = 30;
const PAUSE_MS = 1500;

/** Limits and hazards along a route. They are extra, so a failure does not count. */
@Injectable()
export class RoadOfflineSaver extends OfflineSaver {
  private readonly source = inject(RoadSource);

  async save(points: readonly LonLat[], job: OfflineSaveJob): Promise<boolean> {
    const cells = new Map<string, LonLat>();
    let last: LonLat | null = null;
    for (const point of points) {
      if (last && metresBetween(last, point) < 300) continue;
      last = point;
      const cell = roadCell(point);
      if (cells.size < MAX_CELLS) cells.set(cell.join(','), cell);
    }
    let done = 0;
    for (const cell of cells.values()) {
      if (job.cancelled()) return false;
      await this.source.load(cell);
      job.progress(++done / cells.size);
      await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
    }
    return true;
  }
}
