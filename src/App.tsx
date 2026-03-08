import { useState, useCallback, useRef, useEffect } from 'react';
import { useHistory } from './utils/useHistory';
import TimelineGrid from './view/TimelineGrid';
import ContextMenu from './view/ContextMenu';
import EventEditPanel from './view/EventEditPanel';
import LoadoutEditPanel, { LoadoutStats, DEFAULT_LOADOUT_STATS } from './view/LoadoutEditPanel';
import { OperatorLoadoutState, EMPTY_LOADOUT } from './view/OperatorLoadoutHeader';
import { SAMPLE_OPERATORS } from './utils/operators';
import { ALL_ENEMIES, DEFAULT_ENEMY } from './utils/enemies';
import { WEAPONS } from './utils/loadoutRegistry';
import { Operator, TimelineEvent, VisibleSkills, ContextMenuState, SkillType } from "./consts/viewTypes";
import { CombatLoadout, WindowsMap } from './controller/combat-loadout';
import DevlogModal from './view/DevlogModal';
import './App.css';

const NUM_SLOTS = 4;
const SLOT_IDS = Array.from({ length: NUM_SLOTS }, (_, i) => `slot-${i}`);

const INITIAL_OPERATORS: (Operator | null)[] = SAMPLE_OPERATORS.slice(0, NUM_SLOTS);

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

let _id = 1;
const genId = () => `ev-${_id++}`;

export default function App() {
  const [operators,      setOperators]      = useState<(Operator | null)[]>(() => [...INITIAL_OPERATORS]);
  const [zoom,           setZoom]           = useState<number>(0.5);
  const { state: events, setState: setEvents, beginBatch, endBatch, undo, redo } = useHistory<TimelineEvent[]>([]);
  const [visibleSkills,  setVisibleSkills]  = useState<VisibleSkills>(INITIAL_VISIBLE);
  const [contextMenu,    setContextMenu]    = useState<ContextMenuState | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [loadouts,       setLoadouts]       = useState<Record<string, OperatorLoadoutState>>(() =>
    Object.fromEntries(SLOT_IDS.map((id) => [id, EMPTY_LOADOUT])),
  );
  const [loadoutStats,   setLoadoutStats]   = useState<Record<string, LoadoutStats>>(() =>
    Object.fromEntries(SLOT_IDS.map((id) => [id, DEFAULT_LOADOUT_STATS])),
  );
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [enemy,          setEnemy]          = useState(DEFAULT_ENEMY);
  const [devlogOpen,     setDevlogOpen]     = useState(false);
  const [keysOpen,       setKeysOpen]       = useState(false);

  // ─── CombatLoadout controller ────────────────────────────────────────────
  const combatLoadoutRef = useRef<CombatLoadout>(null!);
  if (combatLoadoutRef.current === null) {
    combatLoadoutRef.current = new CombatLoadout();
    combatLoadoutRef.current.setSlotIds(SLOT_IDS);
  }
  const [activationWindows, setActivationWindows] = useState<WindowsMap>(new Map());

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
      return Math.max(0.15, Math.min(20, z * factor));
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

  // ─── Events ───────────────────────────────────────────────────────────────
  const handleAddEvent = useCallback((
    ownerId: string,
    channelId: string,
    atFrame: number,
    defaultSkill: { defaultActiveDuration?: number; defaultLingeringDuration?: number; defaultCooldownDuration?: number } | null,
  ) => {
    const ev: TimelineEvent = {
      id:                genId(),
      ownerId,
      channelId,
      startFrame:        atFrame,
      activeDuration:    defaultSkill?.defaultActiveDuration   ?? 120,
      lingeringDuration: defaultSkill?.defaultLingeringDuration ?? 0,
      cooldownDuration:  defaultSkill?.defaultCooldownDuration  ?? 0,
    };
    setEvents((prev) => [...prev, ev]);
    setContextMenu(null);
  }, []);

  const handleUpdateEvent = useCallback((id: string, updates: Partial<TimelineEvent>) => {
    setEvents((prev) => prev.map((ev) => (ev.id === id ? { ...ev, ...updates } : ev)));
  }, []);

  const handleMoveEvent = useCallback((id: string, newStartFrame: number) => {
    setEvents((prev) =>
      prev.map((ev) => (ev.id === id ? { ...ev, startFrame: newStartFrame } : ev)),
    );
  }, []);

  const handleRemoveEvent = useCallback((id: string) => {
    setEvents((prev) => prev.filter((ev) => ev.id !== id));
    setEditingEventId((cur) => (cur === id ? null : cur));
    setContextMenu(null);
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

    const newOp = newOperatorId ? SAMPLE_OPERATORS.find((op) => op.id === newOperatorId) ?? null : null;

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
      const compatible = newOp?.weaponTypes.includes(equippedWeapon.weaponType) ?? false;
      if (!compatible) {
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
          <span className="brand-hex">⬡</span>
          <div className="brand-text">
            <span className="brand-title">ENDFIELD</span>
            <span className="brand-sub">ZERO SANITY TIMELINE</span>
          </div>
        </div>

        <div className="app-bar-divider" />

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
        events={events}
        visibleSkills={visibleSkills}
        loadouts={loadouts}
        zoom={zoom}
        onZoom={handleZoom}
        onToggleSkill={handleToggleSkill}
        onAddEvent={handleAddEvent}
        onMoveEvent={handleMoveEvent}
        onContextMenu={setContextMenu}
        onEditEvent={setEditingEventId}
        onRemoveEvent={handleRemoveEvent}
        onLoadoutChange={handleLoadoutChange}
        onEditLoadout={setEditingSlotId}
        allOperators={SAMPLE_OPERATORS}
        onSwapOperator={handleSwapOperator}
        allEnemies={ALL_ENEMIES}
        onSwapEnemy={handleSwapEnemy}
        activationWindows={activationWindows}
        onBatchStart={beginBatch}
        onBatchEnd={endBatch}
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
        <EventEditPanel
          event={editingEvent}
          operators={SAMPLE_OPERATORS}
          enemy={enemy}
          onUpdate={handleUpdateEvent}
          onRemove={handleRemoveEvent}
          onClose={() => setEditingEventId(null)}
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
              <div className="keys-row"><kbd>Shift</kbd> + <kbd>Scroll</kbd><span>Zoom in/out</span></div>
              <div className="keys-row"><kbd>Scroll</kbd><span>Pan timeline</span></div>
              <div className="keys-row"><kbd>Ctrl</kbd> + <kbd>Z</kbd><span>Undo</span></div>
              <div className="keys-row"><kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd><span>Redo</span></div>
              <div className="keys-row"><kbd>Ctrl</kbd> + <kbd>Click</kbd><span>Multi-select</span></div>
              <div className="keys-row"><kbd>Right-click</kbd><span>Context menu</span></div>
              <div className="keys-row"><kbd>Double-click</kbd><span>Edit event</span></div>
              <div className="keys-row"><kbd>Drag</kbd><span>Move event / Marquee select</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
