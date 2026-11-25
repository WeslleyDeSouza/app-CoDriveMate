import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AppSettings, DEFAULT_SETTINGS, SettingsStore } from '@domains/settings';
import { LonLat } from '../domain/environment';
import { scene3dTesting } from '../testing';
import { SceneOfflineSaver } from './scene-offline';

const ROUTE: LonLat[] = [
  [8.54, 47.38],
  [8.55, 47.38],
];

describe('SceneOfflineSaver', () => {
  async function save(
    map: Partial<AppSettings['map']>,
    scene: Partial<AppSettings['map']['scene']>,
  ) {
    const fakes = scene3dTesting();
    const settings = signal<AppSettings>({
      ...DEFAULT_SETTINGS,
      map: { ...DEFAULT_SETTINGS.map, ...map, scene: { ...DEFAULT_SETTINGS.map.scene, ...scene } },
    });
    TestBed.configureTestingModule({
      providers: [
        ...fakes.providers,
        SceneOfflineSaver,
        { provide: SettingsStore, useValue: { settings } },
      ],
    });
    const job = { cancelled: () => false, progress: vi.fn() };
    const done = await TestBed.inject(SceneOfflineSaver).save(ROUTE, job);
    expect(done).toBe(true);
    return fakes;
  }
  const zooms = (tiles: string[]) => [...new Set(tiles.map((tile) => tile.split('/')[0]))];

  it('saves everything that is switched on', async () => {
    const { swiss, osm } = await save({}, {});
    expect(osm.kept).toBeGreaterThan(0);
    expect(zooms(swiss.aerial)).toEqual(expect.arrayContaining(['18', '19', '20']));
    expect(swiss.terrain.length).toBeGreaterThan(8);
    expect(swiss.kept[0]).toEqual({ buildings: true, trees: true });
  });

  it('saves nothing that is switched off', async () => {
    const { swiss } = await save(
      {},
      { sharpAerial: false, terrain: false, swissBuildings: false, swissTrees: false },
    );
    expect(zooms(swiss.aerial)).toEqual(['18']);
    expect(swiss.terrain).toEqual([]);
    expect(swiss.kept).toEqual([]);
  });

  it('saves no aerial images for the plain world', async () => {
    const { swiss } = await save({ sceneWorld: 'plain' }, {});
    expect(swiss.aerial).toEqual([]);
  });

  it('saves nothing without the 3D view', async () => {
    const { swiss, osm } = await save({ scene3d: false }, {});
    expect(osm.kept + swiss.kept.length).toBe(0);
  });
});
