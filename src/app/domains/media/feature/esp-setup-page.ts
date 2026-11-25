import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '@core/i18n';
import { SheetPage } from '@shared/ui/sheet-page';
import { MediaStore } from '../application/media.store';
import { RemoteStore } from '../application/remote.store';

/** Step of the guide and the number of instructions in it. */
const STEPS = [
  { id: 'parts', hints: 3 },
  { id: 'flash', hints: 6 },
  { id: 'power', hints: 3 },
  { id: 'connect', hints: 3 },
  { id: 'test', hints: 2 },
] as const;

/** Instructions for building, flashing and connecting the ESP32 module. */
@Component({
  selector: 'app-esp-setup-page',
  imports: [SheetPage, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-sheet-page section="esp-setup" [title]="'media.esp.title' | translate">
      <div class="progress" aria-hidden="true">
        @for (entry of steps; track entry.id; let i = $index) {
          <i [class.on]="i <= index()"></i>
        }
      </div>
      <h3 data-section-test="esp-step">{{ 'media.esp.' + step().id + '.title' | translate }}</h3>
      <ol>
        @for (n of hints(); track n) {
          <li>{{ 'media.esp.' + step().id + '.h' + n | translate }}</li>
        }
      </ol>

      @switch (step().id) {
        @case ('flash') {
          <a
            class="btn"
            href="assets/firmware/media_remote.ino"
            download="media_remote.ino"
            data-section-test="esp-download"
          >
            <i class="ti ti-download" aria-hidden="true"></i>
            {{ 'media.esp.download' | translate }}
          </a>
        }
        @case ('connect') {
          <button
            class="btn"
            type="button"
            data-section-test="esp-setup-choose"
            (click)="remote.choose()"
          >
            <i class="ti ti-bluetooth" aria-hidden="true"></i>
            {{ 'media.remote_choose' | translate }}
          </button>
          <p class="state" role="status" data-section-test="esp-setup-status">
            {{ 'media.remote.' + remote.status() | translate }}
          </p>
        }
        @case ('test') {
          @if (media.nowPlaying(); as song) {
            <p class="song" data-section-test="esp-song">
              <b>{{ song.title }}</b>
              <small>{{ song.artist }}</small>
            </p>
            <div class="row">
              <button
                class="btn"
                type="button"
                data-section-test="esp-previous"
                (click)="media.previous()"
              >
                {{ 'media.previous' | translate }}
              </button>
              <button
                class="btn"
                type="button"
                data-section-test="esp-toggle"
                (click)="media.toggle()"
              >
                {{ (song.playing ? 'media.pause' : 'media.play') | translate }}
              </button>
              <button class="btn" type="button" data-section-test="esp-next" (click)="media.next()">
                {{ 'media.next' | translate }}
              </button>
            </div>
          } @else {
            <p class="state" data-section-test="esp-waiting">
              {{ 'media.esp.waiting' | translate }}
            </p>
          }
        }
      }

      <div class="nav">
        @if (index() > 0) {
          <button class="btn" type="button" data-section-test="esp-back" (click)="go(-1)">
            {{ 'media.esp.back' | translate }}
          </button>
        }
        <button class="btn pri" type="button" data-section-test="esp-forward" (click)="go(1)">
          {{ (last() ? 'media.esp.finish' : 'media.esp.forward') | translate }}
        </button>
      </div>
    </app-sheet-page>
  `,
  styles: `
    .progress {
      display: flex;
      gap: 6px;
      margin-bottom: 18px;

      i {
        flex: 1;
        height: 4px;
        border-radius: 2px;
        background: var(--p3);
      }
      .on {
        background: var(--a);
      }
    }
    h3 {
      font-size: 19px;
      margin-bottom: 12px;
    }
    ol {
      padding-left: 22px;
      display: grid;
      gap: 12px;
      font-size: 15px;
      line-height: 1.5;
      margin-bottom: 18px;
    }
    .btn {
      text-decoration: none;
      color: var(--t);
    }
    .btn.pri {
      color: #fff;
      margin-left: auto;
    }
    .state {
      margin-top: 14px;
      font-size: 14px;
      color: var(--s);
      line-height: 1.5;
    }
    .song {
      background: var(--p2);
      border-radius: 16px;
      padding: 14px 16px;
      margin-bottom: 12px;

      b {
        display: block;
        font-size: 17px;
      }
      small {
        color: var(--s);
      }
    }
    .nav {
      display: flex;
      gap: 10px;
      margin-top: 26px;
    }
  `,
})
export class EspSetupPage {
  protected readonly remote = inject(RemoteStore);
  protected readonly media = inject(MediaStore);
  private readonly router = inject(Router);

  protected readonly steps = STEPS;
  protected readonly index = signal(0);
  protected readonly step = computed(() => STEPS[this.index()]);
  protected readonly last = computed(() => this.index() === STEPS.length - 1);
  protected readonly hints = computed(() =>
    Array.from({ length: this.step().hints }, (_, i) => i + 1),
  );

  protected go(by: 1 | -1): void {
    if (by === 1 && this.last()) void this.router.navigateByUrl('/');
    else this.index.update((i) => Math.max(0, i + by));
  }
}
