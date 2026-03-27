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
import { ENEMY_OWNER_ID, INFLICTION_COLUMN_IDS, PHYSICAL_INFLICTION_COLUMN_IDS, REACTION_COLUMN_IDS, SKILL_COLUMNS } from '../../model/channels';
import { getAllTriggerAssociations } from '../gameDataStore';
import { classifyEvents } from './inputEventController';
import { initHpTracker, getEnemyHpPercentage, precomputeDamageByFrame } from '../calculation/calculationController';
import type { HPController } from '../calculation/hpController';
import type { OperatorLoadoutState } from '../../view/OperatorLoadoutHeader';
import { resolveControlledOperator } from './controlledOperatorResolver';
import { allocQueueFrame, resetPools, isReconcilerEnabled } from './objectPool';

// ── TriggerIndex cache ──────────────────────────────────────────────────────
// The trigger index is built from operator/weapon/gear configs + potentials.
// It doesn't depend on event positions, so we cache it and only rebuild when
// the loadout changes. This avoids a full config scan on every drag tick.

let _cachedTriggerIndex: TriggerIndex | null = null;
let _cachedSlotOperatorMap: Record<string, string> | undefined;
let _cachedLoadoutProperties: Record<string, import('../../view/InformationPane').LoadoutProperties> | undefined;
let _cachedSlotWeapons: Record<string, string | undefined> | undefined;
let _cachedSlotGearSets: Record<string, string | undefined> | undefined;

function getCachedTriggerIndex(
  slotOperatorMap?: Record<string, string>,
  loadoutProperties?: Record<string, import('../../view/InformationPane').LoadoutProperties>,
  slotWeapons?: Record<string, string | undefined>,
  slotGearSets?: Record<string, string | undefined>,
  registeredEvents?: readonly TimelineEvent[],
): TriggerIndex {
  // Cache hit when all reference-identical inputs match (same objects = same loadout).
  // During drag, these objects are stable — only event positions change.
  if (_cachedTriggerIndex
    && slotOperatorMap === _cachedSlotOperatorMap
    && loadoutProperties === _cachedLoadoutProperties
    && slotWeapons === _cachedSlotWeapons
    && slotGearSets === _cachedSlotGearSets) {
    return _cachedTriggerIndex;
  }
  _cachedTriggerIndex = TriggerIndex.build(slotOperatorMap, loadoutProperties, slotWeapons, slotGearSets, registeredEvents);
  _cachedSlotOperatorMap = slotOperatorMap;
  _cachedLoadoutProperties = loadoutProperties;
  _cachedSlotWeapons = slotWeapons;
  _cachedSlotGearSets = slotGearSets;
  return _cachedTriggerIndex;
}

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
    if (event.ownerId === ENEMY_OWNER_ID) continue;

    // Seed an event-start entry at the event's start frame (no frame marker)
    const start = allocQueueFrame();
    start.frame = event.startFrame;
    start.priority = PRIORITY.PROCESS_FRAME;
    start.type = 'PROCESS_FRAME';
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
    for (let si = 0; si < event.segments.length; si++) {
      const seg = event.segments[si];
      if (seg.frames) {
        for (let fi = 0; fi < seg.frames.length; fi++) {
          const frame = seg.frames[fi];
          const absFrame = absoluteFrame(event.startFrame, cumulativeOffset, frame.offsetFrame, fStops);

          const qf = allocQueueFrame();
          qf.frame = absFrame;
          qf.priority = PRIORITY.PROCESS_FRAME;
          qf.type = 'PROCESS_FRAME';
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

    // Seed COMBO_RESOLVE for combo events (fires after engine triggers)
    if (event.columnId === SKILL_COLUMNS.COMBO && !event.comboTriggerColumnId) {
      const combo = allocQueueFrame();
      combo.frame = event.startFrame;
      combo.priority = PRIORITY.COMBO_RESOLVE;
      combo.type = 'COMBO_RESOLVE';
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
const _triggerSeen = new Set<string>();

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
  derivedEvents: TimelineEvent[],
  loadoutProperties?: Record<string, LoadoutProperties>,
  slotWeapons?: Record<string, string | undefined>,
  slotOperatorMap?: Record<string, string>,
  slotGearSets?: Record<string, string | undefined>,
  getEnemyHpPercentage?: (frame: number) => number | null,
  getControlledSlotAtFrame?: (frame: number) => string,
  hpController?: HPController,
): void {
  const slotWirings = state.getSlotWirings();
  const registeredEvents = state.getRegisteredEvents();
  const stops = state.getStops();

  // Build trigger index from configs — cached when loadout hasn't changed.
  // The index depends only on operator/weapon/gear configs + potentials,
  // not on event positions, so it's safe to reuse during drag.
  const triggerIdx = getCachedTriggerIndex(slotOperatorMap, loadoutProperties, slotWeapons, slotGearSets, registeredEvents);

  // Register talent events (permanent presence) before queue processing
  const talentEvents = triggerIdx.getAllTalentEvents();
  if (talentEvents.length > 0) state.registerEvents(talentEvents);

  // ── Seed priority queue (reuse singleton) ──────────────────────────────
  const queue = getQueue();
  queue.clear();

  // Reset interpreter (reuse singleton)
  const interpretor = getInterpretor();
  interpretor.resetWith(state, registeredEvents, {
    loadoutProperties, slotOperatorMap, slotWirings, getEnemyHpPercentage,
    getControlledSlotAtFrame, triggerIndex: triggerIdx, hpController,
  });

  // Seed derived events (freeform inflictions/reactions) — these go through the
  // queue so they're processed at the correct priority (not into registeredEvents)
  for (const ev of derivedEvents) {
    if (INFLICTION_COLUMN_IDS.has(ev.columnId) || PHYSICAL_INFLICTION_COLUMN_IDS.has(ev.columnId)) {
      queue.insert({
        frame: ev.startFrame,
        priority: PRIORITY.INFLICTION_CREATE,
        type: 'INFLICTION_CREATE',
        uid: ev.uid,
        statusId: ev.columnId,
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
        statusId: ev.columnId,
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
  for (const e of frameEntries) queue.insert(e);

  // Seed reactive triggers for freeform enemy events (reactions/inflictions/statuses
  // placed directly on the timeline — no frame markers, not handled by PROCESS_FRAME)
  _triggerSeen.clear();
  for (const ev of registeredEvents) {
    if (ev.ownerId !== ENEMY_OWNER_ID) continue;
    for (const entry of triggerIdx.matchEvent(ev.columnId)) {
      if (entry.primaryVerb === 'PERFORM') continue; // PERFORM handled by PROCESS_FRAME
      const dedupKey = `${entry.def.properties.id}:${entry.operatorSlotId}:${ev.startFrame}`;
      if (_triggerSeen.has(dedupKey)) continue;
      _triggerSeen.add(dedupKey);
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
        statusId: entry.def.properties.id, columnId: '', ownerId: entry.operatorSlotId,
        sourceOwnerId: ev.ownerId, sourceSkillName: ev.name,
        maxStacks: 0, durationFrames: 0, operatorSlotId: entry.operatorSlotId,
        engineTrigger: { frame: ev.startFrame, sourceOwnerId: entry.operatorId, triggerSlotId: ev.ownerId, sourceSkillName: ev.name, ctx: triggerCtx, isEquip: entry.isEquip },
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

  // ── 1. InputEventController: classify ─────────────────────────────────────
  const { inputEvents, derivedEvents } = classifyEvents(rawEvents);

  // ── 2. DerivedEventController: reset singleton and register input events ──
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
    hpPercentageFn, getControlledSlotAtFrame, hpController);

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
