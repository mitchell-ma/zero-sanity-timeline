import { useState, useEffect, useRef, useCallback } from 'react';
import { framesToSeconds, secondsToFrames, frameToDetailLabel, frameToTimeLabelPrecise, FPS } from '../utils/timeline';
import { SKILL_LABELS, REACTION_LABELS, COMBAT_SKILL_LABELS, STATUS_LABELS, INFLICTION_EVENT_LABELS, PHYSICAL_INFLICTION_LABELS, PHYSICAL_STATUS_LABELS, TRIGGER_CONDITION_LABELS } from '../consts/channelLabels';
import { CombatSkillsType, ELEMENT_COLORS, ElementType, StatusType, STATUS_ELEMENT, TriggerConditionType } from '../consts/enums';
import { TimelineEvent, Operator, Enemy, SkillType, SelectedFrame, ResourceConfig, Column, MiniTimeline } from "../consts/viewTypes";
import { OperatorLoadoutState } from './OperatorLoadoutHeader';
import { WEAPONS, ARMORS, GLOVES, KITS, CONSUMABLES, TACTICALS } from '../utils/loadoutRegistry';

// ── Loadout stats type (shared across app) ──────────────────────────────────

export interface LoadoutStats {
  operatorLevel: number;
  potential: number;
  talentOneLevel: number;
  talentTwoLevel: number;
  basicAttackLevel: number;
  battleSkillLevel: number;
  comboSkillLevel: number;
  ultimateLevel: number;
  weaponLevel: number;
  weaponSkill1Level: number;
  weaponSkill2Level: number;
  weaponSkill3Level: number;
  gearRank: number;
}

export const DEFAULT_LOADOUT_STATS: LoadoutStats = {
  operatorLevel: 90,
  potential: 5,
  talentOneLevel: 3,
  talentTwoLevel: 3,
  basicAttackLevel: 12,
  battleSkillLevel: 12,
  comboSkillLevel: 12,
  ultimateLevel: 12,
  weaponLevel: 90,
  weaponSkill1Level: 5,
  weaponSkill2Level: 5,
  weaponSkill3Level: 5,
  gearRank: 4,
};

/** Generate default loadout stats for a given operator. */
export function getDefaultLoadoutStats(op: { rarity: number; maxTalentOneLevel: number; maxTalentTwoLevel: number }): LoadoutStats {
  return {
    ...DEFAULT_LOADOUT_STATS,
    potential: op.rarity >= 6 ? 0 : 5,
    talentOneLevel: op.maxTalentOneLevel,
    talentTwoLevel: op.maxTalentTwoLevel,
  };
}

const LEVEL_BREAKPOINTS = [1, 20, 40, 60, 80, 90];

// ── Shared field components ─────────────────────────────────────────────────

function DurationField({ label, value, onChange, onCommit }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
}) {
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
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        />
        <span className="edit-input-unit">s</span>
      </div>
    </div>
  );
}

/** Initial delay before repeating (ms). */
const REPEAT_DELAY = 400;
/** Interval between repeats (ms). */
const REPEAT_INTERVAL = 80;

function StatField({ label, value, min, max, step = 1, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  const valueRef = useRef(value);
  valueRef.current = value;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopRepeat = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  const startRepeat = useCallback((delta: number) => {
    stopRepeat();
    timerRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        const next = Math.max(min, Math.min(max, +(valueRef.current + delta).toFixed(10)));
        if (next !== valueRef.current) onChange(next);
      }, REPEAT_INTERVAL);
    }, REPEAT_DELAY);
  }, [min, max, onChange, stopRepeat]);

  // Clean up on unmount
  useEffect(() => stopRepeat, [stopRepeat]);

  return (
    <div className="stat-field">
      <span className="edit-field-label">{label}</span>
      <div className="stat-field-controls">
        <button
          className="stat-arrow"
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, +(value - step).toFixed(10)))}
          onMouseDown={() => startRepeat(-step)}
          onMouseUp={stopRepeat}
          onMouseLeave={stopRepeat}
        >-</button>
        <input
          className="edit-input stat-field-input"
          type="number"
          step={step}
          value={value}
          min={min}
          max={max}
          onChange={(e) => {
            const v = Math.max(min, Math.min(max, Number(e.target.value) || min));
            onChange(v);
          }}
          onBlur={(e) => {
            const v = Math.max(min, Math.min(max, Number(e.target.value) || min));
            if (v !== value) onChange(v);
          }}
        />
        <button
          className="stat-arrow"
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, +(value + step).toFixed(10)))}
          onMouseDown={() => startRepeat(step)}
          onMouseUp={stopRepeat}
          onMouseLeave={stopRepeat}
        >+</button>
      </div>
    </div>
  );
}

function LevelSelect({ label, value, options, onChange }: {
  label: string;
  value: number;
  options: number[];
  onChange: (v: number) => void;
}) {
  return (
    <div className="stat-field">
      <span className="edit-field-label">{label}</span>
      <select
        className="edit-input stat-level-select"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {options.map((lv) => (
          <option key={lv} value={lv}>{lv}</option>
        ))}
      </select>
    </div>
  );
}

// ── Event pane content ──────────────────────────────────────────────────────

interface EventPaneProps {
  event: TimelineEvent;
  operators: Operator[];
  slots: { slotId: string; operator: Operator | null }[];
  enemy: Enemy;
  columns: Column[];
  onUpdate: (id: string, updates: Partial<TimelineEvent>) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
  selectedFrames?: SelectedFrame[];
  readOnly?: boolean;
  editContext?: string | null;
}

function SegmentDurationField({ eventId, segmentIndex, durationFrames, onUpdate, segments }: {
  eventId: string;
  segmentIndex: number;
  durationFrames: number;
  onUpdate: (id: string, updates: Partial<TimelineEvent>) => void;
  segments: TimelineEvent['segments'];
}) {
  const [sec, setSec] = useState(framesToSeconds(durationFrames));

  useEffect(() => {
    setSec(framesToSeconds(durationFrames));
  }, [durationFrames]);

  const commit = () => {
    if (!segments) return;
    const newDuration = secondsToFrames(sec);
    if (newDuration === durationFrames) return;
    const newSegments = segments.map((s, i) => {
      if (i !== segmentIndex) return s;
      const updated = { ...s, durationFrames: newDuration };
      // Clamp inner frame offsets to the new duration
      if (updated.frames && newDuration < durationFrames) {
        const maxOffset = Math.max(0, newDuration - 1);
        updated.frames = updated.frames
          .map((f) => f.offsetFrame > maxOffset ? { ...f, offsetFrame: maxOffset } : f)
          .filter((f, j, arr) =>
            // Remove duplicates created by clamping (keep first at each offset)
            arr.findIndex((o) => o.offsetFrame === f.offsetFrame) === j,
          );
      }
      return updated;
    });
    const totalDuration = newSegments.reduce((sum, s) => sum + s.durationFrames, 0);
    onUpdate(eventId, {
      segments: newSegments,
      activationDuration: totalDuration,
      nonOverlappableRange: totalDuration,
    });
  };

  return (
    <DurationField label="Duration" value={sec} onChange={setSec} onCommit={commit} />
  );
}

function FrameOffsetField({ eventId, segmentIndex, frameIndex, offsetFrame, maxOffset, onUpdate, segments }: {
  eventId: string;
  segmentIndex: number;
  frameIndex: number;
  offsetFrame: number;
  maxOffset: number;
  onUpdate: (id: string, updates: Partial<TimelineEvent>) => void;
  segments: TimelineEvent['segments'];
}) {
  const [sec, setSec] = useState(framesToSeconds(offsetFrame));

  useEffect(() => {
    setSec(framesToSeconds(offsetFrame));
  }, [offsetFrame]);

  const commit = () => {
    if (!segments) return;
    const newOffset = Math.max(0, Math.min(maxOffset, secondsToFrames(sec)));
    if (newOffset === offsetFrame) return;
    const newSegments = segments.map((s, si) => {
      if (si !== segmentIndex || !s.frames) return s;
      const newFrames = s.frames.map((f, fi) =>
        fi === frameIndex ? { ...f, offsetFrame: newOffset } : f,
      );
      return { ...s, frames: newFrames };
    });
    onUpdate(eventId, { segments: newSegments });
  };

  return (
    <div className="edit-field">
      <span className="edit-field-label">Offset</span>
      <div className="edit-field-row">
        <input
          className="edit-input"
          type="number"
          step="0.01"
          min="0"
          max={framesToSeconds(maxOffset)}
          value={sec}
          onChange={(e) => setSec(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        />
        <span className="edit-input-unit">s</span>
      </div>
    </div>
  );
}

function EventPane({
  event,
  operators,
  enemy,
  columns,
  onUpdate,
  onRemove,
  onClose,
  selectedFrames,
  slots,
  readOnly,
  editContext,
}: EventPaneProps) {
  let ownerName        = '';
  let skillName        = '';
  let ownerColor       = '#4488ff';
  let triggerCondition: string | null = null;
  let comboTriggerLabels: string[] = [];
  let comboRequiresLabels: string[] = [];
  let columnLabel     = '';

  let sourceName = '';
  let sourceColor = '';

  if (event.ownerId === 'enemy') {
    ownerName  = enemy.name;
    const status = enemy.statuses.find((s) => s.id === event.columnId);
    const reaction = REACTION_LABELS[event.columnId];
    const physInfliction = PHYSICAL_INFLICTION_LABELS[event.columnId];
    const physStatus = PHYSICAL_STATUS_LABELS[event.columnId];
    if (status) {
      skillName    = status.label;
      ownerColor   = status.color;
      columnLabel = 'INFLICTION';
    } else if (reaction) {
      skillName    = reaction.label;
      ownerColor   = reaction.color;
      columnLabel = 'ARTS REACTION';
    } else if (physInfliction) {
      skillName    = physInfliction.label;
      ownerColor   = physInfliction.color;
      columnLabel = 'PHYSICAL INFLICTION';
    } else if (physStatus) {
      skillName    = physStatus.label;
      ownerColor   = physStatus.color;
      columnLabel = 'PHYSICAL STATUS';
    } else {
      skillName    = STATUS_LABELS[event.columnId as StatusType] ?? event.columnId;
      ownerColor   = '#cc3333';
      columnLabel = 'STATUS';
    }
  } else {
    const slot = slots.find((s) => s.slotId === event.ownerId);
    const op = slot?.operator;
    if (op) {
      ownerName  = op.name;
      ownerColor = op.color;
      if (event.columnId === 'melting-flame') {
        skillName    = STATUS_LABELS[StatusType.MELTING_FLAME];
        ownerColor   = '#f07030';
        columnLabel = 'STATUS';
      } else {
        const skillType = event.columnId as SkillType;
        const skill = op.skills[skillType];
        if (skill) {
          skillName        = skill.name;
          triggerCondition = skill.triggerCondition;
          columnLabel     = SKILL_LABELS[skillType] ?? event.columnId.toUpperCase();
        }
        if (event.columnId === 'combo' && op.triggerCapability) {
          comboTriggerLabels = op.triggerCapability.comboRequires.map(
            tc => TRIGGER_CONDITION_LABELS[tc] ?? tc
          );
          if (op.triggerCapability.comboRequiresActiveColumns) {
            comboRequiresLabels = op.triggerCapability.comboRequiresActiveColumns.map(
              col => STATUS_LABELS[col as StatusType] ?? col
            );
          }
        }
      }
    }
  }

  // Resolve source operator for derived events (inflictions, reactions, statuses)
  let sourceSkillLabel = '';
  if (event.sourceOwnerId) {
    const sourceSlot = slots.find((s) => s.slotId === event.sourceOwnerId);
    if (sourceSlot?.operator) {
      sourceName = sourceSlot.operator.name;
      sourceColor = sourceSlot.operator.color;
    }
    if (event.sourceSkillName) {
      sourceSkillLabel = COMBAT_SKILL_LABELS[event.sourceSkillName as CombatSkillsType] ?? event.sourceSkillName;
    }
  }

  const combatLabel = COMBAT_SKILL_LABELS[event.name as CombatSkillsType];
  if (combatLabel) {
    skillName = combatLabel;
  } else if (INFLICTION_EVENT_LABELS[event.name]) {
    skillName = INFLICTION_EVENT_LABELS[event.name];
  } else if (event.name && event.name !== event.columnId) {
    skillName = event.name;
  }

  const isSequenced = event.segments && event.segments.length > 0;

  const selectedFrameElRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (selectedFrames && selectedFrames.length > 0 && selectedFrameElRef.current) {
      selectedFrameElRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedFrames]);

  const [activeSec,     setActiveSec]     = useState(framesToSeconds(event.activationDuration));
  const [animSec,       setAnimSec]       = useState(framesToSeconds(event.animationDuration ?? 0));
  const [lingerSec,     setLingerSec]     = useState(framesToSeconds(event.activeDuration));
  const [cooldownSec,   setCooldownSec]   = useState(framesToSeconds(event.cooldownDuration));
  const [startWholeSec, setStartWholeSec] = useState(String(Math.floor(event.startFrame / FPS)));
  const [startModFrame, setStartModFrame] = useState(String(event.startFrame % FPS));

  const focusedRef = useRef(false);

  useEffect(() => {
    if (focusedRef.current) return;
    setStartWholeSec(String(Math.floor(event.startFrame / FPS)));
    setStartModFrame(String(event.startFrame % FPS));
    setActiveSec(framesToSeconds(event.activationDuration));
    setAnimSec(framesToSeconds(event.animationDuration ?? 0));
    setLingerSec(framesToSeconds(event.activeDuration));
    setCooldownSec(framesToSeconds(event.cooldownDuration));
  }, [event.id, event.startFrame, event.activationDuration, event.animationDuration, event.activeDuration, event.cooldownDuration]);

  const computedStartFrame = Math.max(0, (parseInt(startWholeSec) || 0) * FPS + (parseInt(startModFrame) || 0));

  const commit = () => {
    if (isSequenced) {
      const newActivation = secondsToFrames(activeSec);
      const newAnim = secondsToFrames(animSec);
      const clampedAnim = Math.min(newAnim, newActivation);
      if (clampedAnim !== newAnim) setAnimSec(framesToSeconds(clampedAnim));
      const newLinger = secondsToFrames(lingerSec);
      const newCooldown = secondsToFrames(cooldownSec);
      // Clamp frame offsets within segments when active duration shrinks
      let clampedSegments: typeof event.segments;
      if (event.segments && newLinger < event.activeDuration) {
        const maxOffset = Math.max(0, newLinger - 1);
        clampedSegments = event.segments.map((s) => {
          if (!s.frames) return s;
          const clamped = s.frames
            .map((f) => f.offsetFrame > maxOffset ? { ...f, offsetFrame: maxOffset } : f)
            .filter((f, j, arr) => arr.findIndex((o) => o.offsetFrame === f.offsetFrame) === j);
          return { ...s, frames: clamped };
        });
      }
      onUpdate(event.id, {
        startFrame: computedStartFrame,
        activationDuration: newActivation,
        activeDuration: newLinger,
        cooldownDuration: newCooldown,
        ...(event.columnId === 'ultimate' ? { animationDuration: clampedAnim } : {}),
        ...(clampedSegments ? { segments: clampedSegments } : {}),
      });
    } else {
      const newActivation = secondsToFrames(activeSec);
      const newAnim = secondsToFrames(animSec);
      // Clamp animation to activation duration
      const clampedAnim = Math.min(newAnim, newActivation);
      if (clampedAnim !== newAnim) setAnimSec(framesToSeconds(clampedAnim));
      onUpdate(event.id, {
        startFrame:         computedStartFrame,
        activationDuration: newActivation,
        activeDuration:     secondsToFrames(lingerSec),
        cooldownDuration:   secondsToFrames(cooldownSec),
        ...(event.columnId === 'ultimate' ? { animationDuration: clampedAnim } : {}),
      });
    }
  };

  const handleFocus = () => { focusedRef.current = true; };
  const handleBlur = () => { focusedRef.current = false; commit(); };
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
  };

  const totalDurationFrames = isSequenced
    ? event.segments!.reduce((sum, s) => sum + s.durationFrames, 0)
    : event.activationDuration + event.activeDuration + event.cooldownDuration;

  // Build a map of offsetFrame → original 1-based hit number per segment label
  const defaultSegments = (() => {
    const col = columns.find((c): c is MiniTimeline =>
      c.type === 'mini-timeline' && c.ownerId === event.ownerId && c.columnId === event.columnId);
    return col?.defaultEvent?.segments;
  })();
  const getHitNumber = (segLabel: string | undefined, segIndex: number, offsetFrame: number): number => {
    const defSeg = defaultSegments?.find((ds) => ds.label === segLabel) ?? defaultSegments?.[segIndex];
    if (defSeg?.frames) {
      const idx = defSeg.frames.findIndex((f) => f.offsetFrame === offsetFrame);
      if (idx >= 0) return idx + 1;
    }
    return segIndex + 1; // fallback
  };

  return (
    <>
      <div className="edit-panel-header">
        <div
          style={{
            width: 4, height: 40, borderRadius: 2, flexShrink: 0,
            background: ownerColor,
            boxShadow: `0 0 8px ${ownerColor}80`,
          }}
        />
        <div className="edit-panel-title-wrap">
          {editContext?.startsWith('combo-trigger') ? (() => {
            const parts = editContext.split(':');
            const winStart = parseInt(parts[1]) || 0;
            const winEnd = parseInt(parts[2]) || 0;
            const winDuration = winEnd - winStart;
            return (
              <>
                <div className="edit-panel-skill-name">Combo Activation Window</div>
                <div style={{ fontSize: 11, marginTop: 2 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Trigger: </span>
                  <span style={{ color: ownerColor }}>{skillName}</span>
                </div>
                {sourceName && (
                  <div style={{ fontSize: 11, marginTop: 2 }}>
                    <span style={{ color: 'var(--text-muted)' }}>Source: </span>
                    <span style={{ color: sourceColor }}>{sourceName}</span>
                    {sourceSkillLabel && (
                      <span style={{ color: 'var(--text-muted)' }}> · {sourceSkillLabel}</span>
                    )}
                  </div>
                )}
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                  @ {frameToDetailLabel(winStart)} — {framesToSeconds(winDuration)}s
                </div>
              </>
            );
          })() : (
            <>
              <div className="edit-panel-skill-name">{skillName}</div>
              <div className="edit-panel-op-name" style={{ color: ownerColor }}>
                {ownerName}
                {columnLabel && (
                  <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>· {columnLabel}</span>
                )}
              </div>
              {sourceName && (
                <div style={{ fontSize: 11, marginTop: 2 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Source: </span>
                  <span style={{ color: sourceColor }}>{sourceName}</span>
                  {sourceSkillLabel && (
                    <span style={{ color: 'var(--text-muted)' }}> · {sourceSkillLabel}</span>
                  )}
                </div>
              )}
            </>
          )}
          {(event.eventStatus || event.forcedReaction) && (
            <div style={{
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              marginTop: 4,
              color: event.eventStatus === 'expired' ? 'var(--text-muted)'
                : event.eventStatus === 'consumed' ? '#f07030'
                : event.eventStatus === 'refreshed' ? '#55aadd'
                : event.eventStatus === 'triggered' ? '#ffdd44'
                : 'var(--text-muted)',
            }}>
              {event.forcedReaction && (
                <span style={{ color: '#ff5522' }}>FORCED{event.eventStatus ? ' · ' : ''}</span>
              )}
              {event.eventStatus && (
                <>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>Event status: </span>{event.eventStatus.toUpperCase()}
                  {event.eventStatusOwnerId && (() => {
                    const statusSlot = slots.find((s) => s.slotId === event.eventStatusOwnerId);
                    const statusOpName = statusSlot?.operator?.name ?? event.eventStatusOwnerId;
                    const statusOpColor = statusSlot?.operator?.color;
                    const statusSkillLabel = event.eventStatusSkillName
                      ? COMBAT_SKILL_LABELS[event.eventStatusSkillName as CombatSkillsType] ?? event.eventStatusSkillName
                      : null;
                    return (
                      <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                        {' by '}
                        <span style={{ color: statusOpColor ?? 'inherit', fontWeight: 600 }}>{statusOpName}</span>
                        {statusSkillLabel && <span> ({statusSkillLabel})</span>}
                      </span>
                    );
                  })()}
                </>
              )}
            </div>
          )}
          {!editContext?.startsWith('combo-trigger') && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
              @ {frameToDetailLabel(event.startFrame)}
            </div>
          )}
        </div>
        <button className="edit-panel-close" onClick={onClose}>×</button>
      </div>

      <div className="edit-panel-body" onFocus={handleFocus}>
        {editContext?.startsWith('combo-trigger') ? (() => {
          const parts = editContext.split(':');
          const winStart = parseInt(parts[1]) || 0;
          const winEnd = parseInt(parts[2]) || 0;
          const winDuration = winEnd - winStart;
          return (
            <div className="edit-panel-section">
              <span className="edit-section-label">Timing</span>
              <div className="edit-info-text">
                <div>Start: {frameToTimeLabelPrecise(winStart)}</div>
                <div>End: {frameToTimeLabelPrecise(winEnd)}</div>
                <div>Duration: {framesToSeconds(winDuration)}s ({winDuration}f)</div>
              </div>
            </div>
          );
        })() : (
        <>
        {comboTriggerLabels.length > 0 ? (
          <div className="edit-panel-trigger">
            <div>Trigger: {comboTriggerLabels.join(' / ')}</div>
            {comboRequiresLabels.length > 0 && (
              <div>Requires: {comboRequiresLabels.join(', ')}</div>
            )}
          </div>
        ) : triggerCondition ? (
          <div className="edit-panel-trigger">{triggerCondition}</div>
        ) : null}

        <div className="edit-panel-section">
          <span className="edit-section-label">Timing</span>
          {readOnly ? (
            <div className="edit-info-text">
              <div>Start: {frameToTimeLabelPrecise(event.startFrame)}</div>
            </div>
          ) : (
            <div className="edit-field">
              <span className="edit-field-label">Start offset</span>
              <div className="edit-field-row">
                <input
                  className="edit-input"
                  type="number"
                  step="1"
                  min="0"
                  value={startWholeSec}
                  onChange={(e) => setStartWholeSec(String(Math.max(0, Math.floor(Number(e.target.value) || 0))))}
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
                  onChange={(e) => setStartModFrame(String(Math.max(0, Math.min(FPS - 1, Math.floor(Number(e.target.value) || 0)))))}
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
          )}
        </div>

        {event.susceptibility && Object.keys(event.susceptibility).length > 0 && (
          <div className="edit-panel-section">
            <span className="edit-section-label">Susceptibility</span>
            <div className="edit-info-text">
              {Object.entries(event.susceptibility).map(([element, table]) => {
                const color = ELEMENT_COLORS[element.toUpperCase() as ElementType] ?? 'var(--text-muted)';
                const label = element.charAt(0).toUpperCase() + element.slice(1);
                const minVal = Math.round(table[0] * 100);
                const maxVal = Math.round(table[table.length - 1] * 100);
                return (
                  <div key={element}>
                    <span style={{ color }}>{label}</span>: {minVal === maxVal ? `${maxVal}%` : `${minVal}%–${maxVal}%`}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {event.gaugeGainByEnemies && (
          <div className="edit-panel-section">
            <span className="edit-section-label">Enemies Hit</span>
            <div className="edit-field">
              <select
                className="edit-input"
                style={{ width: '100%' }}
                value={event.enemiesHit ?? 1}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  onUpdate(event.id, {
                    enemiesHit: n,
                    gaugeGain: event.gaugeGainByEnemies![n] ?? event.gaugeGainByEnemies![1] ?? 0,
                  });
                }}
              >
                {Object.keys(event.gaugeGainByEnemies)
                  .map(Number)
                  .sort((a, b) => a - b)
                  .map((n) => (
                    <option key={n} value={n}>
                      {n} — {event.gaugeGainByEnemies![n]} Ultimate Energy
                    </option>
                  ))}
              </select>
            </div>
          </div>
        )}

        {isSequenced && event.columnId === 'ultimate' ? (
          /* ── Sequenced ultimate: Animation/Activation layout + frame data ── */
          readOnly ? (
          <>
            <div className="edit-panel-section">
              <span className="edit-section-label">Animation</span>
              <div className="edit-info-text">
                <div>{framesToSeconds(event.animationDuration ?? 0)}s ({event.animationDuration ?? 0}f)</div>
              </div>
            </div>

            <div className="edit-panel-section">
              <span className="edit-section-label">Activation</span>
              <div className="edit-info-text">
                <div>{framesToSeconds(event.activationDuration)}s ({event.activationDuration}f)</div>
              </div>
            </div>

            <div className="edit-panel-section">
              <span className="edit-section-label">Active Phase</span>
              <div className="edit-info-text">
                <div>{framesToSeconds(event.activeDuration)}s ({event.activeDuration}f)</div>
              </div>
              {event.segments!.map((seg, si) => (
                seg.frames && seg.frames.length > 0 && (
                  <div key={si} style={{ marginTop: 4 }}>
                    {seg.frames.map((f, fi) => {
                      const isSelected = selectedFrames?.some(
                        (sf) => sf.eventId === event.id && sf.segmentIndex === si && sf.frameIndex === fi,
                      ) ?? false;
                      return (
                        <div
                          key={fi}
                          ref={isSelected ? selectedFrameElRef : undefined}
                          style={{
                            padding: '1px 4px',
                            borderRadius: 2,
                            background: isSelected ? 'rgba(255, 221, 68, 0.15)' : 'transparent',
                            borderLeft: isSelected ? '2px solid #ffdd44' : '2px solid transparent',
                          }}
                        >
                          <span className="edit-field-label">Hit {fi + 1}</span>
                          <div className="edit-info-text" style={{ paddingLeft: '0.5rem' }}>
                            <div>Offset: {framesToSeconds(f.offsetFrame)}s ({f.offsetFrame}f)</div>
                            {(f.stagger ?? 0) > 0 && <div>Stagger: {f.stagger}</div>}
                            {(f.skillPointRecovery ?? 0) > 0 && <div>SP Recovery: {f.skillPointRecovery}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              ))}
            </div>

            {event.cooldownDuration > 0 && (
              <div className="edit-panel-section">
                <span className="edit-section-label">Cooldown</span>
                <div className="edit-info-text">
                  <div>{framesToSeconds(event.cooldownDuration)}s ({event.cooldownDuration}f)</div>
                </div>
              </div>
            )}
          </>
          ) : (
          <>
            <div className="edit-panel-section">
              <span className="edit-section-label">Animation</span>
              <DurationField label="Duration" value={animSec} onChange={setAnimSec} onCommit={handleBlur} />
            </div>

            <div className="edit-panel-section">
              <span className="edit-section-label">Activation</span>
              <DurationField label="Duration" value={activeSec} onChange={setActiveSec} onCommit={handleBlur} />
            </div>

            <div className="edit-panel-section">
              <span className="edit-section-label">Active Phase</span>
              <DurationField label="Duration" value={lingerSec} onChange={setLingerSec} onCommit={handleBlur} />
              {event.segments!.map((seg, si) => (
                seg.frames && seg.frames.length > 0 && (
                  <div key={si} style={{ marginTop: 4 }}>
                    {seg.frames.map((f, fi) => {
                      const isSelected = selectedFrames?.some(
                        (sf) => sf.eventId === event.id && sf.segmentIndex === si && sf.frameIndex === fi,
                      ) ?? false;
                      return (
                        <div
                          key={fi}
                          ref={isSelected ? selectedFrameElRef : undefined}
                          style={{
                            padding: '1px 4px',
                            borderRadius: 2,
                            background: isSelected ? 'rgba(255, 221, 68, 0.15)' : 'transparent',
                            borderLeft: isSelected ? '2px solid #ffdd44' : '2px solid transparent',
                          }}
                        >
                          <span className="edit-field-label">Hit {fi + 1}</span>
                          <FrameOffsetField
                            eventId={event.id}
                            segmentIndex={si}
                            frameIndex={fi}
                            offsetFrame={f.offsetFrame}
                            maxOffset={event.activeDuration}
                            onUpdate={onUpdate}
                            segments={event.segments}
                          />
                          <div className="edit-info-text" style={{ paddingLeft: '0.5rem' }}>
                            {(f.stagger ?? 0) > 0 && <div>Stagger: {f.stagger}</div>}
                            {(f.skillPointRecovery ?? 0) > 0 && <div>SP Recovery: {f.skillPointRecovery}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              ))}
            </div>

            <div className="edit-panel-section">
              <span className="edit-section-label">Cooldown</span>
              <DurationField label="Duration" value={cooldownSec} onChange={setCooldownSec} onCommit={handleBlur} />
            </div>

            <div className="edit-panel-section">
              <span className="edit-section-label">Info</span>
              <div className="edit-info-text">
                <div>Total: {framesToSeconds(event.activationDuration + event.activeDuration + event.cooldownDuration)}s</div>
                <div>Frames: {event.animationDuration ?? 0} / {event.activationDuration} / {event.activeDuration} / {event.cooldownDuration}</div>
              </div>
            </div>
          </>
          )
        ) : isSequenced ? (
          /* ── Standard sequenced event ── */
          <>
            {event.segments!.map((seg, si) => {
              const isNumericLabel = seg.label && /^\d+$/.test(seg.label);
              const segLabel = seg.label
                ? (isNumericLabel ? `Sequence ${seg.label}` : seg.label)
                : `Sequence ${si + 1}`;
              return (
                <div key={si} className="edit-panel-section">
                  <span className="edit-section-label">{segLabel}</span>
                  {readOnly ? (
                    <div className="edit-info-text">
                      <div>Duration: {framesToSeconds(seg.durationFrames)}s ({seg.durationFrames}f)</div>
                    </div>
                  ) : (
                    <SegmentDurationField
                      eventId={event.id}
                      segmentIndex={si}
                      durationFrames={seg.durationFrames}
                      onUpdate={onUpdate}
                      segments={event.segments!}
                    />
                  )}
                  {seg.frames && seg.frames.length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      {seg.frames.map((f, fi) => {
                        const isSelected = selectedFrames?.some(
                          (sf) => sf.eventId === event.id && sf.segmentIndex === si && sf.frameIndex === fi,
                        ) ?? false;
                        return (
                          <div
                            key={fi}
                            ref={isSelected ? selectedFrameElRef : undefined}
                            style={{
                              padding: '1px 4px',
                              borderRadius: 2,
                              background: isSelected ? 'rgba(255, 221, 68, 0.15)' : 'transparent',
                              borderLeft: isSelected ? '2px solid #ffdd44' : '2px solid transparent',
                            }}
                          >
                            <span className="edit-field-label">Hit {getHitNumber(seg.label, si, f.offsetFrame)}</span>
                            {readOnly ? (
                              <div className="edit-info-text">
                                <div>Offset: {framesToSeconds(f.offsetFrame)}s ({f.offsetFrame}f)</div>
                              </div>
                            ) : (
                              <FrameOffsetField
                                eventId={event.id}
                                segmentIndex={si}
                                frameIndex={fi}
                                offsetFrame={f.offsetFrame}
                                maxOffset={Math.max(0, seg.durationFrames - 1)}
                                onUpdate={onUpdate}
                                segments={event.segments!}
                              />
                            )}
                            <div className="edit-info-text" style={{ paddingLeft: '0.5rem' }}>
                              {f.isFinalStrike && (
                                <div style={{ color: '#f0a040' }}>Final Strike</div>
                              )}
                              {(f.skillPointRecovery ?? 0) > 0 && <div>SP Recovery: {f.skillPointRecovery}</div>}
                              {(f.stagger ?? 0) > 0 && <div>Stagger: {f.stagger}</div>}
                              {f.applyArtsInfliction && (
                                <div style={{ color: ELEMENT_COLORS[f.applyArtsInfliction.element as ElementType] ?? '#f07030' }}>
                                  Apply: {f.applyArtsInfliction.element} Infliction ×{f.applyArtsInfliction.stacks}
                                </div>
                              )}
                              {f.absorbArtsInfliction && (
                                <div style={{ color: ELEMENT_COLORS[f.absorbArtsInfliction.element as ElementType] ?? '#f0a040' }}>
                                  Absorb: {f.absorbArtsInfliction.element} Infliction (max {f.absorbArtsInfliction.stacks}) → {f.absorbArtsInfliction.exchangeStatus.replace(/_/g, ' ')} ({f.absorbArtsInfliction.ratio})
                                </div>
                              )}
                              {f.consumeArtsInfliction && (
                                <div style={{ color: ELEMENT_COLORS[f.consumeArtsInfliction.element as ElementType] ?? '#f0a040' }}>
                                  Consume: {f.consumeArtsInfliction.element} Infliction (max {f.consumeArtsInfliction.stacks})
                                </div>
                              )}
                              {f.applyStatus && (
                                <div style={{ color: ELEMENT_COLORS[STATUS_ELEMENT[f.applyStatus.status] as ElementType] ?? '#55aadd' }}>
                                  Apply: {STATUS_LABELS[f.applyStatus.status as StatusType] ?? f.applyStatus.status}{f.applyStatus.stacks > 0 ? ` ×${f.applyStatus.stacks}` : ''} → {f.applyStatus.target === 'ENEMY' ? 'Enemy' : f.applyStatus.target === 'SELF' ? ownerName : f.applyStatus.target}
                                </div>
                              )}
                              {f.applyForcedReaction && (
                                <div style={{ color: ELEMENT_COLORS[STATUS_ELEMENT[f.applyForcedReaction.reaction] as ElementType] ?? '#ff5522' }}>
                                  Apply: {STATUS_LABELS[f.applyForcedReaction.reaction as StatusType] ?? f.applyForcedReaction.reaction.replace(/_/g, ' ')} (Lv.{f.applyForcedReaction.statusLevel})
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {!readOnly && (
              <div className="edit-panel-section">
                <span className="edit-section-label">Cooldown</span>
                <DurationField label="Duration" value={cooldownSec} onChange={setCooldownSec} onCommit={handleBlur} />
              </div>
            )}

            <div className="edit-panel-section">
              <span className="edit-section-label">Summary</span>
              <div className="edit-info-text">
                <div>Sequences: {event.segments!.length}</div>
                <div>Active: {framesToSeconds(totalDurationFrames)}s ({totalDurationFrames}f)</div>
                {event.columnId === 'ultimate' && event.activeDuration > 0 && <div>Active: {framesToSeconds(event.activeDuration)}s ({event.activeDuration}f)</div>}
                {event.cooldownDuration > 0 && <div>Cooldown: {framesToSeconds(event.cooldownDuration)}s ({event.cooldownDuration}f)</div>}
              </div>
            </div>
          </>
        ) : readOnly ? (
          <div className="edit-panel-section">
            <span className="edit-section-label">Duration</span>
            <div className="edit-info-text">
              {event.columnId === 'ultimate' && event.animationDuration != null && event.animationDuration > 0 && (
                <div>Animation: {framesToSeconds(event.animationDuration)}s ({event.animationDuration}f)</div>
              )}
              <div>{event.columnId === 'ultimate' ? 'Activation' : 'Active'}: {framesToSeconds(event.activationDuration)}s ({event.activationDuration}f)</div>
              {event.columnId === 'ultimate' && event.activeDuration > 0 && <div>Active: {framesToSeconds(event.activeDuration)}s ({event.activeDuration}f)</div>}
              {event.cooldownDuration > 0 && <div>Cooldown: {framesToSeconds(event.cooldownDuration)}s ({event.cooldownDuration}f)</div>}
              <div>Total: {framesToSeconds(totalDurationFrames)}s</div>
            </div>
          </div>
        ) : (
          <>
            {event.columnId === 'ultimate' && (
              <div className="edit-panel-section">
                <span className="edit-section-label">Animation</span>
                <DurationField label="Duration" value={animSec} onChange={setAnimSec} onCommit={handleBlur} />
              </div>
            )}

            <div className="edit-panel-section">
              <span className="edit-section-label">{event.columnId === 'ultimate' ? 'Activation' : 'Active Phase'}</span>
              <DurationField label="Duration" value={activeSec} onChange={setActiveSec} onCommit={handleBlur} />
            </div>

            {event.columnId === 'ultimate' && (
              <div className="edit-panel-section">
                <span className="edit-section-label">Active Phase</span>
                <DurationField label="Duration" value={lingerSec} onChange={setLingerSec} onCommit={handleBlur} />
              </div>
            )}

            <div className="edit-panel-section">
              <span className="edit-section-label">Cooldown</span>
              <DurationField label="Duration" value={cooldownSec} onChange={setCooldownSec} onCommit={handleBlur} />
            </div>

            <div className="edit-panel-section">
              <span className="edit-section-label">Info</span>
              <div className="edit-info-text">
                <div>Active: {framesToSeconds(event.activationDuration)}s</div>
                <div>Total: {framesToSeconds(totalDurationFrames)}s</div>
                <div>Frames: {event.activationDuration} / {event.activeDuration} / {event.cooldownDuration}</div>
              </div>
            </div>
          </>
        )}
        </>
        )}
      </div>

      {!readOnly && !editContext?.startsWith('combo-trigger') && (
        <div className="edit-panel-footer">
          <button className="btn-delete-event" onClick={() => onRemove(event.id)}>
            REMOVE EVENT
          </button>
        </div>
      )}
    </>
  );
}

// ── Loadout pane content ────────────────────────────────────────────────────

interface LoadoutPaneProps {
  operator: Operator;
  loadout: OperatorLoadoutState;
  stats: LoadoutStats;
  onStatsChange: (stats: LoadoutStats) => void;
  onClose: () => void;
}

function LoadoutPane({ operator, loadout, stats, onStatsChange, onClose }: LoadoutPaneProps) {
  const set = (key: keyof LoadoutStats) => (v: number) =>
    onStatsChange({ ...stats, [key]: v });

  const weapon = loadout.weaponName !== null ? WEAPONS.find((w) => w.name === loadout.weaponName) ?? null : null;
  const armor  = loadout.armorName  !== null ? ARMORS.find((a) => a.name === loadout.armorName)   ?? null : null;
  const gloves = loadout.glovesName !== null ? GLOVES.find((g) => g.name === loadout.glovesName)  ?? null : null;
  const kit1   = loadout.kit1Name   !== null ? KITS.find((k) => k.name === loadout.kit1Name)      ?? null : null;
  const kit2   = loadout.kit2Name   !== null ? KITS.find((k) => k.name === loadout.kit2Name)      ?? null : null;
  const food   = loadout.consumableName !== null ? CONSUMABLES.find((c) => c.name === loadout.consumableName) ?? null : null;
  const tac    = loadout.tacticalName   !== null ? TACTICALS.find((t) => t.name === loadout.tacticalName)     ?? null : null;

  return (
    <>
      <div className="edit-panel-header">
        <div
          style={{
            width: 4, height: 40, borderRadius: 2, flexShrink: 0,
            background: operator.color,
            boxShadow: `0 0 8px ${operator.color}80`,
          }}
        />
        <div className="edit-panel-title-wrap">
          <div className="edit-panel-skill-name">{operator.name}</div>
          <div className="edit-panel-op-name" style={{ color: operator.color }}>
            {operator.role}
            <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>· LOADOUT</span>
          </div>
        </div>
        <button className="edit-panel-close" onClick={onClose}>×</button>
      </div>

      <div className="edit-panel-body">
        <div className="edit-panel-section">
          <span className="edit-section-label">Operator</span>
          <LevelSelect label="Operator Level"     value={stats.operatorLevel}     options={LEVEL_BREAKPOINTS} onChange={set('operatorLevel')} />
          <StatField   label="Potential"           value={stats.potential}         min={0} max={5}  onChange={set('potential')} />
          <StatField   label="Talent 1 Level"      value={stats.talentOneLevel}   min={0} max={operator.maxTalentOneLevel}  onChange={set('talentOneLevel')} />
          <StatField   label="Talent 2 Level"      value={stats.talentTwoLevel}   min={0} max={operator.maxTalentTwoLevel}  onChange={set('talentTwoLevel')} />
        </div>

        <div className="edit-panel-section">
          <span className="edit-section-label">Skills</span>
          <StatField label="Basic Attack Level"  value={stats.basicAttackLevel}  min={1} max={12} onChange={set('basicAttackLevel')} />
          <StatField label="Battle Skill Level"  value={stats.battleSkillLevel}  min={1} max={12} onChange={set('battleSkillLevel')} />
          <StatField label="Combo Skill Level"   value={stats.comboSkillLevel}   min={1} max={12} onChange={set('comboSkillLevel')} />
          <StatField label="Ultimate Level"      value={stats.ultimateLevel}     min={1} max={12} onChange={set('ultimateLevel')} />
        </div>

        {weapon && (
          <div className="edit-panel-section">
            <span className="edit-section-label">Weapon</span>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>{weapon.name}</div>
            <LevelSelect label="Weapon Level"    value={stats.weaponLevel}       options={LEVEL_BREAKPOINTS} onChange={set('weaponLevel')} />
            <StatField   label="Skill 1 Level"   value={stats.weaponSkill1Level} min={1} max={5}  onChange={set('weaponSkill1Level')} />
            <StatField   label="Skill 2 Level"   value={stats.weaponSkill2Level} min={1} max={5}  onChange={set('weaponSkill2Level')} />
            <StatField   label="Skill 3 Level"   value={stats.weaponSkill3Level} min={1} max={5}  onChange={set('weaponSkill3Level')} />
          </div>
        )}

        {(armor || gloves || kit1 || kit2) && (
          <div className="edit-panel-section">
            <span className="edit-section-label">Gear</span>
            {armor  && <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>{armor.name}</div>}
            {gloves && <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>{gloves.name}</div>}
            {kit1   && <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>{kit1.name}</div>}
            {kit2   && <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>{kit2.name}</div>}
            <StatField label="Gear Rank" value={stats.gearRank} min={1} max={4} onChange={set('gearRank')} />
          </div>
        )}

        {(food || tac) && (
          <div className="edit-panel-section">
            <span className="edit-section-label">Items</span>
            {food && <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>{food.name}</div>}
            {tac  && <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>{tac.name}</div>}
          </div>
        )}
      </div>
    </>
  );
}

// ── Resource pane content ────────────────────────────────────────────────────

interface ResourcePaneProps {
  label: string;
  color: string;
  config: ResourceConfig;
  onChange: (config: ResourceConfig) => void;
  onClose: () => void;
}

function ResourcePane({ label, color, config, onChange, onClose }: ResourcePaneProps) {
  return (
    <>
      <div className="edit-panel-header">
        <div
          style={{
            width: 4, height: 40, borderRadius: 2, flexShrink: 0,
            background: color,
            boxShadow: `0 0 8px ${color}80`,
          }}
        />
        <div className="edit-panel-title-wrap">
          <div className="edit-panel-skill-name">{label}</div>
          <div className="edit-panel-op-name" style={{ color }}>
            RESOURCE
          </div>
        </div>
        <button className="edit-panel-close" onClick={onClose}>×</button>
      </div>

      <div className="edit-panel-body">
        <div className="edit-panel-section">
          <span className="edit-section-label">Parameters</span>
          <StatField
            label="Starting Value"
            value={config.startValue}
            min={0}
            max={config.max}
            onChange={(v) => onChange({ ...config, startValue: v })}
          />
          <StatField
            label="Max Limit"
            value={config.max}
            min={1}
            max={99999}
            onChange={(v) => onChange({
              ...config,
              max: v,
              startValue: Math.min(config.startValue, v),
            })}
          />
          <StatField
            label="Regen / sec"
            value={config.regenPerSecond}
            min={0}
            max={9999}
            step={0.5}
            onChange={(v) => onChange({ ...config, regenPerSecond: v })}
          />
        </div>
      </div>
    </>
  );
}

// ── Unified information pane ────────────────────────────────────────────────

type InformationPaneProps = {
  pinned?: boolean;
  onTogglePin?: () => void;
  triggerClose?: boolean;
} & (
  | {
      mode: 'event';
      event: TimelineEvent;
      operators: Operator[];
      slots: { slotId: string; operator: Operator | null }[];
      enemy: Enemy;
      columns: Column[];
      onUpdate: (id: string, updates: Partial<TimelineEvent>) => void;
      onRemove: (id: string) => void;
      onClose: () => void;
      selectedFrames?: SelectedFrame[];
      readOnly?: boolean;
      editContext?: string | null;
    }
  | {
      mode: 'loadout';
      operator: Operator;
      loadout: OperatorLoadoutState;
      stats: LoadoutStats;
      onStatsChange: (stats: LoadoutStats) => void;
      onClose: () => void;
    }
  | {
      mode: 'resource';
      label: string;
      color: string;
      config: ResourceConfig;
      onChange: (config: ResourceConfig) => void;
      onClose: () => void;
    }
);

export default function InformationPane(props: InformationPaneProps) {
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => {
    setClosing(true);
  }, []);

  // Parent-triggered close (ignored when pinned)
  useEffect(() => {
    if (props.triggerClose && !closing && !props.pinned) setClosing(true);
  }, [props.triggerClose, closing, props.pinned]);

  useEffect(() => {
    if (!closing) return;
    const el = panelRef.current;
    if (!el) { props.onClose(); return; }
    const onEnd = () => props.onClose();
    el.addEventListener('animationend', onEnd, { once: true });
    return () => el.removeEventListener('animationend', onEnd);
  }, [closing, props.onClose]);

  return (
    <div
      ref={panelRef}
      className={`event-edit-panel${closing ? ' event-edit-panel--closing' : ''}`}
    >
      {props.onTogglePin && (
        <button
          className={`edit-panel-pin${props.pinned ? ' edit-panel-pin--active' : ''}`}
          onClick={props.onTogglePin}
          title={props.pinned ? 'Unpin panel' : 'Pin panel open'}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            {props.pinned ? (
              <path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1-.707.707l-.71-.71-2.836 2.836a6.6 6.6 0 0 1-.778 6.255.5.5 0 0 1-.756.054L6.22 11.836l-3.793 3.793a.5.5 0 0 1-.707-.707l3.793-3.793L2.395 8.004a.5.5 0 0 1 .054-.756A6.6 6.6 0 0 1 8.704 6.47l2.836-2.836-.71-.71a.5.5 0 0 1 .354-.854z"/>
            ) : (
              <path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1-.707.707l-.71-.71-2.836 2.836a6.6 6.6 0 0 1-.778 6.255.5.5 0 0 1-.756.054L6.22 11.836l-3.793 3.793a.5.5 0 0 1-.707-.707l3.793-3.793L2.395 8.004a.5.5 0 0 1 .054-.756A6.6 6.6 0 0 1 8.704 6.47l2.836-2.836-.71-.71a.5.5 0 0 1 .354-.854zm.146 1.56L7.449 4.81a.5.5 0 0 1-.513.13 5.6 5.6 0 0 0-5.363 1.362l7.125 7.125a5.6 5.6 0 0 0 1.362-5.363.5.5 0 0 1 .13-.513l2.526-2.525z"/>
            )}
          </svg>
        </button>
      )}
      {props.mode === 'event' ? (
        <EventPane
          event={props.event}
          operators={props.operators}
          slots={props.slots}
          enemy={props.enemy}
          columns={props.columns}
          onUpdate={props.onUpdate}
          onRemove={props.onRemove}
          onClose={handleClose}
          selectedFrames={props.selectedFrames}
          readOnly={props.readOnly}
          editContext={props.editContext}
        />
      ) : props.mode === 'loadout' ? (
        <LoadoutPane
          operator={props.operator}
          loadout={props.loadout}
          stats={props.stats}
          onStatsChange={props.onStatsChange}
          onClose={handleClose}
        />
      ) : (
        <ResourcePane
          label={props.label}
          color={props.color}
          config={props.config}
          onChange={props.onChange}
          onClose={handleClose}
        />
      )}
    </div>
  );
}
