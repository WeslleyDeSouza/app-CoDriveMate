import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateService } from '@core/i18n';
import { provideI18nTesting } from '@core/i18n/testing';
import { BackupFile, BackupService } from '@core/storage';
import { findHook, hook, hooks, textOf } from '@shared/testing';
import { CloudVoice, SpeechOutput } from '@core/device';
import { mediaTesting } from '@domains/media/testing';
import { telemetryTesting } from '@domains/telemetry/testing';
import { SettingsStore } from '../application/settings.store';
import { AppSettings, DEFAULT_SETTINGS, DeepPartial, SettingsRepository } from '../domain/settings';
import { SettingsPage } from './settings-page';

class MemorySettingsRepository extends SettingsRepository {
  saved: AppSettings[] = [];
  constructor(private readonly stored?: DeepPartial<AppSettings>) {
    super();
  }
  override async load(): Promise<DeepPartial<AppSettings> | undefined> {
    return this.stored;
  }
  override async save(settings: AppSettings): Promise<void> {
    this.saved.push(settings);
  }
}

const BACKUP: BackupFile = {
  app: 'codrivemate',
  version: 1,
  exportedAt: '2026-11-24T10:00:00.000Z',
  kv: {},
  collections: {},
};

describe('SettingsPage', () => {
  let fixture: ComponentFixture<SettingsPage>;
  let root: HTMLElement;
  let repository: MemorySettingsRepository;
  let store: SettingsStore;
  let backup: { export: ReturnType<typeof vi.fn>; import: ReturnType<typeof vi.fn> };

  async function setup(stored?: DeepPartial<AppSettings>): Promise<void> {
    repository = new MemorySettingsRepository(stored);
    backup = {
      export: vi.fn().mockResolvedValue(BACKUP),
      import: vi.fn().mockResolvedValue(undefined),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideI18nTesting(),
        ...telemetryTesting().providers,
        { provide: CloudVoice, useValue: { problem: () => null, configure: vi.fn() } },
        { provide: SpeechOutput, useValue: { speak: vi.fn(), stop: vi.fn() } },
        ...mediaTesting().providers,
        { provide: SettingsRepository, useValue: repository },
        { provide: BackupService, useValue: backup },
      ],
    });
    store = TestBed.inject(SettingsStore);
    await store.load();
    fixture = TestBed.createComponent(SettingsPage);
    root = fixture.nativeElement;
    await settle();
  }

  /** Lets pending promises finish and renders the result. */
  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const control = (name: string) => hook<HTMLInputElement | HTMLSelectElement>(root, name);

  async function change(name: string, value: string): Promise<void> {
    const element = control(name);
    element.value = value;
    element.dispatchEvent(new Event('change'));
    await settle();
  }

  const saveButton = () => hook<HTMLButtonElement>(root, 'settings-save');

  async function save(): Promise<AppSettings> {
    saveButton().click();
    await settle();
    return repository.saved[repository.saved.length - 1];
  }

  afterEach(() => vi.unstubAllGlobals());

  describe('draft and save', () => {
    it('shows the stored settings', async () => {
      await setup({
        vehicle: { name: 'Berlingo', fuelType: 'diesel' },
        keys: { mapbox: 'pk.abc' },
      });

      expect(control('settings-vehicle-name').value).toBe('Berlingo');
      expect(control('settings-key-mapbox').value).toBe('pk.abc');
      const summary = textOf(hook(root, 'settings-toggle-car'));
      expect(summary).toContain('Berlingo');
      expect(summary).toContain('settings.fuel_diesel');
    });

    it('enables "Save" only after a change', async () => {
      await setup();
      expect(saveButton().disabled).toBe(true);

      await change('settings-vehicle-name', 'Berlingo');

      expect(saveButton().disabled).toBe(false);
    });

    it('keeps edits in the draft until "Save" is pressed', async () => {
      await setup();

      await change('settings-vehicle-name', 'Berlingo');

      expect(store.settings().vehicle.name).toBe(DEFAULT_SETTINGS.vehicle.name);
      expect(repository.saved).toEqual([]);
    });

    it('writes the draft to the store and confirms it', async () => {
      await setup();
      await change('settings-vehicle-name', '  Berlingo ');
      await change('settings-fuel-type', 'diesel');

      const saved = await save();

      expect(saved.vehicle).toMatchObject({ name: 'Berlingo', fuelType: 'diesel' });
      expect(store.settings().vehicle.name).toBe('Berlingo');
      expect(saveButton().disabled).toBe(true);
      expect(saveButton().textContent).toContain('settings.saved');
    });

    it('drops the confirmation on the next edit', async () => {
      await setup();
      await change('settings-vehicle-name', 'Berlingo');
      await save();

      await change('settings-vehicle-name', 'C4');

      expect(saveButton().textContent).toContain('settings.save');
      expect(saveButton().textContent).not.toContain('settings.saved');
    });

    it('leaves untouched groups as they were', async () => {
      await setup({ keys: { anthropic: 'sk-ant-1' }, fuelPrice: 1.7 });
      await change('settings-theme', 'light');

      const saved = await save();

      expect(saved.theme).toBe('light');
      expect(saved.keys.anthropic).toBe('sk-ant-1');
      expect(saved.fuelPrice).toBe(1.7);
    });
  });

  describe('numbers', () => {
    it('takes a valid displacement and fuel price', async () => {
      await setup();
      await change('settings-displacement', '2.0');
      await change('settings-fuel-price', '1.79');

      const saved = await save();

      expect(saved.vehicle.displacementL).toBe(2);
      expect(saved.fuelPrice).toBe(1.79);
    });

    it.each(['', '0', '-3'])('keeps the previous displacement for "%s"', async (value) => {
      await setup();

      await change('settings-displacement', value);

      expect(saveButton().disabled).toBe(true);
      expect(control('settings-displacement').value).toBe(
        String(DEFAULT_SETTINGS.vehicle.displacementL),
      );
    });

    it('stores an emptied tank size as unknown', async () => {
      await setup();
      await change('settings-tank', '');

      const saved = await save();

      expect(saved.vehicle.tankL).toBeNull();
      expect(control('settings-tank').value).toBe('');
    });
  });

  describe('switches and choices', () => {
    it('maps on/off selects to booleans', async () => {
      await setup();
      await change('settings-eco-tips', '0');
      await change('settings-nav-voice', '0');
      await change('settings-swiss-traffic', '1');
      await change('settings-scene3d', '0');

      const saved = await save();

      expect(saved.ecoTips).toBe(false);
      expect(saved.voice.navigation).toBe(false);
      expect(saved.map.swissTrafficReports).toBe(true);
      expect(saved.map.scene3d).toBe(false);
    });

    it('stores map, voice and AI choices', async () => {
      await setup();
      await change('settings-routing-provider', 'osm');
      await change('settings-base-map', 'ofm');
      await change('settings-scene-world', 'plain');
      await change('settings-scene-quality', 'high');
      await change('settings-scene-shadows', '0');
      await change('settings-voice-provider', 'browser');
      await change('settings-voice-rate', '1.15');
      await change('settings-ai-model', 'claude-sonnet-5-5');
      await change('settings-proxy-url', 'https://proxy.example');

      const saved = await save();

      expect(saved.map).toMatchObject({
        routingProvider: 'osm',
        baseMap: 'ofm',
        sceneWorld: 'plain',
        scene: { quality: 'high', shadows: false, sky: true },
      });
      expect(saved.voice).toMatchObject({ provider: 'browser', rate: 1.15 });
      expect(saved.ai.model).toBe('claude-sonnet-5-5');
      expect(saved.proxyUrl).toBe('https://proxy.example');
    });

    it('selects the body colour with a swatch', async () => {
      await setup();
      const swatches = hooks<HTMLButtonElement>(root, 'settings-color-');
      const current = swatches.find((swatch) => swatch.getAttribute('aria-checked') === 'true')!;
      expect(current.getAttribute('aria-label')).toBe(DEFAULT_SETTINGS.vehicle.color);

      const other = swatches.find((swatch) => swatch !== current)!;
      other.click();
      await settle();

      expect(other.getAttribute('aria-checked')).toBe('true');
      expect(current.getAttribute('aria-checked')).toBe('false');
      expect((await save()).vehicle.color).toBe(other.getAttribute('aria-label'));
    });

    it('switches the language at once, without "Save"', async () => {
      await setup();
      const translate = TestBed.inject(TranslateService);

      await change('settings-language', 'en');

      expect(translate.lang).toBe('en');
      expect(saveButton().disabled).toBe(true);
    });
  });

  it('saves the chosen units and keeps the others', async () => {
    await setup();
    await change('settings-units-distance', 'mi');
    expect((await save()).units).toEqual({ ...DEFAULT_SETTINGS.units, distance: 'mi' });
  });

  describe('API keys', () => {
    it('hides every key until its eye button is pressed', async () => {
      await setup({ keys: { google: 'AIza-1', mapbox: 'pk.1' } });
      const eye = hook<HTMLButtonElement>(root, 'settings-key-show-google');
      expect(control('settings-key-google').getAttribute('type')).toBe('password');
      expect(eye.getAttribute('aria-pressed')).toBe('false');

      eye.click();
      await settle();

      expect(control('settings-key-google').getAttribute('type')).toBe('text');
      expect(eye.getAttribute('aria-pressed')).toBe('true');
      expect(control('settings-key-mapbox').getAttribute('type')).toBe('password');

      eye.click();
      await settle();

      expect(control('settings-key-google').getAttribute('type')).toBe('password');
    });

    it('offers all four keys and never lets the browser remember them', async () => {
      await setup();
      for (const name of ['anthropic', 'google', 'mapbox', 'tomtom']) {
        expect(control(`settings-key-${name}`).getAttribute('autocomplete')).toBe('off');
      }
    });

    it('stores a trimmed key without touching the others', async () => {
      await setup({ keys: { google: 'AIza-1' } });
      await change('settings-key-anthropic', ' sk-ant-2 ');

      const saved = await save();

      expect(saved.keys).toEqual({
        anthropic: 'sk-ant-2',
        openai: '',
        google: 'AIza-1',
        mapbox: '',
        tomtom: '',
      });
    });
  });

  describe('backup', () => {
    async function pick(
      file: { text: () => Promise<string> } | undefined,
    ): Promise<HTMLInputElement> {
      const input = hook<HTMLInputElement>(root, 'settings-backup-file');
      Object.defineProperty(input, 'files', { configurable: true, value: file ? [file] : [] });
      input.dispatchEvent(new Event('change'));
      await settle();
      return input;
    }

    it('downloads the export as a dated JSON file', async () => {
      await setup();
      const createObjectURL = vi.fn().mockReturnValue('blob:backup');
      const revokeObjectURL = vi.fn();
      vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
      let download = '';
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
        this: HTMLAnchorElement,
      ) {
        download = this.download;
      });

      hook(root, 'settings-backup-export').click();
      await settle();

      expect(backup.export).toHaveBeenCalledOnce();
      expect(click).toHaveBeenCalledOnce();
      expect(download).toBe('codrivemate-backup-2026-11-24.json');
      const blob = createObjectURL.mock.calls[0][0] as Blob;
      expect(blob.type).toBe('application/json');
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:backup');
      click.mockRestore();
    });

    it('imports a backup and restarts the app', async () => {
      await setup();
      const reload = vi.fn();
      vi.stubGlobal('location', { reload });

      await pick({ text: async () => JSON.stringify(BACKUP) });

      expect(backup.import).toHaveBeenCalledWith(BACKUP);
      expect(reload).toHaveBeenCalledOnce();
      expect(findHook(root, 'settings-backup-error')).toBeNull();
    });

    it('reports a file that is not JSON', async () => {
      await setup();
      const reload = vi.fn();
      vi.stubGlobal('location', { reload });

      await pick({ text: async () => 'not json' });

      expect(backup.import).not.toHaveBeenCalled();
      expect(reload).not.toHaveBeenCalled();
      expect(textOf(hook(root, 'settings-backup-error'))).toBe('settings.backup_invalid');
    });

    it('reports a file the backup service rejects', async () => {
      await setup();
      const reload = vi.fn();
      vi.stubGlobal('location', { reload });
      backup.import.mockRejectedValue(new Error('Not a CoDriveMate backup file.'));

      await pick({ text: async () => '{"app":"other"}' });

      expect(reload).not.toHaveBeenCalled();
      expect(findHook(root, 'settings-backup-error')).not.toBeNull();
    });

    it('does nothing when the file dialog is cancelled', async () => {
      await setup();

      await pick(undefined);

      expect(backup.import).not.toHaveBeenCalled();
      expect(findHook(root, 'settings-backup-error')).toBeNull();
    });
  });
});
