/**
 * InputEventController — unified pipeline orchestrator for the event queue.
 *
 * Receives raw user-placed events, extracts frame markers, seeds the queue,
 * and runs the EventInterpretor to produce all derived events.
 *
 * ALL game mechanics processing — time-stop resolution, infliction derivation,
 * exchange statuses, combo windows, frame positions, validation — happens here.
 * processInteractions.ts is a thin wrapper that delegates to this module.
 */
import { TimelineEvent, EventSegmentData } from '../../consts/viewTypes';
import { CombatSkillsType, ElementType, StatusType, TargetType } from '../../consts/enums';
import type { Interaction } from '../../consts/semantics';
import { evaluateConditions } from './conditionEvaluator';
import { LoadoutProperties } from '../../view/InformationPane';
import { TimeStopRegion, absoluteFrame, foreignStopsFor } from './processTimeStop';
import { DerivedEventController } from './derivedEventController';
import { deriveComboActivationWindows, getFinalStrikeTriggerFrame } from './processComboSkill';
import type { SlotTriggerWiring } from './processComboSkill';
import {
  deriveSPRecovery,
  ELEMENT_TO_INFLICTION_COLUMN,
  INFLICTION_DURATION, PHYSICAL_INFLICTION_DURATION, REACTION_DURATION,
  FORCED_REACTION_COLUMN, FORCED_REACTION_DURATION,
  TEAM_STATUS_COLUMN, P5_LINK_EXTENSION_FRAMES,
  EXCHANGE_EVENT_DURATION,
  resolveSusceptibility,
} from './processInfliction';
import { getExchangeStatusConfig, getExchangeStatusIds } from '../../model/event-frames/operatorJsonLoader';
import {
  collectExchangeStatusTriggers, collectAbsorptionContexts, collectEngineTriggerEntries,
} from './statusDerivationEngine';
import type { ExchangeStatusQueueContext } from './statusDerivationEngine';
import {
  PRIORITY, MAX_INFLICTION_STACKS, getConsumeStatusConfig,
} from './eventQueueTypes';
import type { QueueFrame } from './eventQueueTypes';
import { EventInterpretor } from './eventInterpretor';
import { PriorityQueue } from './priorityQueue';
import {
  ENEMY_OWNER_ID, USER_ID, INFLICTION_COLUMN_IDS, PHYSICAL_INFLICTION_COLUMN_IDS,
  OPERATOR_COLUMNS, SKILL_COLUMNS, REACTION_COLUMN_IDS,
} from '../../model/channels';
import { COMMON_OWNER_ID } from '../slot/commonSlotController';
import { getAllOperatorIds, getSkillIds, getSkillTypeMap } from '../../model/event-frames/operatorJsonLoader';

// ── Last-computed time-stop regions ──────────────────────────────────────────

let lastController: DerivedEventController | null = null;

/** Get the DerivedEventController from the most recent processEventQueue run. */
export function getLastController(): DerivedEventController {
  return lastController!;
}

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
    if (!event.segments || event.ownerId === ENEMY_OWNER_ID) continue;

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

            if (statusEffect.target === TargetType.SELF) {
              if (getExchangeStatusIds().has(statusEffect.status)) continue;

              const teamColumnId = TEAM_STATUS_COLUMN[statusEffect.status];
              if (teamColumnId) {
                const ultActiveEnd = event.startFrame + event.activationDuration + event.activeDuration;
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
                    id: `${event.id}-team-status-${si}-${fi}`,
                    name: 'Squad Buff (Link)',
                    ownerId: COMMON_OWNER_ID,
                    columnId: teamColumnId,
                    startFrame: absFrame,
                    activationDuration: linkDuration,
                    activeDuration: 0,
                    cooldownDuration: 0,
                    sourceOwnerId: event.ownerId,
                    sourceSkillName: event.name,
                  },
                });
              }
            } else if (statusEffect.target === TargetType.ENEMY) {
              let segments: EventSegmentData[] | undefined;
              let susceptibility: Partial<Record<ElementType, number>> | undefined;

              if (statusEffect.segments && statusEffect.segments.length > 0) {
                segments = statusEffect.segments.map(seg => ({
                  durationFrames: seg.durationFrames,
                  label: seg.name,
                  ...(seg.susceptibility && {
                    susceptibility: resolveSusceptibility(seg.susceptibility, event.columnId, event.ownerId, loadoutProperties),
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
                  id: `${event.id}-status-${si}-${fi}-${sti}`,
                  name: statusEffect.eventName ?? statusEffect.status,
                  ownerId: ENEMY_OWNER_ID,
                  columnId: statusEffect.status,
                  startFrame: absFrame,
                  activationDuration: statusEffect.durationFrames,
                  activeDuration: 0,
                  cooldownDuration: 0,
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
                  id: `${event.id}-forced-${si}-${fi}`,
                  name: reactionColumnId,
                  ownerId: ENEMY_OWNER_ID,
                  columnId: reactionColumnId,
                  startFrame: absFrame,
                  activationDuration: frame.applyForcedReaction.durationFrames ?? FORCED_REACTION_DURATION[reactionColumnId] ?? REACTION_DURATION,
                  activeDuration: 0,
                  cooldownDuration: 0,
                  statusLevel: frame.applyForcedReaction.statusLevel,
                  sourceOwnerId: event.ownerId,
                  sourceSkillName: event.name,
                  forcedReaction: true,
                },
              });
            }
          }
        }
      }
      cumulativeOffset += seg.durationFrames;
    }
  }

  // Endministrator: Originium Crystals
  for (const event of events) {
    if (event.ownerId === ENEMY_OWNER_ID) continue;
    if (event.name !== CombatSkillsType.SEALING_SEQUENCE) continue;
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
      durationFrames: EXCHANGE_EVENT_DURATION,
      operatorSlotId: event.ownerId,
      derivedEvent: {
        id: `${event.id}-crystal`,
        name: StatusType.ORIGINIUM_CRYSTAL,
        ownerId: ENEMY_OWNER_ID,
        columnId: OPERATOR_COLUMNS.ORIGINIUM_CRYSTAL,
        startFrame: event.startFrame,
        activationDuration: EXCHANGE_EVENT_DURATION,
        activeDuration: 0,
        cooldownDuration: 0,
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
  freeformInflictionIds: Set<string>,
): QueueFrame[] {
  const entries: QueueFrame[] = [];

  for (const event of events) {
    // Freeform inflictions: enemy-owned, infliction column, placed by user
    if (event.ownerId === ENEMY_OWNER_ID && INFLICTION_COLUMN_IDS.has(event.columnId) && event.sourceOwnerId === USER_ID) {
      freeformInflictionIds.add(event.id);
      entries.push({
        frame: event.startFrame,
        priority: PRIORITY.INFLICTION_CREATE,
        type: 'INFLICTION_CREATE',
        id: event.id,
        statusName: event.columnId,
        columnId: event.columnId,
        ownerId: event.ownerId,
        sourceOwnerId: event.sourceOwnerId ?? event.ownerId,
        sourceSkillName: event.sourceSkillName ?? event.name,
        maxStacks: MAX_INFLICTION_STACKS,
        durationFrames: event.activationDuration,
        operatorSlotId: event.ownerId,
      });
      continue;
    }

    // Skill events: scan frame markers
    if (!event.segments || event.ownerId === ENEMY_OWNER_ID) continue;

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
            if (columnId && columnId !== event.comboTriggerColumnId) {
              entries.push({
                frame: absFrame,
                priority: PRIORITY.INFLICTION_CREATE,
                type: 'INFLICTION_CREATE',
                id: `${event.id}-inflict-${si}-${fi}`,
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
        }
      }
      cumulativeOffset += seg.durationFrames;
    }

    // Combo events: inflictions matching trigger source at each tick
    if (event.comboTriggerColumnId && event.segments) {
      const triggerCol = event.comboTriggerColumnId;
      const isArts = INFLICTION_COLUMN_IDS.has(triggerCol);
      const isPhysical = PHYSICAL_INFLICTION_COLUMN_IDS.has(triggerCol);
      if (isArts || isPhysical) {
        const fStopsCombo = foreignStopsFor(event, stops);
        let cumOffset = 0;
        for (let si = 0; si < event.segments.length; si++) {
          const seg = event.segments[si];
          if (seg.frames) {
            for (let fi = 0; fi < seg.frames.length; fi++) {
              const frame = seg.frames[fi];
              const absFrame = absoluteFrame(event.startFrame, cumOffset, frame.offsetFrame, fStopsCombo);
              entries.push({
                frame: absFrame,
                priority: PRIORITY.INFLICTION_CREATE,
                type: 'INFLICTION_CREATE',
                id: `${event.id}-combo-${isArts ? 'inflict' : 'phys'}-${si}-${fi}`,
                statusName: triggerCol,
                columnId: triggerCol,
                ownerId: ENEMY_OWNER_ID,
                sourceOwnerId: event.ownerId,
                sourceSkillName: event.name,
                maxStacks: MAX_INFLICTION_STACKS,
                durationFrames: isArts ? INFLICTION_DURATION : PHYSICAL_INFLICTION_DURATION,
                operatorSlotId: event.ownerId,
              });
            }
          }
          cumOffset += seg.durationFrames;
        }
      }
    }
  }

  return entries;
}

/**
 * Collect FRAME_EFFECT entries for freeform-placed reaction events.
 * Same pattern as freeform inflictions: raw events stay in `state` for undo/drag,
 * queue entries create derived copies that go through createReaction (merge logic).
 */
function collectFreeformReactionEntries(
  events: TimelineEvent[],
  freeformReactionIds: Set<string>,
): QueueFrame[] {
  const entries: QueueFrame[] = [];
  for (const ev of events) {
    if (ev.ownerId !== ENEMY_OWNER_ID) continue;
    if (!REACTION_COLUMN_IDS.has(ev.columnId)) continue;
    if (ev.sourceOwnerId !== USER_ID) continue;
    freeformReactionIds.add(ev.id);
    entries.push({
      frame: ev.startFrame,
      priority: PRIORITY.FRAME_EFFECT,
      type: 'FRAME_EFFECT',
      statusName: ev.columnId,
      columnId: ev.columnId,
      ownerId: ev.ownerId,
      sourceOwnerId: ev.sourceOwnerId,
      sourceSkillName: ev.sourceSkillName ?? ev.name,
      maxStacks: 0,
      durationFrames: ev.activationDuration,
      operatorSlotId: ev.ownerId,
      derivedEvent: {
        ...ev,
        segments: undefined, // let createReaction build fresh segments
      },
    });
  }
  return entries;
}

// ── Status consumption collection ───────────────────────────────────────────

/** Scan events for consumeStatus frame markers targeting exchange/operator statuses. */
function collectConsumeEntries(
  events: TimelineEvent[],
  contexts: ExchangeStatusQueueContext[],
  stops: readonly TimeStopRegion[],
): QueueFrame[] {
  const entries: QueueFrame[] = [];

  for (const event of events) {
    if (!event.segments || event.ownerId === ENEMY_OWNER_ID || event.ownerId === COMMON_OWNER_ID) continue;

    const fStops = foreignStopsFor(event, stops);
    let cumulativeOffset = 0;
    for (let si = 0; si < event.segments.length; si++) {
      const seg = event.segments[si];
      if (seg.frames) {
        for (let fi = 0; fi < seg.frames.length; fi++) {
          const frame = seg.frames[fi];
          if (!frame.consumeStatus) continue;

          const exchInfo = getExchangeStatusConfig()[frame.consumeStatus];
          if (exchInfo) {
            const ctx = contexts.find(c => c.columnId === exchInfo.columnId && c.ownerId === event.ownerId);
            if (ctx) {
              entries.push({
                frame: absoluteFrame(event.startFrame, cumulativeOffset, frame.offsetFrame, fStops),
                priority: PRIORITY.CONSUME,
                type: 'CONSUME',
                statusName: frame.consumeStatus,
                columnId: exchInfo.columnId,
                ownerId: ctx.ownerId,
                sourceOwnerId: event.ownerId,
                sourceSkillName: event.name,
                maxStacks: ctx.maxStacks,
                durationFrames: ctx.durationFrames,
                operatorSlotId: ctx.operatorSlotId,
              });
              continue;
            }
          }

          const config = getConsumeStatusConfig()[frame.consumeStatus];
          if (config && !exchInfo) {
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
      cumulativeOffset += seg.durationFrames;
    }
  }

  return entries;
}

// ── Final Strike absorption ─────────────────────────────────────────────────

/** Collect ABSORPTION_CHECK entries from basic attacks with Final Strike frames. */
function collectFinalStrikeEntries(
  events: TimelineEvent[],
  stops: readonly TimeStopRegion[],
): QueueFrame[] {
  const entries: QueueFrame[] = [];

  for (const event of events) {
    if (event.ownerId === ENEMY_OWNER_ID || event.ownerId === COMMON_OWNER_ID) continue;
    if (event.columnId !== SKILL_COLUMNS.BASIC) continue;
    if (event.name === CombatSkillsType.FINISHER || event.name === CombatSkillsType.DIVE) continue;

    const fStops = foreignStopsFor(event, stops);
    const triggerFrame = getFinalStrikeTriggerFrame(event, fStops);
    if (triggerFrame == null) continue;

    entries.push({
      frame: triggerFrame,
      priority: PRIORITY.ABSORPTION_CHECK,
      type: 'ABSORPTION_CHECK',
      statusName: 'FINAL_STRIKE',
      columnId: '',
      ownerId: event.ownerId,
      sourceOwnerId: event.ownerId,
      sourceSkillName: event.name,
      maxStacks: 0,
      durationFrames: 0,
      operatorSlotId: event.ownerId,
    });
  }

  return entries;
}

// ── Absorption frame markers ────────────────────────────────────────────────

/** Collect absorption (absorbArtsInfliction) and infliction consumption (consumeArtsInfliction) entries. */
function collectAbsorptionFrameEntries(
  events: TimelineEvent[],
  stops: readonly TimeStopRegion[],
): QueueFrame[] {
  const entries: QueueFrame[] = [];

  for (const event of events) {
    if (!event.segments || event.ownerId === ENEMY_OWNER_ID) continue;

    const fStops = foreignStopsFor(event, stops);
    let cumulativeOffset = 0;
    for (let si = 0; si < event.segments.length; si++) {
      const seg = event.segments[si];
      if (seg.frames) {
        for (let fi = 0; fi < seg.frames.length; fi++) {
          const frame = seg.frames[fi];
          const absFrame = absoluteFrame(event.startFrame, cumulativeOffset, frame.offsetFrame, fStops);

          if (frame.absorbArtsInfliction) {
            const marker = frame.absorbArtsInfliction;
            const inflictionColumnId = ELEMENT_TO_INFLICTION_COLUMN[marker.element];
            const absExchInfo = getExchangeStatusConfig()[marker.exchangeStatus];
            if (inflictionColumnId && absExchInfo) {
              entries.push({
                frame: absFrame,
                priority: PRIORITY.ABSORPTION_CHECK,
                type: 'ABSORPTION_CHECK',
                statusName: marker.exchangeStatus,
                columnId: absExchInfo.columnId,
                ownerId: event.ownerId,
                sourceOwnerId: event.ownerId,
                sourceSkillName: event.name,
                maxStacks: marker.stacks,
                durationFrames: EXCHANGE_EVENT_DURATION,
                operatorSlotId: event.ownerId,
                absorptionMarker: {
                  inflictionColumnId,
                  exchangeStatus: marker.exchangeStatus,
                  exchangeColumnId: absExchInfo.columnId,
                  maxAbsorb: marker.stacks,
                  eventId: event.id,
                  segmentIndex: si,
                  frameIndex: fi,
                },
              });
            }
          }

          if (frame.consumeArtsInfliction) {
            const inflictionColumnId = ELEMENT_TO_INFLICTION_COLUMN[frame.consumeArtsInfliction.element];
            if (inflictionColumnId) {
              entries.push({
                frame: absFrame,
                priority: PRIORITY.CONSUME,
                type: 'CONSUME',
                statusName: inflictionColumnId,
                columnId: inflictionColumnId,
                ownerId: ENEMY_OWNER_ID,
                sourceOwnerId: event.ownerId,
                sourceSkillName: event.name,
                maxStacks: 0,
                durationFrames: 0,
                operatorSlotId: event.ownerId,
                maxConsume: frame.consumeArtsInfliction.stacks,
              });
            }
          }
        }
      }
      cumulativeOffset += seg.durationFrames;
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
    if (!event.segments || event.ownerId === ENEMY_OWNER_ID) continue;
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
      cumOffset += seg.durationFrames;
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

// ── Main orchestrator ───────────────────────────────────────────────────────

export function processEventQueue(
  rawEvents: TimelineEvent[],
  loadoutProperties?: Record<string, LoadoutProperties>,
  slotWeapons?: Record<string, string | undefined>,
  slotWirings?: SlotTriggerWiring[],
  slotOperatorMap?: Record<string, string>,
  slotGearSets?: Record<string, string | undefined>,
): TimelineEvent[] {
  // ── Phase 1: Register events (inline combo chaining + stop discovery) ────
  const state = new DerivedEventController();
  state.registerEvents(rawEvents);
  state.extendAll();

  // ── Phase 2: Resolve combo trigger columns + potential effects ────────────
  if (slotWirings && slotWirings.length > 0) {
    state.resolveComboTriggers(slotWirings);
  }
  state.applyPotentialEffects();

  // ── Phase 3: SP recovery + talent events ─────────────────────────────────
  // deriveSPRecovery returns [...events, ...derived]; extract only the new events
  const withSPRecovery = deriveSPRecovery(state.getRegisteredEvents(), state.getStops());
  const spEvents = withSPRecovery.slice(state.getRegisteredEvents().length);
  state.registerEvents(spEvents);

  const { entries: engineEntries, talentEvents } = collectEngineTriggerEntries(
    state.getRegisteredEvents(), loadoutProperties, slotOperatorMap, slotWeapons, slotGearSets,
    getExchangeStatusIds(),
  );
  state.registerEvents(talentEvents);
  state.extendAll();

  // ── Phase 5: Collect queue contexts ──────────────────────────────────────
  const extLate = state.getRegisteredEvents();
  const stops = state.getStops();

  const exchangeContexts = collectExchangeStatusTriggers(
    extLate, getExchangeStatusIds(), loadoutProperties, slotOperatorMap,
  );
  const absorptionContexts = collectAbsorptionContexts(
    extLate, loadoutProperties, slotOperatorMap,
  );

  // ── Phase 6: Seed and run the priority queue ─────────────────────────────
  const queue = new PriorityQueue<QueueFrame>((a, b) =>
    a.frame !== b.frame ? a.frame - b.frame : a.priority - b.priority
  );
  const seed = (entries: QueueFrame[]) => { for (const e of entries) queue.insert(e); };

  // Collect freeform events (inflictions + reactions). Their IDs are tracked so
  // they can be excluded from the queue controller's base events (the raw events
  // stay in `state` for undo/drag) and re-derived via the queue.
  const freeformInflictionIds = new Set<string>();
  const freeformReactionIds = new Set<string>();
  seed(collectInflictionEntries(extLate, stops, freeformInflictionIds));
  seed(collectFreeformReactionEntries(extLate, freeformReactionIds));

  const freeformIds = new Set([...Array.from(freeformInflictionIds), ...Array.from(freeformReactionIds)]);
  const queueBaseEvents = freeformIds.size > 0
    ? extLate.filter(ev => !freeformIds.has(ev.id))
    : extLate;
  const queueState = new DerivedEventController(queueBaseEvents);
  const interpretor = new EventInterpretor(queueState, extLate, {
    exchangeContexts, absorptionContexts, loadoutProperties, slotOperatorMap, slotWirings,
  });

  seed(collectFrameEffectEntries(extLate, loadoutProperties, stops));
  for (const ev of extLate) {
    if (ev.columnId === SKILL_COLUMNS.COMBO && !ev.comboTriggerColumnId && ev.segments) {
      seed([{
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
      }]);
    }
  }
  seed(collectFinalStrikeEntries(extLate, stops));
  seed(collectAbsorptionFrameEntries(extLate, stops));
  seed(collectConsumeReactionEntries(extLate, stops));
  seed(collectCryoConsumptionEntries(extLate, loadoutProperties));
  seed(collectConsumeEntries(extLate, exchangeContexts, stops));
  for (const ctx of exchangeContexts) {
    for (const trigger of ctx.triggers) {
      queue.insert({
        frame: trigger.frame,
        priority: PRIORITY.EXCHANGE_CREATE,
        type: 'EXCHANGE_CREATE',
        statusName: ctx.statusName,
        columnId: ctx.columnId,
        ownerId: ctx.ownerId,
        sourceOwnerId: trigger.sourceOwnerId,
        sourceSkillName: trigger.sourceSkillName,
        maxStacks: ctx.maxStacks,
        durationFrames: ctx.durationFrames,
        operatorSlotId: ctx.operatorSlotId,
      });
    }
  }
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

  // Run the queue
  while (queue.size > 0) {
    const entry = queue.extractMin()!;
    const newEntries = interpretor.processQueueFrame(entry);
    for (const e of newEntries) queue.insert(e);
  }

  const queueEvents = interpretor.controller.output;
  state.markExtended(queueEvents.map(ev => ev.id));

  // ── Phase 7: Derive combo activation windows ────────────────────────────
  const allEvents = [...extLate, ...queueEvents];
  const comboWindows = slotWirings && slotWirings.length > 0
    ? deriveComboActivationWindows(allEvents, slotWirings, stops)
    : [];

  // Propagate queue-side mutations back to state. The queue controller operates on
  // copies of registered events — any clamps (consumption, refresh, merge) happen there
  // and need to be reflected in state. Freeform inflictions are replaced with their
  // derived copies. Other events get status + segment updates if they were clamped.
  // Never mutate the originals — they belong to the undo history.
  const queueRegistered = interpretor.controller.getRegisteredEvents();
  const queueById = new Map<string, TimelineEvent>();
  for (const ev of queueRegistered) {
    if (ev.eventStatus) queueById.set(ev.id, ev);
  }
  for (const ev of queueEvents) {
    if (freeformIds.has(ev.id)) queueById.set(ev.id, ev);
  }
  if (queueById.size > 0) {
    state.replaceEvents(state.getRegisteredEvents().map(ev =>
      queueById.get(ev.id) ?? ev
    ));
  }
  const queueEventsToRegister = queueEvents.filter(ev => !freeformIds.has(ev.id));
  state.registerEvents([...queueEventsToRegister, ...comboWindows]);

  // ── Phase 8: Resolve frame positions & validate ─────────────────────────
  state.cacheFramePositions();
  state.validateAll();

  lastController = state;
  return state.getRegisteredEvents();
}
