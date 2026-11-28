import { lightingTesting } from '@domains/lighting/testing';
import { maintenanceTesting } from '@domains/maintenance/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideI18nTesting } from '@core/i18n/testing';
import { AppSettings, DEFAULT_SETTINGS, SettingsStore, Theme } from '@domains/settings';
import { TelemetryStore, XSARA_PICASSO } from '@domains/telemetry';
import { CloudVoice, OnScreenKeyboard } from '@core/device';
import { copilotTesting } from '@domains/copilot/testing';
import { parkingTesting } from '@domains/parking/testing';
import { fuelTesting } from '@domains/fuel/testing';
import { logbookTesting } from '@domains/logbook/testing';
import { roadTesting } from '@domains/road/testing';
import { mediaTesting } from '@domains/media/testing';
import { navigationTesting } from '@domains/navigation/testing';
import { scene3dTesting } from '@domains/scene3d/testing';
import { telemetryTesting } from '@domains/telemetry/testing';
import { App } from './app';

describe('App', () => {
  let fixture: ComponentFixture<App>;
  const settings = signal<AppSettings>(DEFAULT_SETTINGS);

  async function setup(theme: Theme, systemPrefersLight?: boolean): Promise<void> {
    if (systemPrefersLight !== undefined) {
      vi.stubGlobal('matchMedia', () => ({ matches: systemPrefersLight }));
    }
    settings.set({ ...DEFAULT_SETTINGS, theme });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideI18nTesting(),
        ...telemetryTesting().providers,
        ...maintenanceTesting().providers,
        ...lightingTesting().providers,
        ...navigationTesting().providers,
        ...mediaTesting().providers,
        ...scene3dTesting().providers,
        ...parkingTesting().providers,
        { provide: OnScreenKeyboard, useValue: { heightPx: signal(null) } },
        { provide: CloudVoice, useValue: { configure: () => undefined } },
        ...fuelTesting().providers,
        ...roadTesting().providers,
        ...logbookTesting().providers,
        ...copilotTesting().providers,
        { provide: SettingsStore, useValue: { settings } },
      ],
    });
    fixture = TestBed.createComponent(App);
    await render();
  }

  async function render(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const isLight = () => document.body.classList.contains('light');

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.classList.remove('light');
  });

  it('renders the cockpit shell', async () => {
    await setup('dark');

    expect(fixture.nativeElement.querySelector('app-shell')).not.toBeNull();
  });

  describe('theme', () => {
    it('is dark by default', async () => {
      await setup('dark');
      expect(isLight()).toBe(false);
    });

    it('applies the light theme to the body', async () => {
      await setup('light');
      expect(isLight()).toBe(true);
    });

    it('follows the system in "auto"', async () => {
      await setup('auto', true);
      expect(isLight()).toBe(true);
    });

    it('stays dark in "auto" when the system is dark', async () => {
      await setup('auto', false);
      expect(isLight()).toBe(false);
    });

    it('lets an explicit dark theme win over a light system', async () => {
      await setup('dark', true);
      expect(isLight()).toBe(false);
    });

    it('switches as soon as the setting changes', async () => {
      await setup('dark');

      settings.update((current) => ({ ...current, theme: 'light' }));
      await render();

      expect(isLight()).toBe(true);
    });
  });

  describe('vehicle', () => {
    it('hands the vehicle from the settings to the telemetry rules', async () => {
      await setup('dark');
      const telemetry = TestBed.inject(TelemetryStore);

      settings.update((current) => ({
        ...current,
        vehicle: {
          ...current.vehicle,
          name: 'Berlingo',
          fuelType: 'diesel',
          displacementL: 2,
          tankL: null,
        },
      }));
      await render();

      expect(telemetry.profile()).toMatchObject({
        name: 'Berlingo',
        fuelType: 'diesel',
        displacementL: 2,
        tankL: null,
      });
    });

    it('keeps what the settings do not know, such as the redline', async () => {
      await setup('dark');

      expect(TestBed.inject(TelemetryStore).profile().redlineRpm).toBe(XSARA_PICASSO.redlineRpm);
    });
  });
});
