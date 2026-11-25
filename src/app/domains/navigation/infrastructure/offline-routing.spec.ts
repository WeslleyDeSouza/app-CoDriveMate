import { TestBed } from '@angular/core/testing';
import { CacheStore } from '@core/storage';
import { NoRouteError } from '../domain/route';
import { OfflineRoutingService } from './offline-routing.service';

describe('OfflineRoutingService', () => {
  it('reads stored tiles only and has no route without them', async () => {
    const asked: string[] = [];
    const cache = {
      get: async (bucket: string, key: string) => {
        asked.push(`${bucket}:${key}`);
        return undefined;
      },
    };
    TestBed.configureTestingModule({
      providers: [OfflineRoutingService, { provide: CacheStore, useValue: cache }],
    });
    const service = TestBed.inject(OfflineRoutingService);
    await expect(service.route([8.5402, 47.3782], [8.553, 47.3555])).rejects.toThrow(NoRouteError);
    expect(asked[0]).toBe('vector:14/8580/5737');
    expect(asked).toHaveLength(2);
    expect(await service.search()).toEqual([]);
    expect(await service.suggest()).toEqual([]);
  });
});
