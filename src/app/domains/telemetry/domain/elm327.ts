import { AdapterConnection, AdapterLink, AdapterRef } from './adapter';
import { parseSupportedPids } from './obd';

const INIT_COMMANDS = ['ATE0', 'ATL0', 'ATS0', 'ATH0', 'ATAT1', 'ATSP0'];
const RESET_PAUSE_MS = 800;

export interface Elm327Session {
  readonly protocol: string;
  readonly supportedPids: string;
}

/** The engine control unit does not answer; usually the ignition is off. */
export class NoEcuError extends Error {
  constructor() {
    super('No answer from the engine control unit.');
    this.name = 'NoEcuError';
  }
}

/**
 * Conversation with an ELM327 adapter over any byte channel: one command at a
 * time, the answer ends with the prompt character '>'.
 */
export class Elm327 {
  private readonly decoder = new TextDecoder();
  private readonly encoder = new TextEncoder();
  private connection?: AdapterConnection;
  private buffer = '';
  private pending?: (answer: string) => void;
  private queue: Promise<unknown> = Promise.resolve();
  private closed = false;

  get isClosed(): boolean {
    return this.closed;
  }

  private constructor(private readonly resetPauseMs: number) {}

  static async connect(
    link: AdapterLink,
    adapter: AdapterRef,
    onClose: () => void,
    resetPauseMs = RESET_PAUSE_MS,
  ): Promise<Elm327> {
    const elm = new Elm327(resetPauseMs);
    elm.connection = await link.open(
      adapter,
      (data) => elm.receive(data),
      () => {
        const expected = elm.closed;
        elm.end();
        if (!expected) onClose();
      },
    );
    return elm;
  }

  /** Resets the adapter and finds the protocol. */
  async initialize(): Promise<Elm327Session> {
    await this.command('ATZ', 5000);
    await new Promise((resolve) => setTimeout(resolve, this.resetPauseMs));
    for (const command of INIT_COMMANDS) await this.command(command);
    const supportedPids = parseSupportedPids(await this.command('0100', 20000));
    if (!supportedPids) throw new NoEcuError();
    const protocol = (await this.command('ATDP')).replace(/^AUTO,\s*/, '').trim();
    return { protocol, supportedPids };
  }

  /** Sends a command and resolves with the answer, 'TIMEOUT' or 'ERROR'. */
  command(command: string, timeoutMs = 3000): Promise<string> {
    const result = this.queue.then(() => this.send(command, timeoutMs));
    this.queue = result.catch(() => undefined);
    return result;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.end();
    await this.connection?.close().catch(() => undefined);
  }

  private send(command: string, timeoutMs: number): Promise<string> {
    return new Promise<string>((resolve) => {
      if (this.closed || !this.connection) return resolve('ERROR');
      this.buffer = '';
      const finish = (answer: string) => {
        clearTimeout(timer);
        this.pending = undefined;
        resolve(answer);
      };
      const timer = setTimeout(() => finish('TIMEOUT'), timeoutMs);
      this.pending = finish;
      this.connection.write(this.encoder.encode(command + '\r')).catch(() => finish('ERROR'));
    });
  }

  private receive(data: Uint8Array): void {
    this.buffer += this.decoder.decode(data);
    const end = this.buffer.indexOf('>');
    if (end < 0) return;
    const answer = this.buffer.slice(0, end).trim();
    this.buffer = this.buffer.slice(end + 1);
    this.pending?.(answer);
  }

  private end(): void {
    this.closed = true;
    this.pending?.('ERROR');
  }
}
