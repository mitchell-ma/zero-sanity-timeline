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

/** DSL Effect: Verb-Object with optional Preposition-PrepositionalObject. */
interface JsonEffect {
  verbType: string;
  objectType: string;
  objectId?: string;
  prepositionType?: string;
  toObjectType?: string;
  cardinality?: number;
  cardinalityConstraint?: string;
  stacks?: number;
  isForced?: boolean;
  element?: string;
  durationSeconds?: number;
  eventName?: string;
  susceptibility?: Record<string, number[]>;
  conversion?: { objectType: string; objectId?: string };
  conditions?: { enemiesHitThreshold: number };
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
  eventComponentType: string;
  offset: JsonDuration;
  effects?: JsonEffect[];
  damageElement?: string;
  duplicatesSourceInfliction?: boolean;
  dataSources?: string[];
}

interface JsonSegment {
  eventComponentType: string;
  name?: string;
  duration: JsonDuration;
  frames: JsonFrame[];
  animation?: { duration: JsonDuration; timeInteractionType: string };
  dataSources?: string[];
}

interface JsonSkillCategory {
  name?: string;
  description?: string;
  duration?: JsonDuration;
  effects?: JsonEffect[];
  animation?: { duration: JsonDuration; timeInteractionType: string };
  frames?: JsonFrame[];
  segments?: JsonSegment[];
  dataSources?: string[];
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

/**
 * Find a value from a DSL effects array.
 * Maps: objectType→resourceType, verbType→interactionType, toObjectType→target.
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
      return ef.cardinality;
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
        byEnemies[ef.conditions.enemiesHitThreshold] = ef.cardinality ?? 0;
      }
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
  private readonly _applyStatus: FrameApplyStatus | null;
  private readonly _consumeStatus: string | null;
  private readonly _damageElement: string | null;
  private readonly _consumeReaction: FrameReactionConsumption | null;
  private readonly _duplicatesSourceInfliction: boolean;

  constructor(frame: JsonFrame) {
    super();
    this._offsetSeconds = frame.offset.value;
    this._damageElement = frame.damageElement ?? null;
    this._consumeReaction = null;
    this._duplicatesSourceInfliction = frame.duplicatesSourceInfliction ?? false;

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
      for (const ef of frame.effects) {
        switch (ef.verbType) {
          case 'RECOVER':
            if (ef.objectType === 'SKILL_POINT') sp = ef.cardinality ?? 0;
            if (ef.objectType === 'STAGGER') stagger = ef.cardinality ?? 0;
            break;

          case 'APPLY':
            if (ef.objectType === 'INFLICTION') {
              applyInfliction = { element: ef.element!, stacks: ef.stacks ?? 1 };
            } else if (ef.objectType === 'FORCED_REACTION') {
              forcedReaction = {
                reaction: (ef.objectId ?? ef.element!) as StatusType,
                statusLevel: ef.cardinality ?? 1,
                ...(ef.durationSeconds != null && { durationFrames: Math.round(ef.durationSeconds * 120) }),
              };
            } else if (ef.objectType === 'STATUS') {
              const status: FrameApplyStatus = {
                target: dslTargetToTargetType(ef.toObjectType),
                status: ef.objectId!,
                stacks: ef.stacks ?? 1,
                durationFrames: ef.durationSeconds != null ? Math.round(ef.durationSeconds * 120) : 0,
              };
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
                element: ef.element!,
                stacks: ef.stacks ?? 1,
                exchangeStatus: (ef.conversion?.objectId as StatusType) ?? StatusType.MELTING_FLAME,
                ratio: '1:1',
              };
            }
            break;

          case 'CONSUME':
            if (ef.objectType === 'INFLICTION') {
              consumeInfliction = { element: ef.element!, stacks: ef.stacks ?? 1 };
            } else if (ef.objectType === 'STATUS') {
              consumeStatus = ef.objectId!;
            } else if (ef.objectType === 'REACTION') {
              // CONSUME REACTION with optional applyOnConsume
              const cr: FrameReactionConsumption = {
                columnId: (ef.objectId ?? '').toLowerCase(),
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
    this._durationSeconds = segment.duration.value;
    this._frames = segment.frames.map(f => new DataDrivenSkillEventFrame(f));
    this.segmentName = segment.name;
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

  // Override objects merge
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
      .filter(seg => seg.duration.value > 0)
      .map(seg => new DataDrivenSkillEventSequence(seg));
  }

  // Flat shape: wrap duration + frames into a single segment
  if (skillCategory.duration && skillCategory.frames) {
    const segment: JsonSegment = {
      eventComponentType: 'SEGMENT',
      duration: skillCategory.duration,
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
  const skills = operatorJson.skills as Record<string, JsonSkillCategory>;
  const overrides = operatorJson.skillOverrides as Record<string, Record<string, unknown>> | undefined;

  // Battle skill duration
  let battleSkill = skills.BATTLE_SKILL;
  if (overrides?.BATTLE_SKILL) battleSkill = mergeSkillOverride(battleSkill, overrides.BATTLE_SKILL);
  const battleDur = dur(battleSkill?.duration?.value ?? 0);

  // Combo skill
  let comboSkill = skills.COMBO_SKILL;
  if (overrides?.COMBO_SKILL) comboSkill = mergeSkillOverride(comboSkill, overrides.COMBO_SKILL);
  const comboDur = dur(comboSkill?.duration?.value ?? 0);
  const comboCd = dur(findValue(comboSkill, 'COOLDOWN', 'EXPEND') ?? 0);
  const comboAnimDur = dur(comboSkill?.animation?.duration?.value ?? 0.5);

  // Ultimate
  let ultimate = skills.ULTIMATE;
  if (overrides?.ULTIMATE) ultimate = mergeSkillOverride(ultimate, overrides.ULTIMATE);
  const ultTotalDur = dur(ultimate?.duration?.value ?? 0);
  const ultAnimDur = ultimate?.animation?.duration?.value != null
    ? dur(ultimate.animation.duration.value)
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
    duration: cat?.duration?.value ?? 0,
    spCost: findValue(cat, 'SKILL_POINT', 'EXPEND')
         ?? findValue(baseBattle, 'SKILL_POINT', 'EXPEND')
         ?? 0,
    gaugeGain: findValue(cat, 'ULTIMATE_ENERGY', 'RECOVER', 'SELF')
            ?? findValue(baseBattle, 'ULTIMATE_ENERGY', 'RECOVER', 'SELF')
            ?? 0,
    cooldown: findValue(cat, 'COOLDOWN', 'EXPEND') ?? 0,
    animationTime: cat?.animation?.duration?.value ?? 0,
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
  return basicAttack.segments.map(seg => seg.duration.value);
}
