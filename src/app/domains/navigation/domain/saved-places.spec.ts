import { NO_PLACES, SavedPlaces, favouriteOf } from './saved-places';

describe('saved places', () => {
  const places: SavedPlaces = {
    ...NO_PLACES,
    home: { name: 'Daheim', detail: 'Uster', coordinate: [8.72, 47.35] },
    // Found by a service that does not allow keeping coordinates.
    work: { name: 'Büro', detail: 'Zürich', coordinate: null },
  };

  it('knows a destination as home or work', () => {
    const home = { name: 'Zuhause', detail: '', coordinate: [8.7201, 47.3501] as const };
    expect(favouriteOf(places, home)).toBe('home');
    const work = { name: 'Büro', detail: 'Zürich', coordinate: [8.54, 47.38] as const };
    expect(favouriteOf(places, work)).toBe('work');
    const pool = { name: 'Hallenbad', detail: 'Uster', coordinate: [8.6, 47.3] as const };
    expect(favouriteOf(places, pool)).toBeNull();
    expect(favouriteOf(NO_PLACES, home)).toBeNull();
  });
});
