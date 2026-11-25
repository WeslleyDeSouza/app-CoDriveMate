import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideI18nTesting } from '@core/i18n/testing';
import { UnitsStore } from '@core/units';
import { METRIC } from '@shared/kernel/units';
import { hook, textOf } from '@shared/testing';
import { TelemetryStore } from '../application/telemetry.store';
import { TelemetryTesting, telemetryTesting } from '../testing';
import { CockpitPanel } from './cockpit-panel';

@Component({
  imports: [CockpitPanel],
  template: `<app-cockpit-panel
    ><div data-section-test="host-projected">3D</div></app-cockpit-panel
  >`,
})
class Host {}

describe('CockpitPanel', () => {
  let fixture: ComponentFixture<Host>;
  let root: HTMLElement;
  let telemetry: TelemetryTesting;
  let store: TelemetryStore;

  beforeEach(async () => {
    telemetry = telemetryTesting();
    TestBed.configureTestingModule({ providers: [provideI18nTesting(), ...telemetry.providers] });
    store = TestBed.inject(TelemetryStore);
    fixture = TestBed.createComponent(Host);
    root = fixture.nativeElement;
    await render();
  });

  async function render(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const text = (name: string) => textOf(hook(root, 'cockpit-' + name));
  /** Number of rev bar segments, optionally only those in a state: l(it), w(arning), r(ed). */
  const segments = (state?: 'l' | 'w' | 'r') =>
    Array.from(hook(root, 'cockpit-revbar').children).filter(
      (segment) => !state || segment.classList.contains(state),
    ).length;
  /** Value and unit of a tile. */
  const tile = (name: string) => {
    const element = hook(root, 'cockpit-' + name);
    return (
      element.querySelector('b')!.textContent + ' ' + element.querySelector('span')!.textContent
    );
  };
  const TILES = ['trip', 'average', 'consumption', 'coolant', 'battery', 'range'];
  const tiles = () => TILES.map(tile);

  it('shows zero speed and dashes while no source is connected', () => {
    expect(text('speed')).toBe('0');
    expect(hook(root, 'cockpit-mode').classList).toContain('off');
    expect(text('mode')).toBe('telemetry.mode.off');
    expect(segments()).toBe(36);
    expect(segments('l')).toBe(0);
    expect(tiles()).toEqual(['– km', '– km/h', '– l/h', '– °C', '– V', '– km']);
  });

  it('shows the live values of the running source', async () => {
    await store.startDemo();
    telemetry.demo.emit({
      speed: 62,
      rpm: 2400,
      coolantTemp: 89.6,
      voltage: 14.12,
    });
    await render();

    expect(text('speed')).toBe('62');
    expect(text('rpm')).toBe('2400 telemetry.unit_rpm');
    expect(hook(root, 'cockpit-mode').classList).toContain('demo');
    expect(hook(root, 'cockpit-gear').dataset['gear']).toBe('4');
    expect(tiles().slice(3, 5)).toEqual(['90 °C', '14.1 V']);
  });

  it('shows what other domains add, and colours warnings', async () => {
    const panel = TestBed.createComponent(CockpitPanel);
    panel.componentRef.setInput('extras', {
      tripKm: 12.34,
      averageKmh: 48.6,
      rangeKm: 61.9,
      limitKmh: 50,
      levels: { coolant: 'crit', range: 'warn' },
    });
    await store.startDemo();
    telemetry.demo.emit({ speed: 62 });
    panel.detectChanges();
    root = panel.nativeElement;
    expect(TILES.slice(0, 2).map(tile)).toEqual(['12.3 km', '49 km/h']);
    expect(tile('range')).toBe('62 km');
    expect(hook(root, 'cockpit-coolant').classList).toContain('crit');
    expect(hook(root, 'cockpit-range').classList).toContain('warn');
    expect(text('limit')).toBe('50');
    expect(hook(root, 'cockpit-limit').classList).toContain('over');
  });

  it('lights the rev bar up to the current rpm', async () => {
    await store.startDemo();
    telemetry.demo.emit({ rpm: 3500 });
    await render();

    // Half of the 7000 rpm scale.
    expect(segments('l')).toBe(18);
  });

  it('marks the warning and red zone from the vehicle profile', async () => {
    // 36 segments over 7000 rpm, redline 6000: warning from 80 % of it.
    expect(segments('w')).toBe(12);
    expect(segments('r')).toBe(6);

    store.setProfile({ ...store.profile(), redlineRpm: 4500, maxRpm: 6000 });
    await render();

    expect(segments('r')).toBe(10);
  });

  it('shows consumption per 100 km while driving and per hour while standing', async () => {
    await store.startDemo();
    telemetry.demo.emit({ rpm: 2400, speed: 60, massAirFlow: 10 });
    await render();
    expect(tile('consumption')).toBe('5.5 l/100');

    telemetry.demo.emit({ speed: 0 });
    await render();
    expect(tile('consumption')).toBe('3.3 l/h');
  });

  it('shows the polling rate only for the OBD adapter', async () => {
    await store.startDemo();
    telemetry.demo.emit({ rpm: 900 }, 4.26);
    await render();
    expect(text('mode')).toBe('telemetry.mode.demo');

    await store.connectObd();
    telemetry.obd.emit({ rpm: 900 }, 4.26);
    await render();
    expect(text('mode')).toBe('telemetry.mode.obd · 4.3 Hz');
  });

  it('clears the values and reconnects when the adapter drops out', async () => {
    await store.connectObd();
    telemetry.obd.emit({ speed: 50, rpm: 2000, coolantTemp: 90 });
    await render();

    telemetry.obd.end();
    await render();

    expect(text('speed')).toBe('0');
    expect(text('mode')).toBe('telemetry.mode.connecting');
    expect(tile('coolant')).toBe('– °C');
  });

  it('converts to other units', async () => {
    TestBed.inject(UnitsStore).set({ ...METRIC, distance: 'mi', temperature: 'f' });
    await store.startDemo();
    telemetry.demo.emit({ speed: 100, coolantTemp: 90 });
    await render();
    expect(text('speed')).toBe('62');
    expect(tile('coolant')).toBe('194 °F');
  });

  it('renders projected content between the head and the tiles', () => {
    const projected = hook(root, 'host-projected');
    const position = (other: Element) => projected.compareDocumentPosition(other);

    expect(position(hook(root, 'cockpit-rpm')) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    expect(
      position(hook(root, 'cockpit-consumption')) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
