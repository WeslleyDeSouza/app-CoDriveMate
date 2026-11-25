import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideI18nTesting } from '@core/i18n/testing';
import { PositionStore } from '@domains/navigation';
import { navigationTesting } from '@domains/navigation/testing';
import { AppSettings, DEFAULT_SETTINGS, SettingsStore } from '@domains/settings';
import { telemetryTesting } from '@domains/telemetry/testing';
import { findHook, hook, textOf } from '@shared/testing';
import { EnvironmentData, LonLat, cellOf } from '../domain/environment';
import { scene3dTesting } from '../testing';
import { SceneView } from './scene-view';

const HERE: LonLat = [8.54, 47.38];

const surroundings = (center: LonLat): EnvironmentData => ({
  center,
  roads: [
    {
      kind: 'primary',
      lanes: 2,
      oneway: false,
      points: [
        [8.54, 47.379],
        [8.54, 47.381],
      ],
    },
  ],
  streets: [
    {
      name: 'Uraniastrasse',
      points: [
        [8.54, 47.379],
        [8.54, 47.381],
      ],
    },
  ],
  buildings: [],
  trees: [],
  forests: [],
});

describe('SceneView', () => {
  let fixture: ComponentFixture<SceneView>;
  let root: HTMLElement;
  let scene: ReturnType<typeof scene3dTesting>;
  let nav: ReturnType<typeof navigationTesting>;
  const settings = signal<AppSettings>(DEFAULT_SETTINGS);
  const update = vi.fn();

  async function setup(before?: () => void, map: Partial<AppSettings['map']> = {}): Promise<void> {
    scene = scene3dTesting();
    nav = navigationTesting();
    nav.gps.allowed = true;
    settings.set({ ...DEFAULT_SETTINGS, theme: 'dark', map: { ...DEFAULT_SETTINGS.map, ...map } });
    update.mockClear();
    before?.();
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        ...telemetryTesting().providers,
        ...nav.providers,
        ...scene.providers,
        { provide: SettingsStore, useValue: { settings, update } },
      ],
    });
    await TestBed.inject(PositionStore).start(false);
    fixture = TestBed.createComponent(SceneView);
    root = fixture.nativeElement;
    await settle();
  }

  async function settle(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      fixture.detectChanges();
      await new Promise((resolve) => setTimeout(resolve));
    }
    fixture.detectChanges();
  }

  it('starts the scene and draws', async () => {
    await setup();
    expect(findHook(root, 'scene-state')).toBeNull();
    expect(scene.scenes.renderer.running).toBe(true);
    expect(scene.scenes.renderer.appearance).toEqual({
      dark: true,
      world: 'real',
      carColor: DEFAULT_SETTINGS.vehicle.color,
      options: DEFAULT_SETTINGS.map.scene,
      googleKey: '',
      mapboxToken: '',
    });
  });

  it('loads no scene and no surroundings when switched off', async () => {
    await setup(undefined, { scene3d: false });
    nav.gps.emit(HERE, 0);
    await settle();
    expect(scene.scenes.created).toBe(0);
    expect(scene.osm.asked).toEqual([]);
    expect(textOf(hook(root, 'scene-state'))).toBe('scene3d.state.off');
  });

  it('frees the scene when it is switched off later', async () => {
    await setup();
    const { renderer } = scene.scenes;
    settings.update((s) => ({ ...s, map: { ...s.map, scene3d: false } }));
    await settle();
    expect(renderer.destroyed).toBe(true);
    expect(textOf(hook(root, 'scene-state'))).toBe('scene3d.state.off');
  });

  it('says so when the device cannot draw 3D', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await setup(() => (scene.scenes.failure = new Error('no WebGL')));
    expect(textOf(hook(root, 'scene-state'))).toBe('scene3d.state.failed');
  });

  it('stops drawing when the graphics context is lost', async () => {
    await setup();
    scene.scenes.events?.onLost();
    await settle();
    expect(scene.scenes.renderer.running).toBe(false);
    expect(textOf(hook(root, 'scene-state'))).toBe('scene3d.state.failed');
  });

  it('stops drawing in the background', async () => {
    await setup();
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(scene.scenes.renderer.running).toBe(false);

    hidden.mockRestore();
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(scene.scenes.renderer.running).toBe(true);
  });

  it('shows surroundings, street and attribution once the position is known', async () => {
    await setup(() => (scene.osm.answer = surroundings));
    expect(findHook(root, 'scene-attribution')).toBeNull();

    nav.gps.emit(HERE, 0);
    await settle();

    expect(scene.scenes.renderer.pose?.at).toEqual(HERE);
    expect(scene.scenes.renderer.environment?.data.center).toEqual(cellOf(HERE));
    expect(textOf(hook(root, 'scene-street'))).toBe('Uraniastrasse');

    scene.scenes.events?.onAttribution('© swisstopo');
    await settle();
    expect(textOf(hook(root, 'scene-attribution'))).toBe('© swisstopo');
  });

  it('asks for a cell once, not at every position', async () => {
    await setup(() => (scene.osm.answer = surroundings));
    nav.gps.emit(HERE, 0);
    await settle();
    nav.gps.emit([8.54001, 47.38001], 0);
    await settle();
    expect(scene.osm.asked).toHaveLength(1);
  });

  it('adds trees and crossings when they arrive', async () => {
    await setup(() => {
      scene.osm.answer = surroundings;
      scene.osm.extra = { trees: [{ at: HERE, heightM: 8 }], crossings: [HERE] };
    });
    nav.gps.emit(HERE, 0);
    await settle();
    const { geometry } = scene.scenes.renderer.environment!;
    expect(geometry.trees).toHaveLength(3);
    expect(geometry.markings.index.length).toBeGreaterThan(0);
  });

  it('keeps the old surroundings while new ones are missing', async () => {
    await setup(() => (scene.osm.answer = surroundings));
    nav.gps.emit(HERE, 0);
    await settle();
    scene.osm.answer = () => null;
    nav.gps.emit([8.56, 47.4], 0);
    await settle();
    expect(scene.scenes.renderer.environment?.data.center).toEqual(cellOf(HERE));
  });

  it('changes the camera on tap', async () => {
    await setup();
    hook(root, 'scene-tap').click();
    await settle();
    expect(scene.scenes.renderer.camera).toBe('chase');
    expect(textOf(hook(root, 'scene-camera'))).toBe('scene3d.camera.chase');
  });

  it('switches between aerial image and plain', async () => {
    await setup();
    hook(root, 'scene-world').click();
    expect(update).toHaveBeenCalledWith({ map: { sceneWorld: 'plain' } });
  });

  it('shows the aerial image for worlds without a key', async () => {
    await setup(undefined, { sceneWorld: 'google' });
    expect(scene.scenes.renderer.appearance?.world).toBe('real');
  });

  it('offers Mapbox and Google once there are keys', async () => {
    await setup(undefined, { sceneWorld: 'plain' });
    settings.update((s) => ({ ...s, keys: { ...s.keys, mapbox: 'pk.test', google: 'AIza' } }));
    hook(root, 'scene-world').click();
    expect(update).toHaveBeenCalledWith({ map: { sceneWorld: 'mapbox' } });

    settings.update((s) => ({ ...s, map: { ...s.map, sceneWorld: 'google' } }));
    await settle();
    expect(scene.scenes.renderer.appearance?.world).toBe('google');

    scene.scenes.events?.onWorldFailed('google', true);
    await settle();
    expect(scene.scenes.renderer.appearance?.world).toBe('real');
  });

  it('falls back when the Mapbox map cannot be shown', async () => {
    await setup(undefined, { sceneWorld: 'mapbox' });
    settings.update((s) => ({ ...s, keys: { ...s.keys, mapbox: 'pk.test' } }));
    await settle();
    expect(scene.scenes.renderer.appearance?.world).toBe('mapbox');
    scene.scenes.events?.onWorldFailed('mapbox', false);
    await settle();
    expect(scene.scenes.renderer.appearance?.world).toBe('real');
  });
});
