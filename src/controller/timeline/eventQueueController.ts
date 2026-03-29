/**
 * InputEventController — unified pipeline orchestrator for the event queue.
 *
 * Receives raw user-placed events, extracts frame markers, seeds the queue,
 * and runs the EventInterpretorController to produce all derived events.
 *
 * ALL game mechanics processing — time-stop resolution, infliction derivation,
 * exchange statuses, combo windows, frame positions, validation — happens here.
 */
import { TimelineEvent } from '../../consts/viewTypes';
import { NounType } from '../../dsl/semantics';
import { LoadoutProperties } from '../../view/InformationPane';
import { TimeStopRegion, absoluteFrame, foreignStopsFor } from './processTimeStop';
import { DerivedEventController } from './derivedEventController';
import { deriveComboActivationWindows } from './processComboSkill';
import type { SlotTriggerWiring } from './eventQueueTypes';
import { SkillPointController } from '../slot/skillPointController';
import { PRIORITY, QueueFrameType } from './eventQueueTypes';
import type { QueueFrame } from './eventQueueTypes';
import { EventInterpretorController } from './eventInterpretorController';
import { PriorityQueue } from './priorityQueue';
import { TriggerIndex } from './triggerIndex';
import { SKILL_COLUMN_ORDER } from '../../model/channels';
import type { SkillType } from '../../consts/viewTypes';
import { getAllTriggerAssociations } from '../gameDataStore';
import { cloneAndSplitEvents } from './inputEventController';
import { initHpTracker, getEnemyHpPercentage, precomputeDamageByFrame } from '../calculation/calculationController';
import type { HPController } from '../calculation/hpController';
import type { OperatorLoadoutState } from '../../view/OperatorLoadoutHeader';
import { resolveControlledOperator } from './controlledOperatorResolver';
import { allocQueueFrame, resetPools, isReconcilerEnabled } from './objectPool';

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
    // Seed an event-start entry at the event's start frame (no frame marker)
    const start = allocQueueFrame();
    start.frame = event.startFrame;
    start.priority = PRIORITY.PROCESS_FRAME;
    start.type = QueueFrameType.PROCESS_FRAME;
    start.statusId = event.name;
    start.columnId = event.columnId;
    start.ownerId = event.ownerId;
    start.sourceOwnerId = event.ownerId;
    start.sourceSkillName = event.name;
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
      if (seg.frames && seg.frames.length > 0) {
        hasFrames = true;
        for (let fi = 0; fi < seg.frames.length; fi++) {
          const frame = seg.frames[fi];
          const absFrame = absoluteFrame(event.startFrame, cumulativeOffset, frame.offsetFrame, fStops);

          const qf = allocQueueFrame();
          qf.frame = absFrame;
          qf.priority = PRIORITY.PROCESS_FRAME;
          qf.type = QueueFrameType.PROCESS_FRAME;
          qf.statusId = event.name;
          qf.columnId = event.columnId;
          qf.ownerId = event.ownerId;
          qf.sourceOwnerId = event.ownerId;
          qf.sourceSkillName = event.name;
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
    }

    // Synthesize a frame entry for non-skill events with no frame markers.
    // This routes freeform inflictions, reactions, and statuses through the same
    // PROCESS_FRAME → interpret path as engine-created events.
    if (!hasFrames && !SKILL_COLUMN_SET.has(event.columnId as SkillType) && !getResourceColumnSet().has(event.columnId)) {
      const synth = allocQueueFrame();
      synth.frame = event.startFrame;
      synth.priority = PRIORITY.PROCESS_FRAME;
      synth.type = QueueFrameType.PROCESS_FRAME;
      synth.statusId = event.name;
      synth.columnId = event.columnId;
      synth.ownerId = event.ownerId;
      synth.sourceOwnerId = event.ownerId;
      synth.sourceSkillName = event.name;
      synth.maxStacks = 0;
      synth.durationFrames = 0;
      synth.operatorSlotId = event.ownerId;
      synth.frameMarker = { offsetFrame: 0 };
      synth.sourceEvent = event;
      synth.segmentIndex = 0;
      synth.frameIndex = 0;
      entries.push(synth);
    }

    // Seed COMBO_RESOLVE for combo events (fires after engine triggers)
    if (event.columnId === NounType.COMBO_SKILL && !event.comboTriggerColumnId) {
      const combo = allocQueueFrame();
      combo.frame = event.startFrame;
      combo.priority = PRIORITY.COMBO_RESOLVE;
      combo.type = QueueFrameType.COMBO_RESOLVE;
      combo.statusId = event.name;
      combo.columnId = event.columnId;
      combo.ownerId = event.ownerId;
      combo.sourceOwnerId = event.ownerId;
      combo.sourceSkillName = event.name;
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
  /** Pre-built TriggerIndex from CombatLoadoutController. Falls back to ad-hoc build if not provided. */
  triggerIndex?: TriggerIndex,
): void {
  const slotWirings = state.getSlotWirings();
  const registeredEvents = state.getRegisteredEvents();
  const stops = state.getStops();

  // Use pre-built trigger index from CombatLoadoutController, or build ad-hoc as fallback
  const triggerIdx = triggerIndex ?? TriggerIndex.build(slotOperatorMap, loadoutProperties, slotWeapons, slotGearSets, registeredEvents);

  // Register talent events (permanent presence) before queue processing.
  // Dedup against already-registered events (talent events from a previous run or embed decode).
  const talentEvents = triggerIdx.getAllTalentEvents();
  const newTalents = talentEvents.filter(t =>
    !registeredEvents.some(ev => ev.columnId === t.columnId && ev.ownerId === t.ownerId)
  );
  if (newTalents.length > 0) state.registerEvents(newTalents);

  // ── Seed priority queue (reuse singleton) ──────────────────────────────
  const queue = getQueue();
  queue.clear();

  // Reset interpreter (reuse singleton)
  const interpretor = getInterpretor();
  interpretor.resetWith(state, registeredEvents, {
    loadoutProperties, slotOperatorMap, slotWirings, getEnemyHpPercentage,
    getControlledSlotAtFrame, triggerIndex: triggerIdx, hpController,
  });

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

  state.validateAll();
}

// ── Pipeline entry point ─────────────────────────────────────────────────────

// Lazily created DerivedEventController singleton — reset() clears all state.
let _decSingleton: DerivedEventController | null = null;
let _lastController: DerivedEventController | null = null;

/** Get the DerivedEventController from the most recent processCombatSimulation run. */
export function getLastController(): DerivedEventController {
  return _lastController!;
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
  /** All slots' SP costs for insufficiency zone computation. */
  allSlotSpCosts?: ReadonlyMap<string, number>,
  /** Pre-built TriggerIndex from CombatLoadoutController. */
  triggerIndex?: TriggerIndex,
): TimelineEvent[] {
  // ── 0. Reset object pools for this pipeline run ─────────────────────────
  resetPools();

  // ── 0a. Initialize HP tracker for live HP% queries during queue processing
  if (hpController) {
    hpController.initEnemyHp(bossMaxHp ?? null);
  } else {
    initHpTracker(bossMaxHp ?? null);
  }

  // ── 0b. Clear resource controllers for this pipeline run ──────────────────
  if (spController) spController.clearPending();
  if (ueController) ueController.clear();

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
    hpPercentageFn, getControlledSlotAtFrame, hpController, triggerIndex);

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

  // ── 6. Output — reconcile with previous to reuse objects ─────────────────
  _lastController = state;
  const freshEvents = state.getProcessedEvents();
  return isReconcilerEnabled() ? reconcileEvents(freshEvents) : freshEvents;
}

// ── Event reconciliation ─────────────────────────────────────────────────────
// Compares fresh pipeline output against previous output by UID.
// - If an event is structurally identical: reuses the previous object reference
//   (React memo comparators see same reference → skip re-render)
// - If an event changed: uses the fresh object (new reference → triggers re-render)
// - New/removed events: created/dropped naturally
//
// Reconciliation uses snapshots of scalar fields keyed by UID rather than
// holding direct references to previous event objects. This is safe with
// object pooling — pooled objects get recycled and overwritten, but the
// snapshot captures the field values at the time they were stored.
// If an event's snapshot matches the fresh output, we reuse the non-pooled
// clone stored alongside it.

interface EventSnapshot {
  startFrame: number;
  eventStatus?: string;
  stacks?: number;
  comboTriggerColumnId?: string;
  reductionFloor?: number;
  comboChainFreezeEnd?: number;
  /** Reference to the segments array — if the pipeline rebuilt segments, this won't match. */
  segmentsRef: readonly object[];
  warnLen: number;
}

let _prevSnapshots = new Map<string, EventSnapshot>();
// Non-pooled clones stored for reuse — these are safe to hold across ticks.
let _prevClones = new Map<string, TimelineEvent>();

function snapshotEvent(ev: TimelineEvent): EventSnapshot {
  return {
    startFrame: ev.startFrame,
    eventStatus: ev.eventStatus,
    stacks: ev.stacks,
    comboTriggerColumnId: ev.comboTriggerColumnId,
    reductionFloor: ev.reductionFloor,
    comboChainFreezeEnd: ev.comboChainFreezeEnd,
    segmentsRef: ev.segments,
    warnLen: ev.warnings?.length ?? 0,
  };
}

function snapshotMatches(snap: EventSnapshot, ev: TimelineEvent): boolean {
  if (snap.startFrame !== ev.startFrame) return false;
  if (snap.eventStatus !== ev.eventStatus) return false;
  if (snap.stacks !== ev.stacks) return false;
  if (snap.comboTriggerColumnId !== ev.comboTriggerColumnId) return false;
  if (snap.reductionFloor !== ev.reductionFloor) return false;
  if (snap.comboChainFreezeEnd !== ev.comboChainFreezeEnd) return false;
  // Reference equality on segments — if the pipeline rebuilt segments
  // (e.g. time-stop changed frame positions), the reference will differ.
  if (snap.segmentsRef !== ev.segments) return false;
  if (snap.warnLen !== (ev.warnings?.length ?? 0)) return false;
  return true;
}

let _reconcileReused = 0;
let _reconcileFresh = 0;
let _reconcileTotal = 0;

function reconcileEvents(freshEvents: TimelineEvent[]): TimelineEvent[] {
  const prevSnaps = _prevSnapshots;
  const prevClones = _prevClones;
  const nextSnaps = new Map<string, EventSnapshot>();
  const nextClones = new Map<string, TimelineEvent>();
  const result: TimelineEvent[] = [];
  let reused = 0;

  for (let i = 0; i < freshEvents.length; i++) {
    const fresh = freshEvents[i];
    const snap = prevSnaps.get(fresh.uid);
    const clone = prevClones.get(fresh.uid);

    if (snap && clone && snapshotMatches(snap, fresh)) {
      // Structurally identical — reuse the previous non-pooled clone
      nextSnaps.set(fresh.uid, snap);
      nextClones.set(fresh.uid, clone);
      result.push(clone);
      reused++;
    } else {
      // Changed or new — create a non-pooled clone to hold across ticks
      const stable = { ...fresh, segments: fresh.segments };
      nextSnaps.set(fresh.uid, snapshotEvent(fresh));
      nextClones.set(fresh.uid, stable);
      result.push(stable);
    }
  }

  _prevSnapshots = nextSnaps;
  _prevClones = nextClones;
  _reconcileReused = reused;
  _reconcileFresh = freshEvents.length - reused;
  _reconcileTotal = freshEvents.length;
  return result;
}

export function getReconcileStats() {
  return {
    total: _reconcileTotal,
    reused: _reconcileReused,
    fresh: _reconcileFresh,
    cacheSize: _prevClones.size,
  };
}
