import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslateService } from '@core/i18n';
import { WakeLock } from '@core/device';
import { ConversationBar } from '@domains/copilot';
import { VehicleWarningCard, WarningStore } from '@domains/diagnostics';
import { FuelAlert, FuelStore } from '@domains/fuel';
import { MediaStore, MusicBar, YoutubeSlot } from '@domains/media';
import { EcoTipHint, LogbookStore } from '@domains/logbook';
import { MaintenanceNotice, MaintenanceStore } from '@domains/maintenance';
import { MapStage, NavigationStore, PositionStore } from '@domains/navigation';
import { ParkingAlert, ParkingStore } from '@domains/parking';
import { HazardHint, RoadStore } from '@domains/road';
import { SceneStore, SceneView } from '@domains/scene3d';
import { SettingsStore } from '@domains/settings';
import { CockpitExtras, CockpitPanel, TelemetryStore } from '@domains/telemetry';
import { Dock } from './dock';

/** A visible area smaller by this much means: the on-screen keyboard is open. */
const KEYBOARD_MIN_PX = 120;

/**
 * Cockpit layout of the prototype: live panel on the left, the stage (map) on
 * the right with the side sheet sliding over it, the dock at the bottom.
 * The sheet shows whatever route is active; at '/' it is closed.
 */
@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    CockpitPanel,
    ConversationBar,
    Dock,
    EcoTipHint,
    FuelAlert,
    HazardHint,
    MaintenanceNotice,
    MapStage,
    MusicBar,
    ParkingAlert,
    SceneView,
    VehicleWarningCard,
    YoutubeSlot,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.sheet-open]': 'sheetOpen()',
    '[class.keyboard]': 'keyboard()',
    '[class.no-scene]': '!scene.enabled() && !media.youtube()',
  },
  template: `
    <app-cockpit-panel class="left" [extras]="extras()">
      @if (media.youtube(); as item) {
        <app-youtube-slot [item]="item" />
      } @else if (scene.enabled()) {
        <app-scene-view class="scene" />
      }
      <app-music-bar />
    </app-cockpit-panel>

    <section class="stage">
      <app-map-stage />
    </section>

    <div class="over">
      <app-vehicle-warning />
      <app-hazard-hint />
      <app-fuel-alert />
      <app-maintenance-notice />
      <app-parking-alert />
      <app-conversation-bar />
      <app-eco-tip />
    </div>

    <aside
      class="sheet"
      data-section-test="shell-sheet"
      [class.open]="sheetOpen()"
      [attr.inert]="sheetOpen() ? null : ''"
    >
      <router-outlet (activate)="sheetOpen.set(true)" (deactivate)="sheetOpen.set(false)" />
    </aside>

    <app-dock class="dock" />
  `,
  styleUrl: './shell.scss',
})
export class Shell {
  protected readonly media = inject(MediaStore);
  protected readonly scene = inject(SceneStore);
  protected readonly sheetOpen = signal(false);
  protected readonly keyboard = signal(false);
  private readonly fuel = inject(FuelStore);
  private readonly logbook = inject(LogbookStore);
  private readonly road = inject(RoadStore);
  private readonly warnings = inject(WarningStore);
  /** What the cockpit shows from other domains. */
  protected readonly extras = computed<CockpitExtras>(() => ({
    tripKm: this.logbook.current()?.distanceKm ?? null,
    averageKmh: this.logbook.averageKmh(),
    rangeKm: this.fuel.rangeKm(),
    limitKmh: this.road.limitKmh(),
    levels: this.warnings.levels(),
  }));

  constructor() {
    this.watchKeyboard();
    void inject(ParkingStore).start();
    void inject(MaintenanceStore).start();
    void this.fuel.start();
    this.logbook.start();
    this.road.start();
    this.warnings.start();
    const wakeLock = inject(WakeLock);
    const mode = inject(TelemetryStore).mode;
    const route = inject(NavigationStore).route;
    const positions = inject(PositionStore);
    const settings = inject(SettingsStore).settings;
    const translate = inject(TranslateService);
    effect(() => {
      const driving = mode() === 'obd' || mode() === 'connecting' || route() !== null;
      const message = translate.translate('app.background') ?? 'CoDriveMate';
      positions.setBackground(driving && settings().background ? message : null);
    });
    // The screen stays on while data flows or a route is active.
    effect(() => void wakeLock.set(mode() !== 'off' || route() !== null));
  }

  /** iOS lays the keyboard over the page; the shell shrinks to what stays visible. */
  private watchKeyboard(): void {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const { style } = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const update = () => {
      const open = viewport.scale < 1.01 && window.innerHeight - viewport.height > KEYBOARD_MIN_PX;
      const opened = open && !this.keyboard();
      this.keyboard.set(open);
      style.setProperty('--visible', open ? viewport.height + 'px' : '100dvh');
      style.setProperty('--visible-top', open ? viewport.offsetTop + 'px' : '0px');
      // iOS pushes the whole page up for the field; the shell has made room for it already.
      if (open && (window.scrollY || viewport.offsetTop)) window.scrollTo(0, 0);
      if (opened) {
        setTimeout(() => {
          const field = document.activeElement;
          if (field?.closest('.sheet')) field.scrollIntoView({ block: 'nearest' });
        }, 100);
      }
    };
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    inject(DestroyRef).onDestroy(() => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    });
  }
}
