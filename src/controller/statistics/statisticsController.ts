/**
 * Statistics controller — resolves sources, extracts metrics, and builds the
 * comparison grid shown in the statistics view.
 *
 * Each source in a `StatisticsData` references a loadout by `LoadoutNode.uuid`.
 * This controller resolves that reference against the live loadout tree, loads
 * the source's `SheetData`, and produces a `SourceStatsBundle` by:
 *   - Running the full combat simulation via `simulateSheet` to get current
 *     `DamageStatistics` for this source (fresh on every invocation).
 *   - Computing per-slot `AggregatedStats` via `aggregateLoadoutStats`.
 * No caching — every render recomputes. If this becomes a performance problem,
 * memoize at the hook layer (keyed on sheet identity).
 */

import { LoadoutTree, findNodeByUuid, loadLoadoutData, resolveSourceLoadoutId } from '../../utils/loadoutStorage';
import type { LoadoutNode } from '../../utils/loadoutStorage';
import { applyViewOverride } from '../../utils/applyViewOverride';
import { CritMode, LoadoutNodeType } from '../../consts/enums';
import type { StatisticsSource } from '../../utils/statisticsStorage';
import type { SheetData } from '../../utils/sheetStorage';
import type { DamageStatistics } from '../calculation/damageTableBuilder';
import { aggregateLoadoutStats, type AggregatedStats } from '../calculation/loadoutAggregator';
import { SLOT_IDS } from '../../app/sheetDefaults';
import { StatisticsMetricType, StatType } from '../../consts/enums';
import type { StatisticsMetricConfig } from '../../utils/statisticsStorage';
import { simulateSheet, type SimulationResult } from './simulateSheet';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ResolvedSource {
  /** The original source record (uuid + alias + color). */
  source: StatisticsSource;
  /** The LoadoutNode this source points at, or null if missing. */
  node: LoadoutNode | null;
  /** The sheet data backing the source, or null if the loadout is missing/empty. */
  sheetData: SheetData | null;
  /**
   * For loadout-views, the resolved parent loadout node. Data loads from the
   * view's own id (views store their post-override sheet under their own id).
   */
  parentNode: LoadoutNode | null;
  /** Human-readable label, preferring the source's alias, falling back to the node name. */
  label: string;
}

export interface SourceStatsBundle {
  resolved: ResolvedSource;
  /**
   * Per-slot aggregated stats. Lazy — computing this is expensive (one full
   * DataDrivenOperator model + potential/gear/weapon walk per slot) and the
   * only consumer is the AGGREGATED_STAT metric. Never instantiated by the
   * grouped-mode table. Cached on first call.
   */
  getAggregated: () => Record<string, AggregatedStats | null>;
  /**
   * Full simulation output when the source sheet is loadable; otherwise null.
   * Bundles the pieces needed to render the combat-sheet header per source.
   */
  simulation: SimulationResult | null;
}

/**
 * A single cell in the comparison grid. `value` is null when the metric isn't
 * computable for this source (missing cache, missing operator, etc.); `note`
 * carries the reason so the view can show a helpful message.
 */
export interface ComparisonCell {
  sourceUuid: string;
  value: number | null;
  note?: string;
}

export interface ComparisonRow {
  metric: StatisticsMetricType;
  label: string;
  /** Optional unit hint for formatting (e.g. "dmg", "dmg/s", "s", "%"). */
  unit?: ComparisonUnit;
  cells: ComparisonCell[];
}

export enum ComparisonUnit {
  DAMAGE = "DAMAGE",
  DPS = "DPS",
  SECONDS = "SECONDS",
  PERCENT = "PERCENT",
  FLAT = "FLAT",
}

// ─── Resolution ──────────────────────────────────────────────────────────────

export function resolveSources(
  sources: readonly StatisticsSource[],
  loadoutTree: LoadoutTree,
): ResolvedSource[] {
  // Per-call cache: 25 views of the same parent share one localStorage read +
  // JSON.parse instead of doing it 25 times.
  const loadCache = new Map<string, SheetData | null>();
  const cachedLoad = (id: string): SheetData | null => {
    if (loadCache.has(id)) return loadCache.get(id)!;
    const data = loadLoadoutData(id);
    loadCache.set(id, data);
    return data;
  };
  return sources.map((source) => resolveSource(source, loadoutTree, cachedLoad));
}

function resolveSource(
  source: StatisticsSource,
  loadoutTree: LoadoutTree,
  load: (id: string) => SheetData | null,
): ResolvedSource {
  const node = findNodeByUuid(loadoutTree, source.loadoutUuid) ?? null;
  if (!node) {
    return { source, node: null, sheetData: null, parentNode: null, label: source.alias ?? '(missing)' };
  }
  const parentId = resolveSourceLoadoutId(loadoutTree, node.id);
  const parentNode = parentId ? (loadoutTree.nodes.find((n) => n.id === parentId) ?? null) : null;
  // Views derive their sheet data from parent + override; loadouts load theirs directly.
  let sheetData = null;
  if (node.type === LoadoutNodeType.LOADOUT_VIEW && node.viewParentId) {
    const parentData = load(node.viewParentId);
    sheetData = parentData && node.viewOverride
      ? applyViewOverride(parentData, node.viewOverride)
      : parentData;
  } else {
    sheetData = load(node.id);
  }
  const label = source.alias?.trim() || node.name;
  return { source, node, sheetData, parentNode, label };
}

// ─── Per-source computation ─────────────────────────────────────────────────

/**
 * Compute per-slot aggregated stats. Expensive — instantiates a full operator
 * model per slot. Call lazily via `bundle.getAggregated()`.
 */
export function computeAggregatedForSheet(sheet: SheetData): Record<string, AggregatedStats | null> {
  const aggregated: Record<string, AggregatedStats | null> = {};
  for (let i = 0; i < SLOT_IDS.length; i++) {
    const slotId = SLOT_IDS[i];
    const operatorId = sheet.operatorIds[i];
    const loadout = sheet.loadouts[slotId];
    const props = sheet.loadoutProperties[slotId];
    if (!operatorId || !loadout || !props) {
      aggregated[slotId] = null;
      continue;
    }
    aggregated[slotId] = aggregateLoadoutStats(operatorId, loadout, props);
  }
  return aggregated;
}

/**
 * Run the combat simulation for a sheet. Expensive — callers should memoize
 * by sheet identity.
 */
export function runSimulation(sheet: SheetData, critMode: CritMode = CritMode.EXPECTED): SimulationResult {
  return simulateSheet(sheet, critMode);
}

/**
 * Assemble a bundle from already-computed pieces. Kept separate so the hook
 * layer can cache simulation results independently of the resolve step.
 *
 * `getAggregated` is a lazy thunk — the caller passes one in so the hook layer
 * can share a per-sheet cache across bundles and across renders.
 */
export function assembleBundle(
  resolved: ResolvedSource,
  getAggregated: () => Record<string, AggregatedStats | null>,
  simulation: SimulationResult | null,
): SourceStatsBundle {
  return { resolved, getAggregated, simulation };
}

// ─── Metric extraction ──────────────────────────────────────────────────────

export function extractMetric(
  bundle: SourceStatsBundle,
  metric: StatisticsMetricType,
  config: StatisticsMetricConfig | undefined,
): ComparisonCell {
  const sourceUuid = bundle.resolved.source.loadoutUuid;
  if (!bundle.resolved.node) {
    return { sourceUuid, value: null, note: 'source missing' };
  }

  switch (metric) {
    case StatisticsMetricType.TEAM_TOTAL_DAMAGE:
      return requireDamage(bundle, sourceUuid, (d) => d.teamTotalDamage);
    case StatisticsMetricType.TEAM_DPS:
      return requireDamage(bundle, sourceUuid, (d) => d.teamDps);
    case StatisticsMetricType.TIME_TO_KILL:
      return requireDamage(bundle, sourceUuid, (d) => (d.timeToKill != null ? d.timeToKill / FPS : null));
    case StatisticsMetricType.HIGHEST_BURST:
      return requireDamage(bundle, sourceUuid, (d) => d.highestBurst?.damage ?? null);
    case StatisticsMetricType.HIGHEST_TICK:
      return requireDamage(bundle, sourceUuid, (d) => d.highestTick?.damage ?? null);
    case StatisticsMetricType.OPERATOR_DAMAGE: {
      const opId = config?.operatorEntityId;
      if (!opId) return { sourceUuid, value: null, note: 'pick an operator' };
      return requireDamage(bundle, sourceUuid, (d) => {
        const entry = d.operators.find((o) => o.ownerEntityId === opId);
        return entry?.totalDamage ?? null;
      });
    }
    case StatisticsMetricType.COLUMN_DAMAGE: {
      const colId = config?.columnId;
      if (!colId) return { sourceUuid, value: null, note: 'pick a column' };
      return requireDamage(bundle, sourceUuid, (d) => {
        let total = 0;
        let found = false;
        d.columnTotals.forEach((v, k) => {
          if (k.endsWith(`|${colId}`) || k === colId) {
            total += v;
            found = true;
          }
        });
        return found ? total : null;
      });
    }
    case StatisticsMetricType.AGGREGATED_STAT: {
      const statType = config?.statType;
      if (!statType) return { sourceUuid, value: null, note: 'pick a stat' };
      const total = sumAggregatedStat(bundle, statType);
      return { sourceUuid, value: total };
    }
  }
}

const FPS = 120;

function requireDamage(
  bundle: SourceStatsBundle,
  sourceUuid: string,
  pick: (d: DamageStatistics) => number | null,
): ComparisonCell {
  if (!bundle.simulation) {
    return { sourceUuid, value: null, note: 'no sheet data' };
  }
  const value = pick(bundle.simulation.damageStatistics);
  return { sourceUuid, value };
}

function sumAggregatedStat(bundle: SourceStatsBundle, statType: StatType): number {
  const aggregated = bundle.getAggregated();
  let total = 0;
  for (const slotId of SLOT_IDS) {
    const agg = aggregated[slotId];
    if (!agg) continue;
    total += agg.stats[statType] ?? 0;
  }
  return total;
}

// ─── Comparison grid ────────────────────────────────────────────────────────

export function buildComparisonRows(
  bundles: SourceStatsBundle[],
  metrics: StatisticsMetricType[],
  config: StatisticsMetricConfig | undefined,
): ComparisonRow[] {
  return metrics.map((metric) => ({
    metric,
    label: metricLabel(metric, config),
    unit: metricUnit(metric),
    cells: bundles.map((b) => extractMetric(b, metric, config)),
  }));
}

export function metricLabel(metric: StatisticsMetricType, config: StatisticsMetricConfig | undefined): string {
  switch (metric) {
    case StatisticsMetricType.TEAM_TOTAL_DAMAGE: return 'Team total damage';
    case StatisticsMetricType.TEAM_DPS: return 'Team DPS';
    case StatisticsMetricType.TIME_TO_KILL: return 'Time to kill';
    case StatisticsMetricType.HIGHEST_BURST: return 'Highest 5s burst';
    case StatisticsMetricType.HIGHEST_TICK: return 'Highest single tick';
    case StatisticsMetricType.OPERATOR_DAMAGE: return `Operator damage${config?.operatorEntityId ? ` (${config.operatorEntityId})` : ''}`;
    case StatisticsMetricType.COLUMN_DAMAGE: return `Column damage${config?.columnId ? ` (${config.columnId})` : ''}`;
    case StatisticsMetricType.AGGREGATED_STAT: return config?.statType ? `Stat: ${config.statType}` : 'Aggregated stat';
  }
}

export function metricUnit(metric: StatisticsMetricType): ComparisonUnit {
  switch (metric) {
    case StatisticsMetricType.TEAM_TOTAL_DAMAGE:
    case StatisticsMetricType.HIGHEST_BURST:
    case StatisticsMetricType.HIGHEST_TICK:
    case StatisticsMetricType.OPERATOR_DAMAGE:
    case StatisticsMetricType.COLUMN_DAMAGE:
      return ComparisonUnit.DAMAGE;
    case StatisticsMetricType.TEAM_DPS:
      return ComparisonUnit.DPS;
    case StatisticsMetricType.TIME_TO_KILL:
      return ComparisonUnit.SECONDS;
    case StatisticsMetricType.AGGREGATED_STAT:
      return ComparisonUnit.FLAT;
  }
}

// ─── Formatting helpers (for the view) ──────────────────────────────────────

export function formatComparisonValue(value: number | null, unit: ComparisonUnit | undefined): string {
  if (value == null) return '—';
  switch (unit) {
    case ComparisonUnit.DAMAGE:
    case ComparisonUnit.DPS:
    case ComparisonUnit.FLAT:
      return Math.round(value).toLocaleString();
    case ComparisonUnit.SECONDS:
      return `${value.toFixed(2)}s`;
    case ComparisonUnit.PERCENT:
      return `${(value * 100).toFixed(1)}%`;
    default:
      return String(value);
  }
}
