import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useHistory } from './utils/useHistory';
import TimelineGrid from './view/TimelineGrid';
import ContextMenu from './view/ContextMenu';
import InformationPane from './view/InformationPane';
import LoadoutEditPanel, { LoadoutStats, DEFAULT_LOADOUT_STATS } from './view/LoadoutEditPanel';
import { OperatorLoadoutState, EMPTY_LOADOUT } from './view/OperatorLoadoutHeader';
import { ALL_OPERATORS } from './model/operators/operatorRegistry';
import { ALL_ENEMIES, DEFAULT_ENEMY } from './utils/enemies';
import { WEAPONS } from './utils/loadoutRegistry';
import { Operator, TimelineEvent, VisibleSkills, ContextMenuState, SkillType, SelectedFrame } from "./consts/viewTypes";
import { CombatLoadout, WindowsMap } from './controller/combat-loadout';
import { COMMON_OWNER_ID, COMMON_COLUMN_IDS } from './controller/slot/commonSlotController';
import { ResourcePoint } from './controller/timeline/resourceTimeline';
import { TOTAL_FRAMES, FPS } from './utils/timeline';
import {
  serializeSheet,
  loadFromLocalStorage,
  saveToLocalStorage,
  clearLocalStorage,
  exportToFile,
  importFromFile,
  SheetData,
} from './utils/sheetStorage';
import { processInflictionEvents } from './utils/processInflictions';
import { REACTION_COLUMN_IDS, INFLICTION_TO_REACTION } from './model/channels';
import { MeltingFlameController } from './controller/timeline/meltingFlameController';
import { ComboSkillEventController } from './controller/timeline/comboSkillEventController';
import { buildColumns } from './controller/timeline/columnBuilder';
import DevlogModal from './view/DevlogModal';
import './App.css';

const NUM_SLOTS = 4;
const SLOT_IDS = Array.from({ length: NUM_SLOTS }, (_, i) => `slot-${i}`);

const INITIAL_OPERATORS: (Operator | null)[] = ALL_OPERATORS.slice(0, NUM_SLOTS);

const INITIAL_VISIBLE: VisibleSkills = Object.fromEntries(
  SLOT_IDS.map((slotId, i) => [
    slotId,
    {
      basic:   true,
      battle:  true,
      combo:   true,
      ultimate: true,
    } satisfies Record<SkillType, boolean>,
  ]),
);

const INITIAL_LOADOUTS: Record<string, OperatorLoadoutState> = Object.fromEntries(
  SLOT_IDS.map((id) => [id, EMPTY_LOADOUT]),
);
const INITIAL_LOADOUT_STATS: Record<string, LoadoutStats> = Object.fromEntries(
  SLOT_IDS.map((id) => [id, DEFAULT_LOADOUT_STATS]),
);

let _id = 1;
const genId = () => `ev-${_id++}`;

function resolveOperatorId(id: string | null): Operator | null {
  if (!id) return null;
  return ALL_OPERATORS.find((op) => op.id === id) ?? null;
}

function applySheetData(data: SheetData) {
  _id = data.nextEventId;
  return {
    operators: data.operatorIds.map(resolveOperatorId),
    enemy: ALL_ENEMIES.find((e) => e.id === data.enemyId) ?? DEFAULT_ENEMY,
    events: data.events,
    loadouts: { ...INITIAL_LOADOUTS, ...data.loadouts },
    loadoutStats: { ...INITIAL_LOADOUT_STATS, ...data.loadoutStats },
    visibleSkills: { ...INITIAL_VISIBLE, ...data.visibleSkills },
  };
}

// Try loading saved data on module init (before first render)
function loadInitialState() {
  const result = loadFromLocalStorage();
  if (result && result.ok) {
    return { loaded: applySheetData(result.data), error: null };
  }
  if (result && !result.ok) {
    return { loaded: null, error: result.error };
  }
  return { loaded: null, error: null };
}

const initialLoad = loadInitialState();

export default function App() {
  const [operators,      setOperators]      = useState<(Operator | null)[]>(
    () => initialLoad.loaded?.operators ?? [...INITIAL_OPERATORS],
  );
  const [zoom,           setZoom]           = useState<number>(() => {
    try { const v = localStorage.getItem('zst-zoom'); return v ? Number(v) : 0.5; } catch { return 0.5; }
  });
  const { state: events, setState: setEvents, resetState: resetEvents, beginBatch, endBatch, undo, redo } = useHistory<TimelineEvent[]>(
    initialLoad.loaded?.events ?? [],
  );
  const [visibleSkills,  setVisibleSkills]  = useState<VisibleSkills>(
    initialLoad.loaded?.visibleSkills ?? INITIAL_VISIBLE,
  );
  const [contextMenu,    setContextMenu]    = useState<ContextMenuState | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [loadouts,       setLoadouts]       = useState<Record<string, OperatorLoadoutState>>(
    () => initialLoad.loaded?.loadouts ?? INITIAL_LOADOUTS,
  );
  const [loadoutStats,   setLoadoutStats]   = useState<Record<string, LoadoutStats>>(
    () => initialLoad.loaded?.loadoutStats ?? INITIAL_LOADOUT_STATS,
  );
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [enemy,          setEnemy]          = useState(
    initialLoad.loaded?.enemy ?? DEFAULT_ENEMY,
  );
  const [selectedFrame,  setSelectedFrame]  = useState<SelectedFrame | null>(null);
  const [devlogOpen,     setDevlogOpen]     = useState(false);
  const [keysOpen,       setKeysOpen]       = useState(false);
  const [warningMessage, setWarningMessage] = useState<string | null>(initialLoad.error);

  // ─── Processed events (refresh + consumption clamping) ───────────────────
  // Raw events are stored in `events` (via useHistory). Processed events apply
  // same-element duration refresh and arts reaction consumption clamping. The
  // view renders processedEvents; the edit panel uses raw events.
  const processedEvents = useMemo(() => processInflictionEvents(events), [events]);

  // ─── Build current sheet data for saving ─────────────────────────────────
  const buildSheetData = useCallback((): SheetData => {
    return serializeSheet(
      operators.map((op) => op?.id ?? null),
      enemy.id,
      events,
      loadouts,
      loadoutStats,
      visibleSkills,
      _id,
    );
  }, [operators, enemy, events, loadouts, loadoutStats, visibleSkills]);

  // ─── Auto-save to localStorage ───────────────────────────────────────────
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveToLocalStorage(buildSheetData());
    }, 500);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [buildSheetData]);

  // ─── Export / Import ─────────────────────────────────────────────────────
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
    setOperators(resolved.operators);
    setEnemy(resolved.enemy);
    resetEvents(resolved.events);
    setLoadouts(resolved.loadouts);
    setLoadoutStats(resolved.loadoutStats);
    setVisibleSkills(resolved.visibleSkills);
    setEditingEventId(null);
    setEditingSlotId(null);
    setContextMenu(null);
  }, [resetEvents]);

  // ─── Clear sheet ─────────────────────────────────────────────────────────
  const handleClear = useCallback(() => {
    _id = 1;
    setOperators([...INITIAL_OPERATORS]);
    setEnemy(DEFAULT_ENEMY);
    resetEvents([]);
    setLoadouts(INITIAL_LOADOUTS);
    setLoadoutStats(INITIAL_LOADOUT_STATS);
    setVisibleSkills(INITIAL_VISIBLE);
    setEditingEventId(null);
    setEditingSlotId(null);
    setContextMenu(null);
    clearLocalStorage();
  }, [resetEvents]);

  // ─── CombatLoadout controller ────────────────────────────────────────────
  const combatLoadoutRef = useRef<CombatLoadout>(null!);
  if (combatLoadoutRef.current === null) {
    combatLoadoutRef.current = new CombatLoadout();
    combatLoadoutRef.current.setSlotIds(SLOT_IDS);
  }
  const [activationWindows, setActivationWindows] = useState<WindowsMap>(new Map());
  const activationWindowsRef = useRef<WindowsMap>(activationWindows);
  activationWindowsRef.current = activationWindows;

  // Subscribe to window changes
  useEffect(() => {
    return combatLoadoutRef.current.subscribe(setActivationWindows);
  }, []);

  // Sync operators into loadout
  useEffect(() => {
    operators.forEach((op, i) => {
      combatLoadoutRef.current.setOperator(i, op?.id ?? null);
    });
  }, [operators]);

  // Recompute windows when events change
  useEffect(() => {
    combatLoadoutRef.current.recomputeWindows(events);
  }, [events]);

  // ─── Resource graphs ───────────────────────────────────────────────────────
  type ResourceGraphData = { points: ReadonlyArray<ResourcePoint>; min: number; max: number };
  const [resourceGraphs, setResourceGraphs] = useState<Map<string, ResourceGraphData>>(new Map());

  useEffect(() => {
    const sp = combatLoadoutRef.current.commonSlot.skillPoints;
    const key = `${COMMON_OWNER_ID}-${COMMON_COLUMN_IDS.SKILL_POINTS}`;
    const update = (points: ReadonlyArray<ResourcePoint>) => {
      setResourceGraphs((prev) => {
        const next = new Map(prev);
        next.set(key, { points, min: sp.min, max: sp.max });
        return next;
      });
    };
    // Set initial graph
    update(sp.getGraph());
    return sp.onGraphChange(update);
  }, []);

  // ─── Ultimate energy graphs (computed from events + operator data) ─────────
  const ultimateGraphs = useMemo(() => {
    const ULT_CHARGE_PER_FRAME = 10 / FPS; // 10 energy/sec
    const graphs = new Map<string, ResourceGraphData>();

    for (let i = 0; i < NUM_SLOTS; i++) {
      const op = operators[i];
      if (!op) continue;
      const slotId = SLOT_IDS[i];
      const key = `${slotId}-ultimate`;
      const max = op.ultimateEnergyCost;
      const ultEvents = events
        .filter((ev) => ev.ownerId === slotId && ev.columnId === 'ultimate')
        .sort((a, b) => a.startFrame - b.startFrame);

      const points: ResourcePoint[] = [];
      let value = 0;
      let lastFrame = 0;
      points.push({ frame: 0, value });

      for (const ev of ultEvents) {
        const regenFrames = ev.startFrame - lastFrame;
        const preConsume = Math.min(max, value + regenFrames * ULT_CHARGE_PER_FRAME);

        if (preConsume !== value || ev.startFrame !== lastFrame) {
          if (preConsume !== points[points.length - 1].value || ev.startFrame !== points[points.length - 1].frame) {
            points.push({ frame: ev.startFrame, value: preConsume });
          }
        }

        const postConsume = Math.max(0, preConsume - max);
        points.push({ frame: ev.startFrame, value: postConsume });
        value = postConsume;
        lastFrame = ev.startFrame;
      }

      // Regen to end
      const endValue = Math.min(max, value + (TOTAL_FRAMES - lastFrame) * ULT_CHARGE_PER_FRAME);
      if (endValue !== value && ULT_CHARGE_PER_FRAME > 0 && value < max) {
        const framesToMax = Math.ceil((max - value) / ULT_CHARGE_PER_FRAME);
        const maxFrame = Math.min(lastFrame + framesToMax, TOTAL_FRAMES);
        if (maxFrame < TOTAL_FRAMES) {
          points.push({ frame: maxFrame, value: max });
        }
      }
      points.push({ frame: TOTAL_FRAMES, value: endValue });

      graphs.set(key, { points, min: 0, max });
    }
    return graphs;
  }, [operators, events]);

  // Merge SP + ultimate graphs
  const mergedResourceGraphs = useMemo(() => {
    const merged = new Map(resourceGraphs);
    for (const [key, data] of Array.from(ultimateGraphs)) {
      merged.set(key, data);
    }
    return merged;
  }, [resourceGraphs, ultimateGraphs]);

  // ─── Undo / Redo ────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && e.shiftKey) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  const handleSwapEnemy = useCallback((enemyId: string) => {
    const found = ALL_ENEMIES.find((e) => e.id === enemyId);
    if (found) setEnemy(found);
  }, []);

  // ─── Zoom ──────────────────────────────────────────────────────────────────
  const handleZoom = useCallback((deltaY: number) => {
    setZoom((z) => {
      const factor = deltaY > 0 ? 1 / 1.2 : 1.2;
      const next = Math.max(0.15, Math.min(20, z * factor));
      try { localStorage.setItem('zst-zoom', String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // ─── Skill visibility (keyed by slot ID) ─────────────────────────────────
  const handleToggleSkill = useCallback((slotId: string, skillType: string) => {
    setVisibleSkills((prev) => ({
      ...prev,
      [slotId]: {
        ...prev[slotId],
        [skillType]: !prev[slotId]?.[skillType as SkillType],
      },
    }));
  }, []);

  // ─── Non-overlappable range helpers ────────────────────────────────────────

  const getRange = (ev: TimelineEvent): number =>
    ev.nonOverlappableRange
    ?? (ev.segments ? ev.segments.reduce((sum, s) => sum + s.durationFrames, 0) : 0);

  /**
   * Returns true if placing `ev` at `startFrame` would conflict with a sibling's
   * non-overlappable range, or if `ev`'s own range would cover a sibling.
   */
  const wouldOverlapNonOverlappable = (
    allEvents: TimelineEvent[],
    ev: TimelineEvent,
    startFrame: number,
  ): boolean => {
    const evRange = getRange(ev);
    for (const sib of allEvents) {
      if (sib.id === ev.id || sib.ownerId !== ev.ownerId || sib.columnId !== ev.columnId) continue;
      const sibRange = getRange(sib);
      if (sibRange > 0 && startFrame >= sib.startFrame && startFrame < sib.startFrame + sibRange) return true;
      if (evRange > 0 && sib.startFrame >= startFrame && sib.startFrame < startFrame + evRange) return true;
    }
    return false;
  };

  /**
   * Clamp `desiredFrame` so that `ev` doesn't overlap any sibling's non-overlappable range.
   * Returns the closest valid frame in the direction of `desiredFrame` from `ev.startFrame`.
   */
  const clampNonOverlappable = (
    allEvents: TimelineEvent[],
    ev: TimelineEvent,
    desiredFrame: number,
  ): number => {
    const evRange = getRange(ev);
    if (evRange === 0) return desiredFrame;
    let result = desiredFrame;
    for (const sib of allEvents) {
      if (sib.id === ev.id || sib.ownerId !== ev.ownerId || sib.columnId !== ev.columnId) continue;
      const sibRange = getRange(sib);
      if (sibRange === 0 && evRange === 0) continue;
      // Check if [result, result+evRange) overlaps [sib.startFrame, sib.startFrame+sibRange)
      const evEnd = result + evRange;
      const sibEnd = sib.startFrame + sibRange;
      if (evEnd > sib.startFrame && result < sibEnd) {
        // Overlap detected — clamp to nearest edge based on direction
        if (desiredFrame < ev.startFrame) {
          // Moving up: clamp to just after sibling ends
          result = Math.max(result, sibEnd);
        } else {
          // Moving down: clamp to just before sibling starts
          result = Math.min(result, sib.startFrame - evRange);
        }
      }
    }
    return Math.max(0, result);
  };

  // ─── Events ───────────────────────────────────────────────────────────────
  const handleAddEvent = useCallback((
    ownerId: string,
    columnId: string,
    atFrame: number,
    defaultSkill: { name?: string; defaultActivationDuration?: number; defaultActiveDuration?: number; defaultCooldownDuration?: number; segments?: import('./consts/viewTypes').EventSegmentData[] } | null,
  ) => {
    const isForced = ownerId === 'enemy' && REACTION_COLUMN_IDS.has(columnId);
    const ev: TimelineEvent = {
      id:                genId(),
      ownerId,
      columnId,
      startFrame:        atFrame,
      activationDuration:    defaultSkill?.defaultActivationDuration   ?? 120,
      activeDuration: defaultSkill?.defaultActiveDuration ?? 0,
      cooldownDuration:  defaultSkill?.defaultCooldownDuration  ?? 0,
      ...(defaultSkill?.name ? { name: defaultSkill.name } : {}),
      ...(isForced ? { isForced: true } : {}),
      ...(defaultSkill?.segments ? {
        segments: defaultSkill.segments,
        nonOverlappableRange: defaultSkill.segments.reduce((sum, s) => sum + s.durationFrames, 0),
      } : {}),
    };

    // Infliction events are always stored as-is. Arts reactions are derived
    // automatically in processInflictionEvents when cross-element overlaps
    // exist, so deleting an infliction naturally removes its reaction.
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
      let validated = MeltingFlameController.validateUpdate(prev, target, updates);
      validated = ComboSkillEventController.validateUpdate(target, validated, activationWindowsRef.current);
      const merged = { ...target, ...validated };
      if (wouldOverlapNonOverlappable(prev, merged, merged.startFrame)) return prev;
      return prev.map((ev) => (ev.id === id ? merged : ev));
    });
  }, []);

  const handleMoveEvent = useCallback((id: string, newStartFrame: number) => {
    setEvents((prev) => {
      const target = prev.find((ev) => ev.id === id);
      if (!target) return prev;
      let clamped = MeltingFlameController.validateMove(prev, target, newStartFrame);
      clamped = ComboSkillEventController.validateMove(target, clamped, activationWindowsRef.current);
      clamped = clampNonOverlappable(prev, target, clamped);
      if (clamped === target.startFrame) return prev;
      return prev.map((ev) => (ev.id === id ? { ...ev, startFrame: clamped } : ev));
    });
  }, []);

  const handleRemoveEvent = useCallback((id: string) => {
    setEvents((prev) => prev.filter((ev) => ev.id !== id));
    setEditingEventId((cur) => (cur === id ? null : cur));
    setContextMenu(null);
  }, []);

  const handleFrameClick = useCallback((eventId: string, segmentIndex: number, frameIndex: number) => {
    setSelectedFrame((prev) => {
      if (prev && prev.eventId === eventId && prev.segmentIndex === segmentIndex && prev.frameIndex === frameIndex) {
        return null; // toggle off
      }
      return { eventId, segmentIndex, frameIndex };
    });
    setEditingEventId(eventId);
  }, []);

  const handleLoadoutChange = useCallback((slotId: string, state: OperatorLoadoutState) => {
    setLoadouts((prev) => ({ ...prev, [slotId]: state }));
  }, []);

  const handleStatsChange = useCallback((slotId: string, stats: LoadoutStats) => {
    setLoadoutStats((prev) => ({ ...prev, [slotId]: stats }));
  }, []);

  const handleSwapOperator = useCallback((slotId: string, newOperatorId: string | null) => {
    const slotIndex = SLOT_IDS.indexOf(slotId);
    if (slotIndex < 0) return;

    const newOp = newOperatorId ? ALL_OPERATORS.find((op) => op.id === newOperatorId) ?? null : null;

    setOperators((prev) => {
      if (newOperatorId === null) {
        const next = [...prev];
        next[slotIndex] = null;
        return next;
      }
      if (!newOp) return prev;
      const next = [...prev];
      const existingIdx = next.findIndex((op) => op?.id === newOperatorId);
      if (existingIdx >= 0 && existingIdx !== slotIndex) {
        next[existingIdx] = next[slotIndex];
      }
      next[slotIndex] = newOp;
      return next;
    });

    // Reset weapon if the new operator can't use the currently equipped weapon type
    setLoadouts((prev) => {
      const current = prev[slotId];
      if (current.weaponIdx === null) return prev;
      const equippedWeapon = WEAPONS[current.weaponIdx];
      if (!equippedWeapon) return prev;
      if (!CombatLoadout.isWeaponCompatible(newOp, equippedWeapon)) {
        return { ...prev, [slotId]: { ...current, weaponIdx: null } };
      }
      return prev;
    });
  }, []);

  // ─── Build slot descriptors for TimelineGrid ─────────────────────────────
  const slots = SLOT_IDS.map((slotId, i) => ({
    slotId,
    operator: operators[i] ?? null,
  }));

  const columns = useMemo(
    () => buildColumns(slots, enemy, visibleSkills),
    [slots, enemy, visibleSkills],
  );

  const editingEvent = editingEventId
    ? events.find((e) => e.id === editingEventId) ?? null
    : null;

  const editingSlot = editingSlotId
    ? slots.find((s) => s.slotId === editingSlotId) ?? null
    : null;

  return (
    <div className="app">
      {/* App bar */}
      <div className="app-bar">
        <div className="app-brand">
          <span className="brand-hex">&#x2B21;</span>
          <div className="brand-text">
            <span className="brand-title">ENDFIELD</span>
            <span className="brand-sub">ZERO SANITY TIMELINE</span>
          </div>
        </div>

        <div className="app-bar-divider" />

        <button className="btn-clear" onClick={handleClear}>
          CLEAR
        </button>
        <button className="btn-devlog" onClick={handleExport}>
          EXPORT
        </button>
        <button className="btn-devlog" onClick={handleImport}>
          IMPORT
        </button>

        <div className="app-bar-right">
          <span className="wip-badge">WIP</span>
          <button className="btn-devlog" onClick={() => setDevlogOpen(true)}>
            DEVLOG
          </button>

          <button className="btn-keys" onClick={() => setKeysOpen((p) => !p)}>
            ?
          </button>
          <a
            className="github-link"
            href="https://github.com/mitchell-ma/zero-sanity-timeline"
            target="_blank"
            rel="noopener noreferrer"
            title="View on GitHub"
          >
            <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
            </svg>
          </a>
        </div>
      </div>

      {/* Timeline */}
      <TimelineGrid
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
        onContextMenu={setContextMenu}
        onEditEvent={(id) => { setEditingEventId(id); setSelectedFrame(null); }}
        onRemoveEvent={handleRemoveEvent}
        onLoadoutChange={handleLoadoutChange}
        onEditLoadout={setEditingSlotId}
        allOperators={ALL_OPERATORS}
        onSwapOperator={handleSwapOperator}
        allEnemies={ALL_ENEMIES}
        onSwapEnemy={handleSwapEnemy}
        activationWindows={activationWindows}
        resourceGraphs={mergedResourceGraphs}
        onBatchStart={beginBatch}
        onBatchEnd={endBatch}
        onFrameClick={handleFrameClick}
        selectedFrame={selectedFrame}
      />

      {/* Loadout edit panel (left side) */}
      {editingSlot && editingSlot.operator && (
        <LoadoutEditPanel
          operator={editingSlot.operator}
          loadout={loadouts[editingSlot.slotId]}
          stats={loadoutStats[editingSlot.slotId]}
          onStatsChange={(s) => handleStatsChange(editingSlot.slotId, s)}
          onClose={() => setEditingSlotId(null)}
        />
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}

      {editingEvent && (
        <InformationPane
          event={editingEvent}
          operators={ALL_OPERATORS}
          slots={slots}
          enemy={enemy}
          onUpdate={handleUpdateEvent}
          onRemove={handleRemoveEvent}
          onClose={() => { setEditingEventId(null); setSelectedFrame(null); }}
          selectedFrame={selectedFrame}
        />
      )}

      <DevlogModal open={devlogOpen} onClose={() => setDevlogOpen(false)} />

      {keysOpen && (
        <div className="devlog-overlay" onClick={() => setKeysOpen(false)}>
          <div className="keys-modal" onClick={(e) => e.stopPropagation()}>
            <div className="devlog-header">
              <span className="devlog-title">KEYBOARD CONTROLS</span>
              <button className="devlog-close" onClick={() => setKeysOpen(false)}>&times;</button>
            </div>
            <div className="keys-body">
              <div className="keys-row"><span>Zoom in/out</span><kbd>Shift</kbd> + <kbd>Scroll</kbd></div>
              <div className="keys-row"><span>Pan timeline</span><kbd>Scroll</kbd></div>
              <div className="keys-row"><span>Undo</span><kbd>Ctrl</kbd> + <kbd>Z</kbd></div>
              <div className="keys-row"><span>Redo</span><kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd></div>
              <div className="keys-row"><span>Select all events</span><kbd>Ctrl</kbd> + <kbd>A</kbd></div>
              <div className="keys-row"><span>Multi-select</span><kbd>Ctrl</kbd> + <kbd>Click</kbd></div>
              <div className="keys-row"><span>Context menu</span><kbd>Right-click</kbd></div>
              <div className="keys-row"><span>Edit event</span><kbd>Double-click</kbd></div>
              <div className="keys-row"><span>Move event / Marquee select</span><kbd>Drag</kbd></div>
            </div>
          </div>
        </div>
      )}

      {/* Warning modal for load errors */}
      {warningMessage && (
        <div className="devlog-overlay" onClick={() => setWarningMessage(null)}>
          <div className="devlog-modal warning-modal" onClick={(e) => e.stopPropagation()}>
            <div className="devlog-header">
              <span className="devlog-title warning-title">LOAD WARNING</span>
              <button className="devlog-close" onClick={() => setWarningMessage(null)}>&times;</button>
            </div>
            <div className="devlog-body">
              <p className="warning-text">Failed to restore saved sheet data. The sheet has been reset to defaults.</p>
              <div className="warning-detail">{warningMessage}</div>
            </div>
            <div className="warning-footer">
              <button className="btn-warning-ok" onClick={() => setWarningMessage(null)}>OK</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
