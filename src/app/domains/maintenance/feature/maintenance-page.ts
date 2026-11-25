import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@core/i18n';
import { UnitsStore } from '@core/units';
import { distanceIn } from '@shared/kernel/units';
import { SheetPage } from '@shared/ui/sheet-page';
import { MaintenanceStore } from '../application/maintenance.store';
import { MaintenanceItem, fromIsoDate, isStandardItem, toIsoDate } from '../domain/maintenance';

const SURE_MS = 4000;

@Component({
  selector: 'app-maintenance-page',
  imports: [SheetPage, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-sheet-page section="maintenance" [title]="'maintenance.title' | translate">
      <label class="f">
        {{ 'maintenance.odometer' | translate }} ({{ unit() }})
        <input
          #odometer
          data-section-test="maintenance-odometer"
          type="number"
          inputmode="numeric"
          min="0"
          [value]="odometerText()"
          (focus)="editing.set(true)"
          (blur)="editing.set(false)"
          (change)="setOdometer(odometer)"
        />
      </label>
      @if (missing()) {
        <p class="hint ask" role="alert" data-section-test="maintenance-odometer-missing">
          {{ 'maintenance.odometer_missing' | translate }}
        </p>
      }
      <p class="hint">{{ 'maintenance.counted' | translate }}</p>

      @for (entry of store.items(); track entry.item.id) {
        @let item = entry.item;
        @let status = entry.status;
        <details class="m" [attr.data-section-test]="'maintenance-item-' + item.id">
          <summary [attr.data-section-test]="'maintenance-toggle-' + item.id">
            <i class="ti" [class]="item.icon" aria-hidden="true"></i>
            <div>
              <strong>{{ item.name || ('maintenance.item.' + item.id | translate) }}</strong>
              @if (status.remainingKm !== null) {
                <small>{{
                  (status.remainingKm > 0 ? 'maintenance.km_left' : 'maintenance.km_over')
                    | translate: { distance: distance(status.remainingKm) }
                }}</small>
              }
              @if (status.remainingDays !== null) {
                <small>{{
                  (status.remainingDays > 0 ? 'maintenance.due_by' : 'maintenance.due_since')
                    | translate: { date: date(entry.dueDate) }
                }}</small>
              }
            </div>
            <em
              [class]="'lv-' + status.level"
              [attr.data-section-test]="'maintenance-level-' + item.id"
              >{{ 'maintenance.level.' + status.level | translate }}</em
            >
            <i class="ti ti-chevron-down arrow" aria-hidden="true"></i>
          </summary>
          <div class="fields">
            <label class="f wide">
              {{ 'maintenance.name' | translate }}
              <input
                #name
                type="text"
                maxlength="60"
                [attr.data-section-test]="'maintenance-name-' + item.id"
                [value]="item.name"
                [placeholder]="
                  standard(item) ? ('maintenance.item.' + item.id | translate) : item.name
                "
                (change)="setName(item, name)"
              />
            </label>
            <label class="f">
              {{ 'maintenance.every' | translate }} {{ unit() }}
              <input
                #intervalKm
                type="number"
                inputmode="numeric"
                min="0"
                placeholder="–"
                [attr.data-section-test]="'maintenance-interval-km-' + item.id"
                [value]="rounded(item.intervalKm || null)"
                (change)="setIntervalKm(item, intervalKm)"
              />
            </label>
            <label class="f">
              {{ 'maintenance.every_months' | translate }}
              <input
                #months
                type="number"
                inputmode="numeric"
                min="0"
                placeholder="–"
                [attr.data-section-test]="'maintenance-interval-months-' + item.id"
                [value]="item.intervalMonths || ''"
                (change)="setMonths(item, months)"
              />
            </label>
            <label class="f">
              {{ 'maintenance.last_km' | translate }} {{ unit() }}
              <input
                #lastKm
                type="number"
                inputmode="numeric"
                min="0"
                [attr.data-section-test]="'maintenance-last-km-' + item.id"
                [value]="rounded(item.lastKm)"
                (change)="setLastKm(item, lastKm)"
              />
            </label>
            <label class="f">
              {{ 'maintenance.last_date' | translate }}
              <input
                #lastDate
                type="date"
                [attr.data-section-test]="'maintenance-last-date-' + item.id"
                [value]="isoDate(item.lastDate)"
                (change)="setLastDate(item, lastDate)"
              />
            </label>
          </div>
          <div class="row">
            <button
              class="btn pri"
              type="button"
              [attr.data-section-test]="'maintenance-done-' + item.id"
              (click)="done(item)"
            >
              <i class="ti ti-check" aria-hidden="true"></i>{{ 'maintenance.done' | translate }}
            </button>
            @if (!standard(item)) {
              <button
                class="btn"
                type="button"
                [class.sure]="sure() === item.id"
                [attr.data-section-test]="'maintenance-delete-' + item.id"
                (click)="remove(item)"
              >
                <i class="ti ti-trash" aria-hidden="true"></i>
                {{
                  (sure() === item.id ? 'maintenance.delete_sure' : 'maintenance.delete')
                    | translate
                }}
              </button>
            }
          </div>
        </details>
        <div class="bar" aria-hidden="true">
          <i
            [class]="'bar-' + status.level"
            [style.width.%]="entry.used * 100"
            [attr.data-section-test]="'maintenance-progress-' + item.id"
          ></i>
        </div>
      }

      <div class="row add">
        <label class="f">
          {{ 'maintenance.new' | translate }}
          <input
            #newName
            type="text"
            maxlength="60"
            data-section-test="maintenance-new-name"
            (keydown.enter)="add(newName)"
          />
        </label>
        <button
          class="btn"
          type="button"
          data-section-test="maintenance-add"
          (click)="add(newName)"
        >
          <i class="ti ti-plus" aria-hidden="true"></i>{{ 'maintenance.add' | translate }}
        </button>
      </div>

      <h3 class="sec-title">{{ 'maintenance.dates' | translate }}</h3>
      <div class="special m">
        <label class="f">
          {{ 'maintenance.item.inspection' | translate }}
          <input
            #inspection
            type="date"
            data-section-test="maintenance-inspection"
            [value]="store.plan().inspectionDate"
            (change)="setInspection(inspection)"
          />
        </label>
        <div data-section-test="maintenance-inspection-state">
          <em [class]="'lv-' + store.inspection()">{{
            'maintenance.level.' + store.inspection() | translate
          }}</em>
          @if (store.inspection() !== 'unknown') {
            <small>{{
              (store.inspection() === 'overdue' ? 'maintenance.due_since' : 'maintenance.due_by')
                | translate: { date: inspectionDate() }
            }}</small>
          }
        </div>
      </div>
      <div class="special m">
        <label class="f">
          {{ 'maintenance.vignette_year' | translate }}
          <input
            #vignette
            type="number"
            inputmode="numeric"
            min="2000"
            max="2100"
            data-section-test="maintenance-vignette"
            [value]="store.plan().vignetteYear || ''"
            (change)="setVignette(vignette)"
          />
        </label>
        <div data-section-test="maintenance-vignette-state">
          <em [class]="'lv-' + store.vignette()">{{
            'maintenance.level.' + store.vignette() | translate
          }}</em>
          @if (store.vignette() !== 'unknown') {
            <small>{{ vignetteKey() | translate: { next: store.plan().vignetteYear + 1 } }}</small>
          }
        </div>
      </div>
    </app-sheet-page>
  `,
  styles: `
    details {
      margin-top: 10px;
      border-radius: 16px 16px 0 0;
    }
    summary {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: var(--touch);
      list-style: none;
      cursor: pointer;

      &::-webkit-details-marker {
        display: none;
      }
      > .ti {
        color: var(--a);
        font-size: 22px;
      }
      > div {
        flex: 1;
        min-width: 0;
      }
      strong {
        font-size: 16px;
        font-weight: 600;
      }
    }
    .m small {
      font-size: 14px;
    }
    em {
      font-style: normal;
      font-size: 15px;
      font-weight: 600;
    }
    .arrow {
      transition: transform 0.2s;
    }
    details[open] .arrow {
      transform: rotate(180deg);
    }
    .bar {
      height: 6px;
      border-radius: 0 0 6px 6px;
      overflow: hidden;
      background: var(--ln);

      i {
        display: block;
        height: 100%;
      }
    }
    .bar-ok {
      background: var(--ok);
    }
    .bar-soon {
      background: var(--wa);
    }
    .bar-overdue {
      background: var(--ba);
    }
    .fields {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 10px;
      margin: 10px 0;
    }
    .wide {
      grid-column: 1 / -1;
    }
    .add {
      margin-top: 14px;
      align-items: flex-end;

      .f {
        flex: 1;
        min-width: 140px;
      }
    }
    .special {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      align-items: end;
      margin-bottom: 10px;
    }
    .m .f input {
      background: var(--p3);
    }
    .btn:not(.pri) {
      background: var(--p3);
    }
    .btn.sure {
      background: var(--ba);
      color: #fff;
    }
    .hint {
      color: var(--s);
      font-size: 14px;
      margin: 10px 0;
    }
    .ask {
      color: var(--wa);
    }
  `,
})
export class MaintenancePage {
  protected readonly store = inject(MaintenanceStore);
  private readonly translate = inject(TranslateService);
  private readonly units = inject(UnitsStore).units;
  private readonly odometer = viewChild.required<ElementRef<HTMLInputElement>>('odometer');

  protected readonly isoDate = toIsoDate;
  protected readonly unit = computed(() => distanceIn(0, this.units()).unit);
  protected readonly inspectionDate = computed(() =>
    this.date(fromIsoDate(this.store.plan().inspectionDate)),
  );
  protected readonly vignetteKey = computed(
    () => 'maintenance.vignette_' + (this.store.vignette() === 'overdue' ? 'expired' : 'valid'),
  );
  protected readonly editing = signal(false);
  /** Counting on must not disturb typing. */
  protected readonly odometerText = linkedSignal<{ text: string; editing: boolean }, string>({
    source: () => ({
      text: this.rounded(this.store.plan().odometerKm),
      editing: this.editing(),
    }),
    computation: ({ text, editing }, previous) => (editing && previous ? previous.value : text),
  });
  private readonly asked = signal(false);
  protected readonly missing = computed(
    () => this.asked() && this.store.plan().odometerKm === null,
  );
  /** The second tap deletes. */
  protected readonly sure = signal('');
  private sureTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    void this.store.load();
    this.store.confirmNotice();
  }

  protected rounded(km: number | null): string {
    return km === null ? '' : distanceIn(km, this.units()).value.toFixed(0);
  }

  protected distance(km: number): string {
    return `${this.rounded(Math.abs(km))} ${this.unit()}`;
  }

  protected date(timestamp: number | null): string {
    return timestamp === null ? '' : new Date(timestamp).toLocaleDateString(this.translate.lang);
  }

  protected standard({ id }: MaintenanceItem): boolean {
    return isStandardItem(id);
  }

  protected setOdometer(input: HTMLInputElement): void {
    const value = this.read(input);
    if (value) void this.store.setOdometer(this.toKm(value));
    else input.value = this.odometerText();
  }

  protected setName(item: MaintenanceItem, input: HTMLInputElement): void {
    const name = input.value.trim();
    if (name || this.standard(item)) void this.store.edit(item.id, { name });
    else input.value = item.name;
  }

  protected setIntervalKm(item: MaintenanceItem, input: HTMLInputElement): void {
    const value = this.read(input);
    if (value === undefined) input.value = this.rounded(item.intervalKm || null);
    else void this.store.edit(item.id, { intervalKm: this.toKm(value ?? 0) });
  }

  protected setLastKm(item: MaintenanceItem, input: HTMLInputElement): void {
    const value = this.read(input);
    if (value === undefined) input.value = this.rounded(item.lastKm);
    else void this.store.edit(item.id, { lastKm: value === null ? null : this.toKm(value) });
  }

  protected setMonths(item: MaintenanceItem, input: HTMLInputElement): void {
    const value = this.read(input);
    if (value === undefined) input.value = String(item.intervalMonths || '');
    else void this.store.edit(item.id, { intervalMonths: value ?? 0 });
  }

  protected setLastDate(item: MaintenanceItem, { value }: HTMLInputElement): void {
    const lastDate = fromIsoDate(value);
    // A half typed year is not taken yet.
    if (lastDate !== null || value === '') void this.store.edit(item.id, { lastDate });
  }

  protected setInspection({ value }: HTMLInputElement): void {
    if (value === '' || fromIsoDate(value) !== null) void this.store.setInspection(value);
  }

  protected setVignette(input: HTMLInputElement): void {
    const year = this.read(input);
    if (year === null) void this.store.setVignette(0);
    else if (year !== undefined && year >= 2000 && year <= 2100) void this.store.setVignette(year);
    else input.value = String(this.store.plan().vignetteYear || '');
  }

  protected done(item: MaintenanceItem): void {
    if (this.store.plan().odometerKm !== null) return void this.store.markDone(item.id);
    this.asked.set(true);
    this.odometer().nativeElement.focus();
  }

  protected add(input: HTMLInputElement): void {
    const name = input.value.trim();
    if (!name) return input.focus();
    input.value = '';
    void this.store.add(name);
  }

  protected remove({ id }: MaintenanceItem): void {
    clearTimeout(this.sureTimer);
    if (this.sure() !== id) {
      this.sure.set(id);
      this.sureTimer = setTimeout(() => this.sure.set(''), SURE_MS);
      return;
    }
    this.sure.set('');
    void this.store.remove(id);
  }

  /** Whole number, null = empty, undefined = not usable. */
  private read(input: HTMLInputElement): number | null | undefined {
    if (input.validity.badInput) return undefined;
    if (input.value === '') return null;
    const value = Math.round(Number(input.value));
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  }

  private toKm(shown: number): number {
    return shown / distanceIn(1, this.units()).value;
  }
}
