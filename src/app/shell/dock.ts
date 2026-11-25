import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslatePipe } from '@core/i18n';
import { MaintenanceStore } from '@domains/maintenance';
import { TelemetryStore } from '@domains/telemetry';

interface DockApp {
  path: string;
  icon: string;
  /** gradient start and end */
  colors: [string, string];
}

/** The areas of the app, in dock order. A new domain adds one line here. */
export const DOCK_APPS: readonly DockApp[] = [
  { path: 'navigation', icon: 'navigation', colors: ['#5b9bff', '#2f6fea'] },
  { path: 'engine', icon: 'engine', colors: ['#ffa24a', '#e8781a'] },
  { path: 'chart', icon: 'chart-line', colors: ['#a78bfa', '#7c4ddf'] },
  { path: 'diagnostics', icon: 'stethoscope', colors: ['#ff7a7e', '#e0393f'] },
  { path: 'copilot', icon: 'sparkles', colors: ['#3ad1bd', '#0f9e8c'] },
  { path: 'fuel', icon: 'gas-station', colors: ['#47d38a', '#1a9c5a'] },
  { path: 'logbook', icon: 'route', colors: ['#4cc3ff', '#1784c7'] },
  { path: 'maintenance', icon: 'tool', colors: ['#c2a27a', '#8c6a43'] },
  { path: 'parking', icon: 'parking', colors: ['#6b8cff', '#3a55d9'] },
  { path: 'media', icon: 'music', colors: ['#ff4d6a', '#d9002b'] },
  { path: 'lighting', icon: 'bulb', colors: ['#ffd36b', '#f59e0b'] },
  { path: 'settings', icon: 'settings', colors: ['#8a919c', '#5a616c'] },
];

@Component({
  selector: 'app-dock',
  imports: [RouterLink, RouterLinkActive, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'panel' },
  template: `
    <nav class="apps" [attr.aria-label]="'app.dock.label' | translate">
      @for (app of apps; track app.path) {
        <a
          [attr.data-section-test]="'dock-open-' + app.path"
          class="ap"
          [routerLink]="app.path"
          routerLinkActive="on"
          [style.background]="'linear-gradient(160deg,' + app.colors[0] + ',' + app.colors[1] + ')'"
          [attr.aria-label]="'app.dock.' + app.path | translate"
        >
          <i class="ti" [class]="'ti-' + app.icon" aria-hidden="true"></i>
          @if (app.path === 'maintenance' && due()) {
            <span
              class="badge"
              [class.overdue]="maintenance.level() === 'overdue'"
              data-section-test="dock-badge-maintenance"
              role="img"
              [attr.aria-label]="'app.dock.due' | translate"
            ></span>
          }
        </a>
      }
    </nav>
    <div class="dr">
      <button
        class="db"
        type="button"
        [class.on]="mode() === 'obd'"
        data-section-test="dock-obd"
        (click)="toggleObd()"
      >
        <i class="ti ti-bluetooth" aria-hidden="true"></i>
        {{ (mode() === 'connecting' ? 'app.dock.connecting' : 'app.dock.obd') | translate }}
      </button>
      @if (demoEnabled) {
        <button
          class="db"
          type="button"
          [class.on]="mode() === 'demo'"
          data-section-test="dock-demo"
          (click)="toggleDemo()"
        >
          <i
            class="ti"
            [class]="mode() === 'demo' ? 'ti-player-stop' : 'ti-player-play'"
            aria-hidden="true"
          ></i>
          {{ 'app.dock.demo' | translate }}
        </button>
      }
    </div>
  `,
  styleUrl: './dock.scss',
})
export class Dock {
  private readonly telemetry = inject(TelemetryStore);
  protected readonly maintenance = inject(MaintenanceStore);
  protected readonly due = computed(() => ['soon', 'overdue'].includes(this.maintenance.level()));
  protected readonly apps = DOCK_APPS;
  protected readonly mode = this.telemetry.mode;
  protected readonly demoEnabled = this.telemetry.demoEnabled;

  protected toggleObd(): void {
    void (this.mode() === 'obd' || this.mode() === 'connecting'
      ? this.telemetry.stop()
      : this.telemetry.connectObd());
  }

  protected toggleDemo(): void {
    void (this.mode() === 'demo' ? this.telemetry.stop() : this.telemetry.startDemo());
  }
}
