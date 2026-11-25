import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { BleTransport } from '@core/bluetooth';
import { CloudVoice, Reminders, SpeechInput, SpeechOutput } from '@core/device';
import { HttpPort } from '@core/http';
import { TranslateService } from '@core/i18n';
import { KeyValueStore } from '@core/storage';
import { SettingsStore } from '@domains/settings';
import { Probe, ProbeSource, SkipProbe } from '../domain/selftest';

const REMINDER_ID = 7190;
const ZURICH = '8.5402,47.3782';

/** Real checks of device, plugins, services and keys. Nothing here costs more than a request. */
@Injectable()
export class DeviceProbes extends ProbeSource {
  private readonly http = inject(HttpPort);
  private readonly kv = inject(KeyValueStore);
  private readonly ble = inject(BleTransport);
  private readonly speech = inject(SpeechOutput);
  private readonly cloudVoice = inject(CloudVoice);
  private readonly microphone = inject(SpeechInput);
  private readonly reminders = inject(Reminders);
  private readonly translate = inject(TranslateService);
  private readonly settings = inject(SettingsStore).settings;

  probes(): readonly Probe[] {
    return [
      { id: 'platform', group: 'device', run: () => this.platform() },
      { id: 'graphics', group: 'device', run: graphics },
      { id: 'storage', group: 'device', run: () => this.storage() },
      { id: 'gps', group: 'input', run: gps },
      { id: 'bluetooth', group: 'input', run: () => this.bluetooth() },
      { id: 'speech', group: 'input', manual: true, run: () => this.speak() },
      { id: 'microphone', group: 'input', manual: true, run: () => this.listen() },
      { id: 'notification', group: 'input', manual: true, run: () => this.notify() },
      ...[
        'MapboxNative',
        'MediaNative',
        'SerialNative',
        'BackgroundGeolocation',
        'SpeechRecognition',
        'LocalNotifications',
        'BluetoothLe',
        'TextToSpeech',
        'KeepAwake',
      ].map((name): Probe => ({ id: name, group: 'native', run: async () => plugin(name) })),
      this.get('openfreemap', 'https://tiles.openfreemap.org/planet'),
      this.get(
        'osrm',
        `https://router.project-osrm.org/route/v1/driving/${ZURICH};8.553,47.3555?overview=false`,
      ),
      this.get('photon', 'https://photon.komoot.io/api/?q=Bern&limit=1'),
      this.get(
        'overpass',
        'https://overpass-api.de/api/interpreter?data=' +
          encodeURIComponent('[out:json];node(1);out;'),
      ),
      this.get('swisstopo', 'https://3d.geo.admin.ch/ch.swisstopo.terrain.3d/v1/layer.json'),
      this.get(
        'open-meteo',
        'https://api.open-meteo.com/v1/forecast?latitude=47.4&longitude=8.5&hourly=temperature_2m&forecast_days=1',
      ),
      this.get(
        'wikipedia',
        'https://de.wikipedia.org/w/api.php?action=query&meta=siteinfo&format=json&origin=*',
      ),
      { id: 'mapbox', group: 'key', run: () => this.mapbox() },
      { id: 'google-routes', group: 'key', run: () => this.googleRoutes() },
      { id: 'google-voice', group: 'key', manual: true, run: () => this.googleVoice() },
      { id: 'anthropic', group: 'key', run: () => this.anthropic() },
      { id: 'openai', group: 'key', run: () => this.openai() },
      { id: 'tomtom', group: 'key', run: () => this.tomtom() },
      { id: 'swiss-traffic', group: 'key', run: () => this.swissTraffic() },
    ];
  }

  private async platform(): Promise<string> {
    const { innerWidth, innerHeight, devicePixelRatio } = window;
    const inset = getComputedStyle(document.documentElement).getPropertyValue('--sat');
    const memory = (navigator as { deviceMemory?: number }).deviceMemory;
    return [
      Capacitor.getPlatform(),
      `${innerWidth}x${innerHeight} @${devicePixelRatio}`,
      inset,
      memory ? memory + ' GB' : '',
      navigator.onLine ? 'online' : 'offline',
    ]
      .filter(Boolean)
      .join(', ');
  }

  private async storage(): Promise<string> {
    const key = 'selftest';
    const value = Date.now();
    await this.kv.set(key, value);
    const read = await this.kv.get<number>(key);
    await this.kv.delete(key);
    if (read !== value) throw new Error('Read something else than was written');
    const { usage = 0, quota = 0 } = (await navigator.storage?.estimate?.()) ?? {};
    return `${(usage / 1e6).toFixed(0)} / ${(quota / 1e6).toFixed(0)} MB`;
  }

  private async bluetooth(): Promise<string> {
    if (!Capacitor.isNativePlatform() && !('bluetooth' in navigator)) {
      throw new SkipProbe('No Web Bluetooth in this browser');
    }
    // Asks whether some device is known: that needs a working adapter and permission.
    await this.ble.isKnown('00000000-0000-0000-0000-000000000000');
    return 'ready';
  }

  private async speak(): Promise<string> {
    const text = this.translate.translate('selftest.sentence') ?? 'Test';
    const done = await this.speech.speak(
      text,
      this.translate.lang,
      this.settings().voice.rate,
      'nav',
    );
    if (!done) throw new Error('Was interrupted');
    return this.cloudVoice.available ? 'Google' : 'device';
  }

  private async listen(): Promise<string> {
    const lang = this.translate.lang === 'de' ? 'de-CH' : 'en-GB';
    const heard = await this.microphone.listen(lang, 6000);
    if (!heard) throw new Error('Nothing understood');
    return `"${heard}"`;
  }

  private async notify(): Promise<string> {
    const text = this.translate.translate('selftest.notification') ?? 'Test';
    const at = new Date(Date.now() + 5000);
    const allowed = await this.reminders.schedule([
      { id: REMINDER_ID, at, title: 'CoDriveMate', text },
    ]);
    if (!allowed) throw new Error('Not allowed');
    return '5 s';
  }

  private get(id: string, url: string): Probe {
    return {
      id,
      group: 'service',
      run: async () => {
        const start = performance.now();
        const { ok, status } = await this.http.getJson(url, 20_000);
        if (!ok) throw new Error('HTTP ' + status);
        return Math.round(performance.now() - start) + ' ms';
      },
    };
  }

  private key(name: 'mapbox' | 'google' | 'anthropic' | 'openai' | 'tomtom'): string {
    const key = this.settings().keys[name];
    if (!key) throw new SkipProbe('No key');
    return key;
  }

  private async mapbox(): Promise<string> {
    const { ok, status } = await this.http.getJson(
      `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${ZURICH};8.553,47.3555` +
        '?overview=false&access_token=' +
        encodeURIComponent(this.key('mapbox')),
    );
    if (!ok) throw new Error('HTTP ' + status);
    return 'Directions';
  }

  private async googleRoutes(): Promise<string> {
    const point = (latitude: number, longitude: number) => ({
      location: { latLng: { latitude, longitude } },
    });
    return this.fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': this.key('google'),
        'x-goog-fieldmask': 'routes.duration',
      },
      body: JSON.stringify({
        origin: point(47.3782, 8.5402),
        destination: point(47.3555, 8.553),
        travelMode: 'DRIVE',
      }),
    });
  }

  private async googleVoice(): Promise<string> {
    this.key('google');
    if (!this.cloudVoice.available) throw new SkipProbe('Switched off or refused');
    await this.cloudVoice.say(
      this.translate.translate('selftest.sentence') ?? 'Test',
      this.translate.lang,
      1,
    );
    return 'spoken';
  }

  /** Listing models costs nothing. */
  private anthropic(): Promise<string> {
    return this.fetch('https://api.anthropic.com/v1/models?limit=1', {
      headers: {
        'x-api-key': this.key('anthropic'),
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
    });
  }

  private openai(): Promise<string> {
    return this.fetch('https://api.openai.com/v1/models', {
      headers: { authorization: 'Bearer ' + this.key('openai') },
    });
  }

  private async tomtom(): Promise<string> {
    const { ok, status } = await this.http.getJson(
      'https://api.tomtom.com/traffic/services/5/incidentDetails?bbox=8.5,47.3,8.6,47.4' +
        '&timeValidityFilter=present&key=' +
        encodeURIComponent(this.key('tomtom')),
    );
    if (!ok) throw new Error('HTTP ' + status);
    return 'Traffic';
  }

  private async swissTraffic(): Promise<string> {
    const { swissTrafficUrl } = this.settings().map;
    if (!swissTrafficUrl) throw new SkipProbe('No address');
    const query = (swissTrafficUrl.includes('?') ? '&' : '?') + 'bbox=8.3,47.2,8.8,47.6';
    const { ok, status, body } = await this.http.getJson(swissTrafficUrl + query);
    const incidents = (body as { incidents?: unknown[] } | null)?.incidents;
    if (!ok || !Array.isArray(incidents)) throw new Error('HTTP ' + status);
    return String(incidents.length);
  }

  private async fetch(url: string, init: RequestInit): Promise<string> {
    const response = await this.http.fetch(url, init);
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return 'OK';
  }
}

function plugin(name: string): string {
  if (!Capacitor.isNativePlatform()) throw new SkipProbe('App only');
  if (!Capacitor.isPluginAvailable(name)) throw new Error('Not in this build');
  return 'available';
}

async function gps(): Promise<string> {
  const start = performance.now();
  const { coords } = await Geolocation.getCurrentPosition({
    enableHighAccuracy: true,
    timeout: 25_000,
  });
  return `±${Math.round(coords.accuracy)} m, ${((performance.now() - start) / 1000).toFixed(1)} s`;
}

/** Frames per second of the page as it is, with the 3D view beside it. */
async function graphics(): Promise<string> {
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) throw new Error('No WebGL 2');
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'WebGL 2';
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  const frames = await new Promise<number>((resolve) => {
    let count = 0;
    const end = performance.now() + 3000;
    const step = (now: number) => {
      count++;
      if (now < end) requestAnimationFrame(step);
      else resolve(count);
    };
    requestAnimationFrame(step);
  });
  return `${name}, ${Math.round(frames / 3)} fps`;
}
