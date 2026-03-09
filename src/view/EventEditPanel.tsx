import { useState, useEffect, useRef } from 'react';
import { framesToSeconds, secondsToFrames, frameToDetailLabel, frameToTimeLabelPrecise, FPS } from '../utils/timeline';
import { SKILL_LABELS, REACTION_LABELS } from '../consts/channelLabels';
import { TimelineEvent, Operator, Enemy, SkillType } from "../consts/viewTypes";

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
}

function Field({ label, value, onChange, onCommit }: FieldProps) {
  return (
    <div className="edit-field">
      <span className="edit-field-label">{label}</span>
      <div className="edit-field-row">
        <input
          className="edit-input"
          type="number"
          step="0.1"
          min="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onCommit}
          onKeyDown={(e) => { if (e.key === 'Enter') { onCommit(); (e.target as HTMLInputElement).blur(); } }}
        />
        <span className="edit-input-unit">s</span>
      </div>
    </div>
  );
}

interface EventEditPanelProps {
  event: TimelineEvent;
  operators: Operator[];
  enemy: Enemy;
  onUpdate: (id: string, updates: Partial<TimelineEvent>) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}

export default function EventEditPanel({
  event,
  operators,
  enemy,
  onUpdate,
  onRemove,
  onClose,
}: EventEditPanelProps) {
  let ownerName        = '';
  let skillName        = '';
  let ownerColor       = '#4488ff';
  let triggerCondition: string | null = null;
  let columnLabel     = '';

  if (event.ownerId === 'enemy') {
    ownerName  = enemy.name;
    const status = enemy.statuses.find((s) => s.id === event.columnId);
    const reaction = REACTION_LABELS[event.columnId];
    if (status) {
      skillName    = status.label;
      ownerColor   = status.color;
      columnLabel = 'INFLICTION';
    } else if (reaction) {
      skillName    = reaction.label;
      ownerColor   = reaction.color;
      columnLabel = 'ARTS REACTION';
    } else {
      skillName    = event.columnId;
      ownerColor   = '#cc3333';
      columnLabel = 'STATUS';
    }
  } else {
    const op = operators.find((o) => o.id === event.ownerId);
    if (op) {
      ownerName  = op.name;
      ownerColor = op.color;
      if (event.columnId === 'melting-flame') {
        skillName    = 'Melting Flame';
        ownerColor   = '#f07030'; // Heat element color
        columnLabel = 'STATUS';
      } else {
        const skillType = event.columnId as SkillType;
        const skill = op.skills[skillType];
        if (skill) {
          skillName        = skill.name;
          triggerCondition = skill.triggerCondition;
          columnLabel     = SKILL_LABELS[skillType] ?? event.columnId.toUpperCase();
        }
      }
    }
  }

  const [activeSec,     setActiveSec]     = useState(framesToSeconds(event.activeDuration));
  const [lingerSec,     setLingerSec]     = useState(framesToSeconds(event.lingeringDuration));
  const [cooldownSec,   setCooldownSec]   = useState(framesToSeconds(event.cooldownDuration));
  const [startWholeSec, setStartWholeSec] = useState(String(Math.floor(event.startFrame / FPS)));
  const [startModFrame, setStartModFrame] = useState(String(event.startFrame % FPS));

  // Track whether any input is focused — skip syncing from props while editing
  const focusedRef = useRef(false);

  // Sync local state from event prop (e.g. after undo, drag, or switching events)
  useEffect(() => {
    if (focusedRef.current) return;
    setStartWholeSec(String(Math.floor(event.startFrame / FPS)));
    setStartModFrame(String(event.startFrame % FPS));
    setActiveSec(framesToSeconds(event.activeDuration));
    setLingerSec(framesToSeconds(event.lingeringDuration));
    setCooldownSec(framesToSeconds(event.cooldownDuration));
  }, [event.id, event.startFrame, event.activeDuration, event.lingeringDuration, event.cooldownDuration]);

  const computedStartFrame = Math.max(0, (parseInt(startWholeSec) || 0) * FPS + (parseInt(startModFrame) || 0));

  const commit = () => {
    onUpdate(event.id, {
      startFrame:        computedStartFrame,
      activeDuration:    secondsToFrames(activeSec),
      lingeringDuration: secondsToFrames(lingerSec),
      cooldownDuration:  secondsToFrames(cooldownSec),
    });
  };

  const handleFocus = () => { focusedRef.current = true; };
  const handleBlur = () => { focusedRef.current = false; commit(); };
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { commit(); (e.target as HTMLInputElement).blur(); }
  };

  return (
    <div className="event-edit-panel" onFocus={handleFocus}>
      <div className="edit-panel-header">
        <div
          style={{
            width: 4, height: 40, borderRadius: 2, flexShrink: 0,
            background: ownerColor,
            boxShadow: `0 0 8px ${ownerColor}80`,
          }}
        />
        <div className="edit-panel-title-wrap">
          <div className="edit-panel-skill-name">{skillName}</div>
          <div className="edit-panel-op-name" style={{ color: ownerColor }}>
            {ownerName}
            {columnLabel && (
              <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>· {columnLabel}</span>
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
          <div className="edit-field">
            <span className="edit-field-label">Start offset</span>
            <div className="edit-field-row">
              <input
                className="edit-input"
                type="number"
                step="1"
                min="0"
                value={startWholeSec}
                onChange={(e) => setStartWholeSec(e.target.value)}
                onBlur={handleBlur}
                onFocus={handleFocus}
                onKeyDown={handleKeyDown}
              />
              <span className="edit-input-unit">s</span>
              <input
                className="edit-input"
                type="number"
                step="1"
                min="0"
                max={FPS - 1}
                value={startModFrame}
                onChange={(e) => setStartModFrame(e.target.value)}
                onBlur={handleBlur}
                onFocus={handleFocus}
                onKeyDown={handleKeyDown}
              />
              <span className="edit-input-unit">f</span>
            </div>
            <div className="edit-field-computed">
              = {frameToTimeLabelPrecise(computedStartFrame)}
            </div>
          </div>
        </div>

        <div className="edit-panel-section">
          <span className="edit-section-label">Active Phase</span>
          <Field label="Duration" value={activeSec} onChange={setActiveSec} onCommit={handleBlur} />
        </div>

        <div className="edit-panel-section">
          <span className="edit-section-label">Lingering Effect</span>
          <Field label="Duration (0 = none)" value={lingerSec} onChange={setLingerSec} onCommit={handleBlur} />
        </div>

        <div className="edit-panel-section">
          <span className="edit-section-label">Cooldown</span>
          <Field label="Duration (0 = none)" value={cooldownSec} onChange={setCooldownSec} onCommit={handleBlur} />
        </div>

        <div className="edit-panel-section">
          <span className="edit-section-label">Info</span>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.8 }}>
            <div>Active: {framesToSeconds(event.activeDuration)}s</div>
            <div>Total: {framesToSeconds(event.activeDuration + event.lingeringDuration + event.cooldownDuration)}s</div>
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
