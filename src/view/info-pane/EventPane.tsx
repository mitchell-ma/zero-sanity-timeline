import React, { useState, useEffect, useRef, useMemo } from 'react';
import { NounType } from '../../dsl/semantics';
import { framesToSeconds, secondsToFrames, frameToDetailLabel, frameToTimeLabelPrecise, FPS } from '../../utils/timeline';
import { formatPct, formatFlat } from '../../controller/info-pane/loadoutPaneController';
import { parseMathInput } from '../../utils/mathExpr';
import { getAllSkillLabels, getAllStatusLabels } from '../../controller/gameDataStore';
import { ELEMENT_COLORS, ELEMENT_LABELS, ElementType, EventStatusType, InfoLevel, SegmentType, StatusType, UnitType } from '../../consts/enums';
import { DAMAGE_FACTOR_LABELS } from '../../consts/timelineColumnLabels';
import { t } from '../../locales/locale';
import { getStatusElementMap, getStatusById, getAnyStatusSerialized } from '../../controller/gameDataStore';
import { TimelineEvent, Operator, Enemy, SelectedFrame, Column, computeSegmentsSpan, getAnimationDuration, eventDuration } from '../../consts/viewTypes';
import type { LoadoutProperties } from '../InformationPane';
import { resolveEventIdentity, resolveSpReturn, resolveActiveModifiers, resolveComboChain, applyCardOverrides } from '../../controller/info-pane/eventPaneController';
import { getOperatorSkill, getOperatorBase } from '../../controller/gameDataStore';
import { DataCardBody, FrameCritState, EditState, EditableValue, VaryByLoadout } from '../custom/DataCardComponents';
import type { OverrideStore } from '../../consts/overrideTypes';
import { buildOverrideKey } from '../../controller/overrideController';
import { findUltimateEnergyGainInClauses, findSkillPointRecoveryInClauses, findStaggerInClauses } from '../../controller/timeline/clauseQueries';
import { ENEMY_ID, OPERATOR_COLUMNS, REACTION_COLUMN_IDS, SKILL_COLUMN_ORDER } from '../../model/channels';
import { getLastController } from '../../controller/timeline/eventQueueController';
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
  debugMode?: boolean;
  rawEvents?: readonly TimelineEvent[];
  allProcessedEvents?: readonly TimelineEvent[];
  loadoutProperties?: Record<string, LoadoutProperties>;
  damageRows?: DamageTableRow[];
  spConsumptionHistory?: { eventUid: string; frame: number; naturalConsumed: number; returnedConsumed: number }[];
  onSaveAsCustomSkill?: (event: TimelineEvent) => void;
  verbose?: InfoLevel;
  overrides?: OverrideStore;
  onSetJsonOverride?: (target: TimelineEvent, path: string, value: number) => void;
  onClearJsonOverride?: (target: TimelineEvent, path: string) => void;
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
  debugMode,
  rawEvents,
  allProcessedEvents,
  loadoutProperties,
  damageRows,
  spConsumptionHistory,
  onSaveAsCustomSkill,
  verbose = InfoLevel.DETAILED,
  overrides,
  onSetJsonOverride,
  onClearJsonOverride,
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
  // Serialized skill data with runtime overrides (frame offsets, segment durations)
  // applied so the DataCardBody reflects live drag edits.
  const skillCardData = useMemo(() => {
    if (verbose < InfoLevel.DETAILED) return null;
    const slot = slots.find((s) => s.slotId === event.ownerEntityId);
    if (!slot?.operator?.id) return null;
    const skillObj = getOperatorSkill(slot.operator.id, event.name);
    if (!skillObj) return null;
    const data = skillObj.serialize() as Record<string, unknown>;
    const key = buildOverrideKey(event);
    const entry = overrides?.[key];
    return entry ? applyCardOverrides(data, entry) : data;
  }, [event, slots, verbose, overrides]);

  // Raw serialized status data for verbose DataCardBody rendering. When the
  // status def has no segments (e.g. Corrosion — segments are built at runtime
  // by buildCorrosionSegments), fall back to the processed event's segments
  // converted to JsonSkillData shape so per-segment APPLY clauses render.
  const statusCardData = useMemo(() => {
    if (verbose < InfoLevel.DETAILED) return null;
    if (skillCardData) return null; // skill card takes precedence
    const data = getAnyStatusSerialized(event.name);
    if (!data) return null;
    if ((data.segments as unknown[] | undefined)?.length) return data;
    const runtimeSegs = (processedEvent?.segments?.length ? processedEvent.segments : event.segments) ?? [];
    if (runtimeSegs.length === 0) return data;
    return {
      ...data,
      segments: runtimeSegs.map((seg) => ({
        properties: {
          ...(seg.properties.name != null ? { name: seg.properties.name } : {}),
          duration: { value: seg.properties.duration / FPS, unit: UnitType.SECOND },
        },
        ...(seg.clause ? { clause: seg.clause } : {}),
        ...(seg.frames ? { frames: seg.frames } : {}),
      })),
    };
  }, [event.name, event.segments, processedEvent, verbose, skillCardData]);

  // Live loadout dimensions for VARY_BY active-column highlighting. Generic
  // info-presentation concern: every card gets a loadout, unconditionally.
  // Fields default to undefined when no source operator resolves — VaryByLeaf
  // simply skips highlighting dimensions it can't place.
  const varyByLoadout = useMemo<VaryByLoadout>(() => {
    const src = event.sourceEntityId;
    const props = loadoutProperties?.[src ?? '']
      ?? loadoutProperties?.[slots.find((s) => s.operator?.id === src)?.slotId ?? ''];
    const skills = props?.skills;
    const skillByCol: Record<string, number | undefined> = skills ? {
      [NounType.BASIC_ATTACK]: skills.basicAttackLevel,
      [NounType.BATTLE]: skills.battleSkillLevel,
      [NounType.COMBO]: skills.comboSkillLevel,
      [NounType.ULTIMATE]: skills.ultimateLevel,
    } : {};

    // Determine the talent slot this card's VARY_BY TALENT_LEVEL values should
    // resolve against. Mirrors engine's resolveTalentLevel: match event.name or
    // the status def's originId against the operator's talents.one/two ids.
    let talentSlot: 'one' | 'two' | undefined;
    const originId = (statusCardData?.metadata as Record<string, unknown> | undefined)?.originId as string | undefined
      ?? (skillCardData?.metadata as Record<string, unknown> | undefined)?.originId as string | undefined;
    if (src) {
      const op = getOperatorBase(src);
      const talentOneId = op?.talents?.one?.id;
      const talentTwoId = op?.talents?.two?.id;
      const defId = event.name;
      if (talentTwoId && (defId === talentTwoId || originId === talentTwoId)) talentSlot = 'two';
      else if (talentOneId && (defId === talentOneId || originId === talentOneId)) talentSlot = 'one';
    }

    // For status events, trace originId to the originating skill's column
    // (e.g. Harass → SHIELDGUARD_BANNER → ULTIMATE → ultimateLevel).
    let resolvedSkillLevel = skillByCol[event.columnId];
    if (resolvedSkillLevel == null && originId && src) {
      const originSkill = getOperatorSkill(src, originId);
      if (originSkill?.eventCategoryType) resolvedSkillLevel = skillByCol[originSkill.eventCategoryType];
    }

    // Resolve supplied-parameter selections (e.g. ENEMY_HIT) to 0-based indices
    // so VARY_BY tables can highlight the user-picked column. Mirrors the engine:
    // resolvedParams[def.id] = event.parameterValues[def.id] - def.lowerRange.
    const parameterIndices: Record<string, number> = {};
    const paramValues = (event as { parameterValues?: Record<string, number> }).parameterValues;
    const paramDefsRaw = (event as { suppliedParameters?: Record<string, { id: string; lowerRange: number }[]> }).suppliedParameters;
    const varyByDefs = paramDefsRaw?.VARY_BY;
    if (varyByDefs && varyByDefs.length > 0) {
      for (const def of varyByDefs) {
        const raw = paramValues?.[def.id] ?? def.lowerRange;
        parameterIndices[def.id] = raw - def.lowerRange;
      }
    }

    return {
      skillLevel: resolvedSkillLevel ?? skills?.battleSkillLevel,
      potential: props?.operator?.potential,
      talentOneLevel: props?.operator?.talentOneLevel,
      talentTwoLevel: props?.operator?.talentTwoLevel,
      attributeIncreaseLevel: props?.operator?.attributeIncreaseLevel,
      talentSlot,
      ...(Object.keys(parameterIndices).length > 0 ? { parameterIndices } : {}),
    };
  }, [loadoutProperties, slots, event, skillCardData, statusCardData]);

  // Inline edit state for status/skill value overrides.
  // Paths are rooted at the TimelineEvent's segments subtree (top-level
  // serialized `properties.*` is intentionally readonly — those live on the
  // cached JSON, not on the event).
  const editState = useMemo<EditState | undefined>(() => {
    if (readOnly || !onSetJsonOverride || !onClearJsonOverride) return undefined;
    // Only freeform-placed events support value overrides — their segments are
    // re-applied post-pipeline via applyEventOverrides. Column-bound events
    // (skills, basic attacks) would lose overrides on every pipeline re-run.
    if (event.creationInteractionMode == null) return undefined;
    const key = buildOverrideKey(event);
    const entry = overrides?.[key];
    const jsonOverrides = entry?.jsonOverrides;
    return {
      getOverride: (path) => jsonOverrides?.[path],
      isOverridden: (path) => !!jsonOverrides && path in jsonOverrides,
      setOverride: (path, value) => onSetJsonOverride(event, path, value),
      clearOverride: (path) => onClearJsonOverride(event, path),
    };
  // Depend on event identity (key ingredients) and the override entry for this event
  }, [event, overrides, readOnly, onSetJsonOverride, onClearJsonOverride]);

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
          {(event.eventStatus || event.isForced) && (
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
              {event.isForced && (
                <span style={{ color: 'var(--red)' }}>FORCED{event.eventStatus ? ' · ' : ''}</span>
              )}
              {event.eventStatus && (
                <>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>Event status: </span>{event.eventStatus.toUpperCase()}
                  {(() => {
                    const dec = getLastController();
                    const causalityGraph = dec?.getCausality();
                    const sourceUid = causalityGraph?.lastTransitionSource(event.uid);
                    if (!sourceUid) return null;
                    const sourceEvent = dec?.getAllEvents().find(e => e.uid === sourceUid);
                    if (!sourceEvent) return null;
                    const statusSlot = slots.find((s) => s.slotId === sourceEvent.ownerEntityId) ?? slots.find((s) => s.slotId === sourceEvent.sourceEntityId);
                    const statusOpName = statusSlot?.operator?.name ?? sourceEvent.sourceEntityId ?? sourceUid;
                    const statusOpColor = statusSlot?.operator?.color;
                    const statusSkillLabel = sourceEvent.sourceSkillId
                      ? getAllSkillLabels()[sourceEvent.sourceSkillId as string]
                        ?? getAllStatusLabels()[sourceEvent.sourceSkillId as StatusType]
                        ?? sourceEvent.sourceSkillId
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

        {skillCardData && (() => {
          // ── Build Skill Definition card extraFields ──────────────────
          // Consolidates SP cost, Enemies Hit (ultimate energy variants),
          // and Type (dodge/dash for INPUT column) into the card's extra
          // slot. Same hot-wire affordance for scalar numeric fields.
          const consumptionRecord = spConsumptionHistory?.find((r) => r.eventUid === event.uid);
          const spData = resolveSpReturn(event, slots, consumptionRecord);
          const skillRows: React.ReactNode[] = [];

          if (event.columnId === OPERATOR_COLUMNS.INPUT) {
            skillRows.push(
              <div key="type" className="ops-field">
                <span className="ops-field-label">Type</span>
                <span className="ops-field-value">
                  {event.isPerfectDodge ? 'Dodge \u2014 Time Stop, +7.5 SP' : 'Dash'}
                </span>
              </div>
            );
          }

          if (spData) {
            const { summary: sp, spNotes } = spData;
            skillRows.push(
              <div key="spCost" className="ops-field">
                <span className="ops-field-label">SP Cost</span>
                <span className="ops-field-value">
                  {editState ? (
                    <EditableValue value={event.skillPointCost ?? 0} path="skillPointCost" editState={editState} />
                  ) : (
                    event.skillPointCost
                  )}
                </span>
              </div>
            );
            // Readonly SP derived info (return, natural/returned, ult charge)
            const derivedLines: string[] = [];
            if (sp.totalSpReturn > 0) derivedLines.push(`Return: ${formatFlat(sp.totalSpReturn)}`);
            if (sp.returnedConsumed > 0) derivedLines.push(`Natural SP: ${formatFlat(sp.naturalConsumed)} / Returned SP: ${formatFlat(sp.returnedConsumed)}`);
            derivedLines.push(`Team Ult Charge: +${formatFlat(sp.derivedUltimateCharge)}`);
            if (derivedLines.length > 0) {
              skillRows.push(
                <div key="spDerived" className="ops-field">
                  <span className="ops-field-label">SP Info</span>
                  <span className="ops-field-value" style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                    {derivedLines.map((l, i) => <div key={i}>{l}</div>)}
                    {spNotes.map((note, i) => (
                      <div key={`note-${i}`} style={{ color: 'var(--text-muted)' }}>{note}</div>
                    ))}
                  </span>
                </div>
              );
            }
          }

          const skillExtraFields = skillRows.length > 0 ? <>{skillRows}</> : undefined;
          return (
            <div className="edit-panel-section">
              <span className="edit-section-label">Skill Definition</span>
              <DataCardBody data={skillCardData} critState={critState} editState={editState} extraFields={skillExtraFields} varyByLoadout={varyByLoadout} />
            </div>
          );
        })()}

        {(() => {
          // ── Build Status Definition card extraFields ─────────────────
          // Consolidates susceptibility, reaction properties (element/
          // stacks/isForced) and non-reaction status properties (stacks) —
          // all formerly rendered as their own edit-panel-sections. Now they
          // sit inside the Status Definition card, sharing the hot-wire edit
          // affordance. TimelineEvent-rooted paths via jsonOverrides;
          // freeform-only edits, auto reset.
          //
          // NOTE: statusValue is intentionally NOT surfaced here. The field
          // is a runtime-resolved scalar extracted from the status's clause
          // `with.value` at event creation — when the value is a complex
          // ValueNode (e.g. VARY_BY [POTENTIAL, INTELLECT]) the resolved
          // scalar is just one cell of the matrix and misleads the reader.
          // The authoritative source lives in the clause itself, rendered by
          // ClauseTabs below the properties list.
          const isReaction = event.ownerEntityId === ENEMY_ID && REACTION_COLUMN_IDS.has(event.columnId);
          const reactionElement = isReaction
            ? (getStatusElementMap()[event.columnId.toUpperCase()] as ElementType | undefined)
            : undefined;
          const statusDef = !isReaction && isDerived ? getStatusById(event.name) : null;
          const hasStackInfo = event.stacks != null || statusDef?.stacks;

          const statusRows: React.ReactNode[] = [];

          if (isReaction && reactionElement) {
            const color = ELEMENT_COLORS[reactionElement] ?? 'var(--text-muted)';
            const label = ELEMENT_LABELS[reactionElement] ?? reactionElement;
            statusRows.push(
              <div key="element" className="ops-field">
                <span className="ops-field-label">Element</span>
                <span className="ops-field-value" style={{ color }}>{label}</span>
              </div>
            );
          }

          if (event.stacks != null && (isReaction || hasStackInfo)) {
            const maxStacks = isReaction ? 4 : (statusDef?.maxStacks ?? 4);
            statusRows.push(
              <div key="stacks" className="ops-field">
                <span className="ops-field-label">{isReaction ? 'Status Level' : 'Active Stacks'}</span>
                <span className="ops-field-value">
                  {editState ? (
                    <EditableValue value={event.stacks} path="stacks" editState={editState} />
                  ) : (
                    event.stacks
                  )}
                  <span style={{ marginLeft: 4, color: 'var(--text-muted)', fontSize: 10 }}>/ {maxStacks}</span>
                </span>
              </div>
            );
          }

          if (isReaction) {
            const elColor = reactionElement ? ELEMENT_COLORS[reactionElement] : 'var(--text-muted)';
            const isAutoReaction = !event.isForced;
            statusRows.push(
              <div key="isForced" className="ops-field">
                <span className="ops-field-label">Forced</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: readOnly ? 'default' : 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!event.isForced}
                    disabled={isAutoReaction || readOnly}
                    onChange={(e) => onUpdate(event.uid, { isForced: e.target.checked })}
                    style={{ accentColor: elColor }}
                  />
                  <span style={{ fontSize: 11, color: event.isForced ? '#ff5522' : 'var(--text-muted)' }}>
                    {event.isForced ? 'Yes \u2014 no infliction stacks required' : 'No'}
                  </span>
                </label>
              </div>
            );
          }

          if (event.susceptibility) {
            for (const [element, value] of Object.entries(event.susceptibility)) {
              const color = ELEMENT_COLORS[element as ElementType] ?? 'var(--text-muted)';
              const label = ELEMENT_LABELS[element as ElementType] ?? element;
              statusRows.push(
                <div key={`susc-${element}`} className="ops-field">
                  <span className="ops-field-label" style={{ color }}>Susc. {label}</span>
                  <span className="ops-field-value">
                    {editState ? (
                      <EditableValue
                        value={value}
                        path={`susceptibility.${element}`}
                        editState={editState}
                        format={(v) => `${formatFlat(v * 100)}%`}
                      />
                    ) : (
                      formatPct(value)
                    )}
                  </span>
                </div>
              );
            }
          }

          // Surface event.statusValue for generic stat-style statuses
          // (FRAGILITY / AMP / WEAKNESS / DMG_REDUCTION / PROTECTION) that carry
          // their runtime magnitude on the event rather than a per-element
          // susceptibility record. Labeled by damageFactorType when known so
          // e.g. HEAT_FRAGILITY renders "Fragility 10.00%" on the card.
          if (event.statusValue != null && !event.susceptibility) {
            const factor = event.damageFactorType;
            const factorLabel = (factor && DAMAGE_FACTOR_LABELS[factor]) ?? t('breakdown.value');
            statusRows.push(
              <div key="statusValue" className="ops-field">
                <span className="ops-field-label">{factorLabel}</span>
                <span className="ops-field-value">
                  {editState ? (
                    <EditableValue
                      value={event.statusValue}
                      path="statusValue"
                      editState={editState}
                      format={(v) => `${formatFlat(v * 100)}%`}
                    />
                  ) : (
                    formatPct(event.statusValue)
                  )}
                </span>
              </div>
            );
          }

          const statusExtraFields = statusRows.length > 0 ? <>{statusRows}</> : undefined;

          if (!statusCardData && !statusExtraFields) return null;
          if (!statusCardData && statusExtraFields) {
            // Fallback: no serialized JSON available but we have per-event
            // status fields to show. Render them in a standalone section so
            // nothing is lost.
            return (
              <div className="edit-panel-section">
                <span className="edit-section-label">Status Properties</span>
                <div className="ops-skill-form">{statusExtraFields}</div>
              </div>
            );
          }
          return (
            <div className="edit-panel-section">
              <span className="edit-section-label">Status Definition</span>
              <DataCardBody data={statusCardData!} editState={editState} extraFields={statusExtraFields} varyByLoadout={varyByLoadout} />
            </div>
          );
        })()}

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
            {(() => {
              const rawDuration = eventDuration(event);
              const adjDuration = processedEvent ? eventDuration(processedEvent) : rawDuration;
              const hasAdjustment = processedEvent != null && adjDuration !== rawDuration;
              if (rawDuration === 0 && !hasAdjustment) return null;
              return (
                <div className="edit-info-text" style={{ marginTop: 6 }}>
                  <div>Duration: {framesToSeconds(rawDuration)}s ({rawDuration}f)</div>
                  {hasAdjustment && (
                    <div style={{ color: 'var(--gold)' }}>
                      Time-stop adjusted: {framesToSeconds(adjDuration)}s ({adjDuration}f)
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>

        {(() => {
          if (!allProcessedEvents || event.ownerEntityId === ENEMY_ID) return null;
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
        {event.sourceEntityId != null && <div>sourceEntityId: {event.sourceEntityId}</div>}
        {processedEvent.warnings && processedEvent.warnings.length > 0 && (
          <div style={{ color: 'var(--red)', marginTop: 2 }}>
            {processedEvent.warnings.map((w, i) => <div key={i}>WARNING: {w}</div>)}
          </div>
        )}
      </div>

      {/* Time-stop region */}
      {getAnimationDuration(event) > 0 && (
        event.columnId === NounType.ULTIMATE || event.columnId === NounType.COMBO ||
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
                          {(() => {
                            const sp = findSkillPointRecoveryInClauses(dFrame.clauses);
                            return sp != null ? <div>sp: {sp}</div> : null;
                          })()}
                          {(() => {
                            const stag = findStaggerInClauses(dFrame.clauses);
                            return stag != null ? <div>stagger: {stag}</div> : null;
                          })()}
                          {(() => {
                            const gauge = findUltimateEnergyGainInClauses(dFrame.clauses);
                            return gauge != null ? <div>gauge: {gauge}</div> : null;
                          })()}
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

      {/* Controller Objects — tree view */}
      {(rawEvents || allProcessedEvents) && (() => {
        const rawIds = rawEvents ? new Set(rawEvents.map((ev) => ev.uid)) : null;
        const allEvents = allProcessedEvents ?? [];
        const derivedIds = new Set(allEvents.filter((ev) => rawIds ? !rawIds.has(ev.uid) : !!ev.sourceEntityId).map((ev) => ev.uid));
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
          const label = getAllSkillLabels()[ev.name as string] ?? getAllStatusLabels()[ev.name as StatusType] ?? ev.name;
          const children = childrenMap.get(ev.uid) ?? [];
          return (
            <div key={ev.uid}>
              <div style={{ marginBottom: 1, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                <span style={{ color: 'var(--text-muted)', whiteSpace: 'pre' }}>{prefix}</span>
                <span style={{ color }}>{ev.ownerEntityId}:{ev.columnId}</span>
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
  const registered = state.getAllEvents();
  // Single source of storage — registeredEvents is everything.
  const queueOutput = registered;

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

export default EventPane;
