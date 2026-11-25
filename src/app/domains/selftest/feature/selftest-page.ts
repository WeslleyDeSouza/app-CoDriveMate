import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { TranslatePipe } from '@core/i18n';
import { SheetPage } from '@shared/ui/sheet-page';
import { SelftestStore } from '../application/selftest.store';
import { ProbeGroup, ProbeState } from '../domain/selftest';

const GROUPS: readonly ProbeGroup[] = ['device', 'input', 'native', 'service', 'key'];
const ICONS: Record<ProbeState, string> = {
  idle: 'ti-circle',
  running: 'ti-loader',
  ok: 'ti-circle-check',
  failed: 'ti-circle-x',
  skipped: 'ti-circle-minus',
};

/** Checks device, plugins, services and keys; for the first start on a real device. */
@Component({
  selector: 'app-selftest-page',
  imports: [SheetPage, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [SelftestStore],
  template: `
    <app-sheet-page section="selftest" [title]="'selftest.title' | translate">
      <p class="hint">{{ 'selftest.note' | translate }}</p>
      <div class="row">
        <button
          class="btn pri"
          type="button"
          data-section-test="selftest-run"
          [disabled]="store.running()"
          (click)="store.runAll()"
        >
          <i class="ti ti-player-play" aria-hidden="true"></i>{{ 'selftest.run' | translate }}
        </button>
        <button class="btn" type="button" data-section-test="selftest-share" (click)="share()">
          <i class="ti ti-share" aria-hidden="true"></i>
          {{ (copied() ? 'selftest.copied' : 'selftest.share') | translate }}
        </button>
      </div>
      @for (group of groups; track group) {
        <h3 class="sec-title">{{ 'selftest.group.' + group | translate }}</h3>
        <ul>
          @for (result of store.results(); track result.id) {
            @if (result.group === group) {
              <li [attr.data-section-test]="'selftest-' + result.id" [class]="result.state">
                <i class="ti" [class]="icons[result.state]" aria-hidden="true"></i>
                <span>
                  <b>{{ result.id }}</b>
                  <small>{{ result.detail }}</small>
                </span>
                @if (result.manual) {
                  <button
                    class="btn"
                    type="button"
                    [attr.data-section-test]="'selftest-run-' + result.id"
                    [disabled]="store.running()"
                    (click)="store.run(result.id)"
                  >
                    {{ 'selftest.run_one' | translate }}
                  </button>
                }
              </li>
            }
          }
        </ul>
      }
    </app-sheet-page>
  `,
  styles: `
    .hint {
      color: var(--s);
      font-size: 14px;
      margin-bottom: 12px;
    }
    .btn:not(.pri) {
      background: var(--p3);
    }
    ul {
      list-style: none;
      display: grid;
      gap: 6px;
    }
    li {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 52px;
      padding: 4px 12px;
      border-radius: 12px;
      background: var(--p2);

      i {
        font-size: 22px;
        color: var(--s);
      }
      span {
        flex: 1;
        min-width: 0;
      }
      small {
        display: block;
        color: var(--s);
        overflow-wrap: anywhere;
      }
    }
    .ok > i {
      color: var(--ok);
    }
    .failed > i {
      color: var(--ba);
    }
  `,
})
export class SelftestPage {
  protected readonly store = inject(SelftestStore);
  protected readonly groups = GROUPS;
  protected readonly icons = ICONS;
  protected readonly copied = signal(false);

  /** Shares the report, or copies it where nothing can be shared. */
  protected async share(): Promise<void> {
    const text = this.store.report();
    try {
      if (navigator.share) await navigator.share({ text });
      else await navigator.clipboard.writeText(text);
      this.copied.set(true);
    } catch {
      // Cancelled by the user.
    }
  }
}
