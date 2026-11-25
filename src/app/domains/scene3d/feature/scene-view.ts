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
  viewChild,
} from '@angular/core';
import { TranslatePipe } from '@core/i18n';
import { SettingsStore } from '@domains/settings';
import { isLightTheme } from '@shared/kernel/theme';
import { SceneStore } from '../application/scene.store';
import { SceneEvents, SceneRenderer, SceneRendererFactory, SceneWorld } from '../domain/ports';

const WORLD_ICONS: Record<SceneWorld, string> = {
  real: 'ti-photo',
  plain: 'ti-box',
  mapbox: 'ti-map-2',
  google: 'ti-brand-google',
};

/** The car in 3D. Tapping it changes the camera. */
@Component({
  selector: 'app-scene-view',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.map]': "store.world() === 'mapbox'" },
  template: `
    <div #canvas class="canvas"></div>
    @if (state() !== 'ready') {
      <p class="state" data-section-test="scene-state">
        {{ 'scene3d.state.' + state() | translate }}
      </p>
    } @else {
      <button
        class="tap"
        type="button"
        data-section-test="scene-tap"
        [attr.aria-label]="'scene3d.change_camera' | translate"
        (click)="store.cycleCamera()"
      ></button>
      <button
        class="ghost world"
        type="button"
        data-section-test="scene-world"
        [attr.aria-label]="'scene3d.change_world' | translate"
        (click)="store.nextWorld()"
      >
        <i class="ti" [class]="icons[store.world()]" aria-hidden="true"></i>
        {{ 'scene3d.world_' + store.world() | translate }}
      </button>
      <span class="ghost cam" data-section-test="scene-camera">
        <i class="ti ti-video" aria-hidden="true"></i>
        {{ 'scene3d.camera.' + store.camera() | translate }}
      </span>
      @if (store.street(); as street) {
        <span class="street" data-section-test="scene-street">{{ street }}</span>
      }
      @if (attribution(); as text) {
        <span class="attribution" data-section-test="scene-attribution">{{ text }}</span>
      }
    }
  `,
  styleUrl: './scene-view.scss',
})
export class SceneView {
  protected readonly store = inject(SceneStore);
  private readonly settings = inject(SettingsStore).settings;
  private readonly factory = inject(SceneRendererFactory);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly canvas = viewChild.required<ElementRef<HTMLElement>>('canvas');

  private readonly renderer = signal<SceneRenderer | null>(null);
  private readonly failed = signal(false);
  private readonly visible = signal(true);

  protected readonly state = computed(() => {
    if (!this.store.enabled()) return 'off';
    if (this.failed()) return 'failed';
    return this.renderer() ? 'ready' : 'loading';
  });
  protected readonly icons = WORLD_ICONS;
  protected readonly attribution = signal('');

  constructor() {
    this.watchVisibility();

    effect((onCleanup) => {
      if (!this.store.enabled()) return;
      const container = this.canvas().nativeElement;
      let cancelled = false;
      let created: SceneRenderer | undefined;
      onCleanup(() => {
        cancelled = true;
        created?.destroy();
        untracked(() => this.renderer.set(null));
      });
      untracked(() => {
        this.failed.set(false);
        const lost = () => {
          if (!cancelled) this.failed.set(true);
        };
        const events: SceneEvents = {
          onLost: lost,
          onWorldFailed: (world, rejected) => this.store.worldFailed(world, rejected),
          onAttribution: (text) => this.attribution.set(text),
        };
        this.factory.create(container, events).then(
          (renderer) => {
            if (cancelled) return renderer.destroy();
            created = renderer;
            this.renderer.set(renderer);
          },
          (error: unknown) => {
            console.warn('3D view failed', error);
            lost();
          },
        );
      });
    });

    effect(() =>
      this.renderer()?.setAppearance({
        dark: !isLightTheme(this.settings().theme),
        world: this.store.world(),
        carColor: this.store.carColor(),
        options: this.store.options(),
        googleKey: this.store.googleKey(),
        mapboxToken: this.store.mapboxToken(),
      }),
    );
    effect(() => this.renderer()?.setPose(this.store.pose()));
    effect(() => this.renderer()?.setEnvironment(this.store.environment()));
    effect(() => this.renderer()?.setRoute(this.store.route()));
    effect(() => this.renderer()?.setCamera(this.store.camera()));
    effect(() => this.renderer()?.setRunning(this.visible() && !this.failed()));
  }

  /** Nothing is drawn while the view is scrolled away or the app is in the background. */
  private watchVisibility(): void {
    let onScreen = true;
    const update = () => this.visible.set(onScreen && !document.hidden);
    document.addEventListener('visibilitychange', update);
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? undefined
        : new IntersectionObserver((entries) => {
            onScreen = entries[entries.length - 1].isIntersecting;
            update();
          });
    observer?.observe(this.element.nativeElement);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('visibilitychange', update);
      observer?.disconnect();
    });
    update();
  }
}
