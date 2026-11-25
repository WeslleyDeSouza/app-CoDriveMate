import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, untracked } from '@angular/core';
import { CloudVoice } from '@core/device';
import { UnitsStore } from '@core/units';
import { SettingsStore, cloudVoice } from '@domains/settings';
import { TelemetryStore } from '@domains/telemetry';
import { isLightTheme } from '@shared/kernel/theme';
import { Shell } from '@shell/shell';

@Component({
  selector: 'app-root',
  imports: [Shell],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-shell />`,
})
export class App {
  constructor() {
    const document = inject(DOCUMENT);
    const settings = inject(SettingsStore).settings;
    const telemetry = inject(TelemetryStore);

    effect(() => {
      document.body.classList.toggle('light', isLightTheme(settings().theme));
    });

    const units = inject(UnitsStore);
    effect(() => units.set(settings().units));

    const speaker = inject(CloudVoice);
    effect(() => {
      speaker.configure(cloudVoice(settings()));
    });

    // The vehicle entered in the settings drives all vehicle-dependent rules.
    effect(() => {
      const { name, fuelType, displacementL, tankL } = settings().vehicle;
      const current = untracked(telemetry.profile);
      telemetry.setProfile({ ...current, name, fuelType, displacementL, tankL });
    });
  }
}
