export type DataKind = 'obd' | 'esp' | 'scene';
export const DATA_KINDS: readonly DataKind[] = ['obd', 'esp', 'scene'];

/** The last reading of a module, to look at and copy later. */
export interface SavedReading {
  /** timestamp in ms */
  readonly at: number;
  /** the JSON as shown */
  readonly json: string;
}

export type SavedReadings = Partial<Record<DataKind, SavedReading>>;

/** Port: keeps only the last reading per module, no history. */
export abstract class ReadingRepository {
  abstract load(): Promise<SavedReadings>;
  abstract save(kind: DataKind, reading: SavedReading): Promise<void>;
}
