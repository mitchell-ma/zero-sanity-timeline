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
    return base.map((r) => {
      if (!r.node) return r;
      // 1. Source IS the active loadout/view — use live sheet directly.
      if (r.source.loadoutUuid === activeNode.uuid) {
        return { ...r, sheetData: buildActiveSheetData() };
      }
      // 2. Source is a view whose PARENT is the active loadout — take live
      //    parent sheet and apply the view's override so edits propagate
      //    without waiting for the debounced auto-save.
      if (r.node.viewParentId && r.node.viewParentId === activeNode.id && r.node.viewOverride) {
        const liveParent = buildActiveSheetData();
        return { ...r, sheetData: applyViewOverride(liveParent, r.node.viewOverride) };
      }
      return r;
    });
    // buildActiveSheetData identity changes with combat state, so this memo
    // re-runs on every edit.
  }, [sourceList, loadoutTree, activeLoadoutId, buildActiveSheetData]);

  /**
   * Cache of simulation results keyed on `loadoutUuid`. Each entry remembers
   * the sheet-content hash that produced it, so we only re-run the full
   * combat simulation when the underlying sheet actually changes. Unrelated
   * re-renders (metric toggles, source reorders, loadout-tree renames) reuse
   * the cached damage statistics.
   */
  /**
   * In-memory cache of full all-mode simulations keyed by loadoutUuid. One
   * entry holds every crit mode's damage stats, so switching crit modes is
   * just an object lookup — no pipeline re-run. Rehydrated from localStorage
   * on first access so a reload also skips the pipeline entirely.
   *
   * Invalidation is content-addressed on the sheet JSON hash: when a source
   * sheet changes, the hash mismatches and the entry is recomputed.
   */
  const simCacheRef = useRef(new Map<string, { sheetHash: string; simulation: AllModeSimulationResult }>());

  const activeCritMode = activeStatisticsData?.critMode ?? CritMode.EXPECTED;

  const sourceBundles = useMemo<SourceStatsBundle[]>(() => {
    const cache = simCacheRef.current;
    const liveUuids = new Set<string>();

    const bundles = resolvedSources.map((r) => {
      const uuid = r.source.loadoutUuid;
      liveUuids.add(uuid);
      const sheet = r.sheetData;
      const aggregated = sheet ? computeAggregatedForSheet(sheet) : {};
      if (!sheet) return assembleBundle(r, aggregated, null);

      const sheetHash = JSON.stringify(sheet);

      let entry = cache.get(uuid);

      // Sheet changed? Evict both caches.
      if (entry && entry.sheetHash !== sheetHash) {
        cache.delete(uuid);
        clearCachedSim(uuid);
        entry = undefined;
      }

      // Rehydrate from localStorage before spinning the pipeline.
      if (!entry) {
        const persisted = loadCachedSim(uuid, sheetHash);
        if (persisted) {
          entry = { sheetHash, simulation: persisted };
          cache.set(uuid, entry);
        }
      }

      // Still no entry — simulate all 4 modes in one batch, persist.
      if (!entry) {
        const sim = simulateSheetAllModes(sheet);
        entry = { sheetHash, simulation: sim };
        cache.set(uuid, entry);
        saveCachedSim(uuid, sheetHash, sim);
      }

      const { damageStatisticsByMode, slots, loadouts, loadoutProperties, tableColumns } = entry.simulation;
      const modeSim: SimulationResult = {
        damageStatistics: damageStatisticsByMode[activeCritMode] ?? damageStatisticsByMode[CritMode.EXPECTED],
        slots, loadouts, loadoutProperties, tableColumns,
      };
      return assembleBundle(r, aggregated, modeSim);
    });

    // Evict in-memory entries for sources no longer referenced.
    const staleKeys: string[] = [];
    cache.forEach((_, uuid) => { if (!liveUuids.has(uuid)) staleKeys.push(uuid); });
    for (const k of staleKeys) cache.delete(k);
    return bundles;
  }, [resolvedSources, activeCritMode]);

  const comparisonRows = useMemo(
    () => (activeStatisticsData ? buildComparisonRows(sourceBundles, activeStatisticsData.metrics, activeStatisticsData.config) : []),
    [activeStatisticsData, sourceBundles],
  );

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
    handleSetCritMode,
    handleSetComparisonMode,
  };
}
