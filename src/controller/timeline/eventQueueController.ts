/**
 * InputEventController — unified pipeline orchestrator for the event queue.
 *
 * Receives raw user-placed events, extracts frame markers, seeds the queue,
 * and runs the EventInterpretorController to produce all derived events.
 *
 * ALL game mechanics processing — time-stop resolution, infliction derivation,
 * exchange statuses, combo windows, frame positions, validation — happens here.
 */
import { TimelineEvent, activeEndFrame } from '../../consts/viewTypes';
import { NounType, VerbType } from '../../dsl/semantics';
import type { Effect } from '../../dsl/semantics';
import { LoadoutProperties } from '../../view/InformationPane';
import { TimeStopRegion, absoluteFrame, foreignStopsFor } from './processTimeStop';
import { DerivedEventController } from './derivedEventController';
import { deriveComboActivationWindows } from './processComboSkill';
import type { SlotTriggerWiring } from './eventQueueTypes';
import { SkillPointController } from '../slot/skillPointController';
import { PRIORITY, QueueFrameType, FrameHookType } from './eventQueueTypes';
import type { QueueFrame } from './eventQueueTypes';
import { EventInterpretorController, clearStatusDefCache } from './eventInterpretorController';
import { PriorityQueue } from './priorityQueue';
import { TriggerIndex } from './triggerIndex';
import { SKILL_COLUMN_ORDER, ENEMY_OWNER_ID, ENEMY_ACTION_COLUMN_ID } from '../../model/channels';
import type { SkillType } from '../../consts/viewTypes';
import { getAllTriggerAssociations } from '../gameDataStore';
import { cloneAndSplitEvents } from './inputEventController';
import { initHpTracker, getEnemyHpPercentage, precomputeDamageByFrame } from '../calculation/calculationController';
import type { HPController } from '../calculation/hpController';
import { StatAccumulator } from '../calculation/statAccumulator';
import type { OverrideStore } from '../../consts/overrideTypes';
import { buildOverrideKey } from '../overrideController';
import { CritMode, InteractionModeType, StatType } from '../../consts/enums';
import type { OperatorLoadoutState } from '../../view/OperatorLoadoutHeader';
import type { EnemyStats } from '../appStateController';
import { resolveControlledOperator } from './controlledOperatorResolver';
import { allocQueueFrame, resetPools } from './objectPool';

const SKILL_COLUMN_SET: ReadonlySet<string> = new Set(SKILL_COLUMN_ORDER);

/** Resource columns that should not generate synthetic PROCESS_FRAME entries. */
let _resourceColumnSet: ReadonlySet<string> | null = null;
function getResourceColumnSet(): ReadonlySet<string> {
  if (!_resourceColumnSet) {
    // Lazy init to avoid circular dependency with commonSlotController
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { COMMON_COLUMN_IDS } = require('../slot/commonSlotController');
    _resourceColumnSet = new Set(Object.values(COMMON_COLUMN_IDS) as string[]);
  }
  return _resourceColumnSet;
}

// TriggerIndex is now built and cached by CombatLoadoutController.syncSlots().
// It is passed into the pipeline via the triggerIndex parameter.

// ── Unified frame collection ────────────────────────────────────────────────

/**
 * Collect one PROCESS_FRAME entry per frame marker on input skill events.
 * Uses a pre-allocated object pool to avoid per-frame allocation on drag ticks.
 */
function collectFrameEntries(
  events: readonly TimelineEvent[],
  stops: readonly TimeStopRegion[],
): QueueFrame[] {
  const entries: QueueFrame[] = [];

  for (const event of events) {
    // Seed an event-start entry at the event's start frame
    const start = allocQueueFrame();
    start.frame = event.startFrame;
    start.priority = PRIORITY.PROCESS_FRAME;
    start.type = QueueFrameType.PROCESS_FRAME;
    start.hookType = FrameHookType.EVENT_START;
    start.statusId = event.id;
    start.columnId = event.columnId;
    start.ownerId = event.ownerId;
    start.sourceOwnerId = event.ownerId;
    start.sourceSkillName = event.id;
    start.maxStacks = 0;
    start.durationFrames = 0;
    start.operatorSlotId = event.ownerId;
    start.sourceEvent = event;
    start.segmentIndex = -1;
    start.frameIndex = -1;
    entries.push(start);

    const fStops = foreignStopsFor(event, stops);
    let cumulativeOffset = 0;
    let hasFrames = false;
    for (let si = 0; si < event.segments.length; si++) {
      const seg = event.segments[si];

      // SEGMENT_START lifecycle hook
      const segStartFrame = absoluteFrame(event.startFrame, cumulativeOffset, 0, fStops);
      const segStart = allocQueueFrame();
      segStart.frame = segStartFrame;
      segStart.priority = PRIORITY.PROCESS_FRAME;
      segStart.type = QueueFrameType.PROCESS_FRAME;
      segStart.hookType = FrameHookType.SEGMENT_START;
      segStart.statusId = event.id;
      segStart.columnId = event.columnId;
      segStart.ownerId = event.ownerId;
      segStart.sourceOwnerId = event.ownerId;
      segStart.sourceSkillName = event.id;
      segStart.maxStacks = 0;
      segStart.durationFrames = 0;
      segStart.operatorSlotId = event.ownerId;
      segStart.sourceEvent = event;
      segStart.segmentIndex = si;
      segStart.frameIndex = -1;
      entries.push(segStart);

      if (seg.frames && seg.frames.length > 0) {
        hasFrames = true;
        for (let fi = 0; fi < seg.frames.length; fi++) {
          const frame = seg.frames[fi];
          const absFrame = absoluteFrame(event.startFrame, cumulativeOffset, frame.offsetFrame, fStops);

          const qf = allocQueueFrame();
          qf.frame = absFrame;
          qf.priority = PRIORITY.PROCESS_FRAME;
          qf.type = QueueFrameType.PROCESS_FRAME;
          qf.statusId = event.id;
          qf.columnId = event.columnId;
          qf.ownerId = event.ownerId;
          qf.sourceOwnerId = event.ownerId;
          qf.sourceSkillName = event.id;
          qf.maxStacks = 0;
          qf.durationFrames = 0;
          qf.operatorSlotId = event.ownerId;
          qf.frameMarker = frame;
          qf.sourceEvent = event;
          qf.segmentIndex = si;
          qf.frameIndex = fi;
          entries.push(qf);
        }
      }
      cumulativeOffset += seg.properties.duration;

      // SEGMENT_END lifecycle hook
      const segEndFrame = absoluteFrame(event.startFrame, cumulativeOffset, 0, fStops);
      if (segEndFrame > segStartFrame) {
        const segEnd = allocQueueFrame();
        segEnd.frame = segEndFrame;
        segEnd.priority = PRIORITY.PROCESS_FRAME;
        segEnd.type = QueueFrameType.PROCESS_FRAME;
        segEnd.hookType = FrameHookType.SEGMENT_END;
        segEnd.statusId = event.id;
        segEnd.columnId = event.columnId;
        segEnd.ownerId = event.ownerId;
        segEnd.sourceOwnerId = event.ownerId;
        segEnd.sourceSkillName = event.id;
        segEnd.maxStacks = 0;
        segEnd.durationFrames = 0;
        segEnd.operatorSlotId = event.ownerId;
        segEnd.sourceEvent = event;
        segEnd.segmentIndex = si;
        segEnd.frameIndex = -1;
        entries.push(segEnd);
      }
    }

    // Synthesize a frame entry for non-skill events with no frame markers.
    // This routes freeform inflictions, reactions, and statuses through the same
    // PROCESS_FRAME → interpret path as engine-created events.
    if (!hasFrames && !SKILL_COLUMN_SET.has(event.columnId as SkillType) && !getResourceColumnSet().has(event.columnId)) {
      const synth = allocQueueFrame();
      synth.frame = event.startFrame;
      synth.priority = PRIORITY.PROCESS_FRAME;
      synth.type = QueueFrameType.PROCESS_FRAME;
      synth.statusId = event.id;
      synth.columnId = event.columnId;
      synth.ownerId = event.ownerId;
      synth.sourceOwnerId = event.ownerId;
      synth.sourceSkillName = event.id;
      synth.maxStacks = 0;
      synth.durationFrames = 0;
      synth.operatorSlotId = event.ownerId;
      synth.frameMarker = { offsetFrame: 0 };
      synth.sourceEvent = event;
      synth.segmentIndex = 0;
      synth.frameIndex = 0;
      entries.push(synth);
    }

    // Seed an event-end entry at the active end frame (before cooldown segments)
    const endFrame = activeEndFrame(event);
    if (endFrame > event.startFrame) {
      const end = allocQueueFrame();
      end.frame = endFrame;
      end.priority = PRIORITY.PROCESS_FRAME;
      end.type = QueueFrameType.PROCESS_FRAME;
      end.hookType = FrameHookType.EVENT_END;
      end.statusId = event.id;
      end.columnId = event.columnId;
      end.ownerId = event.ownerId;
      end.sourceOwnerId = event.ownerId;
      end.sourceSkillName = event.id;
      end.maxStacks = 0;
      end.durationFrames = 0;
      end.operatorSlotId = event.ownerId;
      end.sourceEvent = event;
      end.segmentIndex = -1;
      end.frameIndex = -1;
      entries.push(end);
    }

    // Seed COMBO_RESOLVE for combo events (fires after engine triggers)
    if (event.columnId === NounType.COMBO_SKILL && !event.comboTriggerColumnId) {
      const combo = allocQueueFrame();
      combo.frame = event.startFrame;
      combo.priority = PRIORITY.COMBO_RESOLVE;
      combo.type = QueueFrameType.COMBO_RESOLVE;
      combo.statusId = event.id;
      combo.columnId = event.columnId;
      combo.ownerId = event.ownerId;
      combo.sourceOwnerId = event.ownerId;
      combo.sourceSkillName = event.id;
      combo.maxStacks = 0;
      combo.durationFrames = 0;
      combo.operatorSlotId = event.ownerId;
      combo.comboResolveEvent = event;
      entries.push(combo);
    }
  }

  return entries;
}


// ── Reusable singletons for pipeline runs ────────────────────────────────
// These are lazily created on first use to avoid circular dependency issues
// at module initialization time. Once created, they are reused across ticks.

let _queue: PriorityQueue<QueueFrame> | null = null;
let _interpretor: EventInterpretorController | null = null;

function getQueue(): PriorityQueue<QueueFrame> {
  if (!_queue) _queue = new PriorityQueue<QueueFrame>((a, b) => a.frame !== b.frame ? a.frame - b.frame : a.priority - b.priority);
  return _queue;
}

function getInterpretor(): EventInterpretorController {
  if (!_interpretor) _interpretor = new EventInterpretorController();
  return _interpretor;
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
  derivedEvents: readonly TimelineEvent[],
  loadoutProperties?: Record<string, LoadoutProperties>,
  slotWeapons?: Record<string, string | undefined>,
  slotOperatorMap?: Record<string, string>,
  slotGearSets?: Record<string, string | undefined>,
  getEnemyHpPercentage?: (frame: number) => number | null,
  getControlledSlotAtFrame?: (frame: number) => string,
  hpController?: HPController,
  shieldController?: import('../calculation/shieldController').ShieldController,
  /** Pre-built TriggerIndex from CombatLoadoutController. Falls back to ad-hoc build if not provided. */
  triggerIndex?: TriggerIndex,
  statAccumulator?: StatAccumulator,
  critMode?: CritMode,
  overrides?: OverrideStore,
): void {
  const slotWirings = state.getSlotWirings();
  const registeredEvents = state.getRegisteredEvents();
  const stops = state.getStops();

  // Use pre-built trigger index from CombatLoadoutController, or build ad-hoc as fallback
  const triggerIdx = triggerIndex ?? TriggerIndex.build(slotOperatorMap, loadoutProperties, slotWeapons, slotGearSets, registeredEvents);
  _lastTriggerIndex = triggerIdx;

  // Register talent events (permanent presence) before queue processing.
  // Dedup against already-registered events AND already-registered in this run
  // (strict mode double-invocation can re-register same TriggerIndex talent objects).
  const talentEvents = triggerIdx.getAllTalentEvents();
  const allRegistered = state.getRegisteredEvents();
  const newTalents = talentEvents.filter(t =>
    !allRegistered.some(ev => ev.columnId === t.columnId && ev.ownerId === t.ownerId)
  );
  if (newTalents.length > 0) state.registerEvents(newTalents);

  // ── Seed priority queue (reuse singleton) ──────────────────────────────
  const queue = getQueue();
  queue.clear();

  // Reset interpreter (reuse singleton)
  const interpretor = getInterpretor();
  interpretor.resetWith(state, registeredEvents, {
    loadoutProperties, slotOperatorMap, slotWirings, getEnemyHpPercentage,
    getControlledSlotAtFrame, triggerIndex: triggerIdx, hpController, shieldController,
    statAccumulator, critMode, overrides,
  });

  // Interpret APPLY STAT effects from passive talent clauses (e.g. Gilberta Messenger's Song UE efficiency)
  if (slotOperatorMap) {
    for (const slotId of Object.keys(slotOperatorMap)) {
      for (const talent of triggerIdx.getTalents(slotId)) {
        if (!talent.def.clause?.length) continue;
        for (const clause of talent.def.clause as unknown as { conditions?: unknown[]; effects?: Record<string, unknown>[] }[]) {
          if (!clause.effects?.length) continue;
          for (const raw of clause.effects) {
            if (raw.verb !== VerbType.APPLY || raw.object !== NounType.STAT) continue;
            const effect = { ...raw, ofObject: raw.of ?? raw.ofObject, ofDeterminer: raw.ofDeterminer } as unknown as Effect;
            interpretor.interpret(effect, {
              frame: 0,
              sourceOwnerId: talent.operatorId,
              sourceSlotId: talent.operatorSlotId,
              sourceSkillName: talent.def.properties.id,
            });
          }
        }
      }
    }
  }

  // Seed one PROCESS_FRAME entry per frame marker — all events (registered + derived)
  const frameEntries = collectFrameEntries([...registeredEvents, ...derivedEvents], stops);
  for (const e of frameEntries) queue.insert(e);

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

  // Clamp combo cooldowns in multi-skill windows (after windows are registered)
  state.clampMultiSkillComboCooldowns();

  state.validateAll();

  // Apply crit pin overrides to all derived event frames
  if (overrides) {
    for (const ev of queueEvents) {
      const key = buildOverrideKey(ev);
      const evOverride = overrides[key];
      if (!evOverride?.segments) continue;
      for (let si = 0; si < ev.segments.length; si++) {
        const segOverride = evOverride.segments[si];
        if (!segOverride?.frames || !ev.segments[si].frames) continue;
        for (let fi = 0; fi < ev.segments[si].frames!.length; fi++) {
          const pin = segOverride.frames[fi]?.isCritical;
          if (pin != null) ev.segments[si].frames![fi].isCrit = pin;
        }
      }
    }
  }
}

// ── Pipeline entry point ─────────────────────────────────────────────────────

// Lazily created DerivedEventController singleton — reset() clears all state.
let _decSingleton: DerivedEventController | null = null;
let _lastController: DerivedEventController | null = null;
let _lastTriggerIndex: TriggerIndex | null = null;
let _statAccumulator: StatAccumulator | null = null;

/** Get the DerivedEventController from the most recent processCombatSimulation run. */
export function getLastController(): DerivedEventController {
  return _lastController!;
}

/** Get the TriggerIndex from the most recent processCombatSimulation run. */
export function getLastTriggerIndex(): TriggerIndex | null {
  return _lastTriggerIndex;
}

/** Get the StatAccumulator from the most recent processCombatSimulation run. */
export function getLastStatAccumulator(): StatAccumulator | null {
  return _statAccumulator;
}

/** Get crit results resolved during the most recent SIMULATION pipeline run. */
export function getLastCritResults(): Map<string, Map<number, Map<number, boolean>>> | undefined {
  return _statAccumulator?.getResolvedCrits();
}

/**
 * Linear pipeline entry point.
 *
 * 1. InputEventController.cloneAndSplitEvents → split input vs derived
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
  /** Shield controller for operator shield tracking. */
  shieldController?: import('../calculation/shieldController').ShieldController,
  /** All slots' SP costs for insufficiency zone computation. */
  allSlotSpCosts?: ReadonlyMap<string, number>,
  /** Pre-built TriggerIndex from CombatLoadoutController. */
  triggerIndex?: TriggerIndex,
  /** CritMode for SIMULATION/EXPECTED crit resolution during pipeline. */
  critMode?: CritMode,
  /** Override store for reading existing crit pins. */
  overrides?: OverrideStore,
  /** Enemy stats for stat accumulator initialization. */
  enemyStats?: EnemyStats,
): TimelineEvent[] {
  // ── 0. Reset object pools and caches for this pipeline run ──────────────
  resetPools();
  clearStatusDefCache();

  // ── 0a. Initialize HP tracker for live HP% queries during queue processing
  if (hpController) {
    hpController.initEnemyHp(bossMaxHp ?? null);
  } else {
    initHpTracker(bossMaxHp ?? null);
  }

  // ── 0b. Clear resource controllers for this pipeline run ──────────────────
  if (spController) spController.clearPending();
  if (ueController) ueController.clear();

  // ── 0c. Initialize stat accumulator for real-time stat tracking ──────────
  if (!_statAccumulator) _statAccumulator = new StatAccumulator();
  const accumSlotIds = slotOperatorMap ? Object.keys(slotOperatorMap) : [];
  _statAccumulator.init(accumSlotIds, loadoutProperties ?? {}, loadouts, slotOperatorMap, enemyStats);

  // ── 1. Clone and classify raw events ─────────────────────────────────────
  const { inputEvents, derivedEvents } = cloneAndSplitEvents(rawEvents);

  // ── 2. DerivedEventController: register skill events only ──────────────
  // Non-skill events (inflictions, reactions, statuses) enter solely through
  // the queue via collectFrameEntries → handleProcessFrame → create*.
  const triggerAssociations = getAllTriggerAssociations();
  if (!_decSingleton) _decSingleton = new DerivedEventController();
  _decSingleton.reset(triggerAssociations, slotWirings, spController, ueController);
  const state = _decSingleton;
  const slotIds = slotOperatorMap ? Object.keys(slotOperatorMap) : [];
  const firstSlotOperatorId = slotIds[0] && slotOperatorMap ? slotOperatorMap[slotIds[0]] : undefined;
  state.seedControlledOperator(slotIds[0], firstSlotOperatorId);
  state.registerEvents(inputEvents);

  // Register enemy action events so they appear in processed output (for canvas rendering).
  // They're classified as derived (non-skill column) but need to be in the output like input events.
  const enemyActionEvents = derivedEvents.filter(ev => ev.ownerId === ENEMY_OWNER_ID && ev.columnId === ENEMY_ACTION_COLUMN_ID);
  if (enemyActionEvents.length > 0) state.registerEvents(enemyActionEvents);

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
    hpPercentageFn, getControlledSlotAtFrame, hpController, shieldController, triggerIndex,
    _statAccumulator, critMode, overrides);

  // ── 5. Finalize resource controllers ──────────────────────────────────────
  if (spController) {
    if (allSlotSpCosts) spController.seedSlotCosts(allSlotSpCosts);
    spController.finalize(state.getStops());
  }
  if (ueController) {
    // Update efficiency from stat accumulator (picks up APPLY STAT deltas from talents like Gilberta's Messenger's Song)
    if (_statAccumulator && slotOperatorMap) {
      for (const slotId of Object.keys(slotOperatorMap)) {
        const accumulated = _statAccumulator.getStat(slotId, StatType.ULTIMATE_GAIN_EFFICIENCY);
        ueController.updateSlotEfficiency(slotId, accumulated);
      }
    }
    const gainFrames = spController ? new Map(spController.getBattleSkillGainFrames()) : new Map<string, { frame: number; slotId: string }>();
    ueController.finalize(gainFrames);
  }
  if (hpController) {
    hpController.finalize();
  }
  if (shieldController) {
    shieldController.finalize();
  }

  // ── 6. Output ───────────────────────────────────────────────────────────────
  _lastController = state;
  const processed = state.getProcessedEvents();

  // Propagate creationInteractionMode from user-placed seed events.
  // User-placed freeform events on derived columns are classified as "derived"
  // in cloneAndSplitEvents. The engine recreates them (new uid), losing the field.
  // Match by ownerId+columnId+startFrame and copy creationInteractionMode.
  const userDerived = derivedEvents.filter(ev => ev.creationInteractionMode != null);
  if (userDerived.length > 0) {
    const seedKeys = new Map<string, InteractionModeType>();
    for (const ev of userDerived) {
      seedKeys.set(`${ev.ownerId}\0${ev.columnId}\0${ev.startFrame}`, ev.creationInteractionMode!);
    }
    for (const ev of processed) {
      const mode = seedKeys.get(`${ev.ownerId}\0${ev.columnId}\0${ev.startFrame}`);
      if (mode != null) ev.creationInteractionMode = mode;
    }
  }

  return processed;
}

