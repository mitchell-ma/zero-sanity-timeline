import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { framesToSeconds, secondsToFrames, frameToDetailLabel, frameToTimeLabelPrecise, FPS } from '../../utils/timeline';
import { COMBAT_SKILL_LABELS, STATUS_LABELS } from '../../consts/channelLabels';
import { CombatSkillsType, ELEMENT_COLORS, ELEMENT_LABELS, ElementType, EventFrameType, EventStatusType, StatType, StatusType, STATUS_ELEMENT, TriggerConditionType, WeaponSkillType } from '../../consts/enums';
import { TimelineEvent, Operator, Enemy, SkillType, SelectedFrame, ResourceConfig, Column, MiniTimeline } from '../../consts/viewTypes';
import { OperatorLoadoutState } from '../OperatorLoadoutHeader';
import { DurationField, StatField, SegmentDurationField, FrameOffsetField } from './SharedFields';
import type { LoadoutStats } from '../InformationPane';
import { resolveEventIdentity, resolveSpReturn, resolveActiveModifiers } from '../../controller/info-pane/eventPaneController';
import { ENEMY_OWNER_ID } from '../../model/channels';
import { getSkillMultiplier } from '../../controller/calculation/skillMultiplierRegistry';
import type { DamageTableRow } from '../../controller/calculation/damageTableBuilder';

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
  loadoutStats?: Record<string, LoadoutStats>;
  damageRows?: DamageTableRow[];
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
  loadoutStats,
  damageRows,
}: EventPaneProps) {
  /** Format a real-time frame as a detail label. */
  const dualTimeLabel = (frame: number) => frameToDetailLabel(frame);

  /** Format a real-time frame as a precise label. */
  const dualTimePrecise = (frame: number) => frameToTimeLabelPrecise(frame);

  /** Format a duration (game-time metadata), with optional time-stop adjusted value on a separate line. */
  const dualDuration = (_startFrame: number, durationFrames: number, label?: string, processedDurationFrames?: number): React.ReactNode => {
    const base = `${framesToSeconds(durationFrames)}s (${durationFrames}f)`;
    const hasTimeStop = processedDurationFrames != null && processedDurationFrames !== durationFrames;
    return <>
      <div>{label ? `${label}: ` : ''}{base}</div>
      {hasTimeStop && (
        <div>{label ? `${label} (time-stop): ` : '(time-stop): '}{framesToSeconds(processedDurationFrames!)}s ({processedDurationFrames}f)</div>
      )}
    </>;
  };

  const {
    ownerName, skillName, ownerColor, columnLabel, triggerCondition,
    comboTriggerLabels, comboRequiresLabels,
    sourceName, sourceColor, sourceSkillLabel,
  } = resolveEventIdentity(event, slots, enemy);

  const isSequenced = event.segments && event.segments.length > 0;

  // Filter damage rows for this event — keyed by segmentIndex-frameIndex
  const eventDamageRows = useMemo(() => {
    if (!damageRows) return new Map<string, DamageTableRow>();
    const map = new Map<string, DamageTableRow>();
    for (const row of damageRows) {
      if (row.eventId === event.id) {
        map.set(`${row.segmentIndex}-${row.frameIndex}`, row);
      }
    }
    return map;
  }, [damageRows, event.id]);

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

  // Per-phase processed durations (for time-stop display)
  const pActivation = processedEvent?.activationDuration;
  const pActive = processedEvent?.activeDuration;
  const pCooldown = processedEvent?.cooldownDuration;
  const pAnimation = processedEvent?.animationDuration;



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
              color: event.eventStatus === EventStatusType.EXPIRED ? 'var(--text-muted)'
                : event.eventStatus === EventStatusType.CONSUMED ? '#f07030'
                : event.eventStatus === EventStatusType.REFRESHED ? '#55aadd'
                : event.eventStatus === EventStatusType.TRIGGERED ? '#ffdd44'
                : event.eventStatus === EventStatusType.EXTENDED ? '#88cc44'
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
                      ? COMBAT_SKILL_LABELS[event.eventStatusSkillName as CombatSkillsType]
                        ?? STATUS_LABELS[event.eventStatusSkillName as StatusType]
                        ?? event.eventStatusSkillName
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

        {(() => {
          // Skill info: element, SP cost, multiplier
          const col = columns.find((c) => c.type !== 'placeholder' && c.columnId === event.columnId && c.ownerId === event.ownerId);
          const skillEl = col && col.type !== 'placeholder' ? col.skillElement : undefined;
          const slot = slots.find((s) => s.slotId === event.ownerId);
          const operatorId = slot?.operator?.id;
          const stats = operatorId && loadoutStats ? loadoutStats[event.ownerId] : undefined;

          // Resolve skill level based on column type
          let skillLevel: number | undefined;
          if (stats) {
            if (event.columnId === 'basic') skillLevel = stats.basicAttackLevel;
            else if (event.columnId === 'battle') skillLevel = stats.battleSkillLevel;
            else if (event.columnId === 'combo') skillLevel = stats.comboSkillLevel;
            else if (event.columnId === 'ultimate') skillLevel = stats.ultimateLevel;
          }

          // Per-segment multipliers for sequenced events (basic attacks)
          const segMultipliers: { label: string; value: number; maxFrames: number }[] = [];
          let overallMultiplier: number | null = null;
          let overallMaxFrames = 0;

          // Look up default segments from column definition for max frame counts
          const miniCol = col && col.type !== 'placeholder' ? col as MiniTimeline : null;
          const defaultSegs = miniCol?.eventVariants?.find((v) => v.name === event.name)?.segments
            ?? miniCol?.defaultEvent?.segments;

          if (operatorId && skillLevel != null) {
            if (isSequenced && event.segments!.length > 0) {
              for (let si = 0; si < event.segments!.length; si++) {
                const seg = event.segments![si];
                if (!seg.label) continue;
                const m = getSkillMultiplier(
                  operatorId,
                  event.name as CombatSkillsType,
                  seg.label,
                  skillLevel as any,
                  (stats?.potential ?? 0) as any,
                );
                if (m != null) {
                  const isNumeric = /^\d+$/.test(seg.label);
                  const maxFrames = defaultSegs?.[si]?.frames?.length ?? seg.frames?.length ?? 1;
                  segMultipliers.push({
                    label: isNumeric ? `Seq ${seg.label}` : seg.label,
                    value: m,
                    maxFrames,
                  });
                }
              }
            } else {
              overallMultiplier = getSkillMultiplier(
                operatorId,
                event.name as CombatSkillsType,
                undefined,
                skillLevel as any,
                (stats?.potential ?? 0) as any,
              );
              if (overallMultiplier != null && defaultSegs) {
                overallMaxFrames = defaultSegs.reduce((sum, s) => sum + (s.frames?.length ?? 0), 0);
              }
            }
          }

          // Skill description from operator model
          const op = slot?.operator;
          const skillDef = op?.skills[event.columnId as 'basic' | 'battle' | 'combo' | 'ultimate'];
          const skillDescription = skillDef?.description;

          const elColor = skillEl ? ELEMENT_COLORS[skillEl.toUpperCase() as ElementType] : undefined;
          const hasMultiplier = overallMultiplier != null || segMultipliers.length > 0;
          const hasInfo = skillEl || event.skillPointCost != null || hasMultiplier || skillDescription;

          if (!hasInfo) return null;
          return (
            <div className="edit-panel-section">
              <span className="edit-section-label">Skill</span>
              <div className="edit-info-text">
                {skillDescription && (
                  <div style={{ color: 'var(--text-secondary)', fontSize: 11, lineHeight: 1.45, marginBottom: 6 }}>
                    {skillDescription}
                  </div>
                )}
                {skillEl && (
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Element: </span>
                    <span style={{ color: elColor ?? 'inherit', fontWeight: 600 }}>
                      {skillEl.charAt(0).toUpperCase() + skillEl.slice(1).toLowerCase()}
                    </span>
                  </div>
                )}
                {event.skillPointCost != null && (
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>SP Cost: </span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{event.skillPointCost}</span>
                  </div>
                )}
                {overallMultiplier != null && (
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Multiplier: </span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: '#ffdd44' }}>
                      {(overallMultiplier * 100).toFixed(0)}%
                    </span>
                    {overallMaxFrames > 1 && (
                      <span style={{ color: 'var(--text-muted)', fontSize: 10, marginLeft: 4 }}>
                        ({((overallMultiplier / overallMaxFrames) * 100).toFixed(1)}% x{overallMaxFrames})
                      </span>
                    )}
                    {skillLevel != null && (
                      <span style={{ color: 'var(--text-muted)', fontSize: 10, marginLeft: 4 }}>
                        Lv.{skillLevel}
                      </span>
                    )}
                  </div>
                )}
                {segMultipliers.length > 0 && (
                  <div>
                    <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>
                      Multipliers{skillLevel != null && <span style={{ fontSize: 10 }}> (Lv.{skillLevel})</span>}:
                    </div>
                    {segMultipliers.map((sm) => (
                      <div key={sm.label} style={{ paddingLeft: 8 }}>
                        <span style={{ color: 'var(--text-muted)' }}>{sm.label}: </span>
                        <span style={{ fontFamily: 'var(--font-mono)', color: '#ffdd44' }}>
                          {(sm.value * 100).toFixed(0)}%
                        </span>
                        {sm.maxFrames > 1 && (
                          <span style={{ color: 'var(--text-muted)', fontSize: 10, marginLeft: 4 }}>
                            ({((sm.value / sm.maxFrames) * 100).toFixed(1)}% x{sm.maxFrames})
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

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
                const color = ELEMENT_COLORS[element as ElementType] ?? 'var(--text-muted)';
                const label = ELEMENT_LABELS[element as ElementType] ?? element;
                return (
                  <div key={element}>
                    <span style={{ color }}>{label}</span>: {Math.round(value * 100)}%
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {(() => {
          if (!allProcessedEvents || event.ownerId === ENEMY_OWNER_ID) return null;
          const totalDuration = event.segments
            ? event.segments.reduce((sum, s) => sum + s.durationFrames, 0)
            : event.activationDuration;
          const mods = resolveActiveModifiers(event.startFrame, event.startFrame + totalDuration, allProcessedEvents);
          if (mods.length === 0) return null;
          return (
            <div className="edit-panel-section">
              <span className="edit-section-label">Active Modifiers</span>
              <div className="edit-info-text">
                {mods.map((mod, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ color: mod.color }}>{mod.label}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#6fbf73' }}>{mod.formattedValue}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

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

        {(() => {
          const spData = resolveSpReturn(event, slots);
          if (!spData) return null;
          const { summary: sp, spNotes } = spData;
          const r = (v: number) => Math.round(v * 100) / 100;
          const spInfo = (
            <div className="edit-info-text">
              {sp.totalSpReturn > 0 && <div>Return: {r(sp.totalSpReturn)} (net: {r(sp.netSp)})</div>}
              {sp.rawGauge > 0 && <div>Ult Gauge: {sp.hasReduction ? `${r(sp.rawGauge)} × ${Math.round(sp.gaugeReduction * 100)}% = +${r(sp.effectiveGauge)}` : `+${r(sp.rawGauge)}`}</div>}
              {sp.rawTeamGauge > 0 && <div>Team Gauge: {sp.hasReduction ? `${r(sp.rawTeamGauge)} × ${Math.round(sp.gaugeReduction * 100)}% = +${r(sp.effectiveTeamGauge)}` : `+${r(sp.rawTeamGauge)}`}</div>}
              {spNotes.map((note, i) => (
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
                {dualDuration(event.startFrame, event.animationDuration ?? 0, undefined, pAnimation)}
              </div>
            </div>

            <div className="edit-panel-section">
              <span className="edit-section-label">Statis</span>
              <div className="edit-info-text">
                {dualDuration(
                  event.startFrame + (event.animationDuration ?? 0),
                  event.activationDuration - (event.animationDuration ?? 0),
                  undefined,
                  pActivation != null && pAnimation != null ? pActivation - (pAnimation ?? 0) : undefined,
                )}
              </div>
            </div>

            <div className="edit-panel-section">
              <span className="edit-section-label">Active Phase</span>
              <div className="edit-info-text">
                {dualDuration(event.startFrame + event.activationDuration, event.activeDuration, undefined, pActive)}
              </div>
              {event.segments!.map((seg, si) => (
                seg.frames && seg.frames.length > 0 && (
                  <div key={si} style={{ marginTop: 4 }}>
                    {seg.frames.map((f, fi) => {
                      const isSelected = selectedFrames?.some(
                        (sf) => sf.eventId === event.id && sf.segmentIndex === si && sf.frameIndex === fi,
                      ) ?? false;
                      const hitDmgRow = eventDamageRows.get(`${si}-${fi}`);
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
                            {f.statusLabel && <div style={{ whiteSpace: 'pre-line' }}>{f.statusLabel}</div>}
                            {hitDmgRow && (hitDmgRow.multiplier != null || hitDmgRow.damage != null) && (
                              <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                                {hitDmgRow.multiplier != null && (
                                  <span style={{ fontFamily: 'var(--font-mono)', color: '#ffdd44', fontSize: 11 }}>
                                    {(hitDmgRow.multiplier * 100).toFixed(1)}%
                                  </span>
                                )}
                                {hitDmgRow.damage != null && (
                                  <span style={{ fontFamily: 'var(--font-mono)', color: '#6fbf73', fontSize: 11 }}>
                                    {hitDmgRow.damage.toLocaleString()}
                                  </span>
                                )}
                              </div>
                            )}
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
                    {dualDuration(event.startFrame + event.activationDuration + event.activeDuration, event.cooldownDuration, undefined, pCooldown)}
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
                      const hitDmgRow = eventDamageRows.get(`${si}-${fi}`);
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
                            {f.statusLabel && <div style={{ whiteSpace: 'pre-line' }}>{f.statusLabel}</div>}
                            {hitDmgRow && (hitDmgRow.multiplier != null || hitDmgRow.damage != null) && (
                              <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                                {hitDmgRow.multiplier != null && (
                                  <span style={{ fontFamily: 'var(--font-mono)', color: '#ffdd44', fontSize: 11 }}>
                                    {(hitDmgRow.multiplier * 100).toFixed(1)}%
                                  </span>
                                )}
                                {hitDmgRow.damage != null && (
                                  <span style={{ fontFamily: 'var(--font-mono)', color: '#6fbf73', fontSize: 11 }}>
                                    {hitDmgRow.damage.toLocaleString()}
                                  </span>
                                )}
                              </div>
                            )}
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
                  <DurationField label="Duration" value={cooldownSec} onChange={setCooldownSec} onCommit={handleBlur} />
                </div>
              </div>
            )}

            <div className="edit-panel-section">
              <span className="edit-section-label">Info</span>
              <div className="edit-info-text">
                {dualDuration(
                  event.startFrame,
                  event.activationDuration + event.activeDuration + event.cooldownDuration,
                  'Total',
                  processedEvent ? processedEvent.activationDuration + processedEvent.activeDuration + processedEvent.cooldownDuration : undefined,
                )}
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
              const pSeg = processedEvent?.segments?.[si];
              const isNumericLabel = seg.label && /^\d+$/.test(seg.label);
              const segLabel = seg.label
                ? (isNumericLabel ? `Sequence ${seg.label}` : seg.label)
                : `Sequence ${si + 1}`;
              // Segment-level damage: sum per-frame damages and get multiplier
              const segDamageFrames = seg.frames
                ? seg.frames.map((_, fi) => eventDamageRows.get(`${si}-${fi}`))
                : [];
              const segTotalDamage = segDamageFrames.reduce((sum, r) => sum + (r?.damage ?? 0), 0);
              const firstDmgRow = segDamageFrames.find((r) => r?.multiplier != null);
              const segPerFrameMultiplier = firstDmgRow?.multiplier ?? null;
              const segMaxFrames = seg.frames?.length ?? 0;
              const segTotalMultiplier = segPerFrameMultiplier != null ? segPerFrameMultiplier * segMaxFrames : null;

              return (
                <div key={si} className="edit-panel-section">
                  <span className="edit-section-label">{segLabel}</span>
                  <div style={{ padding: '4px 6px' }}>
                    {readOnly ? (
                      <div className="edit-info-text">
                        {dualDuration(segStartFrame, seg.durationFrames, 'Duration', pSeg?.durationFrames)}
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
                    {segTotalMultiplier != null && (
                      <div className="edit-info-text" style={{ marginTop: 2 }}>
                        <span style={{ color: 'var(--text-muted)' }}>Multiplier: </span>
                        <span style={{ fontFamily: 'var(--font-mono)', color: '#ffdd44' }}>
                          {(segTotalMultiplier * 100).toFixed(0)}%
                        </span>
                        {segMaxFrames > 1 && segPerFrameMultiplier != null && (
                          <span style={{ color: 'var(--text-muted)', fontSize: 10, marginLeft: 4 }}>
                            ({(segPerFrameMultiplier * 100).toFixed(1)}% x{segMaxFrames})
                          </span>
                        )}
                        {segTotalDamage > 0 && (
                          <span style={{ color: '#6fbf73', fontSize: 10, marginLeft: 6 }}>
                            {segTotalDamage.toLocaleString()} dmg
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {seg.frames && seg.frames.length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      {seg.frames.map((f, fi) => {
                        const isSelected = selectedFrames?.some(
                          (sf) => sf.eventId === event.id && sf.segmentIndex === si && sf.frameIndex === fi,
                        ) ?? false;
                        const hitDmgRow = eventDamageRows.get(`${si}-${fi}`);
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
                                  <div>Type: {f.hitType === EventFrameType.FINAL_STRIKE ? 'Final Strike' : f.hitType === EventFrameType.FINISHER ? 'Finisher' : f.hitType === EventFrameType.DIVE ? 'Dive' : 'Normal'}</div>
                                ) : (
                                  <>
                                    <div>Type:</div>
                                    <div className="edit-field-row">
                                      <select
                                        className="edit-input"
                                        value={f.hitType ?? EventFrameType.NORMAL}
                                        onChange={(e) => {
                                          const newEventFrameType = e.target.value as EventFrameType;
                                          const newSegments = event.segments!.map((s, ssi) => {
                                            if (ssi !== si || !s.frames) return s;
                                            return { ...s, frames: s.frames.map((fr, ffi) =>
                                              ffi === fi ? { ...fr, hitType: newEventFrameType } : fr,
                                            )};
                                          });
                                          onUpdate(event.id, { segments: newSegments });
                                        }}
                                      >
                                        <option value={EventFrameType.NORMAL}>Normal</option>
                                        <option value={EventFrameType.FINAL_STRIKE}>Final Strike</option>
                                        <option value={EventFrameType.FINISHER}>Finisher</option>
                                        <option value={EventFrameType.DIVE}>Dive</option>
                                      </select>
                                    </div>
                                  </>
                                )
                              )}
                              {f.hitType === EventFrameType.FINAL_STRIKE && (
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
                              {f.hitType !== EventFrameType.FINAL_STRIKE && (f.stagger ?? 0) > 0 && (
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
                              {f.consumeStatus && (
                                <div style={{ color: '#f0a040' }}>
                                  Consume: {STATUS_LABELS[f.consumeStatus as StatusType] ?? f.consumeStatus.replace(/_/g, ' ')} (all stacks)
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
                              {hitDmgRow && (hitDmgRow.multiplier != null || hitDmgRow.damage != null) && (
                                <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                                  {hitDmgRow.multiplier != null && (
                                    <span style={{ fontFamily: 'var(--font-mono)', color: '#ffdd44', fontSize: 11 }}>
                                      {(hitDmgRow.multiplier * 100).toFixed(1)}%
                                    </span>
                                  )}
                                  {hitDmgRow.damage != null && (
                                    <span style={{ fontFamily: 'var(--font-mono)', color: '#6fbf73', fontSize: 11 }}>
                                      {hitDmgRow.damage.toLocaleString()}
                                    </span>
                                  )}
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
                {dualDuration(event.startFrame, totalDurationFrames, 'Time', hasTimeStopDiff ? processedTotalDurationFrames : undefined)}
                {event.columnId === 'ultimate' && event.activeDuration > 0 && dualDuration(event.startFrame + event.activationDuration, event.activeDuration, 'Active phase', pActive)}
                {event.cooldownDuration > 0 && dualDuration(event.startFrame + event.activationDuration + event.activeDuration, event.cooldownDuration, 'Cooldown', pCooldown)}
              </div>
            </div>
          </>
        ) : readOnly ? (
          <div className="edit-panel-section">
            <span className="edit-section-label">Duration</span>
            <div className="edit-info-text">
              {event.columnId === 'ultimate' && event.animationDuration != null && event.animationDuration > 0 &&
                dualDuration(event.startFrame, event.animationDuration, 'Animation', pAnimation)
              }
              {event.columnId === 'ultimate' ? (
                dualDuration(
                  event.startFrame + (event.animationDuration ?? 0),
                  event.activationDuration - (event.animationDuration ?? 0),
                  'Statis',
                  pActivation != null && pAnimation != null ? pActivation - (pAnimation ?? 0) : undefined,
                )
              ) : (
                dualDuration(event.startFrame, event.activationDuration, 'Time', pActivation)
              )}
              {event.columnId === 'ultimate' && event.activeDuration > 0 && dualDuration(event.startFrame + event.activationDuration, event.activeDuration, 'Active', pActive)}
              {event.cooldownDuration > 0 && dualDuration(event.startFrame + event.activationDuration + event.activeDuration, event.cooldownDuration, 'Cooldown', pCooldown)}
              {(event.activeDuration > 0 || event.cooldownDuration > 0) && dualDuration(event.startFrame, totalDurationFrames, 'Total', hasTimeStopDiff ? processedTotalDurationFrames : undefined)}
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
                {dualDuration(event.startFrame, event.activationDuration, 'Time', pActivation)}
                {dualDuration(event.startFrame, totalDurationFrames, 'Total', hasTimeStopDiff ? processedTotalDurationFrames : undefined)}
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

      {/* Controller Objects — tree view */}
      {(rawEvents || allProcessedEvents) && (() => {
        const rawIds = rawEvents ? new Set(rawEvents.map((ev) => ev.id)) : null;
        const allEvents = allProcessedEvents ?? [];
        const derivedIds = new Set(allEvents.filter((ev) => rawIds ? !rawIds.has(ev.id) : !!ev.sourceOwnerId).map((ev) => ev.id));
        const rawList = allEvents.filter((ev) => !derivedIds.has(ev.id));
        const derivedList = allEvents.filter((ev) => derivedIds.has(ev.id));

        // Build parent→children map: a derived event's parent is the longest
        // raw/derived event ID that is a prefix of its own ID.
        const allIds = allEvents.map((ev) => ev.id).sort((a, b) => b.length - a.length);
        const childrenMap = new Map<string, TimelineEvent[]>();
        const hasParent = new Set<string>();
        for (const dev of derivedList) {
          let parentId: string | null = null;
          for (const cid of allIds) {
            if (cid !== dev.id && dev.id.startsWith(cid + '-')) {
              parentId = cid;
              break; // longest prefix first due to sort
            }
          }
          if (parentId) {
            const children = childrenMap.get(parentId) ?? [];
            children.push(dev);
            childrenMap.set(parentId, children);
            hasParent.add(dev.id);
          }
        }

        // Render an event row with depth indicators
        const renderRow = (ev: TimelineEvent, depth: number) => {
          const isRaw = !derivedIds.has(ev.id);
          const pipes = '│'.repeat(depth);
          const prefix = depth > 0 ? pipes + ' ' : '';
          const color = isRaw ? '#88cc44' : '#dd8844';
          const label = COMBAT_SKILL_LABELS[ev.name as CombatSkillsType] ?? STATUS_LABELS[ev.name as StatusType] ?? ev.name;
          const children = childrenMap.get(ev.id) ?? [];
          return (
            <div key={ev.id}>
              <div style={{ marginBottom: 1, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                <span style={{ color: 'var(--text-muted)', whiteSpace: 'pre' }}>{prefix}</span>
                <span style={{ color }}>{ev.ownerId}:{ev.columnId}</span>
                {' '}<span style={{ color: 'var(--text-muted)' }}>({label})</span>
                {' '}@ {ev.startFrame}f
                {' '}<span style={{ color: 'var(--text-muted)' }}>[{fmt(ev.activationDuration)}]</span>
                {ev.eventStatus && <span style={{ color: '#ffdd44' }}> ({ev.eventStatus})</span>}
              </div>
              {children.sort((a, b) => a.startFrame - b.startFrame).map((child) => renderRow(child, depth + 1))}
            </div>
          );
        };

        // Orphaned derived events (no parent found via ID prefix)
        const orphanDerived = derivedList.filter((ev) => !hasParent.has(ev.id));

        return (
          <div style={{ marginTop: 6 }}>
            <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: 2 }}>
              Event Tree ({rawList.length} raw, {derivedList.length} derived)
            </div>
            {rawList.map((ev) => renderRow(ev, 0))}
            {orphanDerived.length > 0 && orphanDerived.map((ev) => renderRow(ev, 0))}
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

export default EventPane;
