import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@core/i18n';
import { AdapterStore } from '../application/adapter.store';
import { TestStep, TestStepId } from '../domain/adapter';

const ICONS: Record<TestStep['state'], string> = {
  waiting: 'circle',
  running: 'loader-2',
  ok: 'circle-check',
  failed: 'alert-circle',
  skipped: 'circle-minus',
};

/** Result of the connection test, step by step. */
@Component({
  selector: 'app-adapter-test',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (adapters.steps().length) {
      <ol data-section-test="obd-test-steps" aria-live="polite">
        @for (step of adapters.steps(); track step.id) {
          <li [class]="step.state" [attr.data-section-test]="'obd-test-' + step.id">
            <i class="ti" [class]="'ti-' + icons[step.state]" aria-hidden="true"></i>
            <div>
              <b>{{ 'telemetry.obd.step.' + step.id | translate }}</b>
              @if (step.detail) {
                <small>{{ step.detail }}</small>
              }
              @if (step.state === 'failed') {
                <small>{{ helpKey(step.id) | translate }}</small>
              }
            </div>
          </li>
        }
      </ol>
    }
  `,
  styles: `
    ol {
      list-style: none;
      display: grid;
      gap: 10px;
      margin: 12px 0;
    }
    li {
      display: flex;
      gap: 12px;
    }
    i {
      font-size: 22px;
      color: var(--s);
    }
    b {
      font-weight: 600;
      font-size: 15px;
    }
    small {
      display: block;
      color: var(--s);
      font-size: 13px;
      line-height: 1.5;
    }
    .ok i {
      color: var(--ok);
    }
    .failed i {
      color: var(--ba);
    }
    .running i {
      color: var(--a);
      animation: turn 1s linear infinite;
    }
    @keyframes turn {
      to {
        transform: rotate(360deg);
      }
    }
  `,
})
export class AdapterTest {
  protected readonly adapters = inject(AdapterStore);

  protected helpKey(id: TestStepId): string {
    const kind = this.adapters.settings().adapter?.kind ?? 'ble';
    return `telemetry.obd.help.${id}${id === 'connect' && kind !== 'ble' ? '_' + kind : ''}`;
  }

  protected readonly icons = ICONS;
}
