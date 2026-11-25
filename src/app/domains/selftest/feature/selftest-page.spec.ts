import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideI18nTesting } from '@core/i18n/testing';
import { hook, textOf } from '@shared/testing';
import { Probe, ProbeSource, SkipProbe } from '../domain/selftest';
import { SelftestPage } from './selftest-page';

describe('SelftestPage', () => {
  let fixture: ComponentFixture<SelftestPage>;
  let root: HTMLElement;
  let manual = 0;

  beforeEach(() => {
    manual = 0;
    const probe = (id: string, run: () => Promise<string>, asks = false): Probe => ({
      id,
      group: 'device',
      manual: asks,
      run,
    });
    const probes = [
      probe('good', async () => 'fine'),
      probe('bad', () => Promise.reject(new Error('key=secret'))),
      probe('none', () => Promise.reject(new SkipProbe('No key'))),
      probe('asks', async () => String(++manual), true),
    ];
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideI18nTesting(),
        { provide: ProbeSource, useValue: { probes: () => probes } },
      ],
    });
    fixture = TestBed.createComponent(SelftestPage);
    root = fixture.nativeElement;
    fixture.detectChanges();
  });

  async function press(name: string): Promise<void> {
    hook(root, name).click();
    for (let i = 0; i < 8; i++) await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
  }

  it('runs everything that needs no help', async () => {
    await press('selftest-run');
    expect(hook(root, 'selftest-good').classList).toContain('ok');
    expect(hook(root, 'selftest-bad').classList).toContain('failed');
    expect(textOf(hook(root, 'selftest-bad'))).not.toContain('secret');
    expect(hook(root, 'selftest-none').classList).toContain('skipped');
    expect(manual).toBe(0);
    await press('selftest-run-asks');
    expect(manual).toBe(1);
  });
});
