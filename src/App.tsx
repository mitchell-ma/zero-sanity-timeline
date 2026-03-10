import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useHistory } from './utils/useHistory';
import CombatPlanner from './view/CombatPlanner';
import CombatSheet from './view/CombatSheet';
import ContextMenu from './view/ContextMenu';
import InformationPane, { LoadoutStats, DEFAULT_LOADOUT_STATS, getDefaultLoadoutStats } from './view/InformationPane';
import AppBar from './view/AppBar';
import SessionSidebar from './view/SessionSidebar';
import KeyboardShortcutsModal from './view/KeyboardShortcutsModal';
import WarningModal from './view/WarningModal';
import DevlogModal from './view/DevlogModal';
import { OperatorLoadoutState, EMPTY_LOADOUT } from './view/OperatorLoadoutHeader';
import { ALL_OPERATORS, getUltimateEnergyCostForPotential } from './controller/operators/operatorRegistry';
import { ALL_ENEMIES, DEFAULT_ENEMY } from './utils/enemies';
import { WEAPONS } from './utils/loadoutRegistry';
import { Operator, TimelineEvent, VisibleSkills, ContextMenuState, SkillType, SelectedFrame, ResourceConfig, MiniTimeline, Enemy } from './consts/viewTypes';
import { CombatLoadout } from './controller/combat-loadout';
import { processInflictionEvents } from './utils/processInflictions';
import { buildColumns } from './controller/timeline/columnBuilder';
import {
  createEvent,
  genEventId,
  validateUpdate,
  validateMove,
  validateBatchMoveDelta,
  wouldOverlapNonOverlappable,
  setNextEventId,
  getNextEventId,
} from './controller/timeline/eventController';
import {
  serializeSheet,
  clearLocalStorage,
  exportToFile,
  importFromFile,
} from './utils/sheetStorage';
import {
  NUM_SLOTS,
  SLOT_IDS,
  INITIAL_OPERATORS,
  INITIAL_VISIBLE,
  INITIAL_LOADOUTS,
  INITIAL_LOADOUT_STATS,
  applySheetData,
  loadInitialState,
} from './app/sheetDefaults';
import {
  SessionTree,
  loadSessionTree,
  saveSessionTree,
  loadActiveSessionId,
  saveActiveSessionId,
  loadSessionData,
  saveSessionData,
  deleteSessionData,
  addSession as addSessionNode,
  migrateLegacySheet,
} from './utils/sessionStorage';
import { useKeyboardShortcuts } from './app/useKeyboardShortcuts';
import { useCombatLoadout } from './app/useCombatLoadout';
import { useResourceGraphs } from './app/useResourceGraphs';
import { useAutoSave } from './app/useAutoSave';
import { LOADOUT_ROW_HEIGHT, FPS } from './utils/timeline';
import { COMMON_OWNER_ID, COMMON_COLUMN_IDS } from './controller/slot/commonSlotController';
import './App.css';

const initialLoad = loadInitialState();

// ─── Session initialization ──────────────────────────────────────────────────
function initSessions() {
  let tree = loadSessionTree();
  let activeId = loadActiveSessionId();

  // If no sessions exist, migrate legacy sheet or create a default session
  if (tree.nodes.length === 0) {
    const migrated = migrateLegacySheet();
    if (migrated) {
      return { tree: migrated.tree, activeId: migrated.activeId };
    }
    // Create a default session from current initialLoad
    const { tree: newTree, node } = addSessionNode(tree, 'Session 1', null);
    tree = newTree;
    activeId = node.id;
    saveSessionTree(tree);
    saveActiveSessionId(activeId);
    // Save current state as this session
    const sheetData = serializeSheet(
      (initialLoad.loaded?.operators ?? INITIAL_OPERATORS).map((op) => op?.id ?? null),
      (initialLoad.loaded?.enemy ?? DEFAULT_ENEMY).id,
      initialLoad.loaded?.events ?? [],
      initialLoad.loaded?.loadouts ?? INITIAL_LOADOUTS,
      initialLoad.loaded?.loadoutStats ?? INITIAL_LOADOUT_STATS,
      initialLoad.loaded?.visibleSkills ?? INITIAL_VISIBLE,
      getNextEventId(),
      initialLoad.loaded?.resourceConfigs ?? {},
    );
    saveSessionData(activeId, sheetData);
  }

  return { tree, activeId };
}

const initialSessions = initSessions();

export default function App() {
  // ─── Core state ──────────────────────────────────────────────────────────
  interface UndoableState {
    events: TimelineEvent[];
    operators: (Operator | null)[];
    enemy: Enemy;
    loadouts: Record<string, OperatorLoadoutState>;
    loadoutStats: Record<string, LoadoutStats>;
    resourceConfigs: Record<string, ResourceConfig>;
  }

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
    loadouts: initialLoad.loaded?.loadouts ?? INITIAL_LOADOUTS,
    loadoutStats: initialLoad.loaded?.loadoutStats ?? INITIAL_LOADOUT_STATS,
    resourceConfigs: initialLoad.loaded?.resourceConfigs ?? {},
  });

  const { events, operators, enemy, loadouts, loadoutStats, resourceConfigs } = undoable;

  const setEvents = useCallback((action: TimelineEvent[] | ((prev: TimelineEvent[]) => TimelineEvent[])) => {
    setUndoable((prev) => {
      const next = typeof action === 'function' ? action(prev.events) : action;
      return next === prev.events ? prev : { ...prev, events: next };
    });
  }, [setUndoable]);

  const setOperators = useCallback((action: (Operator | null)[] | ((prev: (Operator | null)[]) => (Operator | null)[])) => {
    setUndoable((prev) => {
      const next = typeof action === 'function' ? action(prev.operators) : action;
      return next === prev.operators ? prev : { ...prev, operators: next };
    });
  }, [setUndoable]);

  const setEnemy = useCallback((newEnemy: Enemy) => {
    setUndoable((prev) => prev.enemy === newEnemy ? prev : { ...prev, enemy: newEnemy });
  }, [setUndoable]);

  const [zoom,           setZoom]           = useState<number>(() => {
    try { const v = localStorage.getItem('zst-zoom'); return v ? Number(v) : 0.5; } catch { return 0.5; }
  });
  const [visibleSkills,  setVisibleSkills]  = useState<VisibleSkills>(
    initialLoad.loaded?.visibleSkills ?? INITIAL_VISIBLE,
  );
  const [contextMenu,    setContextMenu]    = useState<ContextMenuState | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editContext,    setEditContext]    = useState<string | null>(null);
  const setLoadouts = useCallback((action: Record<string, OperatorLoadoutState> | ((prev: Record<string, OperatorLoadoutState>) => Record<string, OperatorLoadoutState>)) => {
    setUndoable((prev) => {
      const next = typeof action === 'function' ? action(prev.loadouts) : action;
      return next === prev.loadouts ? prev : { ...prev, loadouts: next };
    });
  }, [setUndoable]);

  const setLoadoutStats = useCallback((action: Record<string, LoadoutStats> | ((prev: Record<string, LoadoutStats>) => Record<string, LoadoutStats>)) => {
    setUndoable((prev) => {
      const next = typeof action === 'function' ? action(prev.loadoutStats) : action;
      return next === prev.loadoutStats ? prev : { ...prev, loadoutStats: next };
    });
  }, [setUndoable]);

  const setResourceConfigs = useCallback((action: Record<string, ResourceConfig> | ((prev: Record<string, ResourceConfig>) => Record<string, ResourceConfig>)) => {
    setUndoable((prev) => {
      const next = typeof action === 'function' ? action(prev.resourceConfigs) : action;
      return next === prev.resourceConfigs ? prev : { ...prev, resourceConfigs: next };
    });
  }, [setUndoable]);

  const [editingSlotId,  setEditingSlotId]  = useState<string | null>(null);
  const [editingResourceKey, setEditingResourceKey] = useState<string | null>(null);
  const [infoPaneClosing, setInfoPaneClosing] = useState(false);
  const [infoPanePinned,  setInfoPanePinned]  = useState(false);
  const [selectedFrames, setSelectedFrames] = useState<SelectedFrame[]>([]);
  const [hoverFrame,     setHoverFrame]     = useState<number | null>(null);
  const appBodyRef = useRef<HTMLDivElement | null>(null);
  const [scrollSynced,   setScrollSynced]   = useState(true);
  const [splitPct,       setSplitPct]       = useState(65); // timeline gets 65% by default
  const resizerDragRef = useRef<{ startX: number; startPct: number } | null>(null);
  const [devlogOpen,     setDevlogOpen]     = useState(false);
  const [keysOpen,       setKeysOpen]       = useState(false);
  const [warningMessage, setWarningMessage] = useState<string | null>(initialLoad.error);

  // ─── Session state ─────────────────────────────────────────────────────
  const [sessionTree, setSessionTree] = useState<SessionTree>(initialSessions.tree);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(initialSessions.activeId);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('zst-sidebar-collapsed') === 'true'; } catch { return false; }
  });

  // ─── Scroll sync ────────────────────────────────────────────────────────
  const [loadoutRowHeight, setLoadoutRowHeight] = useState(LOADOUT_ROW_HEIGHT);
  const dmgScrollRef = useRef<HTMLDivElement | null>(null);
  const tlScrollRef = useRef<HTMLDivElement | null>(null);
  const scrollSourceRef = useRef<'tl' | 'dmg' | null>(null);

  const handleDmgScrollRef = useCallback((el: HTMLDivElement | null) => {
    dmgScrollRef.current = el;
  }, []);

  const handleTlScrollRef = useCallback((el: HTMLDivElement | null) => {
    tlScrollRef.current = el;
  }, []);

  const handleTimelineScroll = useCallback((st: number) => {
    if (!scrollSynced) return;
    if (scrollSourceRef.current === 'dmg') { scrollSourceRef.current = null; return; }
    scrollSourceRef.current = 'tl';
    if (dmgScrollRef.current) dmgScrollRef.current.scrollTop = st;
  }, [scrollSynced]);

  const handleSheetScroll = useCallback((st: number) => {
    if (!scrollSynced) return;
    if (scrollSourceRef.current === 'tl') { scrollSourceRef.current = null; return; }
    scrollSourceRef.current = 'dmg';
    if (tlScrollRef.current) tlScrollRef.current.scrollTop = st;
  }, [scrollSynced]);

  // ─── Panel resize ──────────────────────────────────────────────────────────
  const handleResizerMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    resizerDragRef.current = { startX: e.clientX, startPct: splitPct };
    const handleMouseMove = (ev: MouseEvent) => {
      const ref = resizerDragRef.current;
      if (!ref || !appBodyRef.current) return;
      const bodyW = appBodyRef.current.offsetWidth;
      const dx = ev.clientX - ref.startX;
      const newPct = Math.max(30, Math.min(80, ref.startPct + (dx / bodyW) * 100));
      setSplitPct(newPct);
    };
    const handleMouseUp = () => {
      resizerDragRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [splitPct]);

  // ─── Derived state ───────────────────────────────────────────────────────
  const processedEvents = useMemo(() => processInflictionEvents(events), [events]);

  // ─── Controllers & hooks ─────────────────────────────────────────────────
  const { activationWindows, activationWindowsRef, combatLoadout } =
    useCombatLoadout(SLOT_IDS, operators, processedEvents);

  const { resourceGraphs } = useResourceGraphs(operators, SLOT_IDS, events, combatLoadout, resourceConfigs);

  useKeyboardShortcuts(undo, redo);

  // Sync SP resource config to the SP timeline controller
  const spKey = `${COMMON_OWNER_ID}-${COMMON_COLUMN_IDS.SKILL_POINTS}`;
  useEffect(() => {
    const cfg = resourceConfigs[spKey];
    if (!cfg) return;
    combatLoadout.commonSlot.skillPoints.updateConfig({
      startValue: cfg.startValue,
      max: cfg.max,
      regenPerFrame: cfg.regenPerSecond / FPS,
    });
  }, [resourceConfigs, combatLoadout, spKey]);

  // Sync derived SP recovery events onto the SP subtimeline for resource graph
  useEffect(() => {
    const spSubtimeline = combatLoadout.commonSlot.getSubtimeline(COMMON_COLUMN_IDS.SKILL_POINTS);
    if (!spSubtimeline) return;
    const spEvents = processedEvents.filter(
      (ev) => ev.ownerId === COMMON_OWNER_ID && ev.columnId === COMMON_COLUMN_IDS.SKILL_POINTS,
    );
    spSubtimeline.setEvents(spEvents);
  }, [processedEvents, combatLoadout]);

  const slots = SLOT_IDS.map((slotId, i) => ({
    slotId,
    operator: operators[i] ?? null,
    potential: loadoutStats[slotId]?.potential,
  }));

  const columns = useMemo(
    () => buildColumns(slots, enemy, visibleSkills),
    [slots, enemy, visibleSkills, loadoutStats],
  );

  const editingEvent = editingEventId
    ? processedEvents.find((e) => e.id === editingEventId) ?? null
    : null;

  const editingEventReadOnly = editingEvent
    ? columns.some((c) => {
        if (c.type !== 'mini-timeline' || !c.derived) return false;
        if (c.ownerId !== editingEvent.ownerId) return false;
        if (c.columnId === editingEvent.columnId) return true;
        return c.matchColumnIds?.includes(editingEvent.columnId) ?? false;
      })
    : false;

  const editingSlot = editingSlotId
    ? slots.find((s) => s.slotId === editingSlotId) ?? null
    : null;

  // Resource editing derived state
  const editingResourceCol = editingResourceKey
    ? columns.find((c): c is MiniTimeline => c.type === 'mini-timeline' && c.key === editingResourceKey) ?? null
    : null;

  const getDefaultResourceConfig = useCallback((colKey: string): ResourceConfig => {
    if (colKey === spKey) {
      return { startValue: 200, max: 300, regenPerSecond: 8 };
    }
    // Ultimate columns: slot-X-ultimate
    const slotId = colKey.replace(/-ultimate$/, '');
    const slotIdx = SLOT_IDS.indexOf(slotId);
    const op = slotIdx >= 0 ? operators[slotIdx] : null;
    if (!op) return { startValue: 0, max: 300, regenPerSecond: 0 };
    const stats = loadoutStats[slotId];
    const potential = stats?.potential ?? 5;
    const cost = getUltimateEnergyCostForPotential(op.id, potential as 0|1|2|3|4|5) ?? op.ultimateEnergyCost;
    return { startValue: 0, max: cost, regenPerSecond: 0 };
  }, [operators, spKey, loadoutStats]);

  const editingResourceConfig = editingResourceKey
    ? resourceConfigs[editingResourceKey] ?? getDefaultResourceConfig(editingResourceKey)
    : null;

  const handleResourceConfigChange = useCallback((colKey: string, config: ResourceConfig) => {
    setResourceConfigs((prev) => ({ ...prev, [colKey]: config }));
  }, []);

  // ─── Persistence ─────────────────────────────────────────────────────────
  const buildSheetData = useCallback(() => {
    return serializeSheet(
      operators.map((op) => op?.id ?? null),
      enemy.id,
      events,
      loadouts,
      loadoutStats,
      visibleSkills,
      getNextEventId(),
      resourceConfigs,
    );
  }, [operators, enemy, events, loadouts, loadoutStats, visibleSkills, resourceConfigs]);

  useAutoSave(buildSheetData);

  // Also auto-save to the active session
  useEffect(() => {
    if (!activeSessionId) return;
    const timer = setTimeout(() => {
      saveSessionData(activeSessionId, buildSheetData());
    }, 600);
    return () => clearTimeout(timer);
  }, [buildSheetData, activeSessionId]);

  // ─── Session handlers ──────────────────────────────────────────────────
  const handleSessionTreeChange = useCallback((tree: SessionTree) => {
    setSessionTree(tree);
    saveSessionTree(tree);
  }, []);

  const handleToggleSidebar = useCallback(() => {
    setSidebarCollapsed((p) => {
      const next = !p;
      try { localStorage.setItem('zst-sidebar-collapsed', String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const handleNewSession = useCallback((parentId: string | null) => {
    // Save current session first
    if (activeSessionId) {
      saveSessionData(activeSessionId, buildSheetData());
    }

    const { tree: newTree, node } = addSessionNode(sessionTree, 'New Session', parentId);
    setSessionTree(newTree);
    saveSessionTree(newTree);

    // Create empty session data
    setNextEventId(1);
    const emptyState = {
      events: [] as TimelineEvent[],
      operators: [...INITIAL_OPERATORS],
      enemy: DEFAULT_ENEMY,
      loadouts: INITIAL_LOADOUTS,
      loadoutStats: INITIAL_LOADOUT_STATS,
      resourceConfigs: {} as Record<string, ResourceConfig>,
    };
    resetUndoable(emptyState);
    setVisibleSkills(INITIAL_VISIBLE);
    setEditingEventId(null);
    setEditingSlotId(null);
    setEditingResourceKey(null);
    setContextMenu(null);

    // Save and activate
    const sheetData = serializeSheet(
      emptyState.operators.map((op) => op?.id ?? null),
      emptyState.enemy.id,
      emptyState.events,
      emptyState.loadouts,
      emptyState.loadoutStats,
      INITIAL_VISIBLE,
      1,
      emptyState.resourceConfigs,
    );
    saveSessionData(node.id, sheetData);
    setActiveSessionId(node.id);
    saveActiveSessionId(node.id);
  }, [sessionTree, activeSessionId, buildSheetData, resetUndoable]);

  const handleSelectSession = useCallback((id: string) => {
    if (id === activeSessionId) return;

    // Save current session
    if (activeSessionId) {
      saveSessionData(activeSessionId, buildSheetData());
    }

    // Load target session
    const data = loadSessionData(id);
    if (data) {
      const resolved = applySheetData(data);
      resetUndoable({
        events: resolved.events,
        operators: resolved.operators,
        enemy: resolved.enemy,
        loadouts: resolved.loadouts,
        loadoutStats: resolved.loadoutStats,
        resourceConfigs: resolved.resourceConfigs,
      });
      setVisibleSkills(resolved.visibleSkills);
    } else {
      // Session data missing — reset to defaults
      setNextEventId(1);
      resetUndoable({
        events: [],
        operators: [...INITIAL_OPERATORS],
        enemy: DEFAULT_ENEMY,
        loadouts: INITIAL_LOADOUTS,
        loadoutStats: INITIAL_LOADOUT_STATS,
        resourceConfigs: {},
      });
      setVisibleSkills(INITIAL_VISIBLE);
    }

    setEditingEventId(null);
    setEditingSlotId(null);
    setEditingResourceKey(null);
    setContextMenu(null);
    setActiveSessionId(id);
    saveActiveSessionId(id);
  }, [activeSessionId, buildSheetData, resetUndoable]);

  const handleDeleteSession = useCallback((sessionIds: string[], _nodeId: string) => {
    for (const sid of sessionIds) {
      deleteSessionData(sid);
    }
    // If active session was deleted, switch to first remaining session
    if (activeSessionId && sessionIds.includes(activeSessionId)) {
      const remaining = sessionTree.nodes.find(
        (n) => n.type === 'session' && !sessionIds.includes(n.id),
      );
      if (remaining) {
        handleSelectSession(remaining.id);
      } else {
        // No sessions left — will need to create one after tree updates
        setActiveSessionId(null);
      }
    }
  }, [activeSessionId, sessionTree, handleSelectSession]);

  const handleExport = useCallback(() => {
    exportToFile(buildSheetData());
  }, [buildSheetData]);

  const handleImport = useCallback(async () => {
    const result = await importFromFile();
    if (!result.ok) {
      setWarningMessage(result.error);
      return;
    }
    const resolved = applySheetData(result.data);
    resetUndoable({
      events: resolved.events,
      operators: resolved.operators,
      enemy: resolved.enemy,
      loadouts: resolved.loadouts,
      loadoutStats: resolved.loadoutStats,
      resourceConfigs: resolved.resourceConfigs,
    });
    setVisibleSkills(resolved.visibleSkills);
    setEditingEventId(null);
    setEditingSlotId(null);
    setEditingResourceKey(null);
    setContextMenu(null);
  }, [resetUndoable]);

  const handleClear = useCallback(() => {
    setNextEventId(1);
    resetUndoable({
      events: [],
      operators: [...INITIAL_OPERATORS],
      enemy: DEFAULT_ENEMY,
      loadouts: INITIAL_LOADOUTS,
      loadoutStats: INITIAL_LOADOUT_STATS,
      resourceConfigs: {},
    });
    setVisibleSkills(INITIAL_VISIBLE);
    setEditingEventId(null);
    setEditingSlotId(null);
    setEditingResourceKey(null);
    setContextMenu(null);
    clearLocalStorage();
  }, [resetUndoable]);

  // ─── Zoom ────────────────────────────────────────────────────────────────
  const handleZoom = useCallback((deltaY: number) => {
    setZoom((z) => {
      const factor = deltaY > 0 ? 1 / 1.2 : 1.2;
      const next = Math.max(0.15, Math.min(20, z * factor));
      try { localStorage.setItem('zst-zoom', String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // ─── Skill visibility ───────────────────────────────────────────────────
  const handleToggleSkill = useCallback((slotId: string, skillType: string) => {
    setVisibleSkills((prev) => ({
      ...prev,
      [slotId]: {
        ...prev[slotId],
        [skillType]: !prev[slotId]?.[skillType as SkillType],
      },
    }));
  }, []);

  // ─── Event handlers (delegating to EventController) ─────────────────────
  const handleAddEvent = useCallback((
    ownerId: string,
    columnId: string,
    atFrame: number,
    defaultSkill: { name?: string; defaultActivationDuration?: number; defaultActiveDuration?: number; defaultCooldownDuration?: number; segments?: import('./consts/viewTypes').EventSegmentData[]; gaugeGain?: number; teamGaugeGain?: number; animationDuration?: number; comboTriggerColumnId?: string; operatorPotential?: number } | null,
  ) => {
    const ev = createEvent(ownerId, columnId, atFrame, defaultSkill);
    if (defaultSkill?.comboTriggerColumnId) ev.comboTriggerColumnId = defaultSkill.comboTriggerColumnId;
    setEvents((prev) => {
      if (wouldOverlapNonOverlappable(prev, ev, ev.startFrame)) return prev;
      return [...prev, ev];
    });
    setContextMenu(null);
  }, []);

  const handleUpdateEvent = useCallback((id: string, updates: Partial<TimelineEvent>) => {
    setEvents((prev) => {
      const target = prev.find((ev) => ev.id === id);
      if (!target) return prev;
      const merged = validateUpdate(prev, target, updates, activationWindowsRef.current);
      if (!merged) return prev;
      return prev.map((ev) => (ev.id === id ? merged : ev));
    });
  }, []);

  const handleMoveEvent = useCallback((id: string, newStartFrame: number) => {
    setEvents((prev) => {
      const target = prev.find((ev) => ev.id === id);
      if (!target) return prev;
      const clamped = validateMove(prev, target, newStartFrame, activationWindowsRef.current);
      if (clamped === target.startFrame) return prev;
      return prev.map((ev) => (ev.id === id ? { ...ev, startFrame: clamped } : ev));
    });
  }, []);

  const handleMoveEvents = useCallback((ids: string[], delta: number) => {
    setEvents((prev) => {
      const clampedDelta = validateBatchMoveDelta(prev, ids, delta, activationWindowsRef.current);
      if (clampedDelta === 0) return prev;
      const idSet = new Set(ids);
      return prev.map((ev) => idSet.has(ev.id) ? { ...ev, startFrame: ev.startFrame + clampedDelta } : ev);
    });
  }, []);

  const handleRemoveEvent = useCallback((id: string) => {
    setEvents((prev) => prev.filter((ev) => ev.id !== id));
    setEditingEventId((cur) => (cur === id ? null : cur));
    setContextMenu(null);
  }, []);

  const handleRemoveEvents = useCallback((ids: string[]) => {
    const idSet = new Set(ids);
    setEvents((prev) => prev.filter((ev) => !idSet.has(ev.id)));
    setEditingEventId((cur) => (cur && idSet.has(cur) ? null : cur));
    setContextMenu(null);
  }, []);

  const handleDuplicateEvents = useCallback((sourceEvents: TimelineEvent[], frameOffset: number): string[] => {
    const newIds: string[] = [];
    const clones: TimelineEvent[] = [];
    for (const src of sourceEvents) {
      const newId = genEventId();
      newIds.push(newId);
      clones.push({
        ...src,
        id: newId,
        startFrame: src.startFrame + frameOffset,
      });
    }
    setEvents((prev) => {
      // Validate none overlap
      const combined = [...prev, ...clones];
      for (const c of clones) {
        if (wouldOverlapNonOverlappable(combined, c, c.startFrame)) return prev;
      }
      return combined;
    });
    return newIds;
  }, []);

  /** Look up default durations for an event from its column definition. */
  const findDefaults = useCallback((ev: TimelineEvent) => {
    const col = columns.find((c): c is MiniTimeline =>
      c.type === 'mini-timeline' && c.ownerId === ev.ownerId && (
        c.columnId === ev.columnId || (c.matchColumnIds?.includes(ev.columnId) ?? false)
      ),
    );
    if (!col) return null;
    // Check eventVariants first (match by name)
    const variant = col.eventVariants?.find((v) => v.name === ev.name);
    if (variant) return variant;
    return col.defaultEvent ?? null;
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
      } : ev));
    });
    setContextMenu(null);
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
        activationDuration: defaults.segments!.reduce((sum, s) => sum + s.durationFrames, 0),
      } : ev));
    });
    setContextMenu(null);
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
        };
      });
      return changed ? result : prev;
    });
    setContextMenu(null);
  }, [findDefaults]);

  const handleRemoveFrame = useCallback((eventId: string, segmentIndex: number, frameIndex: number) => {
    setEvents((prev) => {
      const target = prev.find((ev) => ev.id === eventId);
      if (!target?.segments?.[segmentIndex]?.frames) return prev;
      const newSegments = target.segments.map((seg, si) => {
        if (si !== segmentIndex) return seg;
        return { ...seg, frames: seg.frames?.filter((_, fi) => fi !== frameIndex) };
      });
      return prev.map((ev) => (ev.id === eventId ? { ...ev, segments: newSegments } : ev));
    });
    setSelectedFrames((prev) => prev.filter((f) => !(f.eventId === eventId && f.segmentIndex === segmentIndex && f.frameIndex === frameIndex)));
  }, []);

  const handleRemoveFrames = useCallback((frames: SelectedFrame[]) => {
    // Group by eventId to handle index shifting correctly
    const byEvent = new Map<string, { segmentIndex: number; frameIndex: number }[]>();
    for (const f of frames) {
      const arr = byEvent.get(f.eventId) ?? [];
      arr.push({ segmentIndex: f.segmentIndex, frameIndex: f.frameIndex });
      byEvent.set(f.eventId, arr);
    }
    setEvents((prev) => prev.map((ev) => {
      const toRemove = byEvent.get(ev.id);
      if (!toRemove || !ev.segments) return ev;
      // Build a set of (segmentIndex, frameIndex) to remove
      const removeSet = new Set(toRemove.map((r) => `${r.segmentIndex}-${r.frameIndex}`));
      const newSegments = ev.segments.map((seg, si) => {
        if (!seg.frames) return seg;
        const filtered = seg.frames.filter((_, fi) => !removeSet.has(`${si}-${fi}`));
        return { ...seg, frames: filtered };
      });
      return { ...ev, segments: newSegments };
    }));
    setSelectedFrames([]);
  }, []);

  const handleAddSegment = useCallback((eventId: string, segmentLabel: string) => {
    setEvents((prev) => {
      const target = prev.find((ev) => ev.id === eventId);
      if (!target?.segments) return prev;
      // Find the column to get the full segment definition
      const col = columns.find((c) =>
        c.type === 'mini-timeline' && c.ownerId === target.ownerId && c.columnId === target.columnId,
      );
      if (col?.type !== 'mini-timeline') return prev;
      const fullSeg = col.defaultEvent?.segments?.find((s) => s.label === segmentLabel);
      if (!fullSeg) return prev;
      // Insert in order based on the full segment list
      const allLabels = col.defaultEvent!.segments!.map((s) => s.label);
      const newSegments = [...target.segments, fullSeg];
      newSegments.sort((a, b) => {
        const ai = allLabels.indexOf(a.label);
        const bi = allLabels.indexOf(b.label);
        return ai - bi;
      });
      const totalDuration = newSegments.reduce((sum, s) => sum + s.durationFrames, 0);
      return prev.map((ev) => (ev.id === eventId ? {
        ...ev,
        segments: newSegments,
        activationDuration: totalDuration,
        nonOverlappableRange: totalDuration,
      } : ev));
    });
  }, [columns]);

  const handleRemoveSegment = useCallback((eventId: string, segmentIndex: number) => {
    setEvents((prev) => {
      const target = prev.find((ev) => ev.id === eventId);
      if (!target?.segments || target.segments.length <= 1) return prev;
      const newSegments = target.segments.filter((_, si) => si !== segmentIndex);
      const totalDuration = newSegments.reduce((sum, s) => sum + s.durationFrames, 0);
      return prev.map((ev) => (ev.id === eventId ? {
        ...ev,
        segments: newSegments,
        activationDuration: totalDuration,
        nonOverlappableRange: totalDuration,
      } : ev));
    });
    // Clear any selected frames belonging to the removed segment
    setSelectedFrames((prev) => prev.filter((f) => !(f.eventId === eventId && f.segmentIndex === segmentIndex)));
  }, []);

  const handleAddFrame = useCallback((eventId: string, segmentIndex: number, frameOffsetFrame: number) => {
    setEvents((prev) => {
      const target = prev.find((ev) => ev.id === eventId);
      if (!target?.segments?.[segmentIndex]) return prev;
      // Find the full frame from the column's default segment
      const col = columns.find((c) =>
        c.type === 'mini-timeline' && c.ownerId === target.ownerId && c.columnId === target.columnId,
      );
      if (col?.type !== 'mini-timeline') return prev;
      const seg = target.segments[segmentIndex];
      const allDefaultSegs = col.defaultEvent?.segments;
      const defaultSeg = allDefaultSegs?.find((s) => s.label === seg.label) ?? allDefaultSegs?.[segmentIndex];
      const fullFrame = defaultSeg?.frames?.find((f) => f.offsetFrame === frameOffsetFrame);
      if (!fullFrame) return prev;
      // Already present?
      if (seg.frames?.some((f) => f.offsetFrame === frameOffsetFrame)) return prev;
      const newFrames = [...(seg.frames ?? []), fullFrame];
      // Sort by offsetFrame to maintain order
      newFrames.sort((a, b) => a.offsetFrame - b.offsetFrame);
      const newSegments = target.segments.map((s, si) =>
        si === segmentIndex ? { ...s, frames: newFrames } : s,
      );
      return prev.map((ev) => (ev.id === eventId ? { ...ev, segments: newSegments } : ev));
    });
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
  }, []);

  const handleMoveFrame = useCallback((eventId: string, segmentIndex: number, frameIndex: number, newOffsetFrame: number) => {
    setEvents((prev) => prev.map((ev) => {
      if (ev.id !== eventId || !ev.segments) return ev;
      const newSegments = ev.segments.map((seg, si) => {
        if (si !== segmentIndex || !seg.frames) return seg;
        const newFrames = seg.frames.map((f, fi) =>
          fi === frameIndex ? { ...f, offsetFrame: newOffsetFrame } : f,
        );
        return { ...seg, frames: newFrames };
      });
      return { ...ev, segments: newSegments };
    }));
  }, []);

  // ─── Loadout & operator handlers ────────────────────────────────────────
  const handleLoadoutChange = useCallback((slotId: string, state: OperatorLoadoutState) => {
    setUndoable((prev) => ({
      ...prev,
      loadouts: { ...prev.loadouts, [slotId]: state },
    }));
  }, [setUndoable]);

  const handleStatsChange = useCallback((slotId: string, stats: LoadoutStats) => {
    setUndoable((prev) => {
      const prevStats = prev.loadoutStats[slotId];
      let nextResourceConfigs = prev.resourceConfigs;
      // When potential changes, update ultimate resource config max
      if (prevStats && prevStats.potential !== stats.potential) {
        const slotIdx = SLOT_IDS.indexOf(slotId);
        const op = slotIdx >= 0 ? prev.operators[slotIdx] : null;
        if (op) {
          const newCost = getUltimateEnergyCostForPotential(op.id, stats.potential as 0|1|2|3|4|5);
          if (newCost != null) {
            const ultKey = `${slotId}-ultimate`;
            const existing = prev.resourceConfigs[ultKey];
            if (existing && existing.max !== newCost) {
              nextResourceConfigs = { ...prev.resourceConfigs, [ultKey]: { ...existing, max: newCost } };
            } else if (!existing && newCost !== op.ultimateEnergyCost) {
              nextResourceConfigs = { ...prev.resourceConfigs, [ultKey]: { startValue: 0, max: newCost, regenPerSecond: 0 } };
            }
          }
        }
      }
      return {
        ...prev,
        loadoutStats: { ...prev.loadoutStats, [slotId]: stats },
        resourceConfigs: nextResourceConfigs,
      };
    });
  }, [setUndoable]);

  const handleSwapOperator = useCallback((slotId: string, newOperatorId: string | null) => {
    const slotIndex = SLOT_IDS.indexOf(slotId);
    if (slotIndex < 0) return;

    const newOp = newOperatorId ? ALL_OPERATORS.find((op) => op.id === newOperatorId) ?? null : null;

    setUndoable((prev) => {
      // Update operators
      let nextOperators: (Operator | null)[];
      if (newOperatorId === null) {
        nextOperators = [...prev.operators];
        nextOperators[slotIndex] = null;
      } else if (!newOp) {
        return prev;
      } else {
        nextOperators = [...prev.operators];
        const existingIdx = nextOperators.findIndex((op) => op?.id === newOperatorId);
        if (existingIdx >= 0 && existingIdx !== slotIndex) {
          nextOperators[existingIdx] = nextOperators[slotIndex];
        }
        nextOperators[slotIndex] = newOp;
      }

      // Update loadouts (clear incompatible weapon)
      let nextLoadouts = prev.loadouts;
      const current = prev.loadouts[slotId];
      if (current.weaponName !== null) {
        const equippedWeapon = WEAPONS.find((w) => w.name === current.weaponName);
        if (equippedWeapon && !CombatLoadout.isWeaponCompatible(newOp, equippedWeapon)) {
          nextLoadouts = { ...prev.loadouts, [slotId]: { ...current, weaponName: null } };
        }
      }

      // Reset loadout stats to rarity-appropriate defaults when operator changes
      let nextLoadoutStats = prev.loadoutStats;
      if (newOp) {
        nextLoadoutStats = { ...prev.loadoutStats, [slotId]: getDefaultLoadoutStats(newOp) };
      }

      return { ...prev, operators: nextOperators, loadouts: nextLoadouts, loadoutStats: nextLoadoutStats };
    });
  }, [setUndoable]);

  const handleSwapEnemy = useCallback((enemyId: string) => {
    const found = ALL_ENEMIES.find((e) => e.id === enemyId);
    if (found) setEnemy(found);
  }, []);

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="app">
      <AppBar
        onClear={handleClear}
        onExport={handleExport}
        onImport={handleImport}
        onDevlog={() => setDevlogOpen(true)}
        onKeys={() => setKeysOpen((p) => !p)}
      />

      <div ref={appBodyRef} className="app-body" style={{ '--tl-flex': `${splitPct} 0 0`, '--sheet-flex': `${100 - splitPct} 0 0` } as React.CSSProperties}>
        <SessionSidebar
          tree={sessionTree}
          activeSessionId={activeSessionId}
          onTreeChange={handleSessionTreeChange}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
          onDeleteSession={handleDeleteSession}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={handleToggleSidebar}
          onWarning={setWarningMessage}
        />

        <CombatPlanner
          slots={slots}
          enemy={enemy}
          events={processedEvents}
          columns={columns}
          visibleSkills={visibleSkills}
          loadouts={loadouts}
          zoom={zoom}
          onZoom={handleZoom}
          onToggleSkill={handleToggleSkill}
          onAddEvent={handleAddEvent}
          onMoveEvent={handleMoveEvent}
          onMoveEvents={handleMoveEvents}
          onContextMenu={setContextMenu}
          onEditEvent={(id, context) => {
            if (id !== null) { setEditingEventId(id); setEditContext(context ?? null); setEditingSlotId(null); setEditingResourceKey(null); setSelectedFrames([]); setInfoPaneClosing(false); }
            else if (!infoPanePinned) {
              if (editingEventId || editingSlotId || editingResourceKey) setInfoPaneClosing(true);
              else { setEditingEventId(null); setEditContext(null); setSelectedFrames([]); }
            }
          }}
          onRemoveEvent={handleRemoveEvent}
          onRemoveEvents={handleRemoveEvents}
          onResetEvent={handleResetEvent}
          onResetEvents={handleResetEvents}
          onResetSegments={handleResetSegments}
          onResetFrames={handleResetFrames}
          onLoadoutChange={handleLoadoutChange}
          onEditLoadout={(slotId) => {
            if (editingSlotId === slotId) { setInfoPaneClosing(true); }
            else { setEditingSlotId(slotId); setEditingEventId(null); setEditingResourceKey(null); setInfoPaneClosing(false); }
          }}
          allOperators={ALL_OPERATORS}
          onSwapOperator={handleSwapOperator}
          allEnemies={ALL_ENEMIES}
          onSwapEnemy={handleSwapEnemy}
          activationWindows={activationWindows}
          resourceGraphs={resourceGraphs}
          onEditResource={(key) => { setEditingResourceKey(key); setEditingEventId(null); setEditingSlotId(null); }}
          onBatchStart={beginBatch}
          onBatchEnd={endBatch}
          onFrameClick={handleFrameClick}
          onRemoveFrame={handleRemoveFrame}
          onRemoveFrames={handleRemoveFrames}
          onRemoveSegment={handleRemoveSegment}
          onAddSegment={handleAddSegment}
          onAddFrame={handleAddFrame}
          onMoveFrame={handleMoveFrame}
          selectedFrames={selectedFrames}
          onSelectedFramesChange={(frames) => {
            setSelectedFrames(frames);
          }}
          onLoadoutRowHeight={setLoadoutRowHeight}
          onScrollRef={handleTlScrollRef}
          onScroll={handleTimelineScroll}
          onHoverFrame={setHoverFrame}
          hideScrollbar={scrollSynced}
          onDuplicateEvents={handleDuplicateEvents}
        />

        <div
          className={`panel-resizer${scrollSynced ? ' panel-resizer--synced' : ''}`}
          onMouseDown={handleResizerMouseDown}
          title="Drag to resize"
        >
          <div className="panel-resizer-buttons">
            <button
              className={`panel-resizer-btn${scrollSynced ? ' panel-resizer-btn--sync-active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                setScrollSynced((p) => {
                  if (!p && tlScrollRef.current && dmgScrollRef.current) {
                    dmgScrollRef.current.scrollTop = tlScrollRef.current.scrollTop;
                  }
                  return !p;
                });
              }}
              onMouseDown={(e) => e.stopPropagation()}
              title={scrollSynced ? 'Desync scroll' : 'Sync scroll'}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                {scrollSynced ? (
                  <>
                    <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1z"/>
                    <path d="M8 13h8v-2H8v2z"/>
                    <path d="M17 7h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/>
                  </>
                ) : (
                  <>
                    <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1z"/>
                    <path d="M17 7h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/>
                  </>
                )}
              </svg>
            </button>
            <button
              className="panel-resizer-btn"
              onClick={(e) => { e.stopPropagation(); setSplitPct(50); }}
              onMouseDown={(e) => e.stopPropagation()}
              title="Reset to 50/50"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
              </svg>
            </button>
          </div>
        </div>

        <CombatSheet
          slots={slots}
          events={processedEvents}
          columns={columns}
          enemy={enemy}
          loadoutStats={loadoutStats}
          zoom={zoom}
          loadoutRowHeight={loadoutRowHeight}
          selectedFrames={selectedFrames}
          hoverFrame={hoverFrame}
          onScrollRef={handleDmgScrollRef}
          onScroll={handleSheetScroll}
          onZoom={handleZoom}
          compact={!scrollSynced}
        />

      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}

      {editingEvent ? (
        <InformationPane
          mode="event"
          event={editingEvent}
          operators={ALL_OPERATORS}
          slots={slots}
          enemy={enemy}
          columns={columns}
          onUpdate={handleUpdateEvent}
          onRemove={handleRemoveEvent}
          onClose={() => { setEditingEventId(null); setSelectedFrames([]); setInfoPaneClosing(false); setInfoPanePinned(false); }}
          selectedFrames={selectedFrames}
          readOnly={editingEventReadOnly}
          editContext={editContext}
          triggerClose={infoPaneClosing}
          pinned={infoPanePinned}
          onTogglePin={() => setInfoPanePinned((p) => !p)}
        />
      ) : editingSlot && editingSlot.operator ? (
        <InformationPane
          mode="loadout"
          operator={editingSlot.operator}
          loadout={loadouts[editingSlot.slotId]}
          stats={loadoutStats[editingSlot.slotId]}
          onStatsChange={(s) => handleStatsChange(editingSlot.slotId, s)}
          onClose={() => { setEditingSlotId(null); setInfoPaneClosing(false); setInfoPanePinned(false); }}
          triggerClose={infoPaneClosing}
          pinned={infoPanePinned}
          onTogglePin={() => setInfoPanePinned((p) => !p)}
        />
      ) : editingResourceCol && editingResourceConfig ? (
        <InformationPane
          mode="resource"
          label={editingResourceCol.label}
          color={editingResourceCol.color}
          config={editingResourceConfig}
          onChange={(cfg) => handleResourceConfigChange(editingResourceKey!, cfg)}
          onClose={() => { setEditingResourceKey(null); setInfoPaneClosing(false); setInfoPanePinned(false); }}
          triggerClose={infoPaneClosing}
          pinned={infoPanePinned}
          onTogglePin={() => setInfoPanePinned((p) => !p)}
        />
      ) : null}

      <DevlogModal open={devlogOpen} onClose={() => setDevlogOpen(false)} />

      {keysOpen && <KeyboardShortcutsModal onClose={() => setKeysOpen(false)} />}

      {warningMessage && <WarningModal message={warningMessage} onClose={() => setWarningMessage(null)} />}
    </div>
  );
}
