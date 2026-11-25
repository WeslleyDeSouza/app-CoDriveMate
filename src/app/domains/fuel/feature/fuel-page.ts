import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '@core/i18n';
import { UnitsStore } from '@core/units';
import { consumptionIn, distanceIn, formatDistanceIn, volumeIn } from '@shared/kernel/units';
import { SheetPage } from '@shared/ui/sheet-page';
import { FuelScope, FuelStore } from '../application/fuel.store';
import { RatedStation } from '../domain/stations';
import { LOW_RANGE_KM } from '../domain/tank';

@Component({
  selector: 'app-fuel-page',
  imports: [SheetPage, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-sheet-page section="fuel" [title]="'fuel.title' | translate">
      <div class="grid">
        <div class="m" data-section-test="fuel-tank">
          <small
            ><i class="ti ti-gas-station" aria-hidden="true"></i
            >{{ 'fuel.tank' | translate }}</small
          >
          <b>{{ tank().value }}</b><span>{{ tank().unit }}</span>
        </div>
        <div class="m" data-section-test="fuel-range" [class.low]="low()">
          <small
            ><i class="ti ti-route" aria-hidden="true"></i>{{ 'fuel.range' | translate }}</small
          >
          <b>{{ range().value }}</b><span>{{ range().unit }}</span>
        </div>
        <div class="m" data-section-test="fuel-average">
          <small
            ><i class="ti ti-droplet" aria-hidden="true"></i>{{ 'fuel.average' | translate }}</small
          >
          <b>{{ average().value }}</b><span>{{ average().unit }}</span>
        </div>
        <div class="m" data-section-test="fuel-cost">
          <small
            ><i class="ti ti-coin" aria-hidden="true"></i>{{ 'fuel.fill_cost' | translate }}</small
          >
          <b>{{ cost() }}</b>
        </div>
      </div>
      @if (!store.fromSensor()) {
        <div class="row manual">
          <button class="btn" type="button" data-section-test="fuel-full" (click)="store.fillUp()">
            <i class="ti ti-gas-station" aria-hidden="true"></i>{{ 'fuel.full' | translate }}
          </button>
          <label class="f">
            {{ 'fuel.litres' | translate }}
            <input
              type="number"
              inputmode="decimal"
              min="0"
              step="1"
              data-section-test="fuel-litres"
              [value]="litresText()"
              (change)="setLitres($any($event.target))"
            />
          </label>
        </div>
        <p class="hint">{{ 'fuel.counted' | translate }}</p>
      }

      <h3 class="sec-title">{{ 'fuel.stations' | translate }}</h3>
      <div class="row">
        @for (scope of scopes(); track scope) {
          <button
            class="btn"
            type="button"
            [attr.data-section-test]="'fuel-search-' + scope"
            [class.pri]="store.scope() === scope && store.state() !== 'no_position'"
            [attr.aria-pressed]="store.scope() === scope"
            (click)="store.search(scope)"
          >
            <i
              class="ti"
              [class]="scope === 'near' ? 'ti-current-location' : 'ti-route'"
              aria-hidden="true"
            ></i>
            {{ 'fuel.scope.' + scope | translate }}
          </button>
        }
      </div>
      @if (store.state() !== 'idle') {
        <p class="hint" role="status" data-section-test="fuel-state">
          {{ 'fuel.state.' + store.state() | translate }}
        </p>
      }
      <ul>
        @for (station of store.stations(); track station.id) {
          <li>
            <button
              class="go"
              type="button"
              [attr.data-section-test]="'fuel-go-' + $index"
              (click)="go(station)"
            >
              <i class="ti ti-navigation" aria-hidden="true"></i>
              <span>
                <b>{{ station.name || ('fuel.station' | translate) }}</b>
                <small>
                  {{ distance(station) }}
                  @if (station.open !== null) {
                    ·
                    <em [class.closed]="!station.open">{{
                      (station.open ? 'fuel.open' : 'fuel.closed') | translate
                    }}</em>
                  }
                  @if (station.address) {
                    · {{ station.address }}
                  }
                </small>
              </span>
            </button>
            <button
              class="btn"
              type="button"
              [attr.data-section-test]="'fuel-show-' + $index"
              [attr.aria-label]="'fuel.show' | translate"
              (click)="show(station)"
            >
              <i class="ti ti-map-2" aria-hidden="true"></i>
            </button>
          </li>
        }
      </ul>
      <p class="hint">{{ 'fuel.source' | translate }}</p>
    </app-sheet-page>
  `,
  styles: `
    .low b {
      color: var(--ba);
    }
    .manual {
      margin-top: 12px;
      align-items: flex-end;

      .f {
        flex: 1;
        min-width: 140px;
      }
    }
    .btn:not(.pri) {
      background: var(--p3);
    }
    .hint {
      color: var(--s);
      font-size: 14px;
      margin: 10px 0;
    }
    ul {
      list-style: none;
      display: grid;
      gap: 8px;
      margin-top: 12px;
    }
    li {
      display: flex;
      gap: 8px;
      align-items: stretch;
    }
    .go {
      flex: 1;
      min-width: 0;
      min-height: 60px;
      border: 0;
      border-radius: 14px;
      background: var(--p2);
      padding: 8px 14px;
      display: flex;
      align-items: center;
      gap: 12px;
      text-align: left;

      i {
        color: var(--a);
        font-size: 22px;
      }
      span {
        min-width: 0;
      }
      b {
        font-size: 16px;
      }
      small {
        display: block;
        color: var(--s);
        font-size: 13px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      em {
        font-style: normal;
        color: var(--ok);
      }
      .closed {
        color: var(--ba);
      }
    }
  `,
})
export class FuelPage {
  protected readonly store = inject(FuelStore);
  private readonly router = inject(Router);
  private readonly units = inject(UnitsStore).units;

  protected readonly scopes = computed<FuelScope[]>(() =>
    this.store.hasRoute() ? ['near', 'route'] : ['near'],
  );
  protected readonly tank = computed(() => this.rounded(this.store.litres(), volumeIn, 1));
  protected readonly range = computed(() => this.rounded(this.store.rangeKm(), distanceIn, 0));
  protected readonly average = computed(() => this.rounded(this.store.average(), consumptionIn, 1));
  protected readonly low = computed(() => (this.store.rangeKm() ?? Infinity) < LOW_RANGE_KM);
  protected readonly cost = computed(() => this.store.fillCost()?.toFixed(2) ?? '–');
  protected readonly litresText = computed(() => this.store.litres()?.toFixed(1) ?? '');

  constructor() {
    void this.store.start();
    this.store.confirmAlert();
    if (!this.store.stations().length) {
      void this.store.search(this.store.hasRoute() ? 'route' : 'near');
    }
  }

  protected distance({ distanceM }: RatedStation): string {
    return formatDistanceIn(distanceM, this.units());
  }

  protected setLitres(input: HTMLInputElement): void {
    const litres = input.value === '' ? null : Number(input.value);
    if (litres === null || Number.isFinite(litres)) void this.store.setLitres(litres);
  }

  protected async go(station: RatedStation): Promise<void> {
    if (await this.store.goTo(station)) void this.router.navigateByUrl('/');
  }

  protected show(station: RatedStation): void {
    this.store.showOnMap(station);
    void this.router.navigateByUrl('/');
  }

  private rounded(
    value: number | null,
    convert: (
      value: number,
      units: ReturnType<typeof this.units>,
    ) => { value: number; unit: string },
    digits: number,
  ): { value: string; unit: string } {
    const { value: converted, unit } = convert(value ?? 0, this.units());
    return { value: value === null ? '–' : converted.toFixed(digits), unit };
  }
}
