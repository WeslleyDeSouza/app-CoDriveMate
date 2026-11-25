import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@core/i18n';
import { TelemetryStore } from '@domains/telemetry';
import { SheetPage } from '@shared/ui/sheet-page';
import { DiagnosticsStore } from '../application/diagnostics.store';
import { KNOWN_CODES } from '../domain/fault-codes';

@Component({
  selector: 'app-diagnostics-page',
  imports: [RouterLink, SheetPage, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-sheet-page section="diagnostics" [title]="'diagnostics.title' | translate">
      <div class="m" data-section-test="diagnostics-lamp">
        <small
          ><i class="ti ti-engine" aria-hidden="true"></i
          >{{ 'diagnostics.lamp' | translate }}</small
        >
        <b [class.on]="store.lamp()">
          {{ 'diagnostics.lamp_state.' + (store.lamp() ?? 'unknown') | translate }}
        </b>
      </div>
      <div class="row actions">
        <button
          class="btn pri"
          type="button"
          data-section-test="diagnostics-read"
          [disabled]="busy()"
          (click)="store.read()"
        >
          <i class="ti ti-search" aria-hidden="true"></i>{{ 'diagnostics.read' | translate }}
        </button>
        @if (store.codes().length) {
          <a
            class="btn"
            routerLink="/copilot"
            [queryParams]="{ ask: 'codes' }"
            data-section-test="diagnostics-ask"
          >
            <i class="ti ti-sparkles" aria-hidden="true"></i>{{ 'diagnostics.ask' | translate }}
          </a>
        }
        @if (store.readAt()) {
          <button
            class="btn"
            type="button"
            data-section-test="diagnostics-clear"
            [class.sure]="sure()"
            [disabled]="busy()"
            (click)="clear()"
          >
            <i class="ti ti-trash" aria-hidden="true"></i>
            {{ (sure() ? 'diagnostics.clear_sure' : 'diagnostics.clear') | translate }}
          </button>
        }
      </div>
      @if (sure()) {
        <p class="hint" role="status">{{ 'diagnostics.clear_note' | translate }}</p>
      }
      @if (store.state() !== 'idle') {
        <p class="hint" role="status" data-section-test="diagnostics-state">
          {{ 'diagnostics.state.' + store.state() | translate }}
        </p>
      }
      <ul>
        @for (code of store.codes(); track code) {
          <li class="m" [attr.data-section-test]="'diagnostics-code-' + code">
            <code>{{ code }}</code>
            <span>
              {{
                (known(code) ? 'diagnostics.code.' + code : 'diagnostics.code_unknown') | translate
              }}
            </span>
          </li>
        } @empty {
          @if (store.readAt()) {
            <li class="m" data-section-test="diagnostics-none">
              {{ 'diagnostics.none' | translate }}
            </li>
          }
        }
      </ul>
      @if (store.readAt(); as at) {
        <p class="hint">
          {{ 'diagnostics.read_at' | translate: { time: time(at) } }}
          @if (demo()) {
            {{ 'diagnostics.demo' | translate }}
          }
        </p>
      }
      <p class="hint">{{ 'diagnostics.readonly' | translate }}</p>
    </app-sheet-page>
  `,
  styles: `
    .on {
      color: var(--wa);
    }
    .actions {
      margin: 14px 0;
    }
    .btn:not(.pri) {
      background: var(--p3);
      color: var(--t);
      text-decoration: none;
    }
    .btn.sure {
      background: var(--ba);
      color: #fff;
    }
    ul {
      list-style: none;
      display: grid;
      gap: 8px;
    }
    li {
      display: flex;
      align-items: center;
      gap: 14px;
      min-height: 56px;
    }
    code {
      font-size: 20px;
      font-weight: 700;
    }
    li span {
      font-size: 15px;
      color: var(--t);
    }
    .hint {
      color: var(--s);
      font-size: 14px;
      margin: 10px 0;
    }
  `,
})
export class DiagnosticsPage {
  protected readonly store = inject(DiagnosticsStore);
  private readonly mode = inject(TelemetryStore).mode;
  /** The second tap clears. */
  protected readonly sure = signal(false);
  private timer?: ReturnType<typeof setTimeout>;

  protected busy(): boolean {
    return this.store.state() === 'reading' || this.store.state() === 'clearing';
  }

  protected demo(): boolean {
    return this.mode() === 'demo';
  }

  protected known(code: string): boolean {
    return KNOWN_CODES.includes(code);
  }

  protected clear(): void {
    clearTimeout(this.timer);
    if (this.sure()) {
      this.sure.set(false);
      void this.store.clear();
      return;
    }
    this.sure.set(true);
    this.timer = setTimeout(() => this.sure.set(false), 6000);
  }

  protected time(at: number): string {
    return new Date(at).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
  }
}
