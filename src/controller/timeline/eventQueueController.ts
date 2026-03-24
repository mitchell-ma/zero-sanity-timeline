/**
 * InputEventController — unified pipeline orchestrator for the event queue.
 *
 * Receives raw user-placed events, extracts frame markers, seeds the queue,
 * and runs the EventInterpretorController to produce all derived events.
 *
 * ALL game mechanics processing — time-stop resolution, infliction derivation,
 * exchange statuses, combo windows, frame positions, validation — happens here.
 */
import { TimelineEvent, eventDuration } from '../../consts/viewTypes';
import { LoadoutProperties } from '../../view/InformationPane';
import { TimeStopRegion, absoluteFrame, foreignStopsFor } from './processTimeStop';
import { DerivedEventController } from './derivedEventController';
import { deriveComboActivationWindows } from './processComboSkill';
import type { SlotTriggerWiring } from './eventQueueTypes';
import { SkillPointController } from '../slot/skillPointController';
import { PRIORITY, MAX_INFLICTION_STACKS } from './eventQueueTypes';
import type { QueueFrame } from './eventQueueTypes';
import { EventInterpretorController } from './eventInterpretorController';
import { PriorityQueue } from './priorityQueue';
import { TriggerIndex } from './triggerIndex';
import { ENEMY_OWNER_ID, INFLICTION_COLUMN_IDS, REACTION_COLUMN_IDS, SKILL_COLUMNS } from '../../model/channels';
import { getAllTriggerAssociations } from '../gameDataStore';
import { classifyEvents } from './inputEventController';
import { initHpTracker, getEnemyHpPercentage, precomputeDamageByFrame } from '../calculation/calculationController';
import type { HPController } from '../calculation/hpController';
import type { OperatorLoadoutState } from '../../view/OperatorLoadoutHeader';
import { resolveControlledOperator } from './controlledOperatorResolver';

// ── Unified frame collection ────────────────────────────────────────────────

/**
 * Collect one PROCESS_FRAME entry per frame marker on input skill events.
 * Each entry carries the full EventFrameMarker + parent event context.
 * The interpreter processes all effects sequentially in config order.
 */
function collectFrameEntries(
  events: readonly TimelineEvent[],
  stops: readonly TimeStopRegion[],
): QueueFrame[] {
  const entries: QueueFrame[] = [];

  for (const event of events) {
    if (event.ownerId === ENEMY_OWNER_ID) continue;

    // Seed an event-start entry at the event's start frame (no frame marker)
    // for event-level hooks: Link consumption, generic PERFORM triggers
    entries.push({
      frame: event.startFrame,
      priority: PRIORITY.PROCESS_FRAME,
      type: 'PROCESS_FRAME',
      statusName: event.name,
      columnId: event.columnId,
      ownerId: event.ownerId,
      sourceOwnerId: event.ownerId,
      sourceSkillName: event.name,
      maxStacks: 0,
      durationFrames: 0,
      operatorSlotId: event.ownerId,
      sourceEvent: event,
      segmentIndex: -1,
      frameIndex: -1,
    });

    const fStops = foreignStopsFor(event, stops);
    let cumulativeOffset = 0;
    for (let si = 0; si < event.segments.length; si++) {
      const seg = event.segments[si];
      if (seg.frames) {
        for (let fi = 0; fi < seg.frames.length; fi++) {
          const frame = seg.frames[fi];
          const absFrame = absoluteFrame(event.startFrame, cumulativeOffset, frame.offsetFrame, fStops);

          entries.push({
            frame: absFrame,
            priority: PRIORITY.PROCESS_FRAME,
            type: 'PROCESS_FRAME',
            statusName: event.name,
            columnId: event.columnId,
            ownerId: event.ownerId,
            sourceOwnerId: event.ownerId,
            sourceSkillName: event.name,
            maxStacks: 0,
            durationFrames: 0,
            operatorSlotId: event.ownerId,
            frameMarker: frame,
            sourceEvent: event,
            segmentIndex: si,
            frameIndex: fi,
          });
        }
      }
      cumulativeOffset += seg.properties.duration;
    }

    // Seed COMBO_RESOLVE for combo events (fires after engine triggers)
    if (event.columnId === SKILL_COLUMNS.COMBO && !event.comboTriggerColumnId) {
      entries.push({
        frame: event.startFrame,
        priority: PRIORITY.COMBO_RESOLVE,
        type: 'COMBO_RESOLVE',
        statusName: event.name,
        columnId: event.columnId,
        ownerId: event.ownerId,
        sourceOwnerId: event.ownerId,
        sourceSkillName: event.name,
        maxStacks: 0,
        durationFrames: 0,
        operatorSlotId: event.ownerId,
        comboResolveEvent: event,
      });
    }
  }

  return entries;
}


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

  // Build trigger index from configs (config scan, not event scan)
  const triggerIdx = TriggerIndex.build(slotOperatorMap, loadoutProperties, slotWeapons, slotGearSets, registeredEvents);

  // Register talent events (permanent presence) before queue processing
  const talentEvents = triggerIdx.getAllTalentEvents();
  if (talentEvents.length > 0) state.registerEvents(talentEvents);

  // ── Seed priority queue ───────────────────────────────────────────────────
  const queue = new PriorityQueue<QueueFrame>((a, b) =>
    a.frame !== b.frame ? a.frame - b.frame : a.priority - b.priority
  );
  const seed = (entries: QueueFrame[]) => { for (const e of entries) queue.insert(e); };

  // Create interpreter backed by the single DEC
  const interpretor = new EventInterpretorController(state, registeredEvents, {
    loadoutProperties, slotOperatorMap, slotWirings, getEnemyHpPercentage,
    getControlledSlotAtFrame, triggerIndex: triggerIdx,
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

  // Seed one PROCESS_FRAME entry per frame marker — all effects processed sequentially
  const frameEntries = collectFrameEntries(registeredEvents, stops);
  seed(frameEntries);

  // Seed reactive triggers for freeform enemy events (reactions/inflictions/statuses
  // placed directly on the timeline — no frame markers, not handled by PROCESS_FRAME)
  const triggerSeen = new Set<string>();
  for (const ev of registeredEvents) {
    if (ev.ownerId !== ENEMY_OWNER_ID) continue;
    for (const entry of triggerIdx.matchEvent(ev.columnId)) {
      if (entry.primaryVerb === 'PERFORM') continue; // PERFORM handled by PROCESS_FRAME
      const dedupKey = `${entry.def.properties.id}:${entry.operatorSlotId}:${ev.startFrame}`;
      if (triggerSeen.has(dedupKey)) continue;
      triggerSeen.add(dedupKey);
      // Target filtering for APPLY triggers
      const toTarget = entry.primaryCondition.to as string | undefined;
      if (toTarget === 'OPERATOR' && ev.ownerId === ENEMY_OWNER_ID) continue;
      if (toTarget === 'ENEMY' && ev.ownerId !== ENEMY_OWNER_ID) continue;
      const triggerCtx: import('./statusTriggerCollector').EngineTriggerContext = {
        def: entry.def, operatorId: entry.operatorId,
        operatorSlotId: entry.operatorSlotId, potential: entry.potential,
        operatorSlotMap: entry.operatorSlotMap, loadoutProperties: entry.loadoutProperties,
        haveConditions: entry.haveConditions, triggerEffects: entry.triggerEffects,
      };
      queue.insert({
        frame: ev.startFrame, priority: PRIORITY.ENGINE_TRIGGER, type: 'ENGINE_TRIGGER',
        statusName: entry.def.properties.id, columnId: '', ownerId: entry.operatorSlotId,
        sourceOwnerId: ev.ownerId, sourceSkillName: ev.name,
        maxStacks: 0, durationFrames: 0, operatorSlotId: entry.operatorSlotId,
        engineTrigger: { frame: ev.startFrame, sourceOwnerId: ev.ownerId, sourceSkillName: ev.name, ctx: triggerCtx, isEquip: entry.isEquip },
      });
    }
  }

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
  state.markExtended(comboWindows.map(ev => ev.uid));
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
 * 4. EventQueueController.runEventQueue → builds trigger index, seeds derived + talents, runs interpreter
 * 5. DerivedEventController.getProcessedEvents → final output
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
  /** HP controller for operator/enemy HP tracking. */
  hpController?: HPController,
  /** All slots' SP costs for insufficiency zone computation. */
  allSlotSpCosts?: ReadonlyMap<string, number>,
): TimelineEvent[] {
  // ── 0. Initialize HP tracker for live HP% queries during queue processing ─
  if (hpController) {
    hpController.initEnemyHp(bossMaxHp ?? null);
  } else {
    initHpTracker(bossMaxHp ?? null);
  }

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

  // Talent events are now registered inside runEventQueue via the trigger index.

  // ── 3b. Pre-compute damage by frame for HP threshold predicates ───────────
  if (bossMaxHp != null && enemyId && slotOperatorMap && loadoutProperties) {
    const slotInfo = Object.entries(slotOperatorMap).map(([slotId, opId]) => ({ slotId, operatorId: opId }));
    precomputeDamageByFrame(state.getRegisteredEvents(), slotInfo, loadoutProperties, loadouts, enemyId, hpController);
  }

  // ── 3c. Resolve controlled operator ──────────────────────────────────────
  const getControlledSlotAtFrame = resolveControlledOperator(
    state.getRegisteredEvents(), slotIds,
  );

  // ── 4. EventQueueController: seed derived + run queue ─────────────────────
  const hpPercentageFn = hpController
    ? hpController.getEnemyHpPercentage
    : (bossMaxHp != null ? getEnemyHpPercentage : undefined);
  runEventQueue(state, derivedEvents, loadoutProperties, slotWeapons, slotOperatorMap, slotGearSets,
    hpPercentageFn, getControlledSlotAtFrame);

  // ── 5. Finalize resource controllers ──────────────────────────────────────
  if (spController) {
    if (allSlotSpCosts) spController.seedSlotCosts(allSlotSpCosts);
    spController.finalize(state.getStops());
  }
  if (ueController) {
    const gainFrames = spController ? new Map(spController.getBattleSkillGainFrames()) : new Map<string, { frame: number; slotId: string }>();
    ueController.finalize(gainFrames);
  }
  if (hpController) {
    hpController.finalize();
  }

  // ── 6. Output ─────────────────────────────────────────────────────────────
  _lastController = state;
  return state.getProcessedEvents();
}
