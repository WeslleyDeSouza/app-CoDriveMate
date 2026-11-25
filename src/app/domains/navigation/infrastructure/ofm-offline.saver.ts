import { Injectable, inject } from '@angular/core';
import { DETAIL_ZOOM, OPEN_FREE_MAP, OpenFreeMap } from '@core/map';
import { Coordinate } from '../domain/geo';
import { tilesAlong } from '../domain/map-tiles';
import { OfflineSaveJob, OfflineSaver } from '../domain/offline';

const MIN_ZOOM = 4;
/** Below the limit of the store, so that a route does not push itself out. */
const MAX_TILES = 3500;
const PARALLEL = 6;
const STYLES = ['dark', 'liberty'];
/** Latin letters, the rest of Europe, and dashes and quotation marks. */
const GLYPHS = ['0-255', '256-511', '8192-8447'];

interface Style {
  readonly sprite?: string;
  readonly glyphs?: string;
  readonly layers?: readonly { readonly layout?: { readonly 'text-font'?: unknown } }[];
}

/**
 * Keeps the OpenFreeMap map along a route, also while another map is shown: it
 * is the one for routes that are calculated without a network.
 */
@Injectable()
export class OfmOfflineSaver extends OfflineSaver {
  private readonly map = inject(OpenFreeMap);

  async save(points: readonly Coordinate[], job: OfflineSaveJob): Promise<boolean> {
    const assets = await this.assets();
    const tiles = tilesAlong(points, MIN_ZOOM, DETAIL_ZOOM, MAX_TILES);
    const tasks = [
      ...assets.map((url) => () => this.map.resource(url)),
      ...tiles.map(
        ({ z, x, y }) =>
          () =>
            this.map.tile(z, x, y),
      ),
    ];
    let next = 0;
    let done = 0;
    let complete = assets.length > 0 && tiles.length < MAX_TILES;
    const work = async () => {
      while (next < tasks.length && !job.cancelled()) {
        if (!(await tasks[next++]())) complete = false;
        job.progress(++done / tasks.length);
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, work));
    return complete && !job.cancelled();
  }

  /** What the styles need besides tiles; empty if they cannot be loaded. */
  private async assets(): Promise<string[]> {
    const urls = new Set([`${OPEN_FREE_MAP}/planet`]);
    for (const name of STYLES) {
      const bytes = await this.map.resource(`${OPEN_FREE_MAP}/styles/${name}`);
      if (!bytes) return [];
      const style = JSON.parse(new TextDecoder().decode(bytes)) as Style;
      for (const ending of style.sprite ? ['.json', '.png', '@2x.json', '@2x.png'] : []) {
        urls.add(style.sprite + ending);
      }
      for (const font of fontStacks(style)) {
        for (const range of style.glyphs ? GLYPHS : []) {
          urls.add(
            (style.glyphs ?? '')
              .replace('{fontstack}', encodeURIComponent(font))
              .replace('{range}', range),
          );
        }
      }
    }
    return [...urls];
  }
}

function fontStacks(style: Style): Set<string> {
  const fonts = (style.layers ?? []).map(({ layout }) => layout?.['text-font']);
  return new Set(
    fonts.flatMap((font) =>
      Array.isArray(font) && font.every((name) => typeof name === 'string') ? [font.join(',')] : [],
    ),
  );
}
