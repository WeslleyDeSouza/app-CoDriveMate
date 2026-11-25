import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { TranslatePipe } from '@core/i18n';
import qrcode from 'qrcode-generator';
import { phoneLink } from '../domain/handover';
import { LonLat } from '../domain/parking';

/** The way back for a phone: a tablet that stays in the car cannot show it. */
@Component({
  selector: 'app-parking-qr',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="row">
      @for (kind of kinds; track kind) {
        <button
          class="btn"
          type="button"
          [attr.data-section-test]="'parking-qr-' + kind"
          [class.pri]="kind === selected()"
          [attr.aria-pressed]="kind === selected()"
          (click)="selected.set(kind)"
        >
          {{ kind === 'apple' ? 'Apple Karten' : 'Google Maps' }}
        </button>
      }
    </div>
    <svg
      [attr.viewBox]="'0 0 ' + code().size + ' ' + code().size"
      role="img"
      data-section-test="parking-qr"
      [attr.data-link]="link()"
      [attr.aria-label]="'parking.qr' | translate"
    >
      <rect width="100%" height="100%" fill="#fff" />
      <path [attr.d]="code().path" fill="#000" />
    </svg>
    <p>{{ 'parking.qr_note' | translate }}</p>
  `,
  styles: `
    :host {
      display: grid;
      justify-items: center;
      gap: 10px;
      margin: 12px 0;
    }
    .btn:not(.pri) {
      background: var(--p3);
    }
    svg {
      width: min(260px, 70%);
      border-radius: 12px;
    }
    p {
      color: var(--s);
      font-size: 14px;
      text-align: center;
    }
  `,
})
export class ParkingQr {
  readonly at = input.required<LonLat>();
  protected readonly kinds = ['apple', 'google'] as const;
  protected readonly selected = signal<'apple' | 'google'>('apple');
  protected readonly link = computed(() => phoneLink(this.at(), this.selected()));
  protected readonly code = computed(() => {
    const qr = qrcode(0, 'M');
    qr.addData(this.link());
    qr.make();
    const count = qr.getModuleCount();
    const border = 4;
    let path = '';
    for (let y = 0; y < count; y++) {
      for (let x = 0; x < count; x++) {
        if (qr.isDark(y, x)) path += `M${x + border} ${y + border}h1v1h-1z`;
      }
    }
    return { size: count + border * 2, path };
  });
}
