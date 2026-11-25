import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslatePipe } from '@core/i18n';
import { SheetPage } from '@shared/ui/sheet-page';
import { LightStore } from '../application/light.store';
import { COLORS, EFFECTS, SCENES, ZONES, colorFromHex, hexOf } from '../domain/lighting';

@Component({
  selector: 'app-light-page',
  imports: [SheetPage, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-sheet-page section="lighting" [title]="'lighting.title' | translate">
      <div class="m top">
        <svg viewBox="0 0 120 230" aria-hidden="true">
          <rect class="car" x="12" y="8" width="96" height="214" rx="34" />
          <rect class="seat" x="24" y="80" width="30" height="34" rx="7" />
          <rect class="seat" x="66" y="80" width="30" height="34" rx="7" />
          <rect class="seat" x="24" y="132" width="72" height="34" rx="8" />
          @for (glow of glows(); track $index) {
            <rect
              [attr.x]="glow.x"
              [attr.y]="glow.y"
              [attr.width]="glow.w"
              [attr.height]="glow.h"
              rx="4"
              [attr.fill]="glow.color"
              [attr.opacity]="glow.opacity"
            />
          }
        </svg>
        <div>
          <b data-section-test="lighting-status">{{
            'lighting.status.' + store.status() | translate
          }}</b>
          @if (store.moduleState(); as module) {
            <p class="hint">
              {{ 'lighting.zones' | translate: { n: module.zones } }}
              @if (module.voltage) {
                · {{ module.voltage.toFixed(1) }} V
              }
              @if (store.driving()) {
                · {{ 'lighting.driving' | translate }}
              }
            </p>
          }
          <div class="row">
            @if (store.status() === 'connected' || store.status() === 'connecting') {
              <button
                class="btn"
                type="button"
                data-section-test="lighting-disconnect"
                (click)="store.disconnect()"
              >
                <i class="ti ti-bluetooth-off" aria-hidden="true"></i
                >{{ 'lighting.disconnect' | translate }}
              </button>
            } @else {
              @if (store.known()) {
                <button
                  class="btn pri"
                  type="button"
                  data-section-test="lighting-reconnect"
                  (click)="store.reconnect()"
                >
                  <i class="ti ti-bluetooth" aria-hidden="true"></i
                  >{{ 'lighting.reconnect' | translate }}
                </button>
              }
              <button
                class="btn"
                type="button"
                data-section-test="lighting-connect"
                (click)="store.connect('service')"
              >
                <i class="ti ti-bluetooth" aria-hidden="true"></i
                >{{ 'lighting.connect' | translate }}
              </button>
              <button
                class="btn"
                type="button"
                data-section-test="lighting-connect-currus"
                (click)="store.connect('currus')"
              >
                «Currus Licht»
              </button>
              <button
                class="btn"
                type="button"
                data-section-test="lighting-connect-picasso"
                (click)="store.connect('picasso')"
              >
                «Picasso Licht»
              </button>
            }
          </div>
        </div>
      </div>

      <h3 class="sec-title">{{ 'lighting.scenes' | translate }}</h3>
      <div class="scenes">
        @for (scene of scenes; track scene.name) {
          <button
            type="button"
            [attr.data-section-test]="'lighting-scene-' + scene.name"
            [style.background]="scene.background"
            (click)="store.apply(scene)"
          >
            <i class="ti" [class]="'ti-' + scene.icon" aria-hidden="true"></i>
            {{ 'lighting.scene.' + scene.name | translate }}
          </button>
        }
      </div>

      <h3 class="sec-title">{{ 'lighting.zone_title' | translate }}</h3>
      <div class="row">
        @for (zone of zones; track zone) {
          <button
            class="btn"
            type="button"
            [attr.data-section-test]="'lighting-zone-' + zone"
            [class.pri]="store.state().selected.includes($index)"
            [attr.aria-pressed]="store.state().selected.includes($index)"
            (click)="store.select($index)"
          >
            {{ 'lighting.zone.' + zone | translate }}
          </button>
        }
      </div>

      <h3 class="sec-title">{{ 'lighting.color' | translate }}</h3>
      <div class="colors">
        @for (color of colors; track color) {
          <button
            type="button"
            [attr.data-section-test]="'lighting-color-' + color.slice(1)"
            [class.on]="color === hex()"
            [style.background]="color"
            [attr.aria-label]="color"
            (click)="setColor(color)"
          ></button>
        }
        <input
          type="color"
          data-section-test="lighting-color-free"
          [value]="hex()"
          [attr.aria-label]="'lighting.color' | translate"
          (input)="setColor($any($event.target).value)"
        />
      </div>
      <label class="f">
        {{ 'lighting.brightness' | translate }}: {{ percent(store.shown().brightness) }} %
        <input
          type="range"
          min="0"
          max="255"
          data-section-test="lighting-brightness"
          [value]="store.shown().brightness"
          (input)="store.setBrightness(+$any($event.target).value)"
        />
      </label>
      <label class="f">
        {{ 'lighting.effect_title' | translate }}
        <select
          data-section-test="lighting-effect"
          (change)="store.set({ effect: +$any($event.target).value })"
        >
          @for (effect of effects; track effect) {
            <option [value]="$index" [selected]="$index === store.shown().effect">
              {{ 'lighting.effect.' + effect | translate }}
            </option>
          }
        </select>
      </label>
      <label class="f">
        {{ 'lighting.drive' | translate }}: {{ percent(store.state().driveBrightness) }} %
        <input
          type="range"
          min="0"
          max="255"
          data-section-test="lighting-drive"
          [value]="store.state().driveBrightness"
          (change)="store.setDriveBrightness(+$any($event.target).value)"
        />
      </label>
      @if (store.status() === 'connected') {
        <button
          class="btn"
          type="button"
          data-section-test="lighting-store"
          (click)="store.store()"
        >
          <i class="ti ti-device-floppy" aria-hidden="true"></i>{{ 'lighting.store' | translate }}
        </button>
      }
      <p class="hint">{{ 'lighting.note' | translate }}</p>
    </app-sheet-page>
  `,
  styles: `
    .top {
      display: flex;
      gap: 18px;
      align-items: center;

      b {
        font-size: 18px;
      }
    }
    svg {
      width: 96px;
      flex: none;
    }
    .car,
    .seat {
      fill: var(--p);
      stroke: var(--ln);
    }
    .btn:not(.pri) {
      background: var(--p3);
    }
    .scenes {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
      gap: 8px;

      button {
        min-height: 60px;
        border: 0;
        border-radius: 14px;
        color: #fff;
        font-size: 15px;
        font-weight: 600;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }
    }
    .colors {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 14px;

      button,
      input {
        width: 52px;
        height: 52px;
        border: 2px solid var(--ln);
        border-radius: 50%;
        padding: 0;
        overflow: hidden;
      }
      .on {
        border-color: var(--a);
        box-shadow: 0 0 0 3px var(--a);
      }
    }
    .f {
      margin-bottom: 14px;
    }
    .f input[type='range'] {
      padding: 0;
      accent-color: var(--a);
    }
    .hint {
      color: var(--s);
      font-size: 14px;
      margin: 10px 0;
    }
  `,
})
export class LightPage {
  protected readonly store = inject(LightStore);
  protected readonly scenes = SCENES;
  protected readonly zones = ZONES;
  protected readonly colors = COLORS;
  protected readonly effects = EFFECTS;
  protected readonly hex = computed(() => hexOf(this.store.shown()));
  /** Where each zone glows in the drawing of the car. */
  protected readonly glows = computed(() => {
    const places = [
      [26, 68, 26, 10, 0],
      [68, 68, 26, 10, 0],
      [26, 118, 26, 10, 1],
      [68, 118, 26, 10, 1],
      [24, 36, 72, 8, 2],
      [26, 178, 68, 30, 3],
    ];
    return places.map(([x, y, w, h, i]) => {
      const zone = this.store.state().zones[i];
      const opacity = zone.on ? 0.35 + (0.65 * zone.brightness) / 255 : 0;
      return { x, y, w, h, color: hexOf(zone), opacity };
    });
  });

  constructor() {
    void this.store.start();
  }

  protected setColor(hex: string): void {
    this.store.set({ ...colorFromHex(hex), on: true });
  }

  protected percent(value: number): number {
    return Math.round(value / 2.55);
  }
}
