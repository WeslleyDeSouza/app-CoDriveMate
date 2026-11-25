import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideI18nTesting } from '@core/i18n/testing';
import { hook, textOf } from '@shared/testing';
import { ComingSoonPage } from './coming-soon-page';

describe('ComingSoonPage', () => {
  async function open(url: string): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'fuel',
            component: ComingSoonPage,
            data: { titleKey: 'app.dock.fuel', icon: 'gas-station' },
          },
          { path: 'plain', component: ComingSoonPage, data: { titleKey: 'app.dock.plain' } },
        ]),
        provideI18nTesting(),
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, ComingSoonPage);
    harness.detectChanges();
    return harness.routeNativeElement!;
  }

  it('shows title and icon from the route data', async () => {
    const root = await open('/fuel');

    expect(textOf(hook(root, 'fuel-title'))).toBe('app.dock.fuel');
    expect(hook(root, 'fuel-coming-soon').querySelector('i')!.classList).toContain(
      'ti-gas-station',
    );
    expect(textOf(hook(root, 'fuel-coming-soon'))).toBe('app.common.coming_soon');
  });

  it('falls back to the clock icon', async () => {
    const root = await open('/plain');

    expect(hook(root, 'plain-coming-soon').querySelector('i')!.classList).toContain('ti-clock');
  });
});
