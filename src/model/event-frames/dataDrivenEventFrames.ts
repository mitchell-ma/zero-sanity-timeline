import { EventFrameType, SegmentType } from "../../consts/enums";
import { NounType, VerbType, DeterminerType } from "../../dsl/semantics";
import type { Effect, ValueNode } from "../../dsl/semantics";
import { resolveValueNode, DEFAULT_VALUE_CONTEXT, type ValueResolutionContext } from "../../controller/calculation/valueResolver";
import { parseJsonClauseArray, findFirstEffectValue } from "../../controller/timeline/clauseQueries";
import {
  SkillEventFrame,
  FrameClausePredicate,
  FrameClauseEffect,
  FrameCondition,
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
  of?: { determiner?: string; object: string };
}

/** DSL Effect: Verb-Object with optional object qualifier and prepositional phrases. */
interface JsonEffect {
  verb: string;
  object?: string;
  objectId?: string;
  objectType?: string;
  objectQualifier?: string;
  objectDeterminer?: string;
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
  of?: import('../../dsl/semantics').OfClause;
}

interface JsonOffset {
  value: number;
  unit: string;
}

interface JsonFrame {
  metadata?: { eventComponentType?: string; dataSources?: string[] };
  properties?: { offset?: JsonOffset; element?: string; dependencyTypes?: string[]; suppliedParameters?: Record<string, { id: string; name: string; lowerRange: number; upperRange: number; default: number }[]> };
  clause?: JsonClausePredicate[];
  clauseType?: string;
  frameTypes?: string[];
  damageElement?: string;
}

interface JsonSegment {
  metadata?: { eventComponentType?: string; dataSources?: string[] };
  properties: { segmentTypes?: string[]; duration?: JsonDuration; name?: string; element?: string; delayedHitLabel?: string; timeDependency?: string; timeInteractionType?: string; suppliedParameters?: Record<string, { id: string; name: string; lowerRange: number; upperRange: number; default: number }[]> };
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

// ── Skill-level clause queries ──────────────────────────────────────────
//
// Loader-time scalar metadata queries (cooldowns, SP costs, energy costs)
// use the same clause-walking API as runtime frame consumers. Raw JSON
// clause predicates are wrapped into `FrameClausePredicate[]` via
// `parseJsonClauseArray` and queried via `findFirstEffectValue`. This
// replaces the previous local `flattenClauseEffects` / `findEffectValue` /
// `withValue` helpers that walked raw JSON directly — one query API now.

/** Find a value from a skill category's parsed clause effects. */
function findSkillValue(
  category: JsonSkillCategory | undefined,
  object: string,
  verb: string,
  target?: string,
  ctx?: ValueResolutionContext,
): number | undefined {
  if (!category?.clause) return undefined;
  const parsed = parseJsonClauseArray(category.clause);
  return findFirstEffectValue(parsed, verb, object, target, ctx);
}

// ── DataDrivenSkillEventFrame ───────────────────────────────────────────────

export class DataDrivenSkillEventFrame extends SkillEventFrame {
  private readonly _offsetSeconds: number;
  private readonly _damageElement: string | null;
  private readonly _duplicateTriggerSource: boolean;
  private readonly _clauses: readonly FrameClausePredicate[];
  private readonly _clauseType: string | undefined;
  private readonly _dependencyTypes: readonly string[];
  private readonly _frameTypes: readonly EventFrameType[];
  private readonly _suppliedParameters?: Record<string, { id: string; name: string; lowerRange: number; upperRange: number; default: number }[]>;

  constructor(frame: JsonFrame) {
    super();
    this._offsetSeconds = frame.properties!.offset!.value;
    this._damageElement = frame.properties?.element ?? frame.damageElement ?? null;
    if (frame.properties?.suppliedParameters) this._suppliedParameters = frame.properties.suppliedParameters;
    let duplicateSource = false;
    const frameTypes: EventFrameType[] = [];


    // ── Clause parsing ─────────────────────────────────────────────────────
    const clauses: FrameClausePredicate[] = [];

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
          ...(c.of && { of: c.of }),
        };
      });

      const clauseEffects: FrameClauseEffect[] = [];
      for (const ef of pred.effects) {
        const isSource = ef.objectDeterminer === DeterminerType.TRIGGER;

        switch (ef.verb) {
          case VerbType.RECOVER:
          case VerbType.RETURN:
            if (ef.object === NounType.SKILL_POINT) { clauseEffects.push({ type: 'dsl', dslEffect: ef as unknown as Effect }); }
            else if (ef.object === NounType.ULTIMATE_ENERGY) {
              // Push as DSL clause so interpret() → doRecover routes UE through
              // the single DEC.recordUltimateEnergyGain ingress.
              clauseEffects.push({ type: 'dsl', dslEffect: ef as unknown as Effect });
            }
            else if (ef.object === NounType.HP) clauseEffects.push({ type: 'dsl', dslEffect: ef as unknown as Effect });
            break;

          case VerbType.APPLY:
            if (isSource && (ef.object === NounType.INFLICTION || ef.object === NounType.STATUS)) {
              duplicateSource = true;
            } else if (ef.object === NounType.INFLICTION || ef.object === NounType.SUSCEPTIBILITY) {
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
            if (ef.object === NounType.DAMAGE || ef.object === NounType.STAGGER) {
              clauseEffects.push({ type: 'dsl', dslEffect: ef as unknown as Effect });
            }
            break;

          case VerbType.REDUCE:
            // REDUCE COOLDOWN (and any other REDUCE effects) — pass through to interpret() at frame time
            clauseEffects.push({ type: 'dsl', dslEffect: ef as unknown as Effect });
            break;

          case VerbType.PERFORM: {
            const PERFORM_TO_FRAME_TYPE: Record<string, EventFrameType> = {
              [NounType.FINAL_STRIKE]: EventFrameType.FINAL_STRIKE,
              [NounType.FINISHER]: EventFrameType.FINISHER,
              [NounType.DIVE]: EventFrameType.DIVE,
            };
            const skillKey = ef.object === NounType.SKILL ? (ef.objectId ?? '') : (ef.object ?? '');
            const ft = PERFORM_TO_FRAME_TYPE[skillKey];
            if (ft && !frameTypes.includes(ft)) frameTypes.push(ft);
            break;
          }
        }
      }
      clauses.push({ conditions, effects: clauseEffects });
    }

    this._clauses = clauses;
    this._clauseType = frame.clauseType;
    this._duplicateTriggerSource = duplicateSource;
    this._dependencyTypes = (frame.properties?.dependencyTypes ?? []) as string[];
    // Merge explicit frameTypes from JSON (e.g. "frameTypes": ["DIVE"]) with clause-derived ones
    if (frame.frameTypes) {
      for (const ft of frame.frameTypes as EventFrameType[]) {
        if (!frameTypes.includes(ft)) frameTypes.push(ft);
      }
    }
    this._frameTypes = frameTypes;
  }

  getOffsetSeconds(): number { return this._offsetSeconds; }
  getDamageElement(): string | null { return this._damageElement; }
  getDuplicateTriggerSource(): boolean { return this._duplicateTriggerSource; }
  getClauses(): readonly FrameClausePredicate[] { return this._clauses; }
  getClauseType(): string | undefined { return this._clauseType; }
  getDependencyTypes(): readonly string[] { return this._dependencyTypes; }
  getFrameTypes(): readonly EventFrameType[] { return this._frameTypes; }
  getSuppliedParameters(): Record<string, { id: string; name: string; lowerRange: number; upperRange: number; default: number }[]> | undefined { return this._suppliedParameters; }
}

// ── DataDrivenSkillEventSequence ────────────────────────────────────────────

export class DataDrivenSkillEventSequence extends SkillEventSequence {
  private readonly _durationSeconds: number;
  private readonly _durationNode: ValueNode | null;
  private readonly _frames: readonly DataDrivenSkillEventFrame[];
  readonly segmentName?: string;
  readonly segmentElement?: string;
  readonly segmentTypes?: string[];
  readonly timeDependency?: string;
  readonly timeInteractionType?: string;
  readonly delayedHitLabel?: string;
  readonly suppliedParameters?: Record<string, { id: string; name: string; lowerRange: number; upperRange: number; default: number }[]>;
  readonly clause?: { effects: { verb: string; object: string; toDeterminer?: string; to?: string }[] }[];

  constructor(segment: JsonSegment) {
    super();
    this._durationNode = segment.properties?.duration?.value ?? null;
    this._durationSeconds = resolveDur(segment.properties!.duration!);
    this._frames = segment.frames.map(f => new DataDrivenSkillEventFrame(f));
    this.segmentName = segment.properties?.name;
    this.segmentElement = segment.properties?.element;
    this.segmentTypes = segment.properties.segmentTypes;
    if (segment.properties?.delayedHitLabel) this.delayedHitLabel = segment.properties.delayedHitLabel;
    this.timeDependency = segment.properties?.timeDependency;
    this.timeInteractionType = segment.properties?.timeInteractionType;
    if (segment.properties?.suppliedParameters) this.suppliedParameters = segment.properties.suppliedParameters;
    this.clause = segment.clause;
  }

  getDurationSeconds(): number { return this._durationSeconds; }

  /** True if the duration depends on runtime event state (e.g. STACKS of LINK of EVENT). */
  hasRuntimeConditionalDuration(): boolean {
    if (!this._durationNode || typeof this._durationNode !== 'object') return false;
    // Recursively check if any node in the expression references EVENT stacks
    const check = (n: unknown): boolean => {
      if (!n || typeof n !== 'object') return false;
      const obj = n as Record<string, unknown>;
      if (obj.object === 'STACKS' && (obj.of as Record<string, unknown>)?.object === 'EVENT') return true;
      return check(obj.left) || check(obj.right);
    };
    return check(this._durationNode);
  }

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
      .filter(seg => {
        const dur = seg.properties!.duration!;
        // Preserve segments with runtime-conditional durations (e.g. STACKS of LINK of EVENT)
        // even if they resolve to 0 at build time — they are re-resolved during queue processing.
        const seq = new DataDrivenSkillEventSequence(seg);
        if (seq.hasRuntimeConditionalDuration()) return true;
        return resolveDur(dur) > 0;
      })
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
  // Skills are aliased by category/sub-type key in buildMergedOperatorJson — direct access
  const cat = skills[skillCategoryKey];
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

  // Battle skill duration
  const battleSkill = skills[NounType.BATTLE];
  const battleDur = dur(catDuration(battleSkill, ctx));

  // Combo skill
  const comboSkill = skills[NounType.COMBO];
  // Duration: prefer top-level property, fall back to sum of non-cooldown segments
  const comboTopDur = catDuration(comboSkill, ctx);
  const comboDur = dur(comboTopDur || ((comboSkill?.segments as JsonSegment[] | undefined)
    ?.filter(s => !s.properties.segmentTypes?.includes(SegmentType.COOLDOWN))
    .reduce((sum, s) => sum + resolveDur(s.properties?.duration, ctx), 0) ?? 0));
  const comboCdFromClause = findSkillValue(comboSkill, NounType.COOLDOWN, VerbType.CONSUME, undefined, ctx);
  const comboCdSeg = (comboSkill?.segments as JsonSegment[] | undefined)
    ?.find(s => s.properties.segmentTypes?.includes(SegmentType.COOLDOWN));
  const comboCdFromSegment = comboCdSeg?.properties?.duration
    ? resolveDur(comboCdSeg.properties.duration, ctx)
    : undefined;
  const comboCd = dur(comboCdFromClause ?? comboCdFromSegment ?? 0);
  const comboAnimDur = dur(catAnimationDur(comboSkill, ctx) || 0.5);

  // Ultimate — read from flat properties or derive from typed segments
  const ultimate = skills[NounType.ULTIMATE];
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
    const ultCdRaw = findSkillValue(ultimate, NounType.COOLDOWN, VerbType.CONSUME, undefined, ctx);
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
  const ultimate = skills?.[NounType.ULTIMATE];
  return findSkillValue(ultimate, NounType.ULTIMATE_ENERGY, VerbType.CONSUME, undefined, ctx) ?? 0;
}

/** Extract the SP cost for battle skill from merged operator JSON (skills keyed by skill ID). */
export function getBattleSkillSpCost(operatorJson: Record<string, unknown>, ctx?: ValueResolutionContext): number {
  const skills = operatorJson.skills as Record<string, JsonSkillCategory> | undefined;
  const battleSkillId = NounType.BATTLE;
  return findSkillValue(skills?.[battleSkillId], NounType.SKILL_POINT, VerbType.CONSUME, undefined, ctx) ?? 0;
}

/**
 * Get the durations of basic attack segments from operator JSON.
 * Returns an array of duration values in seconds.
 */
export function getBasicAttackDurations(operatorJson: Record<string, unknown>, ctx?: ValueResolutionContext): number[] {
  const skills = operatorJson.skills as Record<string, JsonSkillCategory>;
  // BATK is aliased to skills[BATK] by buildMergedOperatorJson; also try BASIC_ATTACK key
  const basicAttack = skills?.[NounType.BATK] ?? skills?.[NounType.BASIC_ATTACK];
  if (!basicAttack?.segments) return [];
  return basicAttack.segments.map(seg => resolveDur(seg.properties!.duration!, ctx));
}
