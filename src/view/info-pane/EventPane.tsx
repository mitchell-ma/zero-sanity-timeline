import React, { useState, useEffect, useRef, useMemo } from 'react';
import { NounType } from '../../dsl/semantics';
import { framesToSeconds, secondsToFrames, frameToDetailLabel, frameToTimeLabelPrecise, FPS } from '../../utils/timeline';
import { formatPct, formatFlat } from '../../controller/info-pane/loadoutPaneController';
import { parseMathInput } from '../../utils/mathExpr';
import { getAllSkillLabels, getAllStatusLabels } from '../../controller/gameDataStore';
import { CombatSkillType, ELEMENT_COLORS, ELEMENT_LABELS, ElementType, EventStatusType, InfoLevel, InteractionModeType, SegmentType, StatusType } from '../../consts/enums';
import { getStatusElementMap, getStatusById, getAnyStatusSerialized } from '../../controller/gameDataStore';
import { TimelineEvent, Operator, Enemy, SelectedFrame, Column, computeSegmentsSpan, getAnimationDuration, eventDuration } from '../../consts/viewTypes';
import { StatField } from './SharedFields';
import type { LoadoutProperties } from '../InformationPane';
import { resolveEventIdentity, resolveSpReturn, resolveActiveModifiers, resolveComboChain } from '../../controller/info-pane/eventPaneController';
import { getOperatorSkill } from '../../controller/gameDataStore';
import { DataCardBody, FrameCritState } from '../custom/DataCardComponents';
import { ENEMY_OWNER_ID, OPERATOR_COLUMNS, REACTION_COLUMN_IDS, SKILL_COLUMN_ORDER } from '../../model/channels';
import { getLastController, getReconcileStats } from '../../controller/timeline/eventQueueController';
import { getPoolStats } from '../../controller/timeline/objectPool';
import type { DamageTableRow } from '../../controller/calculation/damageTableBuilder';

const SKILL_COLUMN_SET = new Set<string>(SKILL_COLUMN_ORDER);


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
  isDerived?: boolean;
  editContext?: string | null;
  interactionMode?: InteractionModeType;
  rawEvents?: readonly TimelineEvent[];
  allProcessedEvents?: readonly TimelineEvent[];
  loadoutProperties?: Record<string, LoadoutProperties>;
  damageRows?: DamageTableRow[];
  spConsumptionHistory?: { eventUid: string; frame: number; naturalConsumed: number; returnedConsumed: number }[];
  onSaveAsCustomSkill?: (event: TimelineEvent) => void;
  verbose?: InfoLevel;
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
  isDerived,
  editContext,
  interactionMode,
  rawEvents,
  allProcessedEvents,
  loadoutProperties,
  damageRows,
  spConsumptionHistory,
  onSaveAsCustomSkill,
  verbose = InfoLevel.DETAILED,
}: EventPaneProps) {
  /** Format a real-time frame as a detail label. */
  const dualTimeLabel = (frame: number) => frameToDetailLabel(frame);

  /** Format a real-time frame as a precise label. */
  const dualTimePrecise = (frame: number) => frameToTimeLabelPrecise(frame);

  const {
    ownerName, skillName, ownerColor, columnLabel, triggerCondition,
    comboTriggerLabels, comboRequiresLabels,
    sourceName, sourceColor, sourceSkillLabel,
  } = resolveEventIdentity(event, slots, enemy);

  // Use processed segments for events that only get segments during processing
  // (e.g. freeform reaction events). The raw event from undo history has none.
  if (event.segments.length === 0 && processedEvent?.segments.length) {
    event = { ...event, segments: processedEvent.segments };
  }
  // Raw serialized skill data for verbose DataCardBody rendering
  const skillCardData = useMemo(() => {
    if (verbose < InfoLevel.DETAILED) return null;
    const slot = slots.find((s) => s.slotId === event.ownerId);
    if (!slot?.operator?.id) return null;
    const skillObj = getOperatorSkill(slot.operator.id, event.name);
    return skillObj ? skillObj.serialize() as Record<string, unknown> : null;
  }, [event.ownerId, event.name, slots, verbose]);

  // Raw serialized status data for verbose DataCardBody rendering
  const statusCardData = useMemo(() => {
    if (verbose < InfoLevel.DETAILED) return null;
    if (skillCardData) return null; // skill card takes precedence
    return getAnyStatusSerialized(event.name);
  }, [event.name, verbose, skillCardData]);

  const critState = useMemo<FrameCritState | undefined>(() => {
    if (readOnly) return undefined;
    const segs = event.segments ?? [];
    if (segs.length === 0) return undefined;
    // Read isCrit from processed event (pipeline-resolved), write to raw event
    const procSegs = processedEvent?.segments ?? segs;
    return {
      getIsCrit: (si, fi) => procSegs[si]?.frames?.[fi]?.isCrit,
      onToggle: (si, fi, value) => {
        const updatedSegs = [...segs];
        const seg = { ...updatedSegs[si], frames: [...(updatedSegs[si].frames ?? [])] };
        seg.frames[fi] = { ...seg.frames[fi], isCrit: value };
        updatedSegs[si] = seg;
        onUpdate(event.uid, { segments: updatedSegs });
      },
    };
  }, [event, processedEvent, readOnly, onUpdate]);

  const selectedFrameElRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (selectedFrames && selectedFrames.length > 0 && selectedFrameElRef.current) {
      selectedFrameElRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedFrames]);

  const [activeSec,     setActiveSec]     = useState(framesToSeconds(eventDuration(event)));
  const [animSec,       setAnimSec]       = useState(framesToSeconds(getAnimationDuration(event)));
  const [startWholeSec, setStartWholeSec] = useState(String(Math.floor(event.startFrame / FPS)));
  const [startModFrame, setStartModFrame] = useState(String(event.startFrame % FPS));

  const focusedRef = useRef(false);

  useEffect(() => {
    if (focusedRef.current) return;
    setStartWholeSec(String(Math.floor(event.startFrame / FPS)));
    setStartModFrame(String(event.startFrame % FPS));
    setActiveSec(framesToSeconds(eventDuration(event)));
    setAnimSec(framesToSeconds(getAnimationDuration(event)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.uid, event.startFrame, event.segments]);

  const computedStartFrame = Math.max(0, Math.floor(parseMathInput(startWholeSec, 0)) * FPS + Math.floor(parseMathInput(startModFrame, 0)));

  const commit = () => {
    const toFrames = (v: string) => secondsToFrames(parseMathInput(v, 0));

    // For ultimates, update the ANIMATION segment duration
    const animSegmentUpdate = event.columnId === NounType.ULTIMATE && event.segments
      ? {
          segments: event.segments.map((seg) =>
            seg.properties.segmentTypes?.includes(SegmentType.ANIMATION)
              ? { ...seg, properties: { ...seg.properties, duration: toFrames(animSec) } }
              : seg,
          ),
        }
      : {};

    const newDuration = toFrames(activeSec);
    const newSegments = animSegmentUpdate.segments
      ?? (event.segments.length === 1
        ? [{ ...event.segments[0], properties: { ...event.segments[0].properties, duration: newDuration } }]
        : event.segments);

    onUpdate(event.uid, {
      startFrame: computedStartFrame,
      segments: newSegments,
    });
  };

  const handleFocus = () => { focusedRef.current = true; };
  const handleBlur = () => { focusedRef.current = false; commit(); };
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
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
                <span style={{ color: 'var(--red)' }}>FORCED{event.eventStatus ? ' · ' : ''}</span>
              )}
              {event.eventStatus && (
                <>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>Event status: </span>{event.eventStatus.toUpperCase()}
                  {event.eventStatusOwnerId && (() => {
                    const statusSlot = slots.find((s) => s.slotId === event.eventStatusOwnerId);
                    const statusOpName = statusSlot?.operator?.name ?? event.eventStatusOwnerId;
                    const statusOpColor = statusSlot?.operator?.color;
                    const statusSkillLabel = event.eventStatusSkillName
                      ? getAllSkillLabels()[event.eventStatusSkillName as CombatSkillType]
                        ?? getAllStatusLabels()[event.eventStatusSkillName as StatusType]
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
        {interactionMode && interactionMode !== InteractionModeType.STRICT && processedEvent && (
          <DebugPane event={event} processedEvent={processedEvent} rawEvents={rawEvents} allProcessedEvents={allProcessedEvents} />
        )}

        {skillCardData && (
          <div className="edit-panel-section">
            <span className="edit-section-label">Skill Definition</span>
            <DataCardBody data={skillCardData} critState={critState} />
          </div>
        )}

        {statusCardData && (
          <div className="edit-panel-section">
            <span className="edit-section-label">Status Definition</span>
            <DataCardBody data={statusCardData} />
          </div>
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
        {comboTriggerLabels.length > 0 ? (() => {
          const chain = resolveComboChain(event, allProcessedEvents ?? [], slots);
          return (
            <div className="edit-panel-trigger">
              <div>Trigger: {comboTriggerLabels.join(' / ')}</div>
              {comboRequiresLabels.length > 0 && (
                <div>Requires: {comboRequiresLabels.join(', ')}</div>
              )}
              {chain && chain.length > 0 && (
                <div style={{ marginTop: 6, paddingLeft: 2 }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: 10, marginBottom: 3 }}>Source chain:</div>
                  {chain.map((link, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        paddingLeft: i * 10,
                        fontSize: 11,
                      }}
                    >
                      <span style={{
                        color: 'var(--text-muted)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                      }}>
                        {i === 0 ? '┌' : i < chain.length - 1 ? '├' : '└'}
                      </span>
                      <span style={{
                        width: 3,
                        height: 3,
                        borderRadius: '50%',
                        background: link.color,
                        boxShadow: `0 0 4px ${link.color}80`,
                        flexShrink: 0,
                      }} />
                      <span style={{ color: link.color, fontWeight: 600 }}>{link.label}</span>
                      {link.sublabel && (
                        <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>· {link.sublabel}</span>
                      )}
                    </div>
                  ))}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      paddingLeft: chain.length * 10,
                      fontSize: 11,
                    }}
                  >
                    <span style={{
                      color: 'var(--text-muted)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                    }}>└</span>
                    <span style={{
                      width: 3,
                      height: 3,
                      borderRadius: '50%',
                      background: ownerColor,
                      boxShadow: `0 0 4px ${ownerColor}80`,
                      flexShrink: 0,
                    }} />
                    <span style={{ color: ownerColor, fontWeight: 600 }}>{skillName}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })() : triggerCondition ? (
          <div className="edit-panel-trigger">{triggerCondition}</div>
        ) : null}

        {/* ── Status Properties (reaction events on enemy timeline) ────────── */}
        {event.ownerId === ENEMY_OWNER_ID && REACTION_COLUMN_IDS.has(event.columnId) && (() => {
          const element = getStatusElementMap()[event.columnId.toUpperCase()] as ElementType | undefined;
          const elColor = element ? ELEMENT_COLORS[element] : 'var(--text-muted)';
          const elLabel = element ? ELEMENT_LABELS[element] : event.columnId;
          const isAutoReaction = !event.isForced;
          return (
            <div className="edit-panel-section">
              <span className="edit-section-label">Status Properties</span>
              <div className="edit-field">
                <span className="edit-field-label">Element</span>
                <span style={{ color: elColor, fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600 }}>{elLabel}</span>
              </div>
              <StatField
                label="Status Level"
                value={event.stacks ?? 1}
                min={1}
                max={4}
                step={1}
                onChange={(v) => onUpdate(event.uid, { stacks: v })}
              />
              {event.statusValue != null && (
                <div className="edit-field">
                  <span className="edit-field-label">Status Value</span>
                  <div className="edit-field-row">
                    <input
                      className="edit-input"
                      type="text"
                      inputMode="numeric"
                      style={{ width: 60 }}
                      value={formatFlat(event.statusValue * 100)}
                      onChange={(e) => {
                        const pct = parseFloat(e.target.value);
                        if (!isNaN(pct)) onUpdate(event.uid, { statusValue: pct / 100 });
                      }}
                    />
                    <span className="edit-input-unit">%</span>
                  </div>
                </div>
              )}
              <div className="edit-field">
                <span className="edit-field-label">Forced</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: readOnly ? 'default' : 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!event.isForced}
                    disabled={isAutoReaction || readOnly}
                    onChange={(e) => onUpdate(event.uid, { isForced: e.target.checked, forcedReaction: e.target.checked })}
                    style={{ accentColor: elColor }}
                  />
                  <span style={{ fontSize: 11, color: event.isForced ? '#ff5522' : 'var(--text-muted)' }}>
                    {event.isForced ? 'Yes — no infliction stacks required' : 'No'}
                  </span>
                </label>
              </div>
              {isAutoReaction && event.stacks != null && (
                <div className="edit-field">
                  <span className="edit-field-label">Stacks</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{event.stacks}</span>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Status Properties (non-reaction status events: buffs, debuffs) ─── */}
        {isDerived && !(event.ownerId === ENEMY_OWNER_ID && REACTION_COLUMN_IDS.has(event.columnId)) && (() => {
          const statusDef = getStatusById(event.name);
          const hasStackInfo = event.stacks != null || statusDef?.stacks;
          if (!hasStackInfo && event.statusValue == null) return null;
          return (
            <div className="edit-panel-section">
              <span className="edit-section-label">Status Properties</span>
              {hasStackInfo && (
                <>
                  {event.stacks != null && (
                    <StatField
                      label="Active Stacks"
                      value={event.stacks}
                      min={1}
                      max={statusDef?.maxStacks ?? 4}
                      step={1}
                      onChange={(v) => onUpdate(event.uid, { stacks: v })}
                    />
                  )}
                  {statusDef?.stacks && (
                    <>
                      <div className="edit-field">
                        <span className="edit-field-label">Stack Limit</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{statusDef.maxStacks}</span>
                      </div>
                      <div className="edit-field">
                        <span className="edit-field-label">Interaction</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{statusDef.stacks.interactionType}</span>
                      </div>
                    </>
                  )}
                </>
              )}
              {event.statusValue != null && (
                <div className="edit-field">
                  <span className="edit-field-label">Status Value</span>
                  <div className="edit-field-row">
                    <input
                      className="edit-input"
                      type="text"
                      inputMode="numeric"
                      style={{ width: 60 }}
                      value={formatFlat(event.statusValue * 100)}
                      onChange={(e) => {
                        const pct = parseFloat(e.target.value);
                        if (!isNaN(pct)) onUpdate(event.uid, { statusValue: pct / 100 });
                      }}
                    />
                    <span className="edit-input-unit">%</span>
                  </div>
                </div>
              )}
            </div>
          );
        })()}


        <div className="edit-panel-section">
          <span className="edit-section-label">Timing</span>
          <div style={{ padding: '4px 6px' }}>
            {(readOnly || isDerived) ? (
              <div className="edit-info-text">
                <div>Start: {dualTimePrecise(event.startFrame)}</div>
              </div>
            ) : (
              <div className="edit-field">
                <span className="edit-field-label">Start offset</span>
                <div className="edit-field-row">
                  <input
                    className="edit-input"
                    type="text"
                    inputMode="decimal"
                    value={startWholeSec}
                    onChange={(e) => setStartWholeSec(e.target.value)}
                    onBlur={(e) => { setStartWholeSec(String(Math.max(0, Math.floor(parseMathInput(e.target.value, 0))))); handleBlur(); }}
                    onFocus={handleFocus}
                    onKeyDown={handleKeyDown}
                  />
                  <span className="edit-input-unit">s</span>
                  <input
                    className="edit-input"
                    type="text"
                    inputMode="decimal"
                    value={startModFrame}
                    onChange={(e) => setStartModFrame(e.target.value)}
                    onBlur={(e) => { setStartModFrame(String(Math.max(0, Math.min(FPS - 1, Math.floor(parseMathInput(e.target.value, 0)))))); handleBlur(); }}
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
                    <span style={{ color }}>{label}</span>: {formatPct(value)}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {(() => {
          if (!allProcessedEvents || event.ownerId === ENEMY_OWNER_ID) return null;
          const totalDuration = computeSegmentsSpan(event.segments);
          const mods = resolveActiveModifiers(event.startFrame, event.startFrame + totalDuration, allProcessedEvents);
          if (mods.length === 0) return null;
          return (
            <div className="edit-panel-section">
              <span className="edit-section-label">Active Modifiers</span>
              <div className="edit-info-text">
                {mods.map((mod, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ color: mod.color }}>{mod.label}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--green)' }}>{mod.formattedValue}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {event.columnId === OPERATOR_COLUMNS.INPUT && (
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
                  const gain = event.gaugeGainByEnemies![n] ?? event.gaugeGainByEnemies![1] ?? 0;
                  // Update first frame's gaugeGain so the ult energy system picks it up
                  const segments = event.segments ? [...event.segments] : [];
                  if (segments[0]?.frames?.[0]) {
                    const updatedFrames = [...segments[0].frames];
                    updatedFrames[0] = { ...updatedFrames[0], gaugeGain: gain };
                    segments[0] = { ...segments[0], frames: updatedFrames };
                  }
                  onUpdate(event.uid, {
                    enemiesHit: n,
                    gaugeGain: gain,
                    segments,
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
          const consumptionRecord = spConsumptionHistory?.find((r) => r.eventUid === event.uid);
          const spData = resolveSpReturn(event, slots, consumptionRecord);
          if (!spData) return null;
          const { summary: sp, spNotes } = spData;
          const r = formatFlat;
          const spInfo = (
            <div className="edit-info-text">
              {sp.totalSpReturn > 0 && <div>Return: {r(sp.totalSpReturn)}</div>}
              {sp.returnedConsumed > 0 && <div>Natural SP: {r(sp.naturalConsumed)} / Returned SP: {r(sp.returnedConsumed)}</div>}
              <div>Team Ult Charge: +{r(sp.derivedUltimateCharge)}</div>
              {spNotes.map((note, i) => (
                <div key={i} style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{note}</div>
              ))}
            </div>
          );
          return (
            <div className="edit-panel-section">
              <span className="edit-section-label">SP</span>
              <div style={{ padding: '4px 6px' }}>
                {(readOnly || isDerived) ? (
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
                          onUpdate(event.uid, { skillPointCost: val });
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

        </>
        )}

      </div>

      {!(readOnly || isDerived) && !editContext?.startsWith('combo-trigger') && (
        <div className="edit-panel-footer">
          {onSaveAsCustomSkill && SKILL_COLUMN_SET.has(event.columnId) && (
            <button className="btn-save-custom" onClick={() => onSaveAsCustomSkill(event)}>
              SAVE AS CUSTOM
            </button>
          )}
          <button className="btn-delete-event" onClick={() => onRemove(event.uid)}>
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
    || rawSegs.some((s, i) => s.properties.duration !== derivedSegs[i]?.properties.duration);
  const hasDurationDiff = eventDuration(event) !== eventDuration(processedEvent);

  const fmt = (f: number) => `${framesToSeconds(f)}s (${f}f)`;
  const fmtAbs = (f: number) => `${f} (${framesToSeconds(f)}s, f${f % 120})`;

  return (
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, lineHeight: 1.6, padding: '4px 6px', color: 'var(--text-muted)' }}>
      {(hasSegDiff || hasDurationDiff) && (
        <div style={{ color: 'var(--gold)', fontSize: 9, fontWeight: 600, marginBottom: 4 }}>(time-stop diff)</div>
      )}
      {/* Event-level */}
      <div style={{ marginBottom: 6 }}>
        <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: 2 }}>Event</div>
        <div>id: {event.uid}</div>
        <div>startFrame: {event.startFrame} ({framesToSeconds(event.startFrame)}s, f{event.startFrame % 120})</div>
        <div>columnId: {event.columnId}</div>
        {getAnimationDuration(event) > 0 && <div>animationDuration: {fmt(getAnimationDuration(event))}</div>}
        <DebugDiffRow label="duration" raw={eventDuration(event)} derived={eventDuration(processedEvent)} />
        {event.timeInteraction != null && <div>timeInteraction: {event.timeInteraction}</div>}
        {event.timeStop != null && <div>timeStop: {event.timeStop}</div>}
        {event.timeDependency != null && <div>timeDependency: {event.timeDependency}</div>}
        {event.isPerfectDodge && <div>isPerfectDodge: true</div>}
        {event.nonOverlappableRange != null && <div>nonOverlappableRange: {fmt(event.nonOverlappableRange)}</div>}
        {event.sourceOwnerId != null && <div>sourceOwnerId: {event.sourceOwnerId}</div>}
        {processedEvent.warnings && processedEvent.warnings.length > 0 && (
          <div style={{ color: 'var(--red)', marginTop: 2 }}>
            {processedEvent.warnings.map((w, i) => <div key={i}>WARNING: {w}</div>)}
          </div>
        )}
      </div>

      {/* Time-stop region */}
      {getAnimationDuration(event) > 0 && (
        event.columnId === NounType.ULTIMATE || event.columnId === NounType.COMBO_SKILL ||
        (event.columnId === OPERATOR_COLUMNS.INPUT && event.isPerfectDodge)
      ) && (() => {
        const rawStart = event.startFrame;
        const rawAnimDur = getAnimationDuration(event);
        const rawEnd = rawStart + rawAnimDur;
        const procEnd = rawStart + (getAnimationDuration(processedEvent) || rawAnimDur);
        const hasAbsDiff = procEnd !== rawEnd;
        return (
          <div style={{ marginBottom: 6 }}>
            <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: 2 }}>Time Stop</div>
            <div>duration: {fmt(rawAnimDur)}</div>
            <div>raw: {fmtAbs(rawStart)} → {fmtAbs(rawEnd)}</div>
            {hasAbsDiff && (
              <div style={{ color: 'var(--gold)' }}>abs: {fmtAbs(rawStart)} → {fmtAbs(procEnd)}</div>
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
            const segStart = processedEvent.startFrame + derivedSegs.slice(0, si).reduce((s, seg) => s + seg.properties.duration, 0);
            return (
              <div key={si} style={{ marginBottom: 6, paddingLeft: 8, borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ color: 'var(--text-primary)' }}>
                  [{si}] {dSeg.properties.name ?? `Seg ${si + 1}`} @ {fmtAbs(segStart)}
                </div>
                <DebugDiffRow
                  label="durationFrames"
                  raw={rSeg?.properties.duration}
                  derived={dSeg.properties.duration}
                />
                {dSeg.properties.timeDependency != null && <div>timeDependency: {dSeg.properties.timeDependency}</div>}

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
                              <span style={{ color: 'var(--gold)' }}>
                                {' '}→ {fmt(dFrame.derivedOffsetFrame)} (+{fmt(dFrame.derivedOffsetFrame - dFrame.offsetFrame)})
                              </span>
                            )}
                          </div>
                          {dFrame.absoluteFrame != null && (
                            <div>
                              <span style={{ color: 'var(--green)' }}>
                                abs: {fmtAbs(dFrame.absoluteFrame)}
                              </span>
                              {rFrame && (() => {
                                const rawAbs = event.startFrame + (rawSegs.slice(0, si).reduce((s, seg) => s + seg.properties.duration, 0)) + rFrame.offsetFrame;
                                return rawAbs !== dFrame.absoluteFrame ? (
                                  <span style={{ color: 'var(--gold)' }}>
                                    {' '}(raw: {fmtAbs(rawAbs)}, +{fmt(dFrame.absoluteFrame - rawAbs)})
                                  </span>
                                ) : null;
                              })()}
                            </div>
                          )}
                          {dFrame.skillPointRecovery != null && <div>sp: {dFrame.skillPointRecovery}</div>}
                          {dFrame.stagger != null && <div>stagger: {dFrame.stagger}</div>}
                          {dFrame.gaugeGain != null && <div>gauge: {dFrame.gaugeGain}</div>}
                          {dFrame.isCrit != null && <div>isCrit: {String(dFrame.isCrit)}</div>}
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

      {/* Pipeline internals — DerivedEventController snapshot */}
      <PipelineTimeline />

      {/* Object pool + reconciler stats */}
      <PoolReconcilerStats />

      {/* Controller Objects — tree view */}
      {(rawEvents || allProcessedEvents) && (() => {
        const rawIds = rawEvents ? new Set(rawEvents.map((ev) => ev.uid)) : null;
        const allEvents = allProcessedEvents ?? [];
        const derivedIds = new Set(allEvents.filter((ev) => rawIds ? !rawIds.has(ev.uid) : !!ev.sourceOwnerId).map((ev) => ev.uid));
        const rawList = allEvents.filter((ev) => !derivedIds.has(ev.uid));
        const derivedList = allEvents.filter((ev) => derivedIds.has(ev.uid));

        // Build parent→children map: a derived event's parent is the longest
        // raw/derived event ID that is a prefix of its own ID.
        const allIds = allEvents.map((ev) => ev.uid).sort((a, b) => b.length - a.length);
        const childrenMap = new Map<string, TimelineEvent[]>();
        const hasParent = new Set<string>();
        for (const dev of derivedList) {
          let parentId: string | null = null;
          for (const cid of allIds) {
            if (cid !== dev.uid && dev.uid.startsWith(cid + '-')) {
              parentId = cid;
              break; // longest prefix first due to sort
            }
          }
          if (parentId) {
            const children = childrenMap.get(parentId) ?? [];
            children.push(dev);
            childrenMap.set(parentId, children);
            hasParent.add(dev.uid);
          }
        }

        // Render an event row with depth indicators
        const renderRow = (ev: TimelineEvent, depth: number) => {
          const isRaw = !derivedIds.has(ev.uid);
          const pipes = '│'.repeat(depth);
          const prefix = depth > 0 ? pipes + ' ' : '';
          const color = isRaw ? '#88cc44' : '#dd8844';
          const label = getAllSkillLabels()[ev.name as CombatSkillType] ?? getAllStatusLabels()[ev.name as StatusType] ?? ev.name;
          const children = childrenMap.get(ev.uid) ?? [];
          return (
            <div key={ev.uid}>
              <div style={{ marginBottom: 1, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                <span style={{ color: 'var(--text-muted)', whiteSpace: 'pre' }}>{prefix}</span>
                <span style={{ color }}>{ev.ownerId}:{ev.columnId}</span>
                {' '}<span style={{ color: 'var(--text-muted)' }}>({label})</span>
                {' '}@ {ev.startFrame}f
                {' '}<span style={{ color: 'var(--text-muted)' }}>[{fmt(eventDuration(ev))}]</span>
                {ev.eventStatus && <span style={{ color: 'var(--gold)' }}> ({ev.eventStatus})</span>}
              </div>
              {children.sort((a, b) => a.startFrame - b.startFrame).map((child) => renderRow(child, depth + 1))}
            </div>
          );
        };

        // Orphaned derived events (no parent found via ID prefix)
        const orphanDerived = derivedList.filter((ev) => !hasParent.has(ev.uid));

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

/** Pipeline internals: time-stop regions, combo chaining, queue output organized chronologically. */
function PipelineTimeline() {
  const state = getLastController();
  if (!state) return null;

  const stops = state.getStops();
  const comboStops = state.getComboStops();
  const queueOutput = state.getQueueOutput();
  const registered = state.getRegisteredEvents();

  const fmt = (f: number) => `${framesToSeconds(f)}s`;
  const fmtRange = (start: number, dur: number) => `${fmt(start)}–${fmt(start + dur)} (${dur}f)`;

  // Build a unified timeline of pipeline events
  type Entry = { frame: number; type: string; label: string; detail?: string; color: string };
  const entries: Entry[] = [];

  for (const s of stops) {
    const source = registered.find(e => e.uid === s.eventUid);
    const label = source ? `${source.columnId}` : s.eventUid;
    entries.push({
      frame: s.startFrame,
      type: 'TIME_STOP',
      label: `⏸ ${label}`,
      detail: fmtRange(s.startFrame, s.durationFrames),
      color: '#8888cc',
    });
  }

  for (const cs of comboStops) {
    entries.push({
      frame: cs.startFrame,
      type: 'COMBO_CHAIN',
      label: `⛓ combo`,
      detail: `${cs.uid} animDur=${cs.animDur}f`,
      color: '#cc8844',
    });
  }

  // Group queue output by type
  const queueByType = new Map<string, number>();
  for (const ev of queueOutput) {
    const key = ev.columnId;
    queueByType.set(key, (queueByType.get(key) ?? 0) + 1);
  }

  // Show first few queue events chronologically
  const sortedQueue = [...queueOutput].sort((a, b) => a.startFrame - b.startFrame);
  for (const ev of sortedQueue.slice(0, 30)) {
    entries.push({
      frame: ev.startFrame,
      type: 'QUEUE',
      label: ev.columnId,
      detail: `${ev.uid} [${fmt(eventDuration(ev))}]${ev.eventStatus ? ` (${ev.eventStatus})` : ''}`,
      color: ev.eventStatus === EventStatusType.CONSUMED ? '#666' : '#dd8844',
    });
  }

  entries.sort((a, b) => a.frame - b.frame);

  return (
    <div style={{ marginTop: 6, marginBottom: 6 }}>
      <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: 4 }}>
        Pipeline ({stops.length} stops, {comboStops.length} chains, {queueOutput.length} queue events, {registered.length} registered)
      </div>

      {/* Time-stop summary */}
      {stops.length > 0 && (
        <div style={{ marginBottom: 4, paddingLeft: 8, borderLeft: '2px solid #8888cc' }}>
          <div style={{ color: '#8888cc', fontSize: 9, fontWeight: 600, marginBottom: 1 }}>Time Stops</div>
          {stops.map((s, i) => (
            <div key={i} style={{ fontSize: 10 }}>
              {fmtRange(s.startFrame, s.durationFrames)}
              <span style={{ color: 'var(--text-muted)' }}> {s.eventUid}</span>
            </div>
          ))}
        </div>
      )}

      {/* Combo chaining */}
      {comboStops.length > 0 && (
        <div style={{ marginBottom: 4, paddingLeft: 8, borderLeft: '2px solid #cc8844' }}>
          <div style={{ color: '#cc8844', fontSize: 9, fontWeight: 600, marginBottom: 1 }}>Combo Chains</div>
          {comboStops.map((cs, i) => (
            <div key={i} style={{ fontSize: 10 }}>
              @{fmt(cs.startFrame)} animDur={cs.animDur}f
              <span style={{ color: 'var(--text-muted)' }}> {cs.uid}</span>
            </div>
          ))}
        </div>
      )}

      {/* Queue output summary */}
      {queueOutput.length > 0 && (
        <div style={{ marginBottom: 4, paddingLeft: 8, borderLeft: '2px solid #dd8844' }}>
          <div style={{ color: '#dd8844', fontSize: 9, fontWeight: 600, marginBottom: 1 }}>
            Queue Output ({queueOutput.length})
          </div>
          {Array.from(queueByType.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([col, count]) => (
              <div key={col} style={{ fontSize: 10 }}>
                {col}: <span style={{ color: 'var(--text-primary)' }}>{count}</span>
              </div>
            ))}
        </div>
      )}

      {/* Chronological timeline */}
      {entries.length > 0 && (
        <div style={{ paddingLeft: 8, borderLeft: '2px solid rgba(255,255,255,0.1)' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 9, fontWeight: 600, marginBottom: 1 }}>Timeline</div>
          {entries.slice(0, 50).map((e, i) => (
            <div key={i} style={{ fontSize: 10 }}>
              <span style={{ color: 'var(--text-muted)' }}>@{fmt(e.frame)}</span>
              {' '}<span style={{ color: e.color }}>{e.label}</span>
              {e.detail && <span style={{ color: 'var(--text-muted)' }}> {e.detail}</span>}
            </div>
          ))}
          {entries.length > 50 && (
            <div style={{ color: 'var(--text-muted)', fontSize: 9 }}>...{entries.length - 50} more</div>
          )}
        </div>
      )}
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
        <span style={{ color: 'var(--gold)' }}>
          {' '}(raw: {fmt(raw!)}, +{fmt(derived! - raw!)})
        </span>
      )}
    </div>
  );
}

// ── Pool + Reconciler stats ─────────────────────────────────────────────────

function PoolReconcilerStats() {
  const pool = getPoolStats();
  const rec = getReconcileStats();
  return (
    <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: 2 }}>Object Pool</div>
      <div>Pooling: {pool.enabled ? 'ON' : 'OFF'}</div>
      <div>Events: {pool.eventPoolUsed}/{pool.eventPoolSize} (limit {pool.eventPoolLimit})</div>
      <div>QueueFrames: {pool.qfPoolUsed}/{pool.qfPoolSize}</div>
      <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginTop: 6, marginBottom: 2 }}>Reconciler</div>
      <div>Total: {rec.total} | Reused: {rec.reused} | Fresh: {rec.fresh}</div>
      <div>Cache: {rec.cacheSize}</div>
    </div>
  );
}

export default EventPane;
