import React, { useState, useEffect, useRef, useCallback } from 'react';
import { framesToSeconds, secondsToFrames, frameToDetailLabel, frameToTimeLabelPrecise, FPS } from '../utils/timeline';
import { SKILL_LABELS, REACTION_LABELS, COMBAT_SKILL_LABELS, STATUS_LABELS, INFLICTION_EVENT_LABELS, PHYSICAL_INFLICTION_LABELS, PHYSICAL_STATUS_LABELS, TRIGGER_CONDITION_LABELS } from '../consts/channelLabels';
import { CombatSkillsType, ELEMENT_COLORS, ElementType, HitType, StatType, StatusType, STATUS_ELEMENT, TriggerConditionType, WeaponSkillType } from '../consts/enums';
import { TimelineEvent, Operator, Enemy, SkillType, SelectedFrame, ResourceConfig, Column, MiniTimeline } from "../consts/viewTypes";
import { OperatorLoadoutState } from './OperatorLoadoutHeader';
import { WEAPONS, ARMORS, GLOVES, KITS, CONSUMABLES, TACTICALS } from '../utils/loadoutRegistry';
import { Gear } from '../model/gears/gear';
import { MODEL_FACTORIES } from '../controller/operators/operatorRegistry';
import { interpolateAttack } from '../model/weapons/weapon';
import { aggregateLoadoutStats, weaponSkillStat } from '../controller/calculation/loadoutAggregator';
import { getWeaponEffects } from '../consts/weaponSkillEffects';
import { COMBO_WINDOW_COLUMN_ID } from '../controller/timeline/processInflictions';
import { EnemyStats, getDefaultEnemyStats } from '../controller/appStateController';
import { getModelEnemy, getEnemyLevels } from '../controller/calculation/enemyRegistry';
import { EnemyStatType } from '../consts/enums';

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
  /** Override for tactical max uses. undefined = use model default. */
  tacticalMaxUses?: number;
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
const REPEAT_DELAY = 200;
/** Interval between repeats (ms). */
const REPEAT_INTERVAL = 300;

function StatField({ label, value, min, max, step = 1, holdStep, holdSnaps, holdInterval, showMinMax, onChange }: {
  label: React.ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Step size when holding the button (defaults to step). */
  holdStep?: number;
  /** Snap points when holding (overrides holdStep). Snaps to next/prev value in list. */
  holdSnaps?: number[];
  /** Interval between repeats in ms (defaults to REPEAT_INTERVAL). */
  holdInterval?: number;
  /** Show min/max snap buttons. */
  showMinMax?: boolean;
  onChange: (v: number) => void;
}) {
  const valueRef = useRef(value);
  valueRef.current = value;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const didRepeatRef = useRef(false);

  const stopRepeat = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  const startRepeat = useCallback((direction: 1 | -1) => {
    stopRepeat();
    didRepeatRef.current = false;
    timerRef.current = setTimeout(() => {
      didRepeatRef.current = true;
      intervalRef.current = setInterval(() => {
        const cur = valueRef.current;
        let next: number;
        if (holdSnaps) {
          if (direction > 0) {
            next = holdSnaps.find((s) => s > cur) ?? max;
          } else {
            next = [...holdSnaps].reverse().find((s) => s < cur) ?? min;
          }
        } else {
          next = +(cur + direction * (holdStep ?? step)).toFixed(10);
        }
        next = Math.max(min, Math.min(max, next));
        if (next !== cur) onChange(next);
      }, holdInterval ?? REPEAT_INTERVAL);
    }, REPEAT_DELAY);
  }, [min, max, step, holdStep, holdSnaps, holdInterval, onChange, stopRepeat]);

  // Clean up on unmount
  useEffect(() => stopRepeat, [stopRepeat]);

  return (
    <div className="stat-field">
      <span className="edit-field-label">{label}</span>
      <div className="stat-field-controls">
        {showMinMax && (
          <button tabIndex={-1} className="stat-arrow stat-arrow--minmax" disabled={value <= min} onClick={() => onChange(min)}>⏮</button>
        )}
        <button
          tabIndex={-1}
          className="stat-arrow"
          disabled={value <= min}
          onClick={() => { if (!didRepeatRef.current) onChange(Math.max(min, +(value - step).toFixed(10))); }}
          onMouseDown={() => startRepeat(-1)}
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
          tabIndex={-1}
          className="stat-arrow"
          disabled={value >= max}
          onClick={() => { if (!didRepeatRef.current) onChange(Math.min(max, +(value + step).toFixed(10))); }}
          onMouseDown={() => startRepeat(1)}
          onMouseUp={stopRepeat}
          onMouseLeave={stopRepeat}
        >+</button>
        {showMinMax && (
          <button tabIndex={-1} className="stat-arrow stat-arrow--minmax" disabled={value >= max} onClick={() => onChange(max)}>⏭</button>
        )}
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
  processedEvent?: TimelineEvent;
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
  debugMode?: boolean;
  rawEvents?: readonly TimelineEvent[];
  allProcessedEvents?: readonly TimelineEvent[];
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
  processedEvent,
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
  debugMode,
  rawEvents,
  allProcessedEvents,
}: EventPaneProps) {
  /** Format a real-time frame as a detail label. */
  const dualTimeLabel = (frame: number) => frameToDetailLabel(frame);

  /** Format a real-time frame as a precise label. */
  const dualTimePrecise = (frame: number) => frameToTimeLabelPrecise(frame);

  /** Format a duration (game-time metadata). */
  const dualDuration = (_startFrame: number, durationFrames: number, label?: string): React.ReactNode => {
    const base = `${framesToSeconds(durationFrames)}s (${durationFrames}f)`;
    return <>{label ? `${label}: ` : ''}{base}</>;
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
      } else if (event.columnId === COMBO_WINDOW_COLUMN_ID) {
        skillName   = 'Combo Activation Window';
        columnLabel = 'ACTIVATION WINDOW';
      } else {
        const skillType = event.columnId as SkillType;
        const skill = op.skills[skillType];
        if (skill) {
          skillName        = skill.name;
          triggerCondition = skill.triggerCondition;
          columnLabel     = (event.columnId.charAt(0).toUpperCase() + event.columnId.slice(1) + ' skill');
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

  const processedTotalDurationFrames = processedEvent
    ? (processedEvent.segments && processedEvent.segments.length > 0
        ? processedEvent.segments.reduce((sum, s) => sum + s.durationFrames, 0)
        : processedEvent.activationDuration + processedEvent.activeDuration + processedEvent.cooldownDuration)
    : totalDurationFrames;

  const hasTimeStopDiff = processedTotalDurationFrames !== totalDurationFrames;



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
          {(() => (
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
          ))()}
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
        {debugMode && processedEvent && (
          <DebugPane event={event} processedEvent={processedEvent} rawEvents={rawEvents} allProcessedEvents={allProcessedEvents} />
        )}
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

        {event.skillPointCost != null && (() => {
          let totalSp = 0;
          let totalGauge = 0;
          let totalTeamGauge = 0;
          if (event.columnId === 'battle' && event.segments) {
            for (const seg of event.segments) {
              if (!seg.frames) continue;
              for (const f of seg.frames) {
                if (f.skillPointRecovery) totalSp += f.skillPointRecovery;
                if (f.gaugeGain) totalGauge += f.gaugeGain;
                if (f.teamGaugeGain) totalTeamGauge += f.teamGaugeGain;
              }
            }
          }
          const spCost = event.skillPointCost ?? 100;
          const netSp = Math.max(0, spCost - totalSp);
          const gaugeReduction = totalSp > 0 && spCost > 0 ? Math.max(0, (spCost - totalSp) / spCost) : 1;
          const gauge = event.gaugeGain ?? totalGauge;
          const teamGauge = event.teamGaugeGain ?? totalTeamGauge;
          const slot = slots.find((s) => s.slotId === event.ownerId);
          const spNotes = slot?.operator?.skills.battle.spReturnNotes;
          const spInfo = (
            <div className="edit-info-text">
              {totalSp > 0 && <div>Return: {Math.round(totalSp * 100) / 100} (net: {Math.round(netSp * 100) / 100})</div>}
              {gauge > 0 && <div>Ult Gauge: +{Math.round(gauge * 100) / 100}{totalSp > 0 && gaugeReduction < 1 ? ` (×${Math.round(gaugeReduction * 100)}% from net SP)` : ''}</div>}
              {teamGauge > 0 && <div>Team Gauge: +{Math.round(teamGauge * 100) / 100}{totalSp > 0 && gaugeReduction < 1 ? ` (×${Math.round(gaugeReduction * 100)}% from net SP)` : ''}</div>}
              {spNotes && spNotes.map((note, i) => (
                <div key={i} style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{note}</div>
              ))}
            </div>
          );
          return (
            <div className="edit-panel-section">
              <span className="edit-section-label">SP</span>
              <div style={{ padding: '4px 6px' }}>
                {readOnly ? (
                  <>
                    <div className="edit-info-text"><div>Cost: {event.skillPointCost}</div></div>
                    {spInfo}
                  </>
                ) : (
                  <>
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
                    {spInfo}
                  </>
                )}
              </div>
            </div>
          );
        })()}

        {isSequenced && event.columnId === 'ultimate' ? (
          /* ── Sequenced ultimate: Animation/Statis layout + frame data ── */
          readOnly ? (
          <>
            <div className="edit-panel-section">
              <span className="edit-section-label">Animation</span>
              <div className="edit-info-text">
                <div>{dualDuration(event.startFrame, event.animationDuration ?? 0)}</div>
              </div>
            </div>

            <div className="edit-panel-section">
              <span className="edit-section-label">Statis</span>
              <div className="edit-info-text">
                <div>{dualDuration(event.startFrame + (event.animationDuration ?? 0), event.activationDuration - (event.animationDuration ?? 0))}</div>
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
                            {(f.gaugeGain ?? 0) > 0 && <div>Ult Gauge: +{Math.round(f.gaugeGain! * 100) / 100}</div>}
                            {(f.teamGaugeGain ?? 0) > 0 && <div>Team Gauge: +{Math.round(f.teamGaugeGain! * 100) / 100}</div>}
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
              <span className="edit-section-label">Statis</span>
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
                            {(f.gaugeGain ?? 0) > 0 && <div>Ult Gauge: +{Math.round(f.gaugeGain! * 100) / 100}</div>}
                            {(f.teamGaugeGain ?? 0) > 0 && <div>Team Gauge: +{Math.round(f.teamGaugeGain! * 100) / 100}</div>}
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
                <div>Frames: {event.animationDuration ?? 0} / {event.activationDuration - (event.animationDuration ?? 0)} / {event.activeDuration} / {event.cooldownDuration}</div>
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
                              {(f.gaugeGain ?? 0) > 0 && <div>Ult Gauge: +{Math.round(f.gaugeGain! * 100) / 100}</div>}
                              {(f.teamGaugeGain ?? 0) > 0 && <div>Team Gauge: +{Math.round(f.teamGaugeGain! * 100) / 100}</div>}
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
                {hasTimeStopDiff && <div>{dualDuration(event.startFrame, processedTotalDurationFrames, 'Time with time-stop')}</div>}
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
              {event.columnId === 'ultimate' ? (
                <div>{dualDuration(event.startFrame + (event.animationDuration ?? 0), event.activationDuration - (event.animationDuration ?? 0), 'Statis')}</div>
              ) : (
                <div>{dualDuration(event.startFrame, event.activationDuration, 'Time')}</div>
              )}
              {event.columnId === 'ultimate' && event.activeDuration > 0 && <div>{dualDuration(event.startFrame + event.activationDuration, event.activeDuration, 'Active')}</div>}
              {event.cooldownDuration > 0 && <div>{dualDuration(event.startFrame + event.activationDuration + event.activeDuration, event.cooldownDuration, 'Cooldown')}</div>}
              {(event.activeDuration > 0 || event.cooldownDuration > 0) && <div>{dualDuration(event.startFrame, totalDurationFrames, 'Total')}</div>}
              {hasTimeStopDiff && <div>{dualDuration(event.startFrame, processedTotalDurationFrames, 'Total with time-stop')}</div>}
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
              <span className="edit-section-label">{event.columnId === 'ultimate' ? 'Statis' : 'Active Phase'}</span>
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
                {hasTimeStopDiff && <div>{dualDuration(event.startFrame, processedTotalDurationFrames, 'Total with time-stop')}</div>}
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

// ── Debug pane ──────────────────────────────────────────────────────────────

function DebugPane({ event, processedEvent, rawEvents, allProcessedEvents }: { event: TimelineEvent; processedEvent: TimelineEvent; rawEvents?: readonly TimelineEvent[]; allProcessedEvents?: readonly TimelineEvent[] }) {
  const rawSegs = event.segments ?? [];
  const derivedSegs = processedEvent.segments ?? [];

  const hasSegDiff = rawSegs.length !== derivedSegs.length
    || rawSegs.some((s, i) => s.durationFrames !== derivedSegs[i]?.durationFrames);
  const hasDurationDiff = event.activationDuration !== processedEvent.activationDuration
    || event.activeDuration !== processedEvent.activeDuration;

  const fmt = (f: number) => `${framesToSeconds(f)}s (${f}f)`;
  const fmtAbs = (f: number) => `${f} (${framesToSeconds(f)}s, f${f % 120})`;

  return (
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, lineHeight: 1.6, padding: '4px 6px', color: 'var(--text-muted)' }}>
      {(hasSegDiff || hasDurationDiff) && (
        <div style={{ color: '#ffdd44', fontSize: 9, fontWeight: 600, marginBottom: 4 }}>(time-stop diff)</div>
      )}
      {/* Event-level */}
      <div style={{ marginBottom: 6 }}>
        <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: 2 }}>Event</div>
        <div>id: {event.id}</div>
        <div>startFrame: {event.startFrame} ({framesToSeconds(event.startFrame)}s, f{event.startFrame % 120})</div>
        <div>columnId: {event.columnId}</div>
        {event.animationDuration != null && <div>animationDuration: {fmt(event.animationDuration)}</div>}
        <DebugDiffRow label="activationDuration" raw={event.activationDuration} derived={processedEvent.activationDuration} />
        <DebugDiffRow label="activeDuration" raw={event.activeDuration} derived={processedEvent.activeDuration} />
        <div>cooldownDuration: {fmt(event.cooldownDuration)}</div>
        {event.timeInteraction != null && <div>timeInteraction: {event.timeInteraction}</div>}
        {event.timeStop != null && <div>timeStop: {event.timeStop}</div>}
        {event.timeDependency != null && <div>timeDependency: {event.timeDependency}</div>}
        {event.isPerfectDodge && <div>isPerfectDodge: true</div>}
        {event.nonOverlappableRange != null && <div>nonOverlappableRange: {fmt(event.nonOverlappableRange)}</div>}
        {event.sourceOwnerId != null && <div>sourceOwnerId: {event.sourceOwnerId}</div>}
        {processedEvent.warnings && processedEvent.warnings.length > 0 && (
          <div style={{ color: '#ff5522', marginTop: 2 }}>
            {processedEvent.warnings.map((w, i) => <div key={i}>WARNING: {w}</div>)}
          </div>
        )}
      </div>

      {/* Time-stop region */}
      {event.animationDuration != null && event.animationDuration > 0 && (
        event.columnId === 'ultimate' || event.columnId === 'combo' ||
        (event.columnId === 'dash' && event.isPerfectDodge)
      ) && (() => {
        const rawStart = event.startFrame;
        const rawEnd = rawStart + event.animationDuration!;
        const procEnd = rawStart + (processedEvent.animationDuration ?? event.animationDuration!);
        const hasAbsDiff = procEnd !== rawEnd;
        return (
          <div style={{ marginBottom: 6 }}>
            <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: 2 }}>Time Stop</div>
            <div>duration: {fmt(event.animationDuration!)}</div>
            <div>raw: {fmtAbs(rawStart)} → {fmtAbs(rawEnd)}</div>
            {hasAbsDiff && (
              <div style={{ color: '#ffdd44' }}>abs: {fmtAbs(rawStart)} → {fmtAbs(procEnd)}</div>
            )}
          </div>
        );
      })()}

      {/* Segments */}
      {(rawSegs.length > 0 || derivedSegs.length > 0) && (
        <div>
          <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: 2 }}>
            Segments ({derivedSegs.length})
          </div>
          {derivedSegs.map((dSeg, si) => {
            const rSeg = rawSegs[si];
            const segStart = processedEvent.startFrame + derivedSegs.slice(0, si).reduce((s, seg) => s + seg.durationFrames, 0);
            return (
              <div key={si} style={{ marginBottom: 6, paddingLeft: 8, borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ color: 'var(--text-primary)' }}>
                  [{si}] {dSeg.label ?? `Seg ${si + 1}`} @ {fmtAbs(segStart)}
                </div>
                <DebugDiffRow
                  label="durationFrames"
                  raw={rSeg?.durationFrames}
                  derived={dSeg.durationFrames}
                />
                {dSeg.timeDependency != null && <div>timeDependency: {dSeg.timeDependency}</div>}

                {/* Frames */}
                {dSeg.frames && dSeg.frames.length > 0 && (
                  <div style={{ marginTop: 2 }}>
                    {dSeg.frames.map((dFrame, fi) => {
                      const rFrame = rSeg?.frames?.[fi];
                      return (
                        <div key={fi} style={{ paddingLeft: 8, borderLeft: '1px solid rgba(255,255,255,0.05)', marginBottom: 2 }}>
                          <div>
                            <span style={{ color: 'var(--text-primary)' }}>Frame {fi}</span>
                            {' '}offset: {fmt(dFrame.offsetFrame)}
                            {dFrame.derivedOffsetFrame != null && dFrame.derivedOffsetFrame !== dFrame.offsetFrame && (
                              <span style={{ color: '#ffdd44' }}>
                                {' '}→ {fmt(dFrame.derivedOffsetFrame)} (+{fmt(dFrame.derivedOffsetFrame - dFrame.offsetFrame)})
                              </span>
                            )}
                          </div>
                          {dFrame.absoluteFrame != null && (
                            <div>
                              <span style={{ color: '#88cc44' }}>
                                abs: {fmtAbs(dFrame.absoluteFrame)}
                              </span>
                              {rFrame && (() => {
                                const rawAbs = event.startFrame + (rawSegs.slice(0, si).reduce((s, seg) => s + seg.durationFrames, 0)) + rFrame.offsetFrame;
                                return rawAbs !== dFrame.absoluteFrame ? (
                                  <span style={{ color: '#ffdd44' }}>
                                    {' '}(raw: {fmtAbs(rawAbs)}, +{fmt(dFrame.absoluteFrame - rawAbs)})
                                  </span>
                                ) : null;
                              })()}
                            </div>
                          )}
                          {dFrame.skillPointRecovery != null && <div>sp: {dFrame.skillPointRecovery}</div>}
                          {dFrame.stagger != null && <div>stagger: {dFrame.stagger}</div>}
                          {dFrame.applyArtsInfliction && (
                            <div>inflict: {dFrame.applyArtsInfliction.element}x{dFrame.applyArtsInfliction.stacks}</div>
                          )}
                          {dFrame.absorbArtsInfliction && (
                            <div>absorb: {dFrame.absorbArtsInfliction.element}x{dFrame.absorbArtsInfliction.stacks}</div>
                          )}
                          {dFrame.applyStatus && (
                            <div>status: {dFrame.applyStatus.status}</div>
                          )}
                          {dFrame.gaugeGain != null && <div>gauge: {dFrame.gaugeGain}</div>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Non-segmented (3-phase) summary */}
      {rawSegs.length === 0 && derivedSegs.length === 0 && (
        <div style={{ color: 'var(--text-muted)' }}>
          3-phase event (no segments)
        </div>
      )}

      {/* Controller Objects */}
      {(rawEvents || allProcessedEvents) && (() => {
        const rawIds = rawEvents ? new Set(rawEvents.map((ev) => ev.id)) : null;
        const derived = allProcessedEvents
          ? allProcessedEvents.filter((ev) => rawIds ? !rawIds.has(ev.id) : !!ev.sourceOwnerId)
          : [];
        return (
          <div style={{ marginTop: 6 }}>
            <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: 2 }}>
              Controller Objects
            </div>

            {rawEvents && (
              <div style={{ marginBottom: 6 }}>
                <div style={{ color: '#88cc44', fontWeight: 600, marginBottom: 2 }}>
                  Raw Events ({rawEvents.length})
                </div>
                {rawEvents.map((ev) => (
                  <div key={ev.id} style={{ paddingLeft: 8, borderLeft: '1px solid rgba(255,255,255,0.08)', marginBottom: 2 }}>
                    <span style={{ color: 'var(--text-primary)' }}>{ev.id}</span>
                    {' '}{ev.ownerId}:{ev.columnId} @ {ev.startFrame}f
                    {' '}{ev.name}
                    {' '}<span style={{ color: 'var(--text-muted)' }}>[{fmt(ev.activationDuration)}]</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginBottom: 6 }}>
              <div style={{ color: '#dd8844', fontWeight: 600, marginBottom: 2 }}>
                Derived Events ({derived.length})
              </div>
              {derived.map((ev) => (
                <div key={ev.id} style={{ paddingLeft: 8, borderLeft: '1px solid rgba(255,255,255,0.08)', marginBottom: 2 }}>
                  <span style={{ color: 'var(--text-primary)' }}>{ev.id}</span>
                  {' '}{ev.ownerId}:{ev.columnId} @ {ev.startFrame}f
                  {' '}{ev.name}
                  {' '}<span style={{ color: 'var(--text-muted)' }}>[{fmt(ev.activationDuration)}]</span>
                  {ev.sourceOwnerId && <span style={{ color: '#88cc44' }}> ← {ev.sourceOwnerId}</span>}
                  {ev.eventStatus && <span style={{ color: '#ffdd44' }}> ({ev.eventStatus})</span>}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

    </div>
  );
}

/** Shows raw vs derived value, highlighted if they differ. */
function DebugDiffRow({ label, raw, derived }: { label: string; raw?: number; derived?: number }) {
  const fmt = (f: number) => `${framesToSeconds(f)}s (${f}f)`;
  if (raw == null && derived == null) return null;
  const differs = raw != null && derived != null && raw !== derived;
  return (
    <div>
      {label}: {derived != null ? fmt(derived) : '—'}
      {differs && (
        <span style={{ color: '#ffdd44' }}>
          {' '}(raw: {fmt(raw!)}, +{fmt(derived! - raw!)})
        </span>
      )}
    </div>
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
  slotId: string;
  operator: Operator;
  loadout: OperatorLoadoutState;
  stats: LoadoutStats;
  onStatsChange: (stats: LoadoutStats) => void;
  onClose: () => void;
  allProcessedEvents?: readonly TimelineEvent[];
}

function LoadoutPane({ operatorId, slotId, operator, loadout, stats, onStatsChange, onClose, allProcessedEvents }: LoadoutPaneProps) {
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
          <StatField   label={<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>Operator Level</span>}     value={stats.operatorLevel}     min={1} max={90}  holdSnaps={[1, 10, 20, 30, 40, 50, 60, 70, 80, 90]} showMinMax onChange={set('operatorLevel')} />
          <StatField   label={<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>Potential</span>}           value={stats.potential}         min={0} max={5}  showMinMax onChange={set('potential')} />
        </div>

        <div className="edit-panel-section">
          <span className="edit-section-label">Talents</span>
          <StatField   label={<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>{operator.attributeIncreaseName}</span>}  value={stats.attributeIncreaseLevel}  min={0} max={operator.maxAttributeIncreaseLevel}  showMinMax onChange={set('attributeIncreaseLevel')} />
          <StatField   label={<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>{operator.talentOneName}</span>}      value={stats.talentOneLevel}   min={0} max={operator.maxTalentOneLevel}  showMinMax onChange={set('talentOneLevel')} />
          <StatField   label={<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>{operator.talentTwoName}</span>}      value={stats.talentTwoLevel}   min={0} max={operator.maxTalentTwoLevel}  showMinMax onChange={set('talentTwoLevel')} />
        </div>

        <div className="edit-panel-section">
          <span className="edit-section-label">Skills</span>
          <StatField label={<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>Basic Attack Level</span>}  value={stats.basicAttackLevel}  min={1} max={12} holdSnaps={[1, 3, 6, 9, 12]} showMinMax onChange={set('basicAttackLevel')} />
          <StatField label={<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>Battle Skill Level</span>}  value={stats.battleSkillLevel}  min={1} max={12} holdSnaps={[1, 3, 6, 9, 12]} showMinMax onChange={set('battleSkillLevel')} />
          <StatField label={<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>Combo Skill Level</span>}   value={stats.comboSkillLevel}   min={1} max={12} holdSnaps={[1, 3, 6, 9, 12]} showMinMax onChange={set('comboSkillLevel')} />
          <StatField label={<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>Ultimate Level</span>}      value={stats.ultimateLevel}     min={1} max={12} holdSnaps={[1, 3, 6, 9, 12]} showMinMax onChange={set('ultimateLevel')} />
        </div>

        {weapon && (
          <div className="edit-panel-section">
            <span className="edit-section-label">Weapon</span>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em' }}>{weapon.name}</div>
            <StatField   label={<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>Weapon Level</span>}    value={stats.weaponLevel}       min={1} max={90}  holdSnaps={[1, 10, 20, 30, 40, 50, 60, 70, 80, 90]} showMinMax onChange={set('weaponLevel')} />
            {(() => {
              const wpn = weapon.create();
              const factory = MODEL_FACTORIES[operatorId];
              const operatorModel = factory ? factory(stats.operatorLevel) : null;
              const mainAttr = operatorModel?.mainAttributeType ?? StatType.STRENGTH;
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
                    holdSnaps={[1, 3, 6, 9]}
                    showMinMax
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
                } else {
                  // Named/unique skills — show passive stats from getPassiveStats()
                  const passiveStats = sk.getPassiveStats();
                  for (const [key, value] of Object.entries(passiveStats)) {
                    if ((value as number) !== 0) {
                      elements.push(
                        <div key={`stat-${i}-${key}`} style={statRowStyle}>
                          <span style={statLabelStyle}>Skill {i + 1}: {STAT_LABELS[key as StatType] ?? key}</span>
                          <span style={statValueStyle}>{formatStatValue(key as StatType, value as number)}</span>
                        </div>
                      );
                    }
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
                  elements.push(
                    <div key={`eff-hdr-${ei}`} style={{ ...statRowStyle, marginTop: ei === 0 ? 4 : 8 }}>
                      <span style={statLabelStyle}>Skill 3: {eff.label}</span>
                    </div>
                  );

                  // Wiki description of the triggered effect
                  if (eff.description) {
                    elements.push(
                      <div key={`eff-desc-${ei}`} style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: 2, marginTop: -1 }}>
                        {eff.description}
                      </div>
                    );
                  }

                  // Secondary attribute passive bonus (e.g. Flow: Unbridled Edge)
                  if (ei === 0 && sk3 && 'getElementDmgBonus' in sk3 && operatorModel) {
                    const secBonus = sk3.getValue();
                    if (secBonus > 0) {
                      const secAttr = operatorModel.secondaryAttributeType;
                      const secLabel = STAT_LABELS[secAttr] ?? secAttr;
                      elements.push(
                        <div key="sec-attr-bonus" style={statRowStyle}>
                          <span style={statLabelStyle}>Secondary Attr% ({secLabel}%)</span>
                          <span style={statValueStyle}>{(secBonus * 100).toFixed(2)}%</span>
                        </div>
                      );
                    }
                  }

                  // Buff stat lines with actual values (or fallback to min-max range)
                  const stackSuffix = eff.maxStacks > 1 ? `/stack (max ${eff.maxStacks})` : '';
                  for (let bi = 0; bi < eff.buffs.length; bi++) {
                    const b = eff.buffs[bi];
                    const statLabel = STAT_LABELS[b.stat as StatType] ?? b.stat;
                    const isPercent = PERCENT_STATS.has(b.stat as StatType);

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

                    const durationSuffix = ` (${eff.durationSeconds}s)`;
                    elements.push(
                      <div key={`eff-${ei}-${bi}`} style={statRowStyle}>
                        <span style={statLabelStyle}>{statLabel}{durationSuffix}</span>
                        <span style={statValueStyle}>{valStr}{b.perStack ? stackSuffix : ''}</span>
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
                      showMinMax
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
            <span className="edit-section-label">Tactical</span>
            {food && <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>{food.name}</div>}
            {tac  && (() => {
              const tacInstance = tac.create();
              const modelMax = tacInstance.maxUses;
              const currentMax = stats.tacticalMaxUses ?? modelMax;
              return (
                <>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>{tac.name}</div>
                  <StatField
                    label={<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>Uses</span>}
                    value={currentMax}
                    min={0}
                    max={modelMax}
                    showMinMax
                    onChange={(v) => onStatsChange({ ...stats, tacticalMaxUses: v })}
                  />
                </>
              );
            })()}
          </div>
        )}

        <AggregatedStatsSection operatorId={operatorId} loadout={loadout} stats={stats} color={operator.color} />
      </div>
    </>
  );
}

/** Maps flat attribute stats to their percentage bonus counterparts. */
const FLAT_ATTR_TO_BONUS: Partial<Record<StatType, StatType>> = {
  [StatType.STRENGTH]: StatType.STRENGTH_BONUS,
  [StatType.AGILITY]: StatType.AGILITY_BONUS,
  [StatType.INTELLECT]: StatType.INTELLECT_BONUS,
  [StatType.WILL]: StatType.WILL_BONUS,
};

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
          let value = agg.stats[stat];
          // Apply percentage bonus to flat attributes (matches in-game display)
          const bonusStat = FLAT_ATTR_TO_BONUS[stat];
          if (bonusStat) {
            value = Math.floor(value * (1 + agg.stats[bonusStat]));
          }
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

// ── Enemy pane ──────────────────────────────────────────────────────────────

const ENEMY_RESISTANCE_FIELDS: { key: keyof EnemyStats; label: string }[] = [
  { key: 'physicalResistance', label: 'Physical RES' },
  { key: 'heatResistance',     label: 'Heat RES' },
  { key: 'electricResistance', label: 'Electric RES' },
  { key: 'cryoResistance',     label: 'Cryo RES' },
  { key: 'natureResistance',   label: 'Nature RES' },
];

function EnemyPane({ enemy, stats, onStatsChange, onClose }: {
  enemy: Enemy;
  stats: EnemyStats;
  onStatsChange: (stats: EnemyStats) => void;
  onClose: () => void;
}) {
  const levels = getEnemyLevels(enemy.id);
  const model = getModelEnemy(enemy.id, stats.level);
  const set = (key: keyof EnemyStats) => (v: number) => onStatsChange({ ...stats, [key]: v });

  const handleReset = () => {
    onStatsChange(getDefaultEnemyStats(enemy.id, stats.level));
  };

  const handleLevelChange = (v: number) => {
    const newStats = getDefaultEnemyStats(enemy.id, v);
    onStatsChange(newStats);
  };

  const enemyColor = '#cc3333';
  const labelSpan = (text: string) => <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>{text}</span>;

  return (
    <>
      <div className="edit-panel-header">
        <div
          style={{
            width: 4, height: 40, borderRadius: 2, flexShrink: 0,
            background: enemyColor,
            boxShadow: `0 0 8px ${enemyColor}80`,
          }}
        />
        <div className="edit-panel-title-wrap">
          <div className="edit-panel-skill-name">{enemy.name}</div>
          <div className="edit-panel-op-name" style={{ color: enemyColor }}>
            {enemy.tier}
            <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>· ENEMY</span>
          </div>
        </div>
      </div>

      <div className="edit-panel-body">
        <div className="edit-panel-section">
          <span className="edit-section-label">General</span>
          <LevelSelect label="Level" value={stats.level} options={levels} onChange={handleLevelChange} />
          <StatField label={labelSpan('HP')} value={stats.hp} min={0} max={9999999} step={1} holdStep={1000} showMinMax onChange={set('hp')} />
          {model && (
            <div style={statRowStyle}>
              <span style={statLabelStyle}>ATK</span>
              <span style={statValueStyle}>{model.stats[EnemyStatType.ATK].toLocaleString()}</span>
            </div>
          )}
        </div>

        <div className="edit-panel-section">
          <span className="edit-section-label">Defense</span>
          <StatField label={labelSpan('DEF')} value={stats.def} min={0} max={9999} step={1} holdStep={10} showMinMax onChange={set('def')} />
        </div>

        <div className="edit-panel-section">
          <span className="edit-section-label">Resistance</span>
          {ENEMY_RESISTANCE_FIELDS.map(({ key, label }) => (
            <StatField key={key} label={labelSpan(label)} value={stats[key] as number} min={0} max={10} step={0.1} holdStep={1} showMinMax onChange={set(key)} />
          ))}
        </div>

        <div className="edit-panel-section">
          <span className="edit-section-label">Stagger</span>
          <StatField label={labelSpan('Stagger HP')} value={stats.staggerHp} min={0} max={99999} step={1} holdStep={10} showMinMax onChange={set('staggerHp')} />
          <StatField label={labelSpan('Initial Value')} value={stats.staggerStartValue ?? 0} min={0} max={stats.staggerHp} step={1} holdStep={10} showMinMax onChange={set('staggerStartValue')} />
          <StatField label={labelSpan('Nodes')} value={stats.staggerNodes} min={0} max={10} showMinMax onChange={set('staggerNodes')} />
          <StatField label={labelSpan('Break Duration (s)')} value={stats.staggerBreakDurationSeconds} min={0} max={60} step={0.5} showMinMax onChange={set('staggerBreakDurationSeconds')} />
          <StatField label={labelSpan('Node Recovery (s)')} value={stats.staggerNodeRecoverySeconds} min={0} max={60} step={0.5} showMinMax onChange={set('staggerNodeRecoverySeconds')} />
        </div>

        <div style={{ marginTop: 'auto', padding: '0.75rem 0 0' }}>
          <button className="enemy-reset-btn" onClick={handleReset} title="Reset to defaults">
            Reset to Defaults
          </button>
        </div>
      </div>
    </>
  );
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
  debugMode?: boolean;
} & (
  | {
      mode: 'event';
      event: TimelineEvent;
      processedEvent?: TimelineEvent;
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
      rawEvents?: readonly TimelineEvent[];
      allProcessedEvents?: readonly TimelineEvent[];
    }
  | {
      mode: 'loadout';
      operatorId: string;
      slotId: string;
      operator: Operator;
      loadout: OperatorLoadoutState;
      stats: LoadoutStats;
      onStatsChange: (stats: LoadoutStats) => void;
      onClose: () => void;
      allProcessedEvents?: readonly TimelineEvent[];
    }
  | {
      mode: 'enemy';
      enemy: Enemy;
      enemyStats: EnemyStats;
      onEnemyStatsChange: (stats: EnemyStats) => void;
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
          processedEvent={props.processedEvent}
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
          debugMode={props.debugMode}
          rawEvents={props.rawEvents}
          allProcessedEvents={props.allProcessedEvents}
        />
      ) : props.mode === 'loadout' ? (
        <LoadoutPane
          operatorId={props.operatorId}
          slotId={props.slotId}
          operator={props.operator}
          loadout={props.loadout}
          stats={props.stats}
          onStatsChange={props.onStatsChange}
          onClose={handleClose}
          allProcessedEvents={props.allProcessedEvents}
        />
      ) : props.mode === 'enemy' ? (
        <EnemyPane
          enemy={props.enemy}
          stats={props.enemyStats}
          onStatsChange={props.onEnemyStatsChange}
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
