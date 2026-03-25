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
} from '../../dsl/semantics';
import type { ValueNode } from '../../dsl/semantics';
import { resolveValueNode, getSimpleValue, buildContextForSkillColumn } from '../calculation/valueResolver';
import type { ValueResolutionContext } from '../calculation/valueResolver';
import { TimelineEvent, eventDuration } from '../../consts/viewTypes';
import { ElementType, EventFrameType, PhysicalStatusType, UnitType } from '../../consts/enums';
import {
  BREACH_DURATION, ENEMY_OWNER_ID, ELEMENT_TO_INFLICTION_COLUMN,
  INFLICTION_COLUMN_IDS, INFLICTION_DURATION,
  PHYSICAL_INFLICTION_COLUMNS, PHYSICAL_INFLICTION_DURATION, PHYSICAL_STATUS_COLUMNS,
  REACTION_COLUMNS, REACTION_COLUMN_IDS, REACTION_DURATION,
  FORCED_REACTION_COLUMN, FORCED_REACTION_DURATION,
  TEAM_STATUS_COLUMN, P5_LINK_EXTENSION_FRAMES,
  SKILL_COLUMNS,
} from '../../model/channels';
import { FPS, TOTAL_FRAMES } from '../../utils/timeline';
import { getAllOperatorStatuses, getOperatorStatuses } from '../gameDataStore';
import { STATUS_LABELS } from '../../consts/timelineColumnLabels';
import { COMMON_OWNER_ID } from '../slot/commonSlotController';
import { evaluateConditions } from './conditionEvaluator';
import type { ConditionContext } from './conditionEvaluator';
import { resolveSusceptibility } from './processInfliction';
import { getPhysicalStatusBaseMultiplier } from '../../model/calculation/damageFormulas';
import type { SlotTriggerWiring } from './eventQueueTypes';
import { findClauseTriggerMatches, statusNameToColumnId } from './triggerMatch';
import { getComboTriggerClause, getComboTriggerInfo } from '../gameDataStore';
import { PRIORITY } from './eventQueueTypes';
import { genEventUid } from './inputEventController';
import { evaluateEngineTrigger } from './statusTriggerCollector';
import type { EngineTriggerContext } from './statusTriggerCollector';
import type { TriggerIndex } from './triggerIndex';
import { DerivedEventController, getStatusStackLimit } from './derivedEventController';
import type { QueueFrame } from './eventQueueTypes';
import type { LoadoutProperties } from '../../view/InformationPane';

// ── Column resolution (module-private helpers) ───────────────────────────

const REACTION_TO_COLUMN: Record<string, string> = {
  COMBUSTION: REACTION_COLUMNS.COMBUSTION, SOLIDIFICATION: REACTION_COLUMNS.SOLIDIFICATION,
  CORROSION: REACTION_COLUMNS.CORROSION, ELECTRIFICATION: REACTION_COLUMNS.ELECTRIFICATION,
};

function resolveInflictionColumnId(adjective?: AdjectiveType | AdjectiveType[]) {
  const adj = Array.isArray(adjective) ? adjective[0] : adjective;
  return adj ? ELEMENT_TO_INFLICTION_COLUMN[adj] : undefined;
}

function resolveReactionColumnId(adjective?: AdjectiveType | AdjectiveType[]) {
  const adj = Array.isArray(adjective) ? adjective[0] : adjective;
  return adj ? REACTION_TO_COLUMN[adj] : undefined;
}

const PHYSICAL_STATUS_VALUES = new Set<string>(Object.values(PhysicalStatusType));

function resolveStatusColumnId(objectId?: string) {
  if (!objectId) return 'unknown-status';
  if (REACTION_TO_COLUMN[objectId]) return REACTION_TO_COLUMN[objectId];
  if (PHYSICAL_STATUS_VALUES.has(objectId)) return objectId;
  return objectId.toLowerCase().replace(/_/g, '-');
}

function resolvePhysicalStatusColumnId(adjective?: AdjectiveType | AdjectiveType[]) {
  const adj = Array.isArray(adjective) ? adjective[0] : adjective;
  if (!adj || !PHYSICAL_STATUS_VALUES.has(adj as string)) return undefined;
  return adj as string;
}

// ── Lift constants ──────────────────────────────────────────────────────────

/** Duration of Lift / Knock Down status in frames (1 second at 120fps). */
const LIFT_KNOCK_DOWN_DURATION = 1 * FPS;

/** Lift / Knock Down damage multiplier (120% ATK). */
const LIFT_KNOCK_DOWN_DAMAGE_MULTIPLIER = 1.2;


const NOOP_VERBS = new Set<string>([
  VerbType.RECOVER, VerbType.RETURN, VerbType.DEAL, VerbType.HIT,
  VerbType.DEFEAT, VerbType.PERFORM, VerbType.IGNORE, VerbType.OVERHEAL,
  VerbType.EXPERIENCE, VerbType.MERGE, VerbType.RESET,
]);

function validateVerbObject(verb: VerbType, object?: string) {
  if (verb === VerbType.ALL || verb === VerbType.ANY) return true;
  if (NOOP_VERBS.has(verb)) return true;
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
    return getSimpleValue(cardinality) ?? defaultMax;
  }
  return defaultMax;
}

// ── Status config duration cache ─────────────────────────────────────────

let _statusDurationCache: Map<string, number> | null = null;

function getStatusConfigDuration(statusId?: string): number {
  if (!statusId) return TOTAL_FRAMES;
  if (!_statusDurationCache) {
    _statusDurationCache = new Map();
    for (const s of getAllOperatorStatuses()) {
      const dur = s.durationSeconds;
      _statusDurationCache.set(s.id, dur < 0 || dur === 0 ? TOTAL_FRAMES : Math.round(dur * FPS));
    }
  }
  return _statusDurationCache.get(statusId) ?? TOTAL_FRAMES;
}

// ── InterpretContext ─────────────────────────────────────────────────────

/** Context for interpreting DSL effects. */
export interface InterpretContext {
  frame: number;
  sourceOwnerId: string;
  sourceSkillName: string;
  allEvents: () => readonly TimelineEvent[];
  potential?: number;
  parentEventEndFrame?: number;
  targetOwnerId?: string;
}

// ══════════════════════════════════════════════════════════════════════════

export class EventInterpretorController {
  controller!: DerivedEventController;
  private baseEvents: readonly TimelineEvent[] = [];
  private loadoutProperties?: Record<string, LoadoutProperties>;
  private slotOperatorMap?: Record<string, string>;
  private slotWirings?: SlotTriggerWiring[];
  private getEnemyHpPercentage?: (frame: number) => number | null;
  private getControlledSlotAtFrame?: (frame: number) => string;
  private triggerIndex?: TriggerIndex;
  /** Dedup set for reactive triggers: prevents double-firing at the same frame. */
  private seenTriggers = new Set<string>();

  constructor(
    controller?: DerivedEventController,
    baseEvents?: readonly TimelineEvent[],
    options?: {
      loadoutProperties?: Record<string, LoadoutProperties>;
      slotOperatorMap?: Record<string, string>;
      slotWirings?: SlotTriggerWiring[];
      getEnemyHpPercentage?: (frame: number) => number | null;
      getControlledSlotAtFrame?: (frame: number) => string;
      triggerIndex?: TriggerIndex;
    },
  ) {
    if (controller) this.controller = controller;
    if (baseEvents) this.baseEvents = baseEvents;
    if (options) {
      this.loadoutProperties = options.loadoutProperties;
      this.slotOperatorMap = options.slotOperatorMap;
      this.slotWirings = options.slotWirings;
      this.getEnemyHpPercentage = options.getEnemyHpPercentage;
      this.getControlledSlotAtFrame = options.getControlledSlotAtFrame;
      this.triggerIndex = options.triggerIndex;
    }
  }

  /**
   * Reset for reuse without deallocating the seenTriggers Set.
   */
  resetWith(
    controller: DerivedEventController,
    baseEvents: readonly TimelineEvent[],
    options?: {
      loadoutProperties?: Record<string, LoadoutProperties>;
      slotOperatorMap?: Record<string, string>;
      slotWirings?: SlotTriggerWiring[];
      getEnemyHpPercentage?: (frame: number) => number | null;
      getControlledSlotAtFrame?: (frame: number) => string;
      triggerIndex?: TriggerIndex;
    },
  ) {
    this.controller = controller;
    this.baseEvents = baseEvents;
    this.seenTriggers.clear();
    this.loadoutProperties = options?.loadoutProperties;
    this.slotOperatorMap = options?.slotOperatorMap;
    this.slotWirings = options?.slotWirings;
    this.getEnemyHpPercentage = options?.getEnemyHpPercentage;
    this.getControlledSlotAtFrame = options?.getControlledSlotAtFrame;
    this.triggerIndex = options?.triggerIndex;
  }

  // ── DSL Effect interpretation ──────────────────────────────────────────

  interpret(effect: Effect, ctx: InterpretContext): boolean {
    if (!validateVerbObject(effect.verb, effect.object as string)) return false;

    switch (effect.verb) {
      case VerbType.ALL:     return this.doAll(effect, ctx);
      case VerbType.ANY:     return this.doAny(effect, ctx);
      case VerbType.APPLY:   return this.doApply(effect, ctx);
      case VerbType.CONSUME: return this.doConsume(effect, ctx);

      case VerbType.RESET:   return this.doReset(effect, ctx);
      case VerbType.REDUCE:  return this.doReduce(effect, ctx);

      case VerbType.REFRESH: case VerbType.EXTEND:
      case VerbType.RECOVER: case VerbType.RETURN: case VerbType.DEAL:
      case VerbType.HIT: case VerbType.DEFEAT: case VerbType.PERFORM:
      case VerbType.IGNORE: case VerbType.OVERHEAL: case VerbType.EXPERIENCE:
      case VerbType.MERGE:
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
    switch (entry.type) {
      case 'PROCESS_FRAME':     return this.handleProcessFrame(entry);
      case 'FRAME_EFFECT':      return this.handleFrameEffect(entry);
      case 'INFLICTION_CREATE': return this.handleInflictionCreate(entry);
      case 'ENGINE_TRIGGER':    return this.handleEngineTrigger(entry);
      case 'COMBO_RESOLVE':     return this.handleComboResolve(entry);
    }
  }

  // ── DSL verb handlers (private) ────────────────────────────────────────

  private resolveOwnerId(target: string | undefined, ctx: InterpretContext, determiner?: string) {
    if (target === NounType.OPERATOR || target === 'OPERATOR') {
      switch (determiner ?? DeterminerType.THIS) {
        case DeterminerType.THIS: return ctx.sourceOwnerId;
        case DeterminerType.ALL: return COMMON_OWNER_ID;
        case DeterminerType.OTHER: return ctx.targetOwnerId ?? ctx.sourceOwnerId;
        case DeterminerType.ANY: return ctx.targetOwnerId ?? ctx.sourceOwnerId;
        case DeterminerType.CONTROLLED:
          return this.getControlledSlotAtFrame?.(ctx.frame) ?? ctx.sourceOwnerId;
        default: return ctx.sourceOwnerId;
      }
    }
    if (target === NounType.ENEMY || target === 'ENEMY') return ENEMY_OWNER_ID;
    return ctx.sourceOwnerId;
  }

  private canDo(effect: Effect, ctx: InterpretContext) {
    const ownerId = this.resolveOwnerId(
      effect.to as string ?? effect.fromObject as string,
      ctx, effect.toDeterminer ?? effect.fromDeterminer,
    );

    switch (effect.verb) {
      case VerbType.APPLY:
        if (effect.object === 'INFLICTION') {
          const col = resolveInflictionColumnId(effect.adjective);
          return col ? this.controller.canApplyInfliction(col, ownerId, ctx.frame) : false;
        }
        if (effect.object === 'STATUS') {
          const col = resolveStatusColumnId(effect.objectId);
          const configLimit = effect.objectId ? getStatusStackLimit(effect.objectId) : undefined;
          return this.controller.canApplyStatus(col, ownerId, ctx.frame, configLimit);
        }
        if (effect.object === 'REACTION') {
          const col = resolveReactionColumnId(effect.adjective);
          return col ? this.controller.canApplyReaction(col, ownerId, ctx.frame) : false;
        }
        if (effect.object === 'PHYSICAL_STATUS') return true;
        return true;
      case VerbType.CONSUME:
        if (effect.object === 'INFLICTION') {
          const col = resolveInflictionColumnId(effect.adjective);
          return col ? this.controller.canConsumeInfliction(col, ownerId, ctx.frame) : false;
        }
        if (effect.object === 'REACTION') {
          const col = resolveReactionColumnId(effect.adjective);
          return col ? this.controller.canConsumeReaction(col, ownerId, ctx.frame) : false;
        }
        if (effect.object === 'STATUS') {
          const col = resolveStatusColumnId(effect.objectId);
          return this.controller.canConsumeStatus(col, ownerId, ctx.frame);
        }
        return true;
      default:
        return true;
    }
  }

  private doApply(effect: Effect, ctx: InterpretContext) {
    const ownerId = this.resolveOwnerId(effect.to as string, ctx, effect.toDeterminer);
    const source = { ownerId: ctx.sourceOwnerId, skillName: ctx.sourceSkillName };

    if (effect.object === 'INFLICTION') {
      const columnId = resolveInflictionColumnId(effect.adjective);
      if (!columnId) return false;
      const dv = this.resolveWith(effect.with?.duration, ctx);
      this.controller.createInfliction(columnId, ownerId, ctx.frame, typeof dv === 'number' ? Math.round(dv * FPS) : FPS, source);
      return true;
    }
    if (effect.object === 'STATUS') {
      const columnId = resolveStatusColumnId(effect.objectId);
      const dv = this.resolveWith(effect.with?.duration, ctx);
      const duration = typeof dv === 'number' ? Math.round(dv * FPS)
        : getStatusConfigDuration(effect.objectId);
      this.controller.createStatus(columnId, ownerId, ctx.frame, duration, source, {
        statusName: effect.objectId,
      });
      return true;
    }
    if (effect.object === 'REACTION') {
      const columnId = resolveReactionColumnId(effect.adjective);
      if (!columnId) return false;
      const dv = this.resolveWith(effect.with?.duration, ctx);
      const sl = this.resolveWith(effect.with?.stacks, ctx);
      this.controller.createReaction(columnId, ownerId, ctx.frame, typeof dv === 'number' ? Math.round(dv * FPS) : 2400, source, {
        stacks: typeof sl === 'number' ? sl : undefined,
      });
      return true;
    }
    if (effect.object === 'PHYSICAL_STATUS') {
      return this.applyPhysicalStatus(effect, ctx);
    }
    if (effect.object === 'STAGGER') {
      const v = this.resolveWith(effect.with?.staggerValue, ctx);
      this.controller.createStagger('stagger', ownerId, ctx.frame, typeof v === 'number' ? v : 0, source);
      return true;
    }
    console.warn(`[EventInterpretor] APPLY: unsupported object ${effect.object}`);
    return false;
  }

  private doConsume(effect: Effect, ctx: InterpretContext) {
    const ownerId = this.resolveOwnerId(
      effect.fromObject as string ?? effect.to as string,
      ctx, effect.fromDeterminer ?? effect.toDeterminer,
    );
    const source = { ownerId: ctx.sourceOwnerId, skillName: ctx.sourceSkillName };
    const rawStacks = effect.with?.stacks as ValueNode | typeof THRESHOLD_MAX | number | undefined;
    if (rawStacks == null) console.warn(
      `[EventInterpretor] CONSUME ${effect.object} ${effect.objectId ?? effect.adjective ?? '?'}: missing with.stacks`,
      `\n  source: ${ctx.sourceSkillName} (owner: ${ctx.sourceOwnerId}, frame: ${ctx.frame})`,
      `\n  effect:`, JSON.stringify(effect, null, 2),
    );
    const isMax = rawStacks === THRESHOLD_MAX;
    const sv = isMax ? undefined : this.resolveWith(rawStacks, ctx);
    const count = isMax ? Infinity : (typeof sv === 'number' ? sv : 1);

    if (effect.object === 'INFLICTION') {
      const col = resolveInflictionColumnId(effect.adjective);
      if (!col) return false;
      return this.controller.consumeInfliction(col, ownerId, ctx.frame, count, source) > 0;
    }
    if (effect.object === 'REACTION') {
      const col = resolveReactionColumnId(effect.adjective);
      if (!col) return false;
      this.controller.consumeReaction(col, ownerId, ctx.frame, source);
      return true;
    }
    if (effect.object === 'STATUS') {
      this.controller.consumeStatus(resolveStatusColumnId(effect.objectId), ownerId, ctx.frame, source);
      return true;
    }
    return true;
  }

  private doReset(effect: Effect, _ctx: InterpretContext) {
    // RESET now only supports STACKS (cooldown reduction moved to REDUCE)
    if (effect.object !== ObjectType.STACKS) return true;
    return true;
  }

  private buildValueContext(ctx: InterpretContext): ValueResolutionContext {
    const loadout = this.loadoutProperties?.[ctx.sourceOwnerId];
    const baseCtx = buildContextForSkillColumn(loadout, SKILL_COLUMNS.BATTLE);
    if (ctx.potential != null) baseCtx.potential = ctx.potential;
    return baseCtx;
  }

  /** Resolve a WITH property ValueNode or raw number, returning undefined if absent. */
  private resolveWith(node: ValueNode | number | undefined, ctx: InterpretContext): number | undefined {
    if (node == null) return undefined;
    if (typeof node === 'number') return node;
    return resolveValueNode(node, this.buildValueContext(ctx));
  }

  private doReduce(effect: Effect, ctx: InterpretContext) {
    if (effect.object !== ObjectType.COOLDOWN) return true;
    if (!effect.by) return true;

    // Resolve which skill column's cooldown to reduce
    const SKILL_NOUN_TO_COLUMN: Record<string, string> = {
      [NounType.COMBO_SKILL]: SKILL_COLUMNS.COMBO,
      [NounType.BATTLE_SKILL]: SKILL_COLUMNS.BATTLE,
      [NounType.ULTIMATE]: SKILL_COLUMNS.ULTIMATE,
    };
    const targetColumnId = SKILL_NOUN_TO_COLUMN[effect.nounAdjunct ?? ''];
    if (!targetColumnId) return true;

    const byValue = resolveValueNode(effect.by.value, this.buildValueContext(ctx));

    // Find same-owner events in the target column that are in cooldown phase at ctx.frame
    for (const ev of this.baseEvents) {
      if (ev.ownerId !== ctx.sourceOwnerId) continue;
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

      // Convert by value to frames based on unit
      let reductionFrames: number;
      switch (effect.by.unit) {
        case UnitType.SECOND:
          reductionFrames = byValue * FPS;
          break;
        case UnitType.PERCENTAGE:
          reductionFrames = cooldownDur * (byValue / 100);
          break;
        default:
          reductionFrames = byValue;
          break;
      }

      // Subtract from remaining cooldown at ctx.frame
      const remainingCooldown = cooldownEnd - ctx.frame;
      const newRemaining = Math.max(0, remainingCooldown - reductionFrames);
      const newCooldownDuration = (ctx.frame - activeEnd) + newRemaining;
      this.controller.reduceCooldown(ev.uid, newCooldownDuration);
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
        const condCtx: ConditionContext = { events: ctx.allEvents(), frame: ctx.frame, sourceOwnerId: ctx.sourceOwnerId, targetOwnerId: ctx.targetOwnerId, getControlledSlotAtFrame: this.getControlledSlotAtFrame };
        if (!evaluateConditions(pred.conditions, condCtx)) continue;
        if (!pred.effects.every(e => e.verb === VerbType.ALL || e.verb === VerbType.ANY || this.canDo(e, ctx))) continue;
        for (const child of pred.effects) this.interpret(child, ctx);
        ran = true;
      }
      if (!ran) break;
    }
    return true;
  }

  private doAny(effect: Effect, ctx: InterpretContext) {
    const preds = effect.predicates ?? [];
    const condCtx: ConditionContext = { events: ctx.allEvents(), frame: ctx.frame, sourceOwnerId: ctx.sourceOwnerId, targetOwnerId: ctx.targetOwnerId, getControlledSlotAtFrame: this.getControlledSlotAtFrame };
    for (const pred of preds) {
      if (!evaluateConditions(pred.conditions, condCtx)) continue;
      for (const child of pred.effects) this.interpret(child, ctx);
      return true;
    }
    return false;
  }

  // ── Physical status logic (hardcoded engine mechanics) ─────────────────

  /**
   * APPLY PHYSICAL_STATUS — hardcoded Lift/Breach/etc. logic.
   *
   * Lift mechanic:
   * - Always adds 1 Vulnerable stack.
   * - If enemy already has Vulnerable OR isForced: also creates the Lift status
   *   (1s duration, RESET stacking, 1 segment with damage + stagger at frame 0).
   * - Damage: 120% ATK (physical).
   * - Stagger: 10 × (1 + ArtsIntensity / 200).
   */
  private applyPhysicalStatus(effect: Effect, ctx: InterpretContext): boolean {
    const columnId = resolvePhysicalStatusColumnId(effect.adjective);
    if (!columnId) return false;

    const source = { ownerId: ctx.sourceOwnerId, skillName: ctx.sourceSkillName };
    const isForced = this.resolveWith(effect.with?.isForced, ctx) === 1;

    if (columnId === PHYSICAL_STATUS_COLUMNS.LIFT
      || columnId === PHYSICAL_STATUS_COLUMNS.KNOCK_DOWN) {
      return this.applyLiftOrKnockDown(columnId, ctx.frame, source, isForced);
    }

    if (columnId === PHYSICAL_STATUS_COLUMNS.CRUSH) {
      return this.applyCrush(ctx.frame, source);
    }

    if (columnId === PHYSICAL_STATUS_COLUMNS.BREACH) {
      return this.applyBreach(ctx.frame, source);
    }

    return false;
  }

  /**
   * Shared logic for Lift and Knock Down — identical mechanics:
   * 120% ATK physical damage, 10 base stagger, 1s RESET, Vulnerable gate.
   */
  private applyLiftOrKnockDown(
    columnId: string,
    frame: number,
    source: { ownerId: string; skillName: string },
    isForced: boolean,
  ): boolean {
    const hasVulnerable = this.controller.activeCount(
      PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, ENEMY_OWNER_ID, frame,
    ) > 0;

    // Always add 1 Vulnerable stack
    this.controller.createInfliction(
      PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, ENEMY_OWNER_ID, frame,
      PHYSICAL_INFLICTION_DURATION, source,
    );

    // Status only triggers if enemy had Vulnerable OR isForced
    if (!hasVulnerable && !isForced) return true;

    const statusName = columnId as PhysicalStatusType;
    const label = STATUS_LABELS[statusName];

    this.controller.createStatus(
      columnId, ENEMY_OWNER_ID, frame, LIFT_KNOCK_DOWN_DURATION, source, {
        statusName,
        stackingMode: 'RESET',
        uid: `${columnId}-${source.ownerId}-${frame}`,
        event: {
          segments: [{
            properties: { duration: LIFT_KNOCK_DOWN_DURATION, name: label },
            frames: [{
              offsetFrame: 0,
              damageElement: ElementType.PHYSICAL,
              damageMultiplier: LIFT_KNOCK_DOWN_DAMAGE_MULTIPLIER,
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
    source: { ownerId: string; skillName: string },
  ): boolean {
    const vulnerableCount = this.controller.activeCount(
      PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, ENEMY_OWNER_ID, frame,
    );

    if (vulnerableCount === 0) {
      // No Vulnerable → just add 1 stack
      this.controller.createInfliction(
        PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, ENEMY_OWNER_ID, frame,
        PHYSICAL_INFLICTION_DURATION, source,
      );
      return true;
    }

    // Consume all Vulnerable stacks
    const consumed = this.controller.consumeInfliction(
      PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, ENEMY_OWNER_ID, frame,
      vulnerableCount, source,
    );

    const damageMultiplier = getPhysicalStatusBaseMultiplier(PhysicalStatusType.CRUSH, consumed);

    this.controller.createStatus(
      PHYSICAL_STATUS_COLUMNS.CRUSH, ENEMY_OWNER_ID, frame, LIFT_KNOCK_DOWN_DURATION, source, {
        statusName: PhysicalStatusType.CRUSH,
        stackingMode: 'RESET',
        uid: `${PhysicalStatusType.CRUSH}-${source.ownerId}-${frame}`,
        event: {
          stacks: consumed,
          segments: [{
            properties: { duration: LIFT_KNOCK_DOWN_DURATION, name: STATUS_LABELS[PhysicalStatusType.CRUSH] },
            frames: [{
              offsetFrame: 0,
              damageElement: ElementType.PHYSICAL,
              damageMultiplier,
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
    source: { ownerId: string; skillName: string },
  ): boolean {
    const vulnerableCount = this.controller.activeCount(
      PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, ENEMY_OWNER_ID, frame,
    );

    if (vulnerableCount === 0) {
      this.controller.createInfliction(
        PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, ENEMY_OWNER_ID, frame,
        PHYSICAL_INFLICTION_DURATION, source,
      );
      return true;
    }

    const consumed = this.controller.consumeInfliction(
      PHYSICAL_INFLICTION_COLUMNS.VULNERABLE, ENEMY_OWNER_ID, frame,
      vulnerableCount, source,
    );

    const stackCount = Math.min(consumed, 4);
    const damageMultiplier = getPhysicalStatusBaseMultiplier(PhysicalStatusType.BREACH, consumed);
    const durationFrames = BREACH_DURATION[stackCount] ?? BREACH_DURATION[1];

    this.controller.createStatus(
      PHYSICAL_STATUS_COLUMNS.BREACH, ENEMY_OWNER_ID, frame, durationFrames, source, {
        statusName: PhysicalStatusType.BREACH,
        stackingMode: 'RESET',
        uid: `${PhysicalStatusType.BREACH}-${source.ownerId}-${frame}`,
        event: {
          stacks: stackCount,
          segments: [{
            properties: { duration: durationFrames, name: STATUS_LABELS[PhysicalStatusType.BREACH] },
            frames: [{
              offsetFrame: 0,
              damageElement: ElementType.PHYSICAL,
              damageMultiplier,
            }],
          }],
        },
      },
    );

    return true;
  }

  // ── PROCESS_FRAME handler ──────────────────────────────────────────────

  /**
   * Unified frame processing: all effects on a frame marker execute
   * sequentially in config order. Replaces the old split collection
   * functions (collectInflictionEntries, collectFrameEffectEntries, etc.).
   */
  private handleProcessFrame(entry: QueueFrame): QueueFrame[] {
    const event = entry.sourceEvent!;
    const frame = entry.frameMarker;
    const si = entry.segmentIndex ?? -1;
    const fi = entry.frameIndex ?? -1;
    const absFrame = entry.frame;
    const source = { ownerId: event.ownerId, skillName: event.name };
    const newEntries: QueueFrame[] = [];

    const pot = this.loadoutProperties?.[event.ownerId]?.operator.potential ?? 0;

    // ── 1. Event-start hooks (si=-1, fi=-1 = no frame marker) ───────────
    const isEventStart = si === -1 && fi === -1;
    if (isEventStart) {
      // Link consumption for battle skills and ultimates
      if (event.columnId === SKILL_COLUMNS.BATTLE || event.columnId === SKILL_COLUMNS.ULTIMATE) {
        this.controller.consumeLink(event.uid, absFrame, source);
      }

      // Generic PERFORM trigger (PERFORM BATTLE_SKILL, etc.)
      newEntries.push(...this.checkReactiveTriggers('PERFORM', event.columnId, absFrame, event.ownerId, event.name));

      return newEntries; // event-start entry has no frame marker to process
    }

    if (!frame) return newEntries; // safety check

    // ── 2. Legacy frame marker fields (backwards compat) ────────────────
    // TODO: Migrate all frame markers to clause format so this section can be removed.

    // Apply arts infliction
    if (frame.applyArtsInfliction) {
      const inflCol = ELEMENT_TO_INFLICTION_COLUMN[frame.applyArtsInfliction.element];
      if (inflCol) {
        this.controller.createInfliction(
          inflCol, ENEMY_OWNER_ID, absFrame, INFLICTION_DURATION,
          source, { uid: `${event.uid}-inflict-${si}-${fi}` },
        );
        newEntries.push(...this.checkReactiveTriggers('APPLY', inflCol, absFrame, event.ownerId, event.name));
      }
    }

    // Combo trigger infliction mirroring
    if (frame.duplicatesTriggerInfliction && event.comboTriggerColumnId) {
      const triggerCol = event.comboTriggerColumnId;
      if (INFLICTION_COLUMN_IDS.has(triggerCol)) {
        this.controller.createInfliction(
          triggerCol, ENEMY_OWNER_ID, absFrame, INFLICTION_DURATION,
          source, { uid: `${event.uid}-combo-inflict-${si}-${fi}` },
        );
        newEntries.push(...this.checkReactiveTriggers('APPLY', triggerCol, absFrame, event.ownerId, event.name));
      }
    }

    // Apply status effects (operator/team/enemy-targeted)
    const statusEffects = frame.applyStatuses ?? (frame.applyStatus ? [frame.applyStatus] : []);
    for (let sti = 0; sti < statusEffects.length; sti++) {
      const se = statusEffects[sti];
      if (se.potentialMin != null && pot < se.potentialMin) continue;
      if (se.potentialMax != null && pot > se.potentialMax) continue;

      if (se.target.noun === NounType.TEAM) {
        const statusColumnId = se.status;
        const ultActiveEnd = event.startFrame + eventDuration(event);
        const statusDuration = se.durationFrames || Math.max(0, ultActiveEnd - absFrame);
        this.controller.createStatus(statusColumnId, COMMON_OWNER_ID, absFrame, statusDuration, source, {
          statusName: se.status,
          uid: `${event.uid}-team-status-${si}-${fi}`,
          event: {
            segments: [{ properties: { duration: statusDuration } }],
          },
        });
        newEntries.push(...this.checkReactiveTriggers('APPLY', se.status, absFrame, event.ownerId, event.name));
      } else if (se.target.noun === NounType.OPERATOR) {
        const teamColumnId = TEAM_STATUS_COLUMN[se.status];
        if (teamColumnId) {
          const ultActiveEnd = event.startFrame + eventDuration(event);
          let linkDuration = Math.max(0, ultActiveEnd - absFrame);
          if (pot >= 5) linkDuration += P5_LINK_EXTENSION_FRAMES;
          this.controller.createStatus(teamColumnId, COMMON_OWNER_ID, absFrame, linkDuration, source, {
            statusName: 'Squad Buff (Link)',
            uid: `${event.uid}-team-status-${si}-${fi}`,
            event: {
              segments: [{ properties: { duration: linkDuration } }],
            },
          });
          newEntries.push(...this.checkReactiveTriggers('APPLY', se.status, absFrame, event.ownerId, event.name));
        } else {
          const statusColumnId = statusNameToColumnId(se.status);
          const statusDuration = se.durationFrames || TOTAL_FRAMES;
          const created = this.controller.createStatus(statusColumnId, event.ownerId, absFrame, statusDuration, source, {
            statusName: se.status,
            uid: `${se.status.toLowerCase()}-${genEventUid()}`,
            event: {
              segments: [{ properties: { duration: statusDuration } }],
            },
          });
          if (created) {
            newEntries.push(...this.checkReactiveTriggers('APPLY', se.status, absFrame, event.ownerId, event.name));
          }
        }
      } else if (se.target.noun === NounType.ENEMY) {
        let susceptibility: Partial<Record<ElementType, number>> | undefined;
        let segments: import('../../consts/viewTypes').EventSegmentData[] | undefined;
        if (se.segments && se.segments.length > 0) {
          segments = se.segments.map(seg => ({
            properties: { duration: seg.durationFrames, name: seg.name },
            ...(seg.susceptibility && {
              unknown: { susceptibility: resolveSusceptibility(seg.susceptibility, event.columnId, event.ownerId, this.loadoutProperties) },
            }),
          }));
          const firstSeg = se.segments[0];
          if (firstSeg.susceptibility) {
            susceptibility = resolveSusceptibility(firstSeg.susceptibility, event.columnId, event.ownerId, this.loadoutProperties);
          }
        } else if (se.susceptibility) {
          susceptibility = resolveSusceptibility(se.susceptibility, event.columnId, event.ownerId, this.loadoutProperties);
        }
        this.controller.createStatus(se.status, ENEMY_OWNER_ID, absFrame, se.durationFrames, source, {
          statusName: se.eventName ?? se.status,
          stackingMode: se.stackingInteraction,
          uid: `${event.uid}-status-${si}-${fi}-${sti}`,
          event: {
            ...(susceptibility && { susceptibility }),
            ...(segments ? { segments } : { segments: [{ properties: { duration: se.durationFrames } }] }),
          },
        });
        newEntries.push(...this.checkReactiveTriggers('APPLY', se.status, absFrame, event.ownerId, event.name));
      }
    }

    // Forced reaction
    if (frame.applyForcedReaction) {
      const reactionColumnId = FORCED_REACTION_COLUMN[frame.applyForcedReaction.reaction];
      if (reactionColumnId) {
        const reactionDur = frame.applyForcedReaction.durationFrames ?? FORCED_REACTION_DURATION[reactionColumnId] ?? REACTION_DURATION;
        this.controller.createReaction(reactionColumnId, ENEMY_OWNER_ID, absFrame, reactionDur, source, {
          stacks: frame.applyForcedReaction.stacks ?? 1,
          forcedReaction: true,
          uid: `${event.uid}-forced-${si}-${fi}`,
        });
        newEntries.push(...this.checkReactiveTriggers('APPLY', reactionColumnId, absFrame, event.ownerId, event.name));
      }
    }

    // Consume status
    if (frame.consumeStatus) {
      const consumeTarget = this.resolveConsumeTarget(frame.consumeStatus, event.ownerId);
      this.controller.consumeStatus(consumeTarget.columnId, consumeTarget.ownerId, absFrame, source);
      newEntries.push(...this.checkReactiveTriggers('CONSUME', consumeTarget.columnId, absFrame, event.ownerId, event.name));
    }

    // Consume reaction (legacy marker + DSL v2 clauses)
    if (frame.consumeReaction) {
      this.controller.consumeReaction(frame.consumeReaction.columnId, ENEMY_OWNER_ID, absFrame, source);
      newEntries.push(...this.checkReactiveTriggers('CONSUME', frame.consumeReaction.columnId, absFrame, event.ownerId, event.name));
    }
    if (frame.clauses) {
      for (const pred of frame.clauses) {
        const consumeEf = pred.effects.find(e => e.type === 'consumeReaction');
        if (!consumeEf?.consumeReaction) continue;
        if (pred.conditions.length > 0) {
          const condCtx: ConditionContext = {
            events: [...this.baseEvents, ...this.controller.output],
            frame: absFrame,
            sourceOwnerId: event.ownerId,
          };
          if (!evaluateConditions(pred.conditions as unknown as import('../../dsl/semantics').Interaction[], condCtx)) continue;
        }
        const cr = consumeEf.consumeReaction;
        this.controller.consumeReaction(cr.columnId, ENEMY_OWNER_ID, absFrame, source);
        newEntries.push(...this.checkReactiveTriggers('CONSUME', cr.columnId, absFrame, event.ownerId, event.name));
      }
    }

    // ── 3. PERFORM triggers from frameTypes ─────────────────────────────
    if (frame.frameTypes) {
      for (const ft of frame.frameTypes) {
        if (ft === EventFrameType.FINAL_STRIKE || ft === EventFrameType.FINISHER || ft === EventFrameType.DIVE) {
          const performObject = ft === EventFrameType.FINAL_STRIKE ? 'FINAL_STRIKE'
            : ft === EventFrameType.FINISHER ? 'FINISHER' : 'DIVE_ATTACK';
          newEntries.push(...this.checkPerformTriggers(performObject, event, absFrame));
        }
      }
    }

    return newEntries;
  }

  /**
   * Fire PERFORM triggers for a specific PERFORM object (FINAL_STRIKE, FINISHER, DIVE_ATTACK).
   * Looks up the trigger index for matching defs.
   */
  private checkPerformTriggers(performObject: string, event: TimelineEvent, absFrame: number): QueueFrame[] {
    if (!this.triggerIndex) return [];
    const results: QueueFrame[] = [];
    for (const entry of this.triggerIndex.lookup(`PERFORM:${performObject}`)) {
      if (entry.primaryVerb !== 'PERFORM') continue;
      const isAny = entry.primaryCondition.subjectDeterminer === 'ANY';
      if (!isAny && event.ownerId !== entry.operatorSlotId) continue;
      const defKey = `${entry.def.properties.id}:${entry.operatorSlotId}:${absFrame}`;
      if (this.seenTriggers.has(defKey)) continue;
      this.seenTriggers.add(defKey);

      const triggerCtx: EngineTriggerContext = {
        def: entry.def,
        operatorId: entry.operatorId,
        operatorSlotId: entry.operatorSlotId,
        potential: entry.potential,
        operatorSlotMap: entry.operatorSlotMap,
        loadoutProperties: entry.loadoutProperties,
        haveConditions: entry.haveConditions,
        triggerEffects: entry.triggerEffects,
      };
      results.push({
        frame: absFrame,
        priority: PRIORITY.ENGINE_TRIGGER,
        type: 'ENGINE_TRIGGER',
        statusName: entry.def.properties.id,
        columnId: '',
        ownerId: entry.operatorSlotId,
        sourceOwnerId: event.ownerId,
        sourceSkillName: event.name,
        maxStacks: 0,
        durationFrames: 0,
        operatorSlotId: entry.operatorSlotId,
        engineTrigger: { frame: absFrame, sourceOwnerId: event.ownerId, sourceSkillName: event.name, ctx: triggerCtx, isEquip: entry.isEquip },
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
    const wiring = this.slotWirings.find(w => w.slotId === combo.ownerId);
    if (!wiring) return;
    const allEvents = [...this.baseEvents, ...this.controller.output];
    const clause = getComboTriggerClause(wiring.operatorId);
    if (!clause?.length) return;
    const info = getComboTriggerInfo(wiring.operatorId);
    const windowFrames = info?.windowFrames ?? 720;

    const matches = findClauseTriggerMatches(clause, allEvents, wiring.slotId);
    let triggerCol: string | undefined;
    for (const match of matches) {
      if (match.originOwnerId === combo.ownerId) continue;
      if (combo.startFrame >= match.frame && combo.startFrame < match.frame + windowFrames) {
        triggerCol = match.sourceColumnId;
        break;
      }
    }
    if (!triggerCol) return;

    this.controller.setComboTriggerColumnId(combo.uid, triggerCol);
    // Mirrored inflictions are handled by PROCESS_FRAME when it encounters
    // duplicatesTriggerInfliction on subsequent frame markers.
  }

  /** Handle COMBO_RESOLVE queue entry — deferred combo trigger resolution. */
  private handleComboResolve(entry: QueueFrame): QueueFrame[] {
    const combo = entry.comboResolveEvent;
    if (!combo) return [];
    this.resolveComboTrigger(combo, entry.frame, []);
    return [];
  }

  /** Resolve a consumeStatus target's column ID and owner from the status definition. */
  private resolveConsumeTarget(statusId: string, eventOwnerId: string): { columnId: string; ownerId: string } {
    const columnId = statusNameToColumnId(statusId);
    const operatorId = this.slotOperatorMap?.[eventOwnerId];
    if (operatorId) {
      const statuses = getOperatorStatuses(operatorId);
      const def = statuses.find(s => s.id === statusId);
      if (def) {
        if (def.target === 'ENEMY') return { columnId, ownerId: ENEMY_OWNER_ID };
        return { columnId, ownerId: eventOwnerId };
      }
    }
    return { columnId, ownerId: eventOwnerId };
  }

  // ── Legacy QueueFrame handlers (for freeform derived events) ──────────

  private handleFrameEffect(entry: QueueFrame): QueueFrame[] {
    const ev = entry.derivedEvent!;
    const source = { ownerId: ev.sourceOwnerId ?? '', skillName: ev.sourceSkillName ?? '' };

    let created = false;
    if (ev.ownerId === ENEMY_OWNER_ID && REACTION_COLUMN_IDS.has(ev.columnId)) {
      this.controller.createReaction(ev.columnId, ev.ownerId, entry.frame, eventDuration(ev), source, {
        stacks: ev.stacks, forcedReaction: ev.forcedReaction || ev.isForced, uid: ev.uid,
      });
      created = true;
    } else {
      created = this.controller.createStatus(ev.columnId, ev.ownerId, entry.frame, eventDuration(ev), source, {
        statusName: ev.name, stackingMode: entry.stackingInteraction, uid: ev.uid,
        ...(entry.maxStacks > 0 && { maxStacks: entry.maxStacks }),
        event: {
          ...(ev.susceptibility && { susceptibility: ev.susceptibility }),
          segments: ev.segments,
        },
      });
    }

    // Post-hook: check for reactive triggers (lifecycle clauses + onTriggerClause APPLY matches)
    if (!created) return [];
    const triggerObjectId = ev.name || ev.columnId || ev.id;
    return this.checkReactiveTriggers('APPLY', triggerObjectId, entry.frame, entry.operatorSlotId ?? ev.ownerId, ev.sourceSkillName ?? ev.name);
  }

  /**
   * Check the trigger index for defs that react to an observable event.
   * Seeds ENGINE_TRIGGER entries for matching triggers with HAVE conditions deferred.
   * Also checks lifecycle clauses (clause-based triggers on the status itself).
   */
  private checkReactiveTriggers(
    verb: string, objectId: string, frame: number, slotId: string, sourceSkillName: string,
  ): QueueFrame[] {
    if (!this.triggerIndex) return [];
    const results: QueueFrame[] = [];

    // ── Lifecycle clause triggers (clause with HAVE conditions) ──────────
    const lifecycle = this.triggerIndex.getLifecycle(objectId);
    if (lifecycle) {
      const key = `lifecycle:${lifecycle.def.properties.id}:${slotId}:${frame}`;
      if (!this.seenTriggers.has(key)) {
        this.seenTriggers.add(key);
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
          haveConditions: lifecycle.haveConditions,
          triggerEffects: lifecycle.effects,
        };
        results.push({
          frame,
          priority: PRIORITY.ENGINE_TRIGGER,
          type: 'ENGINE_TRIGGER',
          statusName: lifecycle.def.properties.id,
          columnId: '',
          ownerId: slotId,
          sourceOwnerId: slotId,
          sourceSkillName,
          maxStacks: 0,
          durationFrames: 0,
          operatorSlotId: slotId,
          engineTrigger: { frame, sourceOwnerId: slotId, sourceSkillName, ctx: triggerCtx, isEquip: false },
        });
      }
    }

    // ── onTriggerClause triggers matching this event's column ──────────────
    const col = statusNameToColumnId(objectId);
    for (const entry of this.triggerIndex.matchEvent(col)) {
      const defKey = `${entry.def.properties.id}:${entry.operatorSlotId}:${frame}`;
      if (this.seenTriggers.has(defKey)) continue;
      this.seenTriggers.add(defKey);

      const triggerCtx: EngineTriggerContext = {
        def: entry.def,
        operatorId: entry.operatorId,
        operatorSlotId: entry.operatorSlotId,
        potential: entry.potential,
        operatorSlotMap: entry.operatorSlotMap,
        loadoutProperties: entry.loadoutProperties,
        haveConditions: entry.haveConditions,
        triggerEffects: entry.triggerEffects,
      };
      results.push({
        frame,
        priority: PRIORITY.ENGINE_TRIGGER,
        type: 'ENGINE_TRIGGER',
        statusName: entry.def.properties.id,
        columnId: '',
        ownerId: entry.operatorSlotId,
        sourceOwnerId: slotId,
        sourceSkillName,
        maxStacks: 0,
        durationFrames: 0,
        operatorSlotId: entry.operatorSlotId,
        engineTrigger: { frame, sourceOwnerId: slotId, sourceSkillName, ctx: triggerCtx, isEquip: entry.isEquip },
      });
    }

    return results;
  }

  private handleInflictionCreate(entry: QueueFrame): QueueFrame[] {
    this.controller.createInfliction(
      entry.columnId, entry.ownerId, entry.frame, entry.durationFrames,
      { ownerId: entry.sourceOwnerId, skillName: entry.sourceSkillName },
      { uid: entry.uid },
    );
    return this.checkReactiveTriggers('APPLY', entry.columnId, entry.frame, entry.operatorSlotId, entry.sourceSkillName);
  }



  private handleEngineTrigger(entry: QueueFrame): QueueFrame[] {
    const trigger = entry.engineTrigger;
    if (!trigger) return [];

    const { ctx } = trigger;
    const triggerEffects = ctx.triggerEffects ?? [];

    // Compound effects (ALL/ANY) go through the interpretor for proper canDo pre-checks.
    const compoundEffects = triggerEffects.filter(
      e => (e.verb === 'ALL' || e.verb === 'ANY') && e.effects && e.effects.length > 0,
    );
    if (compoundEffects.length > 0) {
      // Check HAVE conditions first (deferred from collection time)
      if (ctx.haveConditions.length > 0) {
        const condCtx: ConditionContext = {
          events: [...this.baseEvents, ...this.controller.output],
          frame: entry.frame,
          sourceOwnerId: ctx.operatorSlotId,
          getEnemyHpPercentage: this.getEnemyHpPercentage,
        };
        if (!evaluateConditions(ctx.haveConditions as unknown as import('../../dsl/semantics').Interaction[], condCtx)) return [];
      }

      const interpretCtx: InterpretContext = {
        frame: entry.frame,
        sourceOwnerId: ctx.operatorSlotId,
        sourceSkillName: trigger.sourceSkillName,
        allEvents: () => [...this.baseEvents, ...this.controller.output],
        potential: ctx.potential,
      };

      for (const te of compoundEffects) {
        const effect: Effect = {
          verb: te.verb as VerbType,
          cardinalityConstraint: te.cardinalityConstraint as Effect['cardinalityConstraint'],
          value: te.value === 'MAX' ? THRESHOLD_MAX : te.value as Effect['value'],
          effects: te.effects?.map(se => ({
            verb: se.verb as VerbType,
            object: se.object as Effect['object'],
            objectId: se.objectId,
            adjective: (se.adjective ?? se.element) as Effect['adjective'],
            fromObject: se.fromObject as Effect['fromObject'],
            to: se.to as Effect['to'],
            toDeterminer: se.toDeterminer as Effect['toDeterminer'],
            with: se.with as Effect['with'],
          })),
        };
        this.interpret(effect, interpretCtx);
      }
      return [];
    }

    // Simple triggers: use evaluateEngineTrigger
    evaluateEngineTrigger(
      trigger, [...this.baseEvents, ...this.controller.output],
      (col, owner, frame) => this.controller.activeCount(col, owner, frame),
      (ev) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { uid, name, ownerId, columnId, startFrame, segments, sourceOwnerId, sourceSkillName, stackingMode: sm, ...extraProps } = ev as any;
        this.controller.createStatus(columnId, ownerId, startFrame, eventDuration(ev),
          { ownerId: sourceOwnerId ?? '', skillName: sourceSkillName ?? '' },
          { statusName: name, uid, ...(sm ? { stackingMode: sm } : {}), event: { segments, ...extraProps } },
        );
      },
      this.getEnemyHpPercentage,
    );
    return [];
  }


}
