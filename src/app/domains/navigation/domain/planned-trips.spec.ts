import {
  MAX_NOTE,
  PlannedTrip,
  cleanPurpose,
  dayOf,
  dueToday,
  favouriteTrips,
  hasPurpose,
  purposeText,
  sortedTrips,
  spokenDay,
  validTrips,
  whenOf,
  withTrip,
  withoutTrip,
} from './planned-trips';

const trip = (id: string, day: string | null, extra: Partial<PlannedTrip> = {}): PlannedTrip => ({
  id,
  place: { name: 'Hallenbad ' + id, detail: '', coordinate: [8.5, 47.4] },
  topic: 'Schwimmen',
  note: '',
  day,
  favourite: false,
  createdAt: 1,
  ...extra,
});

const TODAY = '2026-11-26';

describe('planned trips', () => {
  it('knows the local day', () => {
    expect(dayOf(new Date(2026, 0, 5, 23, 30).getTime())).toBe('2026-01-05');
  });

  it('puts today first, then the next days, any day, and the past last', () => {
    const trips = [
      trip('past', '2026-11-20'),
      trip('any', null),
      trip('later', '2026-12-10'),
      trip('today', TODAY),
      trip('soon', '2026-11-28'),
    ];
    expect(sortedTrips(trips, TODAY).map(({ id }) => id)).toEqual([
      'today',
      'soon',
      'later',
      'any',
      'past',
    ]);
    expect(whenOf(trips[0], TODAY)).toBe('past');
  });

  it('finds what is due today, the first saved first', () => {
    const trips = [trip('b', TODAY, { createdAt: 5 }), trip('a', TODAY), trip('c', null)];
    expect(dueToday(trips, TODAY).map(({ id }) => id)).toEqual(['a', 'b']);
  });

  it('cleans topic and note', () => {
    const purpose = cleanPurpose('  Schwimmen \n ', 'x'.repeat(400));
    expect(purpose.topic).toBe('Schwimmen');
    expect(purpose.note).toHaveLength(MAX_NOTE);
    expect(hasPurpose(cleanPurpose(' ', ''))).toBe(false);
  });

  it('replaces a changed trip and removes one', () => {
    const trips = withTrip([trip('a', null), trip('b', null)], trip('a', TODAY));
    expect(trips.map(({ id, day }) => [id, day])).toEqual([
      ['a', TODAY],
      ['b', null],
    ]);
    expect(withoutTrip(trips, 'a').map(({ id }) => id)).toEqual(['b']);
  });

  it('lists favourites by name', () => {
    const trips = [
      trip('z', null, { favourite: true, topic: 'Zoo' }),
      trip('n', null),
      trip('a', null, { favourite: true, topic: 'Aare' }),
    ];
    expect(favouriteTrips(trips).map(({ id }) => id)).toEqual(['a', 'z']);
  });

  it('marks the words of the driver as their words', () => {
    expect(purposeText({ topic: 'Schwimmen', note: 'Badetuch' })).toBe(
      'reason: "Schwimmen", driver\'s note: "Badetuch"',
    );
    expect(purposeText({ topic: '', note: 'Badetuch' })).toBe('driver\'s note: "Badetuch"');
  });

  it('leaves out stored trips of another shape', () => {
    expect(validTrips(undefined)).toEqual([]);
    expect(validTrips([trip('a', TODAY), { id: 'x' }, trip('b', '26.11.2026')])).toEqual([
      trip('a', TODAY),
    ]);
  });
});

describe('spoken day', () => {
  // Thursday, 26 November 2026
  const NOW = new Date(2026, 10, 26, 9).getTime();

  it('takes the next weekday, today if it is that day', () => {
    expect(spokenDay(NOW, 'saturday')).toBe('2026-11-28');
    expect(spokenDay(NOW, 'Thursday')).toBe('2026-11-26');
    expect(spokenDay(NOW, 'monday')).toBe('2026-11-30');
  });

  it('counts days from today, across months', () => {
    expect(spokenDay(NOW, undefined, 0)).toBe('2026-11-26');
    expect(spokenDay(NOW, undefined, 7)).toBe('2026-12-03');
  });

  it('is any day without a usable day', () => {
    expect(spokenDay(NOW)).toBeNull();
    expect(spokenDay(NOW, 'someday')).toBeNull();
    expect(spokenDay(NOW, undefined, -1)).toBeNull();
    expect(spokenDay(NOW, undefined, 1.5)).toBeNull();
  });
});
