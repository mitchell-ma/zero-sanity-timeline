import { CombatSkillsType, ElementType, ELEMENT_COLORS, ELEMENT_LABELS, StatusType } from '../../consts/enums';
import { TimelineEvent, Operator, Enemy, SkillType } from '../../consts/viewTypes';
import {
  REACTION_LABELS, COMBAT_SKILL_LABELS, STATUS_LABELS,
  INFLICTION_EVENT_LABELS, PHYSICAL_INFLICTION_LABELS, PHYSICAL_STATUS_LABELS,
} from '../../consts/timelineColumnLabels';
import { interactionToLabel } from '../../consts/semantics';
import type { Interaction, Effect } from '../../consts/semantics';
import { translateEffect } from '../../utils/semanticsTranslation';
import type { TranslatedEffect } from '../../utils/semanticsTranslation';
import { COMBO_WINDOW_COLUMN_ID } from '../timeline/processInteractions';
import { ENEMY_OWNER_ID, OPERATOR_COLUMNS, REACTION_COLUMNS, PHYSICAL_STATUS_COLUMNS, FRAGILITY_COLUMN_PREFIX, SKILL_COLUMNS, INFLICTION_COLUMN_IDS, PHYSICAL_INFLICTION_COLUMN_IDS } from '../../model/channels';
import { computeSpReturnSummary, SpReturnSummary } from '../calculation/frameCalculator';
import { ELECTRIFICATION_ARTS_FRAGILITY, BREACH_PHYSICAL_FRAGILITY, DEFAULT_AMP_BONUS } from '../timeline/eventsQueryService';
import { getOperatorJson } from '../../model/event-frames/operatorJsonLoader';

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
        if (event.columnId === SKILL_COLUMNS.COMBO && op.triggerCapability) {
          comboTriggerLabels = op.triggerCapability.comboRequires.map(
            (i) => interactionToLabel(i),
          );
          if (op.triggerCapability.comboRequiresActiveColumns) {
            comboRequiresLabels = op.triggerCapability.comboRequiresActiveColumns.map(
              (col) => STATUS_LABELS[col as StatusType] ?? col,
            );
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
    event.startFrame < e.startFrame + e.activationDuration,
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
    triggerCol === 'breach'
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
  return ev.startFrame <= frame && frame < ev.startFrame + ev.activationDuration;
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
  parts.push(i.subjectType.replace(/_/g, ' '));
  if (i.subjectProperty) parts.push(`'s ${String(i.subjectProperty).replace(/_/g, ' ')}`);
  if (i.negated) parts.push('NOT');
  parts.push(i.verbType.replace(/_/g, ' '));
  parts.push(i.objectType.replace(/_/g, ' '));
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
  parts.push(e.verbType.replace(/_/g, ' '));
  if (e.cardinality != null) parts.push(String(e.cardinality));
  if (e.adjective) {
    const adjs = Array.isArray(e.adjective) ? e.adjective : [e.adjective];
    parts.push(adjs.map((a) => a.replace(/_/g, ' ')).join(' '));
  }
  if (e.objectType) parts.push(String(e.objectType).replace(/_/g, ' '));
  if (e.objectId) parts.push(`(${e.objectId})`);
  if (e.toObjectType) parts.push(`TO ${String(e.toObjectType).replace(/_/g, ' ')}`);
  if (e.fromObjectType) parts.push(`FROM ${String(e.fromObjectType).replace(/_/g, ' ')}`);
  if (e.onObjectType) parts.push(`ON ${String(e.onObjectType).replace(/_/g, ' ')}`);
  if (e.forPreposition) {
    parts.push(`FOR ${e.forPreposition.cardinalityConstraint.replace(/_/g, ' ')} ${e.forPreposition.cardinality}`);
  } else if (e.cardinalityConstraint) {
    parts.push(e.cardinalityConstraint.replace(/_/g, ' '));
  }
  if (e.withPreposition) {
    const wpParts: string[] = [];
    for (const [k, v] of Object.entries(e.withPreposition)) {
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
  /** Trigger predicates from properties.trigger.triggerClause. */
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
function isRedundantEffect(e: any): boolean {
  const obj = e.objectType;
  const verb = e.verbType;
  // SP cost / ultimate energy cost shown in dedicated SP/Skill sections
  if (verb === 'CONSUME' && (obj === 'SKILL_POINT' || obj === 'ULTIMATE_ENERGY')) return true;
  // Zero-value recoveries are noise
  if (verb === 'RECOVER' && (obj === 'SKILL_POINT' || obj === 'STAGGER')) {
    const val = e.withPreposition?.cardinality?.value ?? e.withPreposition?.value?.value;
    if (val === 0) return true;
  }
  // Zero-value stagger applications are noise
  if (verb === 'APPLY' && obj === 'STAGGER') {
    const val = e.withPreposition?.value?.value;
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
  effects: any[],
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
    const displayEffect = e.eventName && e.eventName !== e.objectId
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
  const skillCat = json.skills[skillName] as Record<string, any> | undefined;
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
    if (trigger.triggerClause && Array.isArray(trigger.triggerClause)) {
      for (const pred of trigger.triggerClause) {
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
  const segments: any[] = skillCat.segments ?? [];
  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si];

    // Segment clause
    if (seg.clause && Array.isArray(seg.clause)) {
      segmentPredicates[si] = seg.clause.map((pred: any) => ({
        conditions: (pred.conditions ?? []).map((c: Interaction) => interactionToText(c)),
        effects: (pred.effects ?? []).map((e: Effect) => effectToText(e)),
      }));
    }

    // Segment effects
    if (seg.effects && Array.isArray(seg.effects)) {
      segmentEffects[si] = seg.effects.map((e: Effect) => effectToText(e));
    }

    // Frame-level effects (filtered by operator potential)
    const frames: any[] = seg.frames ?? [];
    for (let fi = 0; fi < frames.length; fi++) {
      const frame = frames[fi];
      if (frame.effects && Array.isArray(frame.effects)) {
        resolveFrameEffects(frame.effects, `${si}-${fi}`, potential, frameEffects);
      }
    }
  }

  // Flat shape (single segment, no segments array)
  if (segments.length === 0 && skillCat.frames) {
    const frames: any[] = skillCat.frames;
    for (let fi = 0; fi < frames.length; fi++) {
      const frame = frames[fi];
      if (frame.effects && Array.isArray(frame.effects)) {
        resolveFrameEffects(frame.effects, `0-${fi}`, potential, frameEffects);
      }
    }
  }

  // Skill-level effects (filter out SP/gauge effects already shown in dedicated sections)
  if (skillCat.effects && Array.isArray(skillCat.effects)) {
    const filtered = (skillCat.effects as any[])
      .filter((e) => !isRedundantEffect(e))
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
  statusEvents: any[] | null;
  /** Skill-level clause (raw predicates) */
  clause: { conditions: Interaction[]; effects: Effect[] }[] | null;
  /** Skill-level effects (non-predicate) */
  effects: Effect[] | null;
  /** Segment details */
  segments: {
    index: number;
    properties: Record<string, { value: number | string; unit?: string }> | null;
    clause: { conditions: Interaction[]; effects: Effect[] }[] | null;
    effects: Effect[] | null;
    metadata: Record<string, any> | null;
    frames: {
      index: number;
      properties: Record<string, { value: number | string; unit?: string }> | null;
      effects: Effect[] | null;
      multipliers: Record<string, number>[] | null;
      metadata: Record<string, any> | null;
    }[];
  }[];
  /** Metadata from JSON (dataSources, etc.) */
  metadata: Record<string, any> | null;
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

  const skillCat = json.skills[skillName] as Record<string, any> | undefined;
  if (!skillCat) return null;

  // Find which skill type maps to this skill
  const skillTypeMap = json.skills.skillTypeMap as Record<string, string> | undefined;
  let skillTypeMapping: string | null = null;
  if (skillTypeMap) {
    for (const [type, id] of Object.entries(skillTypeMap)) {
      if (id === skillName) { skillTypeMapping = type; break; }
    }
  }

  const segments: EventFullDetail['segments'] = [];
  const rawSegments: any[] = skillCat.segments ?? [];

  for (let si = 0; si < rawSegments.length; si++) {
    const seg = rawSegments[si];
    const frames: EventFullDetail['segments'][0]['frames'] = [];
    const rawFrames: any[] = seg.frames ?? [];

    for (let fi = 0; fi < rawFrames.length; fi++) {
      const frame = rawFrames[fi];
      frames.push({
        index: fi,
        properties: frame.properties ?? null,
        effects: frame.effects ?? null,
        multipliers: frame.multipliers ?? null,
        metadata: frame.metadata ?? null,
      });
    }

    segments.push({
      index: si,
      properties: seg.properties ?? null,
      clause: seg.clause ?? null,
      effects: seg.effects ?? null,
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
        effects: frame.effects ?? null,
        multipliers: frame.multipliers ?? null,
        metadata: frame.metadata ?? null,
      });
    }
    segments.push({
      index: 0,
      properties: skillCat.properties ?? null,
      clause: null,
      effects: null,
      metadata: null,
      frames,
    });
  }

  return {
    skillId: skillName,
    originId: skillCat.originId ?? null,
    name: skillCat.name ?? null,
    description: skillCat.description ?? null,
    properties: skillCat.properties ?? null,
    statusEvents: skillCat.statusEvents ?? null,
    clause: skillCat.clause ?? null,
    effects: skillCat.effects ?? null,
    segments,
    metadata: skillCat.metadata ?? null,
    skillTypeMapping,
  };
}
