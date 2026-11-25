import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@core/i18n';
import { RemoteStore } from '../application/remote.store';

/** The ESP32 module in the settings. Changes apply at once, without "Save". */
@Component({
  selector: 'app-esp-settings',
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (remote.device(); as device) {
      <p class="current">
        <i class="ti ti-cpu" aria-hidden="true"></i>
        <span>
          <b data-section-test="esp-name">{{ device.name }}</b>
          <small data-section-test="esp-status">
            {{ 'media.remote.' + remote.status() | translate }}
          </small>
        </span>
      </p>
    } @else {
      <p class="note">{{ 'media.esp.none' | translate }}</p>
    }
    <div class="row">
      <a class="btn pri" routerLink="/esp" data-section-test="esp-guide">
        <i class="ti ti-wand" aria-hidden="true"></i>{{ 'media.esp.guide' | translate }}
      </a>
      <button class="btn" type="button" data-section-test="esp-choose" (click)="remote.choose()">
        <i class="ti ti-bluetooth" aria-hidden="true"></i>{{ 'media.remote_choose' | translate }}
      </button>
      @if (remote.device()) {
        <button class="btn" type="button" data-section-test="esp-forget" (click)="remote.forget()">
          <i class="ti ti-trash" aria-hidden="true"></i>{{ 'media.remove' | translate }}
        </button>
      }
    </div>
    @if (remote.status() === 'failed') {
      <p class="note lv-overdue" role="alert" data-section-test="esp-failed">
        {{ 'media.remote.failed' | translate }}
      </p>
    }
  `,
  styles: `
    .current {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 6px 0 12px;

      i {
        font-size: 24px;
        color: var(--a);
      }
      small {
        display: block;
        color: var(--s);
        font-size: 13px;
      }
    }
    .note {
      font-size: 13px;
      color: var(--s);
      margin: 6px 0 10px;
      line-height: 1.5;
    }
    .btn {
      text-decoration: none;
      color: var(--t);
    }
    .btn:not(.pri) {
      background: var(--p);
    }
    .btn.pri {
      color: #fff;
    }
  `,
})
export class EspSettings {
  protected readonly remote = inject(RemoteStore);
}
