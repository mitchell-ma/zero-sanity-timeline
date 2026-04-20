/**
 * Statistics-page master hook — parallel to `useApp`.
 *
 * Owns the statistics tree, active statistics id, and active statistics data.
 * Derives comparison rows from the live loadout tree (so loadouts added or
 * deleted reflect immediately in statistics views).
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  StatisticsTree,
  StatisticsData,
  StatisticsNode,
  loadStatisticsTree,
  saveStatisticsTree,
  loadActiveStatisticsId,
  saveActiveStatisticsId,
  loadStatisticsData,
  saveStatisticsData,
  deleteStatisticsData,
  addStatistics as addStatisticsNode,
  renameNode,
  uniqueName,
  createEmptyStatisticsData,
  addSource as addSourceToData,
  removeSource as removeSourceFromData,
  updateSource as updateSourceInData,
  reorderSources as reorderSourcesInData,
  toggleMetric as toggleMetricInData,
  toggleColumn as toggleColumnInData,
  toggleOperator as toggleOperatorInData,
  toggleAggregate as toggleAggregateInData,
  setCritMode as setCritModeInData,
  setComparisonMode as setComparisonModeInData,
  type StatisticsSource,
  type StatisticsMetricConfig,
} from '../utils/statisticsStorage';
import type { LoadoutTree } from '../utils/loadoutStorage';
import type { SheetData } from '../utils/sheetStorage';
import { applyViewOverride } from '../utils/applyViewOverride';
import { loadCachedSim, saveCachedSim, clearCachedSim } from '../utils/statisticsSimCache';
import { simulateSheetAllModes, type AllModeSimulationResult } from '../controller/statistics/simulateSheet';
import {
  resolveSources,
  computeAggregatedForSheet,
  assembleBundle,
  buildComparisonRows,
  type ComparisonRow,
  type ResolvedSource,
  type SourceStatsBundle,
} from '../controller/statistics/statisticsController';
import type { SimulationResult } from '../controller/statistics/simulateSheet';
import type { AggregatedStats } from '../controller/calculation/loadoutAggregator';
import { StatisticsMetricType, StatisticsLayoutType, StatisticsNodeType, StatisticsColumnType, CritMode, ComparisonModeType } from '../consts/enums';

export interface UseStatisticsAppReturn {
  statisticsTree: StatisticsTree;
  activeStatisticsId: string | null;
  activeStatisticsData: StatisticsData | null;
  activeStatisticsNode: StatisticsNode | null;
  resolvedSources: ResolvedSource[];
  sourceBundles: SourceStatsBundle[];
  comparisonRows: ComparisonRow[];

  handleTreeChange: (tree: StatisticsTree) => void;
  handleSelectStatistics: (id: string) => void;
  handleNewStatistics: (parentId: string | null) => void;
  handleDeleteStatistics: (dataIds: string[]) => void;
  handleRenameStatistics: (nodeId: string, name: string) => void;

  handleAddSource: (source: StatisticsSource) => void;
  handleRemoveSource: (loadoutUuid: string) => void;
  handleUpdateSource: (loadoutUuid: string, patch: Partial<StatisticsSource>) => void;
  handleReorderSources: (fromIndex: number, toIndex: number) => void;

  handleToggleMetric: (metric: StatisticsMetricType) => void;
  handleChangeLayout: (layout: StatisticsLayoutType) => void;
  handleUpdateMetricConfig: (patch: Partial<StatisticsMetricConfig>) => void;
  handleToggleColumn: (column: StatisticsColumnType) => void;
  handleToggleOperator: (slotId: string) => void;
  handleToggleAggregate: () => void;
  handleSetCritMode: (critMode: CritMode) => void;
  handleSetComparisonMode: (comparisonMode: ComparisonModeType) => void;
}

export function useStatisticsApp(
  loadoutTree: LoadoutTree,
  /**
   * The live sheet data for the currently-active combat loadout, and its id.
   * Sources that resolve to this id use the live data instead of reading from
   * localStorage, so edits in the combat view reflect in the statistics page
   * without waiting for the debounced per-loadout save.
   */
  activeLoadoutId: string | null,
  buildActiveSheetData: () => SheetData,
): UseStatisticsAppReturn {
  const [statisticsTree, setStatisticsTree] = useState<StatisticsTree>(() => loadStatisticsTree());
  const [activeStatisticsId, setActiveStatisticsId] = useState<string | null>(() => loadActiveStatisticsId());
  const [activeStatisticsData, setActiveStatisticsData] = useState<StatisticsData | null>(() => {
    const id = loadActiveStatisticsId();
    return id ? loadStatisticsData(id) : null;
  });

  // Persist tree & active id & data on change
  useEffect(() => { saveStatisticsTree(statisticsTree); }, [statisticsTree]);
  useEffect(() => {
    if (activeStatisticsId) saveActiveStatisticsId(activeStatisticsId);
  }, [activeStatisticsId]);
  useEffect(() => {
    if (activeStatisticsId && activeStatisticsData) {
      saveStatisticsData(activeStatisticsId, activeStatisticsData);
    }
  }, [activeStatisticsId, activeStatisticsData]);

  const activeStatisticsNode = useMemo(
    () => (activeStatisticsId ? statisticsTree.nodes.find((n) => n.id === activeStatisticsId) ?? null : null),
    [statisticsTree, activeStatisticsId],
  );

  // Derived: resolved sources and comparison rows
  const sourceList = activeStatisticsData?.sources;

  /**
   * Resolve sources against the live loadout tree, swapping in the active
   * loadout's in-memory sheet data when applicable. Re-resolves whenever
   * `buildActiveSheetData`'s identity changes (i.e. any combat-view edit).
   */
  const resolvedSources = useMemo(() => {
    if (!sourceList) return [];
    const base = resolveSources(sourceList, loadoutTree);
    if (!activeLoadoutId) return base;
    const activeNode = loadoutTree.nodes.find((n) => n.id === activeLoadoutId);
    if (!activeNode) return base;
    // Lazy-compute the live sheet once and reuse across all sources. With
    // 25 views of the active loadout this collapses 25 full serializations
    // into 1.
    let liveSheet: SheetData | null = null;
    const getLiveSheet = (): SheetData => (liveSheet ??= buildActiveSheetData());
    return base.map((r) => {
      if (!r.node) return r;
      if (r.source.loadoutUuid === activeNode.uuid) {
        return { ...r, sheetData: getLiveSheet() };
      }
      if (r.node.viewParentId && r.node.viewParentId === activeNode.id && r.node.viewOverride) {
        return { ...r, sheetData: applyViewOverride(getLiveSheet(), r.node.viewOverride) };
      }
      return r;
    });
  }, [sourceList, loadoutTree, activeLoadoutId, buildActiveSheetData]);

  /**
   * In-memory LRU cache of full all-mode simulations keyed by loadoutUuid.
   * One entry holds every crit mode's damage stats, so switching crit modes
   * is an object lookup — no pipeline re-run. Rehydrated from localStorage
   * on first access so a reload also skips the pipeline entirely.
   *
   * Invalidation is content-addressed on the sheet JSON hash: when a source
   * sheet actually changes (combat-planner edit, view-override edit), the
   * hash mismatches and the entry is recomputed. Navigating between stats
   * sheets is NOT a change — entries for sources not in the current view
   * stay in cache so clicking back is instant.
   *
   * Size cap prevents unbounded memory growth if a user opens many distinct
   * loadouts in one session. Eviction is LRU: the Map's insertion order acts
   * as the recency list, `cache.set(uuid, ...)` always re-inserts at the
   * tail, and overflow drops the oldest head entry.
   */
  const simCacheRef = useRef(new Map<string, { sheetHash: string; simulation: AllModeSimulationResult }>());
  const SIM_CACHE_MAX = 200;

  // Per-sheet-identity caches for the two expensive per-source computations.
  // Both are stable: if the sheet object hasn't been rebuilt, neither the
  // aggregated per-slot stats nor the JSON hash can have changed.
  const aggregatedCacheRef = useRef(new WeakMap<SheetData, Record<string, AggregatedStats | null>>());
  const hashCacheRef = useRef(new WeakMap<SheetData, string>());

  const activeCritMode = activeStatisticsData?.critMode ?? CritMode.EXPECTED;

  const sourceBundles = useMemo<SourceStatsBundle[]>(() => {
    const cache = simCacheRef.current;
    const aggregatedCache = aggregatedCacheRef.current;
    const hashCache = hashCacheRef.current;

    // LRU touch: re-insert to move the entry to the Map's tail (most-recent).
    const touch = (uuid: string, value: { sheetHash: string; simulation: AllModeSimulationResult }) => {
      cache.delete(uuid);
      cache.set(uuid, value);
      while (cache.size > SIM_CACHE_MAX) {
        const oldest = cache.keys().next().value;
        if (oldest === undefined) break;
        cache.delete(oldest);
      }
    };

    return resolvedSources.map((r) => {
      const uuid = r.source.loadoutUuid;
      const sheet = r.sheetData;
      if (!sheet) return assembleBundle(r, () => ({}), null);

      // Lazy getter — only computes when a consumer (e.g. AGGREGATED_STAT
      // metric) actually reads it. Cached by sheet object identity.
      const getAggregated = () => {
        let aggregated = aggregatedCache.get(sheet);
        if (!aggregated) {
          aggregated = computeAggregatedForSheet(sheet);
          aggregatedCache.set(sheet, aggregated);
        }
        return aggregated;
      };

      let sheetHash = hashCache.get(sheet);
      if (sheetHash === undefined) {
        sheetHash = JSON.stringify(sheet);
        hashCache.set(sheet, sheetHash);
      }

      let entry = cache.get(uuid);

      // Hash mismatch = real content change (combat-planner edit, view
      // override edit). Only eviction trigger — navigation alone never
      // evicts.
      if (entry && entry.sheetHash !== sheetHash) {
        cache.delete(uuid);
        clearCachedSim(uuid);
        entry = undefined;
      }

      // Rehydrate from localStorage before spinning the pipeline.
      if (!entry) {
        const persisted = loadCachedSim(uuid, sheetHash);
        if (persisted) entry = { sheetHash, simulation: persisted };
      }

      // Still no entry — simulate all 4 modes in one batch, persist.
      if (!entry) {
        const sim = simulateSheetAllModes(sheet);
        entry = { sheetHash, simulation: sim };
        saveCachedSim(uuid, sheetHash, sim);
      }

      touch(uuid, entry);

      const { damageStatisticsByMode, slots, loadouts, loadoutProperties, tableColumns } = entry.simulation;
      const modeSim: SimulationResult = {
        damageStatistics: damageStatisticsByMode[activeCritMode] ?? damageStatisticsByMode[CritMode.EXPECTED],
        slots, loadouts, loadoutProperties, tableColumns,
      };
      return assembleBundle(r, getAggregated, modeSim);
    });
  }, [resolvedSources, activeCritMode]);

  const comparisonRows = useMemo(
    () => (activeStatisticsData ? buildComparisonRows(sourceBundles, activeStatisticsData.metrics, activeStatisticsData.config) : []),
    [activeStatisticsData, sourceBundles],
  );

  // Auto-purge sources whose loadout was deleted from the library. They'd
  // otherwise render as orphaned "(missing)" cards; the user asked for them
  // to just disappear. Effect re-runs only when resolvedSources changes, and
  // after purge the next resolvedSources has no missing entries so it settles.
  useEffect(() => {
    const missingUuids = resolvedSources.filter((r) => !r.node).map((r) => r.source.loadoutUuid);
    if (missingUuids.length === 0) return;
    setActiveStatisticsData((prev) => {
      if (!prev) return prev;
      let next = prev;
      for (const uuid of missingUuids) next = removeSourceFromData(next, uuid);
      return next;
    });
  }, [resolvedSources]);

  // ── Tree handlers ─────────────────────────────────────────────────────────

  const handleTreeChange = useCallback((tree: StatisticsTree) => {
    setStatisticsTree(tree);
  }, []);

  const handleSelectStatistics = useCallback((id: string) => {
    setActiveStatisticsId(id);
    setActiveStatisticsData(loadStatisticsData(id) ?? createEmptyStatisticsData());
  }, []);

  const handleNewStatistics = useCallback((parentId: string | null) => {
    setStatisticsTree((prev) => {
      const { tree, node } = addStatisticsNode(prev, 'New Statistics', parentId);
      const empty = createEmptyStatisticsData();
      saveStatisticsData(node.id, empty);
      setActiveStatisticsId(node.id);
      setActiveStatisticsData(empty);
      return tree;
    });
  }, []);

  const handleDeleteStatistics = useCallback((dataIds: string[]) => {
    for (const id of dataIds) deleteStatisticsData(id);
    if (activeStatisticsId && dataIds.includes(activeStatisticsId)) {
      setActiveStatisticsId(null);
      setActiveStatisticsData(null);
    }
  }, [activeStatisticsId]);

  const handleRenameStatistics = useCallback((nodeId: string, name: string) => {
    setStatisticsTree((prev) => {
      const finalName = uniqueName(prev, name.trim(), prev.nodes.find((n) => n.id === nodeId)?.parentId ?? null, nodeId);
      return renameNode(prev, nodeId, finalName);
    });
  }, []);

  // ── Source handlers ──────────────────────────────────────────────────────

  const handleAddSource = useCallback((source: StatisticsSource) => {
    setActiveStatisticsData((prev) => (prev ? addSourceToData(prev, source) : prev));
  }, []);

  const handleRemoveSource = useCallback((loadoutUuid: string) => {
    setActiveStatisticsData((prev) => (prev ? removeSourceFromData(prev, loadoutUuid) : prev));
  }, []);

  const handleUpdateSource = useCallback((loadoutUuid: string, patch: Partial<StatisticsSource>) => {
    setActiveStatisticsData((prev) => (prev ? updateSourceInData(prev, loadoutUuid, patch) : prev));
  }, []);

  const handleReorderSources = useCallback((fromIndex: number, toIndex: number) => {
    setActiveStatisticsData((prev) => (prev ? reorderSourcesInData(prev, fromIndex, toIndex) : prev));
  }, []);

  // ── Metric / layout handlers ─────────────────────────────────────────────

  const handleToggleMetric = useCallback((metric: StatisticsMetricType) => {
    setActiveStatisticsData((prev) => (prev ? toggleMetricInData(prev, metric) : prev));
  }, []);

  const handleChangeLayout = useCallback((layout: StatisticsLayoutType) => {
    setActiveStatisticsData((prev) => (prev ? { ...prev, layout } : prev));
  }, []);

  const handleUpdateMetricConfig = useCallback((patch: Partial<StatisticsMetricConfig>) => {
    setActiveStatisticsData((prev) => (prev ? { ...prev, config: { ...prev.config, ...patch } } : prev));
  }, []);

  const handleToggleColumn = useCallback((column: StatisticsColumnType) => {
    setActiveStatisticsData((prev) => (prev ? toggleColumnInData(prev, column) : prev));
  }, []);

  const handleToggleOperator = useCallback((slotId: string) => {
    setActiveStatisticsData((prev) => (prev ? toggleOperatorInData(prev, slotId) : prev));
  }, []);

  const handleToggleAggregate = useCallback(() => {
    setActiveStatisticsData((prev) => (prev ? toggleAggregateInData(prev) : prev));
  }, []);

  const handleSetCritMode = useCallback((critMode: CritMode) => {
    setActiveStatisticsData((prev) => (prev ? setCritModeInData(prev, critMode) : prev));
  }, []);

  const handleSetComparisonMode = useCallback((comparisonMode: ComparisonModeType) => {
    setActiveStatisticsData((prev) => (prev ? setComparisonModeInData(prev, comparisonMode) : prev));
  }, []);

  // Handle case where previously-active id is gone (deleted externally)
  useEffect(() => {
    if (activeStatisticsId && !statisticsTree.nodes.find((n) => n.id === activeStatisticsId)) {
      setActiveStatisticsId(null);
      setActiveStatisticsData(null);
    }
  }, [activeStatisticsId, statisticsTree]);

  // If there's at least one statistics sheet but nothing is active, open the
  // first one. Prevents a confusing "nothing selected" empty state when the
  // user has sheets saved from a previous session.
  useEffect(() => {
    if (activeStatisticsId) return;
    const firstSheet = statisticsTree.nodes
      .filter((n) => n.type === StatisticsNodeType.STATISTICS)
      .sort((a, b) => a.order - b.order)[0];
    if (firstSheet) {
      setActiveStatisticsId(firstSheet.id);
      setActiveStatisticsData(loadStatisticsData(firstSheet.id) ?? createEmptyStatisticsData());
    }
  }, [activeStatisticsId, statisticsTree]);

  return {
    statisticsTree,
    activeStatisticsId,
    activeStatisticsData,
    activeStatisticsNode,
    resolvedSources,
    sourceBundles,
    comparisonRows,
    handleTreeChange,
    handleSelectStatistics,
    handleNewStatistics,
    handleDeleteStatistics,
    handleRenameStatistics,
    handleAddSource,
    handleRemoveSource,
    handleUpdateSource,
    handleReorderSources,
    handleToggleMetric,
    handleChangeLayout,
    handleUpdateMetricConfig,
    handleToggleColumn,
    handleToggleOperator,
    handleToggleAggregate,
    handleSetCritMode,
    handleSetComparisonMode,
  };
}
