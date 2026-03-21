/**
 * Loader for raw gear set JSON data (set name, description, pieces with full stats).
 *
 * Used by gallery views that need complete gear set information beyond
 * what the registry provides (e.g. set descriptions, per-rank stat tables).
 */

export interface GearPieceData {
  gearType: string;
  name: string;
  gearCategory: string;
  defense: number;
  allLevels: Record<string, Record<string, number>>;
}

export interface GearSetData {
  gearSetType: string;
  name: string;
  suitID?: string;
  rarity: number;
  setEffect?: {
    piecesRequired: number;
    gearSetEffectType: string;
    description: string;
  };
  pieces: GearPieceData[];
  dataSources?: string[];
}

const gearJsonContext = require.context('./gears/gear-statuses', false, /-statuses\.json$/);

const GEAR_SET_DATA: Record<string, GearSetData> = {};

for (const key of gearJsonContext.keys()) {
  const entries = gearJsonContext(key) as Record<string, unknown>[];
  if (!Array.isArray(entries)) continue;
  const raw = entries.find(e => (e.properties as Record<string, unknown>)?.type === 'GEAR_SET_EFFECT');
  if (!raw) continue;
  const props = (raw.properties ?? {}) as Record<string, unknown>;
  const meta = (raw.metadata ?? {}) as Record<string, unknown>;
  const id = props.id as string;
  if (id) {
    GEAR_SET_DATA[id] = {
      gearSetType: id,
      name: (props.name ?? '') as string,
      rarity: (props.rarity ?? 0) as number,
      ...(props.piecesRequired ? {
        setEffect: {
          piecesRequired: props.piecesRequired as number,
          gearSetEffectType: id,
          description: (props.description ?? '') as string,
        },
      } : {}),
      pieces: [],
      dataSources: (meta.dataSources ?? []) as string[],
    };
  }
}

/** Look up full gear set data by gearSetType key. */
export function getGearSetData(gearSetType: string): GearSetData | undefined {
  return GEAR_SET_DATA[gearSetType];
}

/** Get all available gear set data entries. */
export function getAllGearSetData(): GearSetData[] {
  return Object.values(GEAR_SET_DATA);
}
