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
  PHYSICAL_INFLICTION_COLUMNS, PHYSICAL_INFLICTION_DURATION, PHYSICAL_STATUS_COLUMNS, PHYSICAL_STATUS_COLUMN_IDS,
  REACTION_COLUMNS, REACTION_COLUMN_IDS, REACTION_DURATION,
  FORCED_REACTION_COLUMN, FORCED_REACTION_DURATION,
  REACTION_STATUS_TO_COLUMN, SKILL_NOUN_TO_COLUMN,
  SKILL_COLUMNS, SHATTER_DURATION,
} from '../../model/channels';
import { getTeamStatusColumnId } from '../gameDataStore';
import { FPS, TOTAL_FRAMES } from '../../utils/timeline';
import { getAllOperatorStatuses, getOperatorStatuses } from '../gameDataStore';
import { getAllWeaponStatuses } from '../../model/game-data/weaponStatusesStore';
import { getAllGearStatuses } from '../../model/game-data/gearStatusesStore';
import { STATUS_LABELS } from '../../consts/timelineColumnLabels';
import { COMMON_OWNER_ID } from '../slot/commonSlotController';
import { evaluateConditions } from './conditionEvaluator';
import type { ConditionContext } from './conditionEvaluator';
import { resolveSusceptibility } from './processInfliction';
import { getPhysicalStatusBaseMultiplier, getShatterBaseMultiplier } from '../../model/calculation/damageFormulas';
import type { StatusLevel } from '../../consts/types';
import type { SlotTriggerWiring } from './eventQueueTypes';
import { findClauseTriggerMatches, statusNameToColumnId } from './triggerMatch';
import { getComboTriggerClause, getComboTriggerInfo } from '../gameDataStore';
import { PRIORITY } from './eventQueueTypes';
import { genEventUid } from './inputEventController';
import { resolveClauseEffects, getDurationFrames } from './statusTriggerCollector';
import type { EngineTriggerContext, DeriveContext, StatusEventDef } from './statusTriggerCollector';
import type { TriggerIndex } from './triggerIndex';
import { DerivedEventController, getStatusStackLimit } from './derivedEventController';
import type { QueueFrame } from './eventQueueTypes';
import type { LoadoutProperties } from '../../view/InformationPane';

// ── Clause filtering ──────────────────────────────────────────────────────

import type { FrameClausePredicate } from '../../model/event-frames/skillEventFrame';

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
  const isFirstMatch = clauseType === 'FIRST_MATCH';
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

// ── Column resolution (module-private helpers) ───────────────────────────


function resolveInflictionColumnId(objectQualifier?: AdjectiveType | AdjectiveType[]) {
  const adj = Array.isArray(objectQualifier) ? objectQualifier[0] : objectQualifier;
  return adj ? ELEMENT_TO_INFLICTION_COLUMN[adj] : undefined;
}

function resolveReactionColumnId(objectQualifier?: AdjectiveType | AdjectiveType[]) {
  const adj = Array.isArray(objectQualifier) ? objectQualifier[0] : objectQualifier;
  return adj ? REACTION_STATUS_TO_COLUMN[adj] : undefined;
}


const PHYSICAL_STATUS_VALUES = new Set<string>(Object.values(PhysicalStatusType));

function resolvePhysicalStatusColumnId(objectQualifier?: AdjectiveType | AdjectiveType[]) {
  const adj = Array.isArray(objectQualifier) ? objectQualifier[0] : objectQualifier;
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

// ── Status config cache ──────────────────────────────────────────────────

interface StatusConfig {
  duration: number;
  stackingMode?: string;
  maxStacks?: number;
  cooldownFrames?: number;
  segments?: import('../../consts/viewTypes').EventSegmentData[];
  susceptibility?: Record<string, number>;
}

let _statusConfigCache: Map<string, StatusConfig> | null = null;

function getStatusConfig(statusId?: string): StatusConfig | undefined {
  if (!statusId) return undefined;
  if (!_statusConfigCache) {
    _statusConfigCache = new Map();
    const allStatuses = [...getAllOperatorStatuses(), ...getAllWeaponStatuses(), ...getAllGearStatuses()];
    for (const s of allStatuses) {
      const dur = s.durationSeconds;
      const durationFrames = dur < 0 || dur === 0 ? TOTAL_FRAMES : Math.round(dur * FPS);
      const stackLimit = s.stacks?.limit;
      const maxStacks = stackLimit
        ? (typeof stackLimit === 'number' ? stackLimit
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          : getSimpleValue(stackLimit as any) ?? undefined)
        : undefined;
      const cdSecs = (s as unknown as { cooldownSeconds?: number }).cooldownSeconds;
      const cfg: StatusConfig = {
        duration: durationFrames,
        stackingMode: s.stacks?.interactionType,
        maxStacks: typeof maxStacks === 'number' ? maxStacks : undefined,
        cooldownFrames: cdSecs && cdSecs > 0 ? Math.round(cdSecs * FPS) : undefined,
      };
      _statusConfigCache.set(s.id, cfg);
    }
  }
  return _statusConfigCache.get(statusId);
}

// ── Status def cache (for clause effect resolution) ─────────────────────

let _statusDefCache: Map<string, StatusEventDef> | null = null;

function getStatusDef(statusId?: string): StatusEventDef | undefined {
  if (!statusId) return undefined;
  if (!_statusDefCache) {
    _statusDefCache = new Map();
    const allDefs = [...getAllOperatorStatuses(), ...getAllWeaponStatuses(), ...getAllGearStatuses()];
    for (const s of allDefs) {
      _statusDefCache.set(s.id, s.serialize() as unknown as StatusEventDef);
    }
  }
  return _statusDefCache.get(statusId);
}

// ── InterpretContext ─────────────────────────────────────────────────────

/** Context for interpreting DSL effects. */
export interface InterpretContext {
  frame: number;
  /** Operator ID for event attribution (e.g. "POGRANICHNIK"). */
  sourceOwnerId: string;
  /** Slot ID for timeline queries and target resolution (e.g. "slot-pogranichnik"). Falls back to sourceOwnerId if not set. */
  sourceSlotId?: string;
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

  /** Resolve slot ID → operator ID. Returns the operator ID if mapped, or the input unchanged. */
  private resolveOperatorId(slotId: string): string {
    return this.slotOperatorMap?.[slotId] ?? slotId;
  }

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
    const slotId = ctx.sourceSlotId ?? ctx.sourceOwnerId;
    if (target === NounType.OPERATOR) {
      switch (determiner ?? DeterminerType.THIS) {
        case DeterminerType.THIS: return slotId;
        case DeterminerType.ALL: return COMMON_OWNER_ID;
        case DeterminerType.ALL_OTHER: return COMMON_OWNER_ID;
        case DeterminerType.OTHER: return ctx.targetOwnerId ?? slotId;
        case DeterminerType.ANY: return ctx.targetOwnerId ?? slotId;
        case DeterminerType.CONTROLLED:
          return this.getControlledSlotAtFrame?.(ctx.frame) ?? slotId;
        default: return slotId;
      }
    }
    if (target === NounType.ENEMY) return ENEMY_OWNER_ID;
    if (target === NounType.TEAM) return COMMON_OWNER_ID;
    return slotId;
  }

  private canDo(effect: Effect, ctx: InterpretContext) {
    const ownerId = this.resolveOwnerId(
      effect.to as string ?? effect.fromObject as string,
      ctx, effect.toDeterminer ?? effect.fromDeterminer,
    );

    switch (effect.verb) {
      case VerbType.APPLY:
        if (effect.object === 'INFLICTION') {
          const col = resolveInflictionColumnId(effect.objectQualifier);
          return col ? this.controller.canApplyInfliction(col, ownerId, ctx.frame) : false;
        }
        if (effect.object === 'STATUS') {
          const col = statusNameToColumnId(effect.objectId ?? '');
          const statusOwner = getTeamStatusColumnId(effect.objectId ?? '') ? COMMON_OWNER_ID : ownerId;
          const configLimit = effect.objectId ? getStatusStackLimit(effect.objectId) : undefined;
          return this.controller.canApplyStatus(col, statusOwner, ctx.frame, configLimit);
        }
        if (effect.object === 'REACTION') {
          const col = resolveReactionColumnId(effect.objectQualifier);
          return col ? this.controller.canApplyReaction(col, ownerId, ctx.frame) : false;
        }
        return true;
      case VerbType.CONSUME:
        if (effect.object === 'INFLICTION') {
          const col = resolveInflictionColumnId(effect.objectQualifier);
          return col ? this.controller.canConsumeInfliction(col, ownerId, ctx.frame) : false;
        }
        if (effect.object === 'REACTION') {
          const col = resolveReactionColumnId(effect.objectQualifier);
          return col ? this.controller.canConsumeReaction(col, ownerId, ctx.frame) : false;
        }
        if (effect.object === 'STATUS') {
          const col = statusNameToColumnId(effect.objectId ?? '');
          const statusOwner = getTeamStatusColumnId(effect.objectId ?? '') ? COMMON_OWNER_ID : ownerId;
          return this.controller.canConsumeStatus(col, statusOwner, ctx.frame);
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
      const columnId = resolveInflictionColumnId(effect.objectQualifier);
      if (!columnId) return false;
      const dv = this.resolveWith(effect.with?.duration, ctx);
      this.controller.createInfliction(columnId, ownerId, ctx.frame, typeof dv === 'number' ? Math.round(dv * FPS) : INFLICTION_DURATION, source);
      return true;
    }
    if (effect.object === 'STATUS') {
      // Physical status (APPLY LIFT STATUS TO ENEMY) → delegate to dedicated handler
      if (effect.objectId === 'PHYSICAL') return this.applyPhysicalStatus(effect, ctx);
      const isTeamStatus = !!getTeamStatusColumnId(effect.objectId ?? '');
      const statusOwnerId = isTeamStatus ? COMMON_OWNER_ID : ownerId;
      // Team/operator statuses → resolve column via map; enemy statuses → use raw objectId as column
      const columnId = isTeamStatus ? getTeamStatusColumnId(effect.objectId ?? '')!
        : statusOwnerId === ENEMY_OWNER_ID ? (effect.objectId ?? '')
        : statusNameToColumnId(effect.objectId ?? '');
      const cfg = getStatusConfig(effect.objectId);
      const def = getStatusDef(effect.objectId);
      const dv = this.resolveWith(effect.with?.duration, ctx);
      const isTeamTarget = effect.to === NounType.TEAM || getTeamStatusColumnId(effect.objectId ?? '');
      const remainingDuration = ctx.parentEventEndFrame != null
        ? Math.max(0, ctx.parentEventEndFrame - ctx.frame)
        : undefined;
      const duration = typeof dv === 'number' ? Math.round(dv * FPS)
        : (isTeamTarget && remainingDuration != null ? remainingDuration
          : (cfg?.duration ?? TOTAL_FRAMES));

      // Resolve clause effects (susceptibility, statusValue) from the status def
      const eventProps: Partial<TimelineEvent> = {};
      if (def) {
        const slotId = ctx.sourceSlotId ?? ctx.sourceOwnerId;
        const operatorSlotMap: Record<string, string> = {};
        if (this.slotOperatorMap) {
          for (const [s, o] of Object.entries(this.slotOperatorMap)) operatorSlotMap[o] = s;
        }
        const deriveCtx: DeriveContext = {
          events: [...ctx.allEvents()],
          operatorId: ctx.sourceOwnerId,
          operatorSlotId: slotId,
          potential: ctx.potential ?? 0,
          operatorSlotMap,
          loadoutProperties: this.loadoutProperties?.[slotId],
        };
        // Build a temp event to resolve clause effects onto
        const tempEv = { startFrame: ctx.frame } as TimelineEvent;
        resolveClauseEffects(tempEv, def, deriveCtx);
        if (tempEv.susceptibility) eventProps.susceptibility = tempEv.susceptibility;
        if (tempEv.statusValue != null) eventProps.statusValue = tempEv.statusValue;
        // Copy segments from def if present (only when no inline duration override)
        if (def.segments && def.segments.length > 0 && typeof dv !== 'number') {
          eventProps.segments = def.segments.map(seg => ({
            properties: {
              duration: seg.properties?.duration
                ? getDurationFrames(seg.properties.duration)
                : duration,
              name: seg.properties?.name,
            },
          })) as import('../../consts/viewTypes').EventSegmentData[];
        }
      }

      // Enforce cooldown
      if (cfg?.cooldownFrames) {
        const allEvents = ctx.allEvents();
        const lastProc = allEvents
          .filter(ev => ev.columnId === columnId && ev.ownerId === statusOwnerId)
          .reduce((latest, ev) => Math.max(latest, ev.startFrame), -Infinity);
        if (lastProc >= 0 && ctx.frame < lastProc + cfg.cooldownFrames) return true;
      }

      this.controller.createStatus(columnId, statusOwnerId, ctx.frame, duration, source, {
        statusName: effect.objectId,
        ...(cfg?.stackingMode ? { stackingMode: cfg.stackingMode } : {}),
        ...(cfg?.maxStacks != null ? { maxStacks: cfg.maxStacks } : {}),
        ...(Object.keys(eventProps).length > 0 ? { event: eventProps } : {}),
      });
      return true;
    }
    if (effect.object === 'REACTION') {
      const columnId = resolveReactionColumnId(effect.objectQualifier)
        ?? FORCED_REACTION_COLUMN[effect.objectId ?? ''];
      if (!columnId) return false;
      const isForced = this.resolveWith(effect.with?.isForced, ctx) === 1;
      const dv = this.resolveWith(effect.with?.duration, ctx);
      const sl = this.resolveWith(effect.with?.stacks, ctx);
      const defaultDuration = isForced ? (FORCED_REACTION_DURATION[columnId] ?? REACTION_DURATION) : REACTION_DURATION;
      this.controller.createReaction(columnId, ownerId, ctx.frame, typeof dv === 'number' ? Math.round(dv * FPS) : defaultDuration, source, {
        stacks: typeof sl === 'number' ? sl : undefined,
        ...(isForced && { forcedReaction: true }),
      });
      return true;
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
    const from = effect.fromObject as string ?? (effect as unknown as { from?: string }).from ?? effect.fromDeterminer as string ?? effect.to as string;
    const ownerId = this.resolveOwnerId(
      from, ctx, effect.fromDeterminer ?? effect.toDeterminer,
    );
    const source = { ownerId: ctx.sourceOwnerId, skillName: ctx.sourceSkillName };
    const rawStacks = effect.with?.stacks as ValueNode | typeof THRESHOLD_MAX | number | undefined;
    if (rawStacks == null) console.warn(
      `[EventInterpretor] CONSUME ${effect.object} ${effect.objectId ?? effect.objectQualifier ?? '?'}: missing with.stacks`,
      `\n  source: ${ctx.sourceSkillName} (owner: ${ctx.sourceOwnerId}, frame: ${ctx.frame})`,
      `\n  effect:`, JSON.stringify(effect, null, 2),
    );
    const isMax = rawStacks === THRESHOLD_MAX;
    const sv = isMax ? undefined : this.resolveWith(rawStacks, ctx);
    const count = isMax ? Infinity : (typeof sv === 'number' ? sv : 1);

    if (effect.object === NounType.INFLICTION) {
      const col = resolveInflictionColumnId(effect.objectQualifier);
      if (!col) return false;
      return this.controller.consumeInfliction(col, ownerId, ctx.frame, count, source) > 0;
    }
    if (effect.object === NounType.REACTION || effect.object === NounType.ARTS_REACTION) {
      if (effect.objectId === 'ARTS' || effect.object === NounType.ARTS_REACTION) {
        // Consume any active arts reaction on the target
        REACTION_COLUMN_IDS.forEach(col => {
          this.controller.consumeReaction(col, ownerId, ctx.frame, source);
        });
        return true;
      }
      const col = resolveReactionColumnId(effect.objectQualifier);
      if (!col) return false;
      this.controller.consumeReaction(col, ownerId, ctx.frame, source);
      return true;
    }
    if (effect.object === NounType.STATUS) {
      const statusOwner = getTeamStatusColumnId(effect.objectId ?? '') ? COMMON_OWNER_ID : ownerId;
      this.controller.consumeStatus(statusNameToColumnId(effect.objectId ?? ''), statusOwner, ctx.frame, source);
      return true;
    }
    return true;
  }

  /**
   * Resolve the trigger object ID from an Effect for reactive trigger dispatch.
   * Returns the column/status ID that checkReactiveTriggers should match against.
   */
  private reactiveTriggersForEffect(effect: Effect, absFrame: number, eventOwnerId: string, eventName: string): QueueFrame[] {
    const verb = effect.verb === VerbType.APPLY ? 'APPLY'
      : effect.verb === VerbType.CONSUME ? 'CONSUME' : null;
    if (!verb) return [];

    let objectId: string | undefined;
    switch (effect.object) {
      case NounType.INFLICTION:
        objectId = resolveInflictionColumnId(effect.objectQualifier);
        break;
      case NounType.STATUS:
        if (effect.objectId === 'PHYSICAL') {
          objectId = resolvePhysicalStatusColumnId(effect.objectQualifier);
        } else {
          objectId = statusNameToColumnId(effect.objectId ?? '');
        }
        break;
      case NounType.REACTION: {
        const qualifiers = Array.isArray(effect.objectQualifier) ? effect.objectQualifier : effect.objectQualifier ? [effect.objectQualifier] : [];
        const reactionQualifier = qualifiers.find(q => q !== AdjectiveType.FORCED) as AdjectiveType | undefined;
        const col = resolveReactionColumnId(reactionQualifier ?? effect.objectQualifier);
        objectId = col ?? FORCED_REACTION_COLUMN[effect.objectId ?? ''];
        break;
      }
      default:
        return [];
    }
    if (!objectId) return [];
    return this.checkReactiveTriggers(verb, objectId, absFrame, eventOwnerId, eventName);
  }

  private doReset(effect: Effect, ctx: InterpretContext) {
    if (effect.object === ObjectType.COOLDOWN) {
      const targetColumnId = SKILL_NOUN_TO_COLUMN[effect.objectId ?? ''];
      if (!targetColumnId) return true;

      const slotId = ctx.sourceSlotId ?? ctx.sourceOwnerId;
      for (const ev of this.baseEvents) {
        if (ev.ownerId !== slotId) continue;
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
    // RESET STACKS handled by effectExecutor
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
    // Unwrap { value: ValueNode, unit: string } duration wrapper from JSON
    const inner = (node as { value?: unknown; unit?: string });
    if (inner.unit && inner.value != null && typeof inner.value !== 'number') {
      return resolveValueNode(inner.value as ValueNode, this.buildValueContext(ctx));
    }
    return resolveValueNode(node, this.buildValueContext(ctx));
  }

  private doReduce(effect: Effect, ctx: InterpretContext) {
    if (effect.object !== ObjectType.COOLDOWN) return true;
    if (!effect.by) return true;

    // Resolve which skill column's cooldown to reduce
    const targetColumnId = SKILL_NOUN_TO_COLUMN[effect.nounQualifier ?? ''];
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
   * APPLY PHYSICAL STATUS (objectId: PHYSICAL) — hardcoded Lift/Breach/etc. logic.
   *
   * Lift mechanic:
   * - Always adds 1 Vulnerable stack.
   * - If enemy already has Vulnerable OR isForced: also creates the Lift status
   *   (1s duration, RESET stacking, 1 segment with damage + stagger at frame 0).
   * - Damage: 120% ATK (physical).
   * - Stagger: 10 × (1 + ArtsIntensity / 200).
   */
  private applyPhysicalStatus(effect: Effect, ctx: InterpretContext): boolean {
    const columnId = resolvePhysicalStatusColumnId(effect.objectQualifier);
    if (!columnId) return false;

    const source = { ownerId: ctx.sourceOwnerId, skillName: ctx.sourceSkillName };
    const isForced = this.resolveWith(effect.with?.isForced, ctx) === 1;

    let result = false;
    if (columnId === PHYSICAL_STATUS_COLUMNS.LIFT
      || columnId === PHYSICAL_STATUS_COLUMNS.KNOCK_DOWN) {
      result = this.applyLiftOrKnockDown(columnId, ctx.frame, source, isForced);
    } else if (columnId === PHYSICAL_STATUS_COLUMNS.CRUSH) {
      result = this.applyCrush(ctx.frame, source);
    } else if (columnId === PHYSICAL_STATUS_COLUMNS.BREACH) {
      result = this.applyBreach(ctx.frame, source);
    }

    // Any physical status application consumes active Solidification → Shatter
    if (result) {
      this.tryConsumeSolidification(ctx.frame, source);
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

  /**
   * If the enemy has active Solidification, consume it and create a Shatter
   * reaction. Shatter uses the trigger operator's stats (source), not the
   * solidification applicator's.
   */
  private tryConsumeSolidification(
    frame: number,
    source: { ownerId: string; skillName: string },
  ): void {
    const active = this.controller.getActiveEvents(
      REACTION_COLUMNS.SOLIDIFICATION, ENEMY_OWNER_ID, frame,
    );
    if (active.length === 0) return;

    const solidEvent = active[active.length - 1];
    const stacks = Math.min(solidEvent.stacks ?? 1, 4) as StatusLevel;

    // Consume the solidification
    this.controller.consumeReaction(
      REACTION_COLUMNS.SOLIDIFICATION, ENEMY_OWNER_ID, frame, source,
    );

    // Create Shatter reaction with physical damage frame at offset 0
    const shatterMultiplier = getShatterBaseMultiplier(stacks);
    this.controller.createReaction(
      REACTION_COLUMNS.SHATTER, ENEMY_OWNER_ID, frame, SHATTER_DURATION, source, {
        stacks,
      },
    );

    // Attach segment with damage frame (createReaction builds a default segment,
    // but shatter needs a physical damage frame — rebuild segments here).
    const shatterEvents = this.controller.getActiveEvents(
      REACTION_COLUMNS.SHATTER, ENEMY_OWNER_ID, frame,
    );
    if (shatterEvents.length > 0) {
      const shatter = shatterEvents[shatterEvents.length - 1];
      const dur = eventDuration(shatter);
      const roman = ['I', 'II', 'III', 'IV'][stacks - 1] ?? `${stacks}`;
      shatter.segments = [{
        properties: { duration: dur, name: `Shatter ${roman}` },
        frames: [{
          offsetFrame: 0,
          damageElement: ElementType.PHYSICAL,
          damageMultiplier: shatterMultiplier,
        }],
      }];
    }
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
    const source = { ownerId: this.resolveOperatorId(event.ownerId), skillName: event.name };
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
      newEntries.push(...this.checkReactiveTriggers('PERFORM', event.columnId, absFrame, event.ownerId, event.name, event.enhancementType));

      return newEntries; // event-start entry has no frame marker to process
    }

    if (!frame) return newEntries; // safety check

    // ── 2. Combo trigger source duplication (runtime special case) ──────
    if (frame.duplicateTriggerSource && event.comboTriggerColumnId) {
      const triggerCol = event.comboTriggerColumnId;
      if (INFLICTION_COLUMN_IDS.has(triggerCol)) {
        this.controller.createInfliction(
          triggerCol, ENEMY_OWNER_ID, absFrame, INFLICTION_DURATION,
          source, { uid: `${event.uid}-combo-inflict-${si}-${fi}` },
        );
        newEntries.push(...this.checkReactiveTriggers('APPLY', triggerCol, absFrame, event.ownerId, event.name));
      } else if (PHYSICAL_STATUS_COLUMN_IDS.has(triggerCol)) {
        const physEffect = {
          verb: VerbType.APPLY,
          object: NounType.STATUS,
          objectId: 'PHYSICAL',
          objectQualifier: triggerCol,
          to: NounType.ENEMY,
        } as Effect;
        this.applyPhysicalStatus(physEffect, { frame: absFrame, sourceOwnerId: this.resolveOperatorId(event.ownerId), sourceSlotId: event.ownerId, sourceSkillName: event.name, allEvents: () => [...this.baseEvents, ...this.controller.output] });
        newEntries.push(...this.checkReactiveTriggers('APPLY', triggerCol, absFrame, event.ownerId, event.name));
      }
    }

    // ── 3. Clause loop — all effects through interpret() ─────────────
    if (frame.clauses) {
      const interpretCtx: InterpretContext = {
        frame: absFrame,
        sourceOwnerId: this.resolveOperatorId(event.ownerId),
        sourceSlotId: event.ownerId,
        sourceSkillName: event.name,
        allEvents: () => [...this.baseEvents, ...this.controller.output],
        potential: pot,
        parentEventEndFrame: event.startFrame + eventDuration(event),
      };
      const condCtx: ConditionContext = {
        events: [...this.baseEvents, ...this.controller.output],
        frame: absFrame,
        sourceOwnerId: event.ownerId,
        potential: pot,
      };
      const accepted = filterClauses(frame.clauses, frame.clauseType, pred =>
        evaluateConditions(pred.conditions as unknown as import('../../dsl/semantics').Interaction[], condCtx),
      );
      for (const pred of accepted) {
        for (const ef of pred.effects) {
          if (ef.dslEffect) {
            this.interpret(ef.dslEffect, interpretCtx);
            newEntries.push(...this.reactiveTriggersForEffect(ef.dslEffect, absFrame, event.ownerId, event.name));
          }
        }
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
        sourceOwnerId: this.resolveOperatorId(event.ownerId),
        sourceSkillName: event.name,
        maxStacks: 0,
        durationFrames: 0,
        operatorSlotId: entry.operatorSlotId,
        engineTrigger: { frame: absFrame, sourceOwnerId: this.resolveOperatorId(event.ownerId), triggerSlotId: event.ownerId, sourceSkillName: event.name, ctx: triggerCtx, isEquip: entry.isEquip },
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
    enhancementType?: string,
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
          // Lifecycle clauses implicitly create the status event — prepend APPLY STATUS
          triggerEffects: [
            { verb: VerbType.APPLY, object: ObjectType.STATUS, objectId: lifecycle.def.properties.id,
              to: lifecycle.def.properties.target ?? NounType.OPERATOR,
              toDeterminer: lifecycle.def.properties.targetDeterminer ?? DeterminerType.THIS },
            ...(lifecycle.effects ?? []),
          ],
        };
        results.push({
          frame,
          priority: PRIORITY.ENGINE_TRIGGER,
          type: 'ENGINE_TRIGGER',
          statusName: lifecycle.def.properties.id,
          columnId: '',
          ownerId: slotId,
          sourceOwnerId: this.resolveOperatorId(slotId),
          sourceSkillName,
          maxStacks: 0,
          durationFrames: 0,
          operatorSlotId: slotId,
          engineTrigger: { frame, sourceOwnerId: this.resolveOperatorId(slotId), triggerSlotId: slotId, sourceSkillName, ctx: triggerCtx, isEquip: false },
        });
      }
    }

    // ── onTriggerClause triggers matching this event's column ──────────────
    // objectId is already a resolved column ID or status name — use directly for matching
    for (const entry of this.triggerIndex.matchEvent(objectId)) {
      // Filter by nounQualifier (e.g. EMPOWERED) — only match if the event's enhancement type matches
      const qualifier = entry.primaryCondition.objectQualifier;
      if (qualifier && qualifier !== enhancementType) continue;

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
        sourceOwnerId: this.resolveOperatorId(slotId),
        sourceSkillName,
        maxStacks: 0,
        durationFrames: 0,
        operatorSlotId: entry.operatorSlotId,
        engineTrigger: { frame, sourceOwnerId: this.resolveOperatorId(slotId), triggerSlotId: slotId, sourceSkillName, ctx: triggerCtx, isEquip: entry.isEquip },
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



  private static readonly MAX_CASCADE_DEPTH = 10;

  /** Convert a TriggerEffect to the DSL Effect type for interpret(). */
  private triggerEffectToEffect(te: import('./triggerMatch').TriggerEffect): Effect {
    const isCompound = (te.verb === 'ALL' || te.verb === 'ANY') && te.effects && te.effects.length > 0;
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

    // Potential gate: potential-level triggers only fire at the required potential
    const minPot = ctx.def.properties.minPotential;
    if (minPot != null && ctx.potential < minPot) return [];

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
      sourceOwnerId: ctx.operatorId,
      sourceSlotId: ctx.operatorSlotId,
      sourceSkillName: trigger.sourceSkillName,
      allEvents: () => [...this.baseEvents, ...this.controller.output],
      potential: ctx.potential,
    };

    const cascadeFrames: QueueFrame[] = [];
    for (const te of triggerEffects) {
      const effect = this.triggerEffectToEffect(te);
      const applied = this.interpret(effect, interpretCtx);
      if (applied && te.verb === 'APPLY' && (te.objectId ?? te.object)) {
        const triggerObjectId = te.objectId ?? te.object!;
        const newFrames = this.checkReactiveTriggers('APPLY', triggerObjectId, entry.frame, ctx.operatorSlotId, trigger.sourceSkillName);
        for (const f of newFrames) f.cascadeDepth = depth + 1;
        cascadeFrames.push(...newFrames);
      }
    }
    return cascadeFrames;
  }


}
