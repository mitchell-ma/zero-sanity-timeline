import React, { useState, useEffect, useRef, useMemo } from 'react';
import { framesToSeconds, secondsToFrames, frameToDetailLabel, frameToTimeLabelPrecise, FPS } from '../../utils/timeline';
import { COMBAT_SKILL_LABELS, STATUS_LABELS } from '../../consts/timelineColumnLabels';
import { CombatSkillsType, ELEMENT_COLORS, ELEMENT_LABELS, ElementType, EventFrameType, EventStatusType, SegmentType, StatusType, STATUS_ELEMENT } from '../../consts/enums';
import { TimelineEvent, Operator, Enemy, SelectedFrame, Column, MiniTimeline, computeSegmentsSpan } from '../../consts/viewTypes';
import { DurationField, StatField, SegmentDurationField, FrameOffsetField } from './SharedFields';
import type { LoadoutStats } from '../InformationPane';
import { resolveEventIdentity, resolveSpReturn, resolveActiveModifiers, resolveComboChain, resolveEventDsl, resolveEventFullDetail } from '../../controller/info-pane/eventPaneController';
import type { ResolvedPredicate, EventFullDetail } from '../../controller/info-pane/eventPaneController';
import type { Effect, Interaction } from '../../consts/semantics';
import { ENEMY_OWNER_ID, REACTION_COLUMN_IDS, SKILL_COLUMNS, SKILL_COLUMN_ORDER } from '../../model/channels';
import { getSkillMultiplier, getPerTickMultiplier } from '../../controller/calculation/jsonMultiplierEngine';
import type { DamageTableRow } from '../../controller/calculation/damageTableBuilder';

const SKILL_COLUMN_SET = new Set<string>(SKILL_COLUMN_ORDER);

// ── Frame DSL effects display ───────────────────────────────────────────────

/** Renders DSL effect lines for a frame marker (infliction, absorption, status, etc.). */
function FrameDslEffects({ f }: { f: import('../../consts/viewTypes').EventFrameMarker }) {
  return (
    <>
      {f.applyArtsInfliction && (
        <div className="frame-dsl-effect" style={{ color: ELEMENT_COLORS[f.applyArtsInfliction.element as ElementType] ?? '#f07030' }}>
          APPLY {f.applyArtsInfliction.stacks} {f.applyArtsInfliction.element.toUpperCase()} INFLICTION TO ENEMY
        </div>
      )}
      {f.absorbArtsInfliction && (
        <div className="frame-dsl-effect" style={{ color: ELEMENT_COLORS[f.absorbArtsInfliction.element as ElementType] ?? '#f0a040' }}>
          {(() => { const [a, b] = f.absorbArtsInfliction!.ratio.split(':').map(Number); const el = f.absorbArtsInfliction!.element.toUpperCase(); const status = f.absorbArtsInfliction!.exchangeStatus; return `ABSORB ${a} ${el} INFLICTION FROM ENEMY → APPLY ${b} ${status.replace(/_/g, ' ')} STATUS TO THIS OPERATOR (max ${f.absorbArtsInfliction!.stacks})`; })()}
        </div>
      )}
      {f.consumeArtsInfliction && (
        <div className="frame-dsl-effect" style={{ color: ELEMENT_COLORS[f.consumeArtsInfliction.element as ElementType] ?? '#f0a040' }}>
          CONSUME {f.consumeArtsInfliction.stacks} {f.consumeArtsInfliction.element.toUpperCase()} INFLICTION FROM ENEMY
        </div>
      )}
      {f.consumeStatus && (
        <div className="frame-dsl-effect" style={{ color: 'var(--gold)' }}>
          CONSUME ALL {(STATUS_LABELS[f.consumeStatus as StatusType] ?? f.consumeStatus).toUpperCase().replace(/ /g, '_')} STACKS
        </div>
      )}
      {f.applyStatus && (
        <div className="frame-dsl-effect" style={{ color: ELEMENT_COLORS[STATUS_ELEMENT[f.applyStatus.status] as ElementType] ?? '#55aadd' }}>
          APPLY {f.applyStatus.stacks > 0 ? `${f.applyStatus.stacks} ` : ''}{(STATUS_LABELS[f.applyStatus.status as StatusType] ?? f.applyStatus.status).toUpperCase().replace(/ /g, '_')} STATUS TO {f.applyStatus.target === 'ENEMY' ? 'ENEMY' : f.applyStatus.target === 'SELF' ? 'THIS OPERATOR' : f.applyStatus.target.toUpperCase()}
        </div>
      )}
      {f.applyForcedReaction && (
        <div className="frame-dsl-effect" style={{ color: ELEMENT_COLORS[STATUS_ELEMENT[f.applyForcedReaction.reaction] as ElementType] ?? '#ff5522' }}>
          APPLY FORCED {(STATUS_LABELS[f.applyForcedReaction.reaction as StatusType] ?? f.applyForcedReaction.reaction).toUpperCase().replace(/ /g, '_')} REACTION TO ENEMY (Lv.{f.applyForcedReaction.statusLevel})
        </div>
      )}
      {f.consumeReaction && (
        <div className="frame-dsl-effect" style={{ color: 'var(--gold)' }}>
          CONSUME {f.consumeReaction.columnId.toUpperCase().replace(/ /g, '_')} REACTION FROM ENEMY
          {f.consumeReaction.applyStatus && (
            <> → APPLY {f.consumeReaction.applyStatus.stacks > 0 ? `${f.consumeReaction.applyStatus.stacks} ` : ''}{(STATUS_LABELS[f.consumeReaction.applyStatus.status as StatusType] ?? f.consumeReaction.applyStatus.status).toUpperCase().replace(/ /g, '_')} STATUS</>
          )}
        </div>
      )}
      {f.duplicatesSourceInfliction && (
        <div className="frame-dsl-effect" style={{ color: 'var(--text-muted)' }}>
          APPLY SOURCE INFLICTION TO ENEMY
        </div>
      )}
    </>
  );
}

/** Renders a list of DSL predicates (conditions → effects). */
function PredicateDisplay({ predicates, label }: { predicates: ResolvedPredicate[]; label?: string }) {
  if (predicates.length === 0) return null;
  return (
    <div style={{ marginTop: 4 }}>
      {label && <div style={{ color: 'var(--text-muted)', fontSize: 10, fontWeight: 600, marginBottom: 2 }}>{label}</div>}
      {predicates.map((pred, pi) => (
        <div key={pi} style={{ marginBottom: 4, paddingLeft: 6, borderLeft: '2px solid rgba(255,221,68,0.2)' }}>
          {pred.conditions.length > 0 && (
            <div>
              <span style={{ color: 'var(--text-muted)', fontSize: 9, fontWeight: 600 }}>WHEN</span>
              {pred.conditions.map((c, ci) => (
                <div key={ci} className="frame-dsl-effect" style={{ color: 'var(--gold)', paddingLeft: 4 }}>{c}</div>
              ))}
            </div>
          )}
          {pred.effects.length > 0 && (
            <div>
              <span style={{ color: 'var(--text-muted)', fontSize: 9, fontWeight: 600 }}>THEN</span>
              {pred.effects.map((e, ei) => (
                <div key={ei} className="frame-dsl-effect" style={{ color: '#55aadd', paddingLeft: 4 }}>{e}</div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Renders DSL effect tags for raw effects (not predicate-gated). */
function DslEffectTags({ effects }: { effects: string[] }) {
  if (effects.length === 0) return null;
  return (
    <div style={{ marginTop: 2 }}>
      {effects.map((e, i) => (
        <div key={i} className="frame-dsl-effect" style={{ color: '#55aadd' }}>{e}</div>
      ))}
    </div>
  );
}

// ── Verbose detail rendering ────────────────────────────────────────────────

const DETAIL_LABEL: React.CSSProperties = {
  color: 'var(--text-muted)', fontSize: 10, fontWeight: 600, fontFamily: 'var(--font-mono)',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 6, marginBottom: 2,
};
const DETAIL_VALUE: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', paddingLeft: 6,
};
const DETAIL_MONO: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 11,
};

/** Renders a single Interaction (condition) with syntax coloring. */
function InteractionLine({ interaction }: { interaction: Interaction }) {
  const fmt = (s: string) => s.replace(/_/g, ' ');
  return (
    <div style={{ ...DETAIL_MONO, paddingLeft: 8 }}>
      <span style={{ color: '#dd8844' }}>{fmt(interaction.subjectType)}</span>
      {interaction.subjectProperty && <span style={{ color: 'var(--text-muted)' }}>.{fmt(String(interaction.subjectProperty))}</span>}
      {interaction.negated && <span style={{ color: '#ff5555' }}> NOT</span>}
      <span style={{ color: 'var(--gold)' }}> {fmt(interaction.verbType)}</span>
      <span style={{ color: '#55aadd' }}> {fmt(interaction.objectType)}</span>
      {interaction.objectId && <span style={{ color: 'var(--text-muted)' }}> ({interaction.objectId})</span>}
      {interaction.cardinalityConstraint && <span style={{ color: '#88cc44' }}> {fmt(interaction.cardinalityConstraint)} {interaction.cardinality}</span>}
      {interaction.element && <span style={{ color: ELEMENT_COLORS[interaction.element.toUpperCase() as ElementType] ?? '#aaa' }}> [{interaction.element}]</span>}
      {interaction.stacks != null && <span style={{ color: 'var(--text-muted)' }}> stacks={interaction.stacks}</span>}
    </div>
  );
}

/** Renders a single Effect with syntax coloring, including nested child effects. */
function EffectLine({ effect, depth = 0 }: { effect: Effect; depth?: number }) {
  const fmt = (s: string) => s.replace(/_/g, ' ');
  const adjs = effect.adjective ? (Array.isArray(effect.adjective) ? effect.adjective : [effect.adjective]) : [];

  return (
    <div style={{ paddingLeft: 8 + depth * 10 }}>
      <div style={DETAIL_MONO}>
        <span style={{ color: 'var(--gold)' }}>{fmt(effect.verbType)}</span>
        {effect.cardinality != null && <span style={{ color: '#88cc44' }}> {String(effect.cardinality)}</span>}
        {adjs.length > 0 && <span style={{ color: '#dd8844' }}> {adjs.map(a => fmt(a)).join(' ')}</span>}
        {effect.objectType && <span style={{ color: '#55aadd' }}> {fmt(String(effect.objectType))}</span>}
        {effect.objectId && <span style={{ color: 'var(--text-muted)' }}> ({effect.objectId})</span>}
        {effect.toObjectType && <span style={{ color: '#cc88dd' }}> TO {fmt(String(effect.toObjectType))}</span>}
        {effect.fromObjectType && <span style={{ color: '#cc88dd' }}> FROM {fmt(String(effect.fromObjectType))}</span>}
        {effect.onObjectType && <span style={{ color: '#cc88dd' }}> ON {fmt(String(effect.onObjectType))}</span>}
        {effect.forPreposition && (
          <span style={{ color: '#88cc44' }}> FOR {fmt(effect.forPreposition.cardinalityConstraint)} {effect.forPreposition.cardinality}</span>
        )}
        {effect.cardinalityConstraint && !effect.forPreposition && (
          <span style={{ color: '#88cc44' }}> {fmt(effect.cardinalityConstraint)}</span>
        )}
      </div>
      {effect.withPreposition && (
        <div style={{ ...DETAIL_MONO, paddingLeft: 16 + depth * 10, color: 'var(--text-muted)' }}>
          {Object.entries(effect.withPreposition).map(([k, v]) => {
            const val = typeof v.value === 'number' ? String(v.value)
              : `[${(v.value as number[]).slice(0, 4).join(', ')}${(v.value as number[]).length > 4 ? ` ...+${(v.value as number[]).length - 4}` : ''}]`;
            return (
              <div key={k}>
                <span style={{ color: '#888' }}>WITH</span>{' '}
                <span style={{ color: '#55aadd' }}>{k.replace(/_/g, ' ')}</span>{' '}
                <span style={{ color: '#88cc44' }}>{v.verb}</span>{' '}
                {v.object && <span style={{ color: '#dd8844' }}>{v.object} </span>}
                <span style={{ color: 'var(--text-primary)' }}>{val}</span>
              </div>
            );
          })}
        </div>
      )}
      {effect.effects && effect.effects.length > 0 && (
        <div>
          {effect.effects.map((child, i) => (
            <EffectLine key={i} effect={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Renders the full verbose detail panel for an event. */
function EventFullDetailPanel({ detail, event }: { detail: EventFullDetail; event: TimelineEvent }) {
  return (
    <div className="edit-panel-section">
      <span className="edit-section-label">Internal Structure</span>
      <div style={{ padding: '4px 6px' }}>
        {/* Identity */}
        <div style={DETAIL_LABEL}>Identity</div>
        <div style={DETAIL_VALUE}>
          <div>Skill ID: <span style={{ color: 'var(--text-primary)' }}>{detail.skillId}</span></div>
          {detail.skillTypeMapping && (
            <div>Skill Type: <span style={{ color: '#dd8844' }}>{detail.skillTypeMapping}</span></div>
          )}
          {detail.originId && (
            <div>Origin: <span style={{ color: 'var(--text-primary)' }}>{detail.originId}</span></div>
          )}
          <div>Event ID: <span style={{ color: 'var(--text-muted)' }}>{event.id}</span></div>
          <div>Column: <span style={{ color: 'var(--text-primary)' }}>{event.columnId}</span></div>
          <div>Owner: <span style={{ color: 'var(--text-primary)' }}>{event.ownerId}</span></div>
        </div>

        {/* Properties */}
        {detail.properties && (
          <>
            <div style={DETAIL_LABEL}>Skill Properties</div>
            <div style={DETAIL_VALUE}>
              {Object.entries(detail.properties).map(([k, v]) => (
                <div key={k}>{k}: <span style={{ color: 'var(--text-primary)' }}>{v.value}{v.unit ? ` ${v.unit}` : ''}</span></div>
              ))}
            </div>
          </>
        )}

        {/* Event timing */}
        <div style={DETAIL_LABEL}>Event Timing (frames)</div>
        <div style={DETAIL_VALUE}>
          <div>startFrame: <span style={{ color: 'var(--text-primary)' }}>{event.startFrame}</span></div>
          <div>activationDuration: <span style={{ color: 'var(--text-primary)' }}>{event.activationDuration}</span></div>
          <div>activeDuration: <span style={{ color: 'var(--text-primary)' }}>{event.activeDuration}</span></div>
          <div>cooldownDuration: <span style={{ color: 'var(--text-primary)' }}>{event.cooldownDuration}</span></div>
          {event.animationDuration != null && (
            <div>animationDuration: <span style={{ color: 'var(--text-primary)' }}>{event.animationDuration}</span></div>
          )}
        </div>

        {/* Event metadata */}
        {(event.skillPointCost != null || event.gaugeGain != null || event.teamGaugeGain != null || event.forcedReaction || event.inflictionStacks != null || event.statusLevel != null || event.statusValue != null) && (
          <>
            <div style={DETAIL_LABEL}>Event Data</div>
            <div style={DETAIL_VALUE}>
              {event.skillPointCost != null && <div>skillPointCost: <span style={{ color: 'var(--gold)' }}>{event.skillPointCost}</span></div>}
              {event.gaugeGain != null && <div>gaugeGain: <span style={{ color: '#55aadd' }}>{event.gaugeGain}</span></div>}
              {event.teamGaugeGain != null && <div>teamGaugeGain: <span style={{ color: '#55aadd' }}>{event.teamGaugeGain}</span></div>}
              {event.gaugeGainByEnemies != null && <div>gaugeGainByEnemies: <span style={{ color: '#55aadd' }}>{JSON.stringify(event.gaugeGainByEnemies)}</span></div>}
              {event.inflictionStacks != null && <div>inflictionStacks: <span style={{ color: '#dd8844' }}>{event.inflictionStacks}</span></div>}
              {event.statusLevel != null && <div>statusLevel: <span style={{ color: '#88cc44' }}>{event.statusLevel}</span></div>}
              {event.statusValue != null && <div>statusValue: <span style={{ color: '#88cc44' }}>{(event.statusValue * 100).toFixed(1)}%</span></div>}
              {event.forcedReaction && <div style={{ color: '#ff5522' }}>forcedReaction: true</div>}
              {event.isForced && <div style={{ color: '#ff5522' }}>isForced: true</div>}
              {event.eventStatus && <div>eventStatus: <span style={{ color: 'var(--gold)' }}>{event.eventStatus}</span></div>}
            </div>
          </>
        )}

        {/* Source event data */}
        {(event.sourceOwnerId || event.sourceSkillName || event.comboTriggerColumnId) && (
          <>
            <div style={DETAIL_LABEL}>Source / Trigger</div>
            <div style={DETAIL_VALUE}>
              {event.sourceOwnerId && <div>sourceOwnerId: <span style={{ color: 'var(--text-primary)' }}>{event.sourceOwnerId}</span></div>}
              {event.sourceSkillName && <div>sourceSkillName: <span style={{ color: 'var(--text-primary)' }}>{event.sourceSkillName}</span></div>}
              {event.comboTriggerColumnId && <div>comboTriggerColumnId: <span style={{ color: 'var(--text-primary)' }}>{event.comboTriggerColumnId}</span></div>}
            </div>
          </>
        )}

        {/* Skill-level clause */}
        {detail.clause && detail.clause.length > 0 && (
          <>
            <div style={DETAIL_LABEL}>Skill Clause</div>
            {detail.clause.map((pred, pi) => (
              <div key={pi} style={{ marginBottom: 4, paddingLeft: 6, borderLeft: '2px solid rgba(255,221,68,0.15)' }}>
                {pred.conditions.length > 0 && (
                  <>
                    <div style={{ ...DETAIL_MONO, color: 'var(--text-muted)', fontSize: 9 }}>CONDITIONS</div>
                    {pred.conditions.map((c, ci) => <InteractionLine key={ci} interaction={c} />)}
                  </>
                )}
                {pred.effects.length > 0 && (
                  <>
                    <div style={{ ...DETAIL_MONO, color: 'var(--text-muted)', fontSize: 9, marginTop: 2 }}>EFFECTS</div>
                    {pred.effects.map((e, ei) => <EffectLine key={ei} effect={e} />)}
                  </>
                )}
              </div>
            ))}
          </>
        )}

        {/* Skill-level effects */}
        {detail.effects && detail.effects.length > 0 && (
          <>
            <div style={DETAIL_LABEL}>Skill Effects</div>
            {detail.effects.map((e, i) => <EffectLine key={i} effect={e} />)}
          </>
        )}

        {/* Segments */}
        {detail.segments.length > 0 && (
          <>
            <div style={DETAIL_LABEL}>Segments ({detail.segments.length})</div>
            {detail.segments.map((seg) => (
              <div key={seg.index} style={{ marginBottom: 6, paddingLeft: 4, borderLeft: '2px solid rgba(100,200,255,0.1)' }}>
                <div style={{ ...DETAIL_MONO, color: '#55aadd', fontWeight: 600, fontSize: 10 }}>
                  Segment {seg.index + 1}
                  {seg.properties?.duration && (
                    <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                      {' '}— {(seg.properties.duration as any).value}{(seg.properties.duration as any).unit ? `${(seg.properties.duration as any).unit.toLowerCase().replace('second', 's')}` : ''}
                    </span>
                  )}
                  {seg.metadata?.dataSources && (
                    <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> [{seg.metadata.dataSources.join(', ')}]</span>
                  )}
                </div>

                {/* Segment clause */}
                {seg.clause && seg.clause.length > 0 && (
                  <div style={{ marginLeft: 6, marginTop: 2 }}>
                    <div style={{ ...DETAIL_MONO, color: 'var(--text-muted)', fontSize: 9 }}>CLAUSE</div>
                    {seg.clause.map((pred, pi) => (
                      <div key={pi} style={{ paddingLeft: 4, borderLeft: '2px solid rgba(255,221,68,0.1)', marginBottom: 2 }}>
                        {pred.conditions.length > 0 && pred.conditions.map((c, ci) => <InteractionLine key={ci} interaction={c} />)}
                        {pred.effects.length > 0 && pred.effects.map((e, ei) => <EffectLine key={ei} effect={e} />)}
                      </div>
                    ))}
                  </div>
                )}

                {/* Segment effects */}
                {seg.effects && seg.effects.length > 0 && (
                  <div style={{ marginLeft: 6, marginTop: 2 }}>
                    <div style={{ ...DETAIL_MONO, color: 'var(--text-muted)', fontSize: 9 }}>EFFECTS</div>
                    {seg.effects.map((e, i) => <EffectLine key={i} effect={e} />)}
                  </div>
                )}

                {/* Frames */}
                {seg.frames.length > 0 && (
                  <div style={{ marginLeft: 6, marginTop: 2 }}>
                    {seg.frames.map((frame) => (
                      <div key={frame.index} style={{ marginBottom: 3 }}>
                        <div style={{ ...DETAIL_MONO, color: 'var(--text-muted)', fontSize: 9 }}>
                          FRAME {frame.index + 1}
                          {frame.properties?.offset && (
                            <span> @ {(frame.properties.offset as any).value}{(frame.properties.offset as any).unit ? `${(frame.properties.offset as any).unit.toLowerCase().replace('second', 's')}` : ''}</span>
                          )}
                        </div>
                        {frame.effects && frame.effects.length > 0 && (
                          frame.effects.map((e, i) => <EffectLine key={i} effect={e} />)
                        )}
                        {frame.multipliers && frame.multipliers.length > 0 && (
                          <div style={{ ...DETAIL_MONO, paddingLeft: 8, color: 'var(--text-muted)', fontSize: 10 }}>
                            multipliers: [{frame.multipliers.length} levels]
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        {/* Status events */}
        {detail.statusEvents && detail.statusEvents.length > 0 && (
          <>
            <div style={DETAIL_LABEL}>Status Events</div>
            {detail.statusEvents.map((se, i) => (
              <div key={i} style={{ ...DETAIL_VALUE, marginBottom: 4, paddingLeft: 6, borderLeft: '2px solid rgba(255,100,50,0.15)' }}>
                <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{se.name}</div>
                {se.target && <div>target: {se.target}</div>}
                {se.element && <div>element: <span style={{ color: ELEMENT_COLORS[se.element?.toUpperCase() as ElementType] ?? 'inherit' }}>{se.element}</span></div>}
                {se.stack && (
                  <div>
                    stacks: max={typeof se.stack.max === 'object' ? JSON.stringify(se.stack.max) : se.stack.max}
                    {se.stack.instances != null && `, instances=${se.stack.instances}`}
                  </div>
                )}
                {se.clause && se.clause.length > 0 && (
                  <div style={{ marginTop: 2 }}>
                    <div style={{ ...DETAIL_MONO, color: 'var(--text-muted)', fontSize: 9 }}>CLAUSE</div>
                    {se.clause.map((pred: any, pi: number) => (
                      <div key={pi} style={{ paddingLeft: 4, borderLeft: '2px solid rgba(255,221,68,0.1)' }}>
                        {pred.conditions?.map((c: Interaction, ci: number) => <InteractionLine key={ci} interaction={c} />)}
                        {pred.effects?.map((e: Effect, ei: number) => <EffectLine key={ei} effect={e} />)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        {/* Metadata */}
        {detail.metadata && (
          <>
            <div style={DETAIL_LABEL}>Metadata</div>
            <div style={DETAIL_VALUE}>
              {Object.entries(detail.metadata).map(([k, v]) => (
                <div key={k}>{k}: <span style={{ color: 'var(--text-primary)' }}>{JSON.stringify(v)}</span></div>
              ))}
            </div>
          </>
        )}
      </div>
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
  isDerived?: boolean;
  editContext?: string | null;
  debugMode?: boolean;
  rawEvents?: readonly TimelineEvent[];
  allProcessedEvents?: readonly TimelineEvent[];
  loadoutStats?: Record<string, LoadoutStats>;
  damageRows?: DamageTableRow[];
  spConsumptionHistory?: { eventId: string; frame: number; naturalConsumed: number; returnedConsumed: number }[];
  onSaveAsCustomSkill?: (event: TimelineEvent) => void;
  verbose?: 0 | 1 | 2;
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
  loadoutStats,
  damageRows,
  spConsumptionHistory,
  onSaveAsCustomSkill,
  verbose = 1,
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

  // Resolve DSL semantic data for this event's skill
  const dslData = useMemo(() => {
    const slot = slots.find((s) => s.slotId === event.ownerId);
    return resolveEventDsl(slot?.operator?.id, event.name);
  }, [event.ownerId, event.name, slots]);

  // Full detail for verbose mode
  const fullDetail = useMemo(() => {
    if (verbose < 2) return null;
    const slot = slots.find((s) => s.slotId === event.ownerId);
    return resolveEventFullDetail(slot?.operator?.id, event.name);
  }, [event.ownerId, event.name, slots, verbose]);

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
        ...(event.columnId === SKILL_COLUMNS.ULTIMATE ? { animationDuration: toFrames(animSec) } : {}),
      });
    } else {
      onUpdate(event.id, {
        startFrame: computedStartFrame,
        activationDuration: toFrames(activeSec),
        activeDuration: toFrames(activePhaseSec),
        cooldownDuration: toFrames(cooldownSec),
        ...(event.columnId === SKILL_COLUMNS.ULTIMATE ? { animationDuration: toFrames(animSec) } : {}),
      });
    }
  };

  const handleFocus = () => { focusedRef.current = true; };
  const handleBlur = () => { focusedRef.current = false; commit(); };
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
  };

  const totalDurationFrames = isSequenced
    ? computeSegmentsSpan(event.segments!)
    : event.activationDuration + event.activeDuration + event.cooldownDuration;

  const processedTotalDurationFrames = processedEvent
    ? (processedEvent.segments && processedEvent.segments.length > 0
        ? computeSegmentsSpan(processedEvent.segments)
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

        {/* ── Triggers & Effects (all events) ─────────────────────────── */}
        {dslData && (
          dslData.predicates.length > 0 ||
          Object.keys(dslData.segmentEffects).length > 0 ||
          Object.keys(dslData.frameEffects).length > 0 ||
          Object.keys(dslData.segmentPredicates).length > 0
        ) && (
          <div className="edit-panel-section">
            <span className="edit-section-label">Triggers & Effects</span>
            <div style={{ padding: '4px 6px' }}>
              {dslData.segmentEffects[-1] && (
                <DslEffectTags effects={dslData.segmentEffects[-1]} />
              )}
              {dslData.predicates.length > 0 && (
                <PredicateDisplay predicates={dslData.predicates} />
              )}
              {Object.entries(dslData.segmentPredicates).map(([si, preds]) => (
                <PredicateDisplay key={`sp-${si}`} predicates={preds} label={`Segment ${Number(si) + 1}`} />
              ))}
              {Object.entries(dslData.segmentEffects).filter(([k]) => k !== '-1').map(([si, effs]) => (
                <div key={`se-${si}`}>
                  <div style={{ color: 'var(--text-muted)', fontSize: 10, fontWeight: 600, marginTop: 4 }}>Segment {Number(si) + 1}</div>
                  <DslEffectTags effects={effs} />
                </div>
              ))}
              {Object.entries(dslData.frameEffects).map(([key, effs]) => {
                const [si, fi] = key.split('-');
                return (
                  <div key={`fe-${key}`}>
                    <div style={{ color: 'var(--text-muted)', fontSize: 10, fontWeight: 600, marginTop: 4 }}>Frame {Number(fi) + 1}{Number(si) > 0 ? ` (Seg ${Number(si) + 1})` : ''}</div>
                    <DslEffectTags effects={effs} />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {fullDetail && <EventFullDetailPanel detail={fullDetail} event={event} />}

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
          const element = STATUS_ELEMENT[event.columnId.toUpperCase()] as ElementType | undefined;
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
                value={event.statusLevel ?? 1}
                min={1}
                max={4}
                step={1}
                onChange={(v) => onUpdate(event.id, { statusLevel: v })}
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
                      value={(event.statusValue * 100).toFixed(1)}
                      onChange={(e) => {
                        const pct = parseFloat(e.target.value);
                        if (!isNaN(pct)) onUpdate(event.id, { statusValue: pct / 100 });
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
                    onChange={(e) => onUpdate(event.id, { isForced: e.target.checked, forcedReaction: e.target.checked })}
                    style={{ accentColor: elColor }}
                  />
                  <span style={{ fontSize: 11, color: event.isForced ? '#ff5522' : 'var(--text-muted)' }}>
                    {event.isForced ? 'Yes — no infliction stacks required' : 'No'}
                  </span>
                </label>
              </div>
              {isAutoReaction && event.inflictionStacks != null && (
                <div className="edit-field">
                  <span className="edit-field-label">Infliction Stacks</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{event.inflictionStacks}</span>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Status Properties (non-reaction status events: buffs, debuffs) ─── */}
        {isDerived && !(event.ownerId === ENEMY_OWNER_ID && REACTION_COLUMN_IDS.has(event.columnId)) && (
          event.statusLevel != null || event.statusValue != null
        ) && (
          <div className="edit-panel-section">
            <span className="edit-section-label">Status Properties</span>
            {event.statusLevel != null && (
              <StatField
                label="Status Level"
                value={event.statusLevel}
                min={1}
                max={4}
                step={1}
                onChange={(v) => onUpdate(event.id, { statusLevel: v })}
              />
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
                    value={(event.statusValue * 100).toFixed(1)}
                    onChange={(e) => {
                      const pct = parseFloat(e.target.value);
                      if (!isNaN(pct)) onUpdate(event.id, { statusValue: pct / 100 });
                    }}
                  />
                  <span className="edit-input-unit">%</span>
                </div>
              </div>
            )}
          </div>
        )}

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
            if (event.columnId === SKILL_COLUMNS.BASIC) skillLevel = stats.basicAttackLevel;
            else if (event.columnId === SKILL_COLUMNS.BATTLE) skillLevel = stats.battleSkillLevel;
            else if (event.columnId === SKILL_COLUMNS.COMBO) skillLevel = stats.comboSkillLevel;
            else if (event.columnId === SKILL_COLUMNS.ULTIMATE) skillLevel = stats.ultimateLevel;
          }

          // Per-segment multipliers for sequenced events (basic attacks)
          const segMultipliers: { label: string; value: number; maxFrames: number }[] = [];
          let overallMultiplier: number | null = null;
          let overallMaxFrames = 0;
          // Per-tick ramping multipliers (e.g. Smouldering Fire explosion)
          let perTickBase: number | null = null;
          let perTickIncrement = 0;
          let perTickFrames = 0;

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
                    label: seg.name ?? (isNumeric ? `Seq ${seg.label}` : seg.label),
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
              // Check if this skill has per-tick ramping multipliers
              const tick0 = getPerTickMultiplier(
                operatorId,
                event.name as CombatSkillsType,
                skillLevel as any,
                (stats?.potential ?? 0) as any,
                0,
              );
              if (tick0 != null && overallMaxFrames > 1) {
                const tick1 = getPerTickMultiplier(
                  operatorId,
                  event.name as CombatSkillsType,
                  skillLevel as any,
                  (stats?.potential ?? 0) as any,
                  1,
                );
                perTickBase = tick0;
                perTickIncrement = tick1 != null ? tick1 - tick0 : 0;
                perTickFrames = overallMaxFrames;
              }
            }
          }

          // Skill description from operator model
          const op = slot?.operator;
          const skillDef = op?.skills[event.columnId as 'basic' | 'battle' | 'combo' | 'ultimate'];
          const skillDescription = skillDef?.description;

          const elColor = skillEl ? ELEMENT_COLORS[skillEl.toUpperCase() as ElementType] : undefined;
          const hasMultiplier = overallMultiplier != null || segMultipliers.length > 0 || perTickBase != null;
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
                {overallMultiplier != null && perTickBase == null && (
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Multiplier: </span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--gold)' }}>
                      {(overallMultiplier * 100).toFixed(1)}%
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
                {perTickBase != null && (
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Multiplier: </span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--gold)' }}>
                      {(perTickBase * 100).toFixed(1)}%
                      {perTickIncrement > 0 && ` + ${(perTickIncrement * 100).toFixed(1)}%/tick`}
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 10, marginLeft: 4 }}>
                      ({perTickFrames} ticks: {(perTickBase * 100).toFixed(1)}%–{((perTickBase + perTickIncrement * (perTickFrames - 1)) * 100).toFixed(1)}%)
                    </span>
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
                        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--gold)' }}>
                          {(sm.value * 100).toFixed(1)}%
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
                    <span style={{ color }}>{label}</span>: {(value * 100).toFixed(1)}%
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {(() => {
          if (!allProcessedEvents || event.ownerId === ENEMY_OWNER_ID) return null;
          const totalDuration = event.segments
            ? computeSegmentsSpan(event.segments)
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
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--green)' }}>{mod.formattedValue}</span>
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
          const consumptionRecord = spConsumptionHistory?.find((r) => r.eventId === event.id);
          const spData = resolveSpReturn(event, slots, consumptionRecord);
          if (!spData) return null;
          const { summary: sp, spNotes } = spData;
          const r = (v: number) => v.toFixed(1);
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

        {isSequenced && event.columnId === SKILL_COLUMNS.ULTIMATE ? (
          /* ── Sequenced ultimate: Animation/Statis layout + frame data ── */
          (readOnly || isDerived) ? (
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
                          <span className="edit-field-label">Frame {fi + 1}</span>
                          <div className="edit-info-text">
                            <div>Offset: {framesToSeconds(f.offsetFrame)}s ({f.offsetFrame}f)</div>
                            {(f.stagger ?? 0) > 0 && <div>Stagger: {f.stagger}</div>}
                            {(f.skillPointRecovery ?? 0) > 0 && <div>SP Recovery: {f.skillPointRecovery!.toFixed(1)}</div>}
                            {(f.gaugeGain ?? 0) > 0 && <div>Ult Gauge: +{f.gaugeGain!.toFixed(1)}</div>}
                            {(f.teamGaugeGain ?? 0) > 0 && <div>Team Gauge: +{f.teamGaugeGain!.toFixed(1)}</div>}
                            {f.statusLabel && <div style={{ whiteSpace: 'pre-line' }}>{f.statusLabel}</div>}
                            <FrameDslEffects f={f} />
                            {dslData?.frameEffects[`${si}-${fi}`] && (
                              <DslEffectTags effects={dslData.frameEffects[`${si}-${fi}`]} />
                            )}
                            {hitDmgRow && (hitDmgRow.multiplier != null || hitDmgRow.damage != null) && (
                              <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                                {hitDmgRow.multiplier != null && (
                                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--gold)', fontSize: 11 }}>
                                    {(hitDmgRow.multiplier * 100).toFixed(1)}%
                                  </span>
                                )}
                                {hitDmgRow.damage != null && (
                                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--green)', fontSize: 11 }}>
                                    {hitDmgRow.damage.toFixed(1)}
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
                          <span className="edit-field-label">Frame {fi + 1}</span>
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
                            {(f.skillPointRecovery ?? 0) > 0 && <div>SP Recovery: {f.skillPointRecovery!.toFixed(1)}</div>}
                            {(f.gaugeGain ?? 0) > 0 && <div>Ult Gauge: +{f.gaugeGain!.toFixed(1)}</div>}
                            {(f.teamGaugeGain ?? 0) > 0 && <div>Team Gauge: +{f.teamGaugeGain!.toFixed(1)}</div>}
                            {f.statusLabel && <div style={{ whiteSpace: 'pre-line' }}>{f.statusLabel}</div>}
                            <FrameDslEffects f={f} />
                            {dslData?.frameEffects[`${si}-${fi}`] && (
                              <DslEffectTags effects={dslData.frameEffects[`${si}-${fi}`]} />
                            )}
                            {hitDmgRow && (hitDmgRow.multiplier != null || hitDmgRow.damage != null) && (
                              <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                                {hitDmgRow.multiplier != null && (
                                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--gold)', fontSize: 11 }}>
                                    {(hitDmgRow.multiplier * 100).toFixed(1)}%
                                  </span>
                                )}
                                {hitDmgRow.damage != null && (
                                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--green)', fontSize: 11 }}>
                                    {hitDmgRow.damage.toFixed(1)}
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
              const segLabel = seg.name
                ? seg.name
                : seg.label
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
                    {(readOnly || isDerived) ? (
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
                        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--gold)' }}>
                          {(segTotalMultiplier * 100).toFixed(1)}%
                        </span>
                        {segMaxFrames > 1 && segPerFrameMultiplier != null && (
                          <span style={{ color: 'var(--text-muted)', fontSize: 10, marginLeft: 4 }}>
                            ({(segPerFrameMultiplier * 100).toFixed(1)}% x{segMaxFrames})
                          </span>
                        )}
                        {segTotalDamage > 0 && (
                          <span style={{ color: 'var(--green)', fontSize: 10, marginLeft: 6 }}>
                            {segTotalDamage.toFixed(1)} dmg
                          </span>
                        )}
                      </div>
                    )}
                    {(seg.segmentType || seg.timeDependency) && (
                      <div className="edit-info-text" style={{ marginTop: 2 }}>
                        {seg.segmentType && seg.segmentType !== SegmentType.NORMAL && (
                          <div><span style={{ color: 'var(--text-muted)' }}>Type: </span>{seg.segmentType}</div>
                        )}
                        {seg.timeDependency && (
                          <div><span style={{ color: 'var(--text-muted)' }}>Time: </span>{seg.timeDependency}</div>
                        )}
                      </div>
                    )}
                    {dslData?.segmentEffects[si] && (
                      <DslEffectTags effects={dslData.segmentEffects[si]} />
                    )}
                    {dslData?.segmentPredicates[si] && (
                      <PredicateDisplay predicates={dslData.segmentPredicates[si]} />
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
                              background: isSelected ? 'var(--overlay-08)' : 'transparent',
                            }}
                          >
                            <span className="edit-field-label">Frame {fi + 1}</span>
                            {(readOnly || isDerived) ? (
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
                              {event.columnId === SKILL_COLUMNS.BASIC && (
                                (readOnly || isDerived) ? (
                                  <div>Type: {(f.frameTypes ?? [EventFrameType.NORMAL]).includes(EventFrameType.FINAL_STRIKE) ? 'Final Strike' : (f.frameTypes ?? []).includes(EventFrameType.FINISHER) ? 'Finisher' : (f.frameTypes ?? []).includes(EventFrameType.DIVE) ? 'Dive' : 'Normal'}</div>
                                ) : (
                                  <>
                                    <div>Type:</div>
                                    <div className="edit-field-row">
                                      <select
                                        className="edit-input"
                                        value={(f.frameTypes ?? [EventFrameType.NORMAL])[0]}
                                        onChange={(e) => {
                                          const newEventFrameType = e.target.value as EventFrameType;
                                          const newSegments = event.segments!.map((s, ssi) => {
                                            if (ssi !== si || !s.frames) return s;
                                            return { ...s, frames: s.frames.map((fr, ffi) =>
                                              ffi === fi ? { ...fr, frameTypes: [newEventFrameType] } : fr,
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
                              {(f.frameTypes ?? []).includes(EventFrameType.FINAL_STRIKE) && (
                                (readOnly || isDerived) ? (
                                  <>
                                    {(f.skillPointRecovery ?? 0) > 0 && <div>SP Recovery: {f.skillPointRecovery!.toFixed(1)}</div>}
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
                              {!(f.frameTypes ?? []).includes(EventFrameType.FINAL_STRIKE) && (f.stagger ?? 0) > 0 && (
                                readOnly || isDerived || event.columnId === SKILL_COLUMNS.BASIC ? (
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
                              {(f.gaugeGain ?? 0) > 0 && <div>Ult Gauge: +{f.gaugeGain!.toFixed(1)}</div>}
                              {(f.teamGaugeGain ?? 0) > 0 && <div>Team Gauge: +{f.teamGaugeGain!.toFixed(1)}</div>}
                              <FrameDslEffects f={f} />
                              {dslData?.frameEffects[`${si}-${fi}`] && (
                                <DslEffectTags effects={dslData.frameEffects[`${si}-${fi}`]} />
                              )}
                              {hitDmgRow && (hitDmgRow.multiplier != null || hitDmgRow.damage != null) && (
                                <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                                  {hitDmgRow.multiplier != null && (
                                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--gold)', fontSize: 11 }}>
                                      {(hitDmgRow.multiplier * 100).toFixed(1)}%
                                    </span>
                                  )}
                                  {hitDmgRow.damage != null && (
                                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--green)', fontSize: 11 }}>
                                      {hitDmgRow.damage.toFixed(1)}
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

            {!(readOnly || isDerived) && (
              <div className="edit-panel-section">
                <span className="edit-section-label">Cooldown</span>
                <div style={{ padding: '4px 6px' }}>
                  <DurationField label="Duration" value={cooldownSec} onChange={setCooldownSec} onCommit={handleBlur} />
                </div>
              </div>
            )}

            {dslData && (dslData.predicates.length > 0 || Object.keys(dslData.segmentEffects).some(k => k === '-1')) && (
              <div className="edit-panel-section">
                <span className="edit-section-label">Semantics</span>
                <div style={{ padding: '4px 6px' }}>
                  {dslData.segmentEffects[-1] && (
                    <DslEffectTags effects={dslData.segmentEffects[-1]} />
                  )}
                  {dslData.predicates.length > 0 && (
                    <PredicateDisplay predicates={dslData.predicates} label="Predicates" />
                  )}
                </div>
              </div>
            )}

            <div className="edit-panel-section">
              <span className="edit-section-label">Summary</span>
              <div className="edit-info-text" style={{ paddingLeft: 6 }}>
                <div>Segments: {event.segments!.length}</div>
                {dualDuration(event.startFrame, totalDurationFrames, 'Time', hasTimeStopDiff ? processedTotalDurationFrames : undefined)}
                {event.columnId === SKILL_COLUMNS.ULTIMATE && event.activeDuration > 0 && dualDuration(event.startFrame + event.activationDuration, event.activeDuration, 'Active phase', pActive)}
                {event.cooldownDuration > 0 && dualDuration(event.startFrame + event.activationDuration + event.activeDuration, event.cooldownDuration, 'Cooldown', pCooldown)}
              </div>
            </div>
          </>
        ) : (readOnly || isDerived) ? (
          <div className="edit-panel-section">
            <span className="edit-section-label">Duration</span>
            <div className="edit-info-text">
              {event.columnId === SKILL_COLUMNS.ULTIMATE && event.animationDuration != null && event.animationDuration > 0 &&
                dualDuration(event.startFrame, event.animationDuration, 'Animation', pAnimation)
              }
              {event.columnId === SKILL_COLUMNS.ULTIMATE ? (
                dualDuration(
                  event.startFrame + (event.animationDuration ?? 0),
                  event.activationDuration - (event.animationDuration ?? 0),
                  'Statis',
                  pActivation != null && pAnimation != null ? pActivation - (pAnimation ?? 0) : undefined,
                )
              ) : (
                dualDuration(event.startFrame, event.activationDuration, 'Time', pActivation)
              )}
              {event.columnId === SKILL_COLUMNS.ULTIMATE && event.activeDuration > 0 && dualDuration(event.startFrame + event.activationDuration, event.activeDuration, 'Active', pActive)}
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
            {event.columnId === SKILL_COLUMNS.ULTIMATE && (
              <div className="edit-panel-section">
                <span className="edit-section-label">Animation</span>
                <DurationField label="Duration" value={animSec} onChange={setAnimSec} onCommit={handleBlur} />
              </div>
            )}

            <div className="edit-panel-section">
              <span className="edit-section-label">{event.columnId === SKILL_COLUMNS.ULTIMATE ? 'Statis' : 'Active Phase'}</span>
              <DurationField label="Duration" value={activeSec} onChange={setActiveSec} onCommit={handleBlur} />
            </div>

            {event.columnId === SKILL_COLUMNS.ULTIMATE && (
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

      {!(readOnly || isDerived) && !editContext?.startsWith('combo-trigger') && (
        <div className="edit-panel-footer">
          {onSaveAsCustomSkill && SKILL_COLUMN_SET.has(event.columnId) && (
            <button className="btn-save-custom" onClick={() => onSaveAsCustomSkill(event)}>
              SAVE AS CUSTOM
            </button>
          )}
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
        <div style={{ color: 'var(--gold)', fontSize: 9, fontWeight: 600, marginBottom: 4 }}>(time-stop diff)</div>
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
          <div style={{ color: 'var(--red)', marginTop: 2 }}>
            {processedEvent.warnings.map((w, i) => <div key={i}>WARNING: {w}</div>)}
          </div>
        )}
      </div>

      {/* Time-stop region */}
      {event.animationDuration != null && event.animationDuration > 0 && (
        event.columnId === SKILL_COLUMNS.ULTIMATE || event.columnId === SKILL_COLUMNS.COMBO ||
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
                                const rawAbs = event.startFrame + (rawSegs.slice(0, si).reduce((s, seg) => s + seg.durationFrames, 0)) + rFrame.offsetFrame;
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
                {ev.eventStatus && <span style={{ color: 'var(--gold)' }}> ({ev.eventStatus})</span>}
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
        <span style={{ color: 'var(--gold)' }}>
          {' '}(raw: {fmt(raw!)}, +{fmt(derived! - raw!)})
        </span>
      )}
    </div>
  );
}

export default EventPane;
