import { useState, useCallback, useMemo } from 'react';
import { useHistory } from './utils/useHistory';
import TimelineGrid from './view/TimelineGrid';
import ContextMenu from './view/ContextMenu';
import InformationPane, { LoadoutStats, DEFAULT_LOADOUT_STATS, getDefaultLoadoutStats } from './view/InformationPane';
import AppBar from './view/AppBar';
import KeyboardShortcutsModal from './view/KeyboardShortcutsModal';
import WarningModal from './view/WarningModal';
import DevlogModal from './view/DevlogModal';
import { OperatorLoadoutState, EMPTY_LOADOUT } from './view/OperatorLoadoutHeader';
import { ALL_OPERATORS } from './model/operators/operatorRegistry';
import { ALL_ENEMIES, DEFAULT_ENEMY } from './utils/enemies';
import { WEAPONS } from './utils/loadoutRegistry';
import { Operator, TimelineEvent, VisibleSkills, ContextMenuState, SkillType, SelectedFrame } from './consts/viewTypes';
import { CombatLoadout } from './controller/combat-loadout';
import { processInflictionEvents } from './utils/processInflictions';
import { buildColumns } from './controller/timeline/columnBuilder';
import {
  createEvent,
  validateUpdate,
  validateMove,
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
import { useKeyboardShortcuts } from './app/useKeyboardShortcuts';
import { useCombatLoadout } from './app/useCombatLoadout';
import { useResourceGraphs } from './app/useResourceGraphs';
import { useAutoSave } from './app/useAutoSave';
import './App.css';

const initialLoad = loadInitialState();

export default function App() {
  // ─── Core state ──────────────────────────────────────────────────────────
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
  const [editingSlotId,  setEditingSlotId]  = useState<string | null>(null);
  const [enemy,          setEnemy]          = useState(initialLoad.loaded?.enemy ?? DEFAULT_ENEMY);
  const [selectedFrame,  setSelectedFrame]  = useState<SelectedFrame | null>(null);
  const [devlogOpen,     setDevlogOpen]     = useState(false);
  const [keysOpen,       setKeysOpen]       = useState(false);
  const [warningMessage, setWarningMessage] = useState<string | null>(initialLoad.error);

  // ─── Controllers & hooks ─────────────────────────────────────────────────
  const { activationWindows, activationWindowsRef, combatLoadout } =
    useCombatLoadout(SLOT_IDS, operators, events);

  const { resourceGraphs } = useResourceGraphs(operators, SLOT_IDS, events, combatLoadout);

  useKeyboardShortcuts(undo, redo);

  // ─── Derived state ───────────────────────────────────────────────────────
  const processedEvents = useMemo(() => processInflictionEvents(events), [events]);

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
    );
  }, [operators, enemy, events, loadouts, loadoutStats, visibleSkills]);

  useAutoSave(buildSheetData);

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

  const handleClear = useCallback(() => {
    setNextEventId(1);
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
    defaultSkill: { name?: string; defaultActivationDuration?: number; defaultActiveDuration?: number; defaultCooldownDuration?: number; segments?: import('./consts/viewTypes').EventSegmentData[] } | null,
  ) => {
    const ev = createEvent(ownerId, columnId, atFrame, defaultSkill);
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

  const handleRemoveEvent = useCallback((id: string) => {
    setEvents((prev) => prev.filter((ev) => ev.id !== id));
    setEditingEventId((cur) => (cur === id ? null : cur));
    setContextMenu(null);
  }, []);

  const handleFrameClick = useCallback((eventId: string, segmentIndex: number, frameIndex: number) => {
    setSelectedFrame((prev) => {
      if (prev && prev.eventId === eventId && prev.segmentIndex === segmentIndex && prev.frameIndex === frameIndex) {
        return null;
      }
      return { eventId, segmentIndex, frameIndex };
    });
    setEditingEventId(eventId);
  }, []);

  // ─── Loadout & operator handlers ────────────────────────────────────────
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

    // Reset loadout stats to rarity-appropriate defaults when operator changes
    if (newOp) {
      setLoadoutStats((prev) => ({ ...prev, [slotId]: getDefaultLoadoutStats(newOp.rarity) }));
    }
  }, []);

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
        resourceGraphs={resourceGraphs}
        onBatchStart={beginBatch}
        onBatchEnd={endBatch}
        onFrameClick={handleFrameClick}
        selectedFrame={selectedFrame}
      />

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
          onUpdate={handleUpdateEvent}
          onRemove={handleRemoveEvent}
          onClose={() => { setEditingEventId(null); setSelectedFrame(null); }}
          selectedFrame={selectedFrame}
        />
      ) : editingSlot && editingSlot.operator ? (
        <InformationPane
          mode="loadout"
          operator={editingSlot.operator}
          loadout={loadouts[editingSlot.slotId]}
          stats={loadoutStats[editingSlot.slotId]}
          onStatsChange={(s) => handleStatsChange(editingSlot.slotId, s)}
          onClose={() => setEditingSlotId(null)}
        />
      ) : null}

      <DevlogModal open={devlogOpen} onClose={() => setDevlogOpen(false)} />

      {keysOpen && <KeyboardShortcutsModal onClose={() => setKeysOpen(false)} />}

      {warningMessage && <WarningModal message={warningMessage} onClose={() => setWarningMessage(null)} />}
    </div>
  );
}
