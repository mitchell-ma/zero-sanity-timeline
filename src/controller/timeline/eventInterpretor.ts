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
import { TimelineEvent } from '../../consts/viewTypes';
import { CombatSkillsType, ElementType, EventStatusType, StatusType, TargetType } from '../../consts/enums';
import { ENEMY_OWNER_ID, INFLICTION_COLUMNS, INFLICTION_COLUMN_IDS, PHYSICAL_INFLICTION_COLUMN_IDS, REACTION_COLUMNS, REACTION_COLUMN_IDS } from '../../model/channels';
import { COMMON_OWNER_ID } from '../slot/commonSlotController';
import { evaluateConditions } from './conditionEvaluator';
import type { ConditionContext } from './conditionEvaluator';
import { absoluteFrame, foreignStopsFor } from './processTimeStop';
import { EXCHANGE_EVENT_DURATION, INFLICTION_DURATION, PHYSICAL_INFLICTION_DURATION, TEAM_STATUS_COLUMN, resolveSusceptibility } from './processInfliction';
import { hasActiveEventInColumns, derivedInteractionToColumnId, isDerivedInteraction, ENEMY_COLUMN_TO_INTERACTIONS } from './processComboSkill';
import type { SlotTriggerWiring } from './processComboSkill';
import { matchInteraction } from '../../consts/semantics';
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

function resolveStatusColumnId(objectId?: string) {
  if (!objectId) return 'unknown-status';
  return REACTION_TO_COLUMN[objectId] ?? objectId.toLowerCase().replace(/_/g, '-');
}

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
        if (d > ev.activationDuration) {
          ev.activationDuration = d;
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
      ev.activationDuration += frames;
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

  // ── QueueFrame handlers (private) ──────────────────────────────────────

  private handleFrameEffect(entry: QueueFrame): QueueFrame[] {
    const ev = entry.derivedEvent!;
    const source = { ownerId: ev.sourceOwnerId ?? '', skillName: ev.sourceSkillName ?? '' };

    if (ev.ownerId === ENEMY_OWNER_ID && REACTION_COLUMN_IDS.has(ev.columnId)) {
      this.controller.createReaction(ev.columnId, ev.ownerId, entry.frame, ev.activationDuration, source, {
        statusLevel: ev.statusLevel, inflictionStacks: ev.inflictionStacks, forcedReaction: ev.forcedReaction || ev.isForced, id: ev.id,
      });
    } else {
      this.controller.createStatus(ev.columnId, ev.ownerId, entry.frame, ev.activationDuration, source, {
        statusName: ev.name, stackingMode: entry.stackingInteraction, id: ev.id,
        event: {
          ...(ev.susceptibility && { susceptibility: ev.susceptibility }),
          ...(ev.segments && { segments: ev.segments }),
        },
      });
    }

    // Post-hook: LINK deferred CONSUME
    const newEntries: QueueFrame[] = [];
    if (ev.ownerId === COMMON_OWNER_ID && Object.values(TEAM_STATUS_COLUMN).includes(ev.columnId)) {
      const statusEnd = ev.startFrame + ev.activationDuration;
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
        const { id, name, ownerId, columnId, startFrame, activationDuration,
          activeDuration, cooldownDuration, sourceOwnerId, sourceSkillName, ...extraProps } = ev;
        this.controller.createStatus(columnId, ownerId, startFrame, activationDuration,
          { ownerId: sourceOwnerId ?? '', skillName: sourceSkillName ?? '' },
          { statusName: name, id, event: extraProps },
        );
      },
    );
    return [];
  }

  private handleComboResolve(entry: QueueFrame): QueueFrame[] {
    const combo = entry.comboResolve?.comboEvent;
    if (!combo?.segments || !this.slotWirings) return [];

    const wiring = this.slotWirings.find(w => w.slotId === combo.ownerId);
    if (!wiring) return [];
    const wcap = wiring.capability;
    const allEvents = [...this.baseEvents, ...this.controller.output];

    if (wcap.comboRequiresActiveColumns?.length &&
        !hasActiveEventInColumns(allEvents, wcap.comboRequiresActiveColumns, entry.frame)) return [];
    if (wcap.comboForbidsActiveColumns?.length &&
        hasActiveEventInColumns(allEvents, wcap.comboForbidsActiveColumns, entry.frame)) return [];

    let triggerCol: string | undefined;

    for (const ev of this.baseEvents) {
      if (triggerCol) break;
      const pubWiring = this.slotWirings.find(w => w.slotId === ev.ownerId);
      if (!pubWiring) continue;
      const published = pubWiring.capability.publishesTriggers[ev.columnId];
      if (!published) continue;
      const triggerFrame = ev.startFrame + ev.activationDuration;
      if (combo.startFrame < triggerFrame || combo.startFrame >= triggerFrame + wcap.comboWindowFrames) continue;
      for (const interaction of published) {
        if (!wcap.comboRequires.some(req => matchInteraction(interaction, req))) continue;
        if (isDerivedInteraction(interaction) && ev.ownerId === combo.ownerId) continue;
        if (ev.sourceOwnerId === combo.ownerId) continue;
        const col = derivedInteractionToColumnId(interaction) ?? ev.columnId;
        if (INFLICTION_COLUMN_IDS.has(col) || PHYSICAL_INFLICTION_COLUMN_IDS.has(col)) { triggerCol = col; break; }
      }
    }

    if (!triggerCol) {
      for (const ev of this.controller.output) {
        if (triggerCol) break;
        if (ev.ownerId !== ENEMY_OWNER_ID) continue;
        const interactions = ENEMY_COLUMN_TO_INTERACTIONS[ev.columnId];
        if (!interactions) continue;
        if (combo.startFrame < ev.startFrame || combo.startFrame >= ev.startFrame + wcap.comboWindowFrames) continue;
        for (const interaction of interactions) {
          if (!wcap.comboRequires.some(req => matchInteraction(interaction, req))) continue;
          if (ev.sourceOwnerId === combo.ownerId) continue;
          triggerCol = ev.columnId; break;
        }
      }
    }
    if (!triggerCol) return [];

    const isArts = INFLICTION_COLUMN_IDS.has(triggerCol);
    const fStops = foreignStopsFor(combo, this.controller.getStops());
    const newEntries: QueueFrame[] = [];
    let cumOffset = 0;
    for (let si = 0; si < combo.segments.length; si++) {
      const seg = combo.segments[si];
      if (seg.frames) {
        for (let fi = 0; fi < seg.frames.length; fi++) {
          const absF = absoluteFrame(combo.startFrame, cumOffset, seg.frames[fi].offsetFrame, fStops);
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
      cumOffset += seg.durationFrames;
    }
    this.controller.setComboTriggerColumnId(combo.id, triggerCol);
    return newEntries;
  }

  private checkThreshold(columnId: string, ownerId: string, frame: number) {
    const ctx = this.exchangeContexts.find(c => c.columnId === columnId && c.ownerId === ownerId);
    if (!ctx) return;
    if (this.controller.activeCount(columnId, ownerId, frame) !== ctx.maxStacks) return;
    const thresholdEvents = evaluateThresholdForExchange(ctx, frame, this.thresholdDerived, this.slotOperatorMap);
    for (const ev of thresholdEvents) {
      const { id, name, ownerId: evOwner, columnId: evCol, startFrame, activationDuration,
        activeDuration, cooldownDuration, sourceOwnerId, sourceSkillName, ...extraProps } = ev;
      this.controller.createStatus(evCol, evOwner, startFrame, activationDuration,
        { ownerId: sourceOwnerId ?? '', skillName: sourceSkillName ?? '' },
        { statusName: name, id, event: extraProps },
      );
      this.thresholdDerived.push(ev);
    }
  }
}
