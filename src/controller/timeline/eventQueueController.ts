/**
 * InputEventController — unified pipeline orchestrator for the event queue.
 *
 * Receives raw user-placed events, extracts frame markers, seeds the queue,
 * and runs the EventInterpretorController to produce all derived events.
 *
 * ALL game mechanics processing — time-stop resolution, infliction derivation,
 * exchange statuses, combo windows, frame positions, validation — happens here.
 */
import { TimelineEvent, EventSegmentData, eventDuration } from '../../consts/viewTypes';
import { ElementType, StatusType } from '../../consts/enums';
import { NounType } from '../../dsl/semantics';
import type { Interaction } from '../../dsl/semantics';
import { evaluateConditions } from './conditionEvaluator';
import { LoadoutProperties } from '../../view/InformationPane';
import { TimeStopRegion, absoluteFrame, foreignStopsFor } from './processTimeStop';
import { TOTAL_FRAMES } from '../../utils/timeline';
import { DerivedEventController } from './derivedEventController';
import { deriveComboActivationWindows } from './processComboSkill';
import type { SlotTriggerWiring } from './eventQueueTypes';
import {
  resolveSusceptibility,
} from './processInfliction';
import { SkillPointController } from '../slot/skillPointController';
import {
  collectEngineTriggerEntries,
} from './statusTriggerCollector';
import {
  PRIORITY, MAX_INFLICTION_STACKS, getConsumeStatusConfig,
} from './eventQueueTypes';
import type { QueueFrame } from './eventQueueTypes';
import { EventInterpretorController } from './eventInterpretorController';
import { PriorityQueue } from './priorityQueue';
import {
  ELEMENT_TO_INFLICTION_COLUMN,
  ENEMY_OWNER_ID, INFLICTION_COLUMN_IDS,
  INFLICTION_DURATION, REACTION_DURATION,
  FORCED_REACTION_COLUMN, FORCED_REACTION_DURATION,
  TEAM_STATUS_COLUMN, P5_LINK_EXTENSION_FRAMES,
  OPERATOR_COLUMNS, SKILL_COLUMNS, REACTION_COLUMN_IDS,
} from '../../model/channels';
import { COMMON_OWNER_ID } from '../slot/commonSlotController';
import { getAllOperatorIds, getSkillIds, getSkillTypeMap } from '../../model/event-frames/operatorJsonLoader';
import { getAllTriggerAssociations } from '../gameDataController';
import { classifyEvents } from './inputEventController';
import { initHpTracker, getEnemyHpPercentage, precomputeDamageByFrame } from '../calculation/calculationController';
import type { OperatorLoadoutState } from '../../view/OperatorLoadoutHeader';
import { resolveControlledOperator } from './controlledOperatorResolver';

// ── Frame effect collection ─────────────────────────────────────────────────

/**
 * Collect FRAME_EFFECT entries from frame markers:
 * - Enemy-targeted statuses (Focus, susceptibility)
 * - Forced reactions
 * - Team statuses (LINK)
 * - Originium Crystals from SEALING_SEQUENCE
 */
function collectFrameEffectEntries(
  events: TimelineEvent[],
  loadoutProperties: Record<string, LoadoutProperties> | undefined,
  stops: readonly TimeStopRegion[],
): QueueFrame[] {
  const entries: QueueFrame[] = [];

  for (const event of events) {
    if (event.ownerId === ENEMY_OWNER_ID) continue;

    const fStops = foreignStopsFor(event, stops);
    let cumulativeOffset = 0;
    for (let si = 0; si < event.segments.length; si++) {
      const seg = event.segments[si];
      if (seg.frames) {
        for (let fi = 0; fi < seg.frames.length; fi++) {
          const frame = seg.frames[fi];
          const absFrame = absoluteFrame(event.startFrame, cumulativeOffset, frame.offsetFrame, fStops);

          // Status effects applied by this frame
          const statusEffects = frame.applyStatuses ?? (frame.applyStatus ? [frame.applyStatus] : []);
          for (let sti = 0; sti < statusEffects.length; sti++) {
            const statusEffect = statusEffects[sti];

            const pot = loadoutProperties?.[event.ownerId]?.operator.potential ?? 0;
            if (statusEffect.potentialMin != null && pot < statusEffect.potentialMin) continue;
            if (statusEffect.potentialMax != null && pot > statusEffect.potentialMax) continue;

            if (statusEffect.target.noun === NounType.OPERATOR) {

              const teamColumnId = TEAM_STATUS_COLUMN[statusEffect.status];
              if (teamColumnId) {
                const ultActiveEnd = event.startFrame + eventDuration(event);
                let linkDuration = Math.max(0, ultActiveEnd - absFrame);
                if (pot >= 5) linkDuration += P5_LINK_EXTENSION_FRAMES;
                entries.push({
                  frame: absFrame,
                  priority: PRIORITY.FRAME_EFFECT,
                  type: 'FRAME_EFFECT',
                  statusName: statusEffect.status,
                  columnId: teamColumnId,
                  ownerId: COMMON_OWNER_ID,
                  sourceOwnerId: event.ownerId,
                  sourceSkillName: event.name,
                  maxStacks: 0,
                  durationFrames: linkDuration,
                  operatorSlotId: event.ownerId,
                  derivedEvent: {
                    uid: `${event.uid}-team-status-${si}-${fi}`,
                    id: 'Squad Buff (Link)',
                    name: 'Squad Buff (Link)',
                    ownerId: COMMON_OWNER_ID,
                    columnId: teamColumnId,
                    startFrame: absFrame,
                    segments: [{ properties: { duration: linkDuration } }],
                    sourceOwnerId: event.ownerId,
                    sourceSkillName: event.name,
                  },
                });
              }
            } else if (statusEffect.target.noun === NounType.ENEMY) {
              let segments: EventSegmentData[] | undefined;
              let susceptibility: Partial<Record<ElementType, number>> | undefined;

              if (statusEffect.segments && statusEffect.segments.length > 0) {
                segments = statusEffect.segments.map(seg => ({
                  properties: {
                    duration: seg.durationFrames,
                    name: seg.name,
                  },
                  ...(seg.susceptibility && {
                    unknown: { susceptibility: resolveSusceptibility(seg.susceptibility, event.columnId, event.ownerId, loadoutProperties) },
                  }),
                }));
                const firstSeg = statusEffect.segments[0];
                if (firstSeg.susceptibility) {
                  susceptibility = resolveSusceptibility(firstSeg.susceptibility, event.columnId, event.ownerId, loadoutProperties);
                }
              } else if (statusEffect.susceptibility) {
                susceptibility = resolveSusceptibility(statusEffect.susceptibility, event.columnId, event.ownerId, loadoutProperties);
              }

              entries.push({
                frame: absFrame,
                priority: PRIORITY.FRAME_EFFECT,
                type: 'FRAME_EFFECT',
                statusName: statusEffect.status,
                columnId: statusEffect.status,
                ownerId: ENEMY_OWNER_ID,
                sourceOwnerId: event.ownerId,
                sourceSkillName: event.name,
                maxStacks: 0,
                durationFrames: statusEffect.durationFrames,
                operatorSlotId: event.ownerId,
                stackingInteraction: statusEffect.stackingInteraction,
                derivedEvent: {
                  uid: `${event.uid}-status-${si}-${fi}-${sti}`,
                  id: statusEffect.eventName ?? statusEffect.status,
                  name: statusEffect.eventName ?? statusEffect.status,
                  ownerId: ENEMY_OWNER_ID,
                  columnId: statusEffect.status,
                  startFrame: absFrame,
                  segments: [{ properties: { duration: statusEffect.durationFrames } }],
                  sourceOwnerId: event.ownerId,
                  sourceSkillName: event.name,
                  ...(susceptibility && { susceptibility }),
                  ...(segments && { segments }),
                },
              });
            }
          }

          // Forced reactions bypass infliction stacks entirely
          if (frame.applyForcedReaction) {
            const reactionColumnId = FORCED_REACTION_COLUMN[frame.applyForcedReaction.reaction];
            if (reactionColumnId) {
              entries.push({
                frame: absFrame,
                priority: PRIORITY.FRAME_EFFECT,
                type: 'FRAME_EFFECT',
                statusName: frame.applyForcedReaction.reaction,
                columnId: reactionColumnId,
                ownerId: ENEMY_OWNER_ID,
                sourceOwnerId: event.ownerId,
                sourceSkillName: event.name,
                maxStacks: 0,
                durationFrames: frame.applyForcedReaction.durationFrames ?? FORCED_REACTION_DURATION[reactionColumnId] ?? REACTION_DURATION,
                operatorSlotId: event.ownerId,
                derivedEvent: {
                  uid: `${event.uid}-forced-${si}-${fi}`,
                  id: reactionColumnId,
                  name: reactionColumnId,
                  ownerId: ENEMY_OWNER_ID,
                  columnId: reactionColumnId,
                  startFrame: absFrame,
                  segments: [{ properties: { duration: frame.applyForcedReaction.durationFrames ?? FORCED_REACTION_DURATION[reactionColumnId] ?? REACTION_DURATION } }],
                  stacks: frame.applyForcedReaction.stacks,
                  sourceOwnerId: event.ownerId,
                  sourceSkillName: event.name,
                  forcedReaction: true,
                },
              });
            }
          }
        }
      }
      cumulativeOffset += seg.properties.duration;
    }
  }

  // Endministrator: Originium Crystals
  for (const event of events) {
    if (event.ownerId === ENEMY_OWNER_ID) continue;
    if (event.name !== 'SEALING_SEQUENCE') continue;
    entries.push({
      frame: event.startFrame,
      priority: PRIORITY.FRAME_EFFECT,
      type: 'FRAME_EFFECT',
      statusName: StatusType.ORIGINIUM_CRYSTAL,
      columnId: OPERATOR_COLUMNS.ORIGINIUM_CRYSTAL,
      ownerId: ENEMY_OWNER_ID,
      sourceOwnerId: event.ownerId,
      sourceSkillName: event.name,
      maxStacks: 0,
      durationFrames: TOTAL_FRAMES,
      operatorSlotId: event.ownerId,
      derivedEvent: {
        uid: `${event.uid}-crystal`,
        id: StatusType.ORIGINIUM_CRYSTAL,
        name: StatusType.ORIGINIUM_CRYSTAL,
        ownerId: ENEMY_OWNER_ID,
        columnId: OPERATOR_COLUMNS.ORIGINIUM_CRYSTAL,
        startFrame: event.startFrame,
        segments: [{ properties: { duration: TOTAL_FRAMES } }],
        sourceOwnerId: event.ownerId,
        sourceSkillName: event.name,
      },
    });
  }

  return entries;
}

// ── Infliction collection ───────────────────────────────────────────────────

/**
 * Collect all INFLICTION_CREATE entries:
 * 1. From applyArtsInfliction frame markers on skill events
 * 2. From combo trigger ticks
 * 3. From freeform-placed infliction events (sourceOwnerId === USER_ID)
 *
 * All three sources produce the same entry type and go through the same
 * createInfliction pipeline (deque stacking, cross-element reactions, etc.).
 *
 * Freeform entries are also tracked in `freeformInflictionIds` so the caller
 * can exclude them from the queue controller's base events (the raw events
 * stay in `state` for undo/drag).
 */
function collectInflictionEntries(
  events: TimelineEvent[],
  stops: readonly TimeStopRegion[],
): QueueFrame[] {
  const entries: QueueFrame[] = [];

  for (const event of events) {
    // Only skill events (freeform inflictions are classified separately by InputEventController)
    if (event.ownerId === ENEMY_OWNER_ID) continue;

    const fStops = foreignStopsFor(event, stops);
    let cumulativeOffset = 0;
    for (let si = 0; si < event.segments.length; si++) {
      const seg = event.segments[si];
      if (seg.frames) {
        for (let fi = 0; fi < seg.frames.length; fi++) {
          const frame = seg.frames[fi];
          const absFrame = absoluteFrame(event.startFrame, cumulativeOffset, frame.offsetFrame, fStops);

          if (frame.applyArtsInfliction) {
            const columnId = ELEMENT_TO_INFLICTION_COLUMN[frame.applyArtsInfliction.element];
            if (columnId) {
              entries.push({
                frame: absFrame,
                priority: PRIORITY.INFLICTION_CREATE,
                type: 'INFLICTION_CREATE',
                uid: `${event.uid}-inflict-${si}-${fi}`,
                statusName: columnId,
                columnId,
                ownerId: ENEMY_OWNER_ID,
                sourceOwnerId: event.ownerId,
                sourceSkillName: event.name,
                maxStacks: MAX_INFLICTION_STACKS,
                durationFrames: INFLICTION_DURATION,
                operatorSlotId: event.ownerId,
              });
            }
          }

          // APPLY SOURCE INFLICTION: mirror the combo's trigger infliction
          if (frame.duplicatesSourceInfliction && event.comboTriggerColumnId) {
            const triggerCol = event.comboTriggerColumnId;
            if (INFLICTION_COLUMN_IDS.has(triggerCol)) {
              entries.push({
                frame: absFrame,
                priority: PRIORITY.INFLICTION_CREATE,
                type: 'INFLICTION_CREATE',
                uid: `${event.uid}-combo-inflict-${si}-${fi}`,
                statusName: triggerCol,
                columnId: triggerCol,
                ownerId: ENEMY_OWNER_ID,
                sourceOwnerId: event.ownerId,
                sourceSkillName: event.name,
                maxStacks: MAX_INFLICTION_STACKS,
                durationFrames: INFLICTION_DURATION,
                operatorSlotId: event.ownerId,
              });
            }
          }
        }
      }
      cumulativeOffset += seg.properties.duration;
    }

  }

  return entries;
}

// ── Status consumption collection ───────────────────────────────────────────

/** Scan events for consumeStatus frame markers targeting operator statuses. */
function collectConsumeEntries(
  events: TimelineEvent[],
  stops: readonly TimeStopRegion[],
): QueueFrame[] {
  const entries: QueueFrame[] = [];

  for (const event of events) {
    if (event.ownerId === ENEMY_OWNER_ID || event.ownerId === COMMON_OWNER_ID) continue;

    const fStops = foreignStopsFor(event, stops);
    let cumulativeOffset = 0;
    for (let si = 0; si < event.segments.length; si++) {
      const seg = event.segments[si];
      if (seg.frames) {
        for (let fi = 0; fi < seg.frames.length; fi++) {
          const frame = seg.frames[fi];
          if (!frame.consumeStatus) continue;

          const config = getConsumeStatusConfig()[frame.consumeStatus];
          if (config) {
            const targetOwnerId = config.targetOwnerId ?? event.ownerId;
            entries.push({
              frame: absoluteFrame(event.startFrame, cumulativeOffset, frame.offsetFrame, fStops),
              priority: PRIORITY.CONSUME,
              type: 'CONSUME',
              statusName: frame.consumeStatus,
              columnId: config.columnId,
              ownerId: targetOwnerId,
              sourceOwnerId: event.ownerId,
              sourceSkillName: event.name,
              maxStacks: 0,
              durationFrames: 0,
              operatorSlotId: event.ownerId,
            });
          }
        }
      }
      cumulativeOffset += seg.properties.duration;
    }
  }

  return entries;
}

// ── Reaction consumption ────────────────────────────────────────────────────

/**
 * Collect CONSUME entries from consumeReaction frame markers and clause-based
 * consumeReaction effects.
 */
function collectConsumeReactionEntries(
  events: TimelineEvent[],
  stops: readonly TimeStopRegion[],
): QueueFrame[] {
  const entries: QueueFrame[] = [];

  for (const event of events) {
    if (event.ownerId === ENEMY_OWNER_ID) continue;
    const fStops = foreignStopsFor(event, stops);
    let cumOffset = 0;
    for (const seg of event.segments) {
      if (seg.frames) {
        for (const frame of seg.frames) {
          // Clause-based consume (DSL v2)
          if (frame.clauses && frame.clauses.length > 0) {
            const absF = absoluteFrame(event.startFrame, cumOffset, frame.offsetFrame, fStops);
            for (const pred of frame.clauses) {
              if (pred.conditions.length === 0) continue;
              const consumeEf = pred.effects.find(e => e.type === 'consumeReaction');
              if (!consumeEf?.consumeReaction) continue;
              const conditionsMet = evaluateConditions(
                pred.conditions as unknown as Interaction[],
                { events, frame: absF, sourceOwnerId: event.ownerId },
              );
              if (!conditionsMet) continue;
              const statusEf = pred.effects.find(e => e.type === 'applyStatus');
              entries.push({
                frame: absF,
                priority: PRIORITY.CONSUME,
                type: 'CONSUME',
                statusName: 'CONSUME_REACTION',
                columnId: consumeEf.consumeReaction.columnId,
                ownerId: ENEMY_OWNER_ID,
                sourceOwnerId: event.ownerId,
                sourceSkillName: event.name,
                maxStacks: 0,
                durationFrames: 0,
                operatorSlotId: event.ownerId,
                consumeReaction: {
                  reactionColumnId: consumeEf.consumeReaction.columnId,
                  applyStatus: statusEf?.applyStatus ? {
                    target: statusEf.applyStatus.target,
                    status: statusEf.applyStatus.status,
                    stacks: statusEf.applyStatus.stacks,
                    durationFrames: statusEf.applyStatus.durationFrames,
                    ...(statusEf.applyStatus.susceptibility && { susceptibility: statusEf.applyStatus.susceptibility }),
                    ...(statusEf.applyStatus.eventName && { eventName: statusEf.applyStatus.eventName }),
                  } : undefined,
                  sourceColumnId: event.columnId,
                },
              });
            }
          }
          // Legacy consumeReaction marker
          else if (frame.consumeReaction) {
            entries.push({
              frame: absoluteFrame(event.startFrame, cumOffset, frame.offsetFrame, fStops),
              priority: PRIORITY.CONSUME,
              type: 'CONSUME',
              statusName: 'CONSUME_REACTION',
              columnId: frame.consumeReaction.columnId,
              ownerId: ENEMY_OWNER_ID,
              sourceOwnerId: event.ownerId,
              sourceSkillName: event.name,
              maxStacks: 0,
              durationFrames: 0,
              operatorSlotId: event.ownerId,
              consumeReaction: {
                reactionColumnId: frame.consumeReaction.columnId,
                applyStatus: frame.consumeReaction.applyStatus,
                sourceColumnId: event.columnId,
              },
            });
          }
        }
      }
      cumOffset += seg.properties.duration;
    }
  }

  return entries;
}

// ── Cryo consumption entry collection ───────────────────────────────────────

function collectCryoConsumptionEntries(
  events: TimelineEvent[],
  loadoutProperties?: Record<string, LoadoutProperties>,
): QueueFrame[] {
  let sourceOpId: string | null = null;
  for (const opId of getAllOperatorIds()) {
    if (getSkillIds(opId).has('WINTERS_DEVOURER')) {
      sourceOpId = opId;
      break;
    }
  }
  if (!sourceOpId) return [];

  const typeMap = getSkillTypeMap(sourceOpId);
  const comboBaseId = typeMap.COMBO_SKILL;
  if (!comboBaseId) return [];
  const allSkills = getSkillIds(sourceOpId);
  const comboNames = new Set(Array.from(allSkills).filter(id => id === comboBaseId || id.startsWith(comboBaseId + '_')));

  const comboEvents = events.filter(ev => comboNames.has(ev.name) && ev.ownerId !== ENEMY_OWNER_ID);
  if (comboEvents.length === 0) return [];

  const entries: QueueFrame[] = [];
  for (const combo of comboEvents) {
    const props = loadoutProperties?.[combo.ownerId];
    const talentOneLevel = props?.operator.talentOneLevel ?? 0;
    if (talentOneLevel < 1) continue;
    const perStack = talentOneLevel >= 2 ? 0.04 : 0.02;

    entries.push({
      frame: combo.startFrame,
      priority: PRIORITY.CONSUME,
      type: 'CONSUME',
      statusName: 'CRYO_SUSCEPTIBILITY',
      columnId: 'cryoInfliction',
      ownerId: ENEMY_OWNER_ID,
      sourceOwnerId: combo.ownerId,
      sourceSkillName: combo.name,
      maxStacks: 0,
      durationFrames: 0,
      operatorSlotId: combo.ownerId,
      cryoSusceptibility: { perStack },
    });
  }
  return entries;
}

// ── EventQueueController ─────────────────────────────────────────────────────

/**
 * EventQueueController — seeds the priority queue and runs the interpreter.
 * Receives a single DEC (with input events already registered) and derived
 * events (freeform inflictions/reactions to seed via addEvent).
 *
 * Linear chain: InputEventController → EventQueueController → EventInterpretorController → DerivedEventController
 */
export function runEventQueue(
  state: DerivedEventController,
  derivedEvents: TimelineEvent[],
  loadoutProperties?: Record<string, LoadoutProperties>,
  slotWeapons?: Record<string, string | undefined>,
  slotOperatorMap?: Record<string, string>,
  slotGearSets?: Record<string, string | undefined>,
  getEnemyHpPercentage?: (frame: number) => number | null,
  getControlledSlotAtFrame?: (frame: number) => string,
): void {
  const slotWirings = state.getSlotWirings();
  const registeredEvents = state.getRegisteredEvents();
  const stops = state.getStops();

  // Collect trigger contexts from configs
  const { entries: engineEntries } = collectEngineTriggerEntries(
    registeredEvents, loadoutProperties, slotOperatorMap, slotWeapons, slotGearSets,
  );

  // ── Seed priority queue ───────────────────────────────────────────────────
  const queue = new PriorityQueue<QueueFrame>((a, b) =>
    a.frame !== b.frame ? a.frame - b.frame : a.priority - b.priority
  );
  const seed = (entries: QueueFrame[]) => { for (const e of entries) queue.insert(e); };

  // Create interpreter backed by the single DEC
  const interpretor = new EventInterpretorController(state, registeredEvents, {
    loadoutProperties, slotOperatorMap, slotWirings, getEnemyHpPercentage,
    getControlledSlotAtFrame,
  });

  // Seed derived events (freeform inflictions/reactions) — these go through the
  // queue so they're processed at the correct priority (not into registeredEvents)
  for (const ev of derivedEvents) {
    if (INFLICTION_COLUMN_IDS.has(ev.columnId)) {
      queue.insert({
        frame: ev.startFrame,
        priority: PRIORITY.INFLICTION_CREATE,
        type: 'INFLICTION_CREATE',
        uid: ev.uid,
        statusName: ev.columnId,
        columnId: ev.columnId,
        ownerId: ev.ownerId,
        sourceOwnerId: ev.sourceOwnerId ?? ev.ownerId,
        sourceSkillName: ev.sourceSkillName ?? ev.name,
        maxStacks: MAX_INFLICTION_STACKS,
        durationFrames: eventDuration(ev),
        operatorSlotId: ev.ownerId,
      });
    } else if (REACTION_COLUMN_IDS.has(ev.columnId)) {
      queue.insert({
        frame: ev.startFrame,
        priority: PRIORITY.FRAME_EFFECT,
        type: 'FRAME_EFFECT',
        statusName: ev.columnId,
        columnId: ev.columnId,
        ownerId: ev.ownerId,
        sourceOwnerId: ev.sourceOwnerId ?? ev.ownerId,
        sourceSkillName: ev.sourceSkillName ?? ev.name,
        maxStacks: 0,
        durationFrames: eventDuration(ev),
        operatorSlotId: ev.ownerId,
        derivedEvent: ev,
      });
    }
  }

  // Seed from input event frame markers
  seed(collectInflictionEntries(registeredEvents, stops));
  seed(collectFrameEffectEntries(registeredEvents, loadoutProperties, stops));
  for (const ev of registeredEvents) {
    if (ev.columnId === SKILL_COLUMNS.COMBO && !ev.comboTriggerColumnId) {
      queue.insert({
        frame: ev.startFrame,
        priority: PRIORITY.COMBO_RESOLVE,
        type: 'COMBO_RESOLVE',
        statusName: ev.name,
        columnId: SKILL_COLUMNS.COMBO,
        ownerId: ev.ownerId,
        sourceOwnerId: ev.ownerId,
        sourceSkillName: ev.name,
        maxStacks: MAX_INFLICTION_STACKS,
        durationFrames: 0,
        operatorSlotId: ev.ownerId,
        comboResolve: { comboEvent: ev },
      });
    }
  }
  seed(collectConsumeReactionEntries(registeredEvents, stops));
  seed(collectCryoConsumptionEntries(registeredEvents, loadoutProperties));
  seed(collectConsumeEntries(registeredEvents, stops));
  seed(engineEntries.map(e => ({
    frame: e.frame,
    priority: PRIORITY.ENGINE_TRIGGER,
    type: 'ENGINE_TRIGGER' as const,
    statusName: e.ctx.def.properties.id,
    columnId: '',
    ownerId: e.ctx.operatorSlotId,
    sourceOwnerId: e.sourceOwnerId,
    sourceSkillName: e.sourceSkillName,
    maxStacks: 0,
    durationFrames: 0,
    operatorSlotId: e.ctx.operatorSlotId,
    engineTrigger: e,
  })));

  // ── Run the queue ─────────────────────────────────────────────────────────
  while (queue.size > 0) {
    const entry = queue.extractMin()!;
    const newEntries = interpretor.processQueueFrame(entry);
    for (const e of newEntries) queue.insert(e);
  }

  // Register queue-created events + combo windows into DEC
  const queueEvents = state.output;
  state.markExtended(queueEvents.map(ev => ev.uid));

  const allEvents = [...registeredEvents, ...queueEvents];
  const comboWindows = slotWirings && slotWirings.length > 0
    ? deriveComboActivationWindows(allEvents, slotWirings, stops)
    : [];
  state.registerEvents([...queueEvents, ...comboWindows]);

  state.validateAll();
}

// ── Pipeline entry point ─────────────────────────────────────────────────────

let _lastController: DerivedEventController | null = null;

/** Get the DerivedEventController from the most recent processCombatSimulation run. */
export function getLastController(): DerivedEventController {
  return _lastController!;
}

/**
 * Linear pipeline entry point.
 *
 * 1. InputEventController.classifyEvents → split input vs derived
 * 2. DerivedEventController.registerEvents → input events only
 * 3. SkillPointController.deriveSPRecoveryEvents → SP recovery events
 * 4. collectEngineTriggerEntries → talent presence events
 * 5. EventQueueController.runEventQueue → seeds derived, runs interpreter
 * 6. DerivedEventController.getProcessedEvents → final output
 */
export function processCombatSimulation(
  rawEvents: TimelineEvent[],
  loadoutProperties?: Record<string, LoadoutProperties>,
  slotWeapons?: Record<string, string | undefined>,
  slotWirings?: SlotTriggerWiring[],
  slotOperatorMap?: Record<string, string>,
  slotGearSets?: Record<string, string | undefined>,
  /** Boss max HP for live HP threshold predicates (null = no HP tracking). */
  bossMaxHp?: number | null,
  /** Enemy ID for damage estimation (needed for DEF in HP tracking). */
  enemyId?: string,
  /** Loadout states per slot (weapon/gear selection, needed for ATK in HP tracking). */
  loadouts?: Record<string, OperatorLoadoutState>,
  /** SP controller singleton for incremental SP tracking. */
  spController?: SkillPointController,
  /** UE controller singleton for incremental UE tracking. */
  ueController?: import('../timeline/ultimateEnergyController').UltimateEnergyController,
): TimelineEvent[] {
  // ── 0. Initialize HP tracker for live HP% queries during queue processing ─
  initHpTracker(bossMaxHp ?? null);

  // ── 0b. Clear resource controllers for this pipeline run ──────────────────
  if (spController) spController.clearPending();
  if (ueController) ueController.clear();

  // ── 1. InputEventController: classify ─────────────────────────────────────
  const { inputEvents, derivedEvents } = classifyEvents(rawEvents);

  // ── 2. DerivedEventController: register input events ──────────────────────
  const triggerAssociations = getAllTriggerAssociations();
  const state = new DerivedEventController(undefined, triggerAssociations, slotWirings, spController, ueController);
  const slotIds = slotOperatorMap ? Object.keys(slotOperatorMap) : [];
  state.seedControlledOperator(slotIds[0]);
  state.registerEvents(inputEvents);

  // ── 3. SP recovery + talent events ────────────────────────────────────────
  const withSPRecovery = SkillPointController.deriveSPRecoveryEvents(state.getRegisteredEvents(), state.getStops());
  const spEvents = withSPRecovery.slice(state.getRegisteredEvents().length);
  state.registerEvents(spEvents);

  const { talentEvents } = collectEngineTriggerEntries(
    state.getRegisteredEvents(), loadoutProperties, slotOperatorMap, slotWeapons, slotGearSets,
  );
  state.registerEvents(talentEvents);

  // ── 3b. Pre-compute damage by frame for HP threshold predicates ───────────
  if (bossMaxHp != null && enemyId && slotOperatorMap && loadoutProperties) {
    const slotInfo = Object.entries(slotOperatorMap).map(([slotId, opId]) => ({ slotId, operatorId: opId }));
    precomputeDamageByFrame(state.getRegisteredEvents(), slotInfo, loadoutProperties, loadouts, enemyId);
  }

  // ── 3c. Resolve controlled operator ──────────────────────────────────────
  const getControlledSlotAtFrame = resolveControlledOperator(
    state.getRegisteredEvents(), slotIds,
  );

  // ── 4. EventQueueController: seed derived + run queue ─────────────────────
  runEventQueue(state, derivedEvents, loadoutProperties, slotWeapons, slotOperatorMap, slotGearSets,
    bossMaxHp != null ? getEnemyHpPercentage : undefined, getControlledSlotAtFrame);

  // ── 5. Finalize resource controllers ──────────────────────────────────────
  if (spController) {
    spController.finalize(state.getStops());
  }
  if (ueController) {
    const gainFrames = spController ? new Map(spController.getBattleSkillGainFrames()) : new Map<string, { frame: number; slotId: string }>();
    ueController.finalize(gainFrames);
  }

  // ── 6. Output ─────────────────────────────────────────────────────────────
  _lastController = state;
  return state.getProcessedEvents();
}
