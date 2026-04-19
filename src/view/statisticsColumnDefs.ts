/**
 * Shared column metadata + localStorage-backed reorder state for the grouped
 * statistics table. Column reorder is purely visual (no semantic effect on
 * sources or calculations), so it persists globally across sheets rather
 * than per-sheet.
 */

import { StatisticsColumnType } from '../consts/enums';

export interface StatisticsColumnDef {
  /** Enum key used by both the filter menu and the reorder state. */
  id: StatisticsColumnType;
  /** Short header label. */
  label: string;
  /** `grid-template-columns` track for this column. */
  gridTrack: string;
}

/**
 * All grouped-table columns in their default display order. This is the
 * single source of truth — adding a new column means appending here and
 * wiring its renderer in `StatisticsGroupedTable`.
 */
export const STATISTICS_COLUMN_DEFS: ReadonlyArray<StatisticsColumnDef> = [
  { id: StatisticsColumnType.OPERATOR,           label: 'Operator',   gridTrack: 'minmax(0, 1.4fr)'  },
  { id: StatisticsColumnType.OPERATOR_POTENTIAL, label: 'Potential',  gridTrack: 'minmax(0, 0.85fr)' },
  { id: StatisticsColumnType.WEAPON_RANK,        label: 'Weapon Rank', gridTrack: 'minmax(0, 0.85fr)' },
  { id: StatisticsColumnType.TOTAL,              label: 'Total',      gridTrack: 'minmax(0, 0.9fr)'  },
  { id: StatisticsColumnType.BASIC,              label: 'Basic',      gridTrack: 'minmax(0, 0.9fr)'  },
  { id: StatisticsColumnType.BATTLE,             label: 'Battle',     gridTrack: 'minmax(0, 0.9fr)'  },
  { id: StatisticsColumnType.COMBO,              label: 'Combo',      gridTrack: 'minmax(0, 0.9fr)'  },
  { id: StatisticsColumnType.ULTIMATE,           label: 'Ultimate',   gridTrack: 'minmax(0, 0.9fr)'  },
  { id: StatisticsColumnType.TEAM_DPS,           label: 'Team DPS',   gridTrack: 'minmax(0, 0.9fr)'  },
  { id: StatisticsColumnType.CROWD_CONTROL,      label: 'CC%',        gridTrack: 'minmax(0, 0.7fr)'  },
  { id: StatisticsColumnType.DURATION,           label: 'Duration',   gridTrack: 'minmax(0, 0.7fr)'  },
  { id: StatisticsColumnType.TIME_TO_KILL,       label: 'TTK',        gridTrack: 'minmax(0, 0.7fr)'  },
];

export const STATISTICS_COLUMN_DEF_MAP: ReadonlyMap<StatisticsColumnType, StatisticsColumnDef> =
  new Map(STATISTICS_COLUMN_DEFS.map((d) => [d.id, d]));

export const DEFAULT_STATISTICS_COLUMN_ORDER: ReadonlyArray<StatisticsColumnType> =
  STATISTICS_COLUMN_DEFS.map((d) => d.id);

const LS_KEY = 'zst-statistics-col-order';

/**
 * Reads the persisted column order, silently falling back to the default
 * when storage is empty, corrupt, or out of sync with the current enum
 * (unknown ids dropped, missing ids appended at the end).
 */
export function loadStatisticsColumnOrder(): StatisticsColumnType[] {
  const defaults = [...DEFAULT_STATISTICS_COLUMN_ORDER];
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaults;

    const known = new Set(DEFAULT_STATISTICS_COLUMN_ORDER);
    const filtered = parsed.filter((x): x is StatisticsColumnType =>
      typeof x === 'string' && known.has(x as StatisticsColumnType),
    );
    // Append any columns the stored order is missing (enum was extended).
    for (const id of DEFAULT_STATISTICS_COLUMN_ORDER) {
      if (!filtered.includes(id)) filtered.push(id);
    }
    return filtered;
  } catch { return defaults; }
}

export function saveStatisticsColumnOrder(order: ReadonlyArray<StatisticsColumnType>) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(order)); } catch { /* ignore */ }
}
