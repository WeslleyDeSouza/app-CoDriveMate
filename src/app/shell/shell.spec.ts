import { maintenanceTesting } from '@domains/maintenance/testing';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideI18nTesting } from '@core/i18n/testing';
import { OnScreenKeyboard } from '@core/device';
import { findHook, hook } from '@shared/testing';
import { DEFAULT_SETTINGS, SettingsStore } from '@domains/settings';
import { copilotTesting } from '@domains/copilot/testing';
import { parkingTesting } from '@domains/parking/testing';
import { fuelTesting } from '@domains/fuel/testing';
import { logbookTesting } from '@domains/logbook/testing';
import { roadTesting } from '@domains/road/testing';
import { mediaTesting } from '@domains/media/testing';
import { navigationTesting } from '@domains/navigation/testing';
import { scene3dTesting } from '@domains/scene3d/testing';
import { telemetryTesting } from '@domains/telemetry/testing';
import { Shell } from './shell';

@Component({ template: '<p data-section-test="page-content">page</p>' })
class Page {}

describe('Shell', () => {
  let fixture: ComponentFixture<Shell>;
  let root: HTMLElement;
  let router: Router;
  const settings = signal(DEFAULT_SETTINGS);
  const keyboardPx = signal<number | null>(null);

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', pathMatch: 'full', children: [] },
          { path: 'settings', component: Page },
        ]),
        provideI18nTesting(),
        ...telemetryTesting().providers,
        ...maintenanceTesting().providers,
        ...navigationTesting().providers,
        ...mediaTesting().providers,
        ...scene3dTesting().providers,
        ...parkingTesting().providers,
        ...fuelTesting().providers,
        ...roadTesting().providers,
        ...logbookTesting().providers,
        ...copilotTesting().providers,
        { provide: OnScreenKeyboard, useValue: { heightPx: keyboardPx } },
        { provide: SettingsStore, useValue: { settings } },
      ],
    });
    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(Shell);
    root = fixture.nativeElement;
    await go('/');
  });

  async function go(url: string): Promise<void> {
    await router.navigateByUrl(url);
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const sheet = () => hook(root, 'shell-sheet');

  it('lays out the cockpit panel, the stage and the dock', () => {
    expect(root.querySelector('app-cockpit-panel')).not.toBeNull();
    expect(root.querySelector('app-dock')).not.toBeNull();
    expect(findHook(root, 'cockpit-speed')).not.toBeNull();
    expect(findHook(root, 'dock-demo')).not.toBeNull();
  });

  it('hides the 3D view completely when it is switched off', () => {
    expect(root.querySelector('app-scene-view')).not.toBeNull();
    settings.update((s) => ({ ...s, map: { ...s.map, scene3d: false } }));
    fixture.detectChanges();
    expect(root.querySelector('app-scene-view')).toBeNull();
    expect(root.classList).toContain('no-scene');
    settings.update((s) => ({ ...s, map: { ...s.map, gauge: true } }));
    fixture.detectChanges();
    expect(root.querySelector('app-speed-gauge')).not.toBeNull();
    expect(root.classList).not.toContain('no-scene');
    settings.set(DEFAULT_SETTINGS);
  });

  it('makes room for the keyboard and takes it back', () => {
    keyboardPx.set(300);
    fixture.detectChanges();
    expect(root.classList).toContain('keyboard');
    expect(root.style.getPropertyValue('--visible')).toBe(window.innerHeight - 300 + 'px');
    expect(root.style.getPropertyValue('--visible-top')).toBe('0px');
    keyboardPx.set(0);
    fixture.detectChanges();
    expect(root.classList).not.toContain('keyboard');
    expect(root.style.getPropertyValue('--visible')).toBe('100dvh');
  });

  it('keeps the side sheet closed and inert on the start route', () => {
    expect(sheet().classList).not.toContain('open');
    expect(sheet().hasAttribute('inert')).toBe(true);
  });

  it('opens the side sheet with the page of the active route', async () => {
    await go('/settings');

    expect(sheet().classList).toContain('open');
    expect(sheet().hasAttribute('inert')).toBe(false);
    expect(findHook(sheet(), 'page-content')).not.toBeNull();
  });

  it('closes the side sheet when returning to the start route', async () => {
    await go('/settings');

    await go('/');

    expect(sheet().classList).not.toContain('open');
    expect(sheet().hasAttribute('inert')).toBe(true);
    expect(findHook(sheet(), 'page-content')).toBeNull();
  });
});
