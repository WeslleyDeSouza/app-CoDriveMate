import { Injectable, inject } from '@angular/core';
import { EnvironmentData, LonLat } from '../domain/environment';
import { GeometryBuilder } from '../domain/ports';
import { WorldGeometry } from '../domain/world-geometry';
import type { RawTile, WorldRequest, WorldResult } from './world.worker';

interface Answer {
  readonly id: number;
  readonly result?: WorldResult;
  readonly error?: string;
}

interface Pending {
  resolve(result: WorldResult): void;
  reject(error: Error): void;
}

/** Decodes tiles and builds the world in a web worker, so driving stays smooth. */
@Injectable()
export class WorldWorker {
  private worker?: Worker;
  private nextId = 0;
  private readonly pending = new Map<number, Pending>();

  decode(tiles: readonly RawTile[], center: LonLat): Promise<EnvironmentData> {
    return this.call({ type: 'decode', tiles, center }) as Promise<EnvironmentData>;
  }

  build(data: EnvironmentData): Promise<WorldGeometry> {
    return this.call({ type: 'build', data }) as Promise<WorldGeometry>;
  }

  private call(request: WorldRequest): Promise<WorldResult> {
    const worker = (this.worker ??= this.start());
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ id, request });
    });
  }

  private start(): Worker {
    const worker = new Worker(new URL('./world.worker', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data: { id, result, error } }: MessageEvent<Answer>) => {
      const pending = this.pending.get(id);
      this.pending.delete(id);
      if (result) pending?.resolve(result);
      else pending?.reject(new Error(error));
    };
    worker.onerror = () => {
      this.pending.forEach(({ reject }) => reject(new Error('World worker failed.')));
      this.pending.clear();
      worker.terminate();
      this.worker = undefined;
    };
    return worker;
  }
}

@Injectable()
export class WorkerGeometryBuilder extends GeometryBuilder {
  private readonly worker = inject(WorldWorker);

  build(data: EnvironmentData): Promise<WorldGeometry> {
    return this.worker.build(data);
  }
}
