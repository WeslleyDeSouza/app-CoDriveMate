import {
  DEFAULT_PLAN,
  MaintenanceItem,
  afterDriving,
  dueStatus,
  fromIsoDate,
  inspectionLevel,
  normalizePlan,
  planFromLegacy,
  toIsoDate,
  usedShare,
  vignetteLevel,
  withDone,
  withItem,
  withNewItem,
  withoutItem,
  worstLevel,
} from './maintenance';

const NOW = new Date(2026, 10, 24).getTime();
const oil: MaintenanceItem = {
  id: 'oil',
  name: '',
  icon: 'ti-droplet',
  intervalKm: 15000,
  intervalMonths: 12,
  lastKm: 100000,
  lastDate: new Date(2026, 5, 24).getTime(),
};

describe('dueStatus', () => {
  it('is ok with plenty of distance and time left', () => {
    const status = dueStatus(oil, 105000, NOW);
    expect(status.remainingKm).toBe(10000);
    expect(status.remainingDays).toBe(212);
    expect(status.level).toBe('ok');
  });

  it('is soon below 1000 km or 30 days', () => {
    expect(dueStatus(oil, 114500, NOW).level).toBe('soon');
    const lastYear = { ...oil, lastDate: new Date(2025, 11, 10).getTime() };
    expect(dueStatus(lastYear, 101000, NOW).level).toBe('soon');
  });

  it('is overdue when either limit is reached', () => {
    expect(dueStatus(oil, 115000, NOW).level).toBe('overdue');
    const old = { ...oil, lastDate: new Date(2025, 10, 1).getTime() };
    expect(dueStatus(old, 101000, NOW).level).toBe('overdue');
  });

  it('is unknown until a job was recorded', () => {
    const never = { ...oil, lastKm: null, lastDate: null };
    expect(dueStatus(never, 105000, NOW).level).toBe('unknown');
  });

  it('ignores the distance when the odometer is unknown', () => {
    const status = dueStatus(oil, null, NOW);
    expect(status.remainingKm).toBeNull();
    expect(status.level).toBe('ok');
  });
});

describe('planFromLegacy', () => {
  it('maps the prototype data', () => {
    const plan = planFromLegacy({
      km: 187000,
      kmT: 5,
      mfk: '2027-03-01',
      vig: 2026,
      items: [{ id: 'oil', n: 'Ölwechsel', ic: 'ti-droplet', km: 15000, mo: 12, lastKm: 180000 }],
    });
    expect(plan.odometerKm).toBe(187000);
    expect(plan.inspectionDate).toBe('2027-03-01');
    expect(plan.vignetteYear).toBe(2026);
    expect(plan.items).toEqual([{ ...oil, lastKm: 180000, lastDate: null }]);
  });

  it('keeps the default jobs when none were stored', () => {
    expect(planFromLegacy({}).items).toEqual(DEFAULT_PLAN.items);
  });
});

describe('names', () => {
  it('keeps renamed and own jobs, translates the old standard names', () => {
    const items = [
      { ...oil, name: 'Ölwechsel' },
      { ...oil, id: 'brake', name: 'Bremsen' },
      { ...oil, id: 'own-1', name: 'Ölwechsel' },
    ];
    const names = normalizePlan({ items }).items.map((item) => item.name);
    expect(names).toEqual(['', 'Bremsen', 'Ölwechsel']);
    const legacy = planFromLegacy({ items: [{ id: 'belt', n: 'Kette' }, { id: 'x' }] });
    expect(legacy.items.map((item) => item.name)).toEqual(['Kette', 'x']);
  });

  it('fills in what a stored plan does not have', () => {
    expect(normalizePlan(undefined)).toEqual(DEFAULT_PLAN);
    const partial = { id: 'oil', name: 'Ölwechsel', lastKm: 7 } as MaintenanceItem;
    const plan = normalizePlan({ odometerKm: 5, items: [partial] });
    expect(plan).toMatchObject({ odometerKm: 5, inspectionDate: '', vignetteYear: 0 });
    expect(plan.items[0]).toMatchObject({ name: '', intervalKm: 0, lastKm: 7, lastDate: null });
  });
});

describe('inspection', () => {
  it.each([
    ['', 'unknown'],
    ['0027-01-01', 'unknown'],
    ['2026-11-23', 'overdue'],
    ['2026-11-24', 'soon'],
    ['2027-01-22', 'soon'],
    ['2027-01-23', 'ok'],
  ])('on "%s" is %s', (date, level) => {
    expect(inspectionLevel(date, NOW + 15 * 3_600_000)).toBe(level);
  });
});

describe('vignette', () => {
  it.each([
    [0, new Date(2026, 5, 1), 'unknown'],
    [2026, new Date(2026, 10, 30), 'ok'],
    [2026, new Date(2026, 11, 1), 'soon'],
    [2026, new Date(2027, 0, 31, 23, 59), 'soon'],
    [2026, new Date(2027, 1, 1), 'overdue'],
    [2027, new Date(2026, 11, 10), 'ok'],
  ])('%s on %s is %s', (year, now, level) => {
    expect(vignetteLevel(year, now.getTime())).toBe(level);
  });
});

describe('helpers', () => {
  it('finds the worst level', () => {
    expect(worstLevel([])).toBe('unknown');
    expect(worstLevel(['unknown', 'ok'])).toBe('ok');
    expect(worstLevel(['soon', 'overdue', 'ok'])).toBe('overdue');
  });

  it('converts local dates', () => {
    expect(toIsoDate(NOW)).toBe('2026-11-24');
    expect(fromIsoDate('2026-11-24')).toBe(NOW);
    expect(fromIsoDate('')).toBeNull();
  });

  it('shows the interval that is used up most', () => {
    const share = (km: number) => usedShare(oil, dueStatus(oil, km, NOW), NOW);
    expect(share(112000)).toBeCloseTo(0.8);
    expect(share(100000)).toBeCloseTo(0.42, 1);
    expect(share(999999)).toBe(1);
  });
});

describe('odometer', () => {
  const plan = { ...DEFAULT_PLAN, odometerKm: 1000 };

  it('counts driving', () => {
    expect(afterDriving(plan, 72, 50).odometerKm).toBeCloseTo(1001);
  });

  it('counts nothing while standing or unknown', () => {
    expect(afterDriving(plan, 1, 50)).toBe(plan);
    expect(afterDriving(DEFAULT_PLAN, 72, 50)).toBe(DEFAULT_PLAN);
  });
});

describe('editing', () => {
  it('records a job at the rounded odometer reading', () => {
    const [service, other] = withDone({ ...DEFAULT_PLAN, odometerKm: 9.6 }, 'service', NOW).items;
    expect(service).toMatchObject({ lastKm: 10, lastDate: NOW });
    expect(other.lastKm).toBeNull();
  });

  it('adds and removes own jobs only', () => {
    const plan = withNewItem(withNewItem(DEFAULT_PLAN, 'Reifen'), 'Klima');
    expect(plan.items.slice(5).map((item) => item.id)).toEqual(['own-1', 'own-2']);
    expect(withoutItem(plan, 'own-1').items).toHaveLength(6);
    expect(withoutItem(plan, 'oil')).toBe(plan);
  });

  it('never leaves an own job without a name', () => {
    const plan = withNewItem(DEFAULT_PLAN, 'Reifen');
    expect(withItem(plan, 'own-1', { name: '' }).items[5].name).toBe('Reifen');
    expect(withItem(plan, 'oil', { name: '' }).items[1].name).toBe('');
  });
});
