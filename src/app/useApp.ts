/**
 * Master application hook — owns all state, handlers, and derived values.
 * App.tsx calls this hook and renders the returned values.
 */

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { NounType } from '../dsl/semantics';
import { initCustomWeapons } from '../controller/custom/customWeaponController';
import { initCustomGearSets } from '../controller/custom/customGearController';
import { initCustomOperators } from '../controller/custom/customOperatorController';
import { useCombatState } from './useCombatState';
import type { Orientation } from '../utils/axisMap';
import { LoadoutProperties } from '../view/InformationPane';
import { OperatorLoadoutState } from '../view/OperatorLoadoutHeader';
import { ALL_OPERATORS, getUltimateEnergyCost } from '../controller/operators/operatorRegistry';
import { ALL_ENEMIES, DEFAULT_ENEMY } from '../utils/enemies';
import { TimelineEvent, VisibleSkills, ContextMenuState, SkillType, SelectedFrame, ResourceConfig, MiniTimeline, computeSegmentsSpan, eventEndFrame } from '../consts/viewTypes';
import type { DamageTableRow } from '../controller/calculation/damageTableBuilder';
import { getModelEnemy } from '../controller/calculation/enemyRegistry';
import { processCombatSimulation, getLastCritResults } from '../controller/timeline/eventQueueController';
import { SlotTriggerWiring } from '../controller/timeline/eventQueueTypes';
import { getComboTriggerClause } from '../controller/gameDataStore';
import { buildColumns } from '../controller/timeline/columnBuilder';
import {
  createEvent,
  genEventUid,
  wouldOverlapNonOverlappable,
  setNextEventUid,
  getNextEventUid,
  filterEventsToColumns,
  buildValidColumnPairs,
  setCombatLoadout,
  hasSufficientSP,
} from '../controller/timeline/inputEventController';
import {
  serializeSheet,
  clearLocalStorage,
  importMultiLoadoutFile,
} from '../utils/sheetStorage';
import { decodeEmbed, getEmbedParams } from '../utils/embedCodec';
import {
  SLOT_IDS,
  INITIAL_OPERATORS,
  INITIAL_VISIBLE,
  INITIAL_LOADOUTS,
  INITIAL_LOADOUT_PROPERTIES,
  applySheetData,
  loadInitialState,
} from './sheetDefaults';
import { generateCommunityLoadout, isCommunityLoadoutId, getCommunityLoadoutName } from './communityLoadouts';
import {
  LoadoutTree,
  loadLoadoutTree,
  saveLoadoutTree,
  loadActiveLoadoutId,
  saveActiveLoadoutId,
  loadLoadoutData,
  saveLoadoutData,
  deleteLoadoutData,
  addLoadout as addLoadoutNode,
  addLoadoutAfter,
  renameNode,
  uniqueName,
  mergeBundle,
} from '../utils/loadoutStorage';
import { useTreeHistory } from '../utils/useTreeHistory';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { useCombatLoadout } from './useCombatLoadout';
import { useResourceGraphs } from './useResourceGraphs';
import { useAutoSave } from './useAutoSave';
import { LOADOUT_ROW_HEIGHT, FPS, TOTAL_FRAMES, frameToPx } from '../utils/timeline';
import { COMMON_OWNER_ID, COMMON_COLUMN_IDS } from '../controller/slot/commonSlotController';
import {
  CombatState,
  EnemyStats,
  computeSlots,
  computeDefaultResourceConfig,
  attachDefaultSegments,
  getDefaultEnemyStats,
} from '../controller/appStateController';
import { resolveGainEfficiencies } from '../controller/timeline/ultimateEnergyController';
import { StatType, InteractionModeType, InfoLevel, CritMode, EnhancementType, ThemeType, ColumnType, LoadoutNodeType } from '../consts/enums';
import { buildOverrideKey } from '../controller/overrideController';
import type { MoveContext } from '../controller/combatStateController';
import { applyEventOverrides } from '../controller/timeline/overrideApplicator';
import { GlobalSettings, loadSettings, saveSettings, migrateLegacySettings, PERFORMANCE_THROTTLE } from '../consts/settings';
import { configurePool } from '../controller/timeline/objectPool';
import { COMBO_WINDOW_COLUMN_ID, ultimateGraphKey } from '../model/channels';
// SkillPointConsumptionHistory/ResourceZone types inferred via useMemo from controller

// ── Module-scope initialization ──────────────────────────────────────────────

// Run v1→v2 migration before loading custom content (idempotent)
import { ensureMigrated } from '../utils/customContentStorage';
ensureMigrated();

// Register custom content before loading sheet data (sheets may reference custom items)
initCustomWeapons();
initCustomGearSets();
initCustomOperators();

const initialLoad = loadInitialState();
const initialSettings = migrateLegacySettings(loadSettings());
configurePool(initialSettings.enablePooling, initialSettings.eventPoolLimit, initialSettings.enableReconciler);

function initLoadouts() {
  let tree = loadLoadoutTree();
  let activeId = loadActiveLoadoutId();

  if (tree.nodes.length === 0) {
    const { tree: newTree, node } = addLoadoutNode(tree, 'Loadout 1', null);
    tree = newTree;
    activeId = node.id;
    saveLoadoutTree(tree);
    saveActiveLoadoutId(activeId);
    const sheetData = serializeSheet(
      (initialLoad.loaded?.operators ?? INITIAL_OPERATORS).map((op) => op?.id ?? null),
      (initialLoad.loaded?.enemy ?? DEFAULT_ENEMY).id,
      initialLoad.loaded?.enemyStats,
      initialLoad.loaded?.events ?? [],
      initialLoad.loaded?.loadouts ?? INITIAL_LOADOUTS,
      initialLoad.loaded?.loadoutProperties ?? INITIAL_LOADOUT_PROPERTIES,
      initialLoad.loaded?.visibleSkills ?? INITIAL_VISIBLE,
      getNextEventUid(),
      initialLoad.loaded?.resourceConfigs ?? {},
    );
    saveLoadoutData(activeId, sheetData);
  }

  return { tree, activeId };
}

const initialLoadouts = initLoadouts();

// ── Master hook ──────────────────────────────────────────────────────────────

export function useApp() {
  // ─── Core state ──────────────────────────────────────────────────────────
  const {
    state: combatState,
    setState: setCombatState,
    resetState: resetCombatState,
    beginBatch,
    endBatch,
    undo,
    redo,
    controller: ctrl,
  } = useCombatState({
    events: initialLoad.loaded?.events ?? [],
    operators: initialLoad.loaded?.operators ?? [...INITIAL_OPERATORS],
    enemy: initialLoad.loaded?.enemy ?? DEFAULT_ENEMY,
    enemyStats: initialLoad.loaded?.enemyStats ?? getDefaultEnemyStats((initialLoad.loaded?.enemy ?? DEFAULT_ENEMY).id),
    loadouts: initialLoad.loaded?.loadouts ?? INITIAL_LOADOUTS,
    loadoutProperties: initialLoad.loaded?.loadoutProperties ?? INITIAL_LOADOUT_PROPERTIES,
    resourceConfigs: initialLoad.loaded?.resourceConfigs ?? {},
    overrides: initialLoad.loaded?.overrides ?? {},
  });

  const { events, operators, enemy, enemyStats, loadouts, loadoutProperties, resourceConfigs, overrides } = combatState;

  const setEvents = useCallback((action: TimelineEvent[] | ((prev: TimelineEvent[]) => TimelineEvent[])) => {
    setCombatState((prev) => {
      const next = typeof action === 'function' ? action(prev.events) : action;
      return next === prev.events ? prev : { ...prev, events: next };
    });
  }, [setCombatState]);


  // ─── UI state ────────────────────────────────────────────────────────────
  const [orientation, setOrientation] = useState<Orientation>(() => {
    try { const v = localStorage.getItem('zst-orientation'); return v === 'horizontal' ? 'horizontal' : 'vertical'; } catch { return 'vertical'; }
  });
  const [zoomVertical,     setZoomVertical]     = useState<number>(() => {
    try { const v = localStorage.getItem('zst-zoom'); return v ? Number(v) : 0.5; } catch { return 0.5; }
  });
  const [zoomHorizontal,   setZoomHorizontal]   = useState<number>(() => {
    try { const v = localStorage.getItem('zst-zoom-h'); return v ? Number(v) : 0.5; } catch { return 0.5; }
  });
  const zoom = orientation === 'horizontal' ? zoomHorizontal : zoomVertical;
  const setZoom = orientation === 'horizontal' ? setZoomHorizontal : setZoomVertical;
  const [visibleSkills,    setVisibleSkills]    = useState<VisibleSkills>(
    initialLoad.loaded?.visibleSkills ?? INITIAL_VISIBLE,
  );
  const [contextMenu,      setContextMenu]      = useState<ContextMenuState | null>(null);
  const [editingEventId,   setEditingEventId]   = useState<string | null>(null);
  const [editContext,       setEditContext]       = useState<string | null>(null);
  const [editingSlotId,    setEditingSlotId]    = useState<string | null>(null);
  const [editingEnemyOpen, setEditingEnemyOpen] = useState(false);
  const [editingResourceKey, setEditingResourceKey] = useState<string | null>(null);
  const [editingDamageRow, setEditingDamageRow] = useState<DamageTableRow | null>(null);
  const [damageRows, setDamageRows] = useState<DamageTableRow[]>([]);
  // spConsumptionHistory and spInsufficiencyZones derived via useMemo below (after processedEvents)
  const [infoPaneClosing,  setInfoPaneClosing]  = useState(false);
  const [infoPanePinned,   setInfoPanePinned]   = useState(false);
  const [infoPaneVerbose,  setInfoPaneVerbose]  = useState(InfoLevel.DETAILED);
  const [selectedFrames,   setSelectedFrames]   = useState<SelectedFrame[]>([]);
  // hoverFrame is a ref — it does NOT trigger re-renders at the App level.
  // CombatPlanner manages its own local hoverFrame state; CombatSheet receives
  // updates via the onHoverFrame callback and a local ref.
  const hoverFrameRef = useRef<number | null>(null);
  const setHoverFrame = useCallback((f: number | null) => { hoverFrameRef.current = f; }, []);
  const [scrollSynced,     setScrollSynced]     = useState(true);
  const [showRealTime,     setShowRealTime]     = useState(true);
  const [splitPct,         setSplitPct]         = useState(() => {
    try { const v = localStorage.getItem('zst-split-pct'); return v ? Number(v) : 65; } catch { return 65; }
  });
  useEffect(() => {
    try { localStorage.setItem('zst-split-pct', String(splitPct)); } catch { /* ignore */ }
  }, [splitPct]);
  const [hiddenPane, setHiddenPane] = useState<'left' | 'right' | null>(() => {
    try { const v = localStorage.getItem('zst-hidden-pane'); return v === 'left' || v === 'right' ? v : null; } catch { return null; }
  });
  useEffect(() => {
    try { if (hiddenPane) localStorage.setItem('zst-hidden-pane', hiddenPane); else localStorage.removeItem('zst-hidden-pane'); } catch { /* ignore */ }
  }, [hiddenPane]);
  const [hidePreview, setHidePreview] = useState<'left' | 'right' | null>(null);
  const [showPreview, setShowPreview] = useState<'left' | 'right' | null>(null);
  const preDragSplitRef = useRef(65);
  const [devlogOpen,       setDevlogOpen]       = useState(false);
  const [settingsOpen,     setSettingsOpen]     = useState(false);
  const [keysOpen,         setKeysOpen]         = useState(false);
  const [exprEditorOpen,   setExprEditorOpen]   = useState(false);
  // ─── Global settings ─────────────────────────────────────────────────
  const [settings, setSettings] = useState<GlobalSettings>(initialSettings);
  useEffect(() => {
    saveSettings(settings);
    configurePool(settings.enablePooling, settings.eventPoolLimit, settings.enableReconciler);
  }, [settings]);
  const handleUpdateSetting = useCallback(<K extends keyof GlobalSettings>(key: K, value: GlobalSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const [interactionMode, setInteractionModeRaw] = useState<InteractionModeType>(initialSettings.interactionMode);
  // Wrap setInteractionMode to sync both directions
  const setInteractionMode = useCallback((action: InteractionModeType | ((prev: InteractionModeType) => InteractionModeType)) => {
    setInteractionModeRaw((prev) => {
      const next = typeof action === 'function' ? action(prev) : action;
      setSettings((s) => s.interactionMode === next ? s : { ...s, interactionMode: next });
      return next;
    });
  }, []);
  // Sync from settings → interactionMode when changed via settings modal
  useEffect(() => {
    setInteractionModeRaw(settings.interactionMode);
  }, [settings.interactionMode]);
  const [warningMessage,   setWarningMessage]   = useState<string | null>(initialLoad.error);
  const [loadoutRowHeight, setLoadoutRowHeight] = useState(LOADOUT_ROW_HEIGHT);
  const [headerRowHeight, setHeaderRowHeight] = useState(0);
  const [selectEventIds,   setSelectEventIds]   = useState<Set<string> | undefined>(undefined);
  const [exportModalOpen,  setExportModalOpen]  = useState(false);
  const [saveFlash,        setSaveFlash]        = useState(false);
  const [confirmClearLoadout, setConfirmClearLoadout] = useState(false);
  const [confirmClearAll,  setConfirmClearAll]  = useState(false);
  useEffect(() => {
    try { localStorage.setItem('zst-orientation', orientation); } catch { /* ignore */ }
  }, [orientation]);
  const handleToggleOrientation = useCallback(() => {
    setOrientation((prev) => prev === 'vertical' ? 'horizontal' : 'vertical');
  }, []);

  const interactionModeRef = useRef(InteractionModeType.STRICT);
  interactionModeRef.current = interactionMode;
  useEffect(() => {
    try { localStorage.setItem('zst-interaction-mode', interactionMode); } catch { /* ignore */ }
  }, [interactionMode]);

  const lightMode = settings.theme === ThemeType.LIGHT;
  const setLightMode = useCallback((action: boolean | ((prev: boolean) => boolean)) => {
    setSettings((prev) => {
      const cur = prev.theme === ThemeType.LIGHT;
      const next = typeof action === 'function' ? action(cur) : action;
      return next === cur ? prev : { ...prev, theme: next ? ThemeType.LIGHT : ThemeType.DARK };
    });
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme-transitioning', '');
    root.setAttribute('data-theme', lightMode ? 'light' : 'dark');
    try { localStorage.setItem('zst-light-mode', String(lightMode)); } catch { /* ignore */ }
    const timer = setTimeout(() => root.removeAttribute('data-theme-transitioning'), 900);
    return () => clearTimeout(timer);
  }, [lightMode]);

  const handleToggleTheme = useCallback(() => {
    setLightMode((v) => !v);
  }, [setLightMode]);

  const [critMode, setCritMode] = useState<import('../consts/enums').CritMode>(() => {
    try {
      const v = localStorage.getItem('zst-crit-mode');
      if (v && Object.values(CritMode).includes(v as CritMode)) return v as CritMode;
    } catch { /* ignore */ }
    return CritMode.NEVER;
  });
  useEffect(() => {
    try { localStorage.setItem('zst-crit-mode', critMode); } catch { /* ignore */ }
  }, [critMode]);

  // ─── Refs ────────────────────────────────────────────────────────────────
  const appBodyRef = useRef<HTMLDivElement | null>(null);

  const dmgScrollRef = useRef<HTMLDivElement | null>(null);
  const tlScrollRef = useRef<HTMLDivElement | null>(null);
  const scrollSourceRef = useRef<'tl' | 'dmg' | null>(null);

  // ─── Loadout tree state ──────────────────────────────────────────────────
  const { tree: loadoutTree, setTree: setLoadoutTree, undo: treeUndo, redo: treeRedo, resetTree: resetLoadoutTree } = useTreeHistory(initialLoadouts.tree);
  const [activeLoadoutId, setActiveLoadoutId] = useState<string | null>(initialLoadouts.activeId);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('zst-sidebar-collapsed') === 'true'; } catch { return false; }
  });
  const sidebarRef = useRef<HTMLDivElement>(null);

  // ─── Derived state ───────────────────────────────────────────────────────
  const slots = useMemo(
    () => computeSlots(SLOT_IDS, operators, loadouts, loadoutProperties),
    [operators, loadouts, loadoutProperties],
  );

  // Bump to force column rebuild when custom skill links change
  const [customSkillVersion, setCustomSkillVersion] = useState(0);
  const bumpCustomSkillVersion = useCallback(() => setCustomSkillVersion((v) => v + 1), []);

  // CombatLoadout must be created before buildColumns so team status IDs are available.
  const { combatLoadout } = useCombatLoadout(SLOT_IDS, slots);

  const columns = useMemo(
    () => buildColumns(slots, enemy, visibleSkills, combatLoadout.getTeamStatusIds()),
    [slots, enemy, visibleSkills, customSkillVersion, combatLoadout], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Keep a ref of valid column pairs for use in event handlers
  const validColumnPairsRef = useRef<Set<string>>(new Set());
  validColumnPairsRef.current = useMemo(() => buildValidColumnPairs(columns), [columns]);

  // Filter events to valid columns, attach default segments, then apply overrides
  const validEvents = useMemo(
    () => applyEventOverrides(attachDefaultSegments(filterEventsToColumns(events, columns), columns), overrides),
    [events, columns, overrides],
  );

  // ─── Embed URL loading (one-time on mount) ─────────────────────────────
  const embedLoadedRef = useRef(false);
  useEffect(() => {
    if (embedLoadedRef.current) return;
    const embedParams = getEmbedParams();
    if (!embedParams) return;
    embedLoadedRef.current = true;
    // Async decode — columns may not match yet but attachDefaultSegments
    // will rebuild segments once operators are set and columns recompute.
    decodeEmbed(embedParams.data, []).then(({ sheetData, name: embeddedName }) => {
      const resolved = applySheetData(sheetData);

      // Save current loadout before creating the imported one
      if (activeLoadoutId && !isCommunityLoadoutId(activeLoadoutId)) {
        saveLoadoutData(activeLoadoutId, buildSheetData());
      }

      // Create a new loadout with the shared name (deduplicated)
      // Prefer name from binary payload (v2); fall back to URL param (v1) or default
      const loadoutName = embeddedName || embedParams.name || 'Shared Loadout';
      const dedupedName = uniqueName(loadoutTree, loadoutName, null);
      const { tree: newTree, node } = addLoadoutNode(loadoutTree, dedupedName, null);
      setLoadoutTree(newTree);
      saveLoadoutTree(newTree);

      setNextEventUid(sheetData.nextEventId);
      resetCombatState({
        events: resolved.events,
        operators: resolved.operators,
        enemy: resolved.enemy,
        enemyStats: resolved.enemyStats ?? getDefaultEnemyStats(resolved.enemy.id),
        loadouts: resolved.loadouts,
        loadoutProperties: resolved.loadoutProperties,
        resourceConfigs: resolved.resourceConfigs,
        overrides: resolved.overrides,
      });
      setVisibleSkills(resolved.visibleSkills);

      // Persist imported data under the new loadout
      saveLoadoutData(node.id, sheetData);
      setActiveLoadoutId(node.id);
      saveActiveLoadoutId(node.id);

      // Clean up URL — remove ?d= param without reload
      window.history.replaceState({}, '', window.location.pathname);
    }).catch((err) => {
      console.error('[zst] Failed to decode embed URL:', err);
      setWarningMessage(`Failed to load shared URL: ${err instanceof Error ? err.message : String(err)}`);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build slot trigger wirings from operators for the pipeline
  const slotWirings = useMemo<SlotTriggerWiring[]>(() => {
    const wirings: SlotTriggerWiring[] = [];
    for (let i = 0; i < SLOT_IDS.length; i++) {
      const op = operators[i];
      if (op && getComboTriggerClause(op.id)) {
        wirings.push({ slotId: SLOT_IDS[i], operatorId: op.id });
      }
    }
    return wirings;
  }, [operators]);

  const slotOperatorMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (let i = 0; i < operators.length; i++) {
      if (operators[i]) map[SLOT_IDS[i]] = operators[i]!.id;
    }
    return map;
  }, [operators]);

  const slotWeapons = useMemo(() => {
    const map: Record<string, string | undefined> = {};
    for (const s of slots) map[s.slotId] = s.weaponId;
    return map;
  }, [slots]);

  const slotGearSets = useMemo(() => {
    const map: Record<string, string | undefined> = {};
    for (const s of slots) map[s.slotId] = s.gearSetType;
    return map;
  }, [slots]);

  const bossMaxHp = useMemo(() => {
    const model = getModelEnemy(enemy.id);
    return model ? model.getHp() : null;
  }, [enemy.id]);

  const processedEvents = useMemo(
    () => {
      // Configure UE slots before pipeline run
      const ue = combatLoadout.commonSlot.ultimateEnergy;
      const base = resolveGainEfficiencies(operators, SLOT_IDS, loadouts, loadoutProperties);
      for (let i = 0; i < SLOT_IDS.length; i++) {
        const op = operators[i];
        if (!op) continue;
        const slotId = SLOT_IDS[i];
        const cfg = resourceConfigs?.[ultimateGraphKey(slotId)];
        ue.configureSlot(slotId, {
          max: cfg?.max ?? getUltimateEnergyCost(op.id),
          startValue: cfg?.startValue ?? 0,
          chargePerFrame: (cfg?.regenPerSecond ?? 0) / FPS,
          efficiency: base[slotId] ?? 0,
        });
      }

      return processCombatSimulation(
        validEvents, loadoutProperties, slotWeapons, slotWirings, slotOperatorMap, slotGearSets,
        bossMaxHp, enemy.id, loadouts,
        combatLoadout.commonSlot.skillPoints,
        combatLoadout.commonSlot.ultimateEnergy,
        combatLoadout.commonSlot.hp,
        combatLoadout.getAllSpCosts(),
        combatLoadout.getTriggerIndex() ?? undefined,
        critMode, overrides, enemyStats,
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [validEvents, loadoutProperties, slotWeapons, slotWirings, slotOperatorMap, slotGearSets, bossMaxHp, enemy.id, loadouts, combatLoadout, operators, resourceConfigs, critMode, overrides, enemyStats],
  );

  // Write back crit results from SIMULATION mode (one-time per new event)
  useEffect(() => {
    if (critMode !== CritMode.SIMULATION) return;
    const crits = getLastCritResults();
    if (!crits || crits.size === 0) return;
    setCombatState((prev) => ctrl.persistCritResults(prev, crits));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processedEvents]);

  const { resourceGraphs } = useResourceGraphs(
    operators, SLOT_IDS, processedEvents, combatLoadout, resourceConfigs,
  );

  // ─── Stagger sync (config + events + frailty, all in one controller call) ─
  useMemo(() => {
    combatLoadout.commonSlot.stagger.sync(processedEvents, enemyStats);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processedEvents, combatLoadout, enemyStats]);

  const staggerFrailtyEvents = combatLoadout.commonSlot.stagger.frailtyEvents;
  const staggerBreaks = combatLoadout.commonSlot.stagger.breaks;

  const allProcessedEventsRaw = useMemo(
    () => {
      return staggerFrailtyEvents.length > 0 ? [...processedEvents, ...staggerFrailtyEvents] : processedEvents;
    },
    [processedEvents, staggerFrailtyEvents],
  );

  // Apply user overrides to derived events + dedup by UID
  // Apply user overrides to derived events
  const allProcessedEvents = useMemo(() => {
    const keys = Object.keys(overrides);
    if (keys.length === 0) return allProcessedEventsRaw;
    return allProcessedEventsRaw.map((ev) => {
      const key = buildOverrideKey(ev);
      const override = overrides[key];
      return override?.propertyOverrides ? { ...ev, ...override.propertyOverrides } : ev;
    });
  }, [allProcessedEventsRaw, overrides]);

  const processedEventsRef = useRef(allProcessedEvents);
  processedEventsRef.current = allProcessedEvents;

  // Track which event UIDs changed in the last pipeline run (for incremental view updates).
  // Computed by comparing current vs previous processedEvents by reference — immune to
  // React strict mode double-invocation issues with module-level mutable state.
  const prevProcessedRef = useRef<TimelineEvent[]>([]);
  const changedUidsRef = useRef<ReadonlySet<string>>(new Set());
  if (processedEvents !== prevProcessedRef.current) {
    const prev = prevProcessedRef.current;
    const prevByUid = new Map<string, TimelineEvent>();
    for (const ev of prev) prevByUid.set(ev.uid, ev);
    const changed = new Set<string>();
    for (const ev of processedEvents) {
      if (prevByUid.get(ev.uid) !== ev) changed.add(ev.uid);
    }
    // Also detect removed events
    const currentUids = new Set(processedEvents.map(ev => ev.uid));
    prevByUid.forEach((_, uid) => {
      if (!currentUids.has(uid)) changed.add(uid);
    });
    changedUidsRef.current = changed;
    prevProcessedRef.current = processedEvents;
  }

  // Dynamic timeline length: grow to furthest event + buffer, minimum 2 minutes
  const contentFrames = useMemo(() => {
    const MIN_FRAMES = FPS * 120;
    const BUFFER_FRAMES = FPS * 30;
    let maxEnd = 0;
    for (const ev of allProcessedEvents) {
      const dur = computeSegmentsSpan(ev.segments);
      maxEnd = Math.max(maxEnd, ev.startFrame + dur);
    }
    return Math.min(TOTAL_FRAMES, Math.max(MIN_FRAMES, maxEnd + BUFFER_FRAMES));
  }, [allProcessedEvents]);

  const spKey = `${COMMON_OWNER_ID}-${COMMON_COLUMN_IDS.SKILL_POINTS}`;
  const staggerKey = `enemy-${COMMON_COLUMN_IDS.STAGGER}`;

  const editingEvent = editingEventId
    ? validEvents.find((e) => e.uid === editingEventId)
      ?? allProcessedEvents.find((e) => e.uid === editingEventId)
      ?? null
    : null;

  const processedEditingEvent = editingEventId
    ? allProcessedEvents.find((e) => e.uid === editingEventId) ?? null
    : null;

  const editingEventReadOnly = editingEvent
    ? editingEvent.columnId === COMBO_WINDOW_COLUMN_ID
    : false;

  const editingEventIsDerived = editingEvent
    ? !validEvents.some((e) => e.uid === editingEvent.uid)
    : false;

  const editingSlot = editingSlotId
    ? slots.find((s) => s.slotId === editingSlotId) ?? null
    : null;

  const editingResourceCol = editingResourceKey
    ? columns.find((c): c is MiniTimeline => c.type === ColumnType.MINI_TIMELINE && c.key === editingResourceKey) ?? null
    : null;

  const getDefaultResourceConfig = useCallback((colKey: string): ResourceConfig => {
    return computeDefaultResourceConfig(operators, loadoutProperties, SLOT_IDS, colKey, spKey, staggerKey, enemyStats[StatType.STAGGER_HP]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operators, loadoutProperties, spKey, staggerKey, enemyStats[StatType.STAGGER_HP]]);

  const editingResourceConfig = editingResourceKey
    ? editingResourceKey === staggerKey
      ? { startValue: enemyStats.staggerStartValue ?? 0, max: enemyStats[StatType.STAGGER_HP], regenPerSecond: 0 }
      : resourceConfigs[editingResourceKey] ?? getDefaultResourceConfig(editingResourceKey)
    : null;

  // ─── Undo/redo with scroll-to-change ─────────────────────────────────────
  const undoRedoSnapshotRef = useRef<TimelineEvent[] | null>(null);

  const undoWithScroll = useCallback(() => {
    undoRedoSnapshotRef.current = events;
    undo();
  }, [undo, events]);

  const redoWithScroll = useCallback(() => {
    undoRedoSnapshotRef.current = events;
    redo();
  }, [redo, events]);

  useEffect(() => {
    const prev = undoRedoSnapshotRef.current;
    if (!prev) return;
    undoRedoSnapshotRef.current = null;

    const prevMap = new Map<string, TimelineEvent>();
    for (const ev of prev) prevMap.set(ev.uid, ev);
    const nextIds = new Set(events.map((e) => e.uid));

    const changed = new Set<string>();
    let earliestFrame = Infinity;
    for (const ev of events) {
      const prevEv = prevMap.get(ev.uid);
      if (!prevEv || prevEv.startFrame !== ev.startFrame) {
        changed.add(ev.uid);
        earliestFrame = Math.min(earliestFrame, ev.startFrame);
      }
    }
    for (const ev of prev) {
      if (!nextIds.has(ev.uid)) {
        earliestFrame = Math.min(earliestFrame, ev.startFrame);
      }
    }

    if (changed.size > 0) setSelectEventIds(changed);

    if (!isFinite(earliestFrame)) return;
    const el = tlScrollRef.current;
    if (!el) return;
    const targetPx = frameToPx(earliestFrame, zoom);
    const viewportH = el.clientHeight;
    if (targetPx < el.scrollTop || targetPx > el.scrollTop + viewportH) {
      el.scrollTop = Math.max(0, targetPx - viewportH * 0.3);
    }
  }, [events, zoom]);

  // ─── Keyboard shortcuts ──────────────────────────────────────────────────
  useKeyboardShortcuts(undoWithScroll, redoWithScroll, treeUndo, treeRedo, sidebarRef);

  // ─── SP sync effects ─────────────────────────────────────────────────────
  useEffect(() => {
    const cfg = resourceConfigs[spKey];
    if (!cfg) return;
    combatLoadout.commonSlot.skillPoints.updateConfig({
      startValue: cfg.startValue,
      max: cfg.max,
      regenPerFrame: cfg.regenPerSecond / FPS,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceConfigs, combatLoadout, spKey]);

  // ─── Sync combat context to event controller ────────────────────────────
  useEffect(() => {
    setCombatLoadout(combatLoadout);
  }, [combatLoadout]);

  // (Stagger sync handled by commonSlot.syncStaggerEvents above)

  // SP results are computed inside processCombatSimulation via finalize().
  // Read synchronously after the pipeline useMemo so zones are available on the same render.
  const spConsumptionHistoryDerived = useMemo(
    () => combatLoadout.commonSlot.skillPoints.consumptionHistory,
    [processedEvents, combatLoadout], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const spInsufficiencyZonesDerived = useMemo(
    () => combatLoadout.commonSlot.skillPoints.insufficiencyZones,
    [processedEvents, combatLoadout], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ─── Ctrl+S to save, Escape to close info pane ─────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveLoadoutTree(loadoutTree);
        if (activeLoadoutId && !isCommunityLoadoutId(activeLoadoutId)) {
          saveLoadoutData(activeLoadoutId, buildSheetData());
          saveActiveLoadoutId(activeLoadoutId);
        }
        setSaveFlash(true);
        setTimeout(() => setSaveFlash(false), 600);
      }
      if (e.key === 'Escape' && (editingEventId || editingSlotId || editingEnemyOpen || editingResourceKey || editingDamageRow)) {
        e.preventDefault();
        setInfoPanePinned(false);
        setInfoPaneClosing(true);
      }
      if (e.key.toLowerCase() === 'm' && !e.ctrlKey && !e.metaKey && !e.altKey
        && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        setInteractionMode((prev) =>
          prev === InteractionModeType.STRICT ? InteractionModeType.FREEFORM : InteractionModeType.STRICT,
        );
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingEventId, editingSlotId, editingEnemyOpen, editingResourceKey, editingDamageRow, activeLoadoutId, loadoutTree]);

  // ─── Click-outside to close unpinned info pane ──────────────────────────
  useEffect(() => {
    if (infoPanePinned) return;
    const hasPaneOpen = editingEventId || editingSlotId || editingEnemyOpen || editingResourceKey || editingDamageRow;
    if (!hasPaneOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Element;
      // Don't close when clicking inside the info pane itself
      if (target.closest('.event-edit-panel')) return;
      // Don't close when clicking a focusable element (damage cell, event block, loadout header)
      if (target.closest('.dmg-cell-clickable') || target.closest('[data-event-uid]') || target.closest('.lo-cell')) return;
      setInfoPaneClosing(true);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [infoPanePinned, editingEventId, editingSlotId, editingEnemyOpen, editingResourceKey, editingDamageRow]);

  // ─── Persistence ─────────────────────────────────────────────────────────
  const buildSheetData = useCallback(() => {
    // Dev assertion: detect duplicate event IDs before saving
    if (process.env.NODE_ENV === 'development') {
      const idSet = new Set<string>();
      for (const ev of events) {
        if (idSet.has(ev.uid)) {
          console.error(`[zst] DUPLICATE EVENT ID "${ev.uid}" detected at save time`, ev);
        }
        idSet.add(ev.uid);
      }
    }
    return serializeSheet(
      operators.map((op) => op?.id ?? null),
      enemy.id,
      enemyStats,
      events,
      loadouts,
      loadoutProperties,
      visibleSkills,
      getNextEventUid(),
      resourceConfigs,
      overrides,
    );
  }, [operators, enemy, enemyStats, events, loadouts, loadoutProperties, visibleSkills, resourceConfigs, overrides]);

  useAutoSave(buildSheetData);

  useEffect(() => {
    if (!activeLoadoutId || isCommunityLoadoutId(activeLoadoutId)) return;
    const timer = setTimeout(() => {
      saveLoadoutData(activeLoadoutId, buildSheetData());
    }, 600);
    return () => clearTimeout(timer);
  }, [buildSheetData, activeLoadoutId]);

  // ─── Scroll sync ─────────────────────────────────────────────────────────
  const handleDmgScrollRef = useCallback((el: HTMLDivElement | null) => {
    dmgScrollRef.current = el;
  }, []);

  const handleTlScrollRef = useCallback((el: HTMLDivElement | null) => {
    tlScrollRef.current = el;
  }, []);

  const handleTimelineScroll = useCallback((st: number) => {
    if (!scrollSynced || orientation === 'horizontal') return;
    if (scrollSourceRef.current === 'dmg') { scrollSourceRef.current = null; return; }
    scrollSourceRef.current = 'tl';
    if (dmgScrollRef.current) dmgScrollRef.current.scrollTop = st;
  }, [scrollSynced, orientation]);

  const handleSheetScroll = useCallback((st: number) => {
    if (!scrollSynced || orientation === 'horizontal') return;
    if (scrollSourceRef.current === 'tl') { scrollSourceRef.current = null; return; }
    scrollSourceRef.current = 'dmg';
    if (tlScrollRef.current) tlScrollRef.current.scrollTop = st;
  }, [scrollSynced, orientation]);

  // ─── Panel resize ────────────────────────────────────────────────────────
  const HIDE_THRESHOLD = 15;

  const handleResizerMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();

    const wasHidden = hiddenPane;
    let didDrag = false;
    let lastPct = splitPct;

    // Snapshot the split area in viewport coords at drag start
    const sidebarRight = sidebarRef.current?.getBoundingClientRect().right ?? 0;
    const bodyRight = appBodyRef.current?.getBoundingClientRect().right ?? 1;
    const splitW = bodyRight - sidebarRight;
    const pctFromClientX = (cx: number) => ((cx - sidebarRight) / splitW) * 100;

    if (!wasHidden) {
      preDragSplitRef.current = splitPct;
    }

    const handleMouseMove = (ev: MouseEvent) => {
      didDrag = true;

      // When collapsed, unhide pane on first move
      if (wasHidden) {
        setHiddenPane(null);
      }

      lastPct = Math.max(0, Math.min(100, pctFromClientX(ev.clientX)));
      setSplitPct(lastPct);

      if (!wasHidden) {
        const preview = lastPct < HIDE_THRESHOLD ? 'left' as const
          : lastPct > 100 - HIDE_THRESHOLD ? 'right' as const
          : null;
        setHidePreview(preview);
      } else {
        const inOwnThreshold = wasHidden === 'left' ? lastPct < HIDE_THRESHOLD : lastPct > 100 - HIDE_THRESHOLD;
        const inOppositeThreshold = wasHidden === 'left' ? lastPct > 100 - HIDE_THRESHOLD : lastPct < HIDE_THRESHOLD;
        setShowPreview(inOwnThreshold ? wasHidden : null);
        setHidePreview(inOppositeThreshold ? (wasHidden === 'left' ? 'right' : 'left') : null);
      }
    };

    const handleMouseUp = () => {
      setHidePreview(null);
      setShowPreview(null);

      if (!didDrag) {
        // Pure click, no drag — do nothing (click handler handles restore)
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        return;
      }

      const inHide: 'left' | 'right' | null =
        lastPct < HIDE_THRESHOLD ? 'left'
        : lastPct > 100 - HIDE_THRESHOLD ? 'right'
        : null;

      if (!wasHidden) {
        if (inHide) {
          // Animate divider to edge, then hide
          const from = lastPct;
          const target = inHide === 'left' ? 0 : 100;
          const duration = 200;
          const t0 = performance.now();
          const savedSplit = preDragSplitRef.current;
          const tick = (now: number) => {
            const p = Math.min((now - t0) / duration, 1);
            const ease = 1 - (1 - p) * (1 - p);
            setSplitPct(from + (target - from) * ease);
            if (p < 1) {
              requestAnimationFrame(tick);
            } else {
              setHiddenPane(inHide);
              setSplitPct(savedSplit);
            }
          };
          requestAnimationFrame(tick);
        }
      } else {
        // Dragging from collapsed
        const opposite: 'left' | 'right' = wasHidden === 'left' ? 'right' : 'left';
        const inOpposite = opposite === 'left' ? lastPct < HIDE_THRESHOLD : lastPct > 100 - HIDE_THRESHOLD;

        if (inOpposite) {
          // Dragged all the way to the opposite side — hide that side instead
          const from = lastPct;
          const target = opposite === 'left' ? 0 : 100;
          const duration = 200;
          const t0 = performance.now();
          const tick = (now: number) => {
            const p = Math.min((now - t0) / duration, 1);
            const ease = 1 - (1 - p) * (1 - p);
            setSplitPct(from + (target - from) * ease);
            if (p < 1) {
              requestAnimationFrame(tick);
            } else {
              setHiddenPane(opposite);
              setSplitPct(50);
            }
          };
          requestAnimationFrame(tick);
        } else {
          setHiddenPane(null);
          const threshold = wasHidden === 'left' ? HIDE_THRESHOLD : 100 - HIDE_THRESHOLD;
          const inOwnThreshold = wasHidden === 'left' ? lastPct < HIDE_THRESHOLD : lastPct > 100 - HIDE_THRESHOLD;
          if (inOwnThreshold) {
            // Still in own hide zone — animate to threshold
            const from = lastPct;
            const duration = 250;
            const t0 = performance.now();
            const tick = (now: number) => {
              const p = Math.min((now - t0) / duration, 1);
              const ease = 1 - (1 - p) * (1 - p);
              setSplitPct(from + (threshold - from) * ease);
              if (p < 1) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          } else {
            // Past threshold — leave as is
            setSplitPct(lastPct);
          }
        }
      }

      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [splitPct, hiddenPane]);

  const handleRestorePane = useCallback(() => {
    setHiddenPane((prev) => {
      if (!prev) return null;
      const start = prev === 'left' ? 0 : 100;
      const end = prev === 'left' ? HIDE_THRESHOLD : 100 - HIDE_THRESHOLD;
      setSplitPct(start);
      const duration = 350;
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min((now - t0) / duration, 1);
        const ease = 1 - (1 - p) * (1 - p);
        setSplitPct(start + (end - start) * ease);
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      return null;
    });
  }, []);

  // ─── Zoom ────────────────────────────────────────────────────────────────
  const handleZoom = useCallback((deltaY: number) => {
    setZoom((z) => {
      const factor = deltaY > 0 ? 1 / 1.2 : 1.2;
      const next = Math.max(0.15, Math.min(20, z * factor));
      const key = orientation === 'horizontal' ? 'zst-zoom-h' : 'zst-zoom';
      try { localStorage.setItem(key, String(next)); } catch { /* ignore */ }
      return next;
    });
  }, [orientation, setZoom]);

  // ─── Skill visibility ────────────────────────────────────────────────────
  const handleToggleSkill = useCallback((slotId: string, skillType: string) => {
    setVisibleSkills((prev) => ({
      ...prev,
      [slotId]: {
        ...prev[slotId],
        [skillType]: !prev[slotId]?.[skillType as SkillType],
      },
    }));
  }, []);

  // ─── Event handlers ──────────────────────────────────────────────────────
  const handleAddEvent = useCallback((
    ownerId: string,
    columnId: string,
    atFrame: number,
    defaultSkill: { id?: string; name?: string; segments?: import('../consts/viewTypes').EventSegmentData[]; gaugeGain?: number; teamGaugeGain?: number; comboTriggerColumnId?: string; operatorPotential?: number; timeInteraction?: string; isPerfectDodge?: boolean; timeDilation?: number; timeDependency?: import('../consts/enums').TimeDependency; skillPointCost?: number; sourceOwnerId?: string; sourceSkillName?: string; enhancementType?: import('../consts/enums').EnhancementType; stacks?: Record<string, unknown>; segmentOrigin?: number[] } | null,
  ) => {
    // Validate against controller-derived columns before adding
    if (!validColumnPairsRef.current.has(`${ownerId}:${columnId}`)) return;
    const ev = createEvent(ownerId, columnId, atFrame, defaultSkill, interactionModeRef.current);
    if (defaultSkill?.comboTriggerColumnId) ev.comboTriggerColumnId = defaultSkill.comboTriggerColumnId;
    setEvents((prev) => {
      // No total-event limit for statuses — the engine handles concurrent stack
      // limits and interaction behaviour (RESET, REFRESH, etc.) at processing time.
      if (interactionModeRef.current === InteractionModeType.STRICT) {
        if (wouldOverlapNonOverlappable(prev, ev, ev.startFrame, processedEventsRef.current)) return prev;
        // Check SP sufficiency for battle skills
        if (columnId === NounType.BATTLE_SKILL && !hasSufficientSP(ownerId, atFrame)) return prev;
        // Enhanced skills require an active ultimate
        if (ev.enhancementType === EnhancementType.ENHANCED) {
          // Use processed events (full segments) for the ultimate check;
          // fall back to raw prev if a just-added ultimate isn't processed yet
          const eventsToCheck = processedEventsRef.current.some(
            (e) => e.ownerId === ownerId && e.columnId === NounType.ULTIMATE,
          ) ? processedEventsRef.current : prev;
          const ultActive = eventsToCheck.some(
            (e) => {
              if (e.ownerId !== ownerId || e.columnId !== NounType.ULTIMATE) return false;
              // Ultimate segments: [animation, statis, active, cooldown]
              // "Active" phase starts after animation + statis
              const segs = e.segments;
              if (segs.length >= 3) {
                const activationEnd = e.startFrame + segs[0].properties.duration + segs[1].properties.duration;
                const activeEnd = activationEnd + segs[2].properties.duration;
                return atFrame >= activationEnd && atFrame < activeEnd;
              }
              // Fallback: treat entire event as active
              return atFrame >= e.startFrame && atFrame < eventEndFrame(e);
            },
          );
          if (!ultActive) return prev;
        }
      }
      return [...prev, ev];
    });
    setContextMenu(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUpdateEvent = useCallback((id: string, updates: Partial<TimelineEvent>) => {
    const isStrict = interactionModeRef.current === InteractionModeType.STRICT;
    const processed = isStrict ? processedEventsRef.current : null;
    setCombatState((prev) => ctrl.updateEvent(prev, id, updates, { isStrict, processed }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctrl, setCombatState]);


  const handleMoveEvent = useCallback((id: string, newStartFrame: number, overlapExemptIds?: Set<string>, strictOverride?: boolean) => {
    const isStrict = strictOverride ?? interactionModeRef.current === InteractionModeType.STRICT;
    const processed = isStrict ? processedEventsRef.current : null;
    const moveCtx: MoveContext = { isStrict, processed, overlapExemptIds };
    setCombatState((prev) => ctrl.moveEvent(prev, id, newStartFrame, moveCtx, validEvents));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validEvents, ctrl, setCombatState]);

  const handleMoveEvents = useCallback((ids: string[], delta: number, overlapExemptIds?: Set<string>, strictOverride?: boolean) => {
    if (delta === 0) return;
    const isStrict = strictOverride ?? interactionModeRef.current === InteractionModeType.STRICT;
    const processed = isStrict ? processedEventsRef.current : null;
    const moveCtx: MoveContext = { isStrict, processed, overlapExemptIds };
    setCombatState((prev) => ctrl.moveEvents(prev, ids, delta, moveCtx, validEvents));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validEvents, ctrl, setCombatState]);

  const handleRemoveEvent = useCallback((id: string) => {
    setCombatState((prev) => ctrl.removeEvent(prev, id, validEvents));
    setEditingEventId((cur) => (cur === id ? null : cur));
    setContextMenu(null);
  }, [validEvents, ctrl, setCombatState]);

  const handleRemoveEvents = useCallback((ids: string[]) => {
    const idSet = new Set(ids);
    setCombatState((prev) => ctrl.removeEvents(prev, ids, validEvents));
    setEditingEventId((cur) => (cur && idSet.has(cur) ? null : cur));
    setContextMenu(null);
  }, [validEvents, ctrl, setCombatState]);

  const handleDuplicateEvents = useCallback((sourceEvents: TimelineEvent[], frameOffset: number): string[] => {
    const newUids: string[] = [];
    const clones: TimelineEvent[] = [];
    for (const src of sourceEvents) {
      const newUid = genEventUid();
      newUids.push(newUid);
      clones.push({ ...src, uid: newUid, startFrame: src.startFrame + frameOffset });
    }
    setEvents((prev) => {
      const combined = [...prev, ...clones];
      for (const c of clones) {
        if (wouldOverlapNonOverlappable(combined, c, c.startFrame)) return prev;
      }
      return combined;
    });
    return newUids;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const handleResetEvent = useCallback((id: string) => {
    const target = validEvents.find((ev) => ev.uid === id);
    if (target) setCombatState((prev) => ctrl.resetEvent(prev, target, columns));
    setContextMenu(null);
  }, [validEvents, columns, ctrl, setCombatState]);

  const handleResetSegments = useCallback((id: string) => {
    const target = validEvents.find((ev) => ev.uid === id);
    if (target) setCombatState((prev) => ctrl.resetSegmentOverrides(prev, target));
    setContextMenu(null);
  }, [validEvents, ctrl, setCombatState]);

  const handleResetFrames = useCallback((id: string) => {
    const target = validEvents.find((ev) => ev.uid === id);
    if (target) setCombatState((prev) => ctrl.resetFrameOverrides(prev, target));
    setContextMenu(null);
  }, [validEvents, ctrl, setCombatState]);

  const handleResetEvents = useCallback((ids: string[]) => {
    const targets = ids.map((id) => validEvents.find((ev) => ev.uid === id)).filter(Boolean) as TimelineEvent[];
    setCombatState((prev) => ctrl.resetEvents(prev, targets, columns));
    setContextMenu(null);
  }, [validEvents, columns, ctrl, setCombatState]);

  const handleRemoveFrame = useCallback((eventUid: string, segmentIndex: number, frameIndex: number) => {
    const target = validEvents.find((ev) => ev.uid === eventUid);
    if (!target) return;
    setCombatState((prev) => ctrl.removeFrame(prev, target, segmentIndex, frameIndex));
    setSelectedFrames((prev) => prev.filter((f) => !(f.eventUid === eventUid && f.segmentIndex === segmentIndex && f.frameIndex === frameIndex)));
  }, [validEvents, ctrl, setCombatState]);

  const handleRemoveFrames = useCallback((frames: SelectedFrame[]) => {
    const targets = frames.map((f) => {
      const target = validEvents.find((ev) => ev.uid === f.eventUid);
      return target ? { target, segmentIndex: f.segmentIndex, frameIndex: f.frameIndex } : null;
    }).filter(Boolean) as { target: TimelineEvent; segmentIndex: number; frameIndex: number }[];
    setCombatState((prev) => ctrl.removeFrames(prev, targets));
    setSelectedFrames([]);
  }, [validEvents, ctrl, setCombatState]);

  const handleAddSegment = useCallback((eventUid: string, segmentLabel: string) => {
    const target = validEvents.find((ev) => ev.uid === eventUid);
    if (!target) return;
    const col = columns.find((c) =>
      c.type === ColumnType.MINI_TIMELINE && c.ownerId === target.ownerId && c.columnId === target.columnId,
    );
    if (col?.type !== ColumnType.MINI_TIMELINE) return;
    const templateSegs = col.defaultEvent?.segments;
    if (!templateSegs) return;
    const templateIdx = templateSegs.findIndex((s) => s.properties.name === segmentLabel);
    if (templateIdx < 0) return;
    setCombatState((prev) => ctrl.addSegmentBack(prev, target, templateIdx));
  }, [validEvents, columns, ctrl, setCombatState]);

  const handleRemoveSegment = useCallback((eventUid: string, segmentIndex: number) => {
    const target = validEvents.find((ev) => ev.uid === eventUid);
    if (!target || target.segments.length <= 1) return;
    setCombatState((prev) => ctrl.removeSegment(prev, target, segmentIndex));
    setSelectedFrames((prev) => prev.filter((f) => !(f.eventUid === eventUid && f.segmentIndex === segmentIndex)));
  }, [validEvents, ctrl, setCombatState]);

  const handleAddFrame = useCallback((eventUid: string, segmentIndex: number, frameOffsetFrame: number) => {
    const target = validEvents.find((ev) => ev.uid === eventUid);
    if (!target) return;
    const col = columns.find((c) =>
      c.type === ColumnType.MINI_TIMELINE && c.ownerId === target.ownerId && c.columnId === target.columnId,
    );
    if (col?.type !== ColumnType.MINI_TIMELINE) return;
    const allDefaultSegs = col.defaultEvent?.segments;
    const seg = target.segments[segmentIndex];
    const defaultSeg = allDefaultSegs?.find((s) => s.properties.name === seg?.properties.name) ?? allDefaultSegs?.[segmentIndex];
    const frameIndex = defaultSeg?.frames?.findIndex((f) => f.offsetFrame === frameOffsetFrame);
    if (frameIndex == null || frameIndex < 0) return;
    setCombatState((prev) => ctrl.addFrameBack(prev, target, segmentIndex, frameIndex));
  }, [validEvents, columns, ctrl, setCombatState]);

  const handleFrameClick = useCallback((e: React.MouseEvent, eventUid: string, segmentIndex: number, frameIndex: number) => {
    const ctrlKey = e.ctrlKey || e.metaKey;
    setSelectedFrames((prev) => {
      const exists = prev.some((f) => f.eventUid === eventUid && f.segmentIndex === segmentIndex && f.frameIndex === frameIndex);
      if (exists) {
        const next = prev.filter((f) => !(f.eventUid === eventUid && f.segmentIndex === segmentIndex && f.frameIndex === frameIndex));
        if (next.length === 0) setInfoPaneClosing(true);
        return next;
      }
      if (ctrlKey) return [...prev, { eventUid, segmentIndex, frameIndex }];
      return [{ eventUid, segmentIndex, frameIndex }];
    });
    setEditingEventId(eventUid);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMoveFrame = useCallback((eventUid: string, segmentIndex: number, frameIndex: number, newOffsetFrame: number) => {
    const target = validEvents.find((ev) => ev.uid === eventUid);
    if (!target) return;
    setCombatState((prev) => ctrl.moveFrame(prev, target, segmentIndex, frameIndex, newOffsetFrame));
  }, [validEvents, ctrl, setCombatState]);

  const handleResizeSegment = useCallback((eventUid: string, updates: { segmentIndex: number; newDuration: number }[]) => {
    const target = validEvents.find((ev) => ev.uid === eventUid);
    if (!target) return;
    setCombatState((prev) => ctrl.resizeSegment(prev, target, updates));
  }, [validEvents, ctrl, setCombatState]);

  // ─── Loadout & operator handlers ─────────────────────────────────────────
  const handleLoadoutChange = useCallback((slotId: string, loadout: OperatorLoadoutState) => {
    setCombatState((prev) => ctrl.setLoadout(prev, slotId, loadout));
  }, [ctrl, setCombatState]);

  const handleStatsChange = useCallback((slotId: string, stats: LoadoutProperties) => {
    setCombatState((prev) => ctrl.updateLoadoutProperties(prev, slotId, stats, SLOT_IDS));
  }, [ctrl, setCombatState]);

  const handleSwapOperator = useCallback((slotId: string, newOperatorId: string | null) => {
    setCombatState((prev) => ctrl.swapOperator(prev, slotId, newOperatorId, SLOT_IDS));
  }, [ctrl, setCombatState]);

  const handleSwapEnemy = useCallback((enemyId: string) => {
    const found = ALL_ENEMIES.find((e) => e.id === enemyId);
    if (found) {
      setCombatState((prev) => ctrl.setEnemy(prev, found, getDefaultEnemyStats(found.id)));
    }
  }, [ctrl, setCombatState]);

  const handleEnemyStatsChange = useCallback((stats: EnemyStats) => {
    setCombatState((prev) => ctrl.setEnemyStats(prev, stats));
  }, [ctrl, setCombatState]);

  const handleResourceConfigChange = useCallback((colKey: string, config: ResourceConfig) => {
    if (colKey === staggerKey) {
      setCombatState((prev) => ctrl.setEnemyStats(prev, {
        ...prev.enemyStats,
        [StatType.STAGGER_HP]: config.max,
        staggerStartValue: config.startValue,
      }));
      return;
    }
    setCombatState((prev) => ctrl.setResourceConfig(prev, colKey, config));
  }, [ctrl, setCombatState, staggerKey]);

  // ─── Loadout tree handlers ───────────────────────────────────────────────
  const handleLoadoutTreeChange = useCallback((tree: LoadoutTree) => {
    // Skip empty trees — handleDeleteLoadout resets the tree when all loadouts are deleted
    if (tree.nodes.length === 0) return;
    setLoadoutTree(tree);
  }, [setLoadoutTree]);

  const handleToggleSidebar = useCallback(() => {
    setSidebarCollapsed((p) => {
      const next = !p;
      try { localStorage.setItem('zst-sidebar-collapsed', String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const handleNewLoadout = useCallback((parentId: string | null) => {
    if (activeLoadoutId && !isCommunityLoadoutId(activeLoadoutId)) {
      saveLoadoutData(activeLoadoutId, buildSheetData());
    }
    const existingNames = new Set(loadoutTree.nodes.map((n) => n.name));
    let num = 1;
    while (existingNames.has(`Loadout ${num}`)) num++;
    const { tree: newTree, node } = addLoadoutNode(loadoutTree, `Loadout ${num}`, parentId);
    setLoadoutTree(newTree);
    saveLoadoutTree(newTree);

    setNextEventUid(1);
    const emptyState: CombatState = {
      events: [],
      operators: [...INITIAL_OPERATORS],
      enemy: DEFAULT_ENEMY,
      enemyStats: getDefaultEnemyStats(DEFAULT_ENEMY.id),
      loadouts: INITIAL_LOADOUTS,
      loadoutProperties: INITIAL_LOADOUT_PROPERTIES,
      resourceConfigs: {},
      overrides: {},
    };
    resetCombatState(emptyState);
    setVisibleSkills(INITIAL_VISIBLE);
    setEditingEventId(null);
    setEditingSlotId(null);
    setEditingResourceKey(null);
    setContextMenu(null);

    const sheetData = serializeSheet(
      emptyState.operators.map((op) => op?.id ?? null),
      emptyState.enemy.id,
      emptyState.enemyStats,
      emptyState.events,
      emptyState.loadouts,
      emptyState.loadoutProperties,
      INITIAL_VISIBLE,
      1,
      emptyState.resourceConfigs,
    );
    saveLoadoutData(node.id, sheetData);
    setActiveLoadoutId(node.id);
    saveActiveLoadoutId(node.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadoutTree, activeLoadoutId, buildSheetData, resetCombatState]);

  const handleDuplicateLoadout = useCallback((sourceId: string) => {
    // Save current loadout before switching
    if (activeLoadoutId && !isCommunityLoadoutId(activeLoadoutId)) {
      saveLoadoutData(activeLoadoutId, buildSheetData());
    }

    // Resolve source name and data — community loadouts are generated, not stored
    const isCommunity = isCommunityLoadoutId(sourceId);
    const baseName = isCommunity
      ? (getCommunityLoadoutName(sourceId) ?? 'Community')
      : (loadoutTree.nodes.find((n) => n.id === sourceId)?.name ?? 'Loadout');
    const existingNames = new Set(loadoutTree.nodes.map((n) => n.name));
    let copyNum = 1;
    while (existingNames.has(`${baseName} - Copy ${copyNum}`)) copyNum++;
    const newName = `${baseName} - Copy ${copyNum}`;

    // Community loadouts add to root; user loadouts insert after source
    const { tree: newTree, node } = isCommunity
      ? addLoadoutNode(loadoutTree, newName, null)
      : addLoadoutAfter(loadoutTree, newName, sourceId);
    setLoadoutTree(newTree);
    saveLoadoutTree(newTree);

    // Copy source data (or current state if source is active)
    const sourceData = isCommunity
      ? generateCommunityLoadout(sourceId)
      : (sourceId === activeLoadoutId ? buildSheetData() : loadLoadoutData(sourceId));
    if (sourceData) {
      saveLoadoutData(node.id, sourceData);
      const resolved = applySheetData(sourceData);
      resetCombatState({
        events: resolved.events,
        operators: resolved.operators,
        enemy: resolved.enemy,
        enemyStats: resolved.enemyStats ?? getDefaultEnemyStats(resolved.enemy.id),
        loadouts: resolved.loadouts,
        loadoutProperties: resolved.loadoutProperties,
        resourceConfigs: resolved.resourceConfigs,
        overrides: resolved.overrides,
      });
      setVisibleSkills(resolved.visibleSkills);
    } else {
      saveLoadoutData(node.id, serializeSheet(
        INITIAL_OPERATORS.map((op) => op?.id ?? null),
        DEFAULT_ENEMY.id,
        getDefaultEnemyStats(DEFAULT_ENEMY.id),
        [], INITIAL_LOADOUTS, INITIAL_LOADOUT_PROPERTIES, INITIAL_VISIBLE, 1, {},
      ));
      setCombatState((prev) => Object.keys(prev.overrides).length === 0 ? prev : { ...prev, overrides: {} });
    }
    setEditingEventId(null);
    setEditingSlotId(null);
    setEditingResourceKey(null);
    setContextMenu(null);
    setActiveLoadoutId(node.id);
    saveActiveLoadoutId(node.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadoutTree, activeLoadoutId, buildSheetData, resetCombatState]);

  const handleSelectLoadout = useCallback((id: string) => {
    if (id === activeLoadoutId) return;
    if (activeLoadoutId && !isCommunityLoadoutId(activeLoadoutId)) {
      saveLoadoutData(activeLoadoutId, buildSheetData());
    }
    const data = loadLoadoutData(id);
    if (data) {
      const resolved = applySheetData(data);
      resetCombatState({
        events: resolved.events,
        operators: resolved.operators,
        enemy: resolved.enemy,
        enemyStats: resolved.enemyStats ?? getDefaultEnemyStats(resolved.enemy.id),
        loadouts: resolved.loadouts,
        loadoutProperties: resolved.loadoutProperties,
        resourceConfigs: resolved.resourceConfigs,
        overrides: resolved.overrides,
      });
      setVisibleSkills(resolved.visibleSkills);
    } else {
      setNextEventUid(1);
      resetCombatState({
        events: [],
        operators: [...INITIAL_OPERATORS],
        enemy: DEFAULT_ENEMY,
        enemyStats: getDefaultEnemyStats(DEFAULT_ENEMY.id),
        loadouts: INITIAL_LOADOUTS,
        loadoutProperties: INITIAL_LOADOUT_PROPERTIES,
        resourceConfigs: {},
        overrides: {},
      });
      setVisibleSkills(INITIAL_VISIBLE);
    }
    setEditingEventId(null);
    setEditingSlotId(null);
    setEditingResourceKey(null);
    setContextMenu(null);
    setActiveLoadoutId(id);
    saveActiveLoadoutId(id);
  }, [activeLoadoutId, buildSheetData, resetCombatState]);

  const handleDeleteLoadout = useCallback((loadoutIds: string[], _nodeId: string) => {
    for (const sid of loadoutIds) {
      deleteLoadoutData(sid);
    }
    const remainingLoadouts = loadoutTree.nodes.filter(
      (n) => n.type === LoadoutNodeType.LOADOUT && !loadoutIds.includes(n.id),
    );
    if (remainingLoadouts.length === 0) {
      // Tree is now empty — reset to a fresh "Loadout 1"
      const freshTree: LoadoutTree = { nodes: [] };
      const { tree: newTree, node } = addLoadoutNode(freshTree, 'Loadout 1', null);
      resetLoadoutTree(newTree);

      setNextEventUid(1);
      const emptyState: CombatState = {
        events: [],
        operators: [...INITIAL_OPERATORS],
        enemy: DEFAULT_ENEMY,
        enemyStats: getDefaultEnemyStats(DEFAULT_ENEMY.id),
        loadouts: INITIAL_LOADOUTS,
        loadoutProperties: INITIAL_LOADOUT_PROPERTIES,
        resourceConfigs: {},
        overrides: {},
      };
      resetCombatState(emptyState);
      setVisibleSkills(INITIAL_VISIBLE);
      setEditingEventId(null);
      setEditingSlotId(null);
      setEditingResourceKey(null);
      setContextMenu(null);
      clearLocalStorage();

      const sheetData = serializeSheet(
        emptyState.operators.map((op) => op?.id ?? null),
        emptyState.enemy.id,
        emptyState.enemyStats,
        emptyState.events,
        emptyState.loadouts,
        emptyState.loadoutProperties,
        INITIAL_VISIBLE,
        1,
        emptyState.resourceConfigs,
      );
      saveLoadoutData(node.id, sheetData);
      setActiveLoadoutId(node.id);
      saveActiveLoadoutId(node.id);
    } else if (activeLoadoutId && loadoutIds.includes(activeLoadoutId)) {
      handleSelectLoadout(remainingLoadouts[0].id);
    }
  }, [activeLoadoutId, loadoutTree, handleSelectLoadout, resetLoadoutTree, resetCombatState]);

  const handleLoadCommunityLoadout = useCallback((communityId: string) => {
    if (communityId === activeLoadoutId) return;
    const sheetData = generateCommunityLoadout(communityId);
    if (!sheetData) return;
    // Save current user loadout before switching (skip if already viewing a community loadout)
    if (activeLoadoutId && !isCommunityLoadoutId(activeLoadoutId)) {
      saveLoadoutData(activeLoadoutId, buildSheetData());
    }
    const resolved = applySheetData(sheetData);
    resetCombatState({
      events: resolved.events,
      operators: resolved.operators,
      enemy: resolved.enemy,
      enemyStats: resolved.enemyStats ?? getDefaultEnemyStats(resolved.enemy.id),
      loadouts: resolved.loadouts,
      loadoutProperties: resolved.loadoutProperties,
      resourceConfigs: resolved.resourceConfigs,
      overrides: resolved.overrides,
    });
    setVisibleSkills(resolved.visibleSkills);
    setEditingEventId(null);
    setEditingSlotId(null);
    setEditingResourceKey(null);
    setContextMenu(null);
    setActiveLoadoutId(communityId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLoadoutId, buildSheetData, resetCombatState]);

  const handleExport = useCallback(() => {
    if (activeLoadoutId && !isCommunityLoadoutId(activeLoadoutId)) {
      saveLoadoutData(activeLoadoutId, buildSheetData());
    }
    setExportModalOpen(true);
  }, [activeLoadoutId, buildSheetData]);

  const handleImport = useCallback(async () => {
    const result = await importMultiLoadoutFile();
    if (!result.ok) {
      setWarningMessage(result.error);
      return;
    }
    const { tree: mergedTree, loadoutData } = mergeBundle(loadoutTree, result.data);
    for (const [id, data] of Object.entries(loadoutData)) {
      saveLoadoutData(id, data);
    }
    setLoadoutTree(mergedTree);
  }, [loadoutTree, setLoadoutTree]);

  const handleClearLoadout = useCallback(() => {
    setNextEventUid(1);
    resetCombatState({
      events: [],
      operators: [...INITIAL_OPERATORS],
      enemy: DEFAULT_ENEMY,
      enemyStats: getDefaultEnemyStats(DEFAULT_ENEMY.id),
      loadouts: INITIAL_LOADOUTS,
      loadoutProperties: INITIAL_LOADOUT_PROPERTIES,
      resourceConfigs: {},
      overrides: {},
    });
    setVisibleSkills(INITIAL_VISIBLE);
    setEditingEventId(null);
    setEditingSlotId(null);
    setEditingResourceKey(null);
    setContextMenu(null);
    clearLocalStorage();
    if (activeLoadoutId) {
      saveLoadoutData(activeLoadoutId, serializeSheet(
        [...INITIAL_OPERATORS].map((op) => op?.id ?? null),
        DEFAULT_ENEMY.id, undefined, [], INITIAL_LOADOUTS, INITIAL_LOADOUT_PROPERTIES,
        INITIAL_VISIBLE, 1, {},
      ));
    }
    setConfirmClearLoadout(false);
  }, [resetCombatState, activeLoadoutId]);

  const handleClearAll = useCallback(() => {
    for (const node of loadoutTree.nodes) {
      if (node.type === LoadoutNodeType.LOADOUT) {
        deleteLoadoutData(node.id);
      }
    }
    const freshTree: LoadoutTree = { nodes: [] };
    const { tree: newTree, node } = addLoadoutNode(freshTree, 'Loadout 1', null);
    resetLoadoutTree(newTree);

    setNextEventUid(1);
    const emptyState: CombatState = {
      events: [],
      operators: [...INITIAL_OPERATORS],
      enemy: DEFAULT_ENEMY,
      enemyStats: getDefaultEnemyStats(DEFAULT_ENEMY.id),
      loadouts: INITIAL_LOADOUTS,
      loadoutProperties: INITIAL_LOADOUT_PROPERTIES,
      resourceConfigs: {},
      overrides: {},
    };
    resetCombatState(emptyState);
    setVisibleSkills(INITIAL_VISIBLE);
    setEditingEventId(null);
    setEditingSlotId(null);
    setEditingResourceKey(null);
    setContextMenu(null);
    clearLocalStorage();

    const sheetData = serializeSheet(
      emptyState.operators.map((op) => op?.id ?? null),
      emptyState.enemy.id,
      emptyState.enemyStats,
      emptyState.events,
      emptyState.loadouts,
      emptyState.loadoutProperties,
      INITIAL_VISIBLE,
      1,
      emptyState.resourceConfigs,
    );
    saveLoadoutData(node.id, sheetData);
    setActiveLoadoutId(node.id);
    saveActiveLoadoutId(node.id);
    setConfirmClearAll(false);
  }, [loadoutTree, resetLoadoutTree, resetCombatState]);

  const handleRenameActiveLoadout = useCallback((name: string) => {
    if (!activeLoadoutId) return;
    const dedupedName = uniqueName(loadoutTree, name, null, activeLoadoutId);
    setLoadoutTree(renameNode(loadoutTree, activeLoadoutId, dedupedName));
  }, [activeLoadoutId, loadoutTree, setLoadoutTree]);

  // ─── Inline JSX handler extractors ───────────────────────────────────────
  const handleEditEvent = useCallback((id: string | null, context?: string | null) => {
    if (id !== null) {
      setEditingEventId(id);
      setEditContext(context ?? null);
      setEditingSlotId(null);
      setEditingResourceKey(null);
      setEditingDamageRow(null);
      setSelectedFrames([]);
      setInfoPaneClosing(false);
    } else if (!infoPanePinned) {
      if (editingEventId || editingSlotId || editingEnemyOpen || editingResourceKey || editingDamageRow) setInfoPaneClosing(true);
      else { setEditingEventId(null); setEditContext(null); setSelectedFrames([]); }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [infoPanePinned, editingEventId, editingSlotId, editingResourceKey, editingDamageRow]);

  const handleEditLoadout = useCallback((slotId: string) => {
    if (editingSlotId === slotId) {
      setInfoPaneClosing(true);
    } else {
      setEditingSlotId(slotId);
      setEditingEventId(null);
      setEditingEnemyOpen(false);
      setEditingResourceKey(null);
      setEditingDamageRow(null);
      setInfoPaneClosing(false);
    }
  }, [editingSlotId]);

  const handleEditEnemy = useCallback(() => {
    if (editingEnemyOpen) {
      setInfoPaneClosing(true);
    } else {
      setEditingEnemyOpen(true);
      setEditingEventId(null);
      setEditingSlotId(null);
      setEditingResourceKey(null);
      setEditingDamageRow(null);
      setInfoPaneClosing(false);
    }
  }, [editingEnemyOpen]);

  const handleCloseEnemyPane = useCallback(() => {
    setEditingEnemyOpen(false);
    setInfoPaneClosing(false);
    setInfoPanePinned(false);
  }, []);

  const handleEditResource = useCallback((key: string) => {
    setEditingResourceKey(key);
    setEditingEventId(null);
    setEditingSlotId(null);
    setEditingEnemyOpen(false);
    setEditingDamageRow(null);
  }, []);

  const handleCloseInfoPane = useCallback(() => {
    setEditingEventId(null);
    setEditingEnemyOpen(false);
    setSelectedFrames([]);
    setInfoPaneClosing(false);
    setInfoPanePinned(false);
  }, []);

  const handleCloseLoadoutPane = useCallback(() => {
    setEditingSlotId(null);
    setInfoPaneClosing(false);
    setInfoPanePinned(false);
  }, []);

  const handleCloseResourcePane = useCallback(() => {
    setEditingResourceKey(null);
    setInfoPaneClosing(false);
    setInfoPanePinned(false);
  }, []);

  const handleDamageClick = useCallback((row: DamageTableRow) => {
    setEditingEventId(null);
    setEditingSlotId(null);
    setEditingEnemyOpen(false);
    setEditingResourceKey(null);
    setEditingDamageRow(row);
    setInfoPaneClosing(false);
  }, []);

  const handleCloseDamagePane = useCallback(() => {
    setEditingDamageRow(null);
    setInfoPaneClosing(false);
    setInfoPanePinned(false);
  }, []);

  const handleToggleScrollSync = useCallback(() => {
    setScrollSynced((p) => {
      if (!p && tlScrollRef.current && dmgScrollRef.current) {
        dmgScrollRef.current.scrollTop = tlScrollRef.current.scrollTop;
      }
      return !p;
    });
  }, []);

  // ─── Return ──────────────────────────────────────────────────────────────
  return {
    // Core state
    operators, enemy, enemyStats, events, loadouts, loadoutProperties, visibleSkills, resourceConfigs, overrides, buildSheetData,
    columns, slots, allProcessedEvents, contentFrames, resourceGraphs, staggerBreaks,
    spConsumptionHistory: spConsumptionHistoryDerived, spInsufficiencyZones: spInsufficiencyZonesDerived,

    // UI state
    zoom, contextMenu, editingEventId, editingEvent, processedEditingEvent, editingEventReadOnly, editingEventIsDerived, editContext,
    editingSlot, editingEnemyOpen, editingResourceCol, editingResourceConfig, editingResourceKey,
    editingDamageRow,
    infoPaneClosing, infoPanePinned, infoPaneVerbose, selectedFrames, hoverFrameRef,
    scrollSynced, showRealTime, splitPct, interactionMode, lightMode, warningMessage, hiddenPane, hidePreview, showPreview, critMode, orientation,
    loadoutRowHeight, headerRowHeight, selectEventIds,
    settings, settingsOpen,
    devlogOpen, keysOpen, exprEditorOpen, exportModalOpen, confirmClearLoadout, confirmClearAll, saveFlash,

    // Loadout tree
    loadoutTree, activeLoadoutId, sidebarCollapsed,
    readOnly: isCommunityLoadoutId(activeLoadoutId),

    // Refs
    appBodyRef, sidebarRef, changedUidsRef,

    // Event handlers
    handleAddEvent, handleUpdateEvent, handleMoveEvent, handleMoveEvents,
    handleRemoveEvent, handleRemoveEvents, handleDuplicateEvents,
    handleResetEvent, handleResetEvents, handleResetSegments, handleResetFrames,
    handleRemoveFrame, handleRemoveFrames, handleAddFrame, handleAddSegment,
    handleRemoveSegment, handleMoveFrame, handleResizeSegment, handleFrameClick,

    // Loadout/operator handlers
    handleLoadoutChange, handleStatsChange, handleSwapOperator, handleSwapEnemy, handleEnemyStatsChange,
    handleResourceConfigChange,

    // Loadout tree handlers
    handleLoadoutTreeChange, handleNewLoadout, handleDuplicateLoadout, handleSelectLoadout, handleDeleteLoadout,
    handleLoadCommunityLoadout,
    handleExport, handleImport, handleClearLoadout, handleClearAll, handleRenameActiveLoadout,
    handleToggleSidebar,

    // UI handlers
    handleZoom, handleToggleSkill,
    handleEditEvent, handleEditLoadout, handleEditEnemy, handleEditResource,
    handleCloseInfoPane, handleCloseLoadoutPane, handleCloseEnemyPane, handleCloseResourcePane, handleCloseDamagePane,
    handleDamageClick, damageRows, setDamageRows,
    handleResizerMouseDown, handleToggleScrollSync, handleToggleTheme, handleRestorePane, handleToggleOrientation,
    handleTimelineScroll, handleSheetScroll,
    handleDmgScrollRef, handleTlScrollRef,

    // Setters for simple inline handlers
    setContextMenu, setSelectedFrames, setLoadoutRowHeight, setHeaderRowHeight,
    setHoverFrame, setInfoPanePinned, setInfoPaneVerbose, setWarningMessage,
    setDevlogOpen, setSettingsOpen, setKeysOpen, setExprEditorOpen, setInteractionMode, setLightMode, setShowRealTime, setCritMode,
    handleUpdateSetting,
    setSplitPct, setSelectEventIds, setExportModalOpen,
    setConfirmClearLoadout, setConfirmClearAll,

    // Undo/redo
    undo, redo, beginBatch, endBatch,

    // Custom skill links
    bumpCustomSkillVersion,

    // Performance
    dragThrottle: PERFORMANCE_THROTTLE[settings.performanceMode],

    // Constants
    allOperators: ALL_OPERATORS,
    allEnemies: ALL_ENEMIES,
  };
}
