import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideI18nTesting } from '@core/i18n/testing';
import { MapPinsStore, NavigationStore, PositionStore } from '@domains/navigation';
import { navigationTesting } from '@domains/navigation/testing';
import { scene3dTesting } from '@domains/scene3d/testing';
import { DEFAULT_SETTINGS, SettingsStore } from '@domains/settings';
import { telemetryTesting } from '@domains/telemetry/testing';
import { findHook, hook, textOf } from '@shared/testing';
import { ParkingStore } from '../application/parking.store';
import { parkingTesting } from '../testing';
import { ParkingPage } from './parking-page';

describe('ParkingPage', () => {
  let fixture: ComponentFixture<ParkingPage>;
  let root: HTMLElement;
  let nav: ReturnType<typeof navigationTesting>;
  let parking: ReturnType<typeof parkingTesting>;

  beforeEach(async () => {
    nav = navigationTesting();
    parking = parkingTesting();
    nav.gps.allowed = true;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideI18nTesting(),
        ...telemetryTesting().providers,
        ...nav.providers,
        ...scene3dTesting().providers,
        ...parking.providers,
        { provide: SettingsStore, useValue: { settings: signal(DEFAULT_SETTINGS) } },
      ],
    });
    await TestBed.inject(PositionStore).start(false);
    fixture = TestBed.createComponent(ParkingPage);
    root = fixture.nativeElement;
    await settle();
  });

  async function settle(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      fixture.detectChanges();
      await new Promise((resolve) => setTimeout(resolve));
    }
    fixture.detectChanges();
  }

  async function press(name: string): Promise<void> {
    hook(root, name).click();
    await settle();
  }

  it('says so while the position is unknown', async () => {
    await press('parking-here');
    expect(findHook(root, 'parking-no-position')).not.toBeNull();
    expect(parking.repository.spot).toBeUndefined();
  });

  it('stores the spot, shows it on the map and deletes it', async () => {
    nav.gps.emit([8.54, 47.38]);
    await press('parking-here');
    expect(parking.repository.spot?.at).toEqual([8.54, 47.38]);
    expect(TestBed.inject(MapPinsStore).pins()[0].coordinate).toEqual([8.54, 47.38]);

    await press('parking-show');
    expect(TestBed.inject(MapPinsStore).focus()?.coordinate).toEqual([8.54, 47.38]);

    await press('parking-delete');
    expect(parking.repository.spot).toBeUndefined();
    expect(TestBed.inject(MapPinsStore).pins()).toEqual([]);
  });

  it('sets the meter with two reminders and removes them again', async () => {
    nav.gps.emit([8.54, 47.38]);
    await press('parking-here');
    await press('parking-meter-30');
    expect(parking.reminders.scheduled).toHaveLength(2);
    expect(textOf(hook(root, 'parking-timer'))).toContain('parking.left');
    await press('parking-meter-off');
    expect(parking.reminders.scheduled).toHaveLength(0);
    expect(textOf(hook(root, 'parking-timer'))).toContain('parking.no_meter');
  });

  it('says when notifications are not allowed', async () => {
    parking.reminders.allowed = false;
    nav.gps.emit([8.54, 47.38]);
    await press('parking-here');
    await press('parking-meter-30');
    expect(textOf(hook(root, 'parking-hint'))).toBe('parking.hint_silent');
  });

  it('guides back to the car', async () => {
    nav.gps.emit([8.54, 47.38]);
    await press('parking-here');
    const go = vi.spyOn(TestBed.inject(NavigationStore), 'navigateTo').mockResolvedValue(true);
    await press('parking-guide');
    expect(go).toHaveBeenCalledWith(expect.objectContaining({ coordinate: [8.54, 47.38] }));
  });

  it('hands the way back over to a phone', async () => {
    nav.gps.emit([8.54, 47.38]);
    await press('parking-here');
    expect(hook(root, 'parking-qr').dataset['link']).toBe(
      'https://maps.apple.com/?daddr=47.380000,8.540000&dirflg=w',
    );
    await press('parking-qr-google');
    expect(hook(root, 'parking-qr').dataset['link']).toContain('destination=47.380000%2C8.540000');
  });

  it('finds car parks, the nearest first', async () => {
    nav.gps.emit([8.54, 47.38]);
    const park = (name: string, lat: number) => ({
      id: name,
      name,
      address: '',
      at: [8.54, lat] as const,
    });
    parking.carParks.parks = [park('Far', 47.39), park('Near', 47.381)];
    await press('parking-find');
    expect(textOf(hook(root, 'parking-park-0'))).toContain('Near');
    const go = vi.spyOn(TestBed.inject(NavigationStore), 'navigateTo').mockResolvedValue(true);
    await press('parking-park-0');
    expect(go).toHaveBeenCalledWith(expect.objectContaining({ name: 'Near' }));

    parking.carParks.parks = new Error('offline');
    await press('parking-find');
    expect(textOf(hook(root, 'parking-find-state'))).toBe('parking.find_state.failed');
  });

  it('keeps the note', async () => {
    nav.gps.emit([8.54, 47.38]);
    await press('parking-here');
    const note = hook<HTMLInputElement>(root, 'parking-note');
    note.value = ' Ebene -2 ';
    note.dispatchEvent(new Event('change'));
    await settle();
    expect(parking.repository.spot?.note).toBe('Ebene -2');
    expect(TestBed.inject(ParkingStore).spot()?.note).toBe('Ebene -2');
  });
});
