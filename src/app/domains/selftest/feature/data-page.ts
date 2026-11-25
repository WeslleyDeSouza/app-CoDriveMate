import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { TranslatePipe } from '@core/i18n';
import { SheetPage } from '@shared/ui/sheet-page';
import { DATA_KINDS, DataStore } from '../application/data.store';

const COPIED_MS = 2500;

/** Raw data of OBD adapter, ESP32 modules and 3D view, to copy. */
@Component({
  selector: 'app-data-page',
  imports: [SheetPage, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DataStore],
  template: `
    <app-sheet-page section="data" [title]="'selftest.data.title' | translate">
      <p class="hint">{{ 'selftest.data.note' | translate }}</p>
      <div class="row">
        @for (kind of kinds; track kind) {
          <button
            class="btn"
            type="button"
            [attr.data-section-test]="'data-read-' + kind"
            [disabled]="!!store.busy()"
            (click)="store.read(kind)"
          >
            {{ 'selftest.data.' + kind | translate }}
          </button>
        }
      </div>
      @if (store.busy()) {
        <div class="row" role="status">
          <span data-section-test="data-busy">
            {{ 'selftest.data.reading' | translate }} {{ percent() }}
          </span>
          @if (store.busy() === 'obd') {
            <button class="btn" type="button" data-section-test="data-stop" (click)="store.stop()">
              {{ 'selftest.data.stop' | translate }}
            </button>
          }
        </div>
      }
      @if (store.failed(); as failed) {
        <p class="hint bad" role="alert" data-section-test="data-failed">
          {{ 'selftest.data.' + failed | translate }}
        </p>
      }
      @if (store.json()) {
        <div class="row">
          <button class="btn pri" type="button" data-section-test="data-copy" (click)="copy()">
            <i class="ti" [class]="copied() ? 'ti-check' : 'ti-copy'" aria-hidden="true"></i>
            {{ (copied() ? 'selftest.data.copied' : 'selftest.data.copy') | translate }}
          </button>
          @if (canShare) {
            <button class="btn" type="button" data-section-test="data-share" (click)="share()">
              <i class="ti ti-share" aria-hidden="true"></i>{{ 'selftest.data.share' | translate }}
            </button>
          }
        </div>
        <textarea
          #text
          readonly
          spellcheck="false"
          data-section-test="data-json"
          [attr.aria-label]="'selftest.data.title' | translate"
          [value]="store.json()"
        ></textarea>
      }
    </app-sheet-page>
  `,
  styles: `
    .hint {
      color: var(--s);
      font-size: 14px;
      margin-bottom: 12px;
    }
    .bad {
      color: var(--ba);
    }
    .row {
      align-items: center;
      margin-bottom: 12px;
    }
    .btn:not(.pri) {
      background: var(--p3);
    }
    textarea {
      width: 100%;
      min-height: 46vh;
      border: 1px solid var(--ln);
      border-radius: 12px;
      background: var(--p2);
      color: var(--t);
      padding: 12px;
      font:
        13px/1.45 ui-monospace,
        Menlo,
        Consolas,
        monospace;
      white-space: pre;
      user-select: text;
      -webkit-user-select: text;
    }
  `,
})
export class DataPage {
  protected readonly store = inject(DataStore);
  private readonly text = viewChild<ElementRef<HTMLTextAreaElement>>('text');
  protected readonly kinds = DATA_KINDS;
  protected readonly copied = signal(false);
  protected readonly canShare = typeof navigator.share === 'function';
  protected readonly percent = computed(() =>
    this.store.busy() === 'obd' ? `${Math.round(this.store.share() * 100)} %` : '',
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => this.store.stop());
  }

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.store.json());
    } catch {
      // Not allowed here: the old way through the selected text.
      const area = this.text()?.nativeElement;
      area?.focus();
      area?.setSelectionRange(0, area.value.length);
      if (!document.execCommand('copy')) return;
    }
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), COPIED_MS);
  }

  protected async share(): Promise<void> {
    await navigator.share({ text: this.store.json() }).catch(() => undefined);
  }
}
