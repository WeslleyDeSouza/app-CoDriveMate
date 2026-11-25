import { OBD_PIDS, decodePidResponse, responseLines } from './obd';

/** About the adapter itself; these never reach the car. */
const ADAPTER_REQUESTS = ['ATI', 'AT@1', 'ATDP', 'ATDPN', 'ATRV'];
/** Fault codes (stored, pending, permanent) and calibration. Not the chassis number. */
const CAR_REQUESTS = ['03', '07', '0A', '0900', '0904', '0906', '090A'];
const MASKS = ['00', '20', '40', '60', '80', 'A0', 'C0', 'E0'];

/** Reading only: mode 01, fault codes and calibration. Never 04, 08 or anything that writes. */
export function isReportRequest(command: string): boolean {
  return (
    /^01[0-9A-F]{2}$/.test(command) ||
    CAR_REQUESTS.includes(command) ||
    ADAPTER_REQUESTS.includes(command)
  );
}

export interface ObdAnswer {
  readonly name?: string;
  readonly raw: string;
  readonly ms: number;
  readonly value?: number;
}

export interface ObdReport {
  /** false if it was stopped or the connection was lost */
  readonly complete: boolean;
  readonly supportedPids: readonly string[];
  readonly answers: Readonly<Record<string, ObdAnswer>>;
}

/** PIDs named by the answer to a mask request; several control units may answer. */
export function pidsOfMask(mask: string, raw: string): string[] {
  const first = parseInt(mask, 16);
  const found = new Set<number>();
  for (const line of responseLines(raw)) {
    const at = line.indexOf('41' + mask);
    if (at < 0 || line.length < at + 12) continue;
    const bits = parseInt(line.slice(at + 4, at + 12), 16);
    for (let i = 0; i < 32; i++) if ((bits >>> (31 - i)) & 1) found.add(first + i + 1);
  }
  return [...found]
    .sort((a, b) => a - b)
    .map((pid) => pid.toString(16).toUpperCase().padStart(2, '0'));
}

const NAMES: Record<string, string> = Object.fromEntries(
  Object.entries(OBD_PIDS).map(([name, { code }]) => ['01' + code, name]),
);

/** Asks for everything the car says it delivers, one request after the other. */
export async function collectObd(
  request: (command: string) => Promise<string>,
  onProgress: (share: number) => void,
  cancelled: () => boolean,
): Promise<ObdReport> {
  const answers: Record<string, ObdAnswer> = {};
  const ask = async (command: string): Promise<string> => {
    const started = Date.now();
    const raw = (await request(command)).replace(/[\r\n]+/g, '\n').trim();
    const pid = Object.values(OBD_PIDS).find(({ code }) => '01' + code === command);
    const value = pid ? decodePidResponse(pid, raw) : null;
    answers[command] = {
      ...(NAMES[command] ? { name: NAMES[command] } : {}),
      raw,
      ms: Date.now() - started,
      ...(value === null ? {} : { value }),
    };
    return raw;
  };
  const supported: string[] = [];
  const report = (complete: boolean): ObdReport => ({
    complete,
    supportedPids: supported,
    answers,
  });
  for (const command of ADAPTER_REQUESTS) {
    if (cancelled()) return report(false);
    await ask(command);
  }
  for (const mask of MASKS) {
    if (cancelled()) return report(false);
    const found = pidsOfMask(mask, await ask('01' + mask));
    supported.push(...found);
    const next = (parseInt(mask, 16) + 32).toString(16).toUpperCase();
    // The last bit says whether there is a further mask.
    if (!found.includes(next)) break;
  }
  const rest = [
    ...supported.filter((pid) => !MASKS.includes(pid)).map((pid) => '01' + pid),
    ...CAR_REQUESTS,
  ];
  for (const [i, command] of rest.entries()) {
    if (cancelled()) return report(false);
    onProgress(i / rest.length);
    await ask(command);
  }
  onProgress(1);
  return report(true);
}
