import { useState, useEffect } from 'react';
import { framesToSeconds, secondsToFrames, frameToDetailLabel } from '../utils/timeline';
import { SKILL_LABELS } from '../utils/operators';

export default function EventEditPanel({ event, operators, enemy, onUpdate, onRemove, onClose }) {
  // Find the owner and skill metadata
  let ownerName = '';
  let skillName = '';
  let ownerColor = '#4488ff';
  let triggerCondition = null;
  let channelLabel = '';

  if (event.ownerId === 'enemy') {
    ownerName = 'Enemy';
    const status = enemy.statuses.find(s => s.id === event.channelId);
    skillName = status?.label ?? event.channelId;
    ownerColor = status?.color ?? '#cc3333';
    channelLabel = 'STATUS';
  } else {
    const op = operators.find(o => o.id === event.ownerId);
    if (op) {
      ownerName = op.name;
      ownerColor = op.color;
      const skill = op.skills[event.channelId];
      if (skill) {
        skillName = skill.name;
        triggerCondition = skill.triggerCondition;
        channelLabel = SKILL_LABELS[event.channelId] ?? event.channelId.toUpperCase();
      }
    }
  }

  // Local seconds-based state
  const [activeSec, setActiveSec]   = useState(framesToSeconds(event.activeDuration));
  const [lingerSec, setLingerSec]   = useState(framesToSeconds(event.lingeringDuration));
  const [cooldownSec, setCooldownSec] = useState(framesToSeconds(event.cooldownDuration));
  const [startSec, setStartSec]     = useState(framesToSeconds(event.startFrame));

  // Sync from event changes (e.g., drag-moved start)
  useEffect(() => {
    setStartSec(framesToSeconds(event.startFrame));
  }, [event.startFrame]);

  const commit = () => {
    onUpdate(event.id, {
      startFrame:        secondsToFrames(startSec),
      activeDuration:    secondsToFrames(activeSec),
      lingeringDuration: secondsToFrames(lingerSec),
      cooldownDuration:  secondsToFrames(cooldownSec),
    });
  };

  const handleBlur = () => commit();

  const Field = ({ label, value, onChange }) => (
    <div className="edit-field">
      <span className="edit-field-label">{label}</span>
      <div className="edit-field-row">
        <input
          className="edit-input"
          type="number"
          step="0.1"
          min="0"
          value={value}
          onChange={e => onChange(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={e => { if (e.key === 'Enter') { handleBlur(); e.target.blur(); } }}
        />
        <span className="edit-input-unit">s</span>
      </div>
    </div>
  );

  return (
    <div className="event-edit-panel">
      <div className="edit-panel-header">
        <div
          className="edit-panel-color-dot"
          style={{
            width: 4,
            height: 40,
            background: ownerColor,
            borderRadius: 2,
            flexShrink: 0,
            boxShadow: `0 0 8px ${ownerColor}80`,
          }}
        />
        <div className="edit-panel-title-wrap">
          <div className="edit-panel-skill-name">{skillName}</div>
          <div className="edit-panel-op-name" style={{ color: ownerColor }}>
            {ownerName}
            {channelLabel && (
              <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>· {channelLabel}</span>
            )}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
            @ {frameToDetailLabel(event.startFrame)}
          </div>
        </div>
        <button className="edit-panel-close" onClick={onClose}>×</button>
      </div>

      <div className="edit-panel-body">
        {triggerCondition && (
          <div className="edit-panel-trigger">{triggerCondition}</div>
        )}

        <div className="edit-panel-section">
          <span className="edit-section-label">Timing</span>
          <Field label="Start time" value={startSec} onChange={setStartSec} />
        </div>

        <div className="edit-panel-section">
          <span className="edit-section-label">Active Phase</span>
          <Field label="Duration" value={activeSec} onChange={setActiveSec} />
        </div>

        <div className="edit-panel-section">
          <span className="edit-section-label">Lingering Effect</span>
          <Field label="Duration (0 = none)" value={lingerSec} onChange={setLingerSec} />
        </div>

        <div className="edit-panel-section">
          <span className="edit-section-label">Cooldown</span>
          <Field label="Duration (0 = none)" value={cooldownSec} onChange={setCooldownSec} />
        </div>

        <div className="edit-panel-section">
          <span className="edit-section-label">Info</span>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.8 }}>
            <div>Active: {framesToSeconds(event.activeDuration)}s → {framesToSeconds(event.activeDuration + event.lingeringDuration + event.cooldownDuration)}s total</div>
            <div>Frames: {event.activeDuration} / {event.lingeringDuration} / {event.cooldownDuration}</div>
          </div>
        </div>
      </div>

      <div className="edit-panel-footer">
        <button className="btn-delete-event" onClick={() => onRemove(event.id)}>
          REMOVE EVENT
        </button>
      </div>
    </div>
  );
}
