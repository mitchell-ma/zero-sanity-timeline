import { EventFrameType, SegmentType } from "../../consts/enums";
import { NounType, VerbType, AdjectiveType, DeterminerType } from "../../dsl/semantics";
import type { Effect, ValueNode } from "../../dsl/semantics";
import { resolveValueNode, DEFAULT_VALUE_CONTEXT, type ValueResolutionContext } from "../../controller/calculation/valueResolver";
import {
  SkillEventFrame,
  FrameClausePredicate,
  FrameClauseEffect,
  FrameCondition,
  FrameDealDamage,
} from "./skillEventFrame";
import { SkillEventSequence } from "./skillEventSequence";

// ── JSON types (matching operator JSON DSL structure) ────────────────────────

interface JsonDuration {
  value: ValueNode;
  unit: string;
}

/** WITH preposition value: verb determines value shape (IS = single, VARY_BY = array by level/potential). */
interface JsonWithValue {
  verb?: string; // "IS" | "VARY_BY"
  object?: string;
  value?: number | number[];
  /** ValueExpression fields (operation + left/right). */
  operation?: string;
  left?: JsonWithValue;
  right?: JsonWithValue;
  ofDeterminer?: string;
  of?: string;
}

/** DSL Effect: Verb-Object with optional object qualifier and prepositional phrases. */
interface JsonEffect {
  verb: string;
  object?: string;
  objectId?: string;
  objectType?: string;
  objectQualifier?: string | string[];
  toDeterminer?: string;
  to?: string;
  fromDeterminer?: string;
  fromObject?: string;
  onObject?: string;
  /** WITH — properties (duration, stacks, value, multiplier, etc.). */
  with?: Record<string, JsonWithValue>;
  /** Constraint on cardinality (for compound ALL/ANY grouping). */
  cardinalityConstraint?: string;
  /** Value for compound constraints. */
  value?: unknown;
  eventName?: string;
  susceptibility?: Record<string, number[]>;
  stackingInteraction?: string;
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
  subjectDeterminer?: string;
  subject: string;
  verb: string;
  negated?: boolean;
  objectQualifier?: string;
  object?: string;
  objectId?: string;
  cardinalityConstraint?: string;
  value?: unknown;
  with?: Record<string, unknown>;
}

interface JsonOffset {
  value: number;
  unit: string;
}

interface JsonFrame {
  metadata?: { eventComponentType?: string; dataSources?: string[] };
  properties?: { offset?: JsonOffset; dependencyTypes?: string[]; suppliedParameters?: Record<string, { id: string; name: string; lowerRange: number; upperRange: number; default: number }[]> };
  clause?: JsonClausePredicate[];
  clauseType?: string;
  damageElement?: string;
}

interface JsonSegment {
  metadata?: { eventComponentType?: string; dataSources?: string[] };
  properties: { segmentTypes?: string[]; duration?: JsonDuration; name?: string; delayedHitLabel?: string; timeDependency?: string; timeInteractionType?: string; suppliedParameters?: Record<string, { id: string; name: string; lowerRange: number; upperRange: number; default: number }[]> };
  clause?: { conditions: JsonClauseCondition[]; effects: { verb: string; objectQualifier?: string; object: string; toDeterminer?: string; to?: string }[] }[];
  frames: JsonFrame[];
}

interface JsonSkillCategory {
  name?: string;
  description?: string;
  properties?: {
    duration?: JsonDuration;
    trigger?: unknown;
    hasDelayedHit?: boolean;
    delayedHitLabel?: string;
    enhancementTypes?: string[];
    dependencyTypes?: string[];
    suppliedParameters?: Record<string, { id: string; name: string; lowerRange: number; upperRange: number; default: number }[]>;
  };
  clause?: JsonClausePredicate[];
  frames?: JsonFrame[];
  segments?: JsonSegment[];
  dataSources?: string[];
}

// ── Element detection ───────────────────────────────────────────────────────

// ── DSL effects → target mapping ─────────────────────────────────────────────

/** Map DSL to + toDeterminer to target string. */
function dslTargetToLegacy(to?: string, toDeterminer?: string): string | undefined {
  if (to === NounType.TEAM) return 'TEAM';
  if (to === NounType.OPERATOR) {
    return toDeterminer === DeterminerType.ALL ? 'TEAM' : 'SELF';
  }
  if (to === NounType.ENEMY) return 'ENEMY';
  return undefined;
}

// ── DSL effects → legacy resource interaction bridging ──────────────────────

/** Extract a numeric value from a WITH preposition entry, optionally resolving VARY_BY with context. */
function withValue(wv?: JsonWithValue, ctx?: ValueResolutionContext): number {
  if (!wv) return 0;
  if (typeof wv.value === 'number') return wv.value;
  // ValueExpression (operation + left/right) — resolve via resolveValueNode
  if (wv.operation) {
    return resolveValueNode(wv as unknown as ValueNode, ctx ?? DEFAULT_VALUE_CONTEXT);
  }
  if (ctx && Array.isArray(wv.value) && wv.object) {
    return resolveValueNode({ verb: wv.verb, object: wv.object, value: wv.value } as ValueNode, ctx);
  }
  return wv.value?.[0] ?? 0;
}

/**
 * Find a value from a DSL effects array.
 * Maps: object→resourceType, verb→interactionType, to→target.
 * Reads value from with.value.
 */
function findEffectValue(
  effects: JsonEffect[] | undefined,
  object: string,
  verb: string,
  target?: string,
  ctx?: ValueResolutionContext,
): number | undefined {
  if (!effects) return undefined;
  for (const ef of effects) {
    if (ef.object === object && ef.verb === verb) {
      const efTarget = dslTargetToLegacy(ef.to, ef.toDeterminer);
      if (target && efTarget !== target) continue;
      return withValue(ef.with?.value, ctx);
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
  ctx?: ValueResolutionContext,
): number | undefined {
  return findEffectValue(flattenClauseEffects(category), object, verb, target, ctx);
}

/** Get all conditional gauge gains (by enemies hit) from clause effects. */
function findConditionalGaugeGains(category: JsonSkillCategory | undefined, ctx?: ValueResolutionContext): Record<number, number> {
  const byEnemies: Record<number, number> = {};
  for (const ef of flattenClauseEffects(category)) {
    if (ef.object === NounType.ULTIMATE_ENERGY && ef.verb === VerbType.RECOVER && ef.conditions?.enemiesHitThreshold) {
      byEnemies[ef.conditions.enemiesHitThreshold] = withValue(ef.with?.value, ctx);
    }
  }
  return byEnemies;
}

// ── DataDrivenSkillEventFrame ───────────────────────────────────────────────

export class DataDrivenSkillEventFrame extends SkillEventFrame {
  private readonly _offsetSeconds: number;
  private readonly _skillPointRecovery: number;
  private readonly _stagger: number;
  private readonly _damageElement: string | null;
  private readonly _duplicateTriggerSource: boolean;
  private readonly _clauses: readonly FrameClausePredicate[];
  private readonly _clauseType: string | undefined;
  private readonly _dealDamage: FrameDealDamage | null;
  private readonly _gaugeGain: number;
  private readonly _dependencyTypes: readonly string[];
  private readonly _frameTypes: readonly EventFrameType[];

  constructor(frame: JsonFrame) {
    super();
    this._offsetSeconds = frame.properties!.offset!.value;
    this._damageElement = frame.damageElement ?? null;
    let duplicateSource = false;
    const frameTypes: EventFrameType[] = [];

    let sp = 0;
    let stagger = 0;
    let gaugeGain = 0;

    // ── Clause parsing ─────────────────────────────────────────────────────
    const clauses: FrameClausePredicate[] = [];
    let dealDamage: FrameDealDamage | null = null;

    for (const pred of (frame.clause ?? [])) {
      const conditions: FrameCondition[] = (pred.conditions ?? []).map(c => {
        const isNegatedVerb = typeof c.verb === 'string' && c.verb.startsWith('NOT_');
        const normalizedVerb = isNegatedVerb ? c.verb.slice(4) : c.verb;
        return {
          ...(c.subjectDeterminer && { subjectDeterminer: c.subjectDeterminer }),
          subject: c.subject,
          verb: normalizedVerb,
          ...(((c.negated != null && c.negated) || isNegatedVerb) && { negated: true }),
          ...(c.objectQualifier && { objectQualifier: c.objectQualifier }),
          ...(c.object && { object: c.object }),
          ...(c.objectId && { objectId: c.objectId }),
          ...(c.cardinalityConstraint && { cardinalityConstraint: c.cardinalityConstraint }),
          ...(c.value != null && { value: c.value }),
          ...(c.with && { with: c.with }),
        };
      });

      const clauseEffects: FrameClauseEffect[] = [];
      for (const ef of pred.effects) {
        const wp = ef.with;
        const qualifiers = Array.isArray(ef.objectQualifier) ? ef.objectQualifier : ef.objectQualifier ? [ef.objectQualifier] : [];
        const elementQualifier = qualifiers.find(a => [AdjectiveType.HEAT, AdjectiveType.CRYO, AdjectiveType.NATURE, AdjectiveType.ELECTRIC, AdjectiveType.PHYSICAL].includes(a as AdjectiveType));
        const isSource = qualifiers.includes('TRIGGER');

        switch (ef.verb) {
          case VerbType.RECOVER:
            if (ef.object === NounType.SKILL_POINT) { sp = withValue(wp?.value); clauseEffects.push({ type: 'recoverSP' }); }
            else if (ef.object === NounType.ULTIMATE_ENERGY) gaugeGain = withValue(wp?.value);
            else if (ef.object === NounType.HP) clauseEffects.push({ type: 'dsl', dslEffect: ef as unknown as Effect });
            break;

          case VerbType.APPLY:
            if (isSource && (ef.object === NounType.INFLICTION || ef.object === NounType.STATUS)) {
              duplicateSource = true;
            } else if (ef.object === NounType.INFLICTION || ef.object === NounType.REACTION || ef.object === NounType.SUSCEPTIBILITY) {
              clauseEffects.push({ type: 'dsl', dslEffect: ef as unknown as Effect });
            } else if (ef.object === NounType.STATUS || ef.objectType === NounType.STATUS) {
              // Normalize: objectType=STATUS with object=<id> → object: STATUS, objectId: <id>
              const normalizedEffect = ef.objectType === NounType.STATUS && ef.object !== NounType.STATUS
                ? { ...ef, object: NounType.STATUS, objectId: ef.object } as unknown as Effect
                : ef as unknown as Effect;
              clauseEffects.push({ type: 'dsl', dslEffect: normalizedEffect });
            }
            break;

          case VerbType.CONSUME:
            if (ef.object === NounType.INFLICTION && ef.conversion) {
              // Absorb/exchange — no engine handler yet, skip
            } else if (ef.object === NounType.STATUS || ef.objectType === NounType.STATUS) {
              const normalizedConsumeEffect = ef.objectType === NounType.STATUS && ef.object !== NounType.STATUS
                ? { ...ef, object: NounType.STATUS, objectId: ef.object } as unknown as Effect
                : ef as unknown as Effect;
              clauseEffects.push({ type: 'dsl', dslEffect: normalizedConsumeEffect });
            } else {
              clauseEffects.push({ type: 'dsl', dslEffect: ef as unknown as Effect });
            }
            break;

          case VerbType.DEAL:
            if (ef.object === NounType.DAMAGE) {
              const multipliers = wp?.value;
              const mulArr = multipliers && Array.isArray(multipliers.value) ? multipliers.value : [];
              const dd: FrameDealDamage = {
                ...(elementQualifier && { element: elementQualifier }),
                multipliers: mulArr,
              };
              dealDamage = dd;
              clauseEffects.push({ type: 'dealDamage', dealDamage: dd });
            } else if (ef.object === NounType.STAGGER) {
              stagger = withValue(wp?.value);
              clauseEffects.push({ type: 'applyStagger' });
            }
            break;

          case VerbType.PERFORM: {
            const PERFORM_TO_FRAME_TYPE: Record<string, EventFrameType> = {
              [NounType.FINAL_STRIKE]: EventFrameType.FINAL_STRIKE,
              [NounType.FINISHER]: EventFrameType.FINISHER,
              [NounType.DIVE_ATTACK]: EventFrameType.DIVE,
            };
            const ft = PERFORM_TO_FRAME_TYPE[ef.object ?? ''];
            if (ft && !frameTypes.includes(ft)) frameTypes.push(ft);
            break;
          }
        }
      }
      clauses.push({ conditions, effects: clauseEffects });
    }

    this._clauses = clauses;
    this._clauseType = frame.clauseType;
    this._dealDamage = dealDamage;
    this._gaugeGain = gaugeGain;
    this._skillPointRecovery = sp;
    this._stagger = stagger;
    this._duplicateTriggerSource = duplicateSource;
    this._dependencyTypes = (frame.properties?.dependencyTypes ?? []) as string[];
    this._frameTypes = frameTypes;
  }

  getOffsetSeconds(): number { return this._offsetSeconds; }
  getSkillPointRecovery(): number { return this._skillPointRecovery; }
  getStagger(): number { return this._stagger; }
  getDamageElement(): string | null { return this._damageElement; }
  getDuplicateTriggerSource(): boolean { return this._duplicateTriggerSource; }
  getClauses(): readonly FrameClausePredicate[] { return this._clauses; }
  getClauseType(): string | undefined { return this._clauseType; }
  getDealDamage(): FrameDealDamage | null { return this._dealDamage; }
  getGaugeGain(): number { return this._gaugeGain; }
  getDependencyTypes(): readonly string[] { return this._dependencyTypes; }
  getFrameTypes(): readonly EventFrameType[] { return this._frameTypes; }
}

// ── DataDrivenSkillEventSequence ────────────────────────────────────────────

export class DataDrivenSkillEventSequence extends SkillEventSequence {
  private readonly _durationSeconds: number;
  private readonly _durationNode: ValueNode | null;
  private readonly _frames: readonly DataDrivenSkillEventFrame[];
  readonly segmentName?: string;
  readonly segmentTypes?: string[];
  readonly timeDependency?: string;
  readonly timeInteractionType?: string;
  readonly delayedHitLabel?: string;
  readonly clause?: { effects: { verb: string; object: string; toDeterminer?: string; to?: string }[] }[];

  constructor(segment: JsonSegment) {
    super();
    this._durationNode = segment.properties?.duration?.value ?? null;
    this._durationSeconds = resolveDur(segment.properties!.duration!);
    this._frames = segment.frames.map(f => new DataDrivenSkillEventFrame(f));
    this.segmentName = segment.properties?.name;
    this.segmentTypes = segment.properties.segmentTypes;
    if (segment.properties?.delayedHitLabel) this.delayedHitLabel = segment.properties.delayedHitLabel;
    this.timeDependency = segment.properties?.timeDependency;
    this.timeInteractionType = segment.properties?.timeInteractionType;
    this.clause = segment.clause;
  }

  getDurationSeconds(): number { return this._durationSeconds; }

  getDurationSecondsWithContext(ctx?: ValueResolutionContext): number {
    if (!ctx || !this._durationNode) return this._durationSeconds;
    return resolveValueNode(this._durationNode, ctx);
  }

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
      .filter(seg => resolveDur(seg.properties!.duration!) > 0)
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
    ? (typeof rawEntry === 'string' ? rawEntry : (rawEntry as Record<string, string>).BATK ?? skillCategoryKey)
    : skillCategoryKey;
  // Try resolved key first, fall back to raw key
  const cat = skills[resolvedKey] ?? skills[skillCategoryKey];
  if (!cat) return [];
  return buildSequencesFromSkillCategory(cat);
}

// ── Timing extraction (from operator JSON) ──────────────────────────────────

function dur(seconds: number): number { return Math.round(seconds * 120); }

/** Resolve a JsonDuration's ValueNode to seconds. */
function resolveDur(d?: JsonDuration, ctx?: ValueResolutionContext): number {
  if (!d) return 0;
  return resolveValueNode(d.value, ctx ?? DEFAULT_VALUE_CONTEXT);
}

/** Get duration from a skill category. */
function catDuration(cat?: JsonSkillCategory, ctx?: ValueResolutionContext): number {
  return resolveDur(cat?.properties?.duration, ctx);
}

/** Get animation duration from a skill category's ANIMATION segment. */
function catAnimationDur(cat?: JsonSkillCategory, ctx?: ValueResolutionContext): number {
  if (!cat?.segments) return 0;
  const animSeg = cat.segments.find(s => s.properties.segmentTypes?.includes(SegmentType.ANIMATION));
  return resolveDur(animSeg?.properties?.duration, ctx);
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

export function getSkillTimings(operatorJson: Record<string, unknown>, ctx?: ValueResolutionContext): SkillTimings {
  const skills = (operatorJson.skills ?? {}) as Record<string, JsonSkillCategory>;
  const typeMap = operatorJson.skillTypeMap as Record<string, string> | undefined;

  // Battle skill duration
  const battleSkill = skills[typeMap?.BATTLE_SKILL ?? 'BATTLE_SKILL'];
  const battleDur = dur(catDuration(battleSkill, ctx));

  // Combo skill
  const comboSkill = skills[typeMap?.COMBO_SKILL ?? 'COMBO_SKILL'];
  // Duration: prefer top-level property, fall back to sum of non-cooldown segments
  const comboTopDur = catDuration(comboSkill, ctx);
  const comboDur = dur(comboTopDur || ((comboSkill?.segments as JsonSegment[] | undefined)
    ?.filter(s => !s.properties.segmentTypes?.includes(SegmentType.COOLDOWN))
    .reduce((sum, s) => sum + resolveDur(s.properties?.duration, ctx), 0) ?? 0));
  const comboCdFromClause = findValue(comboSkill, NounType.COOLDOWN, VerbType.CONSUME, undefined, ctx);
  const comboCdSeg = (comboSkill?.segments as JsonSegment[] | undefined)
    ?.find(s => s.properties.segmentTypes?.includes(SegmentType.COOLDOWN));
  const comboCdFromSegment = comboCdSeg?.properties?.duration
    ? resolveDur(comboCdSeg.properties.duration, ctx)
    : undefined;
  const comboCd = dur(comboCdFromClause ?? comboCdFromSegment ?? 0);
  const comboAnimDur = dur(catAnimationDur(comboSkill, ctx) || 0.5);

  // Ultimate — read from flat properties or derive from typed segments
  const ultimate = skills[typeMap?.ULTIMATE ?? 'ULTIMATE'];
  const ultSegs = (ultimate?.segments as JsonSegment[] | undefined)?.filter(
    s => s.properties.segmentTypes?.length,
  );
  let ultTotalDur: number;
  let ultAnimDur: number;
  let ultCdFrames: number;
  let ultActiveDurFromSegs: number | undefined;
  if (ultSegs?.length) {
    // Data-driven: derive timings from typed segments
    const segDur = (type: string) => {
      const s = ultSegs.find(seg => seg.properties.segmentTypes?.includes(type));
      return s ? dur(resolveDur(s.properties?.duration, ctx)) : 0;
    };
    ultAnimDur = segDur(SegmentType.ANIMATION);
    ultTotalDur = ultAnimDur + segDur(SegmentType.STASIS);
    ultCdFrames = segDur(SegmentType.COOLDOWN);
    ultActiveDurFromSegs = segDur(SegmentType.ACTIVE);
  } else {
    ultTotalDur = dur(catDuration(ultimate, ctx));
    const ultAnimRaw = catAnimationDur(ultimate, ctx);
    ultAnimDur = ultAnimRaw > 0 ? dur(ultAnimRaw) : ultTotalDur;
    const ultCdRaw = findValue(ultimate, NounType.COOLDOWN, VerbType.CONSUME, undefined, ctx);
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

export function getUltimateEnergyCost(operatorJson: Record<string, unknown>, ctx?: ValueResolutionContext): number {
  const skills = operatorJson.skills as Record<string, JsonSkillCategory>;
  const typeMap = operatorJson.skillTypeMap as Record<string, string> | undefined;
  const ultimate = skills?.[typeMap?.ULTIMATE ?? 'ULTIMATE'];
  return findValue(ultimate, NounType.ULTIMATE_ENERGY, VerbType.CONSUME, undefined, ctx) ?? 0;
}

export interface SkillGaugeGains {
  battleGaugeGain: number;
  battleTeamGaugeGain: number;
  comboGaugeGain: number;
  comboTeamGaugeGain: number;
  comboGaugeGainByEnemies?: Record<number, number>;
}

export function getSkillGaugeGains(operatorJson: Record<string, unknown>, ctx?: ValueResolutionContext): SkillGaugeGains {
  const skills = operatorJson.skills as Record<string, JsonSkillCategory>;
  const typeMap = operatorJson.skillTypeMap as Record<string, string> | undefined;
  const result: SkillGaugeGains = { battleGaugeGain: 0, battleTeamGaugeGain: 0, comboGaugeGain: 0, comboTeamGaugeGain: 0 };

  // Battle skill gauge gains
  const battleSkillId = typeMap?.BATTLE_SKILL ?? 'BATTLE_SKILL';
  const bs = skills?.[battleSkillId];
  if (bs?.clause) {
    result.battleGaugeGain = findValue(bs, NounType.ULTIMATE_ENERGY, VerbType.RECOVER, 'SELF', ctx) ?? 0;
    result.battleTeamGaugeGain = findValue(bs, NounType.ULTIMATE_ENERGY, VerbType.RECOVER, 'TEAM', ctx) ?? 0;
  }

  // Combo skill gauge gains
  const comboSkillId = typeMap?.COMBO_SKILL ?? 'COMBO_SKILL';
  const cs = skills?.[comboSkillId];
  if (cs?.clause) {
    const byEnemies = findConditionalGaugeGains(cs, ctx);
    if (Object.keys(byEnemies).length > 0) {
      result.comboGaugeGainByEnemies = byEnemies;
      result.comboGaugeGain = byEnemies[1] ?? 0;
    } else {
      result.comboGaugeGain = findValue(cs, NounType.ULTIMATE_ENERGY, VerbType.RECOVER, 'SELF', ctx) ?? 0;
    }
    result.comboTeamGaugeGain = findValue(cs, NounType.ULTIMATE_ENERGY, VerbType.RECOVER, 'TEAM', ctx) ?? 0;
  }

  return result;
}

/** Extract the SP cost for battle skill from merged operator JSON (skills keyed by skill ID). */
export function getBattleSkillSpCost(operatorJson: Record<string, unknown>, ctx?: ValueResolutionContext): number {
  const skills = operatorJson.skills as Record<string, JsonSkillCategory> | undefined;
  const typeMap = operatorJson.skillTypeMap as Record<string, string> | undefined;
  const battleSkillId = typeMap?.BATTLE_SKILL ?? 'BATTLE_SKILL';
  return findValue(skills?.[battleSkillId], NounType.SKILL_POINT, VerbType.CONSUME, undefined, ctx) ?? 0;
}

// ── Per-skill-category data extraction (raw seconds, for event files) ────────

export interface SkillCategoryData {
  duration: number;
  spCost: number;
  gaugeGain: number;
  cooldown: number;
  energyCost: number;
}

/**
 * Extract raw timing/cost data for a given skill category from operator JSON.
 * Falls back to BATTLE_SKILL effects for variants that share the same SP cost.
 */
export function getSkillCategoryData(
  operatorJson: Record<string, unknown>,
  skillCategory: string,
  ctx?: ValueResolutionContext,
): SkillCategoryData {
  const skills = operatorJson.skills as Record<string, JsonSkillCategory>;
  const typeMap = operatorJson.skillTypeMap as Record<string, string> | undefined;
  const cat = skills?.[skillCategory];
  const baseBattle = skills?.[typeMap?.BATTLE_SKILL ?? 'BATTLE_SKILL'];

  return {
    duration: catDuration(cat, ctx),
    spCost: findValue(cat, NounType.SKILL_POINT, VerbType.CONSUME, undefined, ctx)
         ?? findValue(baseBattle, NounType.SKILL_POINT, VerbType.CONSUME, undefined, ctx)
         ?? 0,
    gaugeGain: findValue(cat, NounType.ULTIMATE_ENERGY, VerbType.RECOVER, 'SELF', ctx)
            ?? findValue(baseBattle, NounType.ULTIMATE_ENERGY, VerbType.RECOVER, 'SELF', ctx)
            ?? 0,
    cooldown: findValue(cat, NounType.COOLDOWN, VerbType.CONSUME, undefined, ctx) ?? 0,
    energyCost: findValue(cat, NounType.ULTIMATE_ENERGY, VerbType.CONSUME, undefined, ctx) ?? 0,
  };
}

/**
 * Get the durations of basic attack segments from operator JSON.
 * Returns an array of duration values in seconds.
 */
export function getBasicAttackDurations(operatorJson: Record<string, unknown>, ctx?: ValueResolutionContext): number[] {
  const skills = operatorJson.skills as Record<string, JsonSkillCategory>;
  const typeMap = operatorJson.skillTypeMap as Record<string, string> | undefined;
  const basicEntry = typeMap?.BASIC_ATTACK as string | Record<string, string> | undefined;
  const basicId = typeof basicEntry === 'string' ? basicEntry : (basicEntry as Record<string, string> | undefined)?.BATK ?? 'BASIC_ATTACK';
  const basicAttack = skills?.[basicId];
  if (!basicAttack?.segments) return [];
  return basicAttack.segments.map(seg => resolveDur(seg.properties!.duration!, ctx));
}
