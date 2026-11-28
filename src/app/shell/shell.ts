import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslateService } from '@core/i18n';
import { OnScreenKeyboard, WakeLock } from '@core/device';
import { ConversationBar } from '@domains/copilot';
import { VehicleWarningCard, WarningStore } from '@domains/diagnostics';
import { FuelAlert, FuelStore } from '@domains/fuel';
import { MediaStore, MusicBar, YoutubeSlot } from '@domains/media';
import { EcoTipHint, LogbookStore, RoutineHint, RoutineStore } from '@domains/logbook';
import { MaintenanceNotice, MaintenanceStore } from '@domains/maintenance';
import { MapStage, NavigationStore, PositionStore } from '@domains/navigation';
import { ParkingAlert, ParkingStore } from '@domains/parking';
import { HazardHint, RoadStore } from '@domains/road';
import { SceneStore, SceneView } from '@domains/scene3d';
import { SettingsStore } from '@domains/settings';
import { CockpitExtras, CockpitPanel, SpeedGauge, TelemetryStore } from '@domains/telemetry';
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
    RoutineHint,
    SceneView,
    SpeedGauge,
    VehicleWarningCard,
    YoutubeSlot,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.sheet-open]': 'sheetOpen()',
    '[class.keyboard]': 'keyboard()',
    '[class.dock-button]': 'settings().dockButton',
    '[class.no-scene]': '!scene.enabled() && !gauge() && !media.youtube()',
  },
  template: `
    <app-cockpit-panel class="left" [extras]="extras()">
      @if (media.youtube(); as item) {
        <app-youtube-slot [item]="item" />
      } @else {
        <div class="views" [class.both]="scene.enabled() && gauge()">
          @if (scene.enabled()) {
            <app-scene-view class="scene" />
          }
          @if (gauge()) {
            <app-speed-gauge class="scene" [limitKmh]="road.limitKmh()" />
          }
        </div>
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
      <app-routine-hint />
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
  protected readonly road = inject(RoadStore);
  protected readonly settings = inject(SettingsStore).settings;
  protected readonly gauge = computed(() => this.settings().map.gauge);
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
    inject(RoutineStore).start();
    this.road.start();
    this.warnings.start();
    const wakeLock = inject(WakeLock);
    const mode = inject(TelemetryStore).mode;
    const route = inject(NavigationStore).route;
    const positions = inject(PositionStore);
    const translate = inject(TranslateService);
    effect(() => {
      const driving = mode() === 'obd' || mode() === 'connecting' || route() !== null;
      const message = translate.translate('app.background') ?? 'CoDriveMate';
      positions.setBackground(driving && this.settings().background ? message : null);
    });
    // The screen stays on as long as the app is open; browsers forget it in the background.
    const stayAwake = () => {
      if (!document.hidden) void wakeLock.set(true);
    };
    stayAwake();
    document.addEventListener('visibilitychange', stayAwake);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('visibilitychange', stayAwake);
      void wakeLock.set(false);
    });
  }

  /** The keyboard lies over the page; the shell shrinks to what stays visible. */
  private watchKeyboard(): void {
    const viewport = window.visualViewport;
    const height = inject(OnScreenKeyboard).heightPx;
    const { style } = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const apply = (covered: number, visible: number, top: number) => {
      const open = covered > KEYBOARD_MIN_PX;
      const opened = open && !this.keyboard();
      this.keyboard.set(open);
      style.setProperty('--visible', open ? visible + 'px' : '100dvh');
      style.setProperty('--visible-top', open ? top + 'px' : '0px');
      // Safari pushes the whole page up for the field; the shell has made room for it already.
      if (open && (window.scrollY || top)) window.scrollTo(0, 0);
      if (opened) {
        setTimeout(() => {
          const field = document.activeElement;
          if (field?.closest('.sheet')) field.scrollIntoView({ block: 'nearest' });
        }, 100);
      }
    };
    effect(() => {
      const covered = height();
      if (covered === null) return;
      untracked(() => apply(covered, window.innerHeight - covered, 0));
    });
    if (!viewport) return;
    const update = () => {
      if (height() !== null) return;
      const covered = viewport.scale < 1.01 ? window.innerHeight - viewport.height : 0;
      apply(covered, viewport.height, viewport.offsetTop);
    };
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    inject(DestroyRef).onDestroy(() => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    });
  }
}
