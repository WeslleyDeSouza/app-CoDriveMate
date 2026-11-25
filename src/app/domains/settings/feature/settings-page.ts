import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { AccountVoice, CLOUD_VOICES, CloudVoice, OPENAI_VOICES, SpeechOutput } from '@core/device';
import { ServiceReset } from '@core/http/service-reset';
import { APP_LANGUAGES, TranslatePipe, TranslateService } from '@core/i18n';
import { BackupFile, BackupService } from '@core/storage';
import { EspSettings } from '@domains/media';
import { ObdSettings } from '@domains/telemetry';
import { Units } from '@shared/kernel/units';
import { RouterLink } from '@angular/router';
import { SheetPage } from '@shared/ui/sheet-page';
import { SettingsStore } from '../application/settings.store';
import { AppSettings, DeepPartial, cloudVoice, mergeSettings } from '../domain/settings';

type KeyName = keyof AppSettings['keys'];

/** Body colours offered for the 3D model. */
const SWATCHES = [
  '#2b2a45',
  '#8a8f98',
  '#d9dce1',
  '#101216',
  '#7a1f2b',
  '#1f4f7a',
  '#2f5d3a',
  '#b08a3e',
];

/**
 * Settings as in the prototype: collapsible groups, edited as a draft and
 * written with "Save".
 */
@Component({
  selector: 'app-settings-page',
  imports: [EspSettings, NgTemplateOutlet, ObdSettings, RouterLink, SheetPage, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.scss',
})
export class SettingsPage {
  private readonly store = inject(SettingsStore);
  private readonly translate = inject(TranslateService);
  private readonly backup = inject(BackupService);
  private readonly cloudVoice = inject(CloudVoice);
  private readonly serviceReset = inject(ServiceReset);
  private readonly speech = inject(SpeechOutput);

  /** Edited copy; reaches the store only on save. */
  protected readonly draft = signal<AppSettings>(this.store.settings());
  protected readonly dirty = computed(() => this.draft() !== this.store.settings());
  protected readonly saved = signal(false);

  protected readonly languages = APP_LANGUAGES;
  protected readonly language = signal(this.translate.lang);
  protected readonly swatches = SWATCHES;
  /** Placeholder showing what each key looks like. */
  protected readonly keyHints: Record<string, string> = {
    anthropic: 'sk-ant-…',
    openai: 'sk-…',
    elevenlabs: 'sk_…',
    google: 'AIza…',
    mapbox: 'pk.…',
    tomtom: 'developer.tomtom.com',
  };
  protected readonly visibleKeys = signal<ReadonlySet<KeyName>>(new Set());
  protected readonly backupError = signal(false);

  constructor() {
    // With a new key, or when ElevenLabs is chosen, its voices are fetched.
    const key = computed(() => {
      const { voice, keys } = this.draft();
      return voice.provider === 'elevenlabs' ? keys.elevenlabs : '';
    });
    effect(() => {
      if (key()) untracked(() => void this.loadElevenVoices());
    });
    const google = computed(() => {
      const { voice, keys } = this.draft();
      return voice.provider === 'auto' ? keys.google : '';
    });
    effect(() => {
      const [current, lang] = [google(), this.language()];
      if (current) untracked(() => void this.loadGoogleVoices(current, lang));
    });
  }

  protected patch(change: DeepPartial<AppSettings>): void {
    this.draft.update((draft) => mergeSettings(draft, change));
    this.saved.set(false);
  }

  /** Value of the control that fired the event. */
  protected text(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value.trim();
  }

  protected on(event: Event): boolean {
    return this.text(event) === '1';
  }

  /** Positive number from the control, or `fallback` if it is empty or invalid. */
  protected num<T>(event: Event, fallback: T): number | T {
    const raw = this.text(event);
    const value = Number(raw);
    if (raw !== '' && Number.isFinite(value) && value > 0) return value;
    // The bound value may not change, so show the kept one explicitly.
    (event.target as HTMLInputElement).value = fallback === null ? '' : String(fallback);
    return fallback;
  }

  /** Options per quantity, in the order shown. */
  protected readonly unitOptions: readonly { name: keyof Units; options: readonly string[] }[] = [
    { name: 'distance', options: ['km', 'mi'] },
    { name: 'temperature', options: ['c', 'f'] },
    { name: 'consumption', options: ['l100', 'kml', 'mpgUs', 'mpgUk'] },
    { name: 'volume', options: ['l', 'galUs', 'galUk'] },
    { name: 'pressure', options: ['kpa', 'bar', 'psi'] },
  ];

  /** Parts of the 3D view that can be switched off. */
  protected readonly sceneParts: readonly (keyof Omit<AppSettings['map']['scene'], 'quality'>)[] = [
    'sharpAerial',
    'sky',
    'shadows',
    'terrain',
    'swissBuildings',
    'swissTrees',
    'facades',
    'roadDetails',
  ];

  /** What may be spoken besides the navigation. */
  protected readonly spoken = ['warnings', 'infos', 'conversation'] as const;

  protected setSpoken(name: (typeof this.spoken)[number], event: Event): void {
    this.patch({ voice: { [name]: this.on(event) } });
  }

  protected readonly leftView = computed(() => {
    const { scene3d, gauge } = this.draft().map;
    if (scene3d) return gauge ? 'both' : '1';
    return gauge ? 'gauge' : '0';
  });

  protected setLeftView(view: string): void {
    const scene3d = view === '1' || view === 'both';
    this.patch({ map: { scene3d, gauge: view === 'gauge' || view === 'both' } });
  }

  protected setScenePart(part: string, event: Event): void {
    this.patch({ map: { scene: { [part]: this.on(event) } } });
  }

  private readonly googleVoices = signal<readonly string[]>([]);
  /** The known voices with a description first, then what Google has besides. */
  protected readonly cloudVoices = computed(() => [
    ...new Set<string>([...CLOUD_VOICES, this.draft().voice.cloudVoice, ...this.googleVoices()]),
  ]);

  protected cloudVoiceLabel(name: string): string {
    const known = (CLOUD_VOICES as readonly string[]).includes(name);
    return (known && this.translate.translate('settings.cloud_voices.' + name)) || name;
  }

  /** The list is an extra: without it the known voices stay. */
  private async loadGoogleVoices(key: string, lang: string): Promise<void> {
    const voices = await this.cloudVoice.googleVoices(key, lang).catch(() => []);
    if (key === this.draft().keys.google && lang === this.language()) this.googleVoices.set(voices);
  }

  protected readonly openaiVoices = OPENAI_VOICES;
  protected readonly voiceProblem = this.cloudVoice.problem;
  protected readonly accountVoices = signal<readonly AccountVoice[]>([]);
  protected readonly accountVoicesFailed = signal(false);

  /** Voices of the app language first; the chosen one even before they are loaded. */
  protected readonly elevenVoices = computed<readonly AccountVoice[]>(() => {
    const chosen = this.draft().voice.elevenVoice;
    const speaks = ({ languages }: AccountVoice) => languages.includes(this.language());
    const loaded = [...this.accountVoices()].sort((a, b) => Number(speaks(b)) - Number(speaks(a)));
    return !chosen.id || loaded.some(({ id }) => id === chosen.id)
      ? loaded
      : [{ ...chosen, languages: [] }, ...loaded];
  });

  protected voiceLabel({ name, languages }: AccountVoice): string {
    return languages.length ? `${name} (${languages.slice(0, 4).join(', ')})` : name;
  }

  protected async loadElevenVoices(): Promise<void> {
    const key = this.draft().keys.elevenlabs;
    this.accountVoicesFailed.set(false);
    if (!key) return this.accountVoices.set([]);
    try {
      const voices = await this.cloudVoice.accountVoices(key);
      if (key === this.draft().keys.elevenlabs) this.accountVoices.set(voices);
    } catch {
      if (key === this.draft().keys.elevenlabs) this.accountVoicesFailed.set(true);
    }
  }

  protected setElevenVoice(event: Event): void {
    const id = this.text(event);
    const name = this.elevenVoices().find((voice) => voice.id === id)?.name ?? '';
    this.patch({ voice: { elevenVoice: { id, name } } });
  }

  /** Speaks a sentence with what is chosen in the draft. */
  protected async tryVoice(): Promise<void> {
    const { voice } = this.draft();
    this.cloudVoice.configure(cloudVoice(this.draft()));
    const text = this.translate.translate('settings.voice_sample') ?? '';
    await this.speech.stop();
    await this.speech.speak(text, this.translate.lang, voice.rate, 'nav');
  }

  protected readonly pausesReset = signal(false);

  /** Services paused after a used up quota or a refused key are tried again. */
  protected resetPauses(): void {
    this.serviceReset.reset();
    this.pausesReset.set(true);
  }

  protected setUnit(name: keyof Units, event: Event): void {
    this.patch({ units: { [name]: this.text(event) } });
  }

  protected keyValue(name: KeyName): string {
    return this.draft().keys[name];
  }

  protected setKey(name: KeyName, event: Event): void {
    this.patch({ keys: { [name]: this.text(event) } });
  }

  protected toggleKey(name: KeyName): void {
    this.visibleKeys.update((visible) => {
      const next = new Set(visible);
      if (!next.delete(name)) next.add(name);
      return next;
    });
  }

  protected setLanguage(event: Event): void {
    const name = this.text(event);
    this.translate.lang = name;
    this.language.set(name);
  }

  protected async save(): Promise<void> {
    await this.store.update(this.draft());
    this.draft.set(this.store.settings());
    this.saved.set(true);
  }

  protected async exportBackup(): Promise<void> {
    const file = await this.backup.export();
    const url = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `codrivemate-backup-${file.exportedAt.slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  protected async importBackup(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      await this.backup.import(JSON.parse(await file.text()) as BackupFile);
      // Stores hold the old state in memory: start again from the imported data.
      location.reload();
    } catch {
      this.backupError.set(true);
    }
  }
}
