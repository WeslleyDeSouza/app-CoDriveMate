export type ProbeState = 'idle' | 'running' | 'ok' | 'failed' | 'skipped';
export type ProbeGroup = 'device' | 'input' | 'native' | 'service' | 'key';

export interface Probe {
  readonly id: string;
  readonly group: ProbeGroup;
  /** Resolves with a short detail; throws SkipProbe when there is nothing to test. */
  run(): Promise<string>;
  /** asks the user or makes a sound, so it does not run with the others */
  readonly manual?: boolean;
}

/** There is nothing to test, for example no key. */
export class SkipProbe extends Error {}

export interface ProbeResult {
  readonly id: string;
  readonly group: ProbeGroup;
  readonly manual: boolean;
  readonly state: ProbeState;
  readonly detail: string;
}

/** Port: everything that can be tested here. */
export abstract class ProbeSource {
  abstract probes(): readonly Probe[];
}

/** Keys and tokens must never appear in a report. */
export function redact(text: string): string {
  return text
    .replace(/\b(sk-|pk\.|AIza)[\w.-]{6,}/g, '$1…')
    .replace(/((?:access_token|key|token)=)[^&\s]+/gi, '$1…');
}

export function report(results: readonly ProbeResult[], device: string, at: Date): string {
  const mark = { ok: 'OK', failed: 'FEHLER', skipped: '-', idle: '-', running: '…' };
  return [
    'CoDriveMate ' + at.toISOString().slice(0, 16),
    device,
    ...results.map(
      ({ id, state, detail }) => `${mark[state]} ${id}${detail ? ': ' + redact(detail) : ''}`,
    ),
  ].join('\n');
}
