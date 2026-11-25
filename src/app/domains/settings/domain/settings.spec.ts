import { settingsFromLegacy } from './legacy-settings';
import { aiAvailable, cloudVoice, DEFAULT_SETTINGS, mergeSettings } from './settings';

describe('AI provider', () => {
  it('follows the model and asks for its key', () => {
    const use = (model: string, keys: Partial<typeof DEFAULT_SETTINGS.keys>, proxyUrl = '') =>
      aiAvailable({
        ...DEFAULT_SETTINGS,
        ai: { ...DEFAULT_SETTINGS.ai, model },
        keys: { ...DEFAULT_SETTINGS.keys, ...keys },
        proxyUrl,
      });
    expect(use('claude-haiku-5-5', { anthropic: 'a' })).toBe(true);
    expect(use('claude-haiku-5-5', { openai: 'o' })).toBe(false);
    expect(use('claude-haiku-5-5', {}, 'https://proxy')).toBe(true);
    expect(use('gpt-6-luna', { openai: 'o' })).toBe(true);
    expect(use('gpt-6-luna', { anthropic: 'a' }, 'https://proxy')).toBe(false);
  });
});

describe('mergeSettings', () => {
  it('applies a partial patch without losing sibling values', () => {
    const merged = mergeSettings(DEFAULT_SETTINGS, { keys: { mapbox: 'pk.test' } });
    expect(merged.keys).toEqual({
      anthropic: '',
      openai: '',
      elevenlabs: '',
      google: '',
      mapbox: 'pk.test',
      tomtom: '',
    });
    expect(merged.vehicle).toEqual(DEFAULT_SETTINGS.vehicle);
  });

  it('does not mutate the base and ignores unknown keys', () => {
    const before = structuredClone(DEFAULT_SETTINGS);
    const merged = mergeSettings(DEFAULT_SETTINGS, { theme: 'light', bogus: 1 } as never);
    expect(DEFAULT_SETTINGS).toEqual(before);
    expect(merged.theme).toBe('light');
    expect('bogus' in merged).toBe(false);
  });

  it('accepts null for an unknown tank size', () => {
    expect(mergeSettings(DEFAULT_SETTINGS, { vehicle: { tankL: null } }).vehicle.tankL).toBeNull();
  });
});

describe('settingsFromLegacy', () => {
  it('maps the prototype settings', () => {
    const settings = settingsFromLegacy(
      {
        key: 'sk-ant-x',
        gkey: 'g',
        mbkey: 'pk.m',
        tkey: 't',
        prov: 'mapbox',
        world: 'plain',
        theme: 'light',
        vname: 'Berlingo',
        ftype: 'diesel',
        disp: '2.0',
        price: 1.79,
        tts: '0',
        voice: '1',
        astra: '1',
        eco: '0',
      },
      '60',
    );

    expect(settings.keys).toEqual({
      anthropic: 'sk-ant-x',
      openai: '',
      elevenlabs: '',
      google: 'g',
      mapbox: 'pk.m',
      tomtom: 't',
    });
    expect(settings.vehicle).toEqual({
      name: 'Berlingo',
      fuelType: 'diesel',
      displacementL: 2,
      tankL: 60,
      color: DEFAULT_SETTINGS.vehicle.color,
    });
    expect(settings.map.routingProvider).toBe('mapbox');
    expect(settings.map.sceneWorld).toBe('plain');
    expect(settings.map.swissTrafficReports).toBe(true);
    expect(settings.voice).toMatchObject({ navigation: true, readAnswers: false });
    expect(settings.ecoTips).toBe(false);
    expect(settings.fuelPrice).toBe(1.79);
    expect(settings.theme).toBe('light');
  });

  it('falls back to defaults for missing or invalid values', () => {
    const settings = settingsFromLegacy({ prov: 'bing', disp: 'abc', theme: 'neon' });
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });
});

describe('cloudVoice', () => {
  const keys = { ...DEFAULT_SETTINGS.keys, google: 'g', openai: 'o', elevenlabs: 'e' };
  const choose = (provider: 'auto' | 'browser' | 'openai' | 'elevenlabs') =>
    cloudVoice({
      keys,
      voice: { ...DEFAULT_SETTINGS.voice, provider, elevenVoice: { id: 'v1', name: 'Anna' } },
    });

  it('uses the key and voice of the chosen provider', () => {
    expect(choose('auto')).toEqual({ provider: 'google', key: 'g', voice: 'Aoede' });
    expect(choose('openai')).toEqual({ provider: 'openai', key: 'o', voice: 'marin' });
    expect(choose('elevenlabs')).toEqual({ provider: 'elevenlabs', key: 'e', voice: 'v1' });
  });

  it('sends nothing anywhere with the device voice', () => {
    expect(choose('browser').key).toBe('');
  });
});
