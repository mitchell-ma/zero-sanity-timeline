/**
 * Master application hook — owns all state, handlers, and derived values.
 * App.tsx calls this hook and renders the returned values.
 */

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { initCustomWeapons } from '../controller/custom/customWeaponController';
import { initCustomGearSets } from '../controller/custom/customGearController';
import { initCustomOperators } from '../controller/custom/customOperatorController';
import { useHistory } from '../utils/useHistory';
import type { Orientation } from '../utils/axisMap';
import { LoadoutProperties } from '../view/InformationPane';
import { OperatorLoadoutState } from '../view/OperatorLoadoutHeader';
import { ALL_OPERATORS } from '../controller/operators/operatorRegistry';
import { ALL_ENEMIES, DEFAULT_ENEMY } from '../utils/enemies';
import { TimelineEvent, VisibleSkills, ContextMenuState, SkillType, SelectedFrame, ResourceConfig, MiniTimeline, computeSegmentsSpan } from '../consts/viewTypes';
import type { DamageTableRow } from '../controller/calculation/damageTableBuilder';
import { processInflictionEvents, SlotTriggerWiring, COMBO_WINDOW_COLUMN_ID } from '../controller/timeline/processInteractions';
import { buildColumns } from '../controller/timeline/columnBuilder';
import {
  createEvent,
  genEventId,
  validateUpdate,
  validateMove,
  validateBatchMoveDelta,
  wouldOverlapNonOverlappable,
  setNextEventId,
  getNextEventId,
  filterEventsToColumns,
  buildValidColumnPairs,
  setCombatLoadout,
  hasSufficientSP,
} from '../controller/timeline/eventController';
import { ComboSkillEventController } from '../controller/timeline/comboSkillEventController';
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
import { TimeStopRange } from '../controller/timeline/resourceTimeline';
import {
  UndoableState,
  EnemyStats,
  swapOperator,
  updatePropertiesWithPotential,
  computeSlots,
  computeDefaultResourceConfig,
  findEventDefaults,
  attachDefaultSegments,
  getDefaultEnemyStats,
} from '../controller/appStateController';
import { resolveGainEfficiencies, resolveMessengersSongBonuses } from '../controller/timeline/ultimateEnergyController';
import { StatType, InteractionModeType } from '../consts/enums';
import { SKILL_COLUMNS, ENEMY_OWNER_ID, STAGGER_FRAILTY_COLUMN_ID } from '../model/channels';
import type { SkillPointConsumptionHistory, ResourceZone } from '../controller/timeline/skillPointTimeline';

// ── Module-scope initialization ──────────────────────────────────────────────

// Register custom content before loading sheet data (sheets may reference custom items)
initCustomWeapons();
initCustomGearSets();
initCustomOperators();

const initialLoad = loadInitialState();

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
      getNextEventId(),
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
    state: undoable,
    setState: setUndoable,
    resetState: resetUndoable,
    beginBatch,
    endBatch,
    undo,
    redo,
  } = useHistory<UndoableState>({
    events: initialLoad.loaded?.events ?? [],
    operators: initialLoad.loaded?.operators ?? [...INITIAL_OPERATORS],
    enemy: initialLoad.loaded?.enemy ?? DEFAULT_ENEMY,
    enemyStats: initialLoad.loaded?.enemyStats ?? getDefaultEnemyStats((initialLoad.loaded?.enemy ?? DEFAULT_ENEMY).id),
    loadouts: initialLoad.loaded?.loadouts ?? INITIAL_LOADOUTS,
    loadoutProperties: initialLoad.loaded?.loadoutProperties ?? INITIAL_LOADOUT_PROPERTIES,
    resourceConfigs: initialLoad.loaded?.resourceConfigs ?? {},
  });

  const { events, operators, enemy, enemyStats, loadouts, loadoutProperties, resourceConfigs } = undoable;

  const setEvents = useCallback((action: TimelineEvent[] | ((prev: TimelineEvent[]) => TimelineEvent[])) => {
    setUndoable((prev) => {
      const next = typeof action === 'function' ? action(prev.events) : action;
      return next === prev.events ? prev : { ...prev, events: next };
    });
  }, [setUndoable]);


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
  const [spConsumptionHistory, setSpConsumptionHistory] = useState<SkillPointConsumptionHistory[]>([]);
  const [spInsufficiencyZones, setSpInsufficiencyZones] = useState<Map<string, ResourceZone[]>>(new Map());
  const [derivedEventOverrides, setDerivedEventOverrides] = useState<Record<string, Partial<TimelineEvent>>>(
    initialLoad.loaded?.derivedEventOverrides ?? {},
  );
  const [infoPaneClosing,  setInfoPaneClosing]  = useState(false);
  const [infoPanePinned,   setInfoPanePinned]   = useState(false);
  const [infoPaneVerbose,  setInfoPaneVerbose]  = useState(1 as 0 | 1 | 2);
  const [selectedFrames,   setSelectedFrames]   = useState<SelectedFrame[]>([]);
  const [hoverFrame,       setHoverFrame]       = useState<number | null>(null);
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
  const [keysOpen,         setKeysOpen]         = useState(false);
  const [interactionMode, setInteractionMode] = useState<InteractionModeType>(() => {
    try {
      const stored = localStorage.getItem('zst-interaction-mode');
      if (stored && Object.values(InteractionModeType).includes(stored as InteractionModeType)) return stored as InteractionModeType;
      // Migrate legacy debug mode setting
      if (localStorage.getItem('zst-debug-mode') === 'true') return InteractionModeType.FREEFORM;
    } catch { /* ignore */ }
    return InteractionModeType.STRICT;
  });
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

  const [lightMode, setLightMode] = useState(() => {
    try { return localStorage.getItem('zst-light-mode') === 'true'; } catch { return false; }
  });
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', lightMode ? 'light' : 'dark');
    try { localStorage.setItem('zst-light-mode', String(lightMode)); } catch { /* ignore */ }
  }, [lightMode]);

  const handleToggleTheme = useCallback(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme-transitioning', '');
    setLightMode((v) => !v);
    const timer = setTimeout(() => root.removeAttribute('data-theme-transitioning'), 900);
    return () => clearTimeout(timer);
  }, []);

  const [critMode, setCritMode] = useState<import('../consts/enums').CritMode>(() => {
    try {
      const v = localStorage.getItem('zst-crit-mode');
      if (v === 'NONE' || v === 'ALWAYS') return v as import('../consts/enums').CritMode;
    } catch { /* ignore */ }
    return 'NONE' as import('../consts/enums').CritMode;
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

  const columns = useMemo(
    () => buildColumns(slots, enemy, visibleSkills),
    [slots, enemy, visibleSkills, customSkillVersion], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Keep a ref of valid column pairs for use in event handlers
  const validColumnPairsRef = useRef<Set<string>>(new Set());
  validColumnPairsRef.current = useMemo(() => buildValidColumnPairs(columns), [columns]);

  // Filter events to valid columns and attach default segments (segments are not persisted)
  const validEvents = useMemo(
    () => attachDefaultSegments(filterEventsToColumns(events, columns), columns),
    [events, columns],
  );

  // Write resolved segment overrides back to raw events (one-time after embed decode)
  useEffect(() => {
    const pending = events.filter((ev) => ev._pendingSegmentOverrides);
    if (pending.length === 0) return;
    const resolved = new Map<string, TimelineEvent['segments']>();
    for (const ev of pending) {
      const valid = validEvents.find((v) => v.id === ev.id);
      if (valid?.segments) resolved.set(ev.id, valid.segments);
    }
    if (resolved.size === 0) return;
    setEvents((prev) => prev.map((ev) => {
      const segs = resolved.get(ev.id);
      if (!segs) return ev;
      const { _pendingSegmentOverrides, ...rest } = ev;
      return { ...rest, segments: segs };
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validEvents]);

  // ─── Embed URL loading (one-time on mount) ─────────────────────────────
  const embedLoadedRef = useRef(false);
  useEffect(() => {
    if (embedLoadedRef.current) return;
    const embedParams = getEmbedParams();
    if (!embedParams) return;
    embedLoadedRef.current = true;
    // Async decode — columns may not match yet but attachDefaultSegments
    // will rebuild segments once operators are set and columns recompute.
    decodeEmbed(embedParams.data, []).then((sheetData) => {
      const resolved = applySheetData(sheetData);

      // Save current loadout before creating the imported one
      if (activeLoadoutId) {
        saveLoadoutData(activeLoadoutId, buildSheetData());
      }

      // Create a new loadout with the shared name (deduplicated)
      const dedupedName = uniqueName(loadoutTree, embedParams.name, null);
      const { tree: newTree, node } = addLoadoutNode(loadoutTree, dedupedName, null);
      setLoadoutTree(newTree);
      saveLoadoutTree(newTree);

      setNextEventId(sheetData.nextEventId);
      resetUndoable({
        events: resolved.events,
        operators: resolved.operators,
        enemy: resolved.enemy,
        enemyStats: resolved.enemyStats ?? getDefaultEnemyStats(resolved.enemy.id),
        loadouts: resolved.loadouts,
        loadoutProperties: resolved.loadoutProperties,
        resourceConfigs: resolved.resourceConfigs,
      });
      setVisibleSkills(resolved.visibleSkills);
      setDerivedEventOverrides(resolved.derivedEventOverrides);

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
      if (op?.triggerCapability) {
        wirings.push({ slotId: SLOT_IDS[i], capability: op.triggerCapability });
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
    for (const s of slots) map[s.slotId] = s.weaponName;
    return map;
  }, [slots]);

  const slotGearSets = useMemo(() => {
    const map: Record<string, string | undefined> = {};
    for (const s of slots) map[s.slotId] = s.gearSetType;
    return map;
  }, [slots]);

  const processedEvents = useMemo(
    () => processInflictionEvents(validEvents, loadoutProperties, slotWeapons, slotWirings, slotOperatorMap, slotGearSets),
    [validEvents, loadoutProperties, slotWeapons, slotWirings, slotOperatorMap, slotGearSets],
  );

  const { combatLoadout } =
    useCombatLoadout(SLOT_IDS, slots, processedEvents);

  const tacticalNamesBySlot = useMemo(() => {
    const map: Record<string, string | undefined> = {};
    for (const slotId of SLOT_IDS) {
      map[slotId] = loadouts[slotId]?.tacticalName ?? undefined;
    }
    return map;
  }, [loadouts]);

  const tacticalMaxUsesOverrides = useMemo(() => {
    const map: Record<string, number | undefined> = {};
    for (const slotId of SLOT_IDS) {
      map[slotId] = loadoutProperties[slotId]?.tacticalMaxUses;
    }
    return map;
  }, [loadoutProperties]);

  const gaugeGainMultipliers = useMemo(() => {
    const base = resolveGainEfficiencies(operators, SLOT_IDS, loadouts, loadoutProperties);
    const msBonuses = resolveMessengersSongBonuses(operators, SLOT_IDS, loadoutProperties);
    for (const [slotId, bonus] of Object.entries(msBonuses)) {
      base[slotId] = (base[slotId] ?? 0) + bonus;
    }
    return base;
  }, [operators, loadouts, loadoutProperties]);

  const { resourceGraphs, tacticalEvents } = useResourceGraphs(
    operators, SLOT_IDS, processedEvents, combatLoadout, resourceConfigs, tacticalNamesBySlot, tacticalMaxUsesOverrides, gaugeGainMultipliers,
  );

  // Generate stagger frailty events from node crossings and full stagger breaks
  const staggerFrailtyEvents = useMemo(() => {
    const nodeRecoveryFrames = Math.round((enemyStats.staggerNodeRecoverySeconds ?? 0) * FPS);
    return combatLoadout.commonSlot.stagger.generateFrailtyEvents(
      nodeRecoveryFrames,
      STAGGER_FRAILTY_COLUMN_ID,
      ENEMY_OWNER_ID,
      'stagger-frailty',
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combatLoadout, processedEvents, enemyStats.staggerNodeRecoverySeconds]);

  const staggerBreaks = useMemo(
    () => combatLoadout.commonSlot.stagger.getBreaks(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [combatLoadout, processedEvents],
  );

  const allProcessedEventsRaw = useMemo(
    () => {
      const extra = [...tacticalEvents, ...staggerFrailtyEvents];
      return extra.length > 0 ? [...processedEvents, ...extra] : processedEvents;
    },
    [processedEvents, tacticalEvents, staggerFrailtyEvents],
  );

  // Apply user overrides to derived events
  const allProcessedEvents = useMemo(() => {
    const keys = Object.keys(derivedEventOverrides);
    if (keys.length === 0) return allProcessedEventsRaw;
    return allProcessedEventsRaw.map((ev) => {
      const override = derivedEventOverrides[ev.id];
      return override ? { ...ev, ...override } : ev;
    });
  }, [allProcessedEventsRaw, derivedEventOverrides]);

  const processedEventsRef = useRef(allProcessedEvents);
  processedEventsRef.current = allProcessedEvents;

  // Prune stale overrides when derived events change
  useEffect(() => {
    const keys = Object.keys(derivedEventOverrides);
    if (keys.length === 0) return;
    const processedIds = new Set(allProcessedEventsRaw.map((ev) => ev.id));
    const hasStale = keys.some((id) => !processedIds.has(id));
    if (hasStale) {
      setDerivedEventOverrides((prev) => {
        const next: Record<string, Partial<TimelineEvent>> = {};
        for (const [id, override] of Object.entries(prev)) {
          if (processedIds.has(id)) next[id] = override;
        }
        return next;
      });
    }
  }, [allProcessedEventsRaw, derivedEventOverrides]);

  // Dynamic timeline length: grow to furthest event + buffer, minimum 2 minutes
  const contentFrames = useMemo(() => {
    const MIN_FRAMES = FPS * 120;
    const BUFFER_FRAMES = FPS * 30;
    let maxEnd = 0;
    for (const ev of allProcessedEvents) {
      const dur = ev.segments
        ? computeSegmentsSpan(ev.segments)
        : ev.activationDuration + ev.activeDuration + ev.cooldownDuration;
      maxEnd = Math.max(maxEnd, ev.startFrame + dur);
    }
    return Math.min(TOTAL_FRAMES, Math.max(MIN_FRAMES, maxEnd + BUFFER_FRAMES));
  }, [allProcessedEvents]);

  const spKey = `${COMMON_OWNER_ID}-${COMMON_COLUMN_IDS.SKILL_POINTS}`;
  const staggerKey = `enemy-${COMMON_COLUMN_IDS.STAGGER}`;

  const editingEvent = editingEventId
    ? validEvents.find((e) => e.id === editingEventId)
      ?? allProcessedEvents.find((e) => e.id === editingEventId)
      ?? null
    : null;

  const processedEditingEvent = editingEventId
    ? allProcessedEvents.find((e) => e.id === editingEventId) ?? null
    : null;

  const editingEventReadOnly = editingEvent
    ? editingEvent.columnId === COMBO_WINDOW_COLUMN_ID
    : false;

  const editingEventIsDerived = editingEvent
    ? !validEvents.some((e) => e.id === editingEvent.id)
    : false;

  const editingSlot = editingSlotId
    ? slots.find((s) => s.slotId === editingSlotId) ?? null
    : null;

  const editingResourceCol = editingResourceKey
    ? columns.find((c): c is MiniTimeline => c.type === 'mini-timeline' && c.key === editingResourceKey) ?? null
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
    for (const ev of prev) prevMap.set(ev.id, ev);
    const nextIds = new Set(events.map((e) => e.id));

    const changed = new Set<string>();
    let earliestFrame = Infinity;
    for (const ev of events) {
      const prevEv = prevMap.get(ev.id);
      if (!prevEv || prevEv.startFrame !== ev.startFrame) {
        changed.add(ev.id);
        earliestFrame = Math.min(earliestFrame, ev.startFrame);
      }
    }
    for (const ev of prev) {
      if (!nextIds.has(ev.id)) {
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
  }, [resourceConfigs, combatLoadout, spKey]);

  // ─── Sync combat context to event controller ────────────────────────────
  useEffect(() => {
    setCombatLoadout(combatLoadout);
  }, [combatLoadout]);

  // ─── Stagger sync effects ────────────────────────────────────────────────
  useEffect(() => {
    const stagger = combatLoadout.commonSlot.stagger;
    stagger.setNodeCount(enemyStats.staggerNodes);
    stagger.setBreakDuration(Math.round(enemyStats[StatType.STAGGER_RECOVERY] * FPS));
    stagger.updateConfig({
      max: enemyStats[StatType.STAGGER_HP],
      startValue: enemyStats.staggerStartValue ?? 0,
    });
  }, [enemyStats, combatLoadout]);

  useEffect(() => {
    const slotSpCosts = new Map<string, number>();
    for (const slot of slots) {
      if (slot.operator) {
        slotSpCosts.set(slot.slotId, slot.operator.skills.battle?.skillPointCost ?? 100);
      }
    }
    combatLoadout.commonSlot.syncSkillPointEvents(processedEvents, slotSpCosts);
    // After sync, recompute runs synchronously — read the updated consumption log
    setSpConsumptionHistory(combatLoadout.commonSlot.skillPoints.consumptionHistory);
    setSpInsufficiencyZones(combatLoadout.commonSlot.spInsufficiencyZones);
  }, [processedEvents, combatLoadout, slots]);

  // ─── Stagger event sync (must run synchronously before staggerFrailtyEvents) ─
  useMemo(() => {
    const staggerSub = combatLoadout.commonSlot.getSubtimeline(COMMON_COLUMN_IDS.STAGGER);
    if (!staggerSub) return;
    const staggerEvents: TimelineEvent[] = [];
    for (const ev of processedEvents) {
      if (!ev.segments) continue;
      // For combo/ultimate events, the first segment starts after the animation time-stop
      const animOffset = (ev.columnId === SKILL_COLUMNS.COMBO || ev.columnId === SKILL_COLUMNS.ULTIMATE)
        ? (ev.animationDuration ?? 0) : 0;
      let segOffset = 0;
      for (const seg of ev.segments) {
        if (seg.frames) {
          for (const f of seg.frames) {
            if (f.stagger && f.stagger > 0) {
              const frame = f.absoluteFrame ?? (ev.startFrame + animOffset + segOffset + f.offsetFrame);
              staggerEvents.push({
                id: `${ev.id}-stagger-${frame}`,
                name: 'stagger',
                ownerId: ev.ownerId,
                columnId: COMMON_COLUMN_IDS.STAGGER,
                startFrame: frame,
                activationDuration: f.stagger,
                activeDuration: 0,
                cooldownDuration: 0,
              } as TimelineEvent);
            }
          }
        }
        segOffset += seg.durationFrames;
      }
    }
    staggerSub.setEvents(staggerEvents.sort((a, b) => a.startFrame - b.startFrame));
  }, [processedEvents, combatLoadout]);

  useEffect(() => {
    const stops: TimeStopRange[] = [];
    for (const ev of processedEvents) {
      const isTimeStop = (ev.columnId === SKILL_COLUMNS.ULTIMATE || ev.columnId === SKILL_COLUMNS.COMBO ||
        (ev.columnId === 'dash' && ev.isPerfectDodge)) &&
        ev.animationDuration && ev.animationDuration > 0;
      if (isTimeStop) {
        stops.push({ startFrame: ev.startFrame, endFrame: ev.startFrame + ev.animationDuration! });
      }
    }
    stops.sort((a, b) => a.startFrame - b.startFrame);
    combatLoadout.commonSlot.skillPoints.setTimeStops(stops);
  }, [processedEvents, combatLoadout]);

  // ─── Ctrl+S to save, Escape to close info pane ─────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveLoadoutTree(loadoutTree);
        if (activeLoadoutId) {
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
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingEventId, editingSlotId, editingEnemyOpen, editingResourceKey, editingDamageRow, activeLoadoutId, loadoutTree]);

  // ─── Persistence ─────────────────────────────────────────────────────────
  const buildSheetData = useCallback(() => {
    // Dev assertion: detect duplicate event IDs before saving
    if (process.env.NODE_ENV === 'development') {
      const idSet = new Set<string>();
      for (const ev of events) {
        if (idSet.has(ev.id)) {
          console.error(`[zst] DUPLICATE EVENT ID "${ev.id}" detected at save time`, ev);
        }
        idSet.add(ev.id);
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
      getNextEventId(),
      resourceConfigs,
      derivedEventOverrides,
    );
  }, [operators, enemy, enemyStats, events, loadouts, loadoutProperties, visibleSkills, resourceConfigs, derivedEventOverrides]);

  useAutoSave(buildSheetData);

  useEffect(() => {
    if (!activeLoadoutId) return;
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
    defaultSkill: { name?: string; defaultActivationDuration?: number; defaultActiveDuration?: number; defaultCooldownDuration?: number; segments?: import('../consts/viewTypes').EventSegmentData[]; gaugeGain?: number; teamGaugeGain?: number; animationDuration?: number; comboTriggerColumnId?: string; operatorPotential?: number; timeInteraction?: string; isPerfectDodge?: boolean; timeDilation?: number; timeDependency?: import('../consts/enums').TimeDependency; skillPointCost?: number; sourceOwnerId?: string; sourceSkillName?: string } | null,
  ) => {
    // Validate against controller-derived columns before adding
    if (!validColumnPairsRef.current.has(`${ownerId}:${columnId}`)) return;
    const ev = createEvent(ownerId, columnId, atFrame, defaultSkill);
    if (defaultSkill?.comboTriggerColumnId) ev.comboTriggerColumnId = defaultSkill.comboTriggerColumnId;
    setEvents((prev) => {
      if (interactionModeRef.current === InteractionModeType.STRICT) {
        if (wouldOverlapNonOverlappable(prev, ev, ev.startFrame, processedEventsRef.current)) return prev;
        // Check SP sufficiency for battle skills
        if (columnId === SKILL_COLUMNS.BATTLE && !hasSufficientSP(ownerId, atFrame)) return prev;
        // Empowered battle skills require 4 active Melting Flame stacks
        if (ev.name?.includes('EMPOWERED')) {
          const processed = processedEventsRef.current;
          const mfCount = (processed ?? prev).filter(
            (e) => e.ownerId === ownerId && e.columnId === 'melting-flame'
              && e.startFrame <= atFrame && e.startFrame + e.activationDuration > atFrame,
          ).length;
          if (mfCount < 4) return prev;
        }
        // Enhanced battle skills require an active ultimate
        if (ev.name?.includes('ENHANCED') && !ev.name?.includes('EMPOWERED')) {
          const ultActive = prev.some(
            (e) => e.ownerId === ownerId && e.columnId === SKILL_COLUMNS.ULTIMATE
              && atFrame >= e.startFrame + e.activationDuration
              && atFrame < e.startFrame + e.activationDuration + e.activeDuration,
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
    // Try raw events first; if not found, store as derived event override
    setEvents((prev) => {
      const target = prev.find((ev) => ev.id === id);
      if (!target) {
        // Derived event — store override outside setEvents to avoid side effects
        queueMicrotask(() => {
          setDerivedEventOverrides((overrides) => ({
            ...overrides,
            [id]: { ...overrides[id], ...updates },
          }));
        });
        return prev;
      }
      const processed = interactionModeRef.current !== InteractionModeType.STRICT ? null : processedEventsRef.current;
      const merged = validateUpdate(prev, target, updates, processed);
      if (!merged) return prev;
      return prev.map((ev) => (ev.id === id ? merged : ev));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const handleMoveEvent = useCallback((id: string, newStartFrame: number) => {
    setEvents((prev) => {
      let target = prev.find((ev) => ev.id === id);
      if (!target && interactionModeRef.current !== InteractionModeType.STRICT) {
        // Derived event drag — redirect to source infliction if this is a freeform reaction
        const sourceId = id.endsWith('-reaction') ? id.slice(0, -'-reaction'.length) : undefined;
        if (sourceId) target = prev.find((ev) => ev.id === sourceId);
      }
      if (!target) return prev;
      // When redirected from a reaction, compute delta from the reaction's position
      const isRedirected = target.id !== id;
      let adjustedFrame = newStartFrame;
      if (isRedirected) {
        const reaction = processedEventsRef.current?.find((ev) => ev.id === id);
        if (reaction) adjustedFrame = target.startFrame + (newStartFrame - reaction.startFrame);
      }
      const processed = interactionModeRef.current !== InteractionModeType.STRICT ? null : processedEventsRef.current;
      const clamped = validateMove(prev, target, adjustedFrame, processed);
      if (clamped === target.startFrame) return prev;
      const targetId = target.id;
      const triggerCol = ComboSkillEventController.resolveComboTriggerColumnId(target, clamped, processed);
      return prev.map((ev) => (ev.id === targetId ? { ...ev, startFrame: clamped, ...(triggerCol !== undefined ? { comboTriggerColumnId: triggerCol } : {}) } : ev));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMoveEvents = useCallback((ids: string[], delta: number) => {
    if (delta === 0) return;
    setEvents((prev) => {
      const processed = interactionModeRef.current !== InteractionModeType.STRICT ? null : processedEventsRef.current;
      // Resolve derived reaction IDs to their source infliction IDs
      let resolvedIds = ids;
      if (interactionModeRef.current !== InteractionModeType.STRICT) {
        resolvedIds = ids.map((id) => {
          if (prev.some((ev) => ev.id === id)) return id;
          const sourceId = id.endsWith('-reaction') ? id.slice(0, -'-reaction'.length) : undefined;
          if (sourceId && prev.some((ev) => ev.id === sourceId)) return sourceId;
          return id;
        });
      }
      const rawIds = resolvedIds.filter((id) => prev.some((ev) => ev.id === id));
      const idSet = new Set(rawIds);
      if (rawIds.length === 0) return prev;
      const clampedDelta = validateBatchMoveDelta(prev, rawIds, delta, processed);
      if (clampedDelta === 0) return prev;
      return prev.map((ev) => {
        if (!idSet.has(ev.id)) return ev;
        const newFrame = ev.startFrame + clampedDelta;
        const triggerCol = ComboSkillEventController.resolveComboTriggerColumnId(ev, newFrame, processed);
        return { ...ev, startFrame: newFrame, ...(triggerCol !== undefined ? { comboTriggerColumnId: triggerCol } : {}) };
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRemoveEvent = useCallback((id: string) => {
    setEvents((prev) => prev.filter((ev) => ev.id !== id));
    setEditingEventId((cur) => (cur === id ? null : cur));
    setContextMenu(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRemoveEvents = useCallback((ids: string[]) => {
    const idSet = new Set(ids);
    setEvents((prev) => prev.filter((ev) => !idSet.has(ev.id)));
    setEditingEventId((cur) => (cur && idSet.has(cur) ? null : cur));
    setContextMenu(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDuplicateEvents = useCallback((sourceEvents: TimelineEvent[], frameOffset: number): string[] => {
    const newIds: string[] = [];
    const clones: TimelineEvent[] = [];
    for (const src of sourceEvents) {
      const newId = genEventId();
      newIds.push(newId);
      clones.push({ ...src, id: newId, startFrame: src.startFrame + frameOffset });
    }
    setEvents((prev) => {
      const combined = [...prev, ...clones];
      for (const c of clones) {
        if (wouldOverlapNonOverlappable(combined, c, c.startFrame)) return prev;
      }
      return combined;
    });
    return newIds;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const findDefaults = useCallback((ev: TimelineEvent) => {
    return findEventDefaults(ev, columns);
  }, [columns]);

  const handleResetEvent = useCallback((id: string) => {
    setEvents((prev) => {
      const target = prev.find((ev) => ev.id === id);
      if (!target) return prev;
      const defaults = findDefaults(target);
      if (!defaults) return prev;
      return prev.map((ev) => (ev.id === id ? {
        ...ev,
        activationDuration: defaults.defaultActivationDuration,
        activeDuration: defaults.defaultActiveDuration,
        cooldownDuration: defaults.defaultCooldownDuration,
        ...(defaults.segments ? { segments: defaults.segments } : {}),
        ...(defaults.animationDuration !== undefined ? { animationDuration: defaults.animationDuration } : {}),
        ...(defaults.skillPointCost !== undefined ? { skillPointCost: defaults.skillPointCost } : {}),
      } : ev));
    });
    setContextMenu(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findDefaults]);

  const handleResetSegments = useCallback((id: string) => {
    setEvents((prev) => {
      const target = prev.find((ev) => ev.id === id);
      if (!target) return prev;
      const defaults = findDefaults(target);
      if (!defaults?.segments) return prev;
      return prev.map((ev) => (ev.id === id ? {
        ...ev,
        segments: defaults.segments!.map((defSeg, i) => ({
          ...defSeg,
          durationFrames: ev.segments?.[i]?.durationFrames ?? defSeg.durationFrames,
        })),
        activationDuration: computeSegmentsSpan(defaults.segments!),
      } : ev));
    });
    setContextMenu(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findDefaults]);

  const handleResetFrames = useCallback((id: string) => {
    setEvents((prev) => {
      const target = prev.find((ev) => ev.id === id);
      if (!target?.segments) return prev;
      const defaults = findDefaults(target);
      if (!defaults?.segments) return prev;
      return prev.map((ev) => (ev.id === id ? {
        ...ev,
        segments: ev.segments!.map((seg, i) => ({
          ...seg,
          frames: defaults.segments![i]?.frames ?? seg.frames,
        })),
      } : ev));
    });
    setContextMenu(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findDefaults]);

  const handleResetEvents = useCallback((ids: string[]) => {
    setEvents((prev) => {
      let changed = false;
      const result = prev.map((ev) => {
        if (!ids.includes(ev.id)) return ev;
        const defaults = findDefaults(ev);
        if (!defaults) return ev;
        changed = true;
        return {
          ...ev,
          activationDuration: defaults.defaultActivationDuration,
          activeDuration: defaults.defaultActiveDuration,
          cooldownDuration: defaults.defaultCooldownDuration,
          ...(defaults.segments ? { segments: defaults.segments } : {}),
          ...(defaults.animationDuration !== undefined ? { animationDuration: defaults.animationDuration } : {}),
          ...(defaults.skillPointCost !== undefined ? { skillPointCost: defaults.skillPointCost } : {}),
        };
      });
      return changed ? result : prev;
    });
    setContextMenu(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findDefaults]);

  const handleRemoveFrame = useCallback((eventId: string, segmentIndex: number, frameIndex: number) => {
    setEvents((prev) => {
      const target = prev.find((ev) => ev.id === eventId);
      if (!target) return prev;
      const segments = target.segments ?? findEventDefaults(target, columns)?.segments;
      if (!segments?.[segmentIndex]?.frames) return prev;
      const newSegments = segments.map((seg, si) => {
        if (si !== segmentIndex) return seg;
        return { ...seg, frames: seg.frames?.filter((_, fi) => fi !== frameIndex) };
      });
      return prev.map((ev) => (ev.id === eventId ? { ...ev, segments: newSegments } : ev));
    });
    setSelectedFrames((prev) => prev.filter((f) => !(f.eventId === eventId && f.segmentIndex === segmentIndex && f.frameIndex === frameIndex)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns]);

  const handleRemoveFrames = useCallback((frames: SelectedFrame[]) => {
    const byEvent = new Map<string, { segmentIndex: number; frameIndex: number }[]>();
    for (const f of frames) {
      const arr = byEvent.get(f.eventId) ?? [];
      arr.push({ segmentIndex: f.segmentIndex, frameIndex: f.frameIndex });
      byEvent.set(f.eventId, arr);
    }
    setEvents((prev) => prev.map((ev) => {
      const toRemove = byEvent.get(ev.id);
      if (!toRemove) return ev;
      const segments = ev.segments ?? findEventDefaults(ev, columns)?.segments;
      if (!segments) return ev;
      const removeSet = new Set(toRemove.map((r) => `${r.segmentIndex}-${r.frameIndex}`));
      const newSegments = segments.map((seg, si) => {
        if (!seg.frames) return seg;
        const filtered = seg.frames.filter((_, fi) => !removeSet.has(`${si}-${fi}`));
        return { ...seg, frames: filtered };
      });
      return { ...ev, segments: newSegments };
    }));
    setSelectedFrames([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns]);

  const handleAddSegment = useCallback((eventId: string, segmentLabel: string) => {
    setEvents((prev) => {
      const target = prev.find((ev) => ev.id === eventId);
      if (!target?.segments) return prev;
      const col = columns.find((c) =>
        c.type === 'mini-timeline' && c.ownerId === target.ownerId && c.columnId === target.columnId,
      );
      if (col?.type !== 'mini-timeline') return prev;
      const fullSeg = col.defaultEvent?.segments?.find((s) => s.label === segmentLabel);
      if (!fullSeg) return prev;
      const allLabels = col.defaultEvent!.segments!.map((s) => s.label);
      const newSegments = [...target.segments, fullSeg];
      newSegments.sort((a, b) => {
        const ai = allLabels.indexOf(a.label);
        const bi = allLabels.indexOf(b.label);
        return ai - bi;
      });
      const totalDuration = computeSegmentsSpan(newSegments);
      return prev.map((ev) => (ev.id === eventId ? {
        ...ev,
        segments: newSegments,
        activationDuration: totalDuration,
        nonOverlappableRange: totalDuration,
      } : ev));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns]);

  const handleRemoveSegment = useCallback((eventId: string, segmentIndex: number) => {
    setEvents((prev) => {
      const target = prev.find((ev) => ev.id === eventId);
      if (!target?.segments || target.segments.length <= 1) return prev;
      const newSegments = target.segments.filter((_, si) => si !== segmentIndex);
      const totalDuration = computeSegmentsSpan(newSegments);
      return prev.map((ev) => (ev.id === eventId ? {
        ...ev,
        segments: newSegments,
        activationDuration: totalDuration,
        nonOverlappableRange: totalDuration,
      } : ev));
    });
    setSelectedFrames((prev) => prev.filter((f) => !(f.eventId === eventId && f.segmentIndex === segmentIndex)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddFrame = useCallback((eventId: string, segmentIndex: number, frameOffsetFrame: number) => {
    setEvents((prev) => {
      const target = prev.find((ev) => ev.id === eventId);
      if (!target?.segments?.[segmentIndex]) return prev;
      const col = columns.find((c) =>
        c.type === 'mini-timeline' && c.ownerId === target.ownerId && c.columnId === target.columnId,
      );
      if (col?.type !== 'mini-timeline') return prev;
      const seg = target.segments[segmentIndex];
      const allDefaultSegs = col.defaultEvent?.segments;
      const defaultSeg = allDefaultSegs?.find((s) => s.label === seg.label) ?? allDefaultSegs?.[segmentIndex];
      const fullFrame = defaultSeg?.frames?.find((f) => f.offsetFrame === frameOffsetFrame);
      if (!fullFrame) return prev;
      if (seg.frames?.some((f) => f.offsetFrame === frameOffsetFrame)) return prev;
      const newFrames = [...(seg.frames ?? []), fullFrame];
      newFrames.sort((a, b) => a.offsetFrame - b.offsetFrame);
      const newSegments = target.segments.map((s, si) =>
        si === segmentIndex ? { ...s, frames: newFrames } : s,
      );
      return prev.map((ev) => (ev.id === eventId ? { ...ev, segments: newSegments } : ev));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns]);

  const handleFrameClick = useCallback((eventId: string, segmentIndex: number, frameIndex: number) => {
    setSelectedFrames((prev) => {
      const exists = prev.some((f) => f.eventId === eventId && f.segmentIndex === segmentIndex && f.frameIndex === frameIndex);
      if (exists) {
        const next = prev.filter((f) => !(f.eventId === eventId && f.segmentIndex === segmentIndex && f.frameIndex === frameIndex));
        if (next.length === 0) setInfoPaneClosing(true);
        return next;
      }
      return [{ eventId, segmentIndex, frameIndex }];
    });
    setEditingEventId(eventId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMoveFrame = useCallback((eventId: string, segmentIndex: number, frameIndex: number, newOffsetFrame: number) => {
    setEvents((prev) => prev.map((ev) => {
      if (ev.id !== eventId) return ev;
      // Attach default segments from column definitions if the raw event doesn't have them
      const segments = ev.segments ?? findEventDefaults(ev, columns)?.segments;
      if (!segments) return ev;
      const newSegments = segments.map((seg, si) => {
        if (si !== segmentIndex || !seg.frames) return seg;
        const newFrames = seg.frames.map((f, fi) =>
          fi === frameIndex ? { ...f, offsetFrame: newOffsetFrame } : f,
        );
        return { ...seg, frames: newFrames };
      });
      return { ...ev, segments: newSegments };
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns]);

  // ─── Loadout & operator handlers ─────────────────────────────────────────
  const handleLoadoutChange = useCallback((slotId: string, state: OperatorLoadoutState) => {
    setUndoable((prev) => ({
      ...prev,
      loadouts: { ...prev.loadouts, [slotId]: state },
    }));
  }, [setUndoable]);

  const handleStatsChange = useCallback((slotId: string, stats: LoadoutProperties) => {
    setUndoable((prev) => updatePropertiesWithPotential(prev, slotId, stats, SLOT_IDS));
  }, [setUndoable]);

  const handleSwapOperator = useCallback((slotId: string, newOperatorId: string | null) => {
    setUndoable((prev) => swapOperator(prev, slotId, newOperatorId, SLOT_IDS));
  }, [setUndoable]);

  const handleSwapEnemy = useCallback((enemyId: string) => {
    const found = ALL_ENEMIES.find((e) => e.id === enemyId);
    if (found) {
      setUndoable((prev) => ({ ...prev, enemy: found, enemyStats: getDefaultEnemyStats(found.id) }));
    }
  }, [setUndoable]);

  const handleEnemyStatsChange = useCallback((stats: EnemyStats) => {
    setUndoable((prev) => ({ ...prev, enemyStats: stats }));
  }, [setUndoable]);

  const handleResourceConfigChange = useCallback((colKey: string, config: ResourceConfig) => {
    if (colKey === staggerKey) {
      // Stagger resource config is sourced from enemyStats
      setUndoable((prev) => ({
        ...prev,
        enemyStats: {
          ...prev.enemyStats,
          [StatType.STAGGER_HP]: config.max,
          staggerStartValue: config.startValue,
        },
      }));
      return;
    }
    setUndoable((prev) => ({
      ...prev,
      resourceConfigs: { ...prev.resourceConfigs, [colKey]: config },
    }));
  }, [setUndoable, staggerKey]);

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
    if (activeLoadoutId) {
      saveLoadoutData(activeLoadoutId, buildSheetData());
    }
    const existingNames = new Set(loadoutTree.nodes.map((n) => n.name));
    let num = 1;
    while (existingNames.has(`Loadout ${num}`)) num++;
    const { tree: newTree, node } = addLoadoutNode(loadoutTree, `Loadout ${num}`, parentId);
    setLoadoutTree(newTree);
    saveLoadoutTree(newTree);

    setNextEventId(1);
    const emptyState: UndoableState = {
      events: [],
      operators: [...INITIAL_OPERATORS],
      enemy: DEFAULT_ENEMY,
      enemyStats: getDefaultEnemyStats(DEFAULT_ENEMY.id),
      loadouts: INITIAL_LOADOUTS,
      loadoutProperties: INITIAL_LOADOUT_PROPERTIES,
      resourceConfigs: {},
    };
    resetUndoable(emptyState);
    setVisibleSkills(INITIAL_VISIBLE);
    setDerivedEventOverrides({});
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
  }, [loadoutTree, activeLoadoutId, buildSheetData, resetUndoable]);

  const handleDuplicateLoadout = useCallback((sourceId: string) => {
    // Save current loadout before switching
    if (activeLoadoutId) {
      saveLoadoutData(activeLoadoutId, buildSheetData());
    }
    const sourceNode = loadoutTree.nodes.find((n) => n.id === sourceId);
    const baseName = sourceNode ? sourceNode.name : 'Loadout';
    const existingNames = new Set(loadoutTree.nodes.map((n) => n.name));
    let copyNum = 1;
    while (existingNames.has(`${baseName} - Copy ${copyNum}`)) copyNum++;
    const newName = `${baseName} - Copy ${copyNum}`;
    const { tree: newTree, node } = addLoadoutAfter(loadoutTree, newName, sourceId);
    setLoadoutTree(newTree);
    saveLoadoutTree(newTree);

    // Copy source data (or current state if source is active)
    const sourceData = sourceId === activeLoadoutId ? buildSheetData() : loadLoadoutData(sourceId);
    if (sourceData) {
      saveLoadoutData(node.id, sourceData);
      const resolved = applySheetData(sourceData);
      resetUndoable({
        events: resolved.events,
        operators: resolved.operators,
        enemy: resolved.enemy,
        enemyStats: resolved.enemyStats ?? getDefaultEnemyStats(resolved.enemy.id),
        loadouts: resolved.loadouts,
        loadoutProperties: resolved.loadoutProperties,
        resourceConfigs: resolved.resourceConfigs,
      });
      setVisibleSkills(resolved.visibleSkills);
      setDerivedEventOverrides(resolved.derivedEventOverrides);
    } else {
      saveLoadoutData(node.id, serializeSheet(
        INITIAL_OPERATORS.map((op) => op?.id ?? null),
        DEFAULT_ENEMY.id,
        getDefaultEnemyStats(DEFAULT_ENEMY.id),
        [], INITIAL_LOADOUTS, INITIAL_LOADOUT_PROPERTIES, INITIAL_VISIBLE, 1, {},
      ));
      setDerivedEventOverrides({});
    }
    setEditingEventId(null);
    setEditingSlotId(null);
    setEditingResourceKey(null);
    setContextMenu(null);
    setActiveLoadoutId(node.id);
    saveActiveLoadoutId(node.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadoutTree, activeLoadoutId, buildSheetData, resetUndoable]);

  const handleSelectLoadout = useCallback((id: string) => {
    if (id === activeLoadoutId) return;
    if (activeLoadoutId) {
      saveLoadoutData(activeLoadoutId, buildSheetData());
    }
    const data = loadLoadoutData(id);
    if (data) {
      const resolved = applySheetData(data);
      resetUndoable({
        events: resolved.events,
        operators: resolved.operators,
        enemy: resolved.enemy,
        enemyStats: resolved.enemyStats ?? getDefaultEnemyStats(resolved.enemy.id),
        loadouts: resolved.loadouts,
        loadoutProperties: resolved.loadoutProperties,
        resourceConfigs: resolved.resourceConfigs,
      });
      setVisibleSkills(resolved.visibleSkills);
      setDerivedEventOverrides(resolved.derivedEventOverrides);
    } else {
      setNextEventId(1);
      resetUndoable({
        events: [],
        operators: [...INITIAL_OPERATORS],
        enemy: DEFAULT_ENEMY,
        enemyStats: getDefaultEnemyStats(DEFAULT_ENEMY.id),
        loadouts: INITIAL_LOADOUTS,
        loadoutProperties: INITIAL_LOADOUT_PROPERTIES,
        resourceConfigs: {},
      });
      setVisibleSkills(INITIAL_VISIBLE);
      setDerivedEventOverrides({});
    }
    setEditingEventId(null);
    setEditingSlotId(null);
    setEditingResourceKey(null);
    setContextMenu(null);
    setActiveLoadoutId(id);
    saveActiveLoadoutId(id);
  }, [activeLoadoutId, buildSheetData, resetUndoable]);

  const handleDeleteLoadout = useCallback((loadoutIds: string[], _nodeId: string) => {
    for (const sid of loadoutIds) {
      deleteLoadoutData(sid);
    }
    const remainingLoadouts = loadoutTree.nodes.filter(
      (n) => n.type === 'loadout' && !loadoutIds.includes(n.id),
    );
    if (remainingLoadouts.length === 0) {
      // Tree is now empty — reset to a fresh "Loadout 1"
      const freshTree: LoadoutTree = { nodes: [] };
      const { tree: newTree, node } = addLoadoutNode(freshTree, 'Loadout 1', null);
      resetLoadoutTree(newTree);

      setNextEventId(1);
      const emptyState: UndoableState = {
        events: [],
        operators: [...INITIAL_OPERATORS],
        enemy: DEFAULT_ENEMY,
        enemyStats: getDefaultEnemyStats(DEFAULT_ENEMY.id),
        loadouts: INITIAL_LOADOUTS,
        loadoutProperties: INITIAL_LOADOUT_PROPERTIES,
        resourceConfigs: {},
      };
      resetUndoable(emptyState);
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
  }, [activeLoadoutId, loadoutTree, handleSelectLoadout, resetLoadoutTree, resetUndoable]);

  const handleExport = useCallback(() => {
    if (activeLoadoutId) {
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
    setNextEventId(1);
    resetUndoable({
      events: [],
      operators: [...INITIAL_OPERATORS],
      enemy: DEFAULT_ENEMY,
      enemyStats: getDefaultEnemyStats(DEFAULT_ENEMY.id),
      loadouts: INITIAL_LOADOUTS,
      loadoutProperties: INITIAL_LOADOUT_PROPERTIES,
      resourceConfigs: {},
    });
    setVisibleSkills(INITIAL_VISIBLE);
    setDerivedEventOverrides({});
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
  }, [resetUndoable, activeLoadoutId]);

  const handleClearAll = useCallback(() => {
    for (const node of loadoutTree.nodes) {
      if (node.type === 'loadout') {
        deleteLoadoutData(node.id);
      }
    }
    const freshTree: LoadoutTree = { nodes: [] };
    const { tree: newTree, node } = addLoadoutNode(freshTree, 'Loadout 1', null);
    resetLoadoutTree(newTree);

    setNextEventId(1);
    const emptyState: UndoableState = {
      events: [],
      operators: [...INITIAL_OPERATORS],
      enemy: DEFAULT_ENEMY,
      enemyStats: getDefaultEnemyStats(DEFAULT_ENEMY.id),
      loadouts: INITIAL_LOADOUTS,
      loadoutProperties: INITIAL_LOADOUT_PROPERTIES,
      resourceConfigs: {},
    };
    resetUndoable(emptyState);
    setVisibleSkills(INITIAL_VISIBLE);
    setDerivedEventOverrides({});
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
  }, [loadoutTree, resetLoadoutTree, resetUndoable]);

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
    operators, enemy, enemyStats, events, loadouts, loadoutProperties, visibleSkills, resourceConfigs, buildSheetData,
    columns, slots, allProcessedEvents, contentFrames, resourceGraphs, staggerBreaks, spConsumptionHistory, spInsufficiencyZones,

    // UI state
    zoom, contextMenu, editingEvent, processedEditingEvent, editingEventReadOnly, editingEventIsDerived, editContext,
    editingSlot, editingEnemyOpen, editingResourceCol, editingResourceConfig, editingResourceKey,
    editingDamageRow,
    infoPaneClosing, infoPanePinned, infoPaneVerbose, selectedFrames, hoverFrame,
    scrollSynced, showRealTime, splitPct, interactionMode, lightMode, warningMessage, hiddenPane, hidePreview, showPreview, critMode, orientation,
    loadoutRowHeight, headerRowHeight, selectEventIds,
    devlogOpen, keysOpen, exportModalOpen, confirmClearLoadout, confirmClearAll, saveFlash,

    // Loadout tree
    loadoutTree, activeLoadoutId, sidebarCollapsed,

    // Refs
    appBodyRef, sidebarRef,

    // Event handlers
    handleAddEvent, handleUpdateEvent, handleMoveEvent, handleMoveEvents,
    handleRemoveEvent, handleRemoveEvents, handleDuplicateEvents,
    handleResetEvent, handleResetEvents, handleResetSegments, handleResetFrames,
    handleRemoveFrame, handleRemoveFrames, handleAddFrame, handleAddSegment,
    handleRemoveSegment, handleMoveFrame, handleFrameClick,

    // Loadout/operator handlers
    handleLoadoutChange, handleStatsChange, handleSwapOperator, handleSwapEnemy, handleEnemyStatsChange,
    handleResourceConfigChange,

    // Loadout tree handlers
    handleLoadoutTreeChange, handleNewLoadout, handleDuplicateLoadout, handleSelectLoadout, handleDeleteLoadout,
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
    setDevlogOpen, setKeysOpen, setInteractionMode, setLightMode, setShowRealTime, setCritMode,
    setSplitPct, setSelectEventIds, setExportModalOpen,
    setConfirmClearLoadout, setConfirmClearAll,

    // Undo/redo
    beginBatch, endBatch,

    // Custom skill links
    bumpCustomSkillVersion,

    // Constants
    allOperators: ALL_OPERATORS,
    allEnemies: ALL_ENEMIES,
  };
}
