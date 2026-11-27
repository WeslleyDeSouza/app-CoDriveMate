import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AssistantTool } from '@core/assistant';
import { provideI18nTesting } from '@core/i18n/testing';
import { PositionStore } from '@domains/navigation';
import { navigationTesting } from '@domains/navigation/testing';
import { scene3dTesting } from '@domains/scene3d/testing';
import { DEFAULT_SETTINGS, SettingsStore } from '@domains/settings';
import { telemetryTesting } from '@domains/telemetry/testing';
import { parkingTesting } from '../testing';
import { ParkingStore } from './parking.store';
import { parkingTimerTool, parkingTool } from './parking.tools';

describe('parking tools', () => {
  let nav: ReturnType<typeof navigationTesting>;
  let parking: ReturnType<typeof parkingTesting>;
  let remember: AssistantTool;
  let timer: AssistantTool;
  const context = { confirm: async () => true };

  beforeEach(async () => {
    vi.useFakeTimers();
    nav = navigationTesting();
    parking = parkingTesting();
    nav.gps.allowed = true;
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        ...telemetryTesting().providers,
        ...nav.providers,
        ...scene3dTesting().providers,
        ...parking.providers,
        { provide: SettingsStore, useValue: { settings: signal(DEFAULT_SETTINGS) } },
      ],
    });
    await TestBed.inject(PositionStore).start(false);
    remember = TestBed.runInInjectionContext(parkingTool);
    timer = TestBed.runInInjectionContext(parkingTimerTool);
  });

  afterEach(() => vi.useRealTimers());

  const set = (minutes: unknown) => timer.run({ minutes }, context);

  it('remembers the spot once the position is known', async () => {
    expect(await remember.run({}, context)).toBe('The position of the car is not known yet.');
    nav.gps.emit([8.54, 47.38]);
    expect(await remember.run({}, context)).toBe('Parking spot saved.');
    expect(parking.repository.spot?.at).toEqual([8.54, 47.38]);
  });

  it('needs a saved spot for the meter', async () => {
    expect(await set(30)).toBe('No parking spot is saved yet. Use remember_parking first.');
    expect(parking.reminders.scheduled).toHaveLength(0);
  });

  it('sets the meter with its reminders and switches it off', async () => {
    nav.gps.emit([8.54, 47.38]);
    await remember.run({}, context);

    const answer = await set(45);
    expect(answer).toBe(
      'Parking meter set to 45 minutes. Reminders come 10 minutes before the end and at the end.',
    );
    expect(TestBed.inject(ParkingStore).minutesLeft()).toBe(45);
    expect(parking.reminders.scheduled).toHaveLength(2);

    expect(await set(5)).toBe('Parking meter set to 5 minutes. A reminder comes at the end.');
    expect(parking.reminders.scheduled).toHaveLength(1);

    expect(await set(0)).toBe('Parking meter switched off.');
    expect(parking.repository.spot?.until).toBeNull();
    expect(parking.reminders.scheduled).toHaveLength(0);
  });

  it('finds a spot that was stored before', async () => {
    parking.repository.spot = {
      at: [8.54, 47.38],
      since: 1,
      street: 'Seestrasse',
      note: '',
      until: null,
      reminded: [],
    };
    const answer = await set(30);
    expect(answer).toContain('set to 30 minutes');
    expect(answer).not.toMatch(/Seestrasse|8\.54|47\.38/);
  });

  it('says when notifications are not allowed', async () => {
    parking.reminders.allowed = false;
    nav.gps.emit([8.54, 47.38]);
    await remember.run({}, context);
    expect(await set(30)).toContain('only come while the app is open');
    expect(parking.repository.spot?.until).not.toBeNull();
  });

  it.each([undefined, '30', 2.5, -1, 721, Number.NaN])('rejects %s minutes', async (minutes) => {
    nav.gps.emit([8.54, 47.38]);
    await remember.run({}, context);
    expect(await set(minutes)).toBe('The minutes must be a whole number from 0 to 720.');
    expect(parking.repository.spot?.until).toBeNull();
  });
});
