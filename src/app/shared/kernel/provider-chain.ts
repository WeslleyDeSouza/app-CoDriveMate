/**
 * Fallback chain for interchangeable services (routing, base map, 3D world,
 * voice). Providers are tried in order; one that reports an exhausted quota is
 * skipped until the next day, any other failure just moves on to the next.
 * The last provider is expected to be the keyless/offline fallback.
 */
export interface ChainProvider<TArgs extends unknown[], TResult> {
  readonly id: string;
  /** False when e.g. no key is configured. */
  isAvailable(): boolean;
  run(...args: TArgs): Promise<TResult>;
}

/** Thrown by a provider when its quota or billing limit is used up. */
export class QuotaExhaustedError extends Error {
  constructor(
    readonly providerId: string,
    cause?: unknown,
  ) {
    super(`Quota exhausted for "${providerId}"`, { cause });
    this.name = 'QuotaExhaustedError';
  }
}

export class AllProvidersFailedError extends Error {
  constructor(readonly failures: readonly { providerId: string; error: unknown }[]) {
    super('All providers failed');
    this.name = 'AllProvidersFailedError';
  }
}

export interface ChainResult<TResult> {
  readonly providerId: string;
  readonly result: TResult;
  /** Providers that were tried before and failed. */
  readonly skipped: readonly string[];
}

export interface ProviderChainOptions {
  now?: () => Date;
  /** Called when a provider is paused because its quota is used up. */
  onExhausted?: (providerId: string) => void;
}

const dayKey = (date: Date): string =>
  `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

export class ProviderChain<TArgs extends unknown[], TResult> {
  /** provider id -> local day on which it was exhausted */
  private readonly exhausted = new Map<string, string>();
  private readonly now: () => Date;

  constructor(
    private readonly providers: readonly ChainProvider<TArgs, TResult>[],
    private readonly options: ProviderChainOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  isExhausted(providerId: string): boolean {
    return this.exhausted.get(providerId) === dayKey(this.now());
  }

  /** Restores pauses persisted from an earlier session. */
  restoreExhausted(entries: Readonly<Record<string, string>>): void {
    for (const [id, day] of Object.entries(entries)) this.exhausted.set(id, day);
  }

  clearExhausted(): void {
    this.exhausted.clear();
  }

  exhaustedEntries(): Record<string, string> {
    const today = dayKey(this.now());
    return Object.fromEntries([...this.exhausted].filter(([, day]) => day === today));
  }

  /** Providers that would be tried right now, in order. */
  active(): readonly ChainProvider<TArgs, TResult>[] {
    return this.providers.filter((p) => p.isAvailable() && !this.isExhausted(p.id));
  }

  async run(...args: TArgs): Promise<ChainResult<TResult>> {
    const failures: { providerId: string; error: unknown }[] = [];
    for (const provider of this.active()) {
      try {
        const result = await provider.run(...args);
        return { providerId: provider.id, result, skipped: failures.map((f) => f.providerId) };
      } catch (error) {
        if (error instanceof QuotaExhaustedError) {
          this.exhausted.set(provider.id, dayKey(this.now()));
          this.options.onExhausted?.(provider.id);
        }
        failures.push({ providerId: provider.id, error });
      }
    }
    throw new AllProvidersFailedError(failures);
  }
}
