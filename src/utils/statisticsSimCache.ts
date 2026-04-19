/**
 * Persistent per-source simulation cache for the statistics page.
 *
 * One cache entry per `loadoutUuid`, holding every crit mode's damage stats
 * together. Switching crit modes in the statistics view is then an object
 * lookup — no pipeline re-run, no localStorage round-trip. Invalidation is
 * content-addressed via a hash of the source sheet; when the sheet changes,
 * the hash mismatches and the stored entry is ignored.
 *
 * Storage key: `zst-stats-sim-{loadoutUuid}`.
 */

import type { AllModeSimulationResult } from '../controller/statistics/simulateSheet';
import type { DamageStatistics } from '../controller/calculation/damageTableBuilder';
import { CritMode } from '../consts/enums';

const KEY_PREFIX = 'zst-stats-sim-';

interface SerializedDamageStatistics extends Omit<DamageStatistics, 'columnTotals'> {
  columnTotalsEntries: [string, number][];
}

interface SerializedAllModeSim {
  damageStatisticsByMode: Record<CritMode, SerializedDamageStatistics>;
  slots: AllModeSimulationResult['slots'];
  loadouts: AllModeSimulationResult['loadouts'];
  loadoutProperties: AllModeSimulationResult['loadoutProperties'];
  tableColumns: AllModeSimulationResult['tableColumns'];
}

interface Entry {
  sheetHash: string;
  simulation: SerializedAllModeSim;
}

function storageKey(uuid: string): string {
  return `${KEY_PREFIX}${uuid}`;
}

function serializeStats(stats: DamageStatistics): SerializedDamageStatistics {
  const { columnTotals, ...rest } = stats;
  return { ...rest, columnTotalsEntries: Array.from(columnTotals.entries()) };
}

function deserializeStats(s: SerializedDamageStatistics): DamageStatistics {
  const { columnTotalsEntries, ...rest } = s;
  return { ...rest, columnTotals: new Map(columnTotalsEntries) };
}

function serialize(sim: AllModeSimulationResult): SerializedAllModeSim {
  const byMode = {} as Record<CritMode, SerializedDamageStatistics>;
  for (const [mode, stats] of Object.entries(sim.damageStatisticsByMode)) {
    byMode[mode as CritMode] = serializeStats(stats);
  }
  return {
    damageStatisticsByMode: byMode,
    slots: sim.slots,
    loadouts: sim.loadouts,
    loadoutProperties: sim.loadoutProperties,
    tableColumns: sim.tableColumns,
  };
}

function deserialize(s: SerializedAllModeSim): AllModeSimulationResult {
  const byMode = {} as Record<CritMode, DamageStatistics>;
  for (const [mode, stats] of Object.entries(s.damageStatisticsByMode)) {
    byMode[mode as CritMode] = deserializeStats(stats);
  }
  return {
    damageStatisticsByMode: byMode,
    slots: s.slots,
    loadouts: s.loadouts,
    loadoutProperties: s.loadoutProperties,
    tableColumns: s.tableColumns,
  };
}

export function loadCachedSim(uuid: string, sheetHash: string): AllModeSimulationResult | null {
  try {
    const raw = localStorage.getItem(storageKey(uuid));
    if (!raw) return null;
    const entry = JSON.parse(raw) as Entry;
    if (entry.sheetHash !== sheetHash) return null;
    return deserialize(entry.simulation);
  } catch {
    return null;
  }
}

export function saveCachedSim(uuid: string, sheetHash: string, sim: AllModeSimulationResult): void {
  try {
    const entry: Entry = { sheetHash, simulation: serialize(sim) };
    localStorage.setItem(storageKey(uuid), JSON.stringify(entry));
  } catch {
    // Quota or serialization failure — swallow, the in-memory cache still works.
  }
}

export function clearCachedSim(uuid: string): void {
  try {
    localStorage.removeItem(storageKey(uuid));
  } catch { /* ignore */ }
}
