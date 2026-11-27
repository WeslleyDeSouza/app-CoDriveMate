import { TestBed } from '@angular/core/testing';
import { AssistantTool } from '@core/assistant';
import { telemetryTesting } from '@domains/telemetry/testing';
import { DEFAULT_PLAN, MaintenancePlan } from '../domain/maintenance';
import { maintenanceTesting } from '../testing';
import { maintenanceStatusTool } from './maintenance.tools';

describe('maintenance_status', () => {
  let repository: ReturnType<typeof maintenanceTesting>['repository'];
  let tool: AssistantTool;
  const context = { confirm: async () => true };

  function setup(stored?: Partial<MaintenancePlan>): void {
    const maintenance = maintenanceTesting();
    repository = maintenance.repository;
    repository.plan = stored;
    TestBed.configureTestingModule({
      providers: [...telemetryTesting().providers, ...maintenance.providers],
    });
    tool = TestBed.runInInjectionContext(maintenanceStatusTool);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 24, 12));
  });

  afterEach(() => vi.useRealTimers());

  it('names what is due, what comes next and what was never entered', async () => {
    const [service, oil, brake, plugs, belt] = DEFAULT_PLAN.items;
    setup({
      odometerKm: 100_000,
      inspectionDate: '2026-12-24',
      vignetteYear: 2026,
      items: [
        { ...service, lastKm: 79_500 },
        { ...oil, lastKm: 95_000, lastDate: new Date(2026, 5, 24, 12).getTime() },
        { ...brake, lastDate: new Date(2024, 11, 10, 12).getTime() },
        plugs,
        belt,
        { ...plugs, id: 'own-1', name: 'Reifen', intervalKm: 0 },
      ],
    });
    expect(await tool.run({}, context)).toBe(
      'Overdue: service (500 km over). ' +
        'Due soon: brake fluid (16 days left); vehicle inspection (MFK) (30 days left). ' +
        'Next: oil change (10000 km left, 212 days left). ' +
        'Not entered yet: spark plugs, timing belt, Reifen.',
    );
    expect(repository.saved).toEqual([]);
  });

  it('tells of a past inspection and an expired vignette', async () => {
    setup({ inspectionDate: '2026-11-20', vignetteYear: 2025 });
    expect(await tool.run({}, context)).toContain(
      'Overdue: vehicle inspection (MFK) (4 days over); motorway vignette 2025 (expired).',
    );
  });

  it('warns of a vignette that runs out', async () => {
    vi.setSystemTime(new Date(2026, 11, 10, 12));
    setup({ vignetteYear: 2026 });
    expect(await tool.run({}, context)).toContain(
      'Due soon: motorway vignette 2026 (valid until 31 January 2027).',
    );
  });

  it('says so while nothing was entered', async () => {
    setup();
    expect(await tool.run({}, context)).toBe(
      'Nothing is due. Not entered yet: service, oil change, brake fluid, spark plugs, ' +
        'timing belt, vehicle inspection (MFK), motorway vignette.',
    );
  });

  it('does not throw when the plan cannot be read', async () => {
    const log = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    setup();
    repository.loadError = new Error('locked');
    expect(await tool.run({}, context)).toBe('The maintenance plan could not be read.');
    log.mockRestore();
  });
});
