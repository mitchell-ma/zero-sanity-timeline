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

const gearJsonContext = require.context('./gears', false, /\.json$/);

const GEAR_SET_DATA: Record<string, GearSetData> = {};

for (const key of gearJsonContext.keys()) {
  const data = gearJsonContext(key) as GearSetData;
  if (data.gearSetType) {
    GEAR_SET_DATA[data.gearSetType] = data;
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
