import { CombatSkillsType, ElementType, ELEMENT_COLORS, ELEMENT_LABELS, StatusType } from '../../consts/enums';
import { TimelineEvent, Operator, Enemy, SkillType, getAnimationDuration, eventDuration, eventEndFrame } from '../../consts/viewTypes';
import {
  REACTION_LABELS, COMBAT_SKILL_LABELS, STATUS_LABELS,
  INFLICTION_EVENT_LABELS, PHYSICAL_INFLICTION_LABELS, PHYSICAL_STATUS_LABELS,
} from '../../consts/timelineColumnLabels';
import { interactionToLabel } from '../../consts/semantics';
import type { Interaction, Effect, Predicate } from '../../consts/semantics';
import { translateEffect } from '../../utils/semanticsTranslation';
import type { TranslatedEffect } from '../../utils/semanticsTranslation';
import { COMBO_WINDOW_COLUMN_ID } from '../timeline/processInteractions';
import { ENEMY_OWNER_ID, OPERATOR_COLUMNS, REACTION_COLUMNS, PHYSICAL_STATUS_COLUMNS, PHYSICAL_STATUS_COLUMN_IDS, FRAGILITY_COLUMN_PREFIX, SKILL_COLUMNS, INFLICTION_COLUMN_IDS, PHYSICAL_INFLICTION_COLUMN_IDS } from '../../model/channels';
import { computeSpReturnSummary, SpReturnSummary } from '../calculation/frameCalculator';
import { ELECTRIFICATION_ARTS_FRAGILITY, BREACH_PHYSICAL_FRAGILITY, DEFAULT_AMP_BONUS } from '../timeline/eventsQueryService';
import { getOperatorJson, getComboTriggerInfo } from '../../model/event-frames/operatorJsonLoader';
import { getLastController } from '../timeline/processInteractions';

// ── JSON Skill Data Shapes ──────────────────────────────────────────────────

/** Effect with optional potential gates and display name from JSON skill data. */
interface JsonEffect extends Effect {
  potentialMin?: number;
  potentialMax?: number;
  eventName?: string;
}

/** A single frame entry from skill JSON data. */
interface JsonFrame {
  clause?: Predicate[];
  properties?: Record<string, { value: number | string; unit?: string }>;
  metadata?: Record<string, unknown>;
}

/** A single segment entry from skill JSON data. */
interface JsonSegment {
  clause?: Predicate[];
  effects?: Effect[];
  frames?: JsonFrame[];
  properties?: Record<string, { value: number | string; unit?: string }>;
  metadata?: Record<string, unknown>;
}

/** A status event entry from skill JSON data. */
export interface StatusEventDetail {
  id?: string;
  target?: string;
  element?: string;
  statusLevel?: { limit?: number | Record<string, unknown> };
  clause?: Predicate[];
  [key: string]: unknown;
}

/** A skill entry from operator skill JSON data. */
interface JsonSkill {
  originId?: string;
  name?: string;
  description?: string;
  properties?: Record<string, { value: number | string; unit?: string }> & {
    trigger?: {
      description?: string;
      onTriggerClause?: Predicate[];
    };
  };
  clause?: Predicate[];
  segments?: JsonSegment[];
  frames?: JsonFrame[];
  statusEvents?: StatusEventDetail[];
  metadata?: Record<string, unknown>;
}

// ── Event Identity ──────────────────────────────────────────────────────────

export interface EventIdentity {
  ownerName: string;
  skillName: string;
  ownerColor: string;
  columnLabel: string;
  triggerCondition: string | null;
  comboTriggerLabels: string[];
  comboRequiresLabels: string[];
  sourceName: string;
  sourceColor: string;
  sourceSkillLabel: string;
}

export function resolveEventIdentity(
  event: TimelineEvent,
  slots: { slotId: string; operator: Operator | null }[],
  enemy: Enemy,
): EventIdentity {
  let ownerName = '';
  let skillName = '';
  let ownerColor = '#4488ff';
  let triggerCondition: string | null = null;
  let comboTriggerLabels: string[] = [];
  let comboRequiresLabels: string[] = [];
  let columnLabel = '';

  if (event.ownerId === ENEMY_OWNER_ID) {
    ownerName = enemy.name;
    const status = enemy.statuses.find((s) => s.id === event.columnId);
    const reaction = REACTION_LABELS[event.columnId];
    const physInfliction = PHYSICAL_INFLICTION_LABELS[event.columnId];
    const physStatus = PHYSICAL_STATUS_LABELS[event.columnId];
    if (status) {
      skillName = status.label;
      ownerColor = status.color;
      columnLabel = 'INFLICTION';
    } else if (reaction) {
      skillName = reaction.label;
      ownerColor = reaction.color;
      columnLabel = 'ARTS REACTION';
    } else if (physInfliction) {
      skillName = physInfliction.label;
      ownerColor = physInfliction.color;
      columnLabel = 'PHYSICAL INFLICTION';
    } else if (physStatus) {
      skillName = physStatus.label;
      ownerColor = physStatus.color;
      columnLabel = 'PHYSICAL STATUS';
    } else {
      skillName = STATUS_LABELS[event.columnId as StatusType] ?? event.columnId;
      ownerColor = '#cc3333';
      columnLabel = 'STATUS';
    }
  } else {
    const slot = slots.find((s) => s.slotId === event.ownerId);
    const op = slot?.operator;
    if (op) {
      ownerName = op.name;
      ownerColor = op.color;
      if (event.columnId === OPERATOR_COLUMNS.DASH) {
        skillName = 'Dash';
        columnLabel = 'DASH';
      } else if (event.columnId === OPERATOR_COLUMNS.MELTING_FLAME) {
        skillName = STATUS_LABELS[StatusType.MELTING_FLAME];
        ownerColor = '#f07030';
        columnLabel = 'STATUS';
      } else if (event.columnId === COMBO_WINDOW_COLUMN_ID) {
        skillName = 'Combo Activation Window';
        columnLabel = 'ACTIVATION WINDOW';
      } else {
        const skillType = event.columnId as SkillType;
        const skill = op.skills[skillType];
        if (skill) {
          skillName = skill.name;
          triggerCondition = skill.triggerCondition;
          columnLabel = event.columnId.charAt(0).toUpperCase() + event.columnId.slice(1) + ' skill';
        }
        if (event.columnId === SKILL_COLUMNS.COMBO) {
          const info = getComboTriggerInfo(op.id);
          if (info) {
            for (const pred of info.onTriggerClause) {
              for (const cond of pred.conditions) {
                if (cond.negated) continue;
                if (cond.verb === 'HAVE' && cond.object === 'STATUS' && cond.objectId) {
                  comboRequiresLabels.push(STATUS_LABELS[cond.objectId as StatusType] ?? cond.objectId);
                } else {
                  comboTriggerLabels.push(interactionToLabel(cond as unknown as Interaction));
                }
              }
            }
          }
        }
      }
    }
  }

  // Resolve source operator for derived events
  let sourceName = '';
  let sourceColor = '';
  let sourceSkillLabel = '';
  if (event.sourceOwnerId) {
    const sourceSlot = slots.find((s) => s.slotId === event.sourceOwnerId);
    if (sourceSlot?.operator) {
      sourceName = sourceSlot.operator.name;
      sourceColor = sourceSlot.operator.color;
    }
    if (event.sourceSkillName) {
      sourceSkillLabel = COMBAT_SKILL_LABELS[event.sourceSkillName as CombatSkillsType]
        ?? STATUS_LABELS[event.sourceSkillName as StatusType]
        ?? event.sourceSkillName;
    }
  }

  // Override skill name with combat label if available
  const combatLabel = COMBAT_SKILL_LABELS[event.name as CombatSkillsType];
  if (combatLabel) {
    skillName = combatLabel;
  } else if (INFLICTION_EVENT_LABELS[event.name]) {
    skillName = INFLICTION_EVENT_LABELS[event.name];
  } else if (STATUS_LABELS[event.name as StatusType]) {
    skillName = STATUS_LABELS[event.name as StatusType];
  } else if (event.name && event.name !== event.columnId) {
    skillName = event.name;
  }

  return {
    ownerName,
    skillName,
    ownerColor,
    columnLabel,
    triggerCondition,
    comboTriggerLabels,
    comboRequiresLabels,
    sourceName,
    sourceColor,
    sourceSkillLabel,
  };
}

// ── Combo Chain ─────────────────────────────────────────────────────────────

export interface ComboChainLink {
  label: string;
  color: string;
  sublabel?: string;
}

/** Map infliction/physical column IDs to element colors. */
const INFLICTION_COLUMN_COLORS: Record<string, string> = {
  heatInfliction:       ELEMENT_COLORS[ElementType.HEAT],
  cryoInfliction:       ELEMENT_COLORS[ElementType.CRYO],
  natureInfliction:     ELEMENT_COLORS[ElementType.NATURE],
  electricInfliction:   ELEMENT_COLORS[ElementType.ELECTRIC],
  vulnerableInfliction: '#c0c8d0',
  breach:               '#c0c8d0',
};

/**
 * For a combo skill event, trace the full trigger chain back to the original
 * operator action. Returns a list of chain links from source to combo, or
 * null if no chain can be resolved.
 */
export function resolveComboChain(
  event: TimelineEvent,
  allProcessedEvents: readonly TimelineEvent[],
  slots: { slotId: string; operator: Operator | null }[],
): ComboChainLink[] | null {
  if (event.columnId !== SKILL_COLUMNS.COMBO) return null;

  // Find the combo activation window that contains this combo event
  const window = allProcessedEvents.find((e) =>
    e.columnId === COMBO_WINDOW_COLUMN_ID &&
    e.ownerId === event.ownerId &&
    event.startFrame >= e.startFrame &&
    event.startFrame < eventEndFrame(e),
  );
  if (!window?.sourceOwnerId) return null;

  const chain: ComboChainLink[] = [];
  const triggerCol = event.comboTriggerColumnId ?? window.comboTriggerColumnId;
  const sourceSlot = slots.find((s) => s.slotId === window.sourceOwnerId);
  const sourceOp = sourceSlot?.operator;
  if (!sourceOp) return null;

  // Is the trigger an enemy column (infliction/status)? If so, trace back to
  // the specific enemy event to find the original operator skill.
  const isEnemyTrigger = triggerCol && (
    INFLICTION_COLUMN_IDS.has(triggerCol) ||
    PHYSICAL_INFLICTION_COLUMN_IDS.has(triggerCol) ||
    PHYSICAL_STATUS_COLUMN_IDS.has(triggerCol)
  );

  if (isEnemyTrigger) {
    // Find the enemy infliction/status event closest before the combo that
    // came from the same source operator — it has the original skill name.
    let bestMatch: TimelineEvent | undefined;
    for (const e of allProcessedEvents) {
      if (e.ownerId !== ENEMY_OWNER_ID) continue;
      if (e.columnId !== triggerCol) continue;
      if (e.sourceOwnerId !== window.sourceOwnerId) continue;
      if (e.startFrame > event.startFrame) continue;
      if (!bestMatch || e.startFrame > bestMatch.startFrame) bestMatch = e;
    }

    const originalSkillLabel = bestMatch?.sourceSkillName
      ? (COMBAT_SKILL_LABELS[bestMatch.sourceSkillName as CombatSkillsType]
        ?? STATUS_LABELS[bestMatch.sourceSkillName as StatusType]
        ?? bestMatch.sourceSkillName)
      : undefined;

    // Link 1: Source operator + original skill
    chain.push({
      label: sourceOp.name,
      color: sourceOp.color,
      sublabel: originalSkillLabel,
    });

    // Link 2: Intermediary infliction/status on enemy
    const inflLabel = INFLICTION_EVENT_LABELS[triggerCol]
      ?? PHYSICAL_INFLICTION_LABELS[triggerCol]?.label
      ?? PHYSICAL_STATUS_LABELS[triggerCol]?.label
      ?? triggerCol;
    chain.push({
      label: inflLabel,
      color: INFLICTION_COLUMN_COLORS[triggerCol] ?? 'var(--text-muted)',
      sublabel: 'on enemy',
    });
  } else {
    // Direct operator trigger (e.g. FINAL_STRIKE from basic attack)
    const skillLabel = window.sourceSkillName
      ? (COMBAT_SKILL_LABELS[window.sourceSkillName as CombatSkillsType]
        ?? STATUS_LABELS[window.sourceSkillName as StatusType]
        ?? window.sourceSkillName)
      : undefined;

    chain.push({
      label: sourceOp.name,
      color: sourceOp.color,
      sublabel: skillLabel,
    });
  }

  return chain.length > 0 ? chain : null;
}

// ── SP Return Display ───────────────────────────────────────────────────────

export interface SpReturnDisplay {
  summary: SpReturnSummary;
  spNotes: string[];
}

export function resolveSpReturn(
  event: TimelineEvent,
  slots: { slotId: string; operator: Operator | null }[],
  consumptionRecord?: { naturalConsumed: number; returnedConsumed: number },
): SpReturnDisplay | null {
  if (event.skillPointCost == null) return null;

  const summary = computeSpReturnSummary(event, consumptionRecord);
  const slot = slots.find((s) => s.slotId === event.ownerId);
  const spNotes = slot?.operator?.skills.battle.spReturnNotes ?? [];

  return { summary, spNotes };
}

// ── Active Damage Modifiers ─────────────────────────────────────────────────

export interface ActiveModifier {
  label: string;
  color: string;
  /** Formatted value string (e.g. "+15%", "x1.30") */
  formattedValue: string;
  source: string;
}

/** Column IDs for status effects that are damage modifiers on the enemy. */
const SUSCEPTIBILITY_COLUMNS = new Set<string>([StatusType.SUSCEPTIBILITY, StatusType.FOCUS]);
function isActiveAt(ev: TimelineEvent, frame: number): boolean {
  return ev.startFrame <= frame && frame < eventEndFrame(ev);
}

/**
 * Finds active enemy damage modifiers at the given frame range.
 * Returns modifiers like susceptibility, fragility, weaken, etc. that would
 * affect damage dealt by an operator event at this time.
 */
export function resolveActiveModifiers(
  eventStartFrame: number,
  eventEndFrame: number,
  allProcessedEvents: readonly TimelineEvent[],
): ActiveModifier[] {
  const modifiers: ActiveModifier[] = [];
  const midFrame = Math.floor((eventStartFrame + eventEndFrame) / 2);

  for (const ev of allProcessedEvents) {
    if (ev.ownerId !== ENEMY_OWNER_ID) continue;
    if (!isActiveAt(ev, midFrame)) continue;

    // Susceptibility / Focus
    if (SUSCEPTIBILITY_COLUMNS.has(ev.columnId) && ev.susceptibility) {
      for (const [element, value] of Object.entries(ev.susceptibility)) {
        const elType = element as ElementType;
        const color = ELEMENT_COLORS[elType] ?? '#aaa';
        const label = ELEMENT_LABELS[elType] ?? element;
        modifiers.push({
          label: `${STATUS_LABELS[ev.name as StatusType] ?? ev.name} (${label})`,
          color,
          formattedValue: `+${Math.round(value * 100)}%`,
          source: 'Susceptibility',
        });
      }
    }

    // Electrification fragility
    if (ev.columnId === REACTION_COLUMNS.ELECTRIFICATION) {
      const level = Math.min(ev.statusLevel ?? ev.inflictionStacks ?? 1, 4);
      const bonus = ELECTRIFICATION_ARTS_FRAGILITY[level] ?? 0;
      modifiers.push({
        label: `Electrification Lv.${level}`,
        color: ELEMENT_COLORS[ElementType.ELECTRIC],
        formattedValue: `+${Math.round(bonus * 100)}% Arts DMG Taken`,
        source: 'Fragility',
      });
    }

    // Breach fragility
    if (ev.columnId === PHYSICAL_STATUS_COLUMNS.BREACH) {
      const level = Math.min(ev.statusLevel ?? ev.inflictionStacks ?? 1, 4);
      const bonus = BREACH_PHYSICAL_FRAGILITY[level] ?? 0;
      modifiers.push({
        label: `Breach Lv.${level}`,
        color: ELEMENT_COLORS[ElementType.PHYSICAL],
        formattedValue: `+${Math.round(bonus * 100)}% Physical DMG Taken`,
        source: 'Fragility',
      });
    }

    // Corrosion
    if (ev.columnId === REACTION_COLUMNS.CORROSION) {
      modifiers.push({
        label: 'Corrosion',
        color: ELEMENT_COLORS[ElementType.NATURE],
        formattedValue: 'Resistance reduction',
        source: 'Resistance',
      });
    }

    // Weapon fragility
    if (ev.columnId.startsWith(FRAGILITY_COLUMN_PREFIX)) {
      modifiers.push({
        label: STATUS_LABELS[ev.name as StatusType] ?? ev.name,
        color: '#dd8844',
        formattedValue: ev.statusValue ? `+${Math.round(ev.statusValue * 100)}%` : 'Active',
        source: 'Fragility',
      });
    }
  }

  // Team-wide modifiers (weaken, amp, etc.)
  for (const ev of allProcessedEvents) {
    if (!isActiveAt(ev, midFrame)) continue;

    if (ev.columnId === StatusType.ARTS_AMP) {
      const bonus = ev.statusValue ?? DEFAULT_AMP_BONUS;
      modifiers.push({
        label: 'Arts Amp',
        color: '#aa66dd',
        formattedValue: `+${Math.round(bonus * 100)}%`,
        source: 'Amp',
      });
    }

    if (ev.columnId === StatusType.WEAKEN) {
      const val = ev.statusValue ?? 0;
      modifiers.push({
        label: 'Weaken',
        color: '#cc6666',
        formattedValue: val > 0 ? `-${Math.round(val * 100)}% DMG` : 'Active',
        source: 'Weaken',
      });
    }
  }

  return modifiers;
}

// ── DSL Semantics Resolution ──────────────────────────────────────────────

/** Human-readable text for an Interaction (condition). */
export function interactionToText(i: Interaction): string {
  const parts: string[] = [];
  parts.push(i.subject.replace(/_/g, ' '));
  if (i.subjectProperty) parts.push(`'s ${String(i.subjectProperty).replace(/_/g, ' ')}`);
  if (i.negated) parts.push('NOT');
  parts.push(i.verb.replace(/_/g, ' '));
  parts.push(i.object.replace(/_/g, ' '));
  if (i.objectId) parts.push(`(${i.objectId})`);
  if (i.cardinalityConstraint && i.cardinality != null) {
    parts.push(`${i.cardinalityConstraint.replace(/_/g, ' ')} ${i.cardinality}`);
  }
  if (i.element) parts.push(`[${i.element}]`);
  return parts.join(' ');
}

/** Human-readable text for an Effect. */
export function effectToText(e: Effect): string {
  const parts: string[] = [];
  parts.push(e.verb.replace(/_/g, ' '));
  if (e.cardinality != null) parts.push(String(e.cardinality));
  if (e.adjective) {
    const adjs = Array.isArray(e.adjective) ? e.adjective : [e.adjective];
    parts.push(adjs.map((a) => a.replace(/_/g, ' ')).join(' '));
  }
  if (e.object) parts.push(String(e.object).replace(/_/g, ' '));
  if (e.objectId) parts.push(`(${e.objectId})`);
  if (e.toObject) parts.push(`TO ${String(e.toObject).replace(/_/g, ' ')}`);
  if (e.fromObject) parts.push(`FROM ${String(e.fromObject).replace(/_/g, ' ')}`);
  if (e.onObject) parts.push(`ON ${String(e.onObject).replace(/_/g, ' ')}`);
  if (e.for) {
    parts.push(`FOR ${e.for.cardinalityConstraint.replace(/_/g, ' ')} ${e.for.cardinality}`);
  } else if (e.cardinalityConstraint) {
    parts.push(e.cardinalityConstraint.replace(/_/g, ' '));
  }
  if (e.with) {
    const wpParts: string[] = [];
    for (const [k, v] of Object.entries(e.with)) {
      const val = typeof v.value === 'number' ? v.value : `[${(v.value as number[]).slice(0, 3).join(', ')}${(v.value as number[]).length > 3 ? '...' : ''}]`;
      wpParts.push(`${k.replace(/_/g, ' ').toUpperCase()} ${val}`);
    }
    if (wpParts.length) parts.push(`WITH ${wpParts.join(', ')}`);
  }
  return parts.join(' ');
}

/** A resolved predicate with text-form conditions and effects. */
export interface ResolvedPredicate {
  conditions: string[];
  effects: string[];
}

/** DSL data resolved for an event's skill. */
export interface EventDslData {
  /** Skill-level predicates (clause). */
  predicates: ResolvedPredicate[];
  /** Trigger predicates from properties.trigger.onTriggerClause. */
  triggerPredicates: ResolvedPredicate[];
  /** Trigger description from properties.trigger.description. */
  triggerDescription: string | null;
  /** Segment-level predicates, keyed by segment index. */
  segmentPredicates: Record<number, ResolvedPredicate[]>;
  /** Segment-level effects (non-predicate), keyed by segment index. */
  segmentEffects: Record<number, string[]>;
  /** Frame-level effects (structured), keyed by `segmentIndex-frameIndex`. */
  frameEffects: Record<string, TranslatedEffect[]>;
}

/**
 * Effects that are already represented by dedicated info pane sections
 * (SP cost) or are zero-value noise. Filter these from DSL display.
 */
function isRedundantEffect(e: Effect): boolean {
  const { object: obj, verb } = e;
  // SP cost / ultimate energy cost shown in dedicated SP/Skill sections
  if (verb === 'CONSUME' && (obj === 'SKILL_POINT' || obj === 'ULTIMATE_ENERGY')) return true;
  // Zero-value recoveries are noise
  if (verb === 'RECOVER' && (obj === 'SKILL_POINT' || obj === 'STAGGER')) {
    const val = e.with?.cardinality?.value ?? e.with?.value?.value;
    if (val === 0) return true;
  }
  // Zero-value stagger applications are noise
  if (verb === 'DEAL' && obj === 'STAGGER') {
    const val = e.with?.value?.value;
    if (val === 0) return true;
  }
  return false;
}

/**
 * Resolve frame effects, filtering by operator potential when effects have
 * potentialMin/potentialMax gates. Uses eventName for display when available.
 * Returns structured TranslatedEffect objects for natural-language rendering.
 */
function resolveFrameEffects(
  effects: JsonEffect[],
  key: string,
  potential: number,
  outEffects: Record<string, TranslatedEffect[]>,
) {
  const resolved: TranslatedEffect[] = [];

  for (const e of effects) {
    // Filter redundant/zero-value effects
    if (isRedundantEffect(e)) continue;
    // Filter by potential gate
    if (e.potentialMin != null && potential < e.potentialMin) continue;
    if (e.potentialMax != null && potential > e.potentialMax) continue;

    // Use eventName for display when it differs from objectId
    const displayEffect: Effect = e.eventName && e.eventName !== e.objectId
      ? { ...e, objectId: e.eventName }
      : e;
    resolved.push(translateEffect(displayEffect));
  }

  if (resolved.length > 0) outEffects[key] = resolved;
}

/**
 * Resolve DSL predicates and effects from the operator JSON for an event's skill.
 * Returns null if no operator JSON or skill data is available.
 * @param potential Operator potential (P0–P5) used to resolve conditional effects.
 */
export function resolveEventDsl(
  operatorId: string | undefined,
  skillName: string,
  potential = 0,
): EventDslData | null {
  if (!operatorId) return null;
  const json = getOperatorJson(operatorId);
  if (!json?.skills) return null;

  // Look up skill data directly by skill ID
  const skills = json.skills as Record<string, JsonSkill>;
  const skillCat = skills[skillName] as JsonSkill | undefined;
  if (!skillCat) return null;

  const predicates: ResolvedPredicate[] = [];
  const triggerPredicates: ResolvedPredicate[] = [];
  let triggerDescription: string | null = null;
  const segmentPredicates: Record<number, ResolvedPredicate[]> = {};
  const segmentEffects: Record<number, string[]> = {};
  const frameEffects: Record<string, TranslatedEffect[]> = {};

  // Trigger clause from properties.trigger
  const trigger = skillCat.properties?.trigger;
  if (trigger) {
    triggerDescription = trigger.description ?? null;
    if (trigger.onTriggerClause && Array.isArray(trigger.onTriggerClause)) {
      for (const pred of trigger.onTriggerClause) {
        triggerPredicates.push({
          conditions: (pred.conditions ?? []).map((c: Interaction) => interactionToText(c)),
          effects: [],
        });
      }
    }
  }

  // Skill-level clause
  if (skillCat.clause && Array.isArray(skillCat.clause)) {
    for (const pred of skillCat.clause) {
      predicates.push({
        conditions: (pred.conditions ?? []).map((c: Interaction) => interactionToText(c)),
        effects: (pred.effects ?? []).map((e: Effect) => effectToText(e)),
      });
    }
  }

  // Segment-level data
  const segments: JsonSegment[] = skillCat.segments ?? [];
  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si];

    // Segment clause
    if (seg.clause && Array.isArray(seg.clause)) {
      segmentPredicates[si] = seg.clause.map((pred: Predicate) => ({
        conditions: (pred.conditions ?? []).map((c: Interaction) => interactionToText(c)),
        effects: (pred.effects ?? []).map((e: Effect) => effectToText(e)),
      }));
    }

    // Segment effects
    if (seg.effects && Array.isArray(seg.effects)) {
      segmentEffects[si] = seg.effects.map((e: Effect) => effectToText(e));
    }

    // Frame-level effects from clause predicates (filtered by operator potential)
    const frames: JsonFrame[] = seg.frames ?? [];
    for (let fi = 0; fi < frames.length; fi++) {
      const frame = frames[fi];
      const clauseEffects = (frame.clause ?? []).flatMap((p: Predicate) => p.effects ?? []);
      if (clauseEffects.length > 0) {
        resolveFrameEffects(clauseEffects as JsonEffect[], `${si}-${fi}`, potential, frameEffects);
      }
    }
  }

  // Flat shape (single segment, no segments array)
  if (segments.length === 0 && skillCat.frames) {
    const frames: JsonFrame[] = skillCat.frames;
    for (let fi = 0; fi < frames.length; fi++) {
      const frame = frames[fi];
      const clauseEffects = (frame.clause ?? []).flatMap((p: Predicate) => p.effects ?? []);
      if (clauseEffects.length > 0) {
        resolveFrameEffects(clauseEffects as JsonEffect[], `0-${fi}`, potential, frameEffects);
      }
    }
  }

  // Skill-level effects from clause predicates
  const skillClauseEffects = (skillCat.clause ?? []).flatMap((p: Predicate) => p.effects ?? []);
  if (skillClauseEffects.length > 0) {
    const filtered = skillClauseEffects
      .filter((e: Effect) => !isRedundantEffect(e))
      .map((e: Effect) => effectToText(e));
    if (filtered.length > 0) segmentEffects[-1] = filtered;
  }

  const hasData = predicates.length > 0 ||
    triggerPredicates.length > 0 ||
    Object.keys(segmentPredicates).length > 0 ||
    Object.keys(segmentEffects).length > 0 ||
    Object.keys(frameEffects).length > 0;

  return hasData ? { predicates, triggerPredicates, triggerDescription, segmentPredicates, segmentEffects, frameEffects } : null;
}

// ── Full Event Detail (verbose mode) ───────────────────────────────────────

/** Complete structured detail for the verbose event pane. */
export interface EventFullDetail {
  /** Skill ID (e.g. "FLAMING_CINDERS") */
  skillId: string;
  /** Origin operator ID from the skill JSON */
  originId: string | null;
  /** Skill name from JSON */
  name: string | null;
  /** Skill description from JSON */
  description: string | null;
  /** Skill-level properties (duration, etc.) */
  properties: Record<string, { value: number | string; unit?: string }> | null;
  /** Status event data if this skill has statusEvents */
  statusEvents: StatusEventDetail[] | null;
  /** Skill-level clause (raw predicates) */
  clause: Predicate[] | null;
  /** Segment details */
  segments: {
    index: number;
    properties: Record<string, { value: number | string; unit?: string }> | null;
    clause: Predicate[] | null;
    metadata: Record<string, unknown> | null;
    frames: {
      index: number;
      properties: Record<string, { value: number | string; unit?: string }> | null;
      clause: Predicate[] | null;
      metadata: Record<string, unknown> | null;
    }[];
  }[];
  /** Metadata from JSON (dataSources, etc.) */
  metadata: Record<string, unknown> | null;
  /** skillTypeMap entry for this skill (e.g. BASIC_ATTACK → FLAMING_CINDERS) */
  skillTypeMapping: string | null;
}

/**
 * Resolve the full raw detail from operator JSON for verbose display.
 * Returns null if no operator JSON or skill data is available.
 */
export function resolveEventFullDetail(
  operatorId: string | undefined,
  skillName: string,
): EventFullDetail | null {
  if (!operatorId) return null;
  const json = getOperatorJson(operatorId);
  if (!json?.skills) return null;

  const skills = json.skills as Record<string, JsonSkill> & { skillTypeMap?: Record<string, string> };
  const skillCat = skills[skillName] as JsonSkill | undefined;
  if (!skillCat) return null;

  // Find which skill type maps to this skill
  const skillTypeMap = skills.skillTypeMap;
  let skillTypeMapping: string | null = null;
  if (skillTypeMap) {
    for (const [type, id] of Object.entries(skillTypeMap)) {
      if (id === skillName) { skillTypeMapping = type; break; }
    }
  }

  const segments: EventFullDetail['segments'] = [];
  const rawSegments: JsonSegment[] = skillCat.segments ?? [];

  for (let si = 0; si < rawSegments.length; si++) {
    const seg = rawSegments[si];
    const frames: EventFullDetail['segments'][0]['frames'] = [];
    const rawFrames: JsonFrame[] = seg.frames ?? [];

    for (let fi = 0; fi < rawFrames.length; fi++) {
      const frame = rawFrames[fi];
      frames.push({
        index: fi,
        properties: frame.properties ?? null,
        clause: frame.clause ?? null,
        metadata: frame.metadata ?? null,
      });
    }

    segments.push({
      index: si,
      properties: seg.properties ?? null,
      clause: seg.clause ?? null,
      metadata: seg.metadata ?? null,
      frames,
    });
  }

  // Flat shape (single segment, frames at skill level)
  if (rawSegments.length === 0 && skillCat.frames) {
    const frames: EventFullDetail['segments'][0]['frames'] = [];
    for (let fi = 0; fi < skillCat.frames.length; fi++) {
      const frame = skillCat.frames[fi];
      frames.push({
        index: fi,
        properties: frame.properties ?? null,
        clause: frame.clause ?? null,
        metadata: frame.metadata ?? null,
      });
    }
    segments.push({
      index: 0,
      properties: skillCat.properties ?? null,
      clause: null,
      metadata: null,
      frames,
    });
  }

  return {
    skillId: skillName,
    originId: ((skillCat.metadata as Record<string, unknown>)?.originId as string) ?? null,
    name: ((skillCat.properties as Record<string, unknown>)?.name as string) ?? null,
    description: ((skillCat.properties as Record<string, unknown>)?.description as string) ?? null,
    properties: skillCat.properties ?? null,
    statusEvents: skillCat.statusEvents ?? null,
    clause: skillCat.clause ?? null,
    segments,
    metadata: skillCat.metadata ?? null,
    skillTypeMapping,
  };
}

// ── Event Timing (base vs time-stop) ──────────────────────────────────────

/** Per-phase duration pair: base (game-time) and with-time-stop (real-time). null means no difference. */
export interface PhaseDuration {
  base: number;
  withTimeStop: number | null;
}

/** Resolved timing durations for the info pane. */
export interface EventTimingData {
  activation: PhaseDuration;
  active: PhaseDuration;
  cooldown: PhaseDuration;
  animation: PhaseDuration | null;
  total: PhaseDuration;
}

/**
 * Resolve base and time-stop-extended durations for an event.
 * Combines DerivedEventController's raw durations (for derived events) with
 * processedEvent comparison (for user-placed events).
 */
export function resolveEventTiming(
  event: TimelineEvent,
  processedEvent?: TimelineEvent,
): EventTimingData {
  const controller = getLastController();

  // Base activation: check controller's raw duration first (derived events),
  // then fall back to the event's own segment duration (user-placed events).
  const rawActivation = controller?.getBaseDuration(event.id);
  const baseActivation = rawActivation ?? eventDuration(event);

  // Extended activation: for derived events the event itself has the extended value;
  // for user-placed events the processedEvent has it.
  const extActivation = rawActivation != null
    ? eventDuration(event)
    : processedEvent ? eventDuration(processedEvent) : eventDuration(event);

  const baseActive = 0;
  const extActive = 0;

  const baseCooldown = 0;
  const extCooldown = 0;

  const baseAnimation = getAnimationDuration(event) || null;
  const extAnimation = (processedEvent ? getAnimationDuration(processedEvent) : 0) || getAnimationDuration(event) || null;

  const baseTotal = baseActivation;
  const extTotal = extActivation;

  const mkPhase = (base: number, ext: number): PhaseDuration => ({
    base,
    withTimeStop: ext !== base ? ext : null,
  });

  return {
    activation: mkPhase(baseActivation, extActivation),
    active: mkPhase(baseActive, extActive),
    cooldown: mkPhase(baseCooldown, extCooldown),
    animation: baseAnimation != null ? mkPhase(baseAnimation, extAnimation ?? baseAnimation) : null,
    total: mkPhase(baseTotal, extTotal),
  };
}
