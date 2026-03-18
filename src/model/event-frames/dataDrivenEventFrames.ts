import { ElementType, StatusType, TargetType } from "../../consts/enums";
import { REACTION_COLUMNS } from "../channels";
import {
  SkillEventFrame,
  FrameArtsInfliction,
  FrameArtsAbsorption,
  FrameArtsConsumption,
  FrameForcedReaction,
  FrameApplyStatus,
  FrameReactionConsumption,
  FrameClausePredicate,
  FrameClauseEffect,
  FrameCondition,
  FrameDealDamage,
} from "./skillEventFrame";
import { SkillEventSequence } from "./skillEventSequence";

// ── JSON types (matching operator JSON DSL structure) ────────────────────────

interface JsonDuration {
  value: number;
  unit: string;
}

/** WITH preposition value: a cardinality with verb determining value shape. */
interface JsonWithValue {
  verb: string; // "IS" | "BASED_ON"
  object?: string;
  value: number | number[];
}

/** DSL Effect: Verb-Object with optional adjective and prepositional phrases. */
interface JsonEffect {
  verbType: string;
  objectType?: string;
  objectId?: string;
  adjectiveType?: string | string[];
  /** @deprecated Use adjectiveType. Kept for backward compat with pre-migration JSONs. */
  adjective?: string | string[];
  toObjectType?: string;
  fromObjectType?: string;
  onObjectType?: string;
  /** WITH preposition — properties/cardinalities (duration, stacks, multiplier, etc.). */
  withPreposition?: Record<string, JsonWithValue>;
  /** Constraint on cardinality (for compound ALL/ANY grouping). */
  cardinalityConstraint?: string;
  /** Cardinality for compound constraints. */
  cardinality?: number;
  eventName?: string;
  susceptibility?: Record<string, number[]>;
  stackingInteraction?: string;
  potentialMin?: number;
  potentialMax?: number;
  segments?: { name: string; duration: number; susceptibility?: Record<string, number[]> }[];
  conversion?: { objectType: string; objectId?: string };
  conditions?: { enemiesHitThreshold: number };
  /** Nested effects for compound verbs (ALL/ANY). */
  effects?: JsonEffect[];
  /** For CONSUME REACTION: status to apply if the reaction is successfully consumed. */
  applyOnConsume?: {
    status: string;
    target: string;
    durationSeconds: number;
    eventName?: string;
    susceptibility?: Record<string, number[]>;
  };
}

/** A clause predicate in JSON: conditions → effects. */
interface JsonClausePredicate {
  conditions: JsonClauseCondition[];
  effects: JsonEffect[];
}

interface JsonClauseCondition {
  subjectType: string;
  verbType: string;
  negated?: boolean;
  objectType?: string;
  objectId?: string;
  cardinalityConstraint?: string;
  cardinality?: number;
}

interface JsonFrame {
  metadata?: { eventComponentType?: string; dataSources?: string[] };
  properties?: { offset?: JsonDuration };
  effects?: JsonEffect[];
  /** DSL v2 clause structure: array of predicate groups. Replaces flat effects when present. */
  clause?: JsonClausePredicate[];
  damageElement?: string;
  duplicatesSourceInfliction?: boolean;
  // Legacy compat (pre-migration)
  offset?: JsonDuration;
  dataSources?: string[];
}

interface JsonSegment {
  metadata?: { eventComponentType?: string; dataSources?: string[] };
  properties?: { duration?: JsonDuration; name?: string };
  frames: JsonFrame[];
  // Legacy compat (pre-migration)
  eventComponentType?: string;
  name?: string;
  duration?: JsonDuration;
  animation?: { duration: JsonDuration; timeInteractionType: string };
  dataSources?: string[];
}

interface JsonSkillCategory {
  name?: string;
  description?: string;
  properties?: {
    duration?: JsonDuration;
    animation?: { duration: JsonDuration; timeInteractionType: string; dataSources?: string[] };
    trigger?: unknown;
    hasDelayedHit?: boolean;
    delayedHitLabel?: string;
  };
  effects?: JsonEffect[];
  frames?: JsonFrame[];
  segments?: JsonSegment[];
  dataSources?: string[];
  // Legacy compat (pre-migration)
  duration?: JsonDuration;
  animation?: { duration: JsonDuration; timeInteractionType: string };
}

// ── Element detection ───────────────────────────────────────────────────────

// ── DSL effects → target mapping ─────────────────────────────────────────────

/** Map DSL reaction adjective to reaction column ID constant. */
const DSL_REACTION_TO_COLUMN: Record<string, string> = {
  COMBUSTION:       REACTION_COLUMNS.COMBUSTION,
  SOLIDIFICATION:   REACTION_COLUMNS.SOLIDIFICATION,
  CORROSION:        REACTION_COLUMNS.CORROSION,
  ELECTRIFICATION:  REACTION_COLUMNS.ELECTRIFICATION,
};

/** Map DSL toObjectType to legacy target string. */
function dslTargetToLegacy(toObjectType?: string): string | undefined {
  switch (toObjectType) {
    case 'OPERATOR': return 'SELF';
    case 'ALL_OPERATORS': return 'TEAM'; // legacy compat
    case 'ENEMY': return 'ENEMY';
    default: return undefined;
  }
}

/** Map DSL toObjectType to TargetType enum. */
function dslTargetToTargetType(toObjectType?: string): TargetType {
  switch (toObjectType) {
    case 'ENEMY': return TargetType.ENEMY;
    case 'ALL_OPERATORS': return TargetType.TEAM; // legacy compat
    default: return TargetType.SELF;
  }
}

// ── DSL effects → legacy resource interaction bridging ──────────────────────

/** Extract a numeric value from a WITH preposition entry. Returns the IS value or first BASED_ON value. */
function withValue(wv?: JsonWithValue): number {
  if (!wv) return 0;
  return typeof wv.value === 'number' ? wv.value : (wv.value[0] ?? 0);
}

/**
 * Find a value from a DSL effects array.
 * Maps: objectType→resourceType, verbType→interactionType, toObjectType→target.
 * Reads cardinality from withPreposition.cardinality.
 */
function findEffectValue(
  effects: JsonEffect[] | undefined,
  objectType: string,
  verbType: string,
  target?: string,
): number | undefined {
  if (!effects) return undefined;
  for (const ef of effects) {
    if (ef.objectType === objectType && ef.verbType === verbType) {
      const efTarget = dslTargetToLegacy(ef.toObjectType);
      if (target && efTarget !== target) continue;
      return withValue(ef.withPreposition?.cardinality);
    }
  }
  return undefined;
}

/** Find a value from a skill category's effects array. */
function findValue(
  category: JsonSkillCategory | undefined,
  objectType: string,
  verbType: string,
  target?: string,
): number | undefined {
  return findEffectValue(category?.effects, objectType, verbType, target);
}

/** Get all conditional gauge gains (by enemies hit) from effects. */
function findConditionalGaugeGains(category: JsonSkillCategory | undefined): Record<number, number> {
  const byEnemies: Record<number, number> = {};
  if (category?.effects) {
    for (const ef of category.effects) {
      if (ef.objectType === 'ULTIMATE_ENERGY' && ef.verbType === 'RECOVER' && ef.conditions?.enemiesHitThreshold) {
        byEnemies[ef.conditions.enemiesHitThreshold] = withValue(ef.withPreposition?.cardinality);
      }
    }
  }
  return byEnemies;
}

// ── Compound effect flattening ───────────────────────────────────────────────

/** Recursively flatten compound effects (ALL/ANY) into a flat list of leaf effects. */
function flattenEffects(effects: JsonEffect[]): JsonEffect[] {
  const result: JsonEffect[] = [];
  for (const ef of effects) {
    if (ef.effects && (ef.verbType === 'ALL' || ef.verbType === 'ANY')) {
      result.push(...flattenEffects(ef.effects));
    } else {
      result.push(ef);
    }
  }
  return result;
}

// ── DataDrivenSkillEventFrame ───────────────────────────────────────────────

export class DataDrivenSkillEventFrame extends SkillEventFrame {
  private readonly _offsetSeconds: number;
  private readonly _skillPointRecovery: number;
  private readonly _stagger: number;
  private readonly _applyArtsInfliction: FrameArtsInfliction | null;
  private readonly _absorbArtsInfliction: FrameArtsAbsorption | null;
  private readonly _consumeArtsInfliction: FrameArtsConsumption | null;
  private readonly _applyForcedReaction: FrameForcedReaction | null;
  private readonly _applyStatuses: FrameApplyStatus[];
  private readonly _consumeStatus: string | null;
  private readonly _damageElement: string | null;
  private readonly _consumeReaction: FrameReactionConsumption | null;
  private readonly _duplicatesSourceInfliction: boolean;
  private readonly _clauses: readonly FrameClausePredicate[];
  private readonly _dealDamage: FrameDealDamage | null;
  private readonly _gaugeGain: number;

  constructor(frame: JsonFrame) {
    super();
    const offset = frame.properties?.offset ?? frame.offset;
    this._offsetSeconds = offset!.value;
    this._damageElement = frame.damageElement ?? null;
    this._consumeReaction = null;
    let duplicatesSource = frame.duplicatesSourceInfliction ?? false; // legacy compat

    let sp = 0;
    let stagger = 0;
    let gaugeGain = 0;
    let applyInfliction: FrameArtsInfliction | null = null;
    let absorbInfliction: FrameArtsAbsorption | null = null;
    let consumeInfliction: FrameArtsConsumption | null = null;
    let forcedReaction: FrameForcedReaction | null = null;
    const applyStatuses: FrameApplyStatus[] = [];
    let consumeStatus: string | null = null;
    let consumeReaction: FrameReactionConsumption | null = null;

    if (frame.effects) {
      // ── DSL effects path ──────────────────────────────────────────────
      // Flatten compound effects (ALL/ANY) so nested CONSUME/APPLY/etc. are processed
      const flatEffects = flattenEffects(frame.effects);
      for (const ef of flatEffects) {
        const wp = ef.withPreposition;
        const rawAdj = ef.adjectiveType ?? ef.adjective;
        const adjectives = Array.isArray(rawAdj) ? rawAdj : rawAdj ? [rawAdj] : [];
        const elementAdj = adjectives.find(a => ['HEAT', 'CRYO', 'NATURE', 'ELECTRIC', 'PHYSICAL'].includes(a));
        const isForced = adjectives.includes('FORCED');
        const isSource = adjectives.includes('SOURCE');
        const reactionAdj = adjectives.find(a => ['COMBUSTION', 'SOLIDIFICATION', 'CORROSION', 'ELECTRIFICATION'].includes(a));

        switch (ef.verbType) {
          case 'RECOVER':
            if (ef.objectType === 'SKILL_POINT') sp = withValue(wp?.cardinality);
            if (ef.objectType === 'STAGGER') stagger = withValue(wp?.value);
            if (ef.objectType === 'ULTIMATE_ENERGY') gaugeGain = withValue(wp?.cardinality);
            break;

          case 'APPLY':
            // APPLY STAGGER TO ENEMY — stagger damage
            if (ef.objectType === 'STAGGER') { stagger = withValue(wp?.value); break; }
            // APPLY SOURCE INFLICTION / APPLY SOURCE STATUS — duplicate triggering effect
            if (isSource && (ef.objectType === 'INFLICTION' || ef.objectType === 'STATUS')) {
              duplicatesSource = true;
            } else if (ef.objectType === 'INFLICTION') {
              applyInfliction = { element: elementAdj!, stacks: withValue(wp?.stacks) || 1 };
            } else if (ef.objectType === 'REACTION' && isForced) {
              const reactionName = reactionAdj ?? ef.objectId;
              const dur = wp?.duration;
              forcedReaction = {
                reaction: reactionName as StatusType,
                statusLevel: withValue(wp?.statusLevel) || 1,
                ...(dur != null && { durationFrames: Math.round(withValue(dur) * 120) }),
              };
            } else if (ef.objectType === 'FORCED_REACTION') {
              // Legacy objectType compat
              const dur = wp?.duration;
              forcedReaction = {
                reaction: (ef.objectId ?? elementAdj!) as StatusType,
                statusLevel: withValue(wp?.statusLevel) || withValue(wp?.cardinality) || 1,
                ...(dur != null && { durationFrames: Math.round(withValue(dur) * 120) }),
              };
            } else if (ef.objectType === 'STATUS') {
              const durVal = wp?.duration;
              const isStandardTarget = ['OPERATOR', 'ENEMY'].includes(ef.toObjectType ?? '');
              const status: FrameApplyStatus = {
                target: dslTargetToTargetType(ef.toObjectType),
                status: ef.objectId!,
                stacks: withValue(wp?.stacks) || 1,
                durationFrames: durVal != null ? Math.round(withValue(durVal) * 120) : 0,
              };
              // If toObjectType is not a standard target, treat it as an operator ID
              if (ef.toObjectType && !isStandardTarget) {
                status.targetOperatorId = ef.toObjectType;
              }
              if (ef.susceptibility) {
                status.susceptibility = ef.susceptibility as Partial<Record<ElementType, readonly number[]>>;
              }
              if (ef.eventName) {
                status.eventName = ef.eventName;
              }
              if (ef.stackingInteraction) {
                status.stackingInteraction = ef.stackingInteraction;
              }
              if (ef.potentialMin != null) status.potentialMin = ef.potentialMin;
              if (ef.potentialMax != null) status.potentialMax = ef.potentialMax;
              if (ef.segments) {
                status.segments = ef.segments.map(s => ({
                  name: s.name,
                  durationFrames: Math.round(s.duration * 120),
                  ...(s.susceptibility && { susceptibility: s.susceptibility as Partial<Record<ElementType, readonly number[]>> }),
                }));
              }
              applyStatuses.push(status);
            }
            break;

          case 'CONSUME':
            if (ef.objectType === 'INFLICTION') {
              if (ef.conversion) {
                // CONSUME with conversion → absorption (consume infliction + exchange for status)
                absorbInfliction = {
                  element: elementAdj!,
                  stacks: withValue(wp?.stacks) || 1,
                  exchangeStatus: (ef.conversion.objectId as StatusType) ?? StatusType.MELTING_FLAME,
                  ratio: '1:1',
                };
              } else {
                consumeInfliction = { element: elementAdj!, stacks: withValue(wp?.stacks) || 1 };
              }
            } else if (ef.objectType === 'STATUS') {
              consumeStatus = ef.objectId!;
            } else if (ef.objectType === 'REACTION') {
              // CONSUME REACTION with optional applyOnConsume
              const cr: FrameReactionConsumption = {
                columnId: DSL_REACTION_TO_COLUMN[reactionAdj ?? ef.objectId ?? ''] ?? (reactionAdj ?? ef.objectId ?? ''),
              };
              if (ef.applyOnConsume) {
                const aoc = ef.applyOnConsume;
                cr.applyStatus = {
                  target: dslTargetToTargetType(aoc.target),
                  status: aoc.status,
                  stacks: 1,
                  durationFrames: Math.round(aoc.durationSeconds * 120),
                  ...(aoc.eventName && { eventName: aoc.eventName }),
                  ...(aoc.susceptibility && {
                    susceptibility: aoc.susceptibility as Partial<Record<ElementType, readonly number[]>>,
                  }),
                };
              }
              consumeReaction = cr;
            }
            break;
        }
      }
    }

    // ── Clause parsing (DSL v2) ──────────────────────────────────────────
    let clauses: FrameClausePredicate[] = [];
    let dealDamage: FrameDealDamage | null = null;

    if (frame.clause) {
      for (const pred of frame.clause) {
        const conditions: FrameCondition[] = (pred.conditions ?? []).map(c => ({
          subjectType: c.subjectType,
          verbType: c.verbType,
          ...(c.negated != null && { negated: c.negated }),
          ...(c.objectType && { objectType: c.objectType }),
          ...(c.objectId && { objectId: c.objectId }),
          ...(c.cardinalityConstraint && { cardinalityConstraint: c.cardinalityConstraint }),
          ...(c.cardinality != null && { cardinality: c.cardinality }),
        }));

        const effects: FrameClauseEffect[] = [];
        for (const ef of pred.effects) {
          const rawAdj = ef.adjectiveType ?? ef.adjective;
          const adjectives = Array.isArray(rawAdj) ? rawAdj : rawAdj ? [rawAdj] : [];
          const elementAdj = adjectives.find(a => ['HEAT', 'CRYO', 'NATURE', 'ELECTRIC', 'PHYSICAL'].includes(a));
          const reactionAdj = adjectives.find(a => ['COMBUSTION', 'SOLIDIFICATION', 'CORROSION', 'ELECTRIFICATION'].includes(a));
          const wp = ef.withPreposition;

          switch (ef.verbType) {
            case 'CONSUME':
              if (ef.objectType === 'REACTION') {
                const columnId = DSL_REACTION_TO_COLUMN[reactionAdj ?? ef.objectId ?? ''] ?? (reactionAdj ?? ef.objectId ?? '');
                effects.push({ type: 'consumeReaction', consumeReaction: { columnId } });
                // Also set legacy consumeReaction for backward compat
                consumeReaction = { columnId };
              }
              break;
            case 'APPLY':
              if (ef.objectType === 'STATUS') {
                const durVal = wp?.duration;
                const status: FrameApplyStatus = {
                  target: dslTargetToTargetType(ef.toObjectType),
                  status: ef.objectId!,
                  stacks: withValue(wp?.stacks) || 1,
                  durationFrames: durVal != null ? Math.round(withValue(durVal) * 120) : 0,
                };
                if (ef.susceptibility) {
                  status.susceptibility = ef.susceptibility as Partial<Record<ElementType, readonly number[]>>;
                }
                if (ef.eventName) status.eventName = ef.eventName;
                if (ef.stackingInteraction) status.stackingInteraction = ef.stackingInteraction;
                if (ef.potentialMin != null) status.potentialMin = ef.potentialMin;
                if (ef.potentialMax != null) status.potentialMax = ef.potentialMax;
                effects.push({ type: 'applyStatus', applyStatus: status });
              } else if (ef.objectType === 'STAGGER') {
                // Unconditional stagger — still extracted to top-level for backward compat
                stagger = withValue(wp?.value);
                effects.push({ type: 'applyStagger' });
              }
              break;
            case 'RECOVER':
              if (ef.objectType === 'SKILL_POINT') {
                sp = withValue(wp?.cardinality);
                effects.push({ type: 'recoverSP' });
              }
              break;
            case 'DEAL':
              if (ef.objectType === 'DAMAGE') {
                const multipliers = wp?.multiplier;
                const mulArr = multipliers && Array.isArray(multipliers.value) ? multipliers.value : [];
                const dd: FrameDealDamage = {
                  ...(elementAdj && { element: elementAdj }),
                  multipliers: mulArr,
                };
                dealDamage = dd;
                effects.push({ type: 'dealDamage', dealDamage: dd });
              }
              break;
          }
        }
        clauses.push({ conditions, effects });
      }
    }

    this._clauses = clauses;
    this._dealDamage = dealDamage;
    this._gaugeGain = gaugeGain;
    this._skillPointRecovery = sp;
    this._stagger = stagger;
    this._applyArtsInfliction = applyInfliction;
    this._absorbArtsInfliction = absorbInfliction;
    this._consumeArtsInfliction = consumeInfliction;
    this._applyForcedReaction = forcedReaction;
    this._applyStatuses = applyStatuses;
    if (consumeReaction) this._consumeReaction = consumeReaction;
    this._consumeStatus = consumeStatus;
    this._duplicatesSourceInfliction = duplicatesSource;
  }

  getOffsetSeconds(): number { return this._offsetSeconds; }
  getSkillPointRecovery(): number { return this._skillPointRecovery; }
  getStagger(): number { return this._stagger; }
  getApplyArtsInfliction(): FrameArtsInfliction | null { return this._applyArtsInfliction; }
  getAbsorbArtsInfliction(): FrameArtsAbsorption | null { return this._absorbArtsInfliction; }
  getConsumeArtsInfliction(): FrameArtsConsumption | null { return this._consumeArtsInfliction; }
  getApplyForcedReaction(): FrameForcedReaction | null { return this._applyForcedReaction; }
  getApplyStatus(): FrameApplyStatus | null { return this._applyStatuses[0] ?? null; }
  getApplyStatuses(): readonly FrameApplyStatus[] { return this._applyStatuses; }
  getConsumeReaction(): FrameReactionConsumption | null { return this._consumeReaction; }
  getConsumeStatus(): string | null { return this._consumeStatus; }
  getDamageElement(): string | null { return this._damageElement; }
  getDuplicatesSourceInfliction(): boolean { return this._duplicatesSourceInfliction; }
  getClauses(): readonly FrameClausePredicate[] { return this._clauses; }
  getDealDamage(): FrameDealDamage | null { return this._dealDamage; }
  getGaugeGain(): number { return this._gaugeGain; }
}

// ── DataDrivenSkillEventSequence ────────────────────────────────────────────

export class DataDrivenSkillEventSequence extends SkillEventSequence {
  private readonly _durationSeconds: number;
  private readonly _frames: readonly DataDrivenSkillEventFrame[];
  readonly segmentName?: string;

  constructor(segment: JsonSegment) {
    super();
    const duration = segment.properties?.duration ?? segment.duration;
    this._durationSeconds = duration!.value;
    this._frames = segment.frames.map(f => new DataDrivenSkillEventFrame(f));
    this.segmentName = segment.properties?.name ?? segment.name;
  }

  getDurationSeconds(): number { return this._durationSeconds; }
  getFrames(): readonly DataDrivenSkillEventFrame[] { return this._frames; }
}

// ── Factory ─────────────────────────────────────────────────────────────────

/**
 * Build SkillEventSequence[] from an operator JSON skill category.
 * Handles both shapes: segments[] (basic attacks, multi-part) and flat duration+frames (single-part).
 */
export function buildSequencesFromSkillCategory(
  skillCategory: JsonSkillCategory,
): readonly DataDrivenSkillEventSequence[] {
  if (skillCategory.segments) {
    return skillCategory.segments
      .filter(seg => (seg.properties?.duration ?? seg.duration)!.value > 0)
      .map(seg => new DataDrivenSkillEventSequence(seg));
  }

  // Flat shape: wrap duration + frames into a single segment
  const catDuration = skillCategory.properties?.duration ?? skillCategory.duration;
  if (catDuration && skillCategory.frames) {
    const segment: JsonSegment = {
      properties: { duration: catDuration },
      frames: skillCategory.frames,
    };
    return [new DataDrivenSkillEventSequence(segment)];
  }

  return [];
}

/**
 * Build sequences for a given skill category from an operator JSON.
 * All skill data lives in the skills JSON — no operator-level overrides.
 */
export function buildSequencesFromOperatorJson(
  operatorJson: Record<string, any>,
  skillCategoryKey: string,
): readonly DataDrivenSkillEventSequence[] {
  const skills = operatorJson.skills as Record<string, JsonSkillCategory> | undefined;
  if (!skills?.[skillCategoryKey]) return [];
  return buildSequencesFromSkillCategory(skills[skillCategoryKey]);
}

// ── Timing extraction (from operator JSON) ──────────────────────────────────

function dur(seconds: number): number { return Math.round(seconds * 120); }

/** Get duration from a skill category (new properties path or legacy). */
function catDuration(cat?: JsonSkillCategory): number {
  return (cat?.properties?.duration ?? cat?.duration)?.value ?? 0;
}

/** Get animation from a skill category (new properties path or legacy). */
function catAnimation(cat?: JsonSkillCategory) {
  return cat?.properties?.animation ?? cat?.animation;
}

export interface SkillTimings {
  battleDur: number;
  comboDur: number;
  comboCd: number;
  comboAnimDur: number;
  ultDur: number;
  ultAnimDur: number;
  ultCd: number;
}

export function getSkillTimings(operatorJson: Record<string, any>): SkillTimings {
  const skills = (operatorJson.skills ?? {}) as Record<string, JsonSkillCategory>;
  const typeMap = operatorJson.skillTypeMap as Record<string, string> | undefined;

  // Battle skill duration
  const battleSkill = skills[typeMap?.BATTLE_SKILL ?? 'BATTLE_SKILL'];
  const battleDur = dur(catDuration(battleSkill));

  // Combo skill
  const comboSkill = skills[typeMap?.COMBO_SKILL ?? 'COMBO_SKILL'];
  const comboDur = dur(catDuration(comboSkill));
  const comboCd = dur(findValue(comboSkill, 'COOLDOWN', 'CONSUME') ?? 0);
  const comboAnim = catAnimation(comboSkill);
  const comboAnimDur = dur(comboAnim?.duration?.value ?? 0.5);

  // Ultimate
  const ultimate = skills[typeMap?.ULTIMATE ?? 'ULTIMATE'];
  const ultTotalDur = dur(catDuration(ultimate));
  const ultAnim = catAnimation(ultimate);
  const ultAnimDur = ultAnim?.duration?.value != null
    ? dur(ultAnim.duration.value)
    : ultTotalDur;
  const ultCdRaw = findValue(ultimate, 'COOLDOWN', 'CONSUME');

  return {
    battleDur,
    comboDur,
    comboCd,
    comboAnimDur,
    ultDur: ultTotalDur,
    ultAnimDur,
    ultCd: ultCdRaw != null ? dur(ultCdRaw) : 0,
  };
}

export function getUltimateEnergyCost(operatorJson: Record<string, any>): number {
  const skills = operatorJson.skills as Record<string, JsonSkillCategory>;
  const typeMap = operatorJson.skillTypeMap as Record<string, string> | undefined;
  const ultimate = skills?.[typeMap?.ULTIMATE ?? 'ULTIMATE'];
  return findValue(ultimate, 'ULTIMATE_ENERGY', 'CONSUME') ?? 0;
}

export interface SkillGaugeGains {
  battleGaugeGain: number;
  battleTeamGaugeGain: number;
  comboGaugeGain: number;
  comboTeamGaugeGain: number;
  comboGaugeGainByEnemies?: Record<number, number>;
}

export function getSkillGaugeGains(operatorJson: Record<string, any>): SkillGaugeGains {
  const skills = operatorJson.skills as Record<string, JsonSkillCategory>;
  const typeMap = operatorJson.skillTypeMap as Record<string, string> | undefined;
  const result: SkillGaugeGains = { battleGaugeGain: 0, battleTeamGaugeGain: 0, comboGaugeGain: 0, comboTeamGaugeGain: 0 };

  // Battle skill gauge gains
  const battleSkillId = typeMap?.BATTLE_SKILL ?? 'BATTLE_SKILL';
  const bs = skills?.[battleSkillId];
  if (bs?.effects) {
    result.battleGaugeGain = findValue(bs, 'ULTIMATE_ENERGY', 'RECOVER', 'SELF') ?? 0;
    result.battleTeamGaugeGain = findValue(bs, 'ULTIMATE_ENERGY', 'RECOVER', 'TEAM') ?? 0;
  }

  // Combo skill gauge gains
  const comboSkillId = typeMap?.COMBO_SKILL ?? 'COMBO_SKILL';
  const cs = skills?.[comboSkillId];
  if (cs?.effects) {
    const byEnemies = findConditionalGaugeGains(cs);
    if (Object.keys(byEnemies).length > 0) {
      result.comboGaugeGainByEnemies = byEnemies;
      result.comboGaugeGain = byEnemies[1] ?? 0;
    } else {
      result.comboGaugeGain = findValue(cs, 'ULTIMATE_ENERGY', 'RECOVER', 'SELF') ?? 0;
    }
    result.comboTeamGaugeGain = findValue(cs, 'ULTIMATE_ENERGY', 'RECOVER', 'TEAM') ?? 0;
  }

  return result;
}

/** Extract the SP cost for battle skill from merged operator JSON (skills keyed by skill ID). */
export function getBattleSkillSpCost(operatorJson: Record<string, any>): number {
  const skills = operatorJson.skills as Record<string, JsonSkillCategory> | undefined;
  const typeMap = operatorJson.skillTypeMap as Record<string, string> | undefined;
  const battleSkillId = typeMap?.BATTLE_SKILL ?? 'BATTLE_SKILL';
  return findValue(skills?.[battleSkillId], 'SKILL_POINT', 'CONSUME') ?? 0;
}

// ── Per-skill-category data extraction (raw seconds, for event files) ────────

export interface SkillCategoryData {
  duration: number;
  spCost: number;
  gaugeGain: number;
  cooldown: number;
  animationTime: number;
  energyCost: number;
}

/**
 * Extract raw timing/cost data for a given skill category from operator JSON.
 * Falls back to BATTLE_SKILL effects for variants that share the same SP cost.
 */
export function getSkillCategoryData(
  operatorJson: Record<string, any>,
  skillCategory: string,
): SkillCategoryData {
  const skills = operatorJson.skills as Record<string, JsonSkillCategory>;
  const typeMap = operatorJson.skillTypeMap as Record<string, string> | undefined;
  const cat = skills?.[skillCategory];
  const baseBattle = skills?.[typeMap?.BATTLE_SKILL ?? 'BATTLE_SKILL'];

  return {
    duration: catDuration(cat),
    spCost: findValue(cat, 'SKILL_POINT', 'CONSUME')
         ?? findValue(baseBattle, 'SKILL_POINT', 'CONSUME')
         ?? 0,
    gaugeGain: findValue(cat, 'ULTIMATE_ENERGY', 'RECOVER', 'SELF')
            ?? findValue(baseBattle, 'ULTIMATE_ENERGY', 'RECOVER', 'SELF')
            ?? 0,
    cooldown: findValue(cat, 'COOLDOWN', 'CONSUME') ?? 0,
    animationTime: catAnimation(cat)?.duration?.value ?? 0,
    energyCost: findValue(cat, 'ULTIMATE_ENERGY', 'CONSUME') ?? 0,
  };
}

/**
 * Get the durations of basic attack segments from operator JSON.
 * Returns an array of duration values in seconds.
 */
export function getBasicAttackDurations(operatorJson: Record<string, any>): number[] {
  const skills = operatorJson.skills as Record<string, JsonSkillCategory>;
  const typeMap = operatorJson.skillTypeMap as Record<string, string> | undefined;
  const basicAttack = skills?.[typeMap?.BASIC_ATTACK ?? 'BASIC_ATTACK'];
  if (!basicAttack?.segments) return [];
  return basicAttack.segments.map(seg => (seg.properties?.duration ?? seg.duration)!.value);
}
