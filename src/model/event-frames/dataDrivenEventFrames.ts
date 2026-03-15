import { ElementType, StatusType, TargetType } from "../../consts/enums";
import {
  SkillEventFrame,
  FrameArtsInfliction,
  FrameArtsAbsorption,
  FrameArtsConsumption,
  FrameForcedReaction,
  FrameApplyStatus,
  FrameReactionConsumption,
} from "./skillEventFrame";
import { SkillEventSequence } from "./skillEventSequence";

// ── JSON types (matching operator JSON DSL structure) ────────────────────────

interface JsonDuration {
  value: number;
  unit: string;
}

/** WITH preposition value: a cardinality with verb determining value shape. */
interface JsonWithValue {
  verb: string; // "IS" | "DEPENDS_ON"
  object?: string;
  value: number | number[];
}

/** DSL Effect: Verb-Object with optional adjective and prepositional phrases. */
interface JsonEffect {
  verbType: string;
  objectType?: string;
  objectId?: string;
  adjective?: string | string[];
  toObjectType?: string;
  fromObjectType?: string;
  onObjectType?: string;
  /** WITH preposition — properties/cardinalities (duration, stacks, multiplier, etc.). */
  withPreposition?: Record<string, JsonWithValue>;
  /** Constraint on cardinality (for compound PERFORM_ALL grouping). */
  cardinalityConstraint?: string;
  /** Cardinality for compound constraints. */
  cardinality?: number;
  eventName?: string;
  susceptibility?: Record<string, number[]>;
  conversion?: { objectType: string; objectId?: string };
  conditions?: { enemiesHitThreshold: number };
  /** Nested effects for compound verbs like PERFORM_ALL. */
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

interface JsonFrame {
  metadata?: { eventComponentType?: string; dataSources?: string[] };
  properties?: { offset?: JsonDuration };
  effects?: JsonEffect[];
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

/** Map DSL toObjectType to legacy target string. */
function dslTargetToLegacy(toObjectType?: string): string | undefined {
  switch (toObjectType) {
    case 'THIS_OPERATOR': return 'SELF';
    case 'ALL_OPERATORS': return 'TEAM';
    case 'ENEMY': return 'ENEMY';
    default: return undefined;
  }
}

/** Map DSL toObjectType to TargetType enum. */
function dslTargetToTargetType(toObjectType?: string): TargetType {
  switch (toObjectType) {
    case 'ENEMY': return TargetType.ENEMY;
    case 'ALL_OPERATORS': return TargetType.TEAM;
    default: return TargetType.SELF;
  }
}

// ── DSL effects → legacy resource interaction bridging ──────────────────────

/** Extract a numeric value from a WITH preposition entry. Returns the IS value or first DEPENDS_ON value. */
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

/** Recursively flatten compound effects (PERFORM_ALL, etc.) into a flat list of leaf effects. */
function flattenEffects(effects: JsonEffect[]): JsonEffect[] {
  const result: JsonEffect[] = [];
  for (const ef of effects) {
    if (ef.effects && (ef.verbType === 'PERFORM_ALL' || ef.verbType === 'PERFORM_ANY')) {
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
  private readonly _applyStatus: FrameApplyStatus | null;
  private readonly _consumeStatus: string | null;
  private readonly _damageElement: string | null;
  private readonly _consumeReaction: FrameReactionConsumption | null;
  private readonly _duplicatesSourceInfliction: boolean;

  constructor(frame: JsonFrame) {
    super();
    const offset = frame.properties?.offset ?? frame.offset;
    this._offsetSeconds = offset!.value;
    this._damageElement = frame.damageElement ?? null;
    this._consumeReaction = null;
    let duplicatesSource = frame.duplicatesSourceInfliction ?? false; // legacy compat

    let sp = 0;
    let stagger = 0;
    let applyInfliction: FrameArtsInfliction | null = null;
    let absorbInfliction: FrameArtsAbsorption | null = null;
    let consumeInfliction: FrameArtsConsumption | null = null;
    let forcedReaction: FrameForcedReaction | null = null;
    let applyStatus: FrameApplyStatus | null = null;
    let consumeStatus: string | null = null;
    let consumeReaction: FrameReactionConsumption | null = null;

    if (frame.effects) {
      // ── DSL effects path ──────────────────────────────────────────────
      // Flatten compound effects (PERFORM_ALL) so nested ABSORB/APPLY/etc. are processed
      const flatEffects = flattenEffects(frame.effects);
      for (const ef of flatEffects) {
        const wp = ef.withPreposition;
        const adjectives = Array.isArray(ef.adjective) ? ef.adjective : ef.adjective ? [ef.adjective] : [];
        const elementAdj = adjectives.find(a => ['HEAT', 'CRYO', 'NATURE', 'ELECTRIC', 'PHYSICAL'].includes(a));
        const isForced = adjectives.includes('FORCED');
        const isSource = adjectives.includes('SOURCE');
        const reactionAdj = adjectives.find(a => ['COMBUSTION', 'SOLIDIFICATION', 'CORROSION', 'ELECTRIFICATION'].includes(a));

        switch (ef.verbType) {
          case 'RECOVER':
            if (ef.objectType === 'SKILL_POINT') sp = withValue(wp?.cardinality);
            if (ef.objectType === 'STAGGER') stagger = withValue(wp?.cardinality);
            break;

          case 'APPLY':
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
              const isStandardTarget = ['THIS_OPERATOR', 'ENEMY', 'ALL_OPERATORS'].includes(ef.toObjectType ?? '');
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
              applyStatus = status;
            }
            break;

          case 'ABSORB':
            if (ef.objectType === 'INFLICTION') {
              absorbInfliction = {
                element: elementAdj!,
                stacks: withValue(wp?.stacks) || 1,
                exchangeStatus: (ef.conversion?.objectId as StatusType) ?? StatusType.MELTING_FLAME,
                ratio: '1:1',
              };
            }
            break;

          case 'CONSUME':
            if (ef.objectType === 'INFLICTION') {
              consumeInfliction = { element: elementAdj!, stacks: withValue(wp?.stacks) || 1 };
            } else if (ef.objectType === 'STATUS') {
              consumeStatus = ef.objectId!;
            } else if (ef.objectType === 'REACTION') {
              // CONSUME REACTION with optional applyOnConsume
              const cr: FrameReactionConsumption = {
                columnId: (reactionAdj ?? ef.objectId ?? '').toLowerCase(),
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

    this._skillPointRecovery = sp;
    this._stagger = stagger;
    this._applyArtsInfliction = applyInfliction;
    this._absorbArtsInfliction = absorbInfliction;
    this._consumeArtsInfliction = consumeInfliction;
    this._applyForcedReaction = forcedReaction;
    this._applyStatus = applyStatus;
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
  getApplyStatus(): FrameApplyStatus | null { return this._applyStatus; }
  getConsumeReaction(): FrameReactionConsumption | null { return this._consumeReaction; }
  getConsumeStatus(): string | null { return this._consumeStatus; }
  getDamageElement(): string | null { return this._damageElement; }
  getDuplicatesSourceInfliction(): boolean { return this._duplicatesSourceInfliction; }
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

// ── Override merging ────────────────────────────────────────────────────────

function mergeSkillOverride(base: JsonSkillCategory, override: Record<string, unknown>): JsonSkillCategory {
  const merged = { ...base };

  // Override arrays replace entirely
  if (override.frames) merged.frames = override.frames as JsonFrame[];
  if (override.segments) merged.segments = override.segments as JsonSegment[];

  // Override properties (new structure)
  if (override.properties) {
    const overrideProps = override.properties as Record<string, unknown>;
    merged.properties = { ...merged.properties } as any;
    if (overrideProps.duration) merged.properties!.duration = overrideProps.duration as JsonDuration;
    if (overrideProps.animation) merged.properties!.animation = overrideProps.animation as any;
  }

  // Legacy override objects (compat)
  if (override.duration) merged.duration = override.duration as JsonDuration;
  if (override.animation) merged.animation = override.animation as any;
  if (override.effects) merged.effects = override.effects as JsonEffect[];

  return merged;
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
 * Build sequences for a given skill category from an operator JSON, applying overrides.
 */
export function buildSequencesFromOperatorJson(
  operatorJson: Record<string, any>,
  skillCategoryKey: string,
): readonly DataDrivenSkillEventSequence[] {
  const skills = operatorJson.skills as Record<string, JsonSkillCategory> | undefined;
  if (!skills?.[skillCategoryKey]) return [];

  let category = skills[skillCategoryKey];

  // Apply overrides if present
  const overrides = operatorJson.skillOverrides as Record<string, Record<string, unknown>> | undefined;
  if (overrides?.[skillCategoryKey]) {
    category = mergeSkillOverride(category, overrides[skillCategoryKey]);
  }

  return buildSequencesFromSkillCategory(category);
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
  const overrides = operatorJson.skillOverrides as Record<string, Record<string, unknown>> | undefined;

  // Battle skill duration
  let battleSkill = skills.BATTLE_SKILL;
  if (overrides?.BATTLE_SKILL) battleSkill = mergeSkillOverride(battleSkill, overrides.BATTLE_SKILL);
  const battleDur = dur(catDuration(battleSkill));

  // Combo skill
  let comboSkill = skills.COMBO_SKILL;
  if (overrides?.COMBO_SKILL) comboSkill = mergeSkillOverride(comboSkill, overrides.COMBO_SKILL);
  const comboDur = dur(catDuration(comboSkill));
  const comboCd = dur(findValue(comboSkill, 'COOLDOWN', 'EXPEND') ?? 0);
  const comboAnim = catAnimation(comboSkill);
  const comboAnimDur = dur(comboAnim?.duration?.value ?? 0.5);

  // Ultimate
  let ultimate = skills.ULTIMATE;
  if (overrides?.ULTIMATE) ultimate = mergeSkillOverride(ultimate, overrides.ULTIMATE);
  const ultTotalDur = dur(catDuration(ultimate));
  const ultAnim = catAnimation(ultimate);
  const ultAnimDur = ultAnim?.duration?.value != null
    ? dur(ultAnim.duration.value)
    : ultTotalDur;
  const ultCdRaw = findValue(ultimate, 'COOLDOWN', 'EXPEND');

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
  const ultimate = skills?.ULTIMATE;
  return findValue(ultimate, 'ULTIMATE_ENERGY', 'EXPEND') ?? 0;
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
  const result: SkillGaugeGains = { battleGaugeGain: 0, battleTeamGaugeGain: 0, comboGaugeGain: 0, comboTeamGaugeGain: 0 };

  // Battle skill gauge gains
  const bs = skills?.BATTLE_SKILL;
  if (bs?.effects) {
    result.battleGaugeGain = findValue(bs, 'ULTIMATE_ENERGY', 'RECOVER', 'SELF') ?? 0;
    result.battleTeamGaugeGain = findValue(bs, 'ULTIMATE_ENERGY', 'RECOVER', 'TEAM') ?? 0;
  }

  // Combo skill gauge gains
  const cs = skills?.COMBO_SKILL;
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

/** Extract the SP cost for battle skill from operator JSON. */
export function getBattleSkillSpCost(operatorJson: Record<string, any>): number {
  const skills = operatorJson.skills as Record<string, JsonSkillCategory>;
  return findValue(skills?.BATTLE_SKILL, 'SKILL_POINT', 'EXPEND') ?? 0;
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
  const cat = skills?.[skillCategory];
  const baseBattle = skills?.BATTLE_SKILL;

  return {
    duration: catDuration(cat),
    spCost: findValue(cat, 'SKILL_POINT', 'EXPEND')
         ?? findValue(baseBattle, 'SKILL_POINT', 'EXPEND')
         ?? 0,
    gaugeGain: findValue(cat, 'ULTIMATE_ENERGY', 'RECOVER', 'SELF')
            ?? findValue(baseBattle, 'ULTIMATE_ENERGY', 'RECOVER', 'SELF')
            ?? 0,
    cooldown: findValue(cat, 'COOLDOWN', 'EXPEND') ?? 0,
    animationTime: catAnimation(cat)?.duration?.value ?? 0,
    energyCost: findValue(cat, 'ULTIMATE_ENERGY', 'EXPEND') ?? 0,
  };
}

/**
 * Get the durations of basic attack segments from operator JSON.
 * Returns an array of duration values in seconds.
 */
export function getBasicAttackDurations(operatorJson: Record<string, any>): number[] {
  const skills = operatorJson.skills as Record<string, JsonSkillCategory>;
  const basicAttack = skills?.BASIC_ATTACK;
  if (!basicAttack?.segments) return [];
  return basicAttack.segments.map(seg => (seg.properties?.duration ?? seg.duration)!.value);
}
