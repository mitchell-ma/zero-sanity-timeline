/**
 * EventInterpretor — DSL interpreter and queue frame processor.
 *
 * Owns a DerivedEventController and provides two interfaces:
 * 1. DSL Effect interpretation (interpret/interpretEffects)
 * 2. QueueFrame processing (processQueueFrame)
 *
 * Both route through DerivedEventController domain methods.
 */
import {
  Effect,
  VerbType,
  NounType,
  DeterminerType,
  AdjectiveType,
  ObjectType,
  VERB_OBJECTS,
  THRESHOLD_MAX,
  ClauseEvaluationType,
  isQualifiedId,
  isValueExpression,
  isValueVariable,
} from '../../dsl/semantics';
import type { Interaction, ValueNode, ValueExpression } from '../../dsl/semantics';
import { resolveValueNode, DEFAULT_VALUE_CONTEXT, buildContextForSkillColumn } from '../calculation/valueResolver';
import { computeFrameMarkerDamage, computeReactionFrameDamage, getSkillLevelForColumn } from '../calculation/calculationController';
import { DEFAULT_LOADOUT_PROPERTIES } from '../../view/InformationPane';
import { isDamageSegment } from '../calculation/jsonMultiplierEngine';
import type { Potential } from '../../consts/types';
import type { ValueResolutionContext } from '../calculation/valueResolver';
import { STAT_TO_STATE_ADJECTIVE } from './statStateMap';
import { TimelineEvent, eventDuration, setEventDuration, EventSegmentData, EventFrameMarker } from '../../consts/viewTypes';
import { CritMode, DamageScalingStatType, DamageType, ElementType, EventFrameType, EventStatusType, InteractionModeType, PERMANENT_DURATION, PhysicalStatusType, SegmentType, StackInteractionType, StatType, StatusType, UnitType } from '../../consts/enums';
import { resolveEffectStat } from '../../model/enums/stats';
import type { OverrideStore } from '../../consts/overrideTypes';
import type { StatSource } from './derivedEventController';
import type { EventSource, AddOptions } from './columns/eventColumn';
import { t } from '../../locales/locale';
import { resolveEventLabel } from './eventPresentationController';
import { buildOverrideKey } from '../overrideController';
import {
  BREACH_DURATION, ENEMY_ID, ENEMY_ACTION_COLUMN_ID,
  INFLICTION_COLUMN_IDS, INFLICTION_DURATION,
  PHYSICAL_INFLICTION_COLUMNS, PHYSICAL_INFLICTION_DURATION, PHYSICAL_STATUS_COLUMNS, PHYSICAL_STATUS_COLUMN_IDS,
  REACTION_COLUMNS, REACTION_COLUMN_IDS, REACTION_DURATION,
  FORCED_REACTION_COLUMN, FORCED_REACTION_DURATION,
  SHATTER_DURATION, SKILL_COLUMN_ORDER,
} from '../../model/channels';
import { FPS, TOTAL_FRAMES } from '../../utils/timeline';
import { getOperatorStatuses, getStatusById } from '../gameDataStore';
import { getOperatorBase } from '../../model/game-data/operatorsStore';
import { getOperatorSkill } from '../../model/game-data/operatorSkillsStore';
import { getAllStatusLabels } from '../gameDataStore';
import { TEAM_ID } from '../slot/commonSlotController';
import { evaluateConditions } from './conditionEvaluator';
import { hasDealDamageClause, findDealDamageInClauses, buildDealDamageClause, parseJsonClauseArray, shouldFireChance, hasChanceClause } from './clauseQueries';
import { getRuntimeCritMode } from '../combatStateController';
import { getStatusConfig, getStatusDef } from './configCache';
import { resolveColumnId as resolveEffectColumnId, PHYSICAL_STATUS_VALUES, INFLICTION_COLUMN_TO_ELEMENT } from './columnResolution';
import { collectNoGainWindowsForEvent } from './ultimateEnergyController';
import type { ConditionContext } from './conditionEvaluator';
import { getPhysicalStatusBaseMultiplier, getShatterBaseMultiplier } from '../../model/calculation/damageFormulas';
import type { StatusLevel } from '../../consts/types';
import type { SlotTriggerWiring } from './eventQueueTypes';
import { findClauseTriggerMatches } from './triggerMatch';
import type { Predicate } from './triggerMatch';
import { derivedEventUid } from './inputEventController';
import { extendByTimeStops } from './processTimeStop';
import { activeEventsAtFrame, countActiveStatusStacks } from './timelineQueries';
import { getComboTriggerClause, getComboTriggerInfo } from '../gameDataStore';
import { QueueFrameType, FrameHookType } from './eventQueueTypes';
import { allocQueueFrame } from './objectPool';
import type { EngineTriggerContext, DeriveContext, StatusEventDef } from './eventQueueTypes';
import type { TriggerIndex, TriggerDefEntry } from './triggerIndex';
import { STATE_TO_COLUMN } from './triggerIndex';
import { DerivedEventController } from './derivedEventController';
import type { QueueFrame } from './eventQueueTypes';
import type { LoadoutProperties } from '../../view/InformationPane';
import type { FrameClausePredicate, FrameClauseEffect } from '../../model/event-frames/skillEventFrame';

const STATUS_LABELS: Record<string, string> = getAllStatusLabels();
const SKILL_COLUMN_SET: ReadonlySet<string> = new Set(SKILL_COLUMN_ORDER);


// ── Clause filtering ──────────────────────────────────────────────────────

/**
 * Filter a clause array based on clauseType and condition results.
 *
 * - ALL (default): returns every clause whose conditions pass.
 * - FIRST_MATCH: returns the first conditional clause that passes + all
 *   unconditional clauses. Subsequent conditional clauses are skipped
 *   once a conditional match is found.
 *
 * @param clauses       The ordered clause predicates on the frame.
 * @param clauseType    'FIRST_MATCH' or 'ALL' (default).
 * @param evalConditions  Returns true if the clause's conditions pass.
 */
export function filterClauses(
  clauses: readonly FrameClausePredicate[],
  clauseType: string | undefined,
  evalConditions: (pred: FrameClausePredicate) => boolean,
): readonly FrameClausePredicate[] {
  const isFirstMatch = clauseType === ClauseEvaluationType.FIRST_MATCH;
  let conditionalMatched = false;
  const result: FrameClausePredicate[] = [];
  for (const pred of clauses) {
    if (pred.conditions.length > 0) {
      if (isFirstMatch && conditionalMatched) continue;
      if (!evalConditions(pred)) continue;
      if (isFirstMatch) conditionalMatched = true;
    }
    result.push(pred);
  }
  return result;
}

// ── Column resolution ─────────────────────────────────────────────────────
// Unified in `./columnResolution.ts` — see imports above. Both single
// (`resolveColumnId` → `resolveEffectColumnId` alias) and the physical
// status value set (`PHYSICAL_STATUS_VALUES`) come from there, along with
// the shared `ELEMENT_TO_INFLICTION_COLUMN` constant.

/**
 * Event-presence verbs: conditions with these verbs are fully validated by the
 * index lookup in checkReactiveTriggers and don't need re-evaluation in
 * handleEngineTrigger. State-transition verbs (BECOME, HAVE, IS) always need
 * evaluation because the index only signals "something changed on this column",
 * not whether the transition/state meets the condition's constraints.
 */
const EVENT_PRESENCE_VERBS = new Set<VerbType>([
  VerbType.PERFORM, VerbType.APPLY, VerbType.CONSUME,
  VerbType.DEAL, VerbType.HIT, VerbType.DEFEAT,
  VerbType.RECEIVE, VerbType.RECOVER,
]);

/**
 * Find the condition in an entry's conditions array that matches the
 * verb:objectId key used by checkReactiveTriggers. Returns the first
 * observable condition whose verb matches the lookup verb.
 */
function findMatchedCondition(conditions: Predicate[], verb: string, _objectId: string): Predicate | undefined {
  return conditions.find(c => {
    if (c.verb === verb) return true;
    // BECOME conditions are remapped to APPLY keys during indexing,
    // so an APPLY lookup may match a BECOME condition.
    if (verb === VerbType.APPLY && c.verb === VerbType.BECOME) return true;
    // Negated BECOME/IS are indexed under BECOME_NOT/IS_NOT keys,
    // so a BECOME_NOT lookup matches a negated BECOME condition.
    if (verb === `${VerbType.BECOME}_NOT` && c.verb === VerbType.BECOME && c.negated) return true;
    if (verb === `${VerbType.IS}_NOT` && c.verb === VerbType.IS && c.negated) return true;
    // Negated column-based BECOME conditions are indexed under IS_NOT:<col>
    // (event-end fires IS_NOT, not BECOME_NOT, for column-based states).
    if (verb === `${VerbType.IS}_NOT` && c.verb === VerbType.BECOME && c.negated) return true;
    return false;
  });
}

/** Identity pass-through retained so call sites keep reading
 *  `resolveQualifier(effect.objectQualifier)` without an import churn. */
function resolveQualifier(objectQualifier?: AdjectiveType | NounType) {
  return objectQualifier;
}

// ── Lift constants ──────────────────────────────────────────────────────────

/** Duration of Lift / Knock Down status in frames (1 second at 120fps). */
const LIFT_KNOCK_DOWN_DURATION = 1 * FPS;

/** Lift / Knock Down damage multiplier (120% ATK). */
const LIFT_KNOCK_DOWN_DAMAGE_MULTIPLIER = 1.2;

// STAT_TO_STATE_ADJECTIVE now lives in `./statStateMap.ts` as the single
// source of truth for the bidirectional stat↔state-adjective mapping.

/**
 * Verbs that bypass the standard `verb → object` validation in
 * `validateVerbObject`. **Despite the name this is NOT a "verb does
 * nothing" set** — it's a "skip the standard object-allowlist check"
 * set. `DEAL` and `RESET` mutate via `doDeal` / `doReset` but their
 * objects (DAMAGE, STAGGER, STACKS, etc.) don't sit cleanly in the
 * `VERB_OBJECTS` schema; the no-op verbs (`HIT`, `DEFEAT`, `PERFORM`,
 * `IGNORE`) appear here because they have no allowlist either.
 *
 * REFRESH / OVERHEAL / EXPERIENCE / MERGE were dropped: they have zero
 * occurrences in the current JSON corpus, so the validation skip is
 * dead. Add them back if a future JSON adds them as effect verbs.
 */
const SKIP_VERB_OBJECT_VALIDATION = new Set<string>([
  VerbType.DEAL, VerbType.RESET,
  VerbType.HIT, VerbType.DEFEAT, VerbType.PERFORM, VerbType.IGNORE,
]);

function validateVerbObject(verb: VerbType, object?: string) {
  if (verb === VerbType.ALL || verb === VerbType.ANY) return true;
  if (SKIP_VERB_OBJECT_VALIDATION.has(verb)) return true;
  const validObjects = VERB_OBJECTS[verb];
  if (!validObjects) return true;
  if (!object) {
    console.warn(`[EventInterpretor] ${verb} missing object`);
    return false;
  }
  if (!validObjects.includes(object as ObjectType)) {
    console.warn(`[EventInterpretor] Invalid verb+object: ${verb} ${object}. Valid: ${validObjects.join(', ')}`);
    return false;
  }
  return true;
}

function resolveCardinality(cardinality: ValueNode | typeof THRESHOLD_MAX | undefined, _potential: number, defaultMax = 999) {
  if (cardinality === THRESHOLD_MAX) return defaultMax;
  if (cardinality != null && typeof cardinality === 'object') {
    return resolveValueNode(cardinality, DEFAULT_VALUE_CONTEXT) ?? defaultMax;
  }
  return defaultMax;
}

// Status config / def caches live in `./configCache.ts` (imported above).

// ── InterpretContext ─────────────────────────────────────────────────────

/** Context for interpreting DSL effects. */
export interface InterpretContext {
  frame: number;
  /** Operator ID for event attribution (e.g. "POGRANICHNIK"). */
  sourceEntityId: string;
  /**
   * Override slot for THIS OPERATOR resolution. When set, `resolveEntityId(THIS)`
   * uses this slot instead of deriving one from `sourceEntityId`. Needed when the
   * context slot differs from the source operator — e.g. engine triggers for
   * CONTROLLED-applied statuses where `sourceEntityId` is Xaihi but THIS OPERATOR
   * is the controlled operator's slot.
   */
  contextSlotId?: string;
  sourceSkillName: string;
  potential?: number;
  /** Talent level of the parent status def (resolved via resolveTalentLevel).
   *  Passed to buildValueContext so VARY_BY TALENT_LEVEL resolves to the correct
   *  talent slot's level (e.g. talentTwoLevel for talent-two statuses). */
  talentLevel?: number;
  parentEventEndFrame?: number;
  parentSegmentEndFrame?: number;
  targetEntityId?: string;
  /** Status ID of the parent status def when processing ENGINE_TRIGGER effects.
   *  Used by CONSUME THIS EVENT to identify which status to consume. */
  parentStatusId?: string;
  /** UID of the source event — passed to column add() so derived events can be matched back to their raw event. */
  sourceEventUid?: string;
  /**
   * Column ID of the source event. Used by doApply to guard uid propagation:
   * only reuse `sourceEventUid` for child events on the SAME column as the
   * source (i.e. the freeform event's visible form), never for cross-column
   * side effects (e.g. IE → NATURE infliction) where uid reuse would collide.
   */
  sourceEventColumnId?: string;
  /**
   * Interaction mode the source event was created in (e.g. FREEFORM). Propagated
   * onto child events created by doApply so freeform status events retain the
   * flag for view-layer drag/edit handler lookup.
   */
  sourceCreationInteractionMode?: InteractionModeType;
  /** Source damage frame key ("eventUid:si:fi") for intra-frame ordering.
   *  Propagated to status events so the damage builder can exclude same-frame provenance. */
  sourceFrameKey?: string;
  /** User-supplied parameter values (e.g. { ENEMY_HIT: 2 }) for VARY_BY resolution in value nodes. */
  suppliedParameters?: Record<string, number>;
  /** Number of stacks consumed by the triggering CONSUME effect (for STACKS CONSUMED resolution). */
  consumedStacks?: number;
  /**
   * Slot ID of the operator whose action matched the onTriggerClause that
   * spawned this interpret flow. Threaded through to (a) the condition
   * evaluator via DeterminerType.TRIGGER lookups and (b) any status events
   * spawned via APPLY EVENT / APPLY STATUS inside the trigger flow, so the
   * spawned event's own clauses can later read it.
   */
  triggerEntityId?: string;
  /** Pre-resolved CHANCE pin for the current frame (from override store).
   *  Set by handleProcessFrame before clause dispatch so doChance reads it
   *  directly — same pattern as isCrit. */
  chancePin?: boolean;
  /**
   * Raw source event reference (the TimelineEvent whose frame produced this
   * clause dispatch). Passed so doApply can copy runtime-user-edited fields
   * (e.g. `susceptibility` on qualified-susceptibility / FOCUS wrappers)
   * onto the applied child event — fields the static DSL clause can't carry.
   * Only set for clause dispatches originating from a freeform wrapper's
   * PROCESS_FRAME; undefined otherwise.
   */
  sourceEvent?: TimelineEvent;
  /** When true, doApply's APPLY STAT branch skips pushStatSource + reversal
   *  scheduling — the caller manages its own source attribution and replace-
   *  semantics reversal (e.g. lifecycle clause path). Prevents double-counting. */
  skipStatSourceAttribution?: boolean;
}

// ══════════════════════════════════════════════════════════════════════════

export interface InterpretorOptions {
  loadoutProperties?: Record<string, LoadoutProperties>;
  slotOperatorMap?: Record<string, string>;
  slotWirings?: SlotTriggerWiring[];
  getEnemyHpPercentage?: (frame: number) => number | null;
  getControlledSlotAtFrame?: (frame: number) => string;
  triggerIndex?: TriggerIndex;
  critMode?: CritMode;
  overrides?: OverrideStore;
  /**
   * Per-slot static operator data for inline enemy damage computation during
   * handleProcessFrame. Undefined → skip the inline damage tick push (tests
   * with no damage tracking).
   */
  damageOpCache?: ReadonlyMap<string, import('../calculation/calculationController').DamageOpData>;
  /** Enemy defense multiplier for the simplified damage formula. */
  enemyDefMult?: number;
  /** Model enemy for reaction damage computation (resistance, defense). */
  modelEnemy?: import('../../model/enemies/enemy').Enemy;
}

// ── Stat source helpers ─────────────────────────────────────────────────────

/** Build a StatSource with sub-component breakdown from a clause effect's with.value. */
function buildStatSource(
  label: string,
  totalValue: number,
  rawEffect: Record<string, unknown>,
  ctx: InterpretContext,
): StatSource {
  const source: StatSource = { label, value: totalValue };
  const withBlock = rawEffect.with as { value?: unknown } | undefined;
  const valueNode = withBlock?.value as Record<string, unknown> | undefined;
  if (valueNode && isValueExpression(valueNode as unknown as ValueNode)) {
    const expr = valueNode as unknown as ValueExpression;
    const valueCtx = buildValueCtxForSource(ctx);
    const leftVal = resolveValueNode(expr.left, valueCtx);
    const rightVal = resolveValueNode(expr.right, valueCtx);
    const subSources: StatSource[] = [];
    if (leftVal !== 0) subSources.push({ label: resolveVaryByLabel(expr.left, ctx), value: leftVal });
    if (rightVal !== 0) subSources.push({ label: resolveVaryByLabel(expr.right, ctx), value: rightVal });
    if (subSources.length > 0) source.subSources = subSources;
  }
  return source;
}

function buildValueCtxForSource(ctx: InterpretContext) {
  return {
    ...DEFAULT_VALUE_CONTEXT,
    potential: ctx.potential ?? 0,
  };
}

function resolveVaryByLabel(node: ValueNode, ctx: InterpretContext): string {
  if (node && typeof node === 'object' && 'object' in node) {
    const obj = (node as unknown as Record<string, unknown>).object as string | undefined;
    if (obj === NounType.SKILL_LEVEL) return t(`breakdown.varyBy.${NounType.SKILL_LEVEL}`);
    if (obj === NounType.POTENTIAL) return t(`breakdown.varyBy.${NounType.POTENTIAL}`, { level: ctx.potential ?? 0 });
    if (obj === NounType.TALENT_LEVEL) return t(`breakdown.varyBy.${NounType.TALENT_LEVEL}`);
    return obj ?? 'Value';
  }
  return 'Value';
}

// ── Clause effect resolution ────────────────────────────────────────────────
// Moved from statusTriggerCollector — resolves susceptibility/statusValue from
// a status def's clause array onto a timeline event.

/** Shape of a with-value block inside a clause effect (IS or VARY_BY). */
interface ClauseWithValue {
  verb: string;
  object?: string | string[];
  value: number | number[] | Record<string, unknown>;
}

/** Effect shape inside clause arrays: supports objectQualifier + with block. */
interface ClauseEffectEntry {
  verb: string;
  object: string;
  objectId?: string;
  objectQualifier?: string;
  with?: { value: ClauseWithValue };
}

/** A clause with conditions and clause-style effects. */
interface ResolvedClause {
  conditions: Predicate[];
  effects: ClauseEffectEntry[];
}

/**
 * Resolve the talent level for a status def, based on which talent slot it belongs to.
 */
function resolveTalentLevel(def: StatusEventDef, ctx: DeriveContext): number {
  const props = ctx.loadoutProperties?.operator;
  if (!props) return 0;
  const op = getOperatorBase(ctx.operatorId);
  if (!op) return props.talentOneLevel;
  const talentOneId = op.talents.one?.id;
  const talentTwoId = op.talents.two?.id;
  const defId = def.properties.id;
  const originId = def.metadata?.originId;
  if (defId === talentTwoId || originId === talentTwoId) return props.talentTwoLevel;
  if (defId === talentOneId || originId === talentOneId) return props.talentOneLevel;
  return props.talentOneLevel;
}

/**
 * Bake VARY_BY TALENT_LEVEL / POTENTIAL nodes on DEAL STAGGER effects into IS
 * literals within a cloned segment list. `StaggerController.sync` reads these
 * clauses with a default (empty) ValueResolutionContext, so an unresolved
 * VARY_BY silently collapses to index 0 (→ 0 stagger). Talent events created
 * via APPLY EVENT (e.g. Chen's Momentum Breaker) run through here so their
 * talent-scaled stagger actually lands on the enemy stagger meter.
 */
function bakeStaggerVaryByOnSegments(
  segments: EventSegmentData[],
  talentLevel: number,
  potential: number,
): EventSegmentData[] {
  return segments.map((seg): EventSegmentData => {
    if (!seg.frames || seg.frames.length === 0) return seg;
    let segModified = false;
    const newFrames = seg.frames.map((f): EventFrameMarker => {
      if (!f.clauses || f.clauses.length === 0) return f;
      let frameModified = false;
      const newClauses = f.clauses.map((clause): FrameClausePredicate => {
        if (!clause.effects) return clause;
        let clauseModified = false;
        const newEffects = clause.effects.map((eff): FrameClauseEffect => {
          const dsl = eff.dslEffect;
          if (!dsl || dsl.verb !== VerbType.DEAL || dsl.object !== NounType.STAGGER) return eff;
          const v = (dsl.with as { value?: ValueNode } | undefined)?.value;
          if (!v || !isValueVariable(v) || !Array.isArray(v.value)) return eff;
          let index: number | undefined;
          if (v.object === NounType.TALENT_LEVEL) index = talentLevel;
          else if (v.object === NounType.POTENTIAL) index = potential;
          if (index == null) return eff;
          const clamped = Math.max(0, Math.min(index, v.value.length - 1));
          const resolved = v.value[clamped] ?? 0;
          clauseModified = true;
          return {
            ...eff,
            dslEffect: {
              ...dsl,
              with: { ...dsl.with, value: { verb: VerbType.IS, value: resolved } },
            },
          };
        });
        if (clauseModified) { frameModified = true; return { ...clause, effects: newEffects }; }
        return clause;
      });
      if (frameModified) { segModified = true; return { ...f, clauses: newClauses }; }
      return f;
    });
    return segModified ? { ...seg, frames: newFrames } : seg;
  });
}

/**
 * Resolve a dimension key for a multi-dimensional VARY_BY lookup.
 * Finds the highest key whose numeric value ≤ the actual context value.
 */
function resolveClauseDimensionKey(
  dim: string,
  ctx: DeriveContext,
  def: StatusEventDef,
  keys: string[],
): string | undefined {
  if (dim === 'POTENTIAL') {
    let best: string | undefined;
    let bestN = -1;
    for (const k of keys) {
      const m = k.match(/^P(\d+)$/);
      if (!m) continue;
      const n = Number(m[1]);
      if (n <= ctx.potential && n > bestN) { bestN = n; best = k; }
    }
    return best;
  }
  if (dim === 'TALENT_LEVEL' || dim === 'INTELLECT') {
    const talentLevel = resolveTalentLevel(def, ctx);
    let best: string | undefined;
    let bestN = 0;
    for (const k of keys) {
      const n = Number(k);
      if (!isNaN(n) && n <= talentLevel && n > bestN) { bestN = n; best = k; }
    }
    return best;
  }
  if (dim === NounType.SKILL_LEVEL) {
    const sl = ctx.loadoutProperties?.skills.battleSkillLevel ?? 12;
    let best: string | undefined;
    let bestN = 0;
    for (const k of keys) {
      const n = Number(k);
      if (!isNaN(n) && n <= sl && n > bestN) { bestN = n; best = k; }
    }
    return best;
  }
  return undefined;
}

function resolveClauseEffectsFromClauses(
  ev: TimelineEvent,
  clauses: ResolvedClause[],
  ctx: DeriveContext,
  def: StatusEventDef,
  skipConditional = true,
): void {
  for (const clause of clauses) {
    if (clause.conditions && clause.conditions.length > 0) {
      if (skipConditional) {
        const hasThisEvent = clause.conditions.some((c: Predicate) => c.subject === NounType.EVENT);
        if (hasThisEvent) continue;

        const condCtx: ConditionContext = {
          events: ctx.events,
          frame: ev.startFrame,
          sourceEntityId: ctx.operatorSlotId,
        };
        if (!evaluateConditions(clause.conditions as unknown as Interaction[], condCtx)) continue;
      } else {
        continue;
      }
    }
    if (!clause.effects) continue;

    for (const effect of clause.effects) {
      const verb = effect.verb;
      const objectId = effect.objectId;
      const objectQualifier = effect.objectQualifier;
      const withBlock = effect.with;
      const wp = withBlock?.value;
      if (!wp) continue;

      const resolveValue = (): number | undefined => {
        if (wp.verb === VerbType.IS && typeof wp.value === 'number') return wp.value;
        if (wp.verb !== VerbType.VARY_BY) return undefined;

        const dims = wp.object;
        const val = wp.value;

        // Single dimension: object is a string, value is a flat array
        if (typeof dims === 'string' && Array.isArray(val)) {
          const arr = val as number[];
          if (dims === NounType.SKILL_LEVEL) {
            const skillLevel = ctx.loadoutProperties?.skills.battleSkillLevel ?? 12;
            return arr[Math.min(skillLevel, arr.length) - 1] ?? arr[0];
          }
          if (dims === NounType.TALENT_LEVEL || dims === StatType.INTELLECT) {
            const talentLevel = resolveTalentLevel(def, ctx);
            return arr[Math.min(talentLevel, arr.length) - 1] ?? arr[0];
          }
          return undefined;
        }

        // Multi-dimension: object is an array, value is a nested map
        if (Array.isArray(dims) && typeof val === 'object' && !Array.isArray(val)) {
          let current: unknown = val;
          for (const dim of dims as string[]) {
            if (typeof current !== 'object' || current === null) return undefined;
            const currentObj = current as Record<string, unknown>;
            const keys = Object.keys(currentObj);
            const key = resolveClauseDimensionKey(dim, ctx, def, keys);
            if (!key) return undefined;
            current = currentObj[key];
          }
          return typeof current === 'number' ? current : undefined;
        }

        return undefined;
      };

      if (verb === VerbType.APPLY && objectId === NounType.SUSCEPTIBILITY && objectQualifier) {
        const val = resolveValue();
        if (val != null) {
          if (!ev.susceptibility) ev.susceptibility = {};
          (ev.susceptibility as Record<string, number>)[objectQualifier] = val;
        }
      }

      if (verb === VerbType.APPLY && objectId === NounType.DAMAGE_BONUS) {
        const val = resolveValue();
        if (val != null) ev.statusValue = val;
      }
    }
  }
}

function resolveClauseEffects(ev: TimelineEvent, def: StatusEventDef, ctx: DeriveContext): void {
  const clauses = def.clause as ResolvedClause[] | undefined;
  if (!clauses) return;
  resolveClauseEffectsFromClauses(ev, clauses, ctx, def);
}

export class EventInterpretorController {
  controller!: DerivedEventController;
  private loadoutProperties?: Record<string, LoadoutProperties>;
  private slotOperatorMap?: Record<string, string>;
  private slotWirings?: SlotTriggerWiring[];
  private getEnemyHpPercentage?: (frame: number) => number | null;
  private getControlledSlotAtFrame?: (frame: number) => string;
  private triggerIndex?: TriggerIndex;
  /** Pending stat reversals: negative deltas scheduled at status expiry frames. */
  _statReversals?: { frame: number; entityId: string; stat: import('../../consts/enums').StatType; value: number; lifecycleKey?: string }[];
  /** Replace-semantics stat totals for lifecycle clause effects, keyed by `statusId:entityId`. */
  private _lifecycleStatTotals?: Map<string, Record<string, number>>;
  /** Temporary frame-scoped stat reversals (reversed immediately after snapshot). */
  private _frameStatReversals?: { stat: import('../../consts/enums').StatType; value: number }[];
  private critMode?: CritMode;
  private overrides?: OverrideStore;
  private damageOpCache?: ReadonlyMap<string, import('../calculation/calculationController').DamageOpData>;
  private enemyDefMult = 1;
  private modelEnemy?: import('../../model/enemies/enemy').Enemy;
  /** One-shot HP threshold triggers that have already fired this pipeline run. */
  private firedHpThresholds = new Set<string>();
  /** Pending STATUS_EXIT queue frames to be flushed into the queue. */
  private pendingExitFrames: QueueFrame[] = [];
  /** Usage counter for triggers with usageLimit (e.g. tacticals, gear sets). Key: "defId:slotId". */
  private triggerUsageCount = new Map<string, number>();

  // ── Cached allEvents (avoids per-call array spread) ──────────────────────

  // ── Reusable output arrays (avoids per-call allocation) ─────────────────
  private _processFrameOut: QueueFrame[] = [];
  private _engineTriggerOut: QueueFrame[] = [];
  private _statTriggerOut: QueueFrame[] = [];
  /** Cascade frames produced by reactive triggers inside ALL compound iterations. */
  private _compoundCascadeFrames: QueueFrame[] = [];

  /** Resolve slot ID → operator ID. Returns the operator ID if mapped, or the input unchanged. */
  private slotToEntityId(slotId: string): string {
    return this.slotOperatorMap?.[slotId] ?? slotId;
  }

  /** Reverse-lookup: operator ID → slot ID. Returns the input unchanged if no mapping found. */
  private resolveSlotId(entityId: string): string {
    if (!this.slotOperatorMap) return entityId;
    // Fast path: if entityId is already a slot key, return it directly
    if (entityId in this.slotOperatorMap) return entityId;
    for (const [slotId, opId] of Object.entries(this.slotOperatorMap)) {
      if (opId === entityId) return slotId;
    }
    return entityId;
  }

  /** Resolve the context slot for THIS OPERATOR resolution from an InterpretContext. */
  private ctxSlot(ctx: InterpretContext): string {
    return ctx.contextSlotId ?? this.resolveSlotId(ctx.sourceEntityId);
  }

  /**
   * Wrap `controller.applyEvent` to auto-inject causal parents from the
   * current interpret context. Every derived event created during interpret()
   * has the currently-interpreting event (`ctx.sourceEventUid`) as its
   * immediate parent in the causality DAG — used by DeterminerType.TRIGGER
   * and SOURCE resolution in Phase 3.
   *
   * Caller-supplied `options.parents` wins (for multi-parent cases like
   * cross-element reactions, which compute their own parent list).
   */
  private applyEventFromCtx(
    ctx: InterpretContext,
    columnId: string, ownerEntityId: string, frame: number,
    durationFrames: number, source: EventSource,
    options?: AddOptions,
  ): boolean {
    const ctxParents = ctx.sourceEventUid ? [ctx.sourceEventUid] : undefined;
    return this.controller.applyEvent(columnId, ownerEntityId, frame, durationFrames, source, {
      ...options,
      parents: options?.parents ?? ctxParents,
    });
  }

  /**
   * Resolve a routed source for a derived event whose ownerEntityId is a target
   * (e.g. enemy) but whose effects must dispatch to the source operator's slot.
   * Returns { sourceSlotId, sourceEntityId }.
   *
   * For events owned by a slot, ownerEntityId IS the slot and entity ID is resolved
   * from slotOperatorMap. For events owned by enemy/common, sourceEntityId
   * traces back to the originating operator and resolveSlotId maps it to a slot.
   */
  private resolveRoutedSource(event: TimelineEvent): { sourceSlotId: string; sourceEntityId: string } {
    if (this.slotOperatorMap?.[event.ownerEntityId]) {
      return {
        sourceSlotId: event.ownerEntityId,
        sourceEntityId: this.slotToEntityId(event.ownerEntityId),
      };
    }
    const entityId = event.sourceEntityId ?? event.ownerEntityId;
    return {
      sourceSlotId: this.resolveSlotId(entityId),
      sourceEntityId: entityId,
    };
  }

  /**
   * Unified clause dispatcher for synthetic-frame queue hooks. Callers build
   * the interpret + condition contexts appropriate for the hook type and
   * pass them in; this helper owns the filter + dispatch + reactive trigger
   * fan-out logic so per-hook call sites in `handleProcessFrame`,
   * `runStatusCreationLifecycle`, and friends share one code path.
   *
   * The logic mirrors the original handleProcessFrame dispatch loop —
   * filterClauses, then for each accepted predicate iterate effects,
   * special-case frame-scoped `APPLY STAT` for reversal tracking, skip
   * reactive triggers for operator-emitted `DEAL DAMAGE` (see the deferred
   * hack noted in the plan), and otherwise interpret + fan out.
   *
   * Returns the list of clause effects that actually executed, for
   * callers that need to track e.g. `frameSkipped` state. When every
   * conditional clause failed to match, the returned array is empty AND
   * there were no unconditional effects to run.
   */
  private dispatchClauseFrame(
    clauses: readonly FrameClausePredicate[] | undefined,
    clauseType: string | undefined,
    interpretCtx: InterpretContext,
    condCtx: ConditionContext,
    eventEntityId: string,
    eventId: string,
    out: QueueFrame[],
    options: {
      /** ON_FRAME fires reactive triggers per effect; skill-lifecycle hooks don't. */
      fireReactiveTriggers: boolean;
      /** ON_FRAME tracks APPLY STAT deltas for per-frame reversal; other hooks don't. */
      trackStatReversals: boolean;
    },
  ): { executedCount: number; anyMatched: boolean; acceptedClauses: readonly FrameClausePredicate[] } {
    if (!clauses || clauses.length === 0) {
      return { executedCount: 0, anyMatched: false, acceptedClauses: [] };
    }
    // Fast path: when no clause has conditions, skip filterClauses entirely.
    // The hasConditionalClauses flag is pre-computed at parse time on DataDrivenSkillEventFrame.
    const hasConditional = clauses.some(p => p.conditions.length > 0);
    const accepted = hasConditional
      ? filterClauses(clauses, clauseType, pred =>
        evaluateConditions(pred.conditions as unknown as import('../../dsl/semantics').Interaction[], condCtx),
      )
      : clauses;
    let executedCount = 0;
    for (const pred of accepted) {
      for (const ef of pred.effects) {
        if (!ef.dslEffect) continue;
        const dsl = ef.dslEffect;

        // Frame-scoped APPLY STAT — track deltas so they reverse after
        // the snapshot pass. Only enabled for the ON_FRAME hook; skill
        // lifecycle / status / trigger hooks let stats persist.
        if (options.trackStatReversals
            && dsl.verb === VerbType.APPLY && dsl.object === NounType.STAT
            && dsl.objectId && this.controller.hasStatAccumulator()) {
          const statKey = resolveEffectStat(NounType.STAT, dsl.objectId, dsl.objectQualifier);
          if (statKey) {
            const before = this.controller.getStat(eventEntityId, statKey);
            this.interpret(dsl, interpretCtx);
            const after = this.controller.getStat(eventEntityId, statKey);
            const diff = after - before;
            if (diff !== 0) {
              if (!this._frameStatReversals) this._frameStatReversals = [];
              this._frameStatReversals.push({ stat: statKey, value: -diff });
            }
            if (options.fireReactiveTriggers) {
              this.reactiveTriggersForEffect(dsl, interpretCtx.frame, eventEntityId, eventId, out, this.lastConsumedStacks);
            }
            this.lastConsumedStacks = undefined;
            executedCount++;
            continue;
          }
        }

        this.interpret(dsl, interpretCtx);
        if (options.fireReactiveTriggers) {
          // Subject-based filtering now happens inside checkReactiveTriggers
          // (ENEMY / ANY_OTHER / CONTROLLED / THIS OPERATOR), so operator-emitted
          // DEAL DAMAGE clauses no longer need to be skipped here.
          this.reactiveTriggersForEffect(dsl, interpretCtx.frame, eventEntityId, eventId, out, this.lastConsumedStacks);
        }
        this.lastConsumedStacks = undefined;
        executedCount++;
      }
    }
    return { executedCount, anyMatched: accepted.length > 0, acceptedClauses: accepted };
  }

  /** All events in the pipeline — delegates to the single source of storage on DEC. */
  getAllEvents(): readonly TimelineEvent[] {
    return this.controller.getAllEvents();
  }

  constructor(
    controller?: DerivedEventController,
    options?: InterpretorOptions,
  ) {
    if (controller) this.controller = controller;
    if (options) this.applyOptions(options);
  }

  /**
   * Reset for reuse.
   */
  resetWith(
    controller: DerivedEventController,
    options?: InterpretorOptions,
  ) {
    this.controller = controller;
    this.firedHpThresholds.clear();
    this.triggerUsageCount.clear();
    this._statReversals = undefined;
    this._lifecycleStatTotals = undefined;
    this.applyOptions(options);
  }

  /**
   * Incremental enemy damage tick push during the queue drain. Computes a
   * simplified per-frame damage (mainStat × multiplier × attributeBonus ×
   * defMult — no runtime fragility/susceptibility/crit) and pushes it to
   * hpController as the frame fires. Same formula used by the damage
   * builder for HP-threshold predicates.
   *
   * Also fires reactive HP threshold checks when damage lands. Returns
   * whether a tick was actually pushed. No-op when the op cache isn't
   * wired (tests with no damage tracking) or the frame has no damage
   * multiplier.
   */
  private _pushEnemyDamageTickForFrame(entry: QueueFrame, out: QueueFrame[]): boolean {
    if (!this.damageOpCache || !this.controller.hasHpController()) return false;
    const event = entry.sourceEvent;
    if (!event) return false;
    const si = entry.segmentIndex ?? -1;
    const fi = entry.frameIndex ?? -1;
    if (si < 0 || fi < 0) return false;
    if (!event.segments[si]?.frames?.[fi]) return false;

    // Reaction columns: owned by ENEMY_ID but source operator deals the damage
    if (event.ownerEntityId === ENEMY_ID && REACTION_COLUMN_IDS.has(event.columnId)) {
      if (!this.modelEnemy || !event.sourceEntityId) return false;
      const sourceOp = this.damageOpCache.get(event.sourceEntityId);
      if (!sourceOp) return false;
      const sourceProps = this.loadoutProperties?.[event.sourceEntityId] ?? DEFAULT_LOADOUT_PROPERTIES;
      const damage = computeReactionFrameDamage(event, fi, sourceOp, this.modelEnemy, sourceProps);
      if (damage == null || damage <= 0) return false;
      this.controller.addEnemyDamageTick(entry.frame, damage);
      this._checkHpThresholds(entry.frame, event.sourceEntityId, event.sourceSkillName ?? event.id, out);
      return true;
    }

    // Non-reaction enemy-owned events don't deal player damage
    if (event.ownerEntityId === ENEMY_ID) return false;

    // Skill columns: existing path
    if (!SKILL_COLUMN_SET.has(event.columnId)) return false;
    const op = this.damageOpCache.get(event.ownerEntityId);
    if (!op) return false;

    // Count damage segments before si to derive damageSegIdx
    let damageSegIdx = 0;
    for (let k = 0; k < si; k++) {
      if (isDamageSegment(event.segments[k].properties.segmentTypes)) damageSegIdx++;
    }

    const props = this.loadoutProperties?.[event.ownerEntityId] ?? DEFAULT_LOADOUT_PROPERTIES;
    const effectiveColumnId = event.id.includes('_ENHANCED') ? NounType.ULTIMATE : event.columnId;
    const skillLevel = getSkillLevelForColumn(effectiveColumnId, props);
    const potential = (props.operator.potential ?? 5) as Potential;

    const damage = computeFrameMarkerDamage(event, si, fi, damageSegIdx, op, this.enemyDefMult, skillLevel, potential);
    if (damage == null || damage <= 0) return false;

    this.controller.addEnemyDamageTick(entry.frame, damage);
    // HP threshold check fires reactively only when damage lands — since
    // HP only decreases via damage writes, any crossed threshold is caught.
    this._checkHpThresholds(entry.frame, event.ownerEntityId, event.sourceSkillName ?? event.id, out);
    return true;
  }

  private applyOptions(options?: InterpretorOptions) {
    this.loadoutProperties = options?.loadoutProperties;
    this.slotOperatorMap = options?.slotOperatorMap;
    this.slotWirings = options?.slotWirings;
    this.getEnemyHpPercentage = options?.getEnemyHpPercentage;
    this.getControlledSlotAtFrame = options?.getControlledSlotAtFrame;
    this.triggerIndex = options?.triggerIndex;
    this.critMode = options?.critMode;
    this.overrides = options?.overrides;
    this.damageOpCache = options?.damageOpCache;
    this.enemyDefMult = options?.enemyDefMult ?? 1;
    this.modelEnemy = options?.modelEnemy;
  }

  // ── DSL Effect interpretation ──────────────────────────────────────────

  interpret(effect: Effect, ctx: InterpretContext): boolean {
    // RECOVER without object is valid (handled as no-op in doRecover for SP/UE)
    if (effect.verb !== VerbType.RECOVER && !validateVerbObject(effect.verb, effect.object as string)) return false;

    switch (effect.verb) {
      case VerbType.ALL:     return this.doAll(effect, ctx);
      case VerbType.ANY:     return this.doAny(effect, ctx);
      case VerbType.CHANCE:  return this.doChance(effect, ctx);
      case VerbType.APPLY:   return this.doApply(effect, ctx);
      case VerbType.CONSUME: return this.doConsume(effect, ctx);

      case VerbType.RESET:   return this.doReset(effect, ctx);
      case VerbType.REDUCE:  return this.doReduce(effect, ctx);

      case VerbType.RECOVER: return this.doRecover(effect, ctx);
      // RETURN shares the doRecover path but routes SP gains into the
      // returned pool (vs RECOVER → natural pool). doRecover branches on
      // effect.verb for the SP case.
      case VerbType.RETURN:  return this.doRecover(effect, ctx);

      case VerbType.EXTEND:  return this.doExtend(effect, ctx);

      case VerbType.DEAL:    return this.doDeal(effect, ctx);

      // ── No-op cases ────────────────────────────────────────────────
      // HIT / DEFEAT / PERFORM are predicate-only verbs in current JSON
      // (they appear inside `conditions`, never inside `effects`). They
      // reach interpret() only if a future JSON authoring error puts
      // them on the effect side; the no-op return is defensive.
      case VerbType.HIT: case VerbType.DEFEAT: case VerbType.PERFORM:
        return true;
      // IGNORE ULTIMATE_ENERGY: route to UE controller's setIgnoreExternalGain
      // so the flag is set at the moment the status's clause is dispatched
      // (during status creation lifecycle), not at post-drain re-registration.
      // The recipient slot is the status owner — resolved from sourceEntityId.
      case VerbType.IGNORE:
        if (effect.object === NounType.ULTIMATE_ENERGY) {
          const slotId = this.ctxSlot(ctx);
          this.controller.setIgnoreExternalGain(slotId, true);
        }
        return true;

      default:
        console.warn(`[EventInterpretor] Unknown verb: ${effect.verb}`);
        return false;
    }
  }

  interpretEffects(effects: readonly Effect[], ctx: InterpretContext) {
    for (const effect of effects) {
      if (!this.interpret(effect, ctx)) return false;
    }
    return true;
  }

  // ── QueueFrame processing ──────────────────────────────────────────────

  processQueueFrame(entry: QueueFrame): QueueFrame[] {
    // Apply pending stat reversals for statuses that expired at or before this frame
    if (this._statReversals?.length && this.controller.hasStatAccumulator()) {
      const currentFrame = entry.frame;
      let i = 0;
      while (i < this._statReversals.length) {
        const r = this._statReversals[i];
        if (r.frame <= currentFrame) {
          this.controller.applyStatDelta(r.entityId, { [r.stat]: r.value });
          this.controller.popStatSource(r.entityId, r.stat);
          this._statReversals[i] = this._statReversals[this._statReversals.length - 1];
          this._statReversals.length--;
        } else {
          i++;
        }
      }
    }

    let result: QueueFrame[];
    switch (entry.type) {
      case QueueFrameType.PROCESS_FRAME:
        // ON_TRIGGER hook routes to the trigger handler; other hook types
        // fall through to handleProcessFrame.
        result = entry.hookType === FrameHookType.ON_TRIGGER
          ? this.handleEngineTrigger(entry)
          : this.handleProcessFrame(entry);
        break;
      case QueueFrameType.COMBO_RESOLVE:  result = this.handleComboResolve(entry); break;
      case QueueFrameType.STATUS_EXIT:    result = this.handleStatusExit(entry); break;
      default: result = [];
    }
    // Flush any STATUS_EXIT frames queued by runStatusCreationLifecycle
    if (this.pendingExitFrames.length > 0) {
      result = [...result, ...this.pendingExitFrames];
      this.pendingExitFrames.length = 0;
    }

    // FIFO: same-frame entries process inline in creation order.
    // Only future-frame entries return to the queue.
    const deferred: QueueFrame[] = [];
    const inline: QueueFrame[] = [];
    for (const qf of result) {
      (qf.frame === entry.frame ? inline : deferred).push(qf);
    }
    for (let i = 0; i < inline.length; i++) {
      const subResults = this.processQueueFrame(inline[i]);
      for (const sr of subResults) {
        (sr.frame === entry.frame ? inline : deferred).push(sr);
      }
    }
    return deferred;
  }

  // ── DSL verb handlers (private) ────────────────────────────────────────

  private resolveEntityId(target: string | undefined, ctx: InterpretContext, determiner?: string) {
    const slotId = this.ctxSlot(ctx);
    if (target === NounType.OPERATOR) {
      switch (determiner ?? DeterminerType.THIS) {
        case DeterminerType.THIS: return slotId;
        case DeterminerType.ALL: return slotId; // ALL is handled by doApply loop, not here
        case DeterminerType.ALL_OTHER: return TEAM_ID;
        case DeterminerType.OTHER: return ctx.targetEntityId ?? slotId;
        case DeterminerType.ANY: return ctx.targetEntityId ?? slotId;
        case DeterminerType.CONTROLLED:
          return this.getControlledSlotAtFrame?.(ctx.frame) ?? slotId;
        case DeterminerType.TRIGGER: {
          // Causality DAG lookup: the "trigger" of an event is its primary
          // (most-recent) parent in the chain. Fall back to ctx.targetEntityId
          // (the legacy threading) and then to slotId if the chain is
          // unavailable — belt-and-suspenders for events not yet migrated in
          // Phase 2 or edge cases where the determiner fires on a chain root.
          if (ctx.sourceEventUid) {
            const parentUid = this.controller.getCausality().primaryParentOf(ctx.sourceEventUid);
            if (parentUid) {
              const parent = this.controller.getEventByUid(parentUid);
              if (parent) return parent.ownerEntityId;
            }
          }
          return ctx.targetEntityId ?? slotId;
        }
        default: return slotId;
      }
    }
    if (target === NounType.ENEMY) return ENEMY_ID;
    if (target === NounType.TEAM) return TEAM_ID;
    return slotId;
  }

  /**
   * Resolve the ownerEntityId of the parent status event by walking the
   * causality DAG. If ctx.sourceEventUid is set, looks up the primary parent
   * and reads its ownerEntityId. When the DAG path is
   * unavailable (no sourceEventUid), falls back to searching for an active
   * event on the parentStatusId column at the current frame, then to
   * `fallback`.
   */
  private resolveParentStatusEntityId(ctx: InterpretContext, fallback: string): string {
    if (ctx.sourceEventUid) {
      const parentUid = this.controller.getCausality().primaryParentOf(ctx.sourceEventUid);
      if (parentUid) {
        const parent = this.controller.getEventByUid(parentUid);
        if (parent) return parent.ownerEntityId;
      }
    }
    // Fallback: find the active event on the parent status column
    if (ctx.parentStatusId) {
      const active = activeEventsAtFrame(this.getAllEvents(), ctx.parentStatusId, undefined, ctx.frame);
      if (active.length > 0) return active[active.length - 1].ownerEntityId;
    }
    return fallback;
  }

  private canDo(effect: Effect, ctx: InterpretContext) {
    const ownerEntityId = this.resolveEntityId(
      effect.to as string ?? effect.fromObject as string,
      ctx, effect.toDeterminer ?? effect.fromDeterminer,
    );

    switch (effect.verb) {
      case VerbType.APPLY: {
        const col = resolveEffectColumnId(effect.object, effect.objectId, effect.objectQualifier);
        if (!col) return true;
        const applyOwner = effect.to === NounType.TEAM ? TEAM_ID : ownerEntityId;
        return this.controller.canApplyEvent(col, applyOwner, ctx.frame);
      }
      case VerbType.CONSUME: {
        // ARTS qualifier = any arts infliction (not reactions)
        if (resolveQualifier(effect.objectQualifier) === AdjectiveType.ARTS) {
          let canConsumeAny = false;
          INFLICTION_COLUMN_IDS.forEach(col => {
            if (this.controller.canConsumeEvent(col, ownerEntityId, ctx.frame)) canConsumeAny = true;
          });
          return canConsumeAny;
        }
        const col = resolveEffectColumnId(effect.object, effect.objectId, effect.objectQualifier);
        if (!col) return true;
        const consumeOwner = effect.to === NounType.TEAM ? TEAM_ID : ownerEntityId;
        return this.controller.canConsumeEvent(col, consumeOwner, ctx.frame);
      }
      default:
        return true;
    }
  }

  private doApply(effect: Effect, ctx: InterpretContext): boolean {
    // Fall back to the status config's target when the effect doesn't specify one
    let effectTo = effect.to as string | undefined;
    let effectToDeterminer = effect.toDeterminer;
    if (!effectTo && effect.objectId) {
      const statusDef = getStatusById(effect.objectId);
      if (statusDef) {
        effectTo = statusDef.to;
        effectToDeterminer = effectToDeterminer ?? statusDef.toDeterminer as typeof effectToDeterminer;
      }
    }
    // ALL / ALL_OTHER OPERATOR: apply to each operator slot individually
    if (effectTo === NounType.OPERATOR
      && (effectToDeterminer === DeterminerType.ALL || effectToDeterminer === DeterminerType.ALL_OTHER)
      && this.slotOperatorMap) {
      const excludeSelf = effectToDeterminer === DeterminerType.ALL_OTHER;
      const selfSlot = this.ctxSlot(ctx);
      // Class filter: toClassFilter (typed) or toQualifier (raw JSON duck-typed)
      const classFilter = effect.toClassFilter ?? (effect as unknown as Record<string, unknown>).toQualifier as string | undefined;
      for (const slotId of Object.keys(this.slotOperatorMap)) {
        if (excludeSelf && slotId === selfSlot) continue;
        if (classFilter) {
          const operatorId = this.slotOperatorMap[slotId];
          const base = getOperatorBase(operatorId);
          if (base?.operatorClassType !== classFilter) continue;
        }
        this.doApply({ ...effect, to: NounType.OPERATOR, toDeterminer: DeterminerType.THIS } as Effect,
          { ...ctx, contextSlotId: slotId });
      }
      return true;
    }
    const ownerEntityId = this.resolveEntityId(effectTo, ctx, effectToDeterminer);
    const source = {
      ownerEntityId: ctx.sourceEntityId,
      skillName: ctx.sourceSkillName,
      slotId: this.ctxSlot(ctx),
      operatorId: ctx.sourceEntityId,
      sourceEventUid: ctx.sourceEventUid,
    };

    // For freeform-derived events, carry the source uid so the created
    // event can be matched to the raw event. Column-match guard: only
    // reuse the uid when the child lands on the SAME column as the source
    // (freeform MF status → MF column). Cross-column side effects (freeform
    // IE → NATURE infliction) get a fresh derived uid to avoid collision.
    const freeformUidFor = (childColumnId: string): string | undefined =>
      ctx.sourceEventUid && ctx.sourceEventColumnId === childColumnId
        ? ctx.sourceEventUid
        : undefined;

    if (effect.object === NounType.INFLICTION) {
      const columnId = resolveEffectColumnId(effect.object, effect.objectId, effect.objectQualifier);
      if (!columnId) return false;
      const dv = this.resolveWith(effect.with?.duration, ctx);
      // Snapshot allEvents length before applying — a cross-element reaction
      // may be created as a side effect inside inflictionColumn.add().
      const eventsBefore = this.getAllEvents().length;
      this.applyEventFromCtx(ctx, columnId, ownerEntityId, ctx.frame, typeof dv === 'number' ? Math.round(dv * FPS) : INFLICTION_DURATION, source,
        { uid: freeformUidFor(columnId) ?? derivedEventUid(columnId, source.ownerEntityId, ctx.frame),
          ...(ctx.sourceCreationInteractionMode != null ? { event: { creationInteractionMode: ctx.sourceCreationInteractionMode } } : {}),
        });
      // If inflictionColumn.add() created a cross-element reaction as a side
      // effect, fire reactive triggers for it so talents watching for
      // `THIS OPERATOR APPLY SOLIDIFICATION` (e.g. Estella P5) get notified.
      // Use the operator's SLOT ID for the owner (not the operator ID) so
      // trigger matching resolves `THIS OPERATOR` correctly.
      const allEvs = this.getAllEvents();
      const sourceSlotId = this.ctxSlot(ctx);
      for (let i = eventsBefore; i < allEvs.length; i++) {
        const newEv = allEvs[i];
        if (REACTION_COLUMN_IDS.has(newEv.columnId)) {
          this.checkReactiveTriggers(
            VerbType.APPLY, newEv.columnId, ctx.frame,
            sourceSlotId, ctx.sourceSkillName, undefined,
            this._processFrameOut,
          );
        }
      }
      return true;
    }
    if (effect.object === NounType.STATUS) {
      // Dispatch sub-categories: objectId indicates INFLICTION/REACTION/PHYSICAL
      if (effect.objectId === NounType.INFLICTION) {
        return this.doApply({ ...effect, object: NounType.INFLICTION, objectId: undefined }, ctx);
      }
      // APPLY STATUS REACTION X — reaction application (canonical form).
      if (effect.objectId === NounType.REACTION) {
        const columnId = resolveEffectColumnId(effect.object, effect.objectId, effect.objectQualifier)
          ?? FORCED_REACTION_COLUMN[resolveQualifier(effect.objectQualifier) ?? ''];
        if (!columnId) return false;
        const isForced = this.resolveWith(effect.with?.isForced, ctx) === 1;
        const dv = this.resolveWith(effect.with?.duration, ctx);
        const sl = this.resolveWith(effect.with?.stacks, ctx);
        // Forced reactions use FORCED_REACTION_DURATION (shorter, for ult-triggered reactions).
        // Non-forced reactions read from JSON config via getStatusConfig.
        const cfg = getStatusConfig(columnId);
        const defaultDuration = typeof dv === 'number' ? Math.round(dv * FPS)
          : isForced ? (FORCED_REACTION_DURATION[columnId] ?? cfg?.duration ?? REACTION_DURATION)
          : cfg?.duration ?? REACTION_DURATION;
        this.applyEventFromCtx(ctx, columnId, ownerEntityId, ctx.frame, defaultDuration, source, {
          stacks: typeof sl === 'number' ? sl : undefined,
          ...(isForced && { isForced: true }),
          uid: freeformUidFor(columnId) ?? derivedEventUid(columnId, source.ownerEntityId, ctx.frame),
          ...(ctx.sourceCreationInteractionMode != null ? { event: { creationInteractionMode: ctx.sourceCreationInteractionMode } } : {}),
        });
        return true;
      }
      // Physical status (APPLY PHYSICAL STATUS LIFT TO ENEMY) → delegate to dedicated handler
      if (effect.objectId === AdjectiveType.PHYSICAL) return this.applyPhysicalStatus(effect, ctx);
      // Unqualified SUSCEPTIBILITY / FRAGILITY — pure stat modifiers resolved by
      // resolveClauseEffectsFromClauses. No timeline event created.
      // Qualified ones (e.g. CRYO + SUSCEPTIBILITY → CRYO_SUSCEPTIBILITY) may have status defs
      // and are handled by the qualified status path below.
      if (!effect.objectQualifier
          && (effect.objectId === NounType.SUSCEPTIBILITY || effect.objectId === NounType.FRAGILITY)) {
        return true;
      }
      // Qualified status: resolve objectId + objectQualifier → element-specific ID
      // (e.g. CRYO + AMP → CRYO_AMP, CRYO + FRAGILITY → CRYO_FRAGILITY).
      // The canonical DSL form in configs is the struct
      // `{objectId: <BASE>, objectQualifier: <X>}`. The storage columnId
      // for these is the flattened form `<X>_<BASE>` so stacking,
      // view columns, and stat accumulator maps key by a single string.
      // Events carry BOTH forms: `columnId` = flattened (storage key),
      // `dslObjectId`/`dslObjectQualifier` = original struct (query key).
      // Conditions in the struct form match via `dslObjectId`/`dslObjectQualifier`;
      // conditions in the flat form match via `columnId`. Either works.
      //
      // INFLICTION / REACTION / PHYSICAL are NOT flattenable — they're handled
      // by dedicated branches above.
      if (effect.objectId && effect.objectQualifier
          && effect.objectId !== NounType.INFLICTION
          && effect.objectId !== NounType.REACTION
          && effect.objectId !== AdjectiveType.PHYSICAL) {
        const qualifiedId = (effect as { _composedQualifiedId?: string })._composedQualifiedId
          ?? `${effect.objectQualifier}_${effect.objectId}`;
        if (getStatusById(qualifiedId)) {
          // Strip qualifier + cached composed ID to prevent infinite re-entry,
          // but stash the pre-flatten struct so the event-write path can
          // persist it as dslObjectId/dslObjectQualifier on the event.
          const { objectQualifier: _q, _composedQualifiedId: _c, ...rest } = effect as Effect & { _composedQualifiedId?: string };
          return this.doApply({
            ...rest,
            objectId: qualifiedId,
            _dslObjectId: effect.objectId,
            _dslObjectQualifier: effect.objectQualifier,
          } as Effect & { _dslObjectId?: string; _dslObjectQualifier?: string }, ctx);
        }
      }
      const isTeamTarget = effect.to === NounType.TEAM;
      const statusEntityId = isTeamTarget ? TEAM_ID : ownerEntityId;
      // Team statuses → team-status column; enemy statuses → raw objectId; operator statuses → name-based column
      const columnId = effect.objectId ?? '';
      const cfg = getStatusConfig(effect.objectId);
      const def = getStatusDef(effect.objectId);
      const statusObj = effect.objectId ? getStatusById(effect.objectId) : undefined;
      const dv = this.resolveWith(effect.with?.duration, ctx);
      const remainingDuration = ctx.parentEventEndFrame != null
        ? Math.max(0, ctx.parentEventEndFrame - ctx.frame)
        : undefined;

      // Build a single apply-time ValueResolutionContext from the source
      // operator's loadout. All downstream status-duration resolutions
      // (top-level `properties.duration` and per-segment durations) read from
      // this one context — no more narrow `{ ...DEFAULT_VALUE_CONTEXT,
      // potential }` spreads that silently default talentLevel to 0.
      const slotId = this.ctxSlot(ctx);
      const operatorSlotMap: Record<string, string> = {};
      if (this.slotOperatorMap) {
        for (const [s, o] of Object.entries(this.slotOperatorMap)) operatorSlotMap[o] = s;
      }
      const deriveCtx: DeriveContext = {
        events: this.getAllEvents(),
        operatorId: ctx.sourceEntityId,
        operatorSlotId: slotId,
        potential: ctx.potential ?? 0,
        operatorSlotMap,
        loadoutProperties: this.loadoutProperties?.[slotId],
      };
      const talentLvl = def ? resolveTalentLevel(def, deriveCtx) : 0;
      const valueCtx = this.buildValueContext(ctx);
      valueCtx.talentLevel = talentLvl;

      // Resolve the status's top-level duration with the full context. The
      // old path resolved against `{ ...DEFAULT, potential }` and silently
      // mis-resolved talent-dependent durations to 0 → TOTAL_FRAMES.
      const cfgDur = statusObj?.resolveDurationFrames(valueCtx) ?? cfg?.duration;

      // UNTIL END OF THIS EVENT/SEGMENT — resolve to parent remaining duration
      const untilEnd = effect.until?.object === NounType.END;
      const duration = typeof dv === 'number' ? Math.round(dv * FPS)
        : (effect.inheritDuration || untilEnd) && remainingDuration != null ? remainingDuration
        : cfgDur != null ? cfgDur
        : isTeamTarget && remainingDuration != null ? remainingDuration
        : TOTAL_FRAMES;
      // Resolve clause effects (susceptibility, statusValue) from the status def
      const eventProps: Partial<TimelineEvent> = {};
      if (def) {
        // Build a temp event to resolve clause effects onto
        const tempEv = { startFrame: ctx.frame } as TimelineEvent;
        resolveClauseEffects(tempEv, def, deriveCtx);
        if (tempEv.susceptibility) eventProps.susceptibility = tempEv.susceptibility;
        if (tempEv.statusValue != null) eventProps.statusValue = tempEv.statusValue;
        // Deep-clone parsed segments (with frame markers) from the game data layer.
        // Must clone to avoid shared-reference mutation when consumption clamps duration/frames.
        //
        // Three cases:
        //  1. No runtime duration override (typeof dv !== 'number'): clone segments
        //     with their static parse-time durations. Event total = cfgDur.
        //  2. Runtime duration override on a single-segment status: clone the one
        //     segment but replace its duration with the runtime-resolved `duration`,
        //     preserving frames. This lets callers like Snowshine Ult pass a
        //     potential-aware `with.duration` while still firing the segment's
        //     offset-0 frame (e.g. APPLY FORCED SOLIDIFICATION).
        //  3. Runtime duration override on a multi-segment status: fall through
        //     to the single-segment placeholder set by column.add() — legacy
        //     behaviour for backwards compatibility; no status currently relies
        //     on both multi-segment shape AND runtime duration override.
        if (statusObj && statusObj.segments.length > 0) {
          // Resolve segment durations against the full apply-time context.
          // Segments can declare VARY_BY POTENTIAL or VARY_BY TALENT_LEVEL
          // (Antal FOCUS Empowered = 40s at P5; Rossi Razor Clawmark DoT =
          // 15s at T1-L1, 25s at T1-L2). Using `valueCtx` ensures talent-
          // and potential-gated segments (and their frames) survive the
          // zero-duration prune inside resolveSegments.
          const rawSegments = statusObj.resolveSegments(valueCtx);
          // Bake level-dependent DEAL STAGGER values into IS literals so the
          // stagger pipeline (which uses a default ValueResolutionContext)
          // sees the actual resolved amount rather than VARY_BY index 0.
          const resolvedSegments = bakeStaggerVaryByOnSegments(rawSegments, talentLvl, ctx.potential ?? 0);
          if (typeof dv !== 'number') {
            eventProps.segments = resolvedSegments;
          } else if (resolvedSegments.length === 1) {
            eventProps.segments = [{
              ...resolvedSegments[0],
              properties: { ...resolvedSegments[0].properties, duration },
            }];
          }
        }
      }

      // Adaptation: freeform wrappers carry runtime-user-edited `susceptibility`
      // on the source TimelineEvent (per-element magnitudes edited via info
      // pane jsonOverrides). Copy onto the applied event so damage calc reads
      // the user's values. Only overrides config defaults when the source
      // event's columnId matches the applied columnId (avoids cross-column
      // bleed-through from side-effect chains).
      if (ctx.sourceEvent?.susceptibility
          && ctx.sourceEvent.columnId === columnId) {
        eventProps.susceptibility = ctx.sourceEvent.susceptibility;
      }
      // Same adaptation for user-edited `statusValue` (e.g. freeform
      // PHYSICAL_FRAGILITY / HEAT_FRAGILITY defaulted to 0, edited via info
      // pane to a non-zero percentage). Column-match guard avoids bleed
      // across side-effect chains.
      if (ctx.sourceEvent?.statusValue != null
          && ctx.sourceEvent.columnId === columnId) {
        eventProps.statusValue = ctx.sourceEvent.statusValue;
      }

      // Intra-frame ordering: stamp status with the damage frame that created it
      if (ctx.sourceFrameKey) eventProps.sourceFrameKey = ctx.sourceFrameKey;

      // Trigger propagation: when this APPLY STATUS / APPLY EVENT fires from
      // inside an onTriggerClause flow, the spawned event carries the trigger
      // operator so its own frame clauses can evaluate `THIS OPERATOR IS
      // TRIGGER OPERATOR`-style comparisons (e.g. Alesh T1 self-trigger bonus).
      if (ctx.triggerEntityId) {
        eventProps.triggerEntityId = ctx.triggerEntityId;
      }

      // Susceptibility status: extract inline value + qualifier into event.susceptibility
      // Matches both base (SUSCEPTIBILITY + qualifier) and qualified (PHYSICAL_SUSCEPTIBILITY) objectIds
      const isSusceptibility = effect.objectId === NounType.SUSCEPTIBILITY
        || (effect.objectId && isQualifiedId(effect.objectId, NounType.SUSCEPTIBILITY));
      if (isSusceptibility && effect.with?.value) {
        const qualifier = effect.objectQualifier
          ?? effect.objectId?.replace(`_${NounType.SUSCEPTIBILITY}`, '');
        const rateValue = this.resolveWith(effect.with.value, ctx);
        if (qualifier && typeof rateValue === 'number') {
          if (!eventProps.susceptibility) eventProps.susceptibility = {};
          (eventProps.susceptibility as Record<string, number>)[qualifier] = rateValue;
        }
      }

      // Inline status value: resolve with.value into statusValue for any status
      // (e.g. AMP percentage, FRAGILITY percentage)
      if (effect.with?.value && eventProps.statusValue == null) {
        const inlineValue = this.resolveWith(effect.with.value, ctx);
        if (typeof inlineValue === 'number') {
          eventProps.statusValue = inlineValue;
        }
      }

      // Inline status multiplier: resolve with.multiplier into statusValue for any status
      // (e.g. WEAKNESS — damage reduction expressed as a multiplicative factor)
      if (effect.with?.multiplier && eventProps.statusValue == null) {
        const inlineMultiplier = this.resolveWith(effect.with.multiplier, ctx);
        if (typeof inlineMultiplier === 'number') {
          eventProps.statusValue = inlineMultiplier;
        }
      }

      // Enforce cooldown
      if (cfg?.cooldownFrames) {
        const cooldownEvents = this.getAllEvents();
        const lastProc = cooldownEvents
          .filter(ev => ev.columnId === columnId && ev.ownerEntityId === statusEntityId)
          .reduce((latest, ev) => Math.max(latest, ev.startFrame), -Infinity);
        if (lastProc >= 0 && ctx.frame < lastProc + cfg.cooldownFrames) return true;
      }

      // Resolve stack count from effect (e.g. "with": { "stacks": { "verb": "IS", "value": 5 } })
      const sv = this.resolveWith(effect.with?.stacks, ctx);
      // When a dynamic stacks expression resolves to 0, skip the APPLY entirely.
      // This handles cases like "create N waterspouts from N whirlpools" where N=0 means no events.
      // Only skip for dynamic expressions (ValueStatus reads or operations), not literal values
      // like { verb: "IS", value: 1 } which always produce a fixed count.
      const stacksNode = effect.with?.stacks as Record<string, unknown> | undefined;
      const isDynamicStacks = stacksNode && ('operation' in stacksNode || stacksNode.object === NounType.STACKS);
      if (isDynamicStacks && typeof sv === 'number' && sv <= 0) return true;
      // NONE interaction: create 1 event with stacks = N (events represent groupings of stacks)
      // Other interactions (RESET, etc.): create N separate events (e.g. Steel Oath 5 stacks)
      const isAccumulatorApply = cfg?.stackingMode === StackInteractionType.NONE && typeof sv === 'number' && sv > 1;
      const stackCount = isAccumulatorApply ? 1 : (typeof sv === 'number' && sv > 1 ? sv : 1);
      const applyStacks = isAccumulatorApply ? sv : undefined;

      // DSL identity for struct-based matching — if doApply flattened a
      // qualified status (e.g. `STATUS SUSCEPTIBILITY PHYSICAL` →
      // `PHYSICAL_SUSCEPTIBILITY`), the pre-flatten struct was stashed on
      // the recursed effect as `_dslObjectId` / `_dslObjectQualifier`.
      // Otherwise this path handles an unflattened status apply — the
      // effect's own objectId/objectQualifier ARE the DSL identity.
      const effectWithDsl = effect as Effect & { _dslObjectId?: string; _dslObjectQualifier?: string };
      const dslObjectIdFromEffect = effectWithDsl._dslObjectId ?? effect.objectId;
      const dslObjectQualifierFromEffect = effectWithDsl._dslObjectQualifier ?? effect.objectQualifier;

      for (let si = 0; si < stackCount; si++) {
        const runtimeMaxStacks = cfg?.maxStacksNode
          ? resolveValueNode(cfg.maxStacksNode as ValueNode, this.buildValueContext({ ...ctx, contextSlotId: statusEntityId }))
          : cfg?.maxStacks;
        const eventOverrides = {
          ...eventProps,
          ...(applyStacks != null ? { stacks: applyStacks } : {}),
          ...(ctx.consumedStacks != null ? { consumedStacks: ctx.consumedStacks } : {}),
          ...(ctx.sourceCreationInteractionMode != null && ctx.sourceEventColumnId === columnId
            ? { creationInteractionMode: ctx.sourceCreationInteractionMode } : {}),
          ...(dslObjectIdFromEffect != null ? { dslObjectId: dslObjectIdFromEffect } : {}),
          ...(dslObjectQualifierFromEffect != null ? { dslObjectQualifier: dslObjectQualifierFromEffect } : {}),
        };
        const added = this.applyEventFromCtx(ctx, columnId, statusEntityId, ctx.frame, duration, source, {
          statusId: effect.objectId,
          ...(cfg?.stackingMode ? { stackingMode: cfg.stackingMode } : {}),
          ...(runtimeMaxStacks != null ? { maxStacks: runtimeMaxStacks } : {}),
          ...(Object.keys(eventOverrides).length > 0 ? { event: eventOverrides } : {}),
          uid: (freeformUidFor(columnId) && si === 0) ? freeformUidFor(columnId)! : derivedEventUid(columnId, source.ownerEntityId, ctx.frame, stackCount > 1 ? `${si}` : undefined),
        });
        // Process each new status event's lifecycle clauses inline (onEntryClause, etc.)
        // Only run if the event was actually created (column.add may reject at stack limit).
        if (added) this.runStatusCreationLifecycle(effect.objectId, statusEntityId, ctx);
      }

      return true;
    }
    // APPLY STAT — accumulate into the stat accumulator for the target entity.
    if (effect.object === NounType.STAT && effect.objectId) {
      const statKey = resolveEffectStat(NounType.STAT, effect.objectId, effect.objectQualifier);
      if (statKey && this.controller.hasStatAccumulator()) {
        // multiplier key → multiply existing aggregate (e.g. T2 Cryogenic Embrittlement)
        const m = this.resolveWith(effect.with?.multiplier, ctx);
        if (typeof m === 'number') {
          this.controller.applyStatMultiplier(ownerEntityId, statKey, m);
        } else {
          // value key → additive delta (standard stat buff)
          const v = this.resolveWith(effect.with?.value, ctx);
          if (typeof v === 'number' && v !== 0) {
            // Snapshot stat before delta to detect 0→positive transitions
            const statBefore = this.controller.getStat(ownerEntityId, statKey);
            this.controller.applyStatDelta(ownerEntityId, { [statKey]: v });
            // Push a labelled StatSource for breakdown attribution + schedule
            // reversal at the parent segment/event end so the delta is scoped
            // to the lifetime of the dispatching clause.
            // Skipped when the caller is a lifecycle-clause handler that
            // manages its own source attribution + reversal (prevents double-count).
            if (!ctx.skipStatSourceAttribution) {
              const sourceLabel = ctx.sourceSkillName ?? ctx.parentStatusId ?? statKey;
              this.controller.pushStatSource(
                ownerEntityId, statKey,
                buildStatSource(sourceLabel, v, effect as unknown as Record<string, unknown>, ctx),
              );
              const reverseAtFrame = ctx.parentSegmentEndFrame ?? ctx.parentEventEndFrame;
              if (reverseAtFrame != null) {
                if (!this._statReversals) this._statReversals = [];
                this._statReversals.push({ frame: reverseAtFrame, entityId: ownerEntityId, stat: statKey, value: -v });
              }
            }
            // Fire BECOME state trigger on 0→positive transition (not when already active)
            const stateAdj = STAT_TO_STATE_ADJECTIVE[statKey];
            if (stateAdj && (statBefore ?? 0) <= 0) {
              this._statTriggerOut.length = 0;
              // slotId = ownerEntityId: the entity that entered the state (matches BECOME_NOT semantics).
              // This is the "subject" of `X BECOME SLOWED`, not the source operator that applied the stat.
              this.checkReactiveTriggers(VerbType.BECOME, stateAdj, ctx.frame, ownerEntityId, ctx.sourceSkillName, undefined, this._statTriggerOut);
              if (this._statTriggerOut.length > 0) this.pendingExitFrames.push(...this._statTriggerOut);
            }
          }
        }
      }
      return true;
    }
    if (effect.object === NounType.STAGGER) {
      const v = this.resolveWith(effect.with?.staggerValue, ctx);
      this.controller.createStagger('stagger', ownerEntityId, ctx.frame, typeof v === 'number' ? v : 0, source);
      return true;
    }
    // APPLY SHIELD — record shield value on target operator via DEC.
    if (effect.object === ObjectType.SHIELD) {
      if (!this.controller.hasShieldController()) return true;
      const shieldValue = this.resolveWith(effect.with?.value, ctx);
      if (typeof shieldValue !== 'number' || shieldValue <= 0) return true;
      const targetOpId = this.slotToEntityId(ownerEntityId);
      const expirationFrame = ctx.parentEventEndFrame ?? (ctx.frame + 10 * FPS);
      this.controller.applyShield(targetOpId, ctx.frame, shieldValue, expirationFrame);
      return true;
    }
    // APPLY EVENT — create a new instance of the parent status definition on the target.
    // Equivalent to APPLY STATUS <parentStatusId> with the parent's duration and stacking.
    if (effect.object === NounType.EVENT && ctx.parentStatusId) {
      this.lastAppliedParentStatusId = ctx.parentStatusId;
      return this.doApply({ ...effect, object: NounType.STATUS, objectId: ctx.parentStatusId }, ctx);
    }
    // eslint-disable-next-line no-console
    console.warn(`[EventInterpretor] APPLY: unsupported object ${effect.object}`);
    return false;
  }

  private doConsume(effect: Effect, ctx: InterpretContext) {
    const from = effect.fromObject as string ?? (effect as unknown as { from?: string }).from ?? effect.fromDeterminer as string ?? effect.to as string;
    const ownerEntityId = this.resolveEntityId(
      from, ctx, effect.fromDeterminer ?? effect.toDeterminer,
    );
    const source = {
      ownerEntityId: ctx.sourceEntityId,
      skillName: ctx.sourceSkillName,
      slotId: this.ctxSlot(ctx),
      operatorId: ctx.sourceEntityId,
      sourceEventUid: ctx.sourceEventUid,
    };
    const rawStacks = effect.with?.stacks as ValueNode | typeof THRESHOLD_MAX | number | undefined;
    if (rawStacks == null) console.warn(
      `[EventInterpretor] CONSUME ${effect.object} ${effect.objectId ?? effect.objectQualifier ?? '?'}: missing with.stacks`,
      `\n  source: ${ctx.sourceSkillName} (owner: ${ctx.sourceEntityId}, frame: ${ctx.frame})`,
      `\n  effect:`, JSON.stringify(effect, null, 2),
    );
    const isMax = rawStacks === THRESHOLD_MAX;
    const sv = isMax ? undefined : this.resolveWith(rawStacks, ctx);
    const count = isMax ? Infinity : (typeof sv === 'number' ? sv : 1);

    // ARTS qualifier = consume all arts infliction stacks (not reactions — reactions only interact with themselves)
    if (resolveQualifier(effect.objectQualifier) === AdjectiveType.ARTS && (effect.objectId === NounType.INFLICTION || effect.object === NounType.INFLICTION)) {
      let totalConsumed = 0;
      INFLICTION_COLUMN_IDS.forEach(col => {
        totalConsumed += this.controller.consumeEvent(col, ownerEntityId, ctx.frame, source, { count });
      });
      this.lastConsumedStacks = totalConsumed > 0 ? totalConsumed : undefined;
      return true;
    }
    // CONSUME SKILL — skill event consumption.
    // Normalized: object=SKILL, objectId=BASIC_ATTACK/BATTLE/etc., objectQualifier=variant.
    // Uses inclusive end boundary (<=) since the consuming frame often fires at the exact end.
    const consumeSkillCol = effect.object === NounType.SKILL && effect.objectId && SKILL_COLUMN_SET.has(effect.objectId) ? effect.objectId : undefined;
    if (consumeSkillCol) {
      const columnId = consumeSkillCol;
      const variantId = effect.objectQualifier;
      const allEvents = this.getAllEvents();
      const target = allEvents
        .filter(ev =>
          ev.columnId === columnId
          && ev.ownerEntityId === ownerEntityId
          && ev.startFrame <= ctx.frame
          && ctx.frame <= ev.startFrame + eventDuration(ev)
          && ev.eventStatus !== EventStatusType.CONSUMED
          && (!variantId || ev.id === variantId),
        )
        .sort((a, b) => a.startFrame - b.startFrame)[0];
      if (target) {
        setEventDuration(target, Math.max(0, ctx.frame - target.startFrame));
        target.eventStatus = EventStatusType.CONSUMED;
        if (source.sourceEventUid) this.controller.linkTransition(target.uid, source.sourceEventUid);
        this.lastConsumedStacks = 1;
        return true;
      }
      return false;
    }
    const consumeCol = resolveEffectColumnId(effect.object, effect.objectId, effect.objectQualifier);
    if (consumeCol) {
      const statusOwner = effect.to === NounType.TEAM ? TEAM_ID : ownerEntityId;
      // For inflictions, pass explicit count; for statuses, let the controller handle stack semantics
      const isInflictionConsume = effect.object === NounType.INFLICTION
        || (effect.object === NounType.STATUS && effect.objectId === NounType.INFLICTION);
      const hasExplicitCount = count !== Infinity && rawStacks != null;
      const consumed = this.controller.consumeEvent(consumeCol, statusOwner, ctx.frame, source,
        isInflictionConsume ? { count } : hasExplicitCount ? { count, restack: true } : undefined);
      if (consumed > 0) this.lastConsumedStacks = consumed;
      // Reschedule stat reversals for consumed statuses to fire at consumption frame
      if (consumed > 0 && this._statReversals?.length) {
        for (const r of this._statReversals) {
          if (r.frame > ctx.frame) r.frame = ctx.frame;
        }
      }
      return consumed > 0;
    }
    // CONSUME THIS EVENT — consume one stack of the parent status (from ENGINE_TRIGGER context)
    if (effect.object === NounType.EVENT && ctx.parentStatusId) {
      const columnId = ctx.parentStatusId;
      const statusEntityId = this.resolveParentStatusEntityId(ctx, ownerEntityId);
      const consumed = this.controller.consumeEvent(columnId, statusEntityId, ctx.frame, source, { count, restack: true });
      this.lastConsumedParentStatusId = consumed > 0 ? columnId : undefined;
      if (consumed > 0) this.lastConsumedStacks = consumed;
      return consumed > 0;
    }
    // CONSUME STACKS — self-consumption of the parent status stacks (e.g. Auxiliary Crystal)
    if (effect.object === NounType.STACKS && ctx.parentStatusId) {
      const columnId = ctx.parentStatusId;
      const statusEntityId = this.resolveParentStatusEntityId(ctx, ownerEntityId);
      const consumed = this.controller.consumeEvent(columnId, statusEntityId, ctx.frame, source, { count, restack: true });
      if (consumed > 0) this.lastConsumedStacks = consumed;
      return consumed > 0;
    }
    return true;
  }

  /**
   * Resolve the trigger object ID from an Effect for reactive trigger dispatch.
   * Maps verb+object+objectId+objectQualifier to the key target that
   * checkReactiveTriggers uses to look up matching trigger defs.
   * Mirrors resolveTriggerKey in triggerIndex.ts but works on Effect fields.
   */
  private resolveObjectIdForTrigger(effect: Effect): string | undefined {
    const verb = effect.verb;

    if (verb === VerbType.APPLY || verb === VerbType.CONSUME || verb === VerbType.RECEIVE) {
      // Physical status: if the status wasn't created but Vulnerable was added,
      // fire VULNERABLE trigger instead (e.g. CRUSH with no existing Vulnerable stacks).
      if (effect.objectId === AdjectiveType.PHYSICAL && !this.lastPhysicalStatusCreated) {
        return PHYSICAL_INFLICTION_COLUMNS.VULNERABLE;
      }
      // CONSUME THIS EVENT: use the actual consumed status ID for trigger dispatch
      if (verb === VerbType.CONSUME && effect.object === NounType.EVENT && this.lastConsumedParentStatusId) {
        return this.lastConsumedParentStatusId;
      }
      // APPLY THIS EVENT: use the actual applied status ID for trigger dispatch
      if (verb === VerbType.APPLY && effect.object === NounType.EVENT && this.lastAppliedParentStatusId) {
        return this.lastAppliedParentStatusId;
      }
      return resolveEffectColumnId(effect.object, effect.objectId, effect.objectQualifier);
    }
    if (verb === VerbType.PERFORM) return effect.object === NounType.SKILL ? effect.objectId : effect.object;
    // DEAL triggers historically only ever match DEAL DAMAGE — STAGGER is a
    // separate stat-meter mechanic that has no reactive trigger key today.
    if (verb === VerbType.DEAL) {
      return effect.object === NounType.DAMAGE ? NounType.DAMAGE : undefined;
    }
    if (verb === VerbType.RECOVER) return effect.object;
    if (verb === VerbType.HIT) return ENEMY_ACTION_COLUMN_ID;
    if (verb === VerbType.DEFEAT) return NounType.ENEMY;
    if (verb === VerbType.IS || verb === VerbType.BECOME) {
      return STATE_TO_COLUMN[effect.object ?? ''] ?? effect.object;
    }
    return effect.object;
  }

  /**
   * Fire reactive triggers for a clause effect. Generic for all verb types.
   */
  private reactiveTriggersForEffect(effect: Effect, absFrame: number, eventEntityId: string, eventName: string, out: QueueFrame[], consumedStacks?: number) {
    // Skip CONSUME triggers when nothing was actually consumed (no stacks present to consume).
    if (effect.verb === VerbType.CONSUME && (consumedStacks == null || consumedStacks === 0)) return;
    const objectId = this.resolveObjectIdForTrigger(effect);
    if (!objectId) return;
    // Resolve the target slot for this effect (recipient of APPLY/CONSUME). Actor slot is
    // always eventEntityId. The inline filter in checkReactiveTriggers decides per-entry
    // whether to match against actor or target based on the entry's own subject semantics.
    let targetSlotId: string | undefined;
    if (effect.to === NounType.ENEMY) targetSlotId = ENEMY_ID;
    else if (effect.to === NounType.TEAM) targetSlotId = TEAM_ID;
    else if (effect.object === NounType.STATUS && effect.objectId) {
      const def = getStatusDef(effect.objectId);
      if (def?.properties.target === NounType.ENEMY) targetSlotId = ENEMY_ID;
      else if (def?.properties.target === NounType.TEAM) targetSlotId = TEAM_ID;
    }
    this.checkReactiveTriggers(effect.verb, objectId, absFrame, eventEntityId, eventName, undefined, out, consumedStacks, targetSlotId);
    // CONSUME of a column-based state event (INFLICTION, REACTION, column-backed STATUS)
    // ends the state at the consumption frame. EVENT_END fires IS_NOT:<col> at the
    // event's original end frame; for consumed events that fire never lands (the
    // pre-scheduled EVENT_END runs past the clamped duration and early-returns).
    // Fire IS_NOT:<col> here so `BECOME NOT <state>` triggers match mid-duration
    // consumes. Guard against partial consumes by requiring no active events remain.
    if (effect.verb === VerbType.CONSUME) {
      // Resolve the entity whose state is ending. CONSUME uses `from` (not `to`),
      // e.g. "CONSUME REACTION SOLIDIFICATION from ENEMY". Fall back to targetSlotId
      // for self-consume or legacy effects that used `to`.
      const fromTarget = (effect as unknown as { from?: string }).from;
      const stateEntityId = fromTarget === NounType.ENEMY ? ENEMY_ID
        : fromTarget === NounType.TEAM ? TEAM_ID
        : targetSlotId ?? eventEntityId;
      const remaining = activeEventsAtFrame(this.getAllEvents(), objectId, stateEntityId, absFrame);
      if (remaining.length === 0) {
        this.checkReactiveTriggers(`${VerbType.IS}_NOT`, objectId, absFrame, stateEntityId, eventName, undefined, out);
      }
    }
    // CONSUME a status with stat-based state clause → fire BECOME_NOT (stat may have ended)
    if (effect.verb === VerbType.CONSUME && effect.object === NounType.STATUS && effect.objectId) {
      const consumedDef = getStatusDef(effect.objectId);
      if (consumedDef?.clause) {
        // The stat lives on the status-target entity, not the parent event's owner.
        // Resolve from the consumed status def's target for the subject match.
        const target = consumedDef.properties.target;
        const statusEntityId = target === NounType.ENEMY ? ENEMY_ID : eventEntityId;
        for (const clause of consumedDef.clause as { effects?: { verb?: string; object?: string; objectId?: string }[] }[]) {
          for (const ef of clause.effects ?? []) {
            if (ef.verb === VerbType.APPLY && ef.object === NounType.STAT) {
              const adj = STAT_TO_STATE_ADJECTIVE[ef.objectId as StatType];
              if (adj) this.checkReactiveTriggers(`${VerbType.BECOME}_NOT`, adj, absFrame, statusEntityId, eventName, undefined, out);
            }
          }
        }
      }
    }
  }

  private doReset(effect: Effect, ctx: InterpretContext) {
    if (effect.object === ObjectType.COOLDOWN) {
      const targetColumnId = effect.objectId;
      if (!targetColumnId || !SKILL_COLUMN_SET.has(targetColumnId)) return true;

      const slotId = this.ctxSlot(ctx);
      for (const ev of this.controller.getAllEvents()) {
        if (ev.ownerEntityId !== slotId) continue;
        if (ev.columnId !== targetColumnId) continue;

        let preCooldownDur = 0;
        let cooldownDur = 0;
        for (const s of ev.segments) {
          if (s.properties.name === 'Cooldown') {
            cooldownDur = s.properties.duration;
          } else {
            preCooldownDur += s.properties.duration;
          }
        }
        const activeEnd = ev.startFrame + preCooldownDur;
        const cooldownEnd = ev.startFrame + preCooldownDur + cooldownDur;
        if (ctx.frame < activeEnd || ctx.frame >= cooldownEnd) continue;

        this.controller.resetCooldown(ev.uid, ctx.frame);
      }
      return true;
    }
    return true;
  }

  private buildValueContext(ctx: InterpretContext): ValueResolutionContext {
    const ownerEntityId = this.ctxSlot(ctx);
    const loadout = this.loadoutProperties?.[ownerEntityId];
    // Populate stats from the stat accumulator when available (includes
    // base stats + runtime deltas like ATK buffs). This lets value nodes
    // reference operator stats (e.g. INTELLECT) during interpret time.
    const accStats = this.controller.getStatSnapshot(ownerEntityId);
    const baseCtx = buildContextForSkillColumn(loadout, NounType.BATTLE, accStats);
    if (ctx.potential != null) baseCtx.potential = ctx.potential;
    if (ctx.talentLevel != null) baseCtx.talentLevel = ctx.talentLevel;
    if (ctx.suppliedParameters) baseCtx.suppliedParameters = ctx.suppliedParameters;
    const frame = ctx.frame;
    const getAllEvents = () => this.getAllEvents();
    baseCtx.statusQuery = {
      getActiveStatusStacks: (f, owner, statusId) => countActiveStatusStacks(getAllEvents(), f, owner, statusId),
    };
    baseCtx.frame = frame;
    baseCtx.ownerEntityId = ownerEntityId;
    if (ctx.consumedStacks != null) baseCtx.consumedStacks = ctx.consumedStacks;

    // Populate sourceContext for DeterminerType.SOURCE resolution
    // ("TALENT_LEVEL of SOURCE OPERATOR", "STAT INTELLECT of SOURCE OPERATOR", etc.)
    //
    // Two resolution paths:
    // 1. Causality DAG: trace sourceEventUid → root event → owner slot.
    //    Works for events with causality links (reactions, inflictions, skill events).
    // 2. sourceEntityId: resolve operator ID → slot directly.
    //    Required for status events — status columns do not link causality,
    //    so the DAG has no edges for them.
    //
    // Only attach when the source is a different slot than the current
    // context — otherwise SOURCE == THIS and the fallback in the resolver
    // will use the main ctx anyway.
    let sourceSlotId: string | undefined;
    if (ctx.sourceEventUid) {
      const rootUid = this.controller.getCausality().rootOf(ctx.sourceEventUid);
      if (rootUid) {
        const rootEv = this.controller.getEventByUid(rootUid);
        sourceSlotId = rootEv?.ownerEntityId;
      }
    }
    if (!sourceSlotId && ctx.sourceEntityId) {
      sourceSlotId = this.resolveSlotId(ctx.sourceEntityId);
    }
    if (sourceSlotId && sourceSlotId !== ownerEntityId) {
      const sourceLoadout = this.loadoutProperties?.[sourceSlotId];
      if (sourceLoadout) {
        const sourceStats = this.controller.getStatSnapshot(sourceSlotId);
        baseCtx.sourceContext = buildContextForSkillColumn(sourceLoadout, NounType.BATTLE, sourceStats);
      }
    }

    return baseCtx;
  }

  /** Resolve a WITH property ValueNode or raw number, returning undefined if absent. */
  private resolveWith(node: ValueNode | number | undefined, ctx: InterpretContext): number | undefined {
    if (node == null) return undefined;
    if (typeof node === 'number') return node;
    // Unwrap { value: ValueNode, unit: string } duration wrapper from JSON
    const inner = (node as { value?: unknown; unit?: string });
    if (inner.unit && inner.value != null && typeof inner.value !== 'number') {
      return resolveValueNode(inner.value as ValueNode, this.buildValueContext(ctx));
    }
    return resolveValueNode(node, this.buildValueContext(ctx));
  }

  private doExtend(effect: Effect, ctx: InterpretContext) {
    if (!effect.until || effect.until.object !== NounType.END) return true;

    // Resolve which end frame to extend to based on until.of.object scope
    const endFrame = effect.until.of.object === NounType.SEGMENT
      ? ctx.parentSegmentEndFrame
      : ctx.parentEventEndFrame;
    if (endFrame == null) return true;

    // Resolve target column and owner
    const columnId = resolveEffectColumnId(effect.object, effect.objectId, effect.objectQualifier);
    if (!columnId) return true;
    const ownerEntityId = this.resolveEntityId(effect.of?.object ?? effect.to, ctx, effect.of?.determiner ?? effect.toDeterminer);

    // Extend active target events to persist until the resolved end frame
    for (const ev of this.controller.getAllEvents()) {
      if (ev.columnId !== columnId) continue;
      if (ownerEntityId != null && ev.ownerEntityId !== ownerEntityId) continue;
      if (ev.startFrame > ctx.frame) continue;
      const currentEnd = ev.startFrame + eventDuration(ev);
      if (currentEnd > ctx.frame) {
        const newDuration = endFrame - ev.startFrame;
        if (newDuration > eventDuration(ev)) {
          setEventDuration(ev, newDuration);
        }
      }
    }
    return true;
  }

  private doReduce(effect: Effect, ctx: InterpretContext) {
    if (effect.object !== ObjectType.COOLDOWN) return true;

    // Resolve which skill column's cooldown to reduce — from of clause (SKILL possessor)
    const targetColumnId = effect.of?.objectId;
    if (!targetColumnId || !SKILL_COLUMN_SET.has(targetColumnId)) return true;

    // Resolve reduction amount from `by` (preposition) or `with` (properties)
    let byValue: number;
    let unit: string | undefined;
    if (effect.by) {
      byValue = resolveValueNode(effect.by.value, this.buildValueContext(ctx));
      unit = effect.by.unit;
    } else if (effect.with?.value) {
      byValue = resolveValueNode(effect.with.value, this.buildValueContext(ctx));
      unit = (effect.with as Record<string, unknown>).unit as string | undefined;
    } else {
      return true;
    }

    // Find same-owner events in the target column that are in cooldown phase at ctx.frame
    const slotId = this.ctxSlot(ctx);
    for (const ev of this.controller.getAllEvents()) {
      if (ev.ownerEntityId !== slotId) continue;
      if (ev.columnId !== targetColumnId) continue;

      let preCooldownDur = 0;
      let cooldownDur = 0;
      let isImmediateCd = false;
      for (const s of ev.segments) {
        if (s.properties.name === 'Cooldown') {
          cooldownDur = s.properties.duration;
          if (s.properties.segmentTypes?.includes(SegmentType.IMMEDIATE_COOLDOWN)) isImmediateCd = true;
        } else {
          preCooldownDur += s.properties.duration;
        }
      }
      // IMMEDIATE_COOLDOWN starts at event offset 0, not after active segments
      const cooldownStart = ev.startFrame + (isImmediateCd ? 0 : preCooldownDur);
      const cooldownEnd = cooldownStart + cooldownDur;
      if (ctx.frame < cooldownStart || ctx.frame >= cooldownEnd) continue;

      // Convert by value to frames based on unit
      let reductionFrames: number;
      switch (unit) {
        case UnitType.SECOND:
          reductionFrames = byValue * FPS;
          break;
        case UnitType.PERCENTAGE:
          reductionFrames = cooldownDur * byValue;
          break;
        default:
          reductionFrames = byValue;
          break;
      }

      // Subtract from remaining cooldown at ctx.frame
      const remainingCooldown = cooldownEnd - ctx.frame;
      const newRemaining = Math.max(0, remainingCooldown - reductionFrames);
      const newCooldownDuration = (ctx.frame - cooldownStart) + newRemaining;
      this.controller.reduceCooldown(ev.uid, newCooldownDuration);
    }
    return true;
  }

  private doRecover(effect: Effect, ctx: InterpretContext) {
    // SP recovery/return — route through DEC to the SP controller.
    // RECOVER → natural pool (yellow, generates UE when consumed).
    // RETURN  → returned pool (red, does NOT generate UE when consumed).
    if (effect.object === NounType.SKILL_POINT) {
      const amount = this.resolveWith(effect.with?.value, ctx);
      if (amount && amount > 0) {
        this.controller.recordSkillPointRecovery(
          ctx.frame, amount, ctx.sourceEntityId, ctx.sourceSkillName ?? '',
          effect.verb === VerbType.RETURN,
        );
      }
      return true;
    }
    // Ultimate energy recovery — route through DEC to the UE controller.
    if (effect.object === NounType.ULTIMATE_ENERGY) {
      const amount = this.resolveWith(effect.with?.value, ctx);
      if (amount && amount > 0) {
        this.controller.recordUltimateEnergyGain(ctx.frame, this.ctxSlot(ctx), amount, 0);
      }
      return true;
    }
    // Only handle HP recovery — SP/UE handled above
    if (effect.object !== NounType.HP) return true;
    if (!this.controller.hasHpController()) return true;

    const wp = effect.with as Record<string, unknown> | undefined;
    if (!wp?.value) return true;

    // Resolve heal amount from ValueExpression
    const valueCtx = this.buildValueContext(ctx);
    const rawHeal = resolveValueNode(wp.value as ValueNode, valueCtx);
    if (!rawHeal || rawHeal <= 0) return true;

    // Apply Treatment Bonus from source operator
    const treatmentBonus = valueCtx.stats?.TREATMENT_BONUS ?? 0;

    // Resolve target operator
    const toDeterminer = (effect as unknown as Record<string, unknown>).toDeterminer as string | undefined;
    const filter = wp.filter as { objectQualifier?: string; objectId?: string; object?: string } | undefined;
    let targetEntityId: string | undefined;

    if (toDeterminer === DeterminerType.CONTROLLED) {
      const controlledSlot = this.getControlledSlotAtFrame?.(ctx.frame);
      targetEntityId = controlledSlot ? this.slotToEntityId(controlledSlot) : ctx.sourceEntityId;
    } else if (toDeterminer === DeterminerType.ANY && filter?.objectQualifier === AdjectiveType.LOWEST) {
      // Find operator with lowest HP percentage; tie-break to controlled
      const operatorIds = this.controller.getOperatorIds();
      const controlledSlot = this.getControlledSlotAtFrame?.(ctx.frame);
      const controlledOpId = controlledSlot ? this.slotToEntityId(controlledSlot) : undefined;
      let lowestPct = Infinity;
      targetEntityId = controlledOpId; // default tie-breaker
      for (const opId of operatorIds) {
        const pct = this.controller.getOperatorPercentageHp(opId, ctx.frame);
        if (pct < lowestPct) {
          lowestPct = pct;
          targetEntityId = opId;
        }
      }
    } else {
      targetEntityId = ctx.sourceEntityId;
    }

    if (!targetEntityId) return true;

    // Apply Treatment Received Bonus from target
    const targetSlot = Object.entries(this.slotOperatorMap ?? {}).find(([, opId]) => opId === targetEntityId)?.[0];
    const targetCtx = targetSlot ? buildContextForSkillColumn(this.loadoutProperties?.[targetSlot], NounType.BATTLE) : undefined;
    const treatmentReceivedBonus = targetCtx?.stats?.TREATMENT_RECEIVED_BONUS ?? 0;

    const finalHeal = rawHeal * (1 + treatmentBonus) * (1 + treatmentReceivedBonus);
    this.controller.recoverHp(targetEntityId, ctx.frame, finalHeal);
    return true;
  }

  private doDeal(effect: Effect, ctx: InterpretContext) {
    // DEAL DAMAGE to OPERATOR: absorb through shield first, then reduce HP
    if (effect.object !== NounType.DAMAGE) return true;
    if (effect.to !== NounType.OPERATOR) return true;

    const rawDamage = this.resolveWith(effect.with?.value, ctx);
    if (typeof rawDamage !== 'number' || rawDamage <= 0) return true;

    // Resolve target operators
    const toDeterminer = (effect as unknown as Record<string, unknown>).toDeterminer as string | undefined;
    const targetSlots = toDeterminer === DeterminerType.ALL
      ? Object.keys(this.slotOperatorMap ?? {})
      : [this.ctxSlot(ctx)];

    for (const slotId of targetSlots) {
      const opId = this.slotToEntityId(slotId);
      // Shield absorbs first; overflow damage routes to HP via DEC.
      const remainingDamage = this.controller.absorbShield(opId, ctx.frame, rawDamage);
      if (remainingDamage > 0) {
        this.controller.recoverHp(opId, ctx.frame, -remainingDamage);
      }
    }
    return true;
  }

  private doAll(effect: Effect, ctx: InterpretContext) {
    // Resolve cardinality from explicit `for` or top-level cardinalityConstraint+value
    const explicitCardinality = effect.for?.value ?? effect.value;
    const maxIter = Math.min(
      explicitCardinality != null ? resolveCardinality(explicitCardinality, ctx.potential ?? 0) : 1, 10,
    );
    // Support both predicated (conditions + effects) and flat (effects only) forms.
    const preds = effect.predicates ??
      (effect.effects?.length ? [{ conditions: [] as readonly import('../../dsl/semantics').Interaction[], effects: effect.effects }] : []);
    if (preds.length === 0) return true;

    for (let i = 0; i < maxIter; i++) {
      let ran = false;
      for (const pred of preds) {
        const condCtx: ConditionContext = { events: this.getAllEvents(), frame: ctx.frame, sourceEntityId: ctx.sourceEntityId, targetEntityId: ctx.targetEntityId, getControlledSlotAtFrame: this.getControlledSlotAtFrame };
        if (!evaluateConditions(pred.conditions, condCtx)) continue;
        if (!pred.effects.every(e => e.verb === VerbType.ALL || e.verb === VerbType.ANY || this.canDo(e, ctx))) continue;
        // Track output and cascade frames before this iteration
        const outputBefore = this.controller.getAllEvents().length;
        const cascadeBefore = this._compoundCascadeFrames.length;
        for (const child of pred.effects) this.interpret(child, ctx);
        // Fire reactive triggers for events created in this iteration so downstream
        // BECOME conditions see incremental state (e.g. MF 3→4, not 0→4).
        for (let j = outputBefore; j < this.controller.getAllEvents().length; j++) {
          const ev = this.controller.getAllEvents()[j];
          this.checkReactiveTriggers(VerbType.APPLY, ev.columnId, ctx.frame, ev.ownerEntityId, ctx.sourceSkillName, undefined, this._compoundCascadeFrames);
        }
        // Evaluate BECOME/HAVE conditions immediately, filtering out triggers
        // that don't pass at this iteration. The condition evaluator uses
        // activeEventsAtFrame to count stacks, so it correctly sees
        // pre-existing stacks from earlier compound invocations — essential
        // for the case where a status reaches its cap across multiple
        // talent fires (e.g. MF reaching 4 stacks across several basic
        // attack finishers, each consuming 1 heat infliction). Owner resolution
        // uses `contextSlotId` (slot ID) — not `sourceEntityId` (operator ID) —
        // because events are stored by slot ID, not operator JSON ID.
        let k = cascadeBefore;
        while (k < this._compoundCascadeFrames.length) {
          const qf = this._compoundCascadeFrames[k];
          const cascadeStateConds = qf.engineTrigger?.ctx.conditions.filter(c =>
            !EVENT_PRESENCE_VERBS.has(c.verb as VerbType)
          );
          if (cascadeStateConds && cascadeStateConds.length > 0) {
            const condCtx: ConditionContext = {
              events: this.getAllEvents(), frame: ctx.frame,
              sourceEntityId: ctx.contextSlotId ?? ctx.sourceEntityId,
            };
            if (!evaluateConditions(cascadeStateConds as unknown as Interaction[], condCtx)) {
              this._compoundCascadeFrames[k] = this._compoundCascadeFrames[this._compoundCascadeFrames.length - 1];
              this._compoundCascadeFrames.length--;
              continue;
            }
          }
          k++;
        }
        ran = true;
      }
      if (!ran) break;
    }
    return true;
  }

  private doAny(effect: Effect, ctx: InterpretContext) {
    const preds = effect.predicates ?? [];
    const condCtx: ConditionContext = { events: this.getAllEvents(), frame: ctx.frame, sourceEntityId: ctx.sourceEntityId, targetEntityId: ctx.targetEntityId, getControlledSlotAtFrame: this.getControlledSlotAtFrame };
    for (const pred of preds) {
      if (!evaluateConditions(pred.conditions, condCtx)) continue;
      for (const child of pred.effects) this.interpret(child, ctx);
      return true;
    }
    return false;
  }

  /**
   * CHANCE effect — pin-gated wrapper around child effects. Pure user-driven:
   * the probability ValueNode in `effect.with.value` is display-only (UI reads
   * it to show "Rare Fin: 12%"), it does NOT drive execution.
   *
   * Execution is deterministic per CritMode + per-frame `isChance` pin:
   *   ALWAYS   — hit branch (effects) fires, miss branch skipped
   *   NEVER    — miss branch (elseEffects) fires, hit branch skipped
   *   MANUAL / EXPECTED — per-frame pin drives it; unpinned defaults to MISS
   *
   * There is no probability-weighted expectation. Resource side-effects in the
   * hit branch fire at full strength if the branch fires, and not at all if it
   * doesn't. Spawned statuses from CHANCE branches carry no `expectedUptime`.
   */
  private doChance(effect: Effect, ctx: InterpretContext): boolean {
    // chancePin is pre-resolved from the override store in handleProcessFrame
    // (same pattern as isCrit). Runtime crit mode provides the unpinned default.
    const hit = shouldFireChance(getRuntimeCritMode(), ctx.chancePin);

    if (hit) {
      // Support both predicated (conditions + effects) and flat (effects only) forms.
      const preds = effect.predicates ??
        (effect.effects?.length ? [{ conditions: [] as readonly Interaction[], effects: effect.effects }] : []);
      const condCtx: ConditionContext = { events: this.getAllEvents(), frame: ctx.frame, sourceEntityId: ctx.sourceEntityId, targetEntityId: ctx.targetEntityId, potential: ctx.potential, getControlledSlotAtFrame: this.getControlledSlotAtFrame };
      for (const pred of preds) {
        if (pred.conditions.length > 0 && !evaluateConditions(pred.conditions, condCtx)) continue;
        for (const child of pred.effects) this.interpret(child, ctx);
      }
    } else {
      for (const child of effect.elseEffects ?? []) this.interpret(child, ctx);
    }
    return true;
  }

  // ── Physical status logic (hardcoded engine mechanics) ─────────────────

  /**
   * APPLY PHYSICAL STATUS (objectId: PHYSICAL) — hardcoded Lift/Breach/etc. logic.
   *
   * Lift mechanic:
   * - Always adds 1 Vulnerable stack.
   * - If enemy already has Vulnerable OR isForced: also creates the Lift status
   *   (1s duration, RESET stacking, 1 segment with damage + stagger at frame 0).
   * - Damage: 120% ATK (physical).
   * - Stagger: 10 × (1 + ArtsIntensity / 200).
   */
  /**
   * APPLY PHYSICAL STATUS — always returns true (effect was handled).
   * Sets `lastPhysicalStatusCreated` to indicate whether a physical status event
   * was actually created, so the caller can gate reactive triggers.
   */
  private lastPhysicalStatusCreated = false;
  /** Tracks the actual status ID consumed by CONSUME THIS EVENT, for reactive trigger dispatch. */
  private lastConsumedParentStatusId: string | undefined;
  /** Tracks the actual status ID applied by APPLY THIS EVENT, for reactive trigger dispatch. */
  private lastAppliedParentStatusId: string | undefined;
  private lastConsumedStacks: number | undefined;
  private applyPhysicalStatus(effect: Effect, ctx: InterpretContext): boolean {
    const qualifier = resolveQualifier(effect.objectQualifier);
    if (!qualifier || !PHYSICAL_STATUS_VALUES.has(qualifier)) return false;
    const columnId = qualifier;

    const source = {
      ownerEntityId: ctx.sourceEntityId,
      skillName: ctx.sourceSkillName,
      slotId: this.ctxSlot(ctx),
      operatorId: ctx.sourceEntityId,
      sourceEventUid: ctx.sourceEventUid,
    };
    const isForced = this.resolveWith(effect.with?.isForced, ctx) === 1;

    // Track output count before to detect whether a physical status was actually created
    const outputBefore = this.controller.getAllEvents().length;

    let result = false;
    const physCol = columnId as string;
    const parentUid = ctx.sourceEventUid;
    if (physCol === PHYSICAL_STATUS_COLUMNS.LIFT
      || physCol === PHYSICAL_STATUS_COLUMNS.KNOCK_DOWN) {
      result = this.applyLiftOrKnockDown(physCol, ctx.frame, source, isForced, parentUid, ctx.sourceCreationInteractionMode);
    } else if (physCol === PHYSICAL_STATUS_COLUMNS.CRUSH) {
      result = this.applyCrush(ctx.frame, source, isForced, parentUid, ctx.sourceCreationInteractionMode);
    } else if (physCol === PHYSICAL_STATUS_COLUMNS.BREACH) {
      result = this.applyBreach(ctx.frame, source, isForced, parentUid, ctx.sourceCreationInteractionMode);
    }

    // Check if a physical status event was created (not just Vulnerable)
    this.lastPhysicalStatusCreated = this.controller.getAllEvents().slice(outputBefore).some(
      ev => ev.columnId === columnId,
    );

    // Any physical status application consumes active Solidification → Shatter
    if (result) {
      this.tryConsumeSolidification(ctx.frame, source, this.ctxSlot(ctx), ctx.sourceEventUid, ctx.sourceCreationInteractionMode);
    }

    return result;
  }

  /**
   * Shared logic for Lift and Knock Down — identical mechanics:
   * 120% ATK physical damage, 10 base stagger, 1s RESET, Vulnerable gate.
   */
  private applyLiftOrKnockDown(
    columnId: string,
    frame: number,
    source: EventSource,
    isForced: boolean,
    parentEventUid?: string,
    creationInteractionMode?: InteractionModeType,
  ): boolean {
    const parents = parentEventUid ? [parentEventUid] : undefined;
    const hasVulnerable = this.controller.activeCount(
      PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, ENEMY_ID, frame,
    ) > 0;

    // Always add 1 Vulnerable stack
    this.controller.applyEvent(
      PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, ENEMY_ID, frame,
      PHYSICAL_INFLICTION_DURATION, source,
      { uid: derivedEventUid(PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, source.ownerEntityId, frame), parents,
        ...(creationInteractionMode != null ? { event: { creationInteractionMode } } : {}),
      },
    );

    // Status only triggers if enemy had Vulnerable OR isForced
    if (!hasVulnerable && !isForced) return true;

    const statusId = columnId as PhysicalStatusType;
    const label = STATUS_LABELS[statusId];

    this.controller.applyEvent(
      columnId, ENEMY_ID, frame, LIFT_KNOCK_DOWN_DURATION, source, {
        statusId,
        stackingMode: StackInteractionType.RESET,
        maxStacks: 1,
        uid: derivedEventUid(columnId, source.ownerEntityId, frame),
        parents,
        event: {
          ...(creationInteractionMode != null ? { creationInteractionMode } : {}),
          name: label,
          segments: [{
            properties: { duration: LIFT_KNOCK_DOWN_DURATION, name: label },
            frames: [{
              offsetFrame: 0,
              damageElement: ElementType.PHYSICAL,
              clauses: [buildDealDamageClause({
                multiplier: LIFT_KNOCK_DOWN_DAMAGE_MULTIPLIER,
                element: ElementType.PHYSICAL,
                mainStat: 'ATTACK' as DamageScalingStatType,
              })],
            }],
          }],
        },
      },
    );

    return true;
  }

  /**
   * Crush — consumes all Vulnerable stacks, deals damage scaling with stacks consumed.
   *
   * - No Vulnerable → add 1 Vulnerable stack, no Crush status
   * - Vulnerable active → consume ALL stacks → create Crush event
   *   with damageMultiplier based on stacks consumed (300%/450%/600%/750%)
   * - No stagger, no forced variant
   */
  private applyCrush(
    frame: number,
    source: EventSource,
    isForced: boolean,
    parentEventUid?: string,
    creationInteractionMode?: InteractionModeType,
  ): boolean {
    const parents = parentEventUid ? [parentEventUid] : undefined;
    const vulnerableCount = this.controller.activeCount(
      PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, ENEMY_ID, frame,
    );

    if (vulnerableCount === 0) {
      // No Vulnerable stacks active. Unless forced (e.g. freeform placement),
      // just add 1 stack and skip creating a Crush.
      if (!isForced) {
        this.controller.applyEvent(
          PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, ENEMY_ID, frame,
          PHYSICAL_INFLICTION_DURATION, source,
          { uid: derivedEventUid(PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, source.ownerEntityId, frame, 'crush'), parents,
            ...(creationInteractionMode != null ? { event: { creationInteractionMode } } : {}),
          },
        );
        return true;
      }
      // Forced: proceed to create Crush as if 1 Vulnerable stack was consumed.
    }

    // Consume all Vulnerable stacks (or treat as 1 when forced with none active).
    const consumed = vulnerableCount > 0
      ? this.controller.consumeEvent(
        PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, ENEMY_ID, frame,
        source, { count: vulnerableCount },
      )
      : 1;

    const damageMultiplier = getPhysicalStatusBaseMultiplier(PhysicalStatusType.CRUSH, consumed);

    this.controller.applyEvent(
      PHYSICAL_STATUS_COLUMNS.CRUSH, ENEMY_ID, frame, LIFT_KNOCK_DOWN_DURATION, source, {
        statusId: PhysicalStatusType.CRUSH,
        stackingMode: StackInteractionType.RESET,
        maxStacks: 1,
        uid: derivedEventUid(PhysicalStatusType.CRUSH, source.ownerEntityId, frame),
        parents,
        event: {
          ...(creationInteractionMode != null ? { creationInteractionMode } : {}),
          stacks: consumed,
          segments: [{
            properties: { duration: LIFT_KNOCK_DOWN_DURATION, name: STATUS_LABELS[PhysicalStatusType.CRUSH] },
            frames: [{
              offsetFrame: 0,
              damageElement: ElementType.PHYSICAL,
              clauses: [buildDealDamageClause({ multiplier: damageMultiplier, element: ElementType.PHYSICAL })],
            }],
          }],
        },
      },
    );

    return true;
  }

  /**
   * Breach — consumes all Vulnerable stacks, deals initial damage + applies
   * a lingering fragility debuff (increased Physical DMG taken).
   *
   * - No Vulnerable → add 1 Vulnerable stack, no Breach status
   * - Vulnerable active → consume ALL stacks → create Breach event
   *   with duration and multiplier based on stacks consumed
   *   (1→100%/12s, 2→150%/18s, 3→200%/24s, 4→250%/30s)
   * - stacks is set for fragility lookup by EventsQueryService
   * - No stagger, no forced variant
   */
  private applyBreach(
    frame: number,
    source: EventSource,
    isForced: boolean,
    parentEventUid?: string,
    creationInteractionMode?: InteractionModeType,
  ): boolean {
    const parents = parentEventUid ? [parentEventUid] : undefined;
    const vulnerableCount = this.controller.activeCount(
      PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, ENEMY_ID, frame,
    );

    if (vulnerableCount === 0) {
      if (!isForced) {
        this.controller.applyEvent(
          PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, ENEMY_ID, frame,
          PHYSICAL_INFLICTION_DURATION, source,
          { uid: derivedEventUid(PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, source.ownerEntityId, frame, 'breach'), parents,
            ...(creationInteractionMode != null ? { event: { creationInteractionMode } } : {}),
          },
        );
        return true;
      }
      // Forced: proceed to create Breach as if 1 Vulnerable stack was consumed.
    }

    const consumed = vulnerableCount > 0
      ? this.controller.consumeEvent(
        PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, ENEMY_ID, frame,
        source, { count: vulnerableCount },
      )
      : 1;

    const stackCount = Math.min(consumed, 4);
    const damageMultiplier = getPhysicalStatusBaseMultiplier(PhysicalStatusType.BREACH, consumed);
    const durationFrames = BREACH_DURATION[stackCount] ?? BREACH_DURATION[1];

    this.controller.applyEvent(
      PHYSICAL_STATUS_COLUMNS.BREACH, ENEMY_ID, frame, durationFrames, source, {
        statusId: PhysicalStatusType.BREACH,
        stackingMode: StackInteractionType.RESET,
        maxStacks: 1,
        uid: derivedEventUid(PhysicalStatusType.BREACH, source.ownerEntityId, frame),
        parents,
        event: {
          ...(creationInteractionMode != null ? { creationInteractionMode } : {}),
          stacks: stackCount,
          segments: [{
            properties: { duration: durationFrames, name: STATUS_LABELS[PhysicalStatusType.BREACH] },
            frames: [{
              offsetFrame: 0,
              damageElement: ElementType.PHYSICAL,
              clauses: [buildDealDamageClause({ multiplier: damageMultiplier, element: ElementType.PHYSICAL })],
            }],
          }],
        },
      },
    );

    return true;
  }

  /**
   * If the enemy has active Solidification, consume it and create a Shatter
   * reaction. Shatter uses the trigger operator's stats (source), not the
   * solidification applicator's.
   */
  private tryConsumeSolidification(
    frame: number,
    source: EventSource,
    triggerSlotId: string,
    parentEventUid?: string,
    creationInteractionMode?: InteractionModeType,
  ): void {
    const active = this.controller.getActiveEvents(
      REACTION_COLUMNS.SOLIDIFICATION, ENEMY_ID, frame,
    );
    if (active.length === 0) return;

    const solidEvent = active[active.length - 1];
    const stacks = Math.min(solidEvent.statusLevel ?? 1, 4) as StatusLevel;

    // Consume the solidification
    this.controller.consumeEvent(
      REACTION_COLUMNS.SOLIDIFICATION, ENEMY_ID, frame, source,
    );

    // Create Shatter reaction with physical damage frame at offset 0.
    // Parents: [triggering event, solidification event consumed] — multi-parent
    // because the shatter is caused by both the new physical hit AND the
    // pre-existing solidification it just consumed.
    const shatterMultiplier = getShatterBaseMultiplier(stacks);
    const shatterParents: string[] = [];
    if (parentEventUid) shatterParents.push(parentEventUid);
    shatterParents.push(solidEvent.uid);
    this.controller.applyEvent(
      REACTION_COLUMNS.SHATTER, ENEMY_ID, frame, SHATTER_DURATION, source, {
        stacks,
        uid: derivedEventUid(REACTION_COLUMNS.SHATTER, source.ownerEntityId, frame),
        parents: shatterParents,
        ...(creationInteractionMode != null ? { event: { creationInteractionMode } } : {}),
      },
    );

    // Attach segment with damage frame (createReaction builds a default segment,
    // but shatter needs a physical damage frame — rebuild segments here).
    const shatterEvents = this.controller.getActiveEvents(
      REACTION_COLUMNS.SHATTER, ENEMY_ID, frame,
    );
    if (shatterEvents.length > 0) {
      const shatter = shatterEvents[shatterEvents.length - 1];
      const dur = eventDuration(shatter);
      shatter.segments = [{
        properties: { duration: dur, name: resolveEventLabel(shatter) },
        frames: [{
          offsetFrame: 0,
          damageElement: ElementType.PHYSICAL,
          clauses: [buildDealDamageClause({ multiplier: shatterMultiplier, element: ElementType.PHYSICAL })],
        }],
      }];
    }

    // Fire reactive triggers for the derived Shatter event so talents like
    // Commiseration (THIS OPERATOR APPLY STATUS REACTION SHATTER) can match.
    // Use source.ownerEntityId (the operator that caused the shatter) so THIS OPERATOR
    // subject filters resolve to that slot, mirroring how clause-based APPLY
    // REACTION effects route through reactiveTriggersForEffect with the parent
    // event's owner. Queue directly into _processFrameOut so the main
    // processFrame loop dispatches the triggered talent next.
    this.checkReactiveTriggers(
      VerbType.APPLY, REACTION_COLUMNS.SHATTER, frame, triggerSlotId, source.skillName,
      undefined, this._processFrameOut,
    );
  }

  // ── PROCESS_FRAME handler ──────────────────────────────────────────────

  /**
   * Unified frame processing: all effects on a frame marker execute
   * sequentially in config order. Replaces the old split collection
   * functions (collectInflictionEntries, collectFrameEffectEntries, etc.).
   */
  private handleProcessFrame(entry: QueueFrame): QueueFrame[] {
    const event = entry.sourceEvent!;
    // Reset the output buffer BEFORE any push (damage tick path can append
    // HP threshold triggers to it before the main handler runs).
    this._processFrameOut.length = 0;
    // Skip if the source event was consumed before this frame fires.
    // Queue entries hold pre-consume event snapshots; always consult live state by uid.
    const liveEvent = this.getAllEvents().find(e => e.uid === event.uid) ?? event;
    if (liveEvent.eventStatus === EventStatusType.CONSUMED && liveEvent.startFrame + eventDuration(liveEvent) <= entry.frame) {
      return this._processFrameOut;
    }
    // Push an incremental enemy damage tick if this frame has a damage
    // multiplier on a skill event. Also fires HP threshold checks reactively
    // (only runs when HP actually changed).
    this._pushEnemyDamageTickForFrame(entry, this._processFrameOut);
    const frame = entry.frameMarker;
    const si = entry.segmentIndex ?? -1;
    const fi = entry.frameIndex ?? -1;
    const absFrame = entry.frame;
    const source = {
      ownerEntityId: event.sourceEntityId ?? this.slotToEntityId(event.ownerEntityId),
      skillName: event.sourceSkillName ?? event.id,
      sourceEventUid: event.uid,
    };
    const newEntries = this._processFrameOut;
    // Note: _processFrameOut was already reset at the top of this function
    // so the damage tick path can append HP threshold triggers before this
    // point. Do NOT clear again here.

    // For derived events whose ownerEntityId is the target (enemy), pot/loadout
    // properties must be read from the routed source slot.
    const routedForPot = this.resolveRoutedSource(event);
    const pot = this.loadoutProperties?.[routedForPot.sourceSlotId]?.operator.potential ?? 0;
    const talentLvl = this.loadoutProperties?.[routedForPot.sourceSlotId]?.operator.talentOneLevel ?? 0;

    // ── 1. Lifecycle hooks (EVENT_START / EVENT_END) ─────────────────────
    if (entry.hookType === FrameHookType.EVENT_START) {
      // Link consumption for battle skills and ultimates
      if (event.columnId === NounType.BATTLE || event.columnId === NounType.ULTIMATE) {
        this.controller.consumeLink(event.uid, absFrame, source);

        // Re-resolve conditional segment durations that depend on LINK consumption.
        // STACKS of LINK of THIS EVENT resolves to consumed LINK count via getEventStacks.
        // At event creation time getEventStacks wasn't available — re-resolve now.
        const linkStacks = this.controller.getLinkStacks(event.uid);
        if (linkStacks > 0) {
          const operatorIdForLink = this.slotOperatorMap?.[event.ownerEntityId];
          const skillDefForLink = operatorIdForLink ? getOperatorSkill(operatorIdForLink, event.id) : undefined;
          if (skillDefForLink?.segments) {
            const skillCtx = this.buildValueContext({ frame: absFrame, sourceEntityId: this.slotToEntityId(event.ownerEntityId), sourceSkillName: event.id, potential: pot });
            const eventCtx: ValueResolutionContext = {
              ...skillCtx,
              getEventStacks: (statusId) => statusId === StatusType.LINK ? linkStacks : 0,
            };
            for (let si = 0; si < event.segments.length && si < (skillDefForLink.segments as unknown[]).length; si++) {
              const rawSeg = (skillDefForLink.segments as { properties?: { duration?: { value?: unknown; unit?: string } } }[])[si];
              const rawDur = rawSeg?.properties?.duration;
              if (rawDur?.value && typeof rawDur.value === 'object' && 'operation' in (rawDur.value as Record<string, unknown>)) {
                const resolved = resolveValueNode(rawDur.value as ValueNode, eventCtx);
                const resolvedFrames = Math.round(resolved * FPS);
                if (resolvedFrames !== event.segments[si].properties.duration) {
                  event.segments[si].properties.duration = resolvedFrames;
                }
              }
            }
          }
        }
      }

      // ── Resource controller notifications (event-level, not frame-level) ──
      // Battle skill SP cost
      if (event.columnId === NounType.BATTLE && event.skillPointCost) {
        const firstFrame = event.segments[0]?.frames?.[0];
        const ueGainFrame = firstFrame?.absoluteFrame ?? event.startFrame;
        this.controller.recordSkillPointCost(event.uid, event.startFrame, event.skillPointCost, event.ownerEntityId, ueGainFrame);
      }
      // Ultimate: consume UE + register no-gain windows
      if (event.columnId === NounType.ULTIMATE) {
        this.controller.consumeUltimateEnergy(event.startFrame, event.ownerEntityId);
        const windows = collectNoGainWindowsForEvent(event);
        for (const w of windows) {
          this.controller.addNoGainWindow(w.start, w.end, event.ownerEntityId);
        }
      }

      // Generic PERFORM trigger (PERFORM BATTLE_SKILL, etc.)
      this.checkReactiveTriggers(VerbType.PERFORM, event.columnId, absFrame, event.ownerEntityId, event.id, event.enhancementType, newEntries);

      // Skill-level onEntryClause: look up the OperatorSkill and execute effects
      // via the unified clause dispatcher.
      const operatorId = this.slotOperatorMap?.[event.ownerEntityId];
      const skillDef = operatorId ? getOperatorSkill(operatorId, event.id) : undefined;
      if (skillDef?.onEntryClause?.length) {
        const eventEnd = event.startFrame + eventDuration(event);
        // Resolve supplied parameters from event
        const entryParams: Record<string, number> = {};
        const paramDefs = event.suppliedParameters;
        if (paramDefs) {
          const userValues = (event as { parameterValues?: Record<string, number> }).parameterValues;
          const varyByDefs = paramDefs.VARY_BY ?? (paramDefs as unknown as { id: string; default: number }[]);
          const defs = Array.isArray(varyByDefs) ? varyByDefs : [];
          for (const def of defs) {
            const rawEntryVal = userValues?.[def.id] ?? (def as { default?: number }).default ?? def.lowerRange;
            entryParams[def.id] = rawEntryVal - def.lowerRange;
          }
        }
        const hasEntryParams = Object.keys(entryParams).length > 0;
        const entryCtx: InterpretContext = {
          frame: absFrame,
          sourceEntityId: source.ownerEntityId,
                    sourceSkillName: event.id,
          potential: pot,
          parentEventEndFrame: eventEnd,
          ...(hasEntryParams ? { suppliedParameters: entryParams } : {}),
        };
        const entryCondCtx: ConditionContext = {
          events: this.getAllEvents(),
          frame: absFrame,
          sourceEntityId: event.ownerEntityId,
          potential: pot,
          ...(hasEntryParams ? { suppliedParameters: entryParams } : {}),
        };
        const entryParsed = parseJsonClauseArray(skillDef.onEntryClause as { conditions?: unknown[]; effects?: unknown[] }[]);
        this.dispatchClauseFrame(
          entryParsed, undefined, entryCtx, entryCondCtx,
          event.ownerEntityId, event.id, newEntries,
          { fireReactiveTriggers: false, trackStatReversals: false },
        );
      }

      // Non-skill status events: clause processing (APPLY STAT, onEntryClause,
      // DISABLE/ENABLE propagation, segment frame markers) is handled by
      // runStatusCreationLifecycle on the applied event created by doApply.
      // Do NOT process clauses here — it would double-fire stat triggers.

      return newEntries;
    }

    if (entry.hookType === FrameHookType.EVENT_END) {
      // Fire IS_NOT column triggers for non-skill status events (e.g. MF stack expiry).
      // Stat-based BECOME_NOT triggers (SLOWED, STAGGERED) are fired separately below.
      if (!SKILL_COLUMN_SET.has(event.columnId)) {
        // Skip IS_NOT if another event is still active on the same column for the
        // same owner — the state hasn't actually ended. This covers two cases:
        //  1. Consumed events whose pre-scheduled EVENT_END fires past the clamped
        //     duration — a later overlapping event keeps the state active.
        //  2. A new status/infliction was applied while the expiring one was still
        //     counting down, so the state transitions stay→stay rather than stay→end.
        this.checkReactiveTriggers(`${VerbType.IS}_NOT`, event.columnId, absFrame, event.ownerEntityId, event.id, undefined, newEntries);
        // Generic stat-based: fire BECOME_NOT for each stat-adjective the status provides
        const statusDef = getStatusDef(event.id);
        if (statusDef?.clause) {
          for (const clause of statusDef.clause as { effects?: { verb?: string; object?: string; objectId?: string }[] }[]) {
            for (const ef of clause.effects ?? []) {
              if (ef.verb === VerbType.APPLY && ef.object === NounType.STAT) {
                const adj = STAT_TO_STATE_ADJECTIVE[ef.objectId as StatType];
                if (adj) this.checkReactiveTriggers(`${VerbType.BECOME}_NOT`, adj, absFrame, event.ownerEntityId, event.id, undefined, newEntries);
              }
            }
          }
        }
      }
      // Skill-level onExitClause: dispatched via the unified helper.
      const exitEntityId = this.slotOperatorMap?.[event.ownerEntityId];
      const exitSkillDef = exitEntityId ? getOperatorSkill(exitEntityId, event.id) : undefined;
      if (exitSkillDef?.onExitClause?.length) {
        const exitCtx: InterpretContext = {
          frame: absFrame,
          sourceEntityId: this.slotToEntityId(event.ownerEntityId),
          sourceSkillName: event.id,
          potential: pot,
        };
        const exitCondCtx: ConditionContext = {
          events: this.getAllEvents(),
          frame: absFrame,
          sourceEntityId: event.ownerEntityId,
        };
        const exitParsed = parseJsonClauseArray(exitSkillDef.onExitClause as { conditions?: unknown[]; effects?: unknown[] }[]);
        this.dispatchClauseFrame(
          exitParsed, undefined, exitCtx, exitCondCtx,
          event.ownerEntityId, event.id, newEntries,
          { fireReactiveTriggers: false, trackStatReversals: false },
        );
      }
      return newEntries;
    }

    // ── Segment lifecycle hooks (SEGMENT_START / SEGMENT_END) ──────────
    if (entry.hookType === FrameHookType.SEGMENT_START || entry.hookType === FrameHookType.SEGMENT_END) {
      const segOperatorId = this.slotOperatorMap?.[event.ownerEntityId];
      const segSkillDef = segOperatorId ? getOperatorSkill(segOperatorId, event.id) : undefined;
      const segIdx = entry.segmentIndex ?? -1;
      const segJson = (segSkillDef?.segments as unknown as Record<string, unknown>[] | undefined)?.[segIdx];
      const clauseKey = entry.hookType === FrameHookType.SEGMENT_START ? 'onEntryClause' : 'onExitClause';
      const segClauses = (segJson as Record<string, unknown> | undefined)?.[clauseKey] as { conditions?: unknown[]; effects?: unknown[] }[] | undefined;
      if (segClauses?.length) {
        // Compute segment end frame for context
        let segStartFrame = event.startFrame;
        for (let i = 0; i < segIdx; i++) {
          segStartFrame += event.segments[i]?.properties.duration ?? 0;
        }
        const segEndFrame = segStartFrame + (event.segments[segIdx]?.properties.duration ?? 0);
        const eventEnd = event.startFrame + eventDuration(event);
        const segCtx: InterpretContext = {
          frame: absFrame,
          sourceEntityId: source.ownerEntityId,
                    sourceSkillName: event.id,
          potential: pot,
          parentEventEndFrame: eventEnd,
          parentSegmentEndFrame: segEndFrame,
        };
        const segCondCtx: ConditionContext = {
          events: this.getAllEvents(),
          frame: absFrame,
          sourceEntityId: event.ownerEntityId,
          potential: pot,
        };
        const segParsed = parseJsonClauseArray(segClauses);
        this.dispatchClauseFrame(
          segParsed, undefined, segCtx, segCondCtx,
          event.ownerEntityId, event.id, newEntries,
          { fireReactiveTriggers: false, trackStatReversals: false },
        );
      }
      return newEntries;
    }

    if (!frame) return newEntries; // safety check

    // ── 2. Combo trigger source duplication ──────────────────────────────
    // Frames marked with `duplicateTriggerSource` mirror the triggering
    // source's infliction / physical status onto the combo's owner. The
    // trigger source is resolved via the live uid ref on `event.triggerEventUid`
    // (set by _applyComboWindowToCombos / resolveComboTrigger). We synthesize
    // an APPLY clause and route it through interpret() so reactive triggers
    // fire through the same path as every other clause.
    if (frame.duplicateTriggerSource && event.triggerEventUid) {
      const src = this.getAllEvents().find(e => e.uid === event.triggerEventUid);
      const triggerCol: string | undefined = src?.columnId;
      let synthEffect: Effect | undefined;
      if (triggerCol && INFLICTION_COLUMN_IDS.has(triggerCol)) {
        const element = INFLICTION_COLUMN_TO_ELEMENT[triggerCol];
        if (element) {
          synthEffect = {
            verb: VerbType.APPLY,
            object: NounType.INFLICTION,
            objectQualifier: element,
            to: NounType.ENEMY,
          } as Effect;
        }
      } else if (triggerCol && PHYSICAL_STATUS_COLUMN_IDS.has(triggerCol)) {
        synthEffect = {
          verb: VerbType.APPLY,
          object: NounType.STATUS,
          objectId: AdjectiveType.PHYSICAL,
          objectQualifier: triggerCol,
          to: NounType.ENEMY,
        } as Effect;
      }
      if (synthEffect) {
        const dupCtx: InterpretContext = {
          frame: absFrame,
          sourceEntityId: this.slotToEntityId(event.ownerEntityId),
          sourceSkillName: event.id,
        };
        this.interpret(synthEffect, dupCtx);
        this.reactiveTriggersForEffect(synthEffect, absFrame, event.ownerEntityId, event.id, newEntries, this.lastConsumedStacks);
        this.lastConsumedStacks = undefined;
      }
    }

    // ── 3. Clause loop — all effects through interpret() ─────────────
    if (frame.clauses) {
      // Compute segment end frame for EXTEND UNTIL END OF SEGMENT
      const parentEventEnd = event.startFrame + eventDuration(event);
      let parentSegEnd = parentEventEnd;
      let segStart = event.startFrame;
      for (const seg of event.segments) {
        const segEnd = segStart + (seg.properties.duration ?? 0);
        if (absFrame >= segStart && absFrame < segEnd) { parentSegEnd = segEnd; break; }
        segStart = segEnd;
      }

      // Resolve supplied parameters: user-set values on event, or defaults from frame/event definitions
      const resolvedParams: Record<string, number> = {};
      const paramDefs = frame.suppliedParameters ?? event.suppliedParameters;
      if (paramDefs) {
        const userValues = (event as { parameterValues?: Record<string, number> }).parameterValues;
        const varyByDefs = paramDefs.VARY_BY ?? (paramDefs as unknown as { id: string; lowerRange: number }[]);
        const defs = Array.isArray(varyByDefs) ? varyByDefs : [];
        for (const def of defs) {
          const rawVal = userValues?.[def.id] ?? def.lowerRange;
          resolvedParams[def.id] = rawVal - def.lowerRange;
        }
      }
      const hasSuppliedParams = Object.keys(resolvedParams).length > 0;
      // For derived events (e.g. THUNDERLANCE_PIERCE applied to enemy by
      // Avywenna's BS), event.ownerEntityId is the target (enemy) and event.sourceEntityId
      // is the source operator. UE gains from clauses on this frame must route
      // back to the source operator's slot via resolveRoutedSource.
      const routed = this.resolveRoutedSource(event);
      // Propagate uid + creationInteractionMode from freeform/derived user
      // events into child events created by the clause loop (e.g. freeform
      // MF → doApply → configDrivenStatusColumn.add). Guarded by non-skill
      // column + creationInteractionMode so user-placed skill events whose
      // clauses create child statuses still get fresh derived uids.
      const propagateUid = event.creationInteractionMode != null
        && !SKILL_COLUMN_SET.has(event.columnId);
      // Pre-resolve the CHANCE pin from the override store (same as isCrit pin
      // at line ~2700). doChance reads ctx.chancePin directly — no UID lookup.
      const resolvedChancePin = hasChanceClause(frame.clauses)
        ? this.overrides?.[buildOverrideKey(event)]?.segments?.[si]?.frames?.[fi]?.isChance
        : undefined;
      const interpretCtx: InterpretContext = {
        frame: absFrame,
        sourceEntityId: routed.sourceEntityId,
        sourceSkillName: event.id,
        sourceEventUid: propagateUid ? event.uid : undefined,
        sourceEventColumnId: propagateUid ? event.columnId : undefined,
        sourceCreationInteractionMode: propagateUid ? event.creationInteractionMode : undefined,
        potential: pot,
        parentEventEndFrame: parentEventEnd,
        parentSegmentEndFrame: parentSegEnd,
        sourceFrameKey: hasDealDamageClause(frame.clauses)
          ? `${event.uid}:${si}:${fi}` : undefined,
        ...(resolvedChancePin != null ? { chancePin: resolvedChancePin } : {}),
        ...(hasSuppliedParams ? { suppliedParameters: resolvedParams } : {}),
        ...(event.consumedStacks != null ? { consumedStacks: event.consumedStacks } : {}),
        // Freeform wrappers route runtime-user-edited fields (`susceptibility`)
        // onto applied child events through this reference. Non-skill freeform
        // only — skill events don't need to thread runtime state this way.
        ...(propagateUid ? { sourceEvent: event } : {}),
      };
      const condCtx: ConditionContext = {
        events: this.getAllEvents(),
        frame: absFrame,
        sourceEntityId: event.ownerEntityId,
        potential: pot,
        talentLevel: talentLvl,
        suppliedParameters: resolvedParams,
        getControlledSlotAtFrame: this.getControlledSlotAtFrame,
        getOperatorPercentageHp: this.controller.hasHpController() ? (opId, f) => this.controller.getOperatorPercentageHp(opId, f) : undefined,
        getEnemyHpPercentage: this.getEnemyHpPercentage,
        sourceEventUid: event.uid,
        getLinkStacks: (uid) => this.controller.getLinkStacks(uid),
        getStatValue: this.controller.hasStatAccumulator() ? (entityId, stat) => this.controller.getStat(entityId, stat) : undefined,
      };
      const { anyMatched, acceptedClauses } = this.dispatchClauseFrame(
        frame.clauses, frame.clauseType, interpretCtx, condCtx,
        event.ownerEntityId, event.id, newEntries,
        { fireReactiveTriggers: true, trackStatReversals: true },
      );
      // Narrow frame clauses to only matched predicates so the damage table
      // builder sees the correct multiplier (e.g. HP-gated NOT clauses).
      if (acceptedClauses !== frame.clauses) {
        (frame as { clauses: readonly FrameClausePredicate[] }).clauses = acceptedClauses;
      }
      // If no clause matched, mark frame as skipped so the damage table builder skips it
      if (!anyMatched) {
        frame.frameSkipped = true;
      }
    }


    // ── 3c. Snapshot stat deltas for damage frames (captures runtime APPLY STAT effects)
    if (this.controller.hasStatAccumulator() && hasDealDamageClause(frame.clauses) && !frame.frameSkipped) {
      const frameKey = `${event.uid}:${si}:${fi}`;
      this.controller.snapshotStatDeltas(frameKey, event.ownerEntityId);
      // Also snapshot enemy deltas so the damage formula can read enemy-side
      // factor stats (e.g. WEAKNESS) at frame resolution.
      this.controller.snapshotStatDeltas(frameKey, ENEMY_ID);
      // Snapshot TEAM deltas so team-wide APPLY STAT effects (e.g. Wildland
      // Trekker electric DMG bonus) are visible to the damage formula.
      this.controller.snapshotStatDeltas(frameKey, TEAM_ID);
    }

    // Reverse frame-scoped APPLY STAT deltas so they don't persist to later frames
    if (this._frameStatReversals?.length && this.controller.hasStatAccumulator()) {
      for (const r of this._frameStatReversals) {
        this.controller.applyStatDelta(event.ownerEntityId, { [r.stat]: r.value });
      }
      this._frameStatReversals = undefined;
    }

    // ── 3d. Crit resolution for damage frames (stat accumulator + trigger emission)
    if (this.controller.hasStatAccumulator() && hasDealDamageClause(frame.clauses)) {
      const isDot = frame.damageType === DamageType.DAMAGE_OVER_TIME;
      if (!isDot) {
        const pin = this.overrides?.[buildOverrideKey(event)]?.segments?.[si]?.frames?.[fi]?.isCritical;
        const critMode = this.critMode ?? CritMode.EXPECTED;
        // `frame.isCrit` is a per-run display field resolved from the
        // override store, not persistent state:
        //   MANUAL: user-input mode — pin ?? false (unpinned frames render
        //     as no-crit; the user can click each one to toggle).
        //   NEVER/ALWAYS/EXPECTED: write only when an explicit pin exists;
        //     unpinned frames leave isCrit undefined, and the calculation
        //     mode drives the displayed total via effectiveCrit below.
        // Cross-run persistence flows naturally: explicit pins live in the
        // override store and get re-read on every pipeline run.
        if (critMode === CritMode.MANUAL) {
          frame.isCrit = pin ?? false;
        } else if (pin != null) {
          frame.isCrit = pin;
        }
        // Populate frame.isChance from the override store (same pattern as isCrit).
        // Only written when the frame carries a CHANCE compound.
        if (hasChanceClause(frame.clauses)) {
          const chancePin = this.overrides?.[buildOverrideKey(event)]?.segments?.[si]?.frames?.[fi]?.isChance;
          // Same pattern as isCrit: explicit pin always persists (settable in
          // any mode). Mode only provides the default for unpinned frames.
          const runtimeMode = getRuntimeCritMode();
          if (runtimeMode === CritMode.MANUAL) {
            frame.isChance = chancePin ?? false;
          } else if (chancePin != null) {
            frame.isChance = chancePin;
          }
        }

        // Derive effective crit for trigger emission
        // NEVER/ALWAYS/EXPECTED override pins — the mode is authoritative
        const effectiveCrit = critMode === CritMode.ALWAYS || critMode === CritMode.EXPECTED ? true
          : critMode === CritMode.NEVER ? false
          : (pin ?? false);
        // ── 3d. Emit PERFORM CRITICAL_HIT for crit damage frames ──────
        if (effectiveCrit === true) {
          this.checkReactiveTriggers(VerbType.PERFORM, NounType.CRITICAL_HIT, absFrame, event.ownerEntityId, event.id, undefined, newEntries);
        }
      }
    }

    // ── 3e. Enemy action: actually apply damage to operators ──
    // The DEAL DAMAGE clause attached to the enemy action frame routes through
    // the dsl loop above for reactive trigger dispatch (PFP, etc.). This block
    // handles the HP/shield reduction side: doDeal currently only fires for
    // `to: OPERATOR`, so the parser-emitted clause (which has no `to`) is a
    // no-op for HP. Synthesize a `to: OPERATOR, toDeterminer: ALL` Effect and
    // run doDeal to apply damage to every operator slot. NOTE: this does NOT
    // call checkReactiveTriggers — the dsl loop above already fired it.
    if (event.ownerEntityId === ENEMY_ID && event.columnId === ENEMY_ACTION_COLUMN_ID) {
      const dealInfo = findDealDamageInClauses(frame.clauses);
      if (dealInfo) {
        const dealCtx: InterpretContext = {
          frame: absFrame,
          sourceEntityId: this.slotToEntityId(event.ownerEntityId),
          sourceSkillName: event.id,
          potential: 0,
        };
        const dealEffect: Effect = {
          verb: VerbType.DEAL,
          objectQualifier: dealInfo.element as Effect['objectQualifier'],
          object: NounType.DAMAGE,
          to: NounType.OPERATOR,
          toDeterminer: DeterminerType.ALL,
          with: { value: { verb: VerbType.IS, value: 1 } as unknown as import('../../dsl/semantics').ValueNode },
        };
        this.doDeal(dealEffect, dealCtx);
      }
    }

    // ── 4. PERFORM triggers from frameTypes ─────────────────────────────
    if (frame.frameTypes) {
      for (const ft of frame.frameTypes) {
        if (ft === EventFrameType.FINAL_STRIKE || ft === EventFrameType.FINISHER || ft === EventFrameType.DIVE) {
          const performObject = ft === EventFrameType.FINAL_STRIKE ? NounType.FINAL_STRIKE
            : ft === EventFrameType.FINISHER ? NounType.FINISHER : NounType.DIVE;
          this.checkReactiveTriggers(VerbType.PERFORM, performObject, absFrame, event.ownerEntityId, event.id, undefined, newEntries);
        }
      }
    }

    // Propagate source frame key to all outgoing trigger entries so trigger-chain
    // statuses inherit the originating damage frame's identity.
    const sourceFrameKey = hasDealDamageClause(frame.clauses)
      ? `${event.uid}:${si}:${fi}` : undefined;
    if (sourceFrameKey) {
      for (const ne of newEntries) ne.sourceFrameKey = sourceFrameKey;
    }

    return newEntries;
  }

  /**
   * Run HP threshold checks at frame 0 (pipeline start) so conditions that
   * are trivially satisfied by initial HP state (e.g. "HP ≥ 100%") fire
   * before any damage has been written. Callable from runEventQueue after
   * talent registration, before the queue drain begins.
   */
  checkInitialHpThresholds(out: QueueFrame[]): QueueFrame[] {
    this._checkHpThresholds(0, '', '', out);
    return out;
  }

  /**
   * Check HP-threshold status defs and enqueue their ON_TRIGGER frames when
   * the HAVE conditions first match. Called reactively from
   * `_pushEnemyDamageTickForFrame` immediately after each damage tick is
   * written, and once at pipeline start via `checkInitialHpThresholds`.
   * Dedupe set `firedHpThresholds` enforces one-shot semantics.
   */
  private _checkHpThresholds(frame: number, slotId: string, sourceSkillName: string, out: QueueFrame[]) {
    if (!this.triggerIndex || !this.getEnemyHpPercentage) return;
    for (const entry of this.triggerIndex.getHpThresholdDefs()) {
      const dedupKey = `hp-threshold:${entry.def.properties.id}:${entry.operatorSlotId}`;
      if (this.firedHpThresholds.has(dedupKey)) continue;

      const condCtx: ConditionContext = {
        events: this.getAllEvents(),
        frame,
        sourceEntityId: entry.operatorSlotId,
        potential: entry.potential,
        getEnemyHpPercentage: this.getEnemyHpPercentage,
      };
      if (!evaluateConditions(entry.conditions as unknown as import('../../dsl/semantics').Interaction[], condCtx)) continue;

      this.firedHpThresholds.add(dedupKey);

      const triggerCtx: EngineTriggerContext = {
        def: entry.def, operatorId: entry.operatorId, operatorSlotId: entry.operatorSlotId,
        potential: entry.potential, operatorSlotMap: entry.operatorSlotMap,
        loadoutProperties: entry.loadoutProperties,
        conditions: [], triggerEffects: entry.triggerEffects,
      };
      out.push({
        frame, type: QueueFrameType.PROCESS_FRAME, hookType: FrameHookType.ON_TRIGGER,
        statusId: entry.def.properties.id, columnId: '', ownerEntityId: entry.operatorSlotId,
        sourceEntityId: entry.operatorId, sourceSkillName, maxStacks: 0, durationFrames: 0,
        operatorSlotId: entry.operatorSlotId,
        engineTrigger: { frame, sourceEntityId: entry.operatorId, triggerSlotId: slotId,
          sourceSkillName, ctx: triggerCtx, isEquip: entry.isEquip ?? false },
      });
    }
  }

  /**
   * Run a newly created status event's creation-time lifecycle: onEntryClause,
   * top-level `clause` APPLY STAT effects, DISABLE/ENABLE propagation, and
   * offset-0 segment frame markers. Offset > 0 segment frames + STATUS_EXIT
   * are deferred to the queue via `pendingExitFrames`.
   *
   * **Load-bearing inline dispatch.** Called *synchronously* from inside
   * `doApply`'s effect loop. Must NOT be migrated to the queue: a
   * subsequent effect at index `i+1` in the same clause must observe the
   * stat / status state written by `APPLY STATUS` at index `i`. Same-frame
   * FIFO queue ordering doesn't solve this — the queue only resumes
   * between entries, never mid-entry, so any queued lifecycle would land
   * after the rest of the current effect loop runs.
   */
  private runStatusCreationLifecycle(statusId: string | undefined, statusEntityId: string, ctx: InterpretContext) {
    if (!statusId) return;

    // Find the newly created status event
    const statusEvents = this.controller.getAllEvents().filter(
      ev => ev.id === statusId && ev.ownerEntityId === statusEntityId && ev.startFrame === ctx.frame,
    );
    const statusEv = statusEvents[statusEvents.length - 1];
    if (!statusEv) return;

    const parentEventEnd = statusEv.startFrame + eventDuration(statusEv);
    const source = {
      ownerEntityId: statusEv.sourceEntityId ?? this.slotToEntityId(statusEv.ownerEntityId),
      skillName: statusEv.sourceSkillName ?? statusEv.name,
      sourceEventUid: statusEv.uid,
    };
    // Read pot from the routed source slot for derived statuses (target=enemy).
    const routedForStatusPot = this.resolveRoutedSource(statusEv);
    const pot = this.loadoutProperties?.[routedForStatusPot.sourceSlotId]?.operator.potential ?? 0;

    // ── onEntryClause: dispatched via the unified helper ──────────────────
    const statusDef = getStatusDef(statusId);
    if (statusDef?.onEntryClause?.length) {
      const parentSegEnd = statusEv.startFrame + (statusEv.segments[0]?.properties.duration ?? 0);
      const entryCtx: InterpretContext = {
        ...ctx,
        sourceEventUid: undefined,
        parentEventEndFrame: parentEventEnd,
        parentSegmentEndFrame: parentSegEnd,
        parentStatusId: statusId,
      };
      const entryCondCtx: ConditionContext = {
        events: this.getAllEvents(),
        frame: ctx.frame,
        sourceEntityId: statusEntityId,
      };
      const parsedEntry = parseJsonClauseArray(statusDef.onEntryClause as { conditions?: unknown[]; effects?: unknown[] }[]);
      this.dispatchClauseFrame(
        parsedEntry, undefined, entryCtx, entryCondCtx,
        statusEntityId, statusId, this._processFrameOut,
        { fireReactiveTriggers: false, trackStatReversals: false },
      );
    }

    // ── clause: propagate DISABLE/ENABLE effects onto the derived event's segment ──
    // This allows hasDisableAtFrame / hasEnableClauseAtFrame to discover them.
    // Guard: only propagate once to avoid duplicates on pipeline re-processing.
    if (statusDef?.clause?.length && statusEv.segments.length > 0) {
      const seg = statusEv.segments[0];
      const alreadyPropagated = seg.clause?.some(c =>
        c.effects.some(e => e.verb === VerbType.DISABLE || e.verb === VerbType.ENABLE),
      );
      if (!alreadyPropagated) {
        const propagated: { conditions: unknown[]; effects: unknown[] }[] = [];
        for (const clause of statusDef.clause as { conditions: unknown[]; effects?: { verb: string }[] }[]) {
          const disableEnableEffects = (clause.effects ?? []).filter(e =>
            e.verb === VerbType.DISABLE || e.verb === VerbType.ENABLE,
          );
          if (disableEnableEffects.length > 0) {
            propagated.push({ conditions: clause.conditions ?? [], effects: disableEnableEffects });
          }
        }
        if (propagated.length > 0) {
          seg.clause = [...(seg.clause ?? []), ...(propagated as unknown as NonNullable<typeof seg.clause>)];
        }
      }
    }

    // ── Segment-level clauses ──────────────────────────────────────────────
    // `segments[i].clause` is the fundamental "effects active while this
    // segment is running" — APPLY STATUS/STAT/etc. inside a segment clause
    // dispatch at segment start with parentSegmentEndFrame scoped to the
    // segment duration, so applied statuses inherit segment-scoped lifetime.
    // Segment 0: inline at status creation. Segment i > 0: queued at segAbsStart.
    const defSegsForClauses = statusDef?.segments;
    const statusStops = this.controller.foreignStopsFor(statusEv);
    let cumOffsetForClauses = 0;
    if (defSegsForClauses) {
      for (let si = 0; si < statusEv.segments.length; si++) {
        const seg = statusEv.segments[si];
        const segDur = seg.properties.duration ?? 0;
        const defSegClauses = defSegsForClauses[si]?.clause as { conditions?: unknown[]; effects?: unknown[] }[] | undefined;
        if (defSegClauses?.length) {
          const segAbsStart = statusEv.startFrame + cumOffsetForClauses;
          const segEnd = segAbsStart + segDur;
          const routed = this.resolveRoutedSource(statusEv);
          const segCtx: InterpretContext = {
            frame: segAbsStart,
            sourceEntityId: routed.sourceEntityId,
            sourceSkillName: statusEv.name,
            sourceEventUid: undefined,
            potential: pot,
            parentEventEndFrame: parentEventEnd,
            parentSegmentEndFrame: segEnd,
            parentStatusId: statusId,
            ...(statusEv.consumedStacks != null ? { consumedStacks: statusEv.consumedStacks } : {}),
            ...(statusEv.triggerEntityId != null ? { triggerEntityId: statusEv.triggerEntityId } : {}),
          };
          const segCondCtx: ConditionContext = {
            events: this.getAllEvents(),
            frame: segAbsStart,
            sourceEntityId: statusEv.ownerEntityId,
            potential: pot,
            ...(statusEv.triggerEntityId != null ? { triggerEntityId: statusEv.triggerEntityId } : {}),
          };
          const parsedSegClauses = parseJsonClauseArray(defSegClauses);
          if (si === 0) {
            this.dispatchClauseFrame(
              parsedSegClauses, undefined, segCtx, segCondCtx,
              statusEv.ownerEntityId, statusEv.id, this._processFrameOut,
              { fireReactiveTriggers: false, trackStatReversals: false },
            );
          } else {
            const extOffset = statusStops.length > 0
              ? extendByTimeStops(statusEv.startFrame, cumOffsetForClauses, statusStops)
              : cumOffsetForClauses;
            const qf = allocQueueFrame();
            qf.frame = statusEv.startFrame + extOffset;
            qf.type = QueueFrameType.PROCESS_FRAME;
            qf.statusId = statusId;
            qf.columnId = statusEv.columnId;
            qf.ownerEntityId = statusEv.ownerEntityId;
            qf.sourceEntityId = source.ownerEntityId;
            qf.sourceSkillName = source.skillName;
            qf.operatorSlotId = statusEv.ownerEntityId;
            qf.sourceEvent = statusEv;
            qf.segmentIndex = si;
            qf.frameIndex = -1;
            qf.frameMarker = { offsetFrame: 0, clauses: parsedSegClauses, clauseType: undefined } as unknown as EventFrameMarker;
            this.pendingExitFrames.push(qf);
          }
        }
        cumOffsetForClauses += segDur;
      }
    }

    // ── Segment frame markers ──────────────────────────────────────────────
    // Offset-0 frames: process inline (immediate effects at status creation).
    // Offset > 0 frames: defer to the queue so they fire at the correct time
    // and can be skipped if the status is consumed before they're reached.
    let cumOffset = 0;
    for (let si = 0; si < statusEv.segments.length; si++) {
      const seg = statusEv.segments[si];
      if (seg.frames) {
        for (let fi = 0; fi < seg.frames.length; fi++) {
          const fm = seg.frames[fi];

          if (fm.offsetFrame > 0) {
            // Defer to queue — the frame fires at the correct time and respects consumption
            const segAbsStart = statusEv.startFrame + cumOffset;
            const extOffset = statusStops.length > 0
              ? extendByTimeStops(segAbsStart, fm.offsetFrame, statusStops)
              : fm.offsetFrame;
            const qf = allocQueueFrame();
            qf.frame = segAbsStart + extOffset;

            qf.type = QueueFrameType.PROCESS_FRAME;
            qf.statusId = statusId;
            qf.columnId = statusEv.columnId;
            qf.ownerEntityId = statusEv.ownerEntityId;
            qf.sourceEntityId = source.ownerEntityId;
            qf.sourceSkillName = source.skillName;
            qf.operatorSlotId = statusEv.ownerEntityId;
            qf.frameMarker = fm;
            qf.sourceEvent = statusEv;
            qf.segmentIndex = si;
            qf.frameIndex = fi;
            this.pendingExitFrames.push(qf);
            continue;
          }

          // Offset 0: process inline
          const segAbsStart = statusEv.startFrame + cumOffset;
          const absFrame = segAbsStart;
          const segEnd = statusEv.startFrame + cumOffset + (seg.properties.duration ?? 0);
          // Route source to the originating operator's slot for derived statuses
          // (e.g. THUNDERLANCE_PIERCE on enemy → UE gain back to Avywenna's slot)
          const routedInline = this.resolveRoutedSource(statusEv);
          const frameCtx: InterpretContext = {
            frame: absFrame,
            sourceEntityId: routedInline.sourceEntityId,
            sourceSkillName: statusEv.name,
            sourceEventUid: undefined,
            potential: pot,
            parentEventEndFrame: parentEventEnd,
            parentSegmentEndFrame: segEnd,
            ...(statusEv.consumedStacks != null ? { consumedStacks: statusEv.consumedStacks } : {}),
            ...(statusEv.triggerEntityId != null ? { triggerEntityId: statusEv.triggerEntityId } : {}),
          };
          if (fm.clauses) {
            const condCtx: ConditionContext = {
              events: this.getAllEvents(),
              frame: absFrame,
              sourceEntityId: statusEv.ownerEntityId,
              potential: pot,
              ...(statusEv.triggerEntityId != null ? { triggerEntityId: statusEv.triggerEntityId } : {}),
            };
            // Status-frame markers (offset 0) are dispatched via the unified
            // helper. They don't fire reactive triggers per-effect (status
            // events have their own dedicated trigger paths) and don't track
            // frame-scoped stat reversals (status-clause stat tracking is
            // separate and runs above against statusDef.clause).
            this.dispatchClauseFrame(
              fm.clauses, fm.clauseType, frameCtx, condCtx,
              statusEv.ownerEntityId, statusEv.id, this._processFrameOut,
              { fireReactiveTriggers: false, trackStatReversals: false },
            );
            // Snapshot stat deltas if this 0s frame also deals damage — the
            // damage calc reads enemyRuntimeDeltas keyed by `${uid}:${si}:${fi}`
            // and without a snapshot here, APPLY STAT effects that fire
            // before DEAL DAMAGE in the same 0s frame (e.g. Razor Clawmark's
            // PHYSICAL_FRAGILITY + PHYSICAL DEAL DAMAGE) would silently
            // show 0 contribution to the first tick.
            if (this.controller.hasStatAccumulator() && hasDealDamageClause(fm.clauses)) {
              const frameKey = `${statusEv.uid}:${si}:${fi}`;
              this.controller.snapshotStatDeltas(frameKey, statusEv.ownerEntityId);
              this.controller.snapshotStatDeltas(frameKey, ENEMY_ID);
              this.controller.snapshotStatDeltas(frameKey, TEAM_ID);
            }
          }
        }
      }
      cumOffset += seg.properties.duration;
    }

    // ── EVENT_END: fire IS_NOT state triggers when the status expires ──────
    // Deferred so the event is no longer active at evaluation time.
    {
      const endHook = allocQueueFrame();
      endHook.frame = parentEventEnd;

      endHook.type = QueueFrameType.PROCESS_FRAME;
      endHook.hookType = FrameHookType.EVENT_END;
      endHook.statusId = statusId;
      endHook.columnId = statusEv.columnId;
      endHook.ownerEntityId = statusEv.ownerEntityId;
      endHook.sourceEntityId = source.ownerEntityId;
      endHook.sourceSkillName = source.skillName;
      endHook.operatorSlotId = statusEv.ownerEntityId;
      endHook.sourceEvent = statusEv;
      endHook.segmentIndex = -1;
      endHook.frameIndex = -1;
      this.pendingExitFrames.push(endHook);
    }

    // ── onExitClause: schedule effects at the status end frame ────────────
    // Deferred via the queue so stacks created after this status are included.
    if (statusDef?.onExitClause?.length) {
      const exitFrame = allocQueueFrame();
      exitFrame.frame = parentEventEnd;

      exitFrame.type = QueueFrameType.STATUS_EXIT;
      exitFrame.statusId = statusId;
      exitFrame.ownerEntityId = statusEntityId;
      exitFrame.sourceEntityId = source.ownerEntityId;
      exitFrame.sourceSkillName = source.skillName;
      exitFrame.operatorSlotId = statusEntityId;
      exitFrame.statusExitClauses = statusDef.onExitClause as { conditions: unknown[]; effects?: unknown[] }[];
      exitFrame.statusExitEntityId = statusEntityId;
      this.pendingExitFrames.push(exitFrame);
    }
  }

  /** Handle a deferred STATUS_EXIT queue frame — execute onExitClause effects. */
  private handleStatusExit(entry: QueueFrame): QueueFrame[] {
    const clauses = entry.statusExitClauses;
    if (!clauses?.length) return [];

    const statusEntityId = entry.statusExitEntityId ?? entry.ownerEntityId;
    const exitCtx: InterpretContext = {
      frame: entry.frame,
      sourceEntityId: entry.sourceEntityId,
      contextSlotId: statusEntityId,
      sourceSkillName: entry.sourceSkillName,
      parentStatusId: entry.statusId,
    };
    const exitCondCtx: ConditionContext = {
      events: this.getAllEvents(),
      frame: entry.frame,
      sourceEntityId: statusEntityId,
    };
    const parsed = parseJsonClauseArray(clauses);
    this.dispatchClauseFrame(
      parsed, undefined, exitCtx, exitCondCtx,
      statusEntityId, entry.statusId ?? '', this._processFrameOut,
      { fireReactiveTriggers: false, trackStatReversals: false },
    );
    return [];
  }

  private checkPerformTriggers(performObject: string, event: TimelineEvent, absFrame: number): QueueFrame[] {
    if (!this.triggerIndex) return [];
    const results: QueueFrame[] = [];
    for (const entry of this.triggerIndex.lookup(`${VerbType.PERFORM}:${performObject}`)) {
      // Find the PERFORM condition for subject filtering
      const performCond = entry.conditions.find(c => c.verb === VerbType.PERFORM);
      if (!performCond) continue;
      const det = performCond.subjectDeterminer;
      const isAny = det === DeterminerType.ANY;
      if (!isAny) {
        if (det === DeterminerType.CONTROLLED) {
          const controlledSlot = this.getControlledSlotAtFrame?.(absFrame);
          if (controlledSlot && event.ownerEntityId !== controlledSlot) continue;
          if (!controlledSlot && event.ownerEntityId !== entry.operatorSlotId) continue;
        } else if (event.ownerEntityId !== entry.operatorSlotId) continue;
      }
      const triggerCtx: EngineTriggerContext = {
        def: entry.def,
        operatorId: entry.operatorId,
        operatorSlotId: entry.operatorSlotId,
        potential: entry.potential,
        operatorSlotMap: entry.operatorSlotMap,
        loadoutProperties: entry.loadoutProperties,
        conditions: entry.conditions,
        triggerEffects: entry.triggerEffects,
      };
      results.push({
        frame: absFrame,
        type: QueueFrameType.PROCESS_FRAME, hookType: FrameHookType.ON_TRIGGER,
        statusId: entry.def.properties.id,
        columnId: '',
        ownerEntityId: entry.operatorSlotId,
        sourceEntityId: this.slotToEntityId(event.ownerEntityId),
        sourceSkillName: event.id,
        maxStacks: 0,
        durationFrames: 0,
        operatorSlotId: entry.operatorSlotId,
        engineTrigger: { frame: absFrame, sourceEntityId: this.slotToEntityId(event.ownerEntityId), triggerSlotId: event.ownerEntityId, sourceSkillName: event.id, ctx: triggerCtx, isEquip: entry.isEquip },
      });
    }
    return results;
  }

  /**
   * Resolve combo trigger column for a combo event at the given frame.
   * Moved from handleComboResolve into handleProcessFrame.
   */
  private resolveComboTrigger(combo: TimelineEvent, absFrame: number, newEntries: QueueFrame[]) {
    if (!this.slotWirings) return;
    const wiring = this.slotWirings.find(w => w.slotId === combo.ownerEntityId);
    if (!wiring) return;
    const clause = getComboTriggerClause(wiring.operatorId);
    if (!clause?.length) return;
    const info = getComboTriggerInfo(wiring.operatorId);
    const windowFrames = info?.windowFrames ?? 720;

    const controlledSlot = this.getControlledSlotAtFrame?.(absFrame);
    const matches = findClauseTriggerMatches(clause, this.getAllEvents(), wiring.slotId, undefined, controlledSlot);
    let triggerCol: string | undefined;
    let triggerEventUid: string | undefined;
    for (const match of matches) {
      if (match.originEntityId === combo.ownerEntityId) continue;
      if (combo.startFrame >= match.frame && combo.startFrame < match.frame + windowFrames) {
        triggerCol = match.sourceColumnId;
        triggerEventUid = match.sourceEventUid;
        break;
      }
    }
    if (!triggerCol) return;

    this.controller.setComboTriggerColumnId(combo.uid, triggerCol, triggerEventUid);
    // Mirrored inflictions are handled by PROCESS_FRAME when it encounters
    // duplicateTriggerSource on subsequent frame markers.
  }

  /** Handle COMBO_RESOLVE queue entry — deferred combo trigger resolution. */
  private handleComboResolve(entry: QueueFrame): QueueFrame[] {
    const combo = entry.comboResolveEvent;
    if (!combo) return [];
    this.resolveComboTrigger(combo, entry.frame, []);
    return [];
  }

  /** Resolve a consumeStatus target's column ID and owner from the status definition. */
  private resolveConsumeTarget(statusId: string, eventEntityId: string): { columnId: string; ownerEntityId: string } {
    const columnId = statusId;
    const operatorId = this.slotOperatorMap?.[eventEntityId];
    if (operatorId) {
      const statuses = getOperatorStatuses(operatorId);
      const def = statuses.find(s => s.id === statusId);
      if (def) {
        if (def.target === NounType.ENEMY) return { columnId, ownerEntityId: ENEMY_ID };
        return { columnId, ownerEntityId: eventEntityId };
      }
    }
    return { columnId, ownerEntityId: eventEntityId };
  }

  /**
   * Check the trigger index for defs that react to an observable event.
   * Seeds ENGINE_TRIGGER entries for matching triggers with HAVE conditions deferred.
   * Also checks lifecycle clauses (clause-based triggers on the status itself).
   */
  private checkReactiveTriggers(
    verb: string, objectId: string, frame: number, slotId: string, sourceSkillName: string,
    enhancementType?: string,
    out?: QueueFrame[],
    consumedStacks?: number,
    /** Optional recipient slot for action verbs (APPLY/CONSUME). When undefined,
     *  action-verb target filters fall back to the actor slotId. */
    targetSlotId?: string,
  ) {
    if (!this.triggerIndex) return;
    const results = out!;

    // ── Lifecycle clause triggers ──────────────────────────────────────
    // All clause effects (unconditional and HAVE-gated) are registered in the
    // lifecycleIndex. When a status is applied/stacked, fire an ENGINE_TRIGGER
    // with the clauseGroups so handleEngineTrigger can evaluate conditions and
    // dispatch effects through the unified path.
    const lifecycle = this.triggerIndex.getLifecycle(objectId);
    if (lifecycle) {
        const operatorId = this.slotOperatorMap?.[slotId] ?? lifecycle.operatorId;
        const props = this.loadoutProperties?.[slotId];
        const potential = props?.operator.potential ?? 0;
        const operatorSlotMap: Record<string, string> = {};
        if (this.slotOperatorMap) {
          for (const [s, o] of Object.entries(this.slotOperatorMap)) operatorSlotMap[o] = s;
        }
        const triggerCtx: EngineTriggerContext = {
          def: lifecycle.fullDef,
          operatorId,
          operatorSlotId: slotId,
          potential,
          operatorSlotMap,
          loadoutProperties: props,
          conditions: [],
          clauseGroups: lifecycle.clauseGroups,
          ...(lifecycle.clauseType ? { clauseType: lifecycle.clauseType } : {}),
        };
        results.push({
          frame,

          type: QueueFrameType.PROCESS_FRAME, hookType: FrameHookType.ON_TRIGGER,
          statusId: lifecycle.def.properties.id,
          columnId: '',
          ownerEntityId: slotId,
          sourceEntityId: this.slotToEntityId(slotId),
          sourceSkillName,
          maxStacks: 0,
          durationFrames: 0,
          operatorSlotId: slotId,
          engineTrigger: { frame, sourceEntityId: this.slotToEntityId(slotId), triggerSlotId: slotId, sourceSkillName, ctx: triggerCtx, isEquip: false },
        });
    }

    // ── onTriggerClause triggers matching this event's column ──────────────
    // objectId is already a resolved column ID or status name — use directly for matching.
    // Entries may be registered under multiple keys (one per observable condition),
    // so dedup by def ID + slot + clause index to prevent double-firing.
    const firstMatchGroups = new Map<string, TriggerDefEntry[]>();
    const seen = new Set<string>();
    for (const entry of this.triggerIndex.matchEvent(verb, objectId)) {
      // Dedup: same entry registered under multiple keys fires only once per call
      const dedupKey = `${entry.def.properties.id}:${entry.operatorSlotId}:${entry.clauseIndex}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      // Find the condition that matched this verb:objectId lookup for subject/qualifier filtering
      const matchedCond = findMatchedCondition(entry.conditions, verb, objectId);
      if (!matchedCond) continue;

      // Qualifier filter for category-matched triggers (REACTION/INFLICTION)
      const entryObjId = matchedCond.objectId;
      if (entryObjId === NounType.REACTION || entryObjId === NounType.INFLICTION) {
        const entryQualifier = matchedCond.objectQualifier ?? (matchedCond as { element?: string }).element;
        if (entryQualifier) {
          const qualifiedCol = resolveEffectColumnId(
            matchedCond.object, entryObjId, entryQualifier,
          );
          if (qualifiedCol && qualifiedCol !== objectId) continue;
        }
      }

      // Subject filter
      const det = matchedCond.subjectDeterminer ?? DeterminerType.THIS;
      const subj = matchedCond.subject;
      const isActionVerb = verb === VerbType.APPLY || verb === VerbType.CONSUME;
      const effectiveSlot =
        isActionVerb && subj === NounType.ENEMY ? (targetSlotId ?? slotId)
        : slotId;

      if (det === DeterminerType.THIS && subj === NounType.OPERATOR && effectiveSlot !== entry.operatorSlotId) continue;
      if (det === DeterminerType.CONTROLLED && subj === NounType.OPERATOR) {
        const controlledSlot = this.getControlledSlotAtFrame?.(frame);
        if (controlledSlot && effectiveSlot !== controlledSlot) continue;
        if (!controlledSlot && effectiveSlot !== entry.operatorSlotId) continue;
      }
      if (subj === NounType.ENEMY && effectiveSlot !== ENEMY_ID) continue;
      if (subj === NounType.OPERATOR && det === DeterminerType.ANY_OTHER && effectiveSlot === entry.operatorSlotId) continue;

      const entryEnhancement = entry.def.properties.enhancementTypes?.[0];
      if (entryEnhancement && entryEnhancement !== enhancementType) continue;

      if (entry.usageLimit != null) {
        const usageKey = `${entry.def.properties.id}:${entry.operatorSlotId}`;
        if ((this.triggerUsageCount.get(usageKey) ?? 0) >= entry.usageLimit) continue;
      }

      const isFirstMatch = entry.def.clauseType === ClauseEvaluationType.FIRST_MATCH;
      if (isFirstMatch) {
        const groupKey = `${entry.def.properties.id}:${entry.operatorSlotId}:${frame}`;
        if (!firstMatchGroups.has(groupKey)) firstMatchGroups.set(groupKey, []);
        firstMatchGroups.get(groupKey)!.push(entry);
        continue;
      }

      const triggerCtx: EngineTriggerContext = {
        def: entry.def,
        operatorId: entry.operatorId,
        operatorSlotId: entry.operatorSlotId,
        potential: entry.potential,
        operatorSlotMap: entry.operatorSlotMap,
        loadoutProperties: entry.loadoutProperties,
        conditions: entry.conditions,
        triggerEffects: entry.triggerEffects,
      };
      results.push({
        frame,
        type: QueueFrameType.PROCESS_FRAME, hookType: FrameHookType.ON_TRIGGER,
        statusId: entry.def.properties.id,
        columnId: '',
        ownerEntityId: entry.operatorSlotId,
        sourceEntityId: this.slotToEntityId(slotId),
        sourceSkillName,
        maxStacks: 0,
        durationFrames: 0,
        operatorSlotId: entry.operatorSlotId,
        engineTrigger: { frame, sourceEntityId: this.slotToEntityId(slotId), triggerSlotId: slotId, sourceSkillName, ctx: triggerCtx, isEquip: entry.isEquip, triggerObjectId: objectId, consumedStacks },
      });
    }

    // FIRST_MATCH: evaluate clauses in order, emit only the first matching one
    for (const [, entries] of Array.from(firstMatchGroups.entries())) {
      entries.sort((a, b) => a.clauseIndex - b.clauseIndex);

      const first = entries[0];
      const parentTarget = first.def.properties.target;
      const statusEntityId = parentTarget === NounType.TEAM ? TEAM_ID
        : parentTarget === NounType.ENEMY ? ENEMY_ID
        : first.operatorSlotId;

      let selected: TriggerDefEntry | undefined;
      for (const entry of entries) {
        const stateConds = entry.conditions.filter(c =>
          !EVENT_PRESENCE_VERBS.has(c.verb as VerbType)
        );
        if (stateConds.length === 0) {
          selected = entry;
          break;
        }
        const condCtx: ConditionContext = {
          events: this.getAllEvents(),
          frame,
          sourceEntityId: entry.operatorSlotId,
          potential: entry.potential,
          getEnemyHpPercentage: this.getEnemyHpPercentage,
          getParentEventEntityId: () => statusEntityId,
        };
        if (evaluateConditions(stateConds as unknown as import('../../dsl/semantics').Interaction[], condCtx)) {
          selected = entry;
          break;
        }
      }

      if (!selected) continue;

      const triggerCtx: EngineTriggerContext = {
        def: selected.def,
        operatorId: selected.operatorId,
        operatorSlotId: selected.operatorSlotId,
        potential: selected.potential,
        operatorSlotMap: selected.operatorSlotMap,
        loadoutProperties: selected.loadoutProperties,
        conditions: [],  // Already evaluated
        triggerEffects: selected.triggerEffects,
      };
      results.push({
        frame,
        type: QueueFrameType.PROCESS_FRAME, hookType: FrameHookType.ON_TRIGGER,
        statusId: selected.def.properties.id,
        columnId: '',
        ownerEntityId: selected.operatorSlotId,
        sourceEntityId: this.slotToEntityId(slotId),
        sourceSkillName,
        maxStacks: 0,
        durationFrames: 0,
        operatorSlotId: selected.operatorSlotId,
        engineTrigger: { frame, sourceEntityId: this.slotToEntityId(slotId), triggerSlotId: slotId, sourceSkillName, ctx: triggerCtx, isEquip: selected.isEquip, triggerObjectId: objectId },
      });
    }
  }



  private static readonly MAX_CASCADE_DEPTH = 10;

  /** Convert a TriggerEffect to the DSL Effect type for interpret(). */
  private triggerEffectToEffect(te: import('./triggerMatch').TriggerEffect): Effect {
    const isCompound = (te.verb === VerbType.ALL || te.verb === VerbType.ANY) && te.effects && te.effects.length > 0;
    if (isCompound) {
      return {
        verb: te.verb as VerbType,
        cardinalityConstraint: te.cardinalityConstraint as Effect['cardinalityConstraint'],
        value: te.value === 'MAX' ? THRESHOLD_MAX : te.value as Effect['value'],
        effects: te.effects?.map(se => ({
          verb: se.verb as VerbType,
          object: se.object as Effect['object'],
          objectId: se.objectId,
          objectQualifier: (se.objectQualifier ?? se.element) as Effect['objectQualifier'],
          fromObject: se.fromObject as Effect['fromObject'],
          to: se.to as Effect['to'],
          toDeterminer: se.toDeterminer as Effect['toDeterminer'],
          with: se.with as Effect['with'],
          until: se.until as Effect['until'],
          of: se.of as Effect['of'],
        })),
      };
    }
    // Simple effect: fields are directly on the TriggerEffect
    return {
      verb: te.verb as VerbType,
      object: te.object as Effect['object'],
      objectId: te.objectId,
      objectQualifier: (te.objectQualifier ?? te.element) as Effect['objectQualifier'],
      to: te.to as Effect['to'],
      toDeterminer: te.toDeterminer as Effect['toDeterminer'],
      with: te.with as Effect['with'],
      until: te.until as Effect['until'],
      of: te.of as Effect['of'],
      cardinalityConstraint: te.cardinalityConstraint as Effect['cardinalityConstraint'],
      value: te.value === 'MAX' ? THRESHOLD_MAX : te.value as Effect['value'],
    };
  }

  private handleEngineTrigger(entry: QueueFrame): QueueFrame[] {
    const trigger = entry.engineTrigger;
    if (!trigger) return [];

    const depth = entry.cascadeDepth ?? 0;
    if (depth >= EventInterpretorController.MAX_CASCADE_DEPTH) return [];

    const { ctx } = trigger;
    const triggerEffects = ctx.triggerEffects ?? [];

    // Resolve parent status entity (for column queries and condition evaluation)
    const parentTarget = ctx.def.properties.target;
    const statusEntityId = parentTarget === NounType.TEAM ? TEAM_ID
      : parentTarget === NounType.ENEMY ? ENEMY_ID
      : ctx.operatorSlotId;

    // ── Lifecycle clause dispatch (unified path for all clause effects) ──
    if (ctx.clauseGroups && ctx.clauseGroups.length > 0) {
      return this.handleLifecycleTrigger(entry, trigger, statusEntityId);
    }

    // Evaluate conditions that require runtime state checking. Event-presence
    // verbs were already matched by the index — skip them. State-transition
    // and state-check verbs (BECOME, HAVE, IS) always need evaluation.
    const stateConditions = ctx.conditions.filter(c => !EVENT_PRESENCE_VERBS.has(c.verb as VerbType));
    if (stateConditions.length > 0) {
      const talentLvl = resolveTalentLevel(ctx.def, {
        operatorId: this.slotOperatorMap?.[ctx.operatorSlotId],
        loadoutProperties: this.loadoutProperties?.[ctx.operatorSlotId],
      } as DeriveContext);
      const condCtx: ConditionContext = {
        events: this.getAllEvents(),
        frame: entry.frame,
        sourceEntityId: ctx.operatorSlotId,
        potential: ctx.potential,
        talentLevel: talentLvl,
        getEnemyHpPercentage: this.getEnemyHpPercentage,
        getOperatorPercentageHp: this.controller.hasHpController() ? (opId, f) => this.controller.getOperatorPercentageHp(opId, f) : undefined,
        getParentEventEntityId: () => statusEntityId,
        getStatValue: this.controller.hasStatAccumulator() ? (entityId, stat) => this.controller.getStat(entityId, stat) : undefined,
        previousStackCount: trigger.previousStackCount,
      };
      if (!evaluateConditions(stateConditions as unknown as import('../../dsl/semantics').Interaction[], condCtx)) return [];
    }

    // Compute parent status event end frames (for EXTEND UNTIL END OF SEGMENT/EVENT)
    const parentColumnId = ctx.def.properties.id;
    const parentEvents = activeEventsAtFrame(this.getAllEvents(), parentColumnId, statusEntityId, entry.frame);
    const parentEv = parentEvents.length > 0 ? parentEvents[parentEvents.length - 1] : undefined;

    // Skill-status triggers require an active parent instance unless they are inherent
    // capabilities (talents, potentials, or permanent-duration statuses like Natural Predator).
    // Without this, template events at frame 0 fire onTriggerClause effects spuriously
    // (e.g. OLDEN_STARE's dive trigger when no OLDEN_STARE is active on the enemy,
    // or AUXILIARY_CRYSTAL's FINAL_STRIKE trigger when no crystal is active on the operator).
    if (!parentEv) {
      const parentEventIdType = ctx.def.properties.eventIdType ?? ctx.def.properties.type;
      const isTalentOrPotential = parentEventIdType === NounType.TALENT
        || parentEventIdType === NounType.POTENTIAL;
      if (!isTalentOrPotential) {
        const parentDuration = ctx.def.properties.duration
          ? resolveValueNode(ctx.def.properties.duration.value, DEFAULT_VALUE_CONTEXT) : PERMANENT_DURATION;
        if (parentDuration < PERMANENT_DURATION) return [];
      }
    }
    // Self-apply lifecycle gate: a status with an ongoing instance (still inside
    // its active segment OR any cooldown segment, including IMMEDIATE_COOLDOWN) is
    // "busy" and cannot be re-applied to itself — same semantics as a skill's
    // IMMEDIATE_COOLDOWN gating re-triggers. This is not dedupe/filtering; it's
    // the normal status lifecycle. activeEventsAtFrame spans the full event via
    // eventDuration (active + all cooldown segments), so parentEv being non-null
    // means the status's full span still covers this frame, and any trigger that
    // would APPLY the same status is suppressed until the span ends.
    if (parentEv) {
      const isSelfApply = (te: import('./triggerMatch').TriggerEffect): boolean => {
        if (te.verb !== VerbType.APPLY) return false;
        if (te.object === NounType.EVENT) return true;
        if (te.object === NounType.STATUS && te.objectId === parentColumnId) return true;
        return false;
      };
      // Stacking statuses (stacks.limit > 1) may self-apply additional concurrent
      // instances up to the limit. Resolve the limit ValueNode the same way the
      // status config cache does, then count currently-live instances.
      const stackLimitNode = ctx.def.properties.stacks?.limit;
      let stackLimit = 1;
      if (stackLimitNode != null) {
        if (typeof stackLimitNode === 'number') {
          stackLimit = stackLimitNode;
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const resolved = resolveValueNode(stackLimitNode as any, DEFAULT_VALUE_CONTEXT);
          if (typeof resolved === 'number' && resolved > 0) stackLimit = resolved;
        }
      }
      const liveCount = parentEvents.length;
      const interactionType = ctx.def.properties.stacks?.interactionType;
      const canRecycle = interactionType != null && interactionType !== StackInteractionType.NONE;
      // Non-stacking statuses (limit <= 1) always gate self-APPLY while a live
      // instance exists — the existing instance owns the lifecycle, dedupe via
      // gate. Stacking statuses (limit > 1) only gate when at-cap AND there is
      // no recycle interaction; otherwise the downstream APPLY path recycles
      // the oldest instance and emits REFRESHED.
      if (stackLimit <= 1 || (liveCount >= stackLimit && !canRecycle)) {
        if (triggerEffects.some(isSelfApply)) return [];
      }
    }

    let parentEventEndFrame: number | undefined;
    let parentSegmentEndFrame: number | undefined;
    if (parentEv) {
      parentEventEndFrame = parentEv.startFrame + eventDuration(parentEv);
      // Find the segment active at the trigger frame
      let segStart = parentEv.startFrame;
      for (const seg of parentEv.segments) {
        const segEnd = segStart + (seg.properties.duration ?? 0);
        if (entry.frame >= segStart && entry.frame < segEnd) {
          parentSegmentEndFrame = segEnd;
          break;
        }
        segStart = segEnd;
      }
      // Fallback: if frame is at or past last segment, use event end
      if (parentSegmentEndFrame == null) parentSegmentEndFrame = parentEventEndFrame;
    }

    // For statuses with an active parent whose source is a skill, inherit the parent's
    // sourceSkillName so derived events are attributed to the originating skill rather
    // than the triggering event. Examples:
    //   - EARLY_ROGUE_WAVE from OLDEN_STARE (enemy-targeted) is attributed to ULTIMATE,
    //     not the DIVE that fired the trigger.
    //   - SATURATED_DEFENSE_RETALIATION_BURST from SATURATED_DEFENSE_RETALIATION
    //     (operator-targeted) is attributed to SATURATED_DEFENSE (BS), not the enemy
    //     attack that fired the trigger.
    // Skip inheritance when the parent is TEAM-targeted — team statuses don't have a
    // single skill-owner relationship that should override the triggering event's source.
    const resolvedSourceSkillName = (parentEv?.sourceSkillName && parentTarget !== NounType.TEAM)
      ? parentEv.sourceSkillName
      : trigger.sourceSkillName;

    const interpretCtx: InterpretContext = {
      frame: entry.frame,
      sourceEntityId: ctx.operatorId,
      contextSlotId: ctx.operatorSlotId,
      sourceEventUid: parentEv?.uid,
      sourceSkillName: resolvedSourceSkillName,
      potential: ctx.potential,
      parentStatusId: ctx.def.properties.id,
      parentEventEndFrame,
      parentSegmentEndFrame,
      sourceFrameKey: entry.sourceFrameKey,
      targetEntityId: trigger.triggerSlotId,
      triggerEntityId: trigger.triggerSlotId,
      consumedStacks: trigger.consumedStacks,
    };

    const cascadeFrames = this._engineTriggerOut;
    cascadeFrames.length = 0;
    const outputBefore = this.controller.getAllEvents().length;
    for (const te of triggerEffects) {
      const effect = this.triggerEffectToEffect(te);
      const applied = this.interpret(effect, interpretCtx);
      // CONSUME THIS EVENT failure gates remaining effects — no stacks left to consume
      // (e.g. Steel Oath: CONSUME stack must succeed before APPLY Harass runs)
      if (!applied && te.verb === VerbType.CONSUME && te.object === NounType.EVENT) break;
      if (applied) {
        const before = cascadeFrames.length;
        this.reactiveTriggersForEffect(effect, entry.frame, ctx.operatorSlotId, trigger.sourceSkillName, cascadeFrames, this.lastConsumedStacks);
        this.lastConsumedStacks = undefined;
        // Cascade triggers inherit the original trigger operator for TRIGGER determiner resolution
        for (let j = before; j < cascadeFrames.length; j++) {
          cascadeFrames[j].cascadeDepth = depth + 1;
          cascadeFrames[j].sourceFrameKey = entry.sourceFrameKey;
          if (cascadeFrames[j].engineTrigger && trigger.triggerSlotId) {
            cascadeFrames[j].engineTrigger!.triggerSlotId = trigger.triggerSlotId;
          }
        }
      }
    }

    // Increment usage counter for triggers with usageLimit (e.g. tacticals, gear sets)
    if (this.controller.getAllEvents().length > outputBefore) {
      const usageKey = `${ctx.def.properties.id}:${ctx.operatorSlotId}`;
      this.triggerUsageCount.set(usageKey, (this.triggerUsageCount.get(usageKey) ?? 0) + 1);
    }

    // Reactive triggers for compound effects (ALL/ANY) are fired inline within
    // doAll after each iteration, so downstream BECOME conditions see
    // incremental state transitions. Collect any cascade frames they produced.
    while (this._compoundCascadeFrames.length > 0) {
      const pf = this._compoundCascadeFrames.pop()!;
      pf.cascadeDepth = depth + 1;
      cascadeFrames.push(pf);
    }

    return cascadeFrames;
  }

  /**
   * Handle a lifecycle ENGINE_TRIGGER — dispatch clause effects (APPLY STAT, IGNORE UE)
   * with replace-semantics so each fire applies the status's TOTAL contribution as a
   * delta from the previous total, not an additive accumulation.
   *
   * For multi-target statuses (ALL/ALL_OTHER OPERATOR), finds ALL active instances
   * across all entities and processes each independently.
   */
  private handleLifecycleTrigger(
    entry: QueueFrame,
    trigger: NonNullable<QueueFrame['engineTrigger']>,
    statusEntityId: string,
  ): QueueFrame[] {
    const { ctx } = trigger;
    const statusId = ctx.def.properties.id;
    const cascadeFrames = this._engineTriggerOut;
    cascadeFrames.length = 0;

    // Find active instances of this status, deduplicated by ownerEntityId.
    // For single-target (ENEMY/TEAM/one operator), this is one event.
    // For multi-target (ALL/ALL_OTHER OPERATOR), there may be instances on different slots.
    // For NONE-stacking (multiple events on the same slot), use the latest event
    // as the representative — the clause effects evaluate against current stack count,
    // not per-event.
    const allEvents = this.getAllEvents();
    const instancesByEntity = new Map<string, TimelineEvent>();
    for (const ev of allEvents) {
      if (ev.id !== statusId) continue;
      if (ev.startFrame > entry.frame || entry.frame >= ev.startFrame + eventDuration(ev)) continue;
      // Keep the latest event per entity (highest startFrame, or last in array order)
      instancesByEntity.set(ev.ownerEntityId, ev);
    }
    if (instancesByEntity.size === 0) return [];

    for (const parentEv of Array.from(instancesByEntity.values())) {
      this.processLifecycleInstance(entry, trigger, parentEv, cascadeFrames);
    }

    return cascadeFrames;
  }

  /** Process lifecycle clause effects for a single status event instance. */
  private processLifecycleInstance(
    entry: QueueFrame,
    trigger: NonNullable<QueueFrame['engineTrigger']>,
    parentEv: TimelineEvent,
    cascadeFrames: QueueFrame[],
  ) {
    const { ctx } = trigger;
    const statusId = ctx.def.properties.id;
    const instanceEntityId = parentEv.ownerEntityId;
    const parentEventEndFrame = parentEv.startFrame + eventDuration(parentEv);

    // Build condition context for HAVE evaluation
    const talentLvl = resolveTalentLevel(ctx.def, {
      operatorId: this.slotOperatorMap?.[ctx.operatorSlotId],
      loadoutProperties: this.loadoutProperties?.[ctx.operatorSlotId],
    } as DeriveContext);
    const condCtx: ConditionContext = {
      events: this.getAllEvents(),
      frame: entry.frame,
      sourceEntityId: instanceEntityId,
      potential: ctx.potential,
      talentLevel: talentLvl,
      getEnemyHpPercentage: this.getEnemyHpPercentage,
      getOperatorPercentageHp: this.controller.hasHpController() ? (opId, f) => this.controller.getOperatorPercentageHp(opId, f) : undefined,
      getParentEventEntityId: () => instanceEntityId,
      getStatValue: this.controller.hasStatAccumulator() ? (entityId, stat) => this.controller.getStat(entityId, stat) : undefined,
      previousStackCount: trigger.previousStackCount,
    };

    // contextSlotId = the status instance owner (for THIS OPERATOR resolution).
    // sourceEventUid = the status event's uid (for SOURCE OPERATOR resolution
    //   via buildValueContext's causality DAG → rootOf → root event's slot).
    const sourceEntityId = parentEv.sourceEntityId ?? ctx.operatorId;
    const sourceSlotId = this.resolveSlotId(sourceEntityId);
    const pot = this.loadoutProperties?.[sourceSlotId]?.operator.potential ?? ctx.potential;
    const interpretCtx: InterpretContext = {
      frame: entry.frame,
      sourceEntityId,
      contextSlotId: instanceEntityId,
      sourceEventUid: parentEv.uid,
      sourceSkillName: parentEv.sourceSkillName ?? trigger.sourceSkillName,
      potential: pot,
      talentLevel: talentLvl,
      parentStatusId: statusId,
      parentEventEndFrame,
      skipStatSourceAttribution: true,
    };

    // Track stat totals with replace-semantics: reverse previous total, apply new total
    const totalsKey = `${statusId}:${instanceEntityId}`;
    if (!this._lifecycleStatTotals) this._lifecycleStatTotals = new Map();
    const previousTotals = this._lifecycleStatTotals.get(totalsKey) ?? {};

    // Reverse previous lifecycle stat contributions before applying new totals
    if (this.controller.hasStatAccumulator()) {
      for (const [stat, prevValue] of Object.entries(previousTotals) as [import('../../consts/enums').StatType, number][]) {
        if (prevValue !== 0) {
          this.controller.applyStatDelta(instanceEntityId, { [stat]: -prevValue });
          this.controller.popStatSource(instanceEntityId, stat);
        }
      }
    }

    // Collect new stat values from all clause groups
    const newTotals: Record<string, number> = {};
    const isFirstMatch = ctx.clauseType === ClauseEvaluationType.FIRST_MATCH;

    for (const group of ctx.clauseGroups!) {
      // Evaluate HAVE conditions for this clause group (skip if conditions fail)
      if (group.haveConditions.length > 0) {
        if (!evaluateConditions(group.haveConditions as unknown as import('../../dsl/semantics').Interaction[], condCtx)) continue;
      }

      for (const rawEffect of group.effects) {
        const raw = rawEffect as Record<string, unknown>;
        const isApplyStat = raw.verb === VerbType.APPLY && raw.object === NounType.STAT;
        const isIgnoreUe = raw.verb === VerbType.IGNORE && raw.object === NounType.ULTIMATE_ENERGY;
        if (!isApplyStat && !isIgnoreUe) {
          // Non-stat effects (e.g. APPLY STATUS SCORCHING_HEART) dispatch normally
          const effect = raw as unknown as Effect;
          const applied = this.interpret(effect, interpretCtx);
          if (applied) {
            this.reactiveTriggersForEffect(effect, entry.frame, ctx.operatorSlotId, trigger.sourceSkillName, cascadeFrames, this.lastConsumedStacks);
            this.lastConsumedStacks = undefined;
          }
          continue;
        }

        if (isIgnoreUe) {
          this.interpret(raw as unknown as Effect, interpretCtx);
          continue;
        }

        // APPLY STAT — track contribution for replace-semantics
        const statKey = resolveEffectStat(NounType.STAT, raw.objectId as string, raw.objectQualifier as string);
        if (!statKey || !this.controller.hasStatAccumulator()) continue;

        // Inherit statusValue from the parent event when the clause doesn't specify its own
        let effect = raw as unknown as Effect;
        if (parentEv.statusValue != null) {
          const rawWith = (raw.with ?? {}) as Record<string, unknown>;
          if (!('multiplier' in rawWith) && !('value' in rawWith)) {
            effect = {
              ...raw,
              with: { ...rawWith, multiplier: { verb: VerbType.IS, value: parentEv.statusValue } },
            } as unknown as Effect;
          }
        }

        // Snapshot stat before, interpret, compute this contribution
        const statBefore = this.controller.getStat(instanceEntityId, statKey);
        this.interpret(effect, interpretCtx);
        const statAfter = this.controller.getStat(instanceEntityId, statKey);
        const thisContribution = statAfter - statBefore;
        newTotals[statKey] = (newTotals[statKey] ?? 0) + thisContribution;
      }
      // FIRST_MATCH: stop after the first group whose HAVE conditions matched.
      if (isFirstMatch) break;
    }

    // Push source for breakdown display and schedule reversal at parent event end
    if (this.controller.hasStatAccumulator()) {
      const statusName = ctx.def.properties.name ?? statusId;
      for (const [stat, value] of Object.entries(newTotals) as [import('../../consts/enums').StatType, number][]) {
        if (value !== 0) {
          const source = buildStatSource(statusName, value, { verb: VerbType.APPLY, object: NounType.STAT, objectId: stat }, interpretCtx);
          this.controller.pushStatSource(instanceEntityId, stat, source);
        }
      }

      // Remove any existing reversal for THIS lifecycle's stats and schedule new ones.
      // Scoped by totalsKey so different statuses applying the same stat don't
      // clobber each other's reversals.
      if (!this._statReversals) this._statReversals = [];
      this._statReversals = this._statReversals.filter(r => r.lifecycleKey !== totalsKey);
      for (const [stat, value] of Object.entries(newTotals) as [import('../../consts/enums').StatType, number][]) {
        if (value !== 0) {
          this._statReversals.push({ frame: parentEventEndFrame, entityId: instanceEntityId, stat, value: -value, lifecycleKey: totalsKey });
        }
      }
    }

    // Store the new totals for next lifecycle fire
    this._lifecycleStatTotals!.set(totalsKey, newTotals);
  }

}
