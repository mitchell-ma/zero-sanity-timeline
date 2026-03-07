import { useState, useCallback } from 'react';
import TimelineGrid from './view/TimelineGrid';
import ContextMenu from './view/ContextMenu';
import EventEditPanel from './view/EventEditPanel';
import { SAMPLE_OPERATORS, ENEMY, SKILL_TYPES, SKILL_LABELS, SKILL_ORDER } from './utils/operators';
import './App.css';

const INITIAL_VISIBLE = Object.fromEntries(
  SAMPLE_OPERATORS.map((op) => [
    op.id,
    {
      [SKILL_TYPES.BASIC]:   false,
      [SKILL_TYPES.BATTLE]:  true,
      [SKILL_TYPES.COMBO]:   true,
      [SKILL_TYPES.ULTIMATE]: false,
    },
  ])
);

let _id = 1;
const genId = () => `ev-${_id++}`;

export default function App() {
  const [zoom, setZoom]                     = useState(0.5);
  const [events, setEvents]                 = useState([]);
  const [visibleSkills, setVisibleSkills]   = useState(INITIAL_VISIBLE);
  const [contextMenu, setContextMenu]       = useState(null);
  const [editingEventId, setEditingEventId] = useState(null);

  // ─── Zoom ──────────────────────────────────────────────────────────────────
  const handleZoom = useCallback((deltaY) => {
    setZoom((z) => {
      const factor = deltaY > 0 ? 1 / 1.2 : 1.2;
      return Math.max(0.15, Math.min(20, z * factor));
    });
  }, []);

  // ─── Skill visibility ─────────────────────────────────────────────────────
  const handleToggleSkill = useCallback((operatorId, skillType) => {
    setVisibleSkills((prev) => ({
      ...prev,
      [operatorId]: {
        ...prev[operatorId],
        [skillType]: !prev[operatorId]?.[skillType],
      },
    }));
  }, []);

  // ─── Events ───────────────────────────────────────────────────────────────
  const handleAddEvent = useCallback((ownerId, channelId, atFrame, defaultSkill) => {
    const ev = {
      id:               genId(),
      ownerId,
      channelId,
      startFrame:       atFrame,
      activeDuration:   defaultSkill?.defaultActiveDuration   ?? 120,
      lingeringDuration: defaultSkill?.defaultLingeringDuration ?? 0,
      cooldownDuration: defaultSkill?.defaultCooldownDuration  ?? 0,
    };
    setEvents((prev) => [...prev, ev]);
    setContextMenu(null);
  }, []);

  const handleUpdateEvent = useCallback((id, updates) => {
    setEvents((prev) => prev.map((ev) => (ev.id === id ? { ...ev, ...updates } : ev)));
  }, []);

  const handleMoveEvent = useCallback((id, newStartFrame) => {
    setEvents((prev) =>
      prev.map((ev) => (ev.id === id ? { ...ev, startFrame: newStartFrame } : ev))
    );
  }, []);

  const handleRemoveEvent = useCallback((id) => {
    setEvents((prev) => prev.filter((ev) => ev.id !== id));
    setEditingEventId((cur) => (cur === id ? null : cur));
    setContextMenu(null);
  }, []);

  const editingEvent = editingEventId
    ? events.find((e) => e.id === editingEventId) ?? null
    : null;

  return (
    <div className="app">
      {/* ── App bar ─────────────────────────────────────────────────────── */}
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
          <span className="zoom-value">{zoom.toFixed(2)}×</span>
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

      {/* ── Controls bar: skill visibility toggles ──────────────────────── */}
      <div className="controls-bar">
        {SAMPLE_OPERATORS.map((op) => (
          <div key={op.id} className="op-toggle-group">
            <span className="op-toggle-name" style={{ color: op.color }}>
              {op.name}
            </span>
            {SKILL_ORDER.map((skillType) => (
              <button
                key={skillType}
                className={`skill-toggle-btn${visibleSkills[op.id]?.[skillType] ? ' active' : ''}`}
                style={{ '--op-color': op.color }}
                onClick={() => handleToggleSkill(op.id, skillType)}
                title={op.skills[skillType].name}
              >
                {SKILL_LABELS[skillType]}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* ── Main timeline ────────────────────────────────────────────────── */}
      <TimelineGrid
        operators={SAMPLE_OPERATORS}
        enemy={ENEMY}
        events={events}
        visibleSkills={visibleSkills}
        zoom={zoom}
        onZoom={handleZoom}
        onToggleSkill={handleToggleSkill}
        onAddEvent={handleAddEvent}
        onMoveEvent={handleMoveEvent}
        onContextMenu={setContextMenu}
        onEditEvent={setEditingEventId}
        onRemoveEvent={handleRemoveEvent}
      />

      {/* ── Context menu ─────────────────────────────────────────────────── */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* ── Event edit side panel ─────────────────────────────────────────── */}
      {editingEvent && (
        <EventEditPanel
          event={editingEvent}
          operators={SAMPLE_OPERATORS}
          enemy={ENEMY}
          onUpdate={handleUpdateEvent}
          onRemove={handleRemoveEvent}
          onClose={() => setEditingEventId(null)}
        />
      )}
    </div>
  );
}
