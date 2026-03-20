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
  VERB_OBJECTS,
  THRESHOLD_MAX,
  DURATION_END,
} from '../../consts/semantics';
import { TimelineEvent, eventDuration, setEventDuration } from '../../consts/viewTypes';
import { CombatSkillsType, ElementType, EventStatusType, PhysicalStatusType, StatusType, TargetType } from '../../consts/enums';
import { ENEMY_OWNER_ID, INFLICTION_COLUMNS, INFLICTION_COLUMN_IDS, PHYSICAL_INFLICTION_COLUMNS, PHYSICAL_STATUS_COLUMNS, REACTION_COLUMNS, REACTION_COLUMN_IDS } from '../../model/channels';
import { FPS } from '../../utils/timeline';
import { STATUS_LABELS } from '../../consts/timelineColumnLabels';
import { COMMON_OWNER_ID } from '../slot/commonSlotController';
import { evaluateConditions } from './conditionEvaluator';
import type { ConditionContext } from './conditionEvaluator';
import { absoluteFrame, foreignStopsFor } from './processTimeStop';
import { BREACH_DURATION, EXCHANGE_EVENT_DURATION, INFLICTION_DURATION, PHYSICAL_INFLICTION_DURATION, TEAM_STATUS_COLUMN, resolveSusceptibility } from './processInfliction';
import { getPhysicalStatusBaseMultiplier } from '../../model/calculation/damageFormulas';
import type { SlotTriggerWiring } from './processComboSkill';
import { findClauseTriggerMatches } from './statusDerivationEngine';
import { getComboTriggerClause, getComboTriggerInfo } from '../../model/event-frames/operatorJsonLoader';
import { MAX_INFLICTION_STACKS, PRIORITY, CONSUMING_COLUMNS } from './eventQueueTypes';
import { evaluateThresholdForExchange, evaluateEngineTrigger } from './statusDerivationEngine';
import { DerivedEventController } from './derivedEventController';
import type { QueueFrame } from './eventQueueTypes';
import type { ExchangeStatusQueueContext, AbsorptionContext } from './statusDerivationEngine';
import type { LoadoutProperties } from '../../view/InformationPane';

// ── Column resolution (module-private helpers) ───────────────────────────

const ELEMENT_TO_INFLICTION_COLUMN: Record<string, string> = {
  HEAT: INFLICTION_COLUMNS.HEAT, CRYO: INFLICTION_COLUMNS.CRYO,
  NATURE: INFLICTION_COLUMNS.NATURE, ELECTRIC: INFLICTION_COLUMNS.ELECTRIC,
};

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
  if (!validObjects.includes(object)) {
    console.warn(`[EventInterpretor] Invalid verb+object: ${verb} ${object}. Valid: ${validObjects.join(', ')}`);
    return false;
  }
  return true;
}

function resolveCardinality(cardinality: number | typeof THRESHOLD_MAX | undefined, potential: number, defaultMax = 999) {
  if (cardinality === THRESHOLD_MAX) return defaultMax;
  return cardinality ?? defaultMax;
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

export class EventInterpretor {
  readonly controller: DerivedEventController;
  private readonly baseEvents: readonly TimelineEvent[];
  private readonly exchangeContexts: ExchangeStatusQueueContext[];
  private readonly absorptionContexts: AbsorptionContext[];
  private readonly loadoutProperties?: Record<string, LoadoutProperties>;
  private readonly slotOperatorMap?: Record<string, string>;
  private readonly slotWirings?: SlotTriggerWiring[];
  private thresholdDerived: TimelineEvent[] = [];

  constructor(
    controller: DerivedEventController,
    baseEvents: readonly TimelineEvent[],
    options?: {
      exchangeContexts?: ExchangeStatusQueueContext[];
      absorptionContexts?: AbsorptionContext[];
      loadoutProperties?: Record<string, LoadoutProperties>;
      slotOperatorMap?: Record<string, string>;
      slotWirings?: SlotTriggerWiring[];
    },
  ) {
    this.controller = controller;
    this.baseEvents = baseEvents;
    this.exchangeContexts = options?.exchangeContexts ?? [];
    this.absorptionContexts = options?.absorptionContexts ?? [];
    this.loadoutProperties = options?.loadoutProperties;
    this.slotOperatorMap = options?.slotOperatorMap;
    this.slotWirings = options?.slotWirings;
  }

  // ── DSL Effect interpretation ──────────────────────────────────────────

  interpret(effect: Effect, ctx: InterpretContext): boolean {
    if (!validateVerbObject(effect.verb, effect.object as string)) return false;

    switch (effect.verb) {
      case VerbType.ALL:     return this.doAll(effect, ctx);
      case VerbType.ANY:     return this.doAny(effect, ctx);
      case VerbType.APPLY:   return this.doApply(effect, ctx);
      case VerbType.CONSUME: return this.doConsume(effect, ctx);
      case VerbType.REFRESH: return this.doRefresh(effect, ctx);
      case VerbType.EXTEND:  return this.doExtend(effect, ctx);

      case VerbType.RECOVER: case VerbType.RETURN: case VerbType.DEAL:
      case VerbType.HIT: case VerbType.DEFEAT: case VerbType.PERFORM:
      case VerbType.IGNORE: case VerbType.OVERHEAL: case VerbType.EXPERIENCE:
      case VerbType.MERGE: case VerbType.RESET:
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
      case 'FRAME_EFFECT':      return this.handleFrameEffect(entry);
      case 'INFLICTION_CREATE': return this.handleInflictionCreate(entry);
      case 'CONSUME':           return this.handleConsume(entry);
      case 'ABSORPTION_CHECK':  return this.handleAbsorptionCheck(entry);
      case 'EXCHANGE_CREATE':   return this.handleExchangeCreate(entry);
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
        default: return ctx.sourceOwnerId;
      }
    }
    if (target === NounType.ENEMY || target === 'ENEMY') return ENEMY_OWNER_ID;
    return ctx.sourceOwnerId;
  }

  private canDo(effect: Effect, ctx: InterpretContext) {
    const ownerId = this.resolveOwnerId(
      effect.toObject as string ?? effect.fromObject as string,
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
          return this.controller.canApplyStatus(col, ownerId, ctx.frame);
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
    const ownerId = this.resolveOwnerId(effect.toObject as string, ctx, effect.toDeterminer);
    const source = { ownerId: ctx.sourceOwnerId, skillName: ctx.sourceSkillName };

    if (effect.object === 'INFLICTION') {
      const columnId = resolveInflictionColumnId(effect.adjective);
      if (!columnId) return false;
      const dv = effect.with?.duration?.value;
      this.controller.createInfliction(columnId, ownerId, ctx.frame, typeof dv === 'number' ? Math.round(dv * 120) : 120, source);
      return true;
    }
    if (effect.object === 'STATUS') {
      const columnId = resolveStatusColumnId(effect.objectId);
      const dv = effect.with?.duration?.value;
      this.controller.createStatus(columnId, ownerId, ctx.frame, typeof dv === 'number' ? Math.round(dv * 120) : 2400, source, {
        statusName: effect.objectId,
      });
      return true;
    }
    if (effect.object === 'REACTION') {
      const columnId = resolveReactionColumnId(effect.adjective);
      if (!columnId) return false;
      const dv = effect.with?.duration?.value;
      const sl = effect.with?.statusLevel?.value;
      this.controller.createReaction(columnId, ownerId, ctx.frame, typeof dv === 'number' ? Math.round(dv * 120) : 2400, source, {
        statusLevel: typeof sl === 'number' ? sl : undefined,
      });
      return true;
    }
    if (effect.object === 'PHYSICAL_STATUS') {
      return this.applyPhysicalStatus(effect, ctx);
    }
    if (effect.object === 'STAGGER') {
      const v = effect.with?.staggerValue?.value;
      this.controller.createStagger('stagger', ownerId, ctx.frame, typeof v === 'number' ? v : 0, source);
      return true;
    }
    console.warn(`[EventInterpretor] APPLY: unsupported object ${effect.object}`);
    return false;
  }

  private doConsume(effect: Effect, ctx: InterpretContext) {
    const ownerId = this.resolveOwnerId(
      effect.fromObject as string ?? effect.toObject as string,
      ctx, effect.fromDeterminer ?? effect.toDeterminer,
    );
    const source = { ownerId: ctx.sourceOwnerId, skillName: ctx.sourceSkillName };
    const sv = effect.with?.stacks?.value;
    const count = typeof sv === 'number' ? sv : 1;
    if (sv == null) console.warn(`[EventInterpretor] CONSUME: implicit cardinality 1 — configs should be explicit`);

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

  private doRefresh(effect: Effect, ctx: InterpretContext) {
    const ownerId = this.resolveOwnerId(effect.toObject as string, ctx, effect.toDeterminer);
    const source = { ownerId: ctx.sourceOwnerId, skillName: ctx.sourceSkillName };
    const columnId = effect.object === 'INFLICTION'
      ? resolveInflictionColumnId(effect.adjective)
      : effect.object === 'REACTION'
        ? resolveReactionColumnId(effect.adjective)
        : resolveStatusColumnId(effect.objectId);
    if (!columnId) return false;
    this.controller.resetStatus(columnId, ownerId, ctx.frame, source);
    return true;
  }

  private doExtend(effect: Effect, ctx: InterpretContext) {
    const ownerId = this.resolveOwnerId(
      effect.onObject as string ?? effect.toObject as string,
      ctx, effect.onDeterminer ?? effect.toDeterminer,
    );
    const columnId = effect.object === 'INFLICTION'
      ? resolveInflictionColumnId(effect.adjective)
      : resolveStatusColumnId(effect.objectId);
    if (!columnId) return false;

    const active = this.controller.getActiveEvents(columnId, ownerId, ctx.frame);
    if (active.length === 0) return false;

    if (effect.until === DURATION_END && ctx.parentEventEndFrame != null) {
      for (const ev of active) {
        if (ev.eventStatus === EventStatusType.CONSUMED) continue;
        const d = ctx.parentEventEndFrame - ev.startFrame;
        if (d > eventDuration(ev)) {
          setEventDuration(ev, d);
          ev.eventStatus = EventStatusType.EXTENDED;
          ev.eventStatusOwnerId = ctx.sourceOwnerId;
          ev.eventStatusSkillName = ctx.sourceSkillName;
        }
      }
      return true;
    }

    const ev2 = effect.with?.duration?.value;
    const frames = typeof ev2 === 'number' ? Math.round(ev2 * 120) : 0;
    for (const ev of active) {
      if (ev.eventStatus === EventStatusType.CONSUMED) continue;
      setEventDuration(ev, eventDuration(ev) + frames);
      ev.eventStatus = EventStatusType.EXTENDED;
      ev.eventStatusOwnerId = ctx.sourceOwnerId;
      ev.eventStatusSkillName = ctx.sourceSkillName;
    }
    return true;
  }

  private doAll(effect: Effect, ctx: InterpretContext) {
    const maxIter = Math.min(
      effect.for ? resolveCardinality(effect.for.cardinality, ctx.potential ?? 0) : 1, 10,
    );
    const preds = effect.predicates ?? [];
    if (preds.length === 0) return true;

    for (let i = 0; i < maxIter; i++) {
      let ran = false;
      for (const pred of preds) {
        const condCtx: ConditionContext = { events: ctx.allEvents(), frame: ctx.frame, sourceOwnerId: ctx.sourceOwnerId, targetOwnerId: ctx.targetOwnerId };
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
    const condCtx: ConditionContext = { events: ctx.allEvents(), frame: ctx.frame, sourceOwnerId: ctx.sourceOwnerId, targetOwnerId: ctx.targetOwnerId };
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
    const isForced = effect.with?.isForced?.value === 1;

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
        id: `${columnId}-${source.ownerId}-${frame}`,
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
        id: `${PhysicalStatusType.CRUSH}-${source.ownerId}-${frame}`,
        event: {
          statusLevel: consumed,
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
   * - statusLevel is set for fragility lookup by EventsQueryService
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

    const statusLevel = Math.min(consumed, 4);
    const damageMultiplier = getPhysicalStatusBaseMultiplier(PhysicalStatusType.BREACH, consumed);
    const durationFrames = BREACH_DURATION[statusLevel] ?? BREACH_DURATION[1];

    this.controller.createStatus(
      PHYSICAL_STATUS_COLUMNS.BREACH, ENEMY_OWNER_ID, frame, durationFrames, source, {
        statusName: PhysicalStatusType.BREACH,
        stackingMode: 'RESET',
        id: `${PhysicalStatusType.BREACH}-${source.ownerId}-${frame}`,
        event: {
          statusLevel,
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

  // ── QueueFrame handlers (private) ──────────────────────────────────────

  private handleFrameEffect(entry: QueueFrame): QueueFrame[] {
    const ev = entry.derivedEvent!;
    const source = { ownerId: ev.sourceOwnerId ?? '', skillName: ev.sourceSkillName ?? '' };

    if (ev.ownerId === ENEMY_OWNER_ID && REACTION_COLUMN_IDS.has(ev.columnId)) {
      this.controller.createReaction(ev.columnId, ev.ownerId, entry.frame, eventDuration(ev), source, {
        statusLevel: ev.statusLevel, inflictionStacks: ev.inflictionStacks, forcedReaction: ev.forcedReaction || ev.isForced, id: ev.id,
      });
    } else {
      this.controller.createStatus(ev.columnId, ev.ownerId, entry.frame, eventDuration(ev), source, {
        statusName: ev.name, stackingMode: entry.stackingInteraction, id: ev.id,
        event: {
          ...(ev.susceptibility && { susceptibility: ev.susceptibility }),
          segments: ev.segments,
        },
      });
    }

    // Post-hook: LINK deferred CONSUME
    const newEntries: QueueFrame[] = [];
    if (ev.ownerId === COMMON_OWNER_ID && Object.values(TEAM_STATUS_COLUMN).includes(ev.columnId)) {
      const statusEnd = ev.startFrame + eventDuration(ev);
      const firstCast = this.baseEvents
        .filter(e => e.ownerId !== ENEMY_OWNER_ID && e.ownerId !== COMMON_OWNER_ID && CONSUMING_COLUMNS.has(e.columnId))
        .sort((a, b) => a.startFrame - b.startFrame)
        .find(e => e.startFrame > ev.startFrame && e.startFrame < statusEnd);
      if (firstCast) {
        newEntries.push({
          frame: firstCast.startFrame, priority: PRIORITY.CONSUME, type: 'CONSUME',
          statusName: ev.name, columnId: ev.columnId, ownerId: ev.ownerId,
          sourceOwnerId: firstCast.ownerId, sourceSkillName: firstCast.name,
          maxStacks: 0, durationFrames: 0, operatorSlotId: entry.operatorSlotId,
        });
      }
    }
    return newEntries;
  }

  private handleInflictionCreate(entry: QueueFrame): QueueFrame[] {
    this.controller.createInfliction(
      entry.columnId, entry.ownerId, entry.frame, entry.durationFrames,
      { ownerId: entry.sourceOwnerId, skillName: entry.sourceSkillName },
      { id: entry.id },
    );
    return [];
  }

  private handleConsume(entry: QueueFrame): QueueFrame[] {
    const source = { ownerId: entry.sourceOwnerId, skillName: entry.sourceSkillName };
    if (entry.consumeReaction) {
      this.handleConsumeReaction(entry, source);
    } else if (entry.cryoSusceptibility) {
      this.handleCryoConsumption(entry, source);
    } else if (entry.maxConsume != null) {
      this.controller.consumeInfliction(entry.columnId, entry.ownerId, entry.frame, entry.maxConsume, source);
    } else {
      this.controller.consumeStatus(entry.columnId, entry.ownerId, entry.frame, source);
    }
    return [];
  }

  private handleConsumeReaction(entry: QueueFrame, source: { ownerId: string; skillName: string }) {
    const cr = entry.consumeReaction!;
    this.controller.consumeReaction(cr.reactionColumnId, ENEMY_OWNER_ID, entry.frame, source);

    if (cr.applyStatus && cr.applyStatus.target === TargetType.ENEMY) {
      let resolvedSusc = cr.applyStatus.susceptibility
        ? resolveSusceptibility(cr.applyStatus.susceptibility, cr.sourceColumnId, entry.sourceOwnerId, this.loadoutProperties)
        : undefined;
      if (resolvedSusc && entry.sourceSkillName === CombatSkillsType.DOLLY_RUSH) {
        const pot = this.loadoutProperties?.[entry.sourceOwnerId]?.operator.potential ?? 0;
        if (pot >= 1) {
          resolvedSusc = { ...resolvedSusc };
          for (const el of Object.keys(resolvedSusc) as ElementType[]) resolvedSusc[el] = (resolvedSusc[el] ?? 0) + 0.08;
        }
      }
      this.controller.createStatus(cr.applyStatus.status, ENEMY_OWNER_ID, entry.frame, cr.applyStatus.durationFrames,
        { ownerId: entry.sourceOwnerId, skillName: entry.sourceSkillName }, {
          statusName: cr.applyStatus.eventName ?? cr.applyStatus.status,
          id: `consume-reaction-susc-${entry.frame}-${entry.sourceOwnerId}`,
          event: resolvedSusc ? { susceptibility: resolvedSusc } : undefined,
        },
      );
    }
  }

  private handleCryoConsumption(entry: QueueFrame, source: { ownerId: string; skillName: string }) {
    const consumed = this.controller.consumeInfliction(INFLICTION_COLUMNS.CRYO, ENEMY_OWNER_ID, entry.frame, 99, source);
    if (consumed > 0) {
      this.controller.createStatus(StatusType.SUSCEPTIBILITY, ENEMY_OWNER_ID, entry.frame, 1800, source, {
        statusName: StatusType.SUSCEPTIBILITY,
        id: `hypothermia-${entry.sourceSkillName}-${entry.frame}`,
        event: { susceptibility: { [ElementType.CRYO]: consumed * entry.cryoSusceptibility!.perStack } },
      });
    }
  }

  private handleAbsorptionCheck(entry: QueueFrame): QueueFrame[] {
    const source = { ownerId: entry.sourceOwnerId, skillName: entry.sourceSkillName };

    if (entry.absorptionMarker) {
      const m = entry.absorptionMarker;
      let absorbed = 0;
      for (let i = 0; i < m.maxAbsorb; i++) {
        if (!this.controller.canConsumeInfliction(m.inflictionColumnId, ENEMY_OWNER_ID, entry.frame)) break;
        this.controller.consumeInfliction(m.inflictionColumnId, ENEMY_OWNER_ID, entry.frame, 1, source);
        this.controller.createStatus(m.exchangeColumnId, entry.ownerId, entry.frame, EXCHANGE_EVENT_DURATION, source, {
          statusName: m.exchangeStatus, id: `${m.eventId}-absorb-${m.segmentIndex}-${m.frameIndex}-${i}`,
        });
        absorbed++;
      }
      if (absorbed > 0) this.checkThreshold(m.exchangeColumnId, entry.ownerId, entry.frame);
    } else {
      for (const actx of this.absorptionContexts) {
        let absorbed = 0;
        const maxAbsorb = actx.exchangeMaxStacks ?? Infinity;
        const slots = maxAbsorb - this.controller.activeCount(actx.exchangeColumnId, actx.exchangeOwnerId, entry.frame);
        if (slots <= 0) continue;
        for (let i = 0; i < slots; i++) {
          if (!this.controller.canConsumeInfliction(actx.inflictionColumnId, ENEMY_OWNER_ID, entry.frame)) break;
          this.controller.consumeInfliction(actx.inflictionColumnId, ENEMY_OWNER_ID, entry.frame, 1, source);
          this.controller.createStatus(actx.exchangeColumnId, actx.exchangeOwnerId, entry.frame, actx.exchangeDurationFrames, source, {
            statusName: actx.exchangeStatusName, maxStacks: actx.exchangeMaxStacks,
          });
          absorbed++;
        }
        if (absorbed > 0) this.checkThreshold(actx.exchangeColumnId, actx.exchangeOwnerId, entry.frame);
      }
    }
    return [];
  }

  private handleExchangeCreate(entry: QueueFrame): QueueFrame[] {
    if (!this.controller.canApplyStatus(entry.columnId, entry.ownerId, entry.frame, entry.maxStacks)) return [];
    this.controller.createStatus(entry.columnId, entry.ownerId, entry.frame, entry.durationFrames,
      { ownerId: entry.sourceOwnerId, skillName: entry.sourceSkillName },
      { statusName: entry.statusName, maxStacks: entry.maxStacks },
    );
    this.checkThreshold(entry.columnId, entry.ownerId, entry.frame);
    return [];
  }

  private handleEngineTrigger(entry: QueueFrame): QueueFrame[] {
    const trigger = entry.engineTrigger;
    if (!trigger) return [];
    evaluateEngineTrigger(
      trigger, [...this.baseEvents, ...this.controller.output],
      (col, owner, frame) => this.controller.activeCount(col, owner, frame),
      (ev) => {
        const { id, name, ownerId, columnId, startFrame,
          segments, sourceOwnerId, sourceSkillName, ...extraProps } = ev;
        this.controller.createStatus(columnId, ownerId, startFrame, eventDuration(ev),
          { ownerId: sourceOwnerId ?? '', skillName: sourceSkillName ?? '' },
          { statusName: name, id, event: { segments, ...extraProps } },
        );
      },
    );
    return [];
  }

  private handleComboResolve(entry: QueueFrame): QueueFrame[] {
    const combo = entry.comboResolve?.comboEvent;
    if (!combo || !this.slotWirings) return [];

    const wiring = this.slotWirings.find(w => w.slotId === combo.ownerId);
    if (!wiring) return [];
    const allEvents = [...this.baseEvents, ...this.controller.output];

    // Use findClauseTriggerMatches to find the trigger that opened this combo's window
    const clause = getComboTriggerClause(wiring.operatorId);
    if (!clause?.length) return [];
    const info = getComboTriggerInfo(wiring.operatorId);
    const windowFrames = info?.windowFrames ?? 720;

    const matches = findClauseTriggerMatches(clause, allEvents, wiring.slotId);
    // Find the match whose window contains the combo's startFrame
    let triggerCol: string | undefined;
    for (const match of matches) {
      if (match.originOwnerId === combo.ownerId) continue; // skip self-trigger
      if (combo.startFrame >= match.frame && combo.startFrame < match.frame + windowFrames) {
        triggerCol = match.sourceColumnId;
        break;
      }
    }
    if (!triggerCol) return [];

    this.controller.setComboTriggerColumnId(combo.id, triggerCol);

    // Only generate source-mirrored inflictions for frames that explicitly
    // declare APPLY SOURCE INFLICTION (duplicatesSourceInfliction flag).
    const isArts = INFLICTION_COLUMN_IDS.has(triggerCol);
    const fStops = foreignStopsFor(combo, this.controller.getStops());
    const newEntries: QueueFrame[] = [];
    let cumOffset = 0;
    for (let si = 0; si < combo.segments.length; si++) {
      const seg = combo.segments[si];
      if (seg.frames) {
        for (let fi = 0; fi < seg.frames.length; fi++) {
          const frame = seg.frames[fi];
          if (!frame.duplicatesSourceInfliction) continue;
          const absF = absoluteFrame(combo.startFrame, cumOffset, frame.offsetFrame, fStops);
          newEntries.push({
            frame: absF, priority: PRIORITY.INFLICTION_CREATE, type: 'INFLICTION_CREATE',
            id: `${combo.id}-combo-${isArts ? 'inflict' : 'phys'}-${si}-${fi}`,
            statusName: triggerCol, columnId: triggerCol, ownerId: ENEMY_OWNER_ID,
            sourceOwnerId: combo.ownerId, sourceSkillName: combo.name,
            maxStacks: MAX_INFLICTION_STACKS, durationFrames: isArts ? INFLICTION_DURATION : PHYSICAL_INFLICTION_DURATION,
            operatorSlotId: combo.ownerId,
          });
        }
      }
      cumOffset += seg.properties.duration;
    }
    return newEntries;
  }

  private checkThreshold(columnId: string, ownerId: string, frame: number) {
    const ctx = this.exchangeContexts.find(c => c.columnId === columnId && c.ownerId === ownerId);
    if (!ctx) return;
    if (this.controller.activeCount(columnId, ownerId, frame) !== ctx.maxStacks) return;
    const thresholdEvents = evaluateThresholdForExchange(ctx, frame, this.thresholdDerived, this.slotOperatorMap);
    for (const ev of thresholdEvents) {
      const { id, name, ownerId: evOwner, columnId: evCol, startFrame,
        segments, sourceOwnerId, sourceSkillName, ...extraProps } = ev;
      this.controller.createStatus(evCol, evOwner, startFrame, eventDuration(ev),
        { ownerId: sourceOwnerId ?? '', skillName: sourceSkillName ?? '' },
        { statusName: name, id, event: { segments, ...extraProps } },
      );
      this.thresholdDerived.push(ev);
    }
  }
}
