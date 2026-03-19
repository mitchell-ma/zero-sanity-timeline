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
  verb: string;
  object?: string;
  objectId?: string;
  adjective?: string | string[];
  toDeterminer?: string;
  toObject?: string;
  fromDeterminer?: string;
  fromObject?: string;
  onObject?: string;
  /** WITH — properties/cardinalities (duration, stacks, multiplier, etc.). */
  with?: Record<string, JsonWithValue>;
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
  conversion?: { object: string; objectId?: string };
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
  subject: string;
  verb: string;
  negated?: boolean;
  object?: string;
  objectId?: string;
  cardinalityConstraint?: string;
  cardinality?: number;
}

interface JsonFrame {
  metadata?: { eventComponentType?: string; dataSources?: string[] };
  properties?: { offset?: JsonDuration };
  clause?: JsonClausePredicate[];
  damageElement?: string;
}

interface JsonSegment {
  metadata?: { eventComponentType?: string; segmentType?: string; dataSources?: string[] };
  properties?: { duration?: JsonDuration; name?: string; timeDependency?: string; timeInteractionType?: string };
  clause?: { conditions: JsonClauseCondition[]; effects: { verb: string; adjective?: string; object: string; toDeterminer?: string; to?: string }[] }[];
  frames: JsonFrame[];
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
    enhancementTypes?: string[];
  };
  clause?: JsonClausePredicate[];
  frames?: JsonFrame[];
  segments?: JsonSegment[];
  dataSources?: string[];
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

/** Map DSL toObject + toDeterminer to target string. */
function dslTargetToLegacy(toObject?: string, toDeterminer?: string): string | undefined {
  if (toObject === 'OPERATOR') {
    return toDeterminer === 'ALL' ? 'TEAM' : 'SELF';
  }
  if (toObject === 'ENEMY') return 'ENEMY';
  return undefined;
}

/** Map DSL toObject to TargetType enum. */
function dslTargetToTargetType(toObject?: string): TargetType {
  switch (toObject) {
    case 'ENEMY': return TargetType.ENEMY;
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
 * Maps: object→resourceType, verb→interactionType, toObject→target.
 * Reads cardinality from with.cardinality.
 */
function findEffectValue(
  effects: JsonEffect[] | undefined,
  object: string,
  verb: string,
  target?: string,
): number | undefined {
  if (!effects) return undefined;
  for (const ef of effects) {
    if (ef.object === object && ef.verb === verb) {
      const efTarget = dslTargetToLegacy(ef.toObject, ef.toDeterminer);
      if (target && efTarget !== target) continue;
      return withValue(ef.with?.cardinality);
    }
  }
  return undefined;
}

/** Flatten all effects from a skill category's clause predicates. */
function flattenClauseEffects(category: JsonSkillCategory | undefined): JsonEffect[] {
  if (!category?.clause) return [];
  return category.clause.flatMap(pred => pred.effects ?? []);
}

/** Find a value from a skill category's clause effects. */
function findValue(
  category: JsonSkillCategory | undefined,
  object: string,
  verb: string,
  target?: string,
): number | undefined {
  return findEffectValue(flattenClauseEffects(category), object, verb, target);
}

/** Get all conditional gauge gains (by enemies hit) from clause effects. */
function findConditionalGaugeGains(category: JsonSkillCategory | undefined): Record<number, number> {
  const byEnemies: Record<number, number> = {};
  for (const ef of flattenClauseEffects(category)) {
    if (ef.object === 'ULTIMATE_ENERGY' && ef.verb === 'RECOVER' && ef.conditions?.enemiesHitThreshold) {
      byEnemies[ef.conditions.enemiesHitThreshold] = withValue(ef.with?.cardinality);
    }
  }
  return byEnemies;
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
    this._offsetSeconds = frame.properties!.offset!.value;
    this._damageElement = frame.damageElement ?? null;
    this._consumeReaction = null;
    let duplicatesSource = false;

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

    // ── Clause parsing ─────────────────────────────────────────────────────
    const clauses: FrameClausePredicate[] = [];
    let dealDamage: FrameDealDamage | null = null;

    for (const pred of (frame.clause ?? [])) {
      const conditions: FrameCondition[] = (pred.conditions ?? []).map(c => ({
        subject: c.subject,
        verb: c.verb,
        ...(c.negated != null && { negated: c.negated }),
        ...(c.object && { object: c.object }),
        ...(c.objectId && { objectId: c.objectId }),
        ...(c.cardinalityConstraint && { cardinalityConstraint: c.cardinalityConstraint }),
        ...(c.cardinality != null && { cardinality: c.cardinality }),
      }));

      const clauseEffects: FrameClauseEffect[] = [];
      for (const ef of pred.effects) {
        const wp = ef.with;
        const adjectives = Array.isArray(ef.adjective) ? ef.adjective : ef.adjective ? [ef.adjective] : [];
        const elementAdj = adjectives.find(a => ['HEAT', 'CRYO', 'NATURE', 'ELECTRIC', 'PHYSICAL'].includes(a));
        const isForced = adjectives.includes('FORCED');
        const isSource = adjectives.includes('SOURCE');
        const reactionAdj = adjectives.find(a => ['COMBUSTION', 'SOLIDIFICATION', 'CORROSION', 'ELECTRIFICATION'].includes(a));

        switch (ef.verb) {
          case 'RECOVER':
            if (ef.object === 'SKILL_POINT') { sp = withValue(wp?.cardinality); clauseEffects.push({ type: 'recoverSP' }); }
            if (ef.object === 'ULTIMATE_ENERGY') gaugeGain = withValue(wp?.cardinality);
            break;

          case 'APPLY':
            if (isSource && (ef.object === 'INFLICTION' || ef.object === 'STATUS')) {
              duplicatesSource = true;
            } else if (ef.object === 'INFLICTION') {
              applyInfliction = { element: elementAdj!, stacks: withValue(wp?.stacks) || 1 };
            } else if (ef.object === 'REACTION' && isForced) {
              const reactionName = reactionAdj ?? ef.objectId;
              const dur = wp?.duration;
              forcedReaction = {
                reaction: reactionName as StatusType,
                statusLevel: withValue(wp?.statusLevel) || 1,
                ...(dur != null && { durationFrames: Math.round(withValue(dur) * 120) }),
              };
            } else if (ef.object === 'STATUS') {
              const durVal = wp?.duration;
              const isStandardTarget = ['OPERATOR', 'ENEMY'].includes(ef.toObject ?? '');
              const status: FrameApplyStatus = {
                target: dslTargetToTargetType(ef.toObject),
                status: ef.objectId!,
                stacks: withValue(wp?.stacks) || 1,
                durationFrames: durVal != null ? Math.round(withValue(durVal) * 120) : 0,
              };
              if (ef.toObject && !isStandardTarget) {
                status.targetOperatorId = ef.toObject;
              }
              if (ef.susceptibility) {
                status.susceptibility = ef.susceptibility as Partial<Record<ElementType, readonly number[]>>;
              }
              if (ef.eventName) status.eventName = ef.eventName;
              if (ef.stackingInteraction) status.stackingInteraction = ef.stackingInteraction;
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
              clauseEffects.push({ type: 'applyStatus', applyStatus: status });
            }
            break;

          case 'CONSUME':
            if (ef.object === 'INFLICTION') {
              if (ef.conversion) {
                absorbInfliction = {
                  element: elementAdj!,
                  stacks: withValue(wp?.stacks) || 1,
                  exchangeStatus: (ef.conversion.objectId as StatusType) ?? StatusType.MELTING_FLAME,
                  ratio: '1:1',
                };
              } else {
                consumeInfliction = { element: elementAdj!, stacks: withValue(wp?.stacks) || 1 };
              }
            } else if (ef.object === 'STATUS') {
              consumeStatus = ef.objectId!;
            } else if (ef.object === 'REACTION') {
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
              clauseEffects.push({ type: 'consumeReaction', consumeReaction: cr });
            }
            break;

          case 'DEAL':
            if (ef.object === 'DAMAGE') {
              const multipliers = wp?.value;
              const mulArr = multipliers && Array.isArray(multipliers.value) ? multipliers.value : [];
              const dd: FrameDealDamage = {
                ...(elementAdj && { element: elementAdj }),
                multipliers: mulArr,
              };
              dealDamage = dd;
              clauseEffects.push({ type: 'dealDamage', dealDamage: dd });
            } else if (ef.object === 'STAGGER') {
              stagger = withValue(wp?.value);
              clauseEffects.push({ type: 'applyStagger' });
            }
            break;
        }
      }
      clauses.push({ conditions, effects: clauseEffects });
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
  readonly segmentType?: string;
  readonly timeDependency?: string;
  readonly timeInteractionType?: string;
  readonly clause?: { effects: { verb: string; object: string; toDeterminer?: string; to?: string }[] }[];

  constructor(segment: JsonSegment) {
    super();
    this._durationSeconds = segment.properties!.duration!.value;
    this._frames = segment.frames.map(f => new DataDrivenSkillEventFrame(f));
    this.segmentName = segment.properties?.name;
    this.segmentType = segment.metadata?.segmentType;
    this.timeDependency = segment.properties?.timeDependency;
    this.timeInteractionType = segment.properties?.timeInteractionType;
    this.clause = segment.clause;
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
      .filter(seg => seg.properties!.duration!.value > 0)
      .map(seg => new DataDrivenSkillEventSequence(seg));
  }

  // Flat shape: wrap duration + frames into a single segment
  if (skillCategory.properties?.duration && skillCategory.frames) {
    const segment: JsonSegment = {
      properties: { duration: skillCategory.properties.duration },
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
  operatorJson: Record<string, unknown>,
  skillCategoryKey: string,
): readonly DataDrivenSkillEventSequence[] {
  const skills = operatorJson.skills as Record<string, JsonSkillCategory> | undefined;
  if (!skills) return [];
  // Resolve via skillTypeMap if the key is a category (BASIC_ATTACK, BATTLE_SKILL, etc.)
  const typeMap = operatorJson.skillTypeMap as Record<string, unknown> | undefined;
  const rawEntry = typeMap?.[skillCategoryKey];
  const resolvedKey = rawEntry
    ? (typeof rawEntry === 'string' ? rawEntry : (rawEntry as any).BATK ?? skillCategoryKey)
    : skillCategoryKey;
  // Try resolved key first, fall back to raw key
  const cat = skills[resolvedKey] ?? skills[skillCategoryKey];
  if (!cat) return [];
  return buildSequencesFromSkillCategory(cat);
}

// ── Timing extraction (from operator JSON) ──────────────────────────────────

function dur(seconds: number): number { return Math.round(seconds * 120); }

/** Get duration from a skill category. */
function catDuration(cat?: JsonSkillCategory): number {
  return cat?.properties?.duration?.value ?? 0;
}

/** Get animation from a skill category. */
function catAnimation(cat?: JsonSkillCategory) {
  return cat?.properties?.animation;
}

export interface SkillTimings {
  battleDur: number;
  comboDur: number;
  comboCd: number;
  comboAnimDur: number;
  ultDur: number;
  ultAnimDur: number;
  ultCd: number;
  /** Active phase duration from typed segments (undefined if not segment-driven). */
  ultActiveDur?: number;
}

export function getSkillTimings(operatorJson: Record<string, unknown>): SkillTimings {
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

  // Ultimate — read from flat properties or derive from typed segments
  const ultimate = skills[typeMap?.ULTIMATE ?? 'ULTIMATE'];
  const ultSegs = (ultimate?.segments as JsonSegment[] | undefined)?.filter(
    s => s.metadata?.segmentType,
  );
  let ultTotalDur: number;
  let ultAnimDur: number;
  let ultCdFrames: number;
  let ultActiveDurFromSegs: number | undefined;
  if (ultSegs?.length) {
    // Data-driven: derive timings from typed segments
    const segDur = (type: string) => {
      const s = ultSegs.find(seg => seg.metadata?.segmentType === type);
      return s ? dur(s.properties?.duration?.value ?? 0) : 0;
    };
    ultAnimDur = segDur('ANIMATION');
    ultTotalDur = ultAnimDur + segDur('STASIS');
    ultCdFrames = segDur('COOLDOWN');
    ultActiveDurFromSegs = segDur('ACTIVE');
  } else {
    ultTotalDur = dur(catDuration(ultimate));
    const ultAnim = catAnimation(ultimate);
    ultAnimDur = ultAnim?.duration?.value != null
      ? dur(ultAnim.duration.value)
      : ultTotalDur;
    const ultCdRaw = findValue(ultimate, 'COOLDOWN', 'CONSUME');
    ultCdFrames = ultCdRaw != null ? dur(ultCdRaw) : 0;
  }

  return {
    battleDur,
    comboDur,
    comboCd,
    comboAnimDur,
    ultDur: ultTotalDur,
    ultAnimDur,
    ultCd: ultCdFrames,
    ultActiveDur: ultActiveDurFromSegs,
  };
}

export function getUltimateEnergyCost(operatorJson: Record<string, unknown>): number {
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

export function getSkillGaugeGains(operatorJson: Record<string, unknown>): SkillGaugeGains {
  const skills = operatorJson.skills as Record<string, JsonSkillCategory>;
  const typeMap = operatorJson.skillTypeMap as Record<string, string> | undefined;
  const result: SkillGaugeGains = { battleGaugeGain: 0, battleTeamGaugeGain: 0, comboGaugeGain: 0, comboTeamGaugeGain: 0 };

  // Battle skill gauge gains
  const battleSkillId = typeMap?.BATTLE_SKILL ?? 'BATTLE_SKILL';
  const bs = skills?.[battleSkillId];
  if (bs?.clause) {
    result.battleGaugeGain = findValue(bs, 'ULTIMATE_ENERGY', 'RECOVER', 'SELF') ?? 0;
    result.battleTeamGaugeGain = findValue(bs, 'ULTIMATE_ENERGY', 'RECOVER', 'TEAM') ?? 0;
  }

  // Combo skill gauge gains
  const comboSkillId = typeMap?.COMBO_SKILL ?? 'COMBO_SKILL';
  const cs = skills?.[comboSkillId];
  if (cs?.clause) {
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
export function getBattleSkillSpCost(operatorJson: Record<string, unknown>): number {
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
  operatorJson: Record<string, unknown>,
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
export function getBasicAttackDurations(operatorJson: Record<string, unknown>): number[] {
  const skills = operatorJson.skills as Record<string, JsonSkillCategory>;
  const typeMap = operatorJson.skillTypeMap as Record<string, string> | undefined;
  const basicEntry = typeMap?.BASIC_ATTACK as string | Record<string, string> | undefined;
  const basicId = typeof basicEntry === 'string' ? basicEntry : (basicEntry as Record<string, string> | undefined)?.BATK ?? 'BASIC_ATTACK';
  const basicAttack = skills?.[basicId];
  if (!basicAttack?.segments) return [];
  return basicAttack.segments.map(seg => seg.properties!.duration!.value);
}
