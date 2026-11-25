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
import { SpeechInput } from '@core/device';
import { TranslatePipe, TranslateService } from '@core/i18n';
import { MapPin, MapPinsStore } from '../application/map-pins.store';
import { NavigationStore } from '../application/navigation.store';
import { PlacesStore } from '../application/places.store';
import { PositionStore } from '../application/position.store';
import { distanceM } from '../domain/geo';
import { Place } from '../domain/route';
import { FAVOURITES, Favourite, SavedPlace } from '../domain/saved-places';
import { UnitsStore } from '@core/units';
import { formatDistanceIn } from '@shared/kernel/units';

const TYPING_MS = 450;
const MIN_LENGTH = 3;
const LISTEN_MS = 8000;

/** Search for a destination: typing, speaking, home, work, last destinations. */
@Component({
  selector: 'app-search-panel',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.open]': 'open()' },
  templateUrl: './search-panel.html',
  styleUrl: './search-panel.scss',
})
export class SearchPanel {
  protected readonly navigation = inject(NavigationStore);
  private readonly places = inject(PlacesStore);
  private readonly pinsStore = inject(MapPinsStore);
  private readonly positions = inject(PositionStore);
  private readonly microphone = inject(SpeechInput);
  private readonly translate = inject(TranslateService);
  private readonly units = inject(UnitsStore).units;
  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('query');

  protected readonly open = signal(false);
  protected readonly text = signal('');
  protected readonly results = signal<readonly Place[]>([]);
  protected readonly state = signal<'idle' | 'searching' | 'empty' | 'failed' | 'unknown'>('idle');
  /** A saved place is looked up again. */
  protected readonly locating = signal(false);
  protected readonly listening = signal(false);
  /** The next chosen place becomes this favourite. */
  protected readonly assigning = signal<Favourite | null>(null);
  protected readonly favourites = FAVOURITES;
  protected readonly saved = this.places.places;
  protected readonly pins = computed(() =>
    this.pinsStore.pins().filter(({ icon }) => icon === 'parking'),
  );
  protected readonly recent = computed(() => this.saved().recent);
  protected readonly matches = computed(() =>
    this.open() && !this.assigning() ? this.places.matching(this.text()) : [],
  );
  protected readonly showSaved = computed(
    () => this.open() && !this.text().trim() && !this.assigning(),
  );

  private searchId = 0;
  private typing?: ReturnType<typeof setTimeout>;

  constructor() {
    void this.places.load();
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.typing);
      if (this.listening()) this.microphone.abort();
    });
  }

  focus(): void {
    this.open.set(true);
    this.input().nativeElement.focus();
  }

  protected typed(text: string): void {
    this.text.set(text);
    clearTimeout(this.typing);
    if (text.trim().length < MIN_LENGTH) return this.clearResults();
    this.typing = setTimeout(() => void this.search(text, true), TYPING_MS);
  }

  protected submit(text: string): void {
    clearTimeout(this.typing);
    this.text.set(text);
    void this.search(text, false);
  }

  protected close(): void {
    clearTimeout(this.typing);
    this.clearResults();
    this.assigning.set(null);
    this.open.set(false);
    this.setText('');
    this.input().nativeElement.blur();
  }

  protected async choose(place: Place): Promise<void> {
    const favourite = this.assigning();
    if (favourite) {
      await this.places.setFavourite(favourite, place);
      this.assigning.set(null);
      this.setText('');
      this.clearResults();
      return;
    }
    if (await this.places.go(place)) this.close();
  }

  protected async goSaved(saved: SavedPlace): Promise<void> {
    this.locating.set(true);
    const started = await this.places.goSaved(saved).finally(() => this.locating.set(false));
    if (started) this.close();
    else if (!this.navigation.notice()) this.state.set('unknown');
  }

  protected async goPin({ name, coordinate }: MapPin): Promise<void> {
    if (await this.navigation.navigateTo({ name, detail: '', coordinate })) this.close();
  }

  /** Goes home or to work, or asks where that is. */
  protected favourite(kind: Favourite): void {
    const saved = this.saved()[kind];
    if (saved) void this.goSaved(saved);
    else this.assign(kind);
  }

  protected assign(kind: Favourite): void {
    this.assigning.set(kind);
    this.focus();
  }

  protected forgetFavourite(): void {
    const kind = this.assigning();
    if (kind) void this.places.setFavourite(kind, null);
    this.assigning.set(null);
  }

  protected forget(saved: SavedPlace): void {
    void this.places.forget(saved);
  }

  protected async speak(): Promise<void> {
    if (this.listening()) return this.microphone.abort();
    this.listening.set(true);
    try {
      const lang = this.translate.lang === 'de' ? 'de-CH' : 'en-GB';
      const heard = await this.microphone.listen(lang, LISTEN_MS);
      if (heard) {
        this.open.set(true);
        this.setText(heard);
        await this.search(heard, false);
      }
    } catch {
      this.state.set('failed');
    } finally {
      this.listening.set(false);
    }
  }

  protected distance(place: Place): string {
    const here = this.positions.position()?.coordinate;
    return here ? formatDistanceIn(distanceM(here, place.coordinate), this.units()) : '';
  }

  private async search(text: string, typing: boolean): Promise<void> {
    const id = ++this.searchId;
    if (text.trim().length < MIN_LENGTH) return this.clearResults();
    this.state.set('searching');
    try {
      const results = await (typing ? this.navigation.suggest(text) : this.navigation.search(text));
      if (id !== this.searchId) return;
      this.results.set(results);
      this.state.set(results.length ? 'idle' : 'empty');
    } catch {
      if (id !== this.searchId) return;
      this.results.set([]);
      this.state.set('failed');
    }
  }

  private clearResults(): void {
    this.searchId++;
    this.results.set([]);
    this.state.set('idle');
  }

  private setText(text: string): void {
    this.text.set(text);
    this.input().nativeElement.value = text;
  }
}
