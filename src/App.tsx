import { useState, useCallback } from 'react';
import TimelineGrid from './view/TimelineGrid';
import ContextMenu from './view/ContextMenu';
import EventEditPanel from './view/EventEditPanel';
import LoadoutEditPanel, { LoadoutStats, DEFAULT_LOADOUT_STATS } from './view/LoadoutEditPanel';
import { OperatorLoadoutState, EMPTY_LOADOUT } from './view/OperatorLoadoutHeader';
import { SAMPLE_OPERATORS } from './utils/operators';
import { ALL_ENEMIES, DEFAULT_ENEMY } from './utils/enemies';
import { WEAPONS } from './utils/loadoutRegistry';
import { Operator, TimelineEvent, VisibleSkills, ContextMenuState, SkillType } from "./consts/viewTypes";
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
  const [events,         setEvents]         = useState<TimelineEvent[]>([]);
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
            <span className="brand-sub">ROTATION PLANNER</span>
          </div>
        </div>

        <div className="app-bar-divider" />

        <div className="zoom-display">
          <span className="zoom-label">ZOOM</span>
          <span className="zoom-value">{zoom.toFixed(2)}x</span>
          <span className="zoom-hint">alt+scroll</span>
        </div>

        <div className="app-bar-right">
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {events.length} event{events.length !== 1 ? 's' : ''}
          </span>
          <button className="btn-clear" onClick={() => setEvents([])}>
            CLEAR ALL
          </button>
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
    </div>
  );
}
