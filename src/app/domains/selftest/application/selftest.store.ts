import { Injectable, computed, inject, signal } from '@angular/core';
import { Probe, ProbeResult, ProbeSource, SkipProbe, redact, report } from '../domain/selftest';

const TIMEOUT_MS = 30_000;

/** Tests what cannot be tested without the device. */
@Injectable()
export class SelftestStore {
  private readonly probes = inject(ProbeSource).probes();
  private readonly _results = signal<readonly ProbeResult[]>(
    this.probes.map(({ id, group, manual }) => ({
      id,
      group,
      manual: !!manual,
      state: 'idle',
      detail: '',
    })),
  );
  readonly results = this._results.asReadonly();
  readonly running = computed(() => this._results().some(({ state }) => state === 'running'));

  /** Everything that needs no help of the user, one after the other. */
  async runAll(): Promise<void> {
    if (this.running()) return;
    for (const probe of this.probes) if (!probe.manual) await this.runProbe(probe);
  }

  async run(id: string): Promise<void> {
    const probe = this.probes.find((other) => other.id === id);
    if (probe && !this.running()) await this.runProbe(probe);
  }

  report(): string {
    return report(this._results(), navigator.userAgent, new Date());
  }

  private async runProbe(probe: Probe): Promise<void> {
    this.set(probe.id, { state: 'running', detail: '' });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Timeout')), TIMEOUT_MS);
      });
      const detail = await Promise.race([probe.run(), timeout]);
      this.set(probe.id, { state: 'ok', detail: redact(detail) });
    } catch (error) {
      const detail = redact(error instanceof Error ? error.message : String(error));
      this.set(probe.id, { state: error instanceof SkipProbe ? 'skipped' : 'failed', detail });
    } finally {
      clearTimeout(timer);
    }
  }

  private set(id: string, change: Pick<ProbeResult, 'state' | 'detail'>): void {
    this._results.update((all) => all.map((one) => (one.id === id ? { ...one, ...change } : one)));
  }
}
