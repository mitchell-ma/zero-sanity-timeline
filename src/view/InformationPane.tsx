import React, { useState, useEffect, useRef, useCallback } from 'react';
import { framesToSeconds, secondsToFrames, frameToDetailLabel, frameToTimeLabelPrecise, FPS, TimeMap, EMPTY_TIME_MAP } from '../utils/timeline';
import { SKILL_LABELS, REACTION_LABELS, COMBAT_SKILL_LABELS, STATUS_LABELS, INFLICTION_EVENT_LABELS, PHYSICAL_INFLICTION_LABELS, PHYSICAL_STATUS_LABELS, TRIGGER_CONDITION_LABELS } from '../consts/channelLabels';
import { CombatSkillsType, ELEMENT_COLORS, ElementType, HitType, StatType, StatusType, STATUS_ELEMENT, TriggerConditionType, WeaponSkillType } from '../consts/enums';
import { TimelineEvent, Operator, Enemy, SkillType, SelectedFrame, ResourceConfig, Column, MiniTimeline } from "../consts/viewTypes";
import { OperatorLoadoutState } from './OperatorLoadoutHeader';
import { WEAPONS, ARMORS, GLOVES, KITS, CONSUMABLES, TACTICALS } from '../utils/loadoutRegistry';
import { Gear } from '../model/gears/gear';
import { MODEL_FACTORIES } from '../controller/operators/operatorRegistry';
import { interpolateStats } from '../model/operators/operator';
import { interpolateAttack } from '../model/weapons/weapon';
import { aggregateLoadoutStats, weaponSkillStat } from '../controller/calculation/loadoutAggregator';
import { getWeaponEffects } from '../consts/weaponSkillEffects';

// ── Loadout stats type (shared across app) ──────────────────────────────────

export interface LoadoutStats {
  operatorLevel: number;
  potential: number;
  talentOneLevel: number;
  talentTwoLevel: number;
  attributeIncreaseLevel: number;
  basicAttackLevel: number;
  battleSkillLevel: number;
  comboSkillLevel: number;
  ultimateLevel: number;
  weaponLevel: number;
  weaponSkill1Level: number;
  weaponSkill2Level: number;
  weaponSkill3Level: number;
  /** Per-stat-line ranks for each gear piece. Keyed by StatType. Missing keys default to 4. */
  armorRanks: Record<string, number>;
  glovesRanks: Record<string, number>;
  kit1Ranks: Record<string, number>;
  kit2Ranks: Record<string, number>;
}

export const DEFAULT_LOADOUT_STATS: LoadoutStats = {
  operatorLevel: 90,
  potential: 5,
  talentOneLevel: 3,
  talentTwoLevel: 3,
  attributeIncreaseLevel: 4,
  basicAttackLevel: 12,
  battleSkillLevel: 12,
  comboSkillLevel: 12,
  ultimateLevel: 12,
  weaponLevel: 90,
  weaponSkill1Level: 9,
  weaponSkill2Level: 9,
  weaponSkill3Level: 9,
  armorRanks: {},
  glovesRanks: {},
  kit1Ranks: {},
  kit2Ranks: {},
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
  label: React.ReactNode;
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
  timeMap: TimeMap;
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
    const parsed = Number(sec);
    const newDuration = secondsToFrames(isNaN(parsed) ? 0 : parsed);
    if (newDuration === durationFrames) return;
    const newSegments = segments.map((s, i) =>
      i === segmentIndex ? { ...s, durationFrames: newDuration } : s,
    );
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
    const seg = segments[segmentIndex];
    const frames = seg?.frames;
    if (!frames) return;
    const parsed = Number(sec);
    const raw = secondsToFrames(isNaN(parsed) ? 0 : parsed);
    const lo = frameIndex > 0 ? frames[frameIndex - 1].offsetFrame : 0;
    const hi = frameIndex < frames.length - 1 ? frames[frameIndex + 1].offsetFrame : maxOffset;
    const newOffset = Math.max(lo, Math.min(hi, raw));
    setSec(framesToSeconds(newOffset));
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
  );
}

function EventPane({
  event,
  operators,
  enemy,
  columns,
  timeMap,
  onUpdate,
  onRemove,
  onClose,
  selectedFrames,
  slots,
  readOnly,
  editContext,
}: EventPaneProps) {
  const hasTimeStops = !timeMap.isEmpty();

  /** Format a game-time frame as a detail label, with real-time shown below when time-stops exist. */
  const dualTimeLabel = (gameFrame: number) => {
    if (!hasTimeStops) return frameToDetailLabel(gameFrame);
    const realFrame = timeMap.gameToReal(gameFrame);
    if (realFrame === gameFrame) return frameToDetailLabel(gameFrame);
    return `${frameToDetailLabel(gameFrame)} (real ${frameToDetailLabel(realFrame)})`;
  };

  /** Format a game-time frame as a precise label, with real-time when time-stops exist. */
  const dualTimePrecise = (gameFrame: number) => {
    if (!hasTimeStops) return frameToTimeLabelPrecise(gameFrame);
    const realFrame = timeMap.gameToReal(gameFrame);
    if (realFrame === gameFrame) return frameToTimeLabelPrecise(gameFrame);
    return <>{frameToTimeLabelPrecise(gameFrame)} <span style={{ color: 'var(--text-muted)' }}>(real {frameToTimeLabelPrecise(realFrame)})</span></>;
  };

  /** Format a game-time duration at a given start, showing real-time equivalent when different. */
  const dualDuration = (startFrame: number, durationFrames: number, label?: string): React.ReactNode => {
    const base = `${framesToSeconds(durationFrames)}s (${durationFrames}f)`;
    if (!hasTimeStops) return <>{label ? `${label}: ` : ''}{base}</>;
    const realDuration = timeMap.gameRangeToRealDuration(startFrame, durationFrames);
    if (realDuration === durationFrames) return <>{label ? `${label}: ` : ''}{base}</>;
    return <>
      Game time: {base}
      <br />
      <span style={{ color: 'var(--text-muted)' }}>Real time: {framesToSeconds(realDuration)}s ({realDuration}f)</span>
    </>;
  };

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
      if (event.columnId === 'dash') {
        skillName    = 'Dash';
        columnLabel  = 'DASH';
      } else if (event.columnId === 'melting-flame') {
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
  const [activePhaseSec,     setActivePhaseSec]     = useState(framesToSeconds(event.activeDuration));
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
    setActivePhaseSec(framesToSeconds(event.activeDuration));
    setCooldownSec(framesToSeconds(event.cooldownDuration));
  }, [event.id, event.startFrame, event.activationDuration, event.animationDuration, event.activeDuration, event.cooldownDuration]);

  const computedStartFrame = Math.max(0, (parseInt(startWholeSec) || 0) * FPS + (parseInt(startModFrame) || 0));

  const commit = () => {
    const toFrames = (v: string) => secondsToFrames(isNaN(Number(v)) ? 0 : Number(v));

    if (isSequenced) {
      onUpdate(event.id, {
        startFrame: computedStartFrame,
        activationDuration: toFrames(activeSec),
        activeDuration: toFrames(activePhaseSec),
        cooldownDuration: toFrames(cooldownSec),
        ...(event.columnId === 'ultimate' ? { animationDuration: toFrames(animSec) } : {}),
      });
    } else {
      onUpdate(event.id, {
        startFrame: computedStartFrame,
        activationDuration: toFrames(activeSec),
        activeDuration: toFrames(activePhaseSec),
        cooldownDuration: toFrames(cooldownSec),
        ...(event.columnId === 'ultimate' ? { animationDuration: toFrames(animSec) } : {}),
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
                  @ {dualTimeLabel(winStart)} — {framesToSeconds(winDuration)}s
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
                : event.eventStatus === 'extended' ? '#88cc44'
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
              @ {dualTimeLabel(event.startFrame)}
            </div>
          )}
        </div>
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
          <div style={{ padding: '4px 6px' }}>
            {readOnly ? (
              <div className="edit-info-text">
                <div>Start: {dualTimePrecise(event.startFrame)}</div>
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
                  = {dualTimePrecise(computedStartFrame)}
                </div>
              </div>
            )}
          </div>
        </div>

        {event.susceptibility && Object.keys(event.susceptibility).length > 0 && (
          <div className="edit-panel-section">
            <span className="edit-section-label">Susceptibility</span>
            <div className="edit-info-text">
              {Object.entries(event.susceptibility).map(([element, value]) => {
                const color = ELEMENT_COLORS[element.toUpperCase() as ElementType] ?? 'var(--text-muted)';
                const label = element.charAt(0).toUpperCase() + element.slice(1);
                return (
                  <div key={element}>
                    <span style={{ color }}>{label}</span>: {Math.round(value * 100)}%
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {event.columnId === 'dash' && (
          <div className="edit-panel-section">
            <span className="edit-section-label">Type</span>
            <div className="edit-info-text">
              {event.isPerfectDodge ? 'Dodge — Time Stop, +7.5 SP' : 'Dash'}
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

        {event.skillPointCost != null && (
          <div className="edit-panel-section">
            <span className="edit-section-label">SP Cost</span>
            <div style={{ padding: '4px 6px' }}>
              {readOnly ? (
                <div className="edit-info-text">{event.skillPointCost}</div>
              ) : (
                <div className="edit-field-row">
                  <input
                    className="edit-input"
                    type="text" inputMode="numeric"
                    value={event.skillPointCost}
                    onChange={(e) => {
                      const val = Math.max(0, Number(e.target.value) || 0);
                      onUpdate(event.id, { skillPointCost: val });
                    }}
                  />
                </div>
              )}
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
                <div>{dualDuration(event.startFrame, event.animationDuration ?? 0)}</div>
              </div>
            </div>

            <div className="edit-panel-section">
              <span className="edit-section-label">Activation</span>
              <div className="edit-info-text">
                <div>{dualDuration(event.startFrame, event.activationDuration)}</div>
              </div>
            </div>

            <div className="edit-panel-section">
              <span className="edit-section-label">Active Phase</span>
              <div className="edit-info-text">
                <div>{dualDuration(event.startFrame + event.activationDuration, event.activeDuration)}</div>
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
                          <div className="edit-info-text">
                            <div>Offset: {framesToSeconds(f.offsetFrame)}s ({f.offsetFrame}f)</div>
                            {(f.stagger ?? 0) > 0 && <div>Stagger: {f.stagger}</div>}
                            {(f.skillPointRecovery ?? 0) > 0 && <div>SP Recovery: {Math.round(f.skillPointRecovery! * 100) / 100}</div>}
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
                <div style={{ padding: '4px 6px' }}>
                  <div className="edit-info-text">
                    <div>{dualDuration(event.startFrame + event.activationDuration + event.activeDuration, event.cooldownDuration)}</div>
                  </div>
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
              <DurationField label="Duration" value={activePhaseSec} onChange={setActivePhaseSec} onCommit={handleBlur} />
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
                          <div className="edit-info-text">
                            {(f.stagger ?? 0) > 0 && <div>Stagger: {f.stagger}</div>}
                            {(f.skillPointRecovery ?? 0) > 0 && <div>SP Recovery: {Math.round(f.skillPointRecovery! * 100) / 100}</div>}
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
              <div style={{ padding: '4px 6px' }}>
                <DurationField label="Duration" value={cooldownSec} onChange={setCooldownSec} onCommit={handleBlur} />
              </div>
            </div>

            <div className="edit-panel-section">
              <span className="edit-section-label">Info</span>
              <div className="edit-info-text">
                <div>{dualDuration(event.startFrame, event.activationDuration + event.activeDuration + event.cooldownDuration, 'Total')}</div>
                <div>Frames: {event.animationDuration ?? 0} / {event.activationDuration} / {event.activeDuration} / {event.cooldownDuration}</div>
              </div>
            </div>
          </>
          )
        ) : isSequenced ? (
          /* ── Standard sequenced event ── */
          <>
            {(() => { let segCumOffset = 0; return event.segments!.map((seg, si) => {
              const segStartFrame = event.startFrame + segCumOffset;
              segCumOffset += seg.durationFrames;
              const isNumericLabel = seg.label && /^\d+$/.test(seg.label);
              const segLabel = seg.label
                ? (isNumericLabel ? `Sequence ${seg.label}` : seg.label)
                : `Sequence ${si + 1}`;
              return (
                <div key={si} className="edit-panel-section">
                  <span className="edit-section-label">{segLabel}</span>
                  <div style={{ padding: '4px 6px' }}>
                    {readOnly ? (
                      <div className="edit-info-text">
                        <div>{dualDuration(segStartFrame, seg.durationFrames, 'Duration')}</div>
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
                  </div>
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
                              padding: '4px 6px',
                              borderRadius: 3,
                              background: isSelected ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                            }}
                          >
                            <span className="edit-field-label">Hit {fi + 1}</span>
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
                            <div className="edit-info-text">
                              {event.columnId === 'basic' && (
                                readOnly ? (
                                  <div>Type: {f.hitType === HitType.FINAL_STRIKE ? 'Final Strike' : 'Normal'}</div>
                                ) : (
                                  <>
                                    <div>Type:</div>
                                    <div className="edit-field-row">
                                      <select
                                        className="edit-input"
                                        value={f.hitType ?? HitType.NORMAL}
                                        onChange={(e) => {
                                          const newHitType = e.target.value as HitType;
                                          const newSegments = event.segments!.map((s, ssi) => {
                                            if (ssi !== si || !s.frames) return s;
                                            return { ...s, frames: s.frames.map((fr, ffi) =>
                                              ffi === fi ? { ...fr, hitType: newHitType } : fr,
                                            )};
                                          });
                                          onUpdate(event.id, { segments: newSegments });
                                        }}
                                      >
                                        <option value={HitType.NORMAL}>Normal</option>
                                        <option value={HitType.FINAL_STRIKE}>Final Strike</option>
                                      </select>
                                    </div>
                                  </>
                                )
                              )}
                              {f.hitType === HitType.FINAL_STRIKE && (
                                readOnly ? (
                                  <>
                                    {(f.skillPointRecovery ?? 0) > 0 && <div>SP Recovery: {Math.round(f.skillPointRecovery! * 100) / 100}</div>}
                                    {(f.stagger ?? 0) > 0 && <div>Stagger: {f.stagger}</div>}
                                  </>
                                ) : (
                                  <>
                                    <div>SP Recovery:</div>
                                    <div className="edit-field-row">
                                      <input
                                        className="edit-input"
                                        type="text" inputMode="numeric"
                                        value={f.skillPointRecovery ?? 0}
                                        onChange={(e) => {
                                          const val = Math.max(0, Number(e.target.value) || 0);
                                          const newSegments = event.segments!.map((s, ssi) => {
                                            if (ssi !== si || !s.frames) return s;
                                            return { ...s, frames: s.frames.map((fr, ffi) =>
                                              ffi === fi ? { ...fr, skillPointRecovery: val } : fr,
                                            )};
                                          });
                                          onUpdate(event.id, { segments: newSegments });
                                        }}
                                      />
                                    </div>
                                    <div>Stagger:</div>
                                    <div className="edit-field-row">
                                      <input
                                        className="edit-input"
                                        type="text" inputMode="numeric"
                                        value={f.stagger ?? 0}
                                        onChange={(e) => {
                                          const val = Math.max(0, Number(e.target.value) || 0);
                                          const newSegments = event.segments!.map((s, ssi) => {
                                            if (ssi !== si || !s.frames) return s;
                                            return { ...s, frames: s.frames.map((fr, ffi) =>
                                              ffi === fi ? { ...fr, stagger: val } : fr,
                                            )};
                                          });
                                          onUpdate(event.id, { segments: newSegments });
                                        }}
                                      />
                                    </div>
                                  </>
                                )
                              )}
                              {f.hitType !== HitType.FINAL_STRIKE && (f.stagger ?? 0) > 0 && (
                                readOnly || event.columnId === 'basic' ? (
                                  <div>Stagger: {f.stagger}</div>
                                ) : (
                                  <>
                                    <div>Stagger:</div>
                                    <div className="edit-field-row">
                                      <input
                                        className="edit-input"
                                        type="text" inputMode="numeric"
                                        value={f.stagger ?? 0}
                                        onChange={(e) => {
                                          const val = Math.max(0, Number(e.target.value) || 0);
                                          const newSegments = event.segments!.map((s, ssi) => {
                                            if (ssi !== si || !s.frames) return s;
                                            return { ...s, frames: s.frames.map((fr, ffi) =>
                                              ffi === fi ? { ...fr, stagger: val } : fr,
                                            )};
                                          });
                                          onUpdate(event.id, { segments: newSegments });
                                        }}
                                      />
                                    </div>
                                  </>
                                )
                              )}
                              {f.applyArtsInfliction && (
                                <div style={{ color: ELEMENT_COLORS[f.applyArtsInfliction.element as ElementType] ?? '#f07030' }}>
                                  Apply: {f.applyArtsInfliction.element.charAt(0) + f.applyArtsInfliction.element.slice(1).toLowerCase()} Infliction ×{f.applyArtsInfliction.stacks}
                                </div>
                              )}
                              {f.absorbArtsInfliction && (
                                <div style={{ color: ELEMENT_COLORS[f.absorbArtsInfliction.element as ElementType] ?? '#f0a040' }}>
                                  {(() => { const [a, b] = f.absorbArtsInfliction!.ratio.split(':').map(Number); const el = f.absorbArtsInfliction!.element.charAt(0) + f.absorbArtsInfliction!.element.slice(1).toLowerCase(); const status = f.absorbArtsInfliction!.exchangeStatus.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()); return `Absorb: ${a} ${el} → ${b} ${status} (max ${f.absorbArtsInfliction!.stacks})`; })()}
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
            }); })()}

            {!readOnly && (
              <div className="edit-panel-section">
                <span className="edit-section-label">Cooldown</span>
                <div style={{ padding: '4px 6px' }}>
                  <DurationField label="Duration" value={cooldownSec} onChange={setCooldownSec} onCommit={handleBlur} />
                </div>
              </div>
            )}

            <div className="edit-panel-section">
              <span className="edit-section-label">Summary</span>
              <div className="edit-info-text" style={{ paddingLeft: 6 }}>
                <div>Sequences: {event.segments!.length}</div>
                <div>{dualDuration(event.startFrame, totalDurationFrames, 'Time')}</div>
                {event.columnId === 'ultimate' && event.activeDuration > 0 && <div>{dualDuration(event.startFrame + event.activationDuration, event.activeDuration, 'Active phase')}</div>}
                {event.cooldownDuration > 0 && <div>{dualDuration(event.startFrame + event.activationDuration + event.activeDuration, event.cooldownDuration, 'Cooldown')}</div>}
              </div>
            </div>
          </>
        ) : readOnly ? (
          <div className="edit-panel-section">
            <span className="edit-section-label">Duration</span>
            <div className="edit-info-text">
              {event.columnId === 'ultimate' && event.animationDuration != null && event.animationDuration > 0 && (
                <div>{dualDuration(event.startFrame, event.animationDuration, 'Animation')}</div>
              )}
              <div>{dualDuration(event.startFrame, event.activationDuration, event.columnId === 'ultimate' ? 'Activation' : 'Time')}</div>
              {event.columnId === 'ultimate' && event.activeDuration > 0 && <div>{dualDuration(event.startFrame + event.activationDuration, event.activeDuration, 'Time')}</div>}
              {event.cooldownDuration > 0 && <div>{dualDuration(event.startFrame + event.activationDuration + event.activeDuration, event.cooldownDuration, 'Cooldown')}</div>}
              {(event.activeDuration > 0 || event.cooldownDuration > 0) && <div>{dualDuration(event.startFrame, totalDurationFrames, 'Total')}</div>}
            </div>
          </div>
        ) : event.columnId === 'dash' ? (
          <div className="edit-panel-section">
            <span className="edit-section-label">Duration</span>
            <DurationField label="Duration" value={activeSec} onChange={setActiveSec} onCommit={handleBlur} />
            <div className="edit-info-text" style={{ marginTop: 4 }}>
              <div>{event.activationDuration}f</div>
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
                <DurationField label="Duration" value={activePhaseSec} onChange={setActivePhaseSec} onCommit={handleBlur} />
              </div>
            )}

            <div className="edit-panel-section">
              <span className="edit-section-label">Cooldown</span>
              <div style={{ padding: '4px 6px' }}>
                <DurationField label="Duration" value={cooldownSec} onChange={setCooldownSec} onCommit={handleBlur} />
              </div>
            </div>

            <div className="edit-panel-section">
              <span className="edit-section-label">Info</span>
              <div className="edit-info-text">
                <div>{dualDuration(event.startFrame, event.activationDuration, 'Time')}</div>
                <div>{dualDuration(event.startFrame, totalDurationFrames, 'Total')}</div>
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

/** Human-readable labels for StatType values. */
const STAT_LABELS: Record<StatType, string> = {
  [StatType.ATTACK]: 'ATK (Base)',
  [StatType.ATTACK_BONUS]: 'ATK%',
  [StatType.STRENGTH]: 'Strength',
  [StatType.STRENGTH_BONUS]: 'Strength%',
  [StatType.AGILITY]: 'Agility',
  [StatType.AGILITY_BONUS]: 'Agility%',
  [StatType.INTELLECT]: 'Intellect',
  [StatType.INTELLECT_BONUS]: 'Intellect%',
  [StatType.WILL]: 'Will',
  [StatType.WILL_BONUS]: 'Will%',
  [StatType.CRITICAL_RATE]: 'Crit Rate',
  [StatType.CRITICAL_DAMAGE]: 'Crit DMG',
  [StatType.ARTS_INTENSITY]: 'Arts Intensity',
  [StatType.PHYSICAL_RESISTANCE]: 'Phys RES',
  [StatType.HEAT_RESISTANCE]: 'Heat RES',
  [StatType.ELECTRIC_RESISTANCE]: 'Elec RES',
  [StatType.CRYO_RESISTANCE]: 'Cryo RES',
  [StatType.NATURE_RESISTANCE]: 'Nature RES',
  [StatType.AETHER_RESISTANCE]: 'Aether RES',
  [StatType.TREATMENT_BONUS]: 'Treatment',
  [StatType.TREATMENT_RECEIVED_BONUS]: 'Treatment Recv',
  [StatType.COMBO_SKILL_COOLDOWN_REDUCTION]: 'Combo CD Red',
  [StatType.ULTIMATE_GAIN_EFFICIENCY]: 'Ult Gain Eff',
  [StatType.STAGGER_EFFICIENCY_BONUS]: 'Stagger Eff',
  [StatType.PHYSICAL_DAMAGE_BONUS]: 'Phys DMG%',
  [StatType.HEAT_DAMAGE_BONUS]: 'Heat DMG%',
  [StatType.ELECTRIC_DAMAGE_BONUS]: 'Elec DMG%',
  [StatType.CRYO_DAMAGE_BONUS]: 'Cryo DMG%',
  [StatType.NATURE_DAMAGE_BONUS]: 'Nature DMG%',
  [StatType.BASIC_ATTACK_DAMAGE_BONUS]: 'Basic ATK DMG%',
  [StatType.BATTLE_SKILL_DAMAGE_BONUS]: 'Battle Skill DMG%',
  [StatType.COMBO_SKILL_DAMAGE_BONUS]: 'Combo Skill DMG%',
  [StatType.ULTIMATE_DAMAGE_BONUS]: 'Ultimate DMG%',
  [StatType.STAGGER_DAMAGE_BONUS]: 'Stagger DMG%',
  [StatType.FINAL_DAMAGE_REDUCTION]: 'Final DMG Red',
  [StatType.SKILL_DAMAGE_BONUS]: 'Skill DMG%',
  [StatType.ARTS_DAMAGE_BONUS]: 'Arts DMG%',
  [StatType.HP_BONUS]: 'HP%',
};

/** Stats that represent percentages (displayed as %). */
const PERCENT_STATS = new Set<StatType>([
  StatType.ATTACK_BONUS, StatType.STRENGTH_BONUS, StatType.AGILITY_BONUS,
  StatType.INTELLECT_BONUS, StatType.WILL_BONUS,
  StatType.CRITICAL_RATE, StatType.CRITICAL_DAMAGE, StatType.ARTS_INTENSITY,
  StatType.PHYSICAL_RESISTANCE, StatType.HEAT_RESISTANCE, StatType.ELECTRIC_RESISTANCE,
  StatType.CRYO_RESISTANCE, StatType.NATURE_RESISTANCE, StatType.AETHER_RESISTANCE,
  StatType.TREATMENT_BONUS, StatType.TREATMENT_RECEIVED_BONUS,
  StatType.COMBO_SKILL_COOLDOWN_REDUCTION, StatType.ULTIMATE_GAIN_EFFICIENCY,
  StatType.STAGGER_EFFICIENCY_BONUS,
  StatType.PHYSICAL_DAMAGE_BONUS, StatType.HEAT_DAMAGE_BONUS, StatType.ELECTRIC_DAMAGE_BONUS,
  StatType.CRYO_DAMAGE_BONUS, StatType.NATURE_DAMAGE_BONUS,
  StatType.BASIC_ATTACK_DAMAGE_BONUS, StatType.BATTLE_SKILL_DAMAGE_BONUS,
  StatType.COMBO_SKILL_DAMAGE_BONUS, StatType.ULTIMATE_DAMAGE_BONUS,
  StatType.STAGGER_DAMAGE_BONUS,
  StatType.FINAL_DAMAGE_REDUCTION, StatType.SKILL_DAMAGE_BONUS, StatType.ARTS_DAMAGE_BONUS,
  StatType.HP_BONUS,
]);

function formatStatValue(stat: StatType, value: number): string {
  if (PERCENT_STATS.has(stat)) return `${(value * 100).toFixed(2)}%`;
  return value.toFixed(2);
}



const statRowStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
  padding: '1px 0', fontSize: 11,
};
const statLabelStyle: React.CSSProperties = {
  color: 'var(--text-secondary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em',
};
const statValueStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', textAlign: 'right',
};

interface LoadoutPaneProps {
  operatorId: string;
  operator: Operator;
  loadout: OperatorLoadoutState;
  stats: LoadoutStats;
  onStatsChange: (stats: LoadoutStats) => void;
  onClose: () => void;
}

function LoadoutPane({ operatorId, operator, loadout, stats, onStatsChange, onClose }: LoadoutPaneProps) {
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
      </div>

      <div className="edit-panel-body">
        <div className="edit-panel-section">
          <span className="edit-section-label">Operator</span>
          <StatField   label={<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>Operator Level</span>}     value={stats.operatorLevel}     min={1} max={90}  onChange={set('operatorLevel')} />
          <StatField   label={<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>Potential</span>}           value={stats.potential}         min={0} max={5}  onChange={set('potential')} />
          <StatField   label={<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>Talent 1 Level</span>}      value={stats.talentOneLevel}   min={0} max={operator.maxTalentOneLevel}  onChange={set('talentOneLevel')} />
          <StatField   label={<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>Talent 2 Level</span>}      value={stats.talentTwoLevel}   min={0} max={operator.maxTalentTwoLevel}  onChange={set('talentTwoLevel')} />
          <StatField   label={<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>Attribute Increase ({operator.attributeIncreaseName})</span>}  value={stats.attributeIncreaseLevel}  min={0} max={4}  onChange={set('attributeIncreaseLevel')} />
          {(() => {
            const factory = MODEL_FACTORIES[operatorId];
            if (!factory) return null;
            const model = factory();
            const lvStats = interpolateStats(model.baseStats, stats.operatorLevel);
            const potStats = model.getPotentialStats(stats.potential);
            // Merge potential bonuses and attribute increase into base stats for display
            const merged: Partial<Record<string, number>> = { ...lvStats };
            for (const [k, v] of Object.entries(potStats)) {
              merged[k] = (merged[k] ?? 0) + (v as number);
            }
            const attrInc = model.getAttributeIncrease(stats.attributeIncreaseLevel ?? 4);
            if (attrInc > 0) {
              const attr = model.attributeIncreaseAttribute;
              merged[attr] = (merged[attr] ?? 0) + attrInc;
            }
            const rows = Object.entries(merged).map(([k, v]) => (
              <div key={k} style={statRowStyle}>
                <span style={statLabelStyle}>{STAT_LABELS[k as StatType] ?? k}</span>
                <span style={statValueStyle}>
                  {typeof v === 'number' && PERCENT_STATS.has(k as StatType) ? `${(v * 100).toFixed(2)}%` : typeof v === 'number' ? v.toFixed(2) : v}
                </span>
              </div>
            ));
            // Show ATK Bonus as flat value (baseATK * ATK%) right after ATK (Base)
            const agg = aggregateLoadoutStats(operatorId, loadout, stats);
            if (agg) {
              const atkPct = agg.stats[StatType.ATTACK_BONUS];
              const totalBaseAtk = agg.operatorBaseAttack + agg.weaponBaseAttack;
              const flatBonus = totalBaseAtk * atkPct;
              const atkBonusRow = (
                <div key="atk-bonus" style={statRowStyle}>
                  <span style={statLabelStyle}>ATK Bonus</span>
                  <span style={statValueStyle}>{flatBonus.toFixed(2)}</span>
                </div>
              );
              // Insert after ATK (Base) row (first entry is ATTACK)
              const atkIdx = Object.keys(merged).indexOf(StatType.ATTACK);
              if (atkIdx >= 0) {
                rows.splice(atkIdx + 1, 0, atkBonusRow);
              } else {
                rows.push(atkBonusRow);
              }
            }
            return rows;
          })()}
        </div>

        <div className="edit-panel-section">
          <span className="edit-section-label">Skills</span>
          <StatField label={<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>Basic Attack Level</span>}  value={stats.basicAttackLevel}  min={1} max={12} onChange={set('basicAttackLevel')} />
          <StatField label={<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>Battle Skill Level</span>}  value={stats.battleSkillLevel}  min={1} max={12} onChange={set('battleSkillLevel')} />
          <StatField label={<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>Combo Skill Level</span>}   value={stats.comboSkillLevel}   min={1} max={12} onChange={set('comboSkillLevel')} />
          <StatField label={<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>Ultimate Level</span>}      value={stats.ultimateLevel}     min={1} max={12} onChange={set('ultimateLevel')} />
        </div>

        {weapon && (
          <div className="edit-panel-section">
            <span className="edit-section-label">Weapon</span>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em' }}>{weapon.name}</div>
            <StatField   label={<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>Weapon Level</span>}    value={stats.weaponLevel}       min={1} max={90}  onChange={set('weaponLevel')} />
            {(() => {
              const wpn = weapon.create();
              const factory = MODEL_FACTORIES[operatorId];
              const mainAttr = factory ? factory().mainAttributeType : StatType.STRENGTH;
              const allSkills = [wpn.weaponSkillOne, wpn.weaponSkillTwo, wpn.weaponSkillThree];
              const levelKeys: (keyof LoadoutStats)[] = ['weaponSkill1Level', 'weaponSkill2Level', 'weaponSkill3Level'];
              const levelValues = [stats.weaponSkill1Level, stats.weaponSkill2Level, stats.weaponSkill3Level];
              const elements: React.ReactNode[] = [];

              // Skill level editors
              for (let i = 0; i < allSkills.length; i++) {
                const sk = allSkills[i];
                if (!sk) continue;
                const skillName = sk.weaponSkillType.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
                elements.push(
                  <StatField
                    key={`skill-${i}`}
                    label={<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>Skill {i + 1} ({skillName})</span>}
                    value={levelValues[i]}
                    min={1} max={9}
                    onChange={set(levelKeys[i])}
                  />
                );
              }

              // Base ATK
              const baseAtk = interpolateAttack(wpn.baseAttack, stats.weaponLevel);
              elements.push(
                <div key="base-atk" style={{ ...statRowStyle, marginTop: 4 }}>
                  <span style={statLabelStyle}>ATK (Base)</span>
                  <span style={statValueStyle}>{baseAtk.toFixed(2)}</span>
                </div>
              );

              // Per-skill stat contribution rows
              for (let i = 0; i < allSkills.length; i++) {
                const sk = allSkills[i];
                if (!sk) continue;
                sk.level = levelValues[i];
                const stat = weaponSkillStat(sk.weaponSkillType as WeaponSkillType, mainAttr);
                if (stat != null) {
                  const value = sk.getValue();
                  if (value !== 0) {
                    elements.push(
                      <div key={`stat-${i}`} style={statRowStyle}>
                        <span style={statLabelStyle}>Skill {i + 1}: {STAT_LABELS[stat] ?? stat}</span>
                        <span style={statValueStyle}>{formatStatValue(stat, value)}</span>
                      </div>
                    );
                  }
                }
              }

              // Named skill effect stat rows (skill 3 / triggered effects)
              const effects = getWeaponEffects(weapon.name);
              if (effects) {
                const sk3 = wpn.weaponSkillThree;
                const effectGroups = sk3?.getNamedEffectGroups?.() ?? null;

                for (let ei = 0; ei < effects.effects.length; ei++) {
                  const eff = effects.effects[ei];
                  const group = effectGroups?.[ei] ?? null;

                  // Skill 3 header with label
                  const headerLabel = effects.effects.length === 1
                    ? `Skill 3: ${eff.label}`
                    : `Skill 3: ${eff.label}`;
                  elements.push(
                    <div key={`eff-hdr-${ei}`} style={{ ...statRowStyle, marginTop: ei === 0 ? 4 : 8 }}>
                      <span style={statLabelStyle}>{headerLabel}</span>
                    </div>
                  );

                  // Buff stat lines with actual values (or fallback to min-max range)
                  for (let bi = 0; bi < eff.buffs.length; bi++) {
                    const b = eff.buffs[bi];
                    const statLabel = typeof b.stat === 'string' ? b.stat : (STAT_LABELS[b.stat] ?? b.stat);
                    const isPercent = PERCENT_STATS.has(b.stat as StatType);
                    const stackLabel = b.perStack ? '/stack' : '';

                    // Use model value if available, otherwise show min-max range
                    const modelStat = group?.stats[bi];
                    let valStr: string;
                    if (modelStat && modelStat.value !== 0) {
                      valStr = isPercent
                        ? `${(modelStat.value * 100).toFixed(2)}%`
                        : modelStat.value.toFixed(2);
                    } else {
                      valStr = isPercent
                        ? `${(b.valueMin * 100).toFixed(2)}–${(b.valueMax * 100).toFixed(2)}%`
                        : `${b.valueMin}–${b.valueMax}`;
                    }

                    // Duration annotation on first buff line
                    const durationSuffix = bi === 0 ? ` (${eff.durationSeconds}s)` : '';
                    elements.push(
                      <div key={`eff-${ei}-${bi}`} style={statRowStyle}>
                        <span style={statLabelStyle}>{statLabel}{durationSuffix}</span>
                        <span style={statValueStyle}>{valStr}{stackLabel}</span>
                      </div>
                    );
                  }

                  // Meta line for stacks, cooldown, notes
                  const metaParts = [
                    eff.maxStacks > 1 ? `${eff.maxStacks} stacks` : '',
                    eff.cooldownSeconds > 0 ? `${eff.cooldownSeconds}s CD` : '',
                  ].filter(Boolean);
                  if (eff.note || metaParts.length > 0) {
                    const metaStr = [eff.note, ...metaParts].filter(Boolean).join(' · ');
                    elements.push(
                      <div key={`eff-meta-${ei}`} style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4, marginBottom: 2 }}>
                        {metaStr}
                      </div>
                    );
                  }
                }
              }

              return elements;
            })()}
          </div>
        )}

        {(armor || gloves || kit1 || kit2) && (
          <div className="edit-panel-section">
            <span className="edit-section-label">Gear</span>
            {(() => {
              const agg = aggregateLoadoutStats(operatorId, loadout, stats);
              if (!agg?.gearSetActive || !agg.gearSetType) return null;
              return (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em' }}>
                    Set: {agg.gearSetType.replace(/_/g, ' ')}
                  </div>
                  {agg.gearSetDescription && (
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.4 }}>
                      {agg.gearSetDescription}
                    </div>
                  )}
                </div>
              );
            })()}
            {([
              { entry: armor,  registry: ARMORS, ranksKey: 'armorRanks' as const },
              { entry: gloves, registry: GLOVES, ranksKey: 'glovesRanks' as const },
              { entry: kit1,   registry: KITS,   ranksKey: 'kit1Ranks' as const },
              { entry: kit2,   registry: KITS,   ranksKey: 'kit2Ranks' as const },
            ] as const).map(({ entry, registry, ranksKey }) => {
              if (!entry) return null;
              const gear: Gear = entry.create();
              gear.rank = 4;
              const statKeys = gear.getStatKeys();
              const ranks = stats[ranksKey] ?? {};
              const resolvedStats = gear.getStatsPerLine(ranks);
              return (
                <React.Fragment key={ranksKey}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em', marginTop: 6 }}>{entry.name}</div>
                  {statKeys.map((statType) => (
                    <StatField
                      key={statType}
                      label={<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>{STAT_LABELS[statType] ?? statType}</span>}
                      value={ranks[statType] ?? 4}
                      min={1}
                      max={4}
                      onChange={(v) => onStatsChange({ ...stats, [ranksKey]: { ...ranks, [statType]: v } })}
                    />
                  ))}
                  {statKeys.map((statType) => (
                    <div key={`val-${statType}`} style={statRowStyle}>
                      <span style={statLabelStyle}>{STAT_LABELS[statType] ?? statType}</span>
                      <span style={statValueStyle}>{formatStatValue(statType, resolvedStats[statType] ?? 0)}</span>
                    </div>
                  ))}
                </React.Fragment>
              );
            })}
          </div>
        )}

        {(food || tac) && (
          <div className="edit-panel-section">
            <span className="edit-section-label">Items</span>
            {food && <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>{food.name}</div>}
            {tac  && <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>{tac.name}</div>}
          </div>
        )}

        <AggregatedStatsSection operatorId={operatorId} loadout={loadout} stats={stats} color={operator.color} />
      </div>
    </>
  );
}

/** Stat display groups matching in-game layout. */
const STAT_ATTRIBUTES: StatType[] = [
  StatType.STRENGTH, StatType.AGILITY, StatType.INTELLECT, StatType.WILL,
  StatType.STRENGTH_BONUS, StatType.AGILITY_BONUS, StatType.INTELLECT_BONUS, StatType.WILL_BONUS,
];


const STAT_OTHER: StatType[] = [
  StatType.CRITICAL_RATE, StatType.CRITICAL_DAMAGE, StatType.ARTS_INTENSITY,
  StatType.TREATMENT_BONUS, StatType.TREATMENT_RECEIVED_BONUS,
  StatType.COMBO_SKILL_COOLDOWN_REDUCTION, StatType.ULTIMATE_GAIN_EFFICIENCY,
  StatType.STAGGER_EFFICIENCY_BONUS, StatType.STAGGER_DAMAGE_BONUS,
  StatType.PHYSICAL_DAMAGE_BONUS, StatType.HEAT_DAMAGE_BONUS, StatType.ELECTRIC_DAMAGE_BONUS,
  StatType.CRYO_DAMAGE_BONUS, StatType.NATURE_DAMAGE_BONUS, StatType.ARTS_DAMAGE_BONUS,
  StatType.BASIC_ATTACK_DAMAGE_BONUS, StatType.BATTLE_SKILL_DAMAGE_BONUS,
  StatType.COMBO_SKILL_DAMAGE_BONUS, StatType.ULTIMATE_DAMAGE_BONUS,
  StatType.SKILL_DAMAGE_BONUS,
  StatType.FINAL_DAMAGE_REDUCTION,
  StatType.PHYSICAL_RESISTANCE, StatType.HEAT_RESISTANCE, StatType.ELECTRIC_RESISTANCE,
  StatType.CRYO_RESISTANCE, StatType.NATURE_RESISTANCE, StatType.AETHER_RESISTANCE,
];

function AggregatedStatsSection({ operatorId, loadout, stats, color }: {
  operatorId: string; loadout: OperatorLoadoutState; stats: LoadoutStats; color: string;
}) {
  const agg = aggregateLoadoutStats(operatorId, loadout, stats);
  if (!agg) return null;

  return (
    <>
      <div className="edit-panel-section">
        <span className="edit-section-label">Main Stats</span>
        <div style={{ ...statRowStyle, fontWeight: 600, fontSize: 12 }}>
          <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>HP</span>
          <span style={statValueStyle}>—</span>
        </div>
        <div style={{ ...statRowStyle, fontWeight: 600, fontSize: 12, marginTop: 4 }}>
          <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>ATK</span>
          <span style={statValueStyle}>{agg.effectiveAttack.toFixed(2)}</span>
        </div>
        <div style={{ borderLeft: '2px solid var(--text-muted)', marginLeft: 4, paddingLeft: 8 }}>
          <div style={{ ...statRowStyle, fontWeight: 600, fontSize: 11, marginTop: 2 }}>
            <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>Base ATK</span>
            <span style={statValueStyle}>{agg.baseAttack.toFixed(2)}</span>
          </div>
          <div style={{ borderLeft: '2px solid var(--text-muted)', marginLeft: 4, paddingLeft: 8 }}>
            <div style={statRowStyle}>
              <span style={statLabelStyle}>Operator</span>
              <span style={statValueStyle}>{agg.operatorBaseAttack.toFixed(2)}</span>
            </div>
            <div style={statRowStyle}>
              <span style={statLabelStyle}>Weapon</span>
              <span style={statValueStyle}>{agg.weaponBaseAttack.toFixed(2)}</span>
            </div>
          </div>
          <div style={{ ...statRowStyle, fontWeight: 600, fontSize: 11, marginTop: 2 }}>
            <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>ATK Bonus</span>
            <span style={statValueStyle}>{agg.atkPercentageBonus.toFixed(2)}</span>
          </div>
          <div style={{ borderLeft: '2px solid var(--text-muted)', marginLeft: 4, paddingLeft: 8 }}>
            <div style={statRowStyle}>
              <span style={statLabelStyle}>Percentage Bonus</span>
              <span style={statValueStyle}>{formatStatValue(StatType.ATTACK_BONUS, agg.atkBonus)} → {agg.atkPercentageBonus.toFixed(2)}</span>
            </div>
          </div>
          <div style={{ ...statRowStyle, fontWeight: 600, fontSize: 11, marginTop: 2 }}>
            <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>Attribute Bonus</span>
            <span style={statValueStyle}>{((agg.mainAttributeBonus + agg.secondaryAttributeBonus) * 100).toFixed(2)}%</span>
          </div>
          <div style={{ borderLeft: '2px solid var(--text-muted)', marginLeft: 4, paddingLeft: 8 }}>
            <div style={statRowStyle}>
              <span style={statLabelStyle}>ATK bonus from {STAT_LABELS[agg.mainAttributeType]}</span>
              <span style={statValueStyle}>{(agg.mainAttributeBonus * 100).toFixed(2)}%</span>
            </div>
            <div style={statRowStyle}>
              <span style={statLabelStyle}>ATK bonus from {STAT_LABELS[agg.secondaryAttributeType]}</span>
              <span style={statValueStyle}>{(agg.secondaryAttributeBonus * 100).toFixed(2)}%</span>
            </div>
          </div>
        </div>
        <div style={{ ...statRowStyle, fontWeight: 600, fontSize: 12, marginTop: 4 }}>
          <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>Defense</span>
          <span style={statValueStyle}>—</span>
        </div>
      </div>

      <div className="edit-panel-section">
        <span className="edit-section-label">Attributes</span>
        {STAT_ATTRIBUTES.map((stat) => {
          const value = agg.stats[stat];
          return (
            <div key={stat} style={statRowStyle}>
              <span style={statLabelStyle}>{STAT_LABELS[stat]}</span>
              <span style={{ ...statValueStyle, color: value !== 0 ? undefined : 'var(--text-muted)' }}>
                {value !== 0 ? formatStatValue(stat, value) : '—'}
              </span>
            </div>
          );
        })}
      </div>

      <div className="edit-panel-section">
        <span className="edit-section-label">Other Stats</span>
        {STAT_OTHER.map((stat) => {
          const raw = agg.stats[stat];
          const value = stat === StatType.ULTIMATE_GAIN_EFFICIENCY ? raw + 1 : raw;
          return (
            <div key={stat} style={statRowStyle}>
              <span style={statLabelStyle}>{STAT_LABELS[stat]}</span>
              <span style={{ ...statValueStyle, color: raw !== 0 ? undefined : 'var(--text-muted)' }}>
                {raw !== 0 ? formatStatValue(stat, value) : '—'}
              </span>
            </div>
          );
        })}
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
      timeMap?: TimeMap;
      onUpdate: (id: string, updates: Partial<TimelineEvent>) => void;
      onRemove: (id: string) => void;
      onClose: () => void;
      selectedFrames?: SelectedFrame[];
      readOnly?: boolean;
      editContext?: string | null;
    }
  | {
      mode: 'loadout';
      operatorId: string;
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
      <div className="edit-panel-actions">
        {props.onTogglePin && (
          <button
            className={`edit-panel-pin${props.pinned ? ' edit-panel-pin--active' : ''}`}
            onClick={props.onTogglePin}
            title={props.pinned ? 'Unpin panel' : 'Pin panel open'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 17v5"/>
              <path d="M5 12H19"/>
              <path d="M15 3L9 3L8.5 7.5L7 9.5V12H17V9.5L15.5 7.5Z" fill={props.pinned ? 'currentColor' : 'none'}/>
            </svg>
          </button>
        )}
        <button className="edit-panel-close" onClick={handleClose}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      {props.mode === 'event' ? (
        <EventPane
          event={props.event}
          operators={props.operators}
          slots={props.slots}
          enemy={props.enemy}
          columns={props.columns}
          timeMap={props.timeMap ?? EMPTY_TIME_MAP}
          onUpdate={props.onUpdate}
          onRemove={props.onRemove}
          onClose={handleClose}
          selectedFrames={props.selectedFrames}
          readOnly={props.readOnly}
          editContext={props.editContext}
        />
      ) : props.mode === 'loadout' ? (
        <LoadoutPane
          operatorId={props.operatorId}
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
