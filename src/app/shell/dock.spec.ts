import { maintenanceTesting } from '@domains/maintenance/testing';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideI18nTesting } from '@core/i18n/testing';
import { findHook, hook, hooks } from '@shared/testing';
import { DEFAULT_SETTINGS, SettingsStore } from '@domains/settings';
import { DEMO_ENABLED, TelemetryStore } from '@domains/telemetry';
import { TelemetryTesting, telemetryTesting } from '@domains/telemetry/testing';
import { routes } from '../app.routes';
import { DOCK_APPS, Dock } from './dock';

@Component({ template: '' })
class Page {}

/** The settings store with the dock as a bar or as a floating button. */
function settingsOf(dockButton = false) {
  const settings = signal({ ...DEFAULT_SETTINGS, dockButton });
  return { provide: SettingsStore, useValue: { settings } };
}

describe('Dock', () => {
  let fixture: ComponentFixture<Dock>;
  let root: HTMLElement;
  let telemetry: TelemetryTesting;
  let store: TelemetryStore;

  beforeEach(async () => {
    telemetry = telemetryTesting();
    TestBed.configureTestingModule({
      providers: [
        provideRouter(DOCK_APPS.map((app) => ({ path: app.path, component: Page }))),
        provideI18nTesting(),
        ...telemetry.providers,
        ...maintenanceTesting().providers,
        settingsOf(),
      ],
    });
    store = TestBed.inject(TelemetryStore);
    fixture = TestBed.createComponent(Dock);
    root = fixture.nativeElement;
    await settle();
  });

  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const links = () => hooks<HTMLAnchorElement>(root, 'dock-open-');
  const obdButton = () => hook<HTMLButtonElement>(root, 'dock-obd');
  const demoButton = () => hook<HTMLButtonElement>(root, 'dock-demo');

  async function press(button: () => HTMLButtonElement): Promise<void> {
    button().click();
    await settle();
  }

  describe('apps', () => {
    it('links every area with a translated label', () => {
      expect(links().map((link) => link.getAttribute('href'))).toEqual(
        DOCK_APPS.map((app) => '/' + app.path),
      );
      expect(links().map((link) => link.getAttribute('aria-label'))).toEqual(
        DOCK_APPS.map((app) => 'app.dock.' + app.path),
      );
    });

    it('has a route for every dock entry', () => {
      const paths = routes.map((route) => route.path);

      for (const app of DOCK_APPS) expect(paths).toContain(app.path);
    });

    it('highlights the open area', async () => {
      await TestBed.inject(Router).navigateByUrl('/settings');
      await settle();

      const active = links().filter((link) => link.classList.contains('on'));
      expect(active.map((link) => link.getAttribute('href'))).toEqual(['/settings']);
    });
  });

  it('shows no badge while nothing is due', () => {
    expect(
      fixture.nativeElement.querySelector('[data-section-test=dock-badge-maintenance]'),
    ).toBeNull();
  });

  it('offers no demo in production', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideI18nTesting(),
        ...telemetryTesting().providers,
        ...maintenanceTesting().providers,
        settingsOf(),
        { provide: DEMO_ENABLED, useValue: false },
      ],
    });
    const production = TestBed.createComponent(Dock);
    production.detectChanges();
    expect(findHook(production.nativeElement, 'dock-demo')).toBeNull();
    const store = TestBed.inject(TelemetryStore);
    await store.startDemo();
    expect(store.mode()).toBe('off');
  });

  describe('demo button', () => {
    it('starts and stops the demo drive', async () => {
      await press(demoButton);
      expect(store.mode()).toBe('demo');
      expect(demoButton().classList).toContain('on');
      expect(demoButton().querySelector('i')!.classList).toContain('ti-player-stop');

      await press(demoButton);
      expect(store.mode()).toBe('off');
      expect(demoButton().classList).not.toContain('on');
      expect(demoButton().querySelector('i')!.classList).toContain('ti-player-play');
    });
  });

  describe('OBD button', () => {
    it('connects and disconnects the adapter', async () => {
      await press(obdButton);
      expect(store.mode()).toBe('obd');
      expect(obdButton().classList).toContain('on');
      expect(obdButton().textContent).toContain('app.dock.obd');

      await press(obdButton);
      expect(store.mode()).toBe('off');
      expect(telemetry.obd.stopped).toBe(1);
    });

    it('shows "connecting" while the adapter is being set up and can cancel it', async () => {
      telemetry.obd.startResult = new Promise(() => undefined);

      await press(obdButton);
      expect(obdButton().textContent).toContain('app.dock.connecting');
      expect(obdButton().classList).not.toContain('on');

      await press(obdButton);
      expect(store.mode()).toBe('off');
      expect(telemetry.obd.started).toBe(1);
      expect(obdButton().textContent).toContain('app.dock.obd');
    });

    it('returns to "off" when the connection fails', async () => {
      telemetry.obd.startResult = Promise.reject(new Error('No adapter'));

      await press(obdButton);

      expect(store.mode()).toBe('off');
      expect(store.error()).toBeInstanceOf(Error);
      expect(obdButton().classList).not.toContain('on');
    });

    it('replaces the demo drive', async () => {
      await press(demoButton);

      await press(obdButton);

      expect(store.mode()).toBe('obd');
      expect(telemetry.demo.stopped).toBe(1);
      expect(demoButton().classList).not.toContain('on');
    });
  });
});

describe('Dock menu on small screens', () => {
  async function setup(dockButton = false) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(DOCK_APPS.map((app) => ({ path: app.path, component: Page }))),
        provideI18nTesting(),
        ...telemetryTesting().providers,
        ...maintenanceTesting().providers,
        settingsOf(dockButton),
      ],
    });
    const fixture = TestBed.createComponent(Dock);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const press = async (name: string) => {
      hook(root, name).click();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    const open = () => hook(root, 'dock-menu').getAttribute('aria-expanded') === 'true';
    return { fixture, root, press, open };
  }

  it('opens and closes with the button', async () => {
    const { root, press, open } = await setup();
    expect(open()).toBe(false);
    await press('dock-menu');
    expect(open()).toBe(true);
    expect(root.classList).toContain('open');
    await press('dock-menu');
    expect(open()).toBe(false);
  });

  it('closes when an area is chosen, beside the entries and with Escape', async () => {
    const { fixture, root, press, open } = await setup();
    await press('dock-menu');
    await press('dock-open-settings');
    expect(open()).toBe(false);
    await press('dock-menu');
    await press('dock-menu-view');
    expect(open()).toBe(false);
    await press('dock-menu');
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(open()).toBe(false);
  });

  it('stays open while OBD is switched', async () => {
    const { press, open } = await setup();
    await press('dock-menu');
    await press('dock-obd');
    expect(open()).toBe(true);
  });

  it('is a bar on a large screen unless the button is chosen in the settings', async () => {
    expect((await setup()).root.classList).not.toContain('floating');
    TestBed.resetTestingModule();
    expect((await setup(true)).root.classList).toContain('floating');
  });
});
