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
import { NounType, VerbType } from '../../dsl/semantics';
import type { Effect } from '../../dsl/semantics';
import { LoadoutProperties } from '../../view/InformationPane';
import { DerivedEventController } from './derivedEventController';
import type { SlotTriggerWiring } from './eventQueueTypes';
import { SkillPointController } from '../slot/skillPointController';
import { EventInterpretorController } from './eventInterpretorController';
import { invalidateConfigCache } from './configCache';
import { TriggerIndex } from './triggerIndex';
import { ENEMY_OWNER_ID, ENEMY_ACTION_COLUMN_ID } from '../../model/channels';
import { getAllTriggerAssociations } from '../gameDataStore';
import { cloneAndSplitEvents, selectNewTalents, buildControlSeed } from './parser';
import { initHpTracker, getEnemyHpPercentage, precomputeDamageByFrame } from '../calculation/calculationController';
import type { HPController } from '../calculation/hpController';
import { StatAccumulator } from '../calculation/statAccumulator';
import type { OverrideStore } from '../../consts/overrideTypes';
import { buildOverrideKey } from '../overrideController';
import { CritMode, StatType } from '../../consts/enums';
import type { OperatorLoadoutState } from '../../view/OperatorLoadoutHeader';
import type { EnemyStats } from '../appStateController';
import { resolveControlledOperator } from './controlledOperatorResolver';
import { resetPools } from './objectPool';
import { flattenEventsToQueueFrames } from './parser';

// TriggerIndex is now built and cached by CombatLoadoutController.syncSlots().
// It is passed into the pipeline via the triggerIndex parameter.

// Phase 8 step 7a: `collectFrameEntries` has been moved into
// `./parser/flattenEvents.ts` as `flattenEventsToQueueFrames`. The parser
// module is now the single authority for event → QueueFrame[] flattening.

// ── Reusable singletons for pipeline runs ────────────────────────────────
// These are lazily created on first use to avoid circular dependency issues
// at module initialization time. Once created, they are reused across ticks.

let _interpretor: EventInterpretorController | null = null;

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
  /** Pre-built TriggerIndex from CombatLoadoutController. Falls back to ad-hoc build if not provided. */
  triggerIndex?: TriggerIndex,
  critMode?: CritMode,
  overrides?: OverrideStore,
): void {
  const slotWirings = state.getSlotWirings();
  const registeredEvents = state.getRegisteredEvents();
  const stops = state.getStops();

  // Always build trigger index with registered events so runtime triggers
  // (e.g. ENEMY BECOME NODE_STAGGERED) can match user-placed events.
  const triggerIdx = TriggerIndex.build(slotOperatorMap, loadoutProperties, slotWeapons, slotGearSets, registeredEvents);
  _lastTriggerIndex = triggerIdx;
  // eslint-disable-next-line no-console
  if (registeredEvents.some(e => e.columnId === 'node-stagger')) console.log('[PIPELINE] stagger events found in registeredEvents, triggerIndex has APPLY:node-stagger entries:', triggerIdx.matchEvent('APPLY', 'node-stagger').length);

  // Register talent events (permanent presence) before queue processing.
  // Dedup against already-registered events AND already-registered in this run
  // (strict mode double-invocation can re-register same TriggerIndex talent objects).
  const newTalents = selectNewTalents(triggerIdx, state.getRegisteredEvents());
  for (const t of newTalents) state.createSkillEvent(t, { checkCooldown: false });

  // ── Priority queue (owned by DEC; reset() above already cleared it) ────
  // Reset interpreter (reuse singleton)
  const interpretor = getInterpretor();
  interpretor.resetWith(state, registeredEvents, {
    loadoutProperties, slotOperatorMap, slotWirings, getEnemyHpPercentage,
    getControlledSlotAtFrame, triggerIndex: triggerIdx, critMode, overrides,
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
            const effect = raw as unknown as Effect;
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

  // Phase 8 step 7h: registered (skill/input) events now emit their own
  // queue frames during createSkillEvent ingress using the current stops.
  // Derived events (freeform inflictions/reactions/statuses from
  // cloneAndSplitEvents) still go through the bulk flattenEvents call,
  // because they never pass through createSkillEvent — the interpretor
  // creates their actual event via applyEvent when their PROCESS_FRAME
  // hook fires.
  const frameEntries = flattenEventsToQueueFrames(derivedEvents, stops);
  state.insertQueueFrames(frameEntries);

  // ── Run the queue ─────────────────────────────────────────────────────────
  while (state.queueSize > 0) {
    const entry = state.popNextFrame()!;
    const newEntries = interpretor.processQueueFrame(entry);
    state.insertQueueFrames(newEntries);
  }

  // Register queue-created events into DEC. Phase 8 step 6b: pass 3 of
  // registerEvents (resolveComboTriggersInline → openComboWindow) now
  // reactively emits COMBO_WINDOW events from the full event list, replacing
  // the previous post-queue deriveComboActivationWindows batch call. The
  // post-queue re-derive in processCombatSimulation still runs as a safety
  // net for CD-reduction cases and will be removed in 6c.
  const queueEvents = state.output;
  // Wire the controlled-slot resolver so pass 3 can filter CONTROLLED
  // OPERATOR combo triggers correctly when re-emitting windows.
  state.setControlledSlotResolver(getControlledSlotAtFrame);
  // Post-drain re-registration: move queue-created events into
  // registeredEvents so getProcessedEvents returns them. Skip queue-frame
  // emission — these events have already been fully processed during the
  // drain, so re-emitting their frames would cause duplicate interpret
  // work and potential double-effects.
  for (const ev of queueEvents) state.createSkillEvent(ev, { checkCooldown: false, emitQueueFrames: false });


  // Apply crit pin overrides to all derived event frames. Phase 8 step
  // 7e-prep: registerEvents(queueEvents) now clones segments via
  // _pushToStorage, so we must write pins to the cloned copies in
  // registeredEvents, not the pre-clone references in state.output.
  if (overrides) {
    const registeredByUid = new Map<string, TimelineEvent>();
    for (const r of state.getRegisteredEvents()) registeredByUid.set(r.uid, r);
    for (const orig of queueEvents) {
      const ev = registeredByUid.get(orig.uid) ?? orig;
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

/**
 * Linear pipeline entry point.
 *
 * 1. InputEventController.cloneAndSplitEvents → split input vs derived
 * 2. DerivedEventController.registerEvents → input events only
 * 3. EventQueueController.runEventQueue → builds trigger index, seeds derived + talents, runs interpreter
 * 4. DerivedEventController.getProcessedEvents → final output
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
  invalidateConfigCache();

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
  _decSingleton.reset(
    triggerAssociations, slotWirings, spController, ueController,
    loadoutProperties, slotOperatorMap,
    hpController, shieldController, _statAccumulator,
  );
  const state = _decSingleton;
  // Phase 8 step 7e: route every user-placed/input event through the single
  // `createSkillEvent` entrypoint instead of batch `registerEvents`. Cooldown
  // checks are suppressed for user-placed events (they are allowed to overlap
  // prior CDs with a warning). Retroactive re-extension in _maybeRegisterStop
  // ensures later stop-contributing events correctly re-extend earlier events.
  const slotIds = slotOperatorMap ? Object.keys(slotOperatorMap) : [];
  const firstSlotOperatorId = slotIds[0] && slotOperatorMap ? slotOperatorMap[slotIds[0]] : undefined;
  const controlSeed = buildControlSeed(slotIds[0], firstSlotOperatorId);
  if (controlSeed) state.createSkillEvent(controlSeed, { checkCooldown: false });
  for (const ev of inputEvents) state.createSkillEvent(ev, { checkCooldown: false });

  // Register enemy action events so they appear in processed output (for canvas rendering).
  // They're classified as derived (non-skill column) but need to be in the output like input events.
  const enemyActionEvents = derivedEvents.filter(ev => ev.ownerId === ENEMY_OWNER_ID && ev.columnId === ENEMY_ACTION_COLUMN_ID);
  for (const ev of enemyActionEvents) state.createSkillEvent(ev, { checkCooldown: false });

  // ── 3. Talent events ──────────────────────────────────────────────────────
  // SP recovery is now driven entirely by RECOVER/RETURN SKILL_POINT clauses
  // routed through interpret() → DEC.recordSkillPointRecovery (perfect-dodge
  // gets a synthetic clause attached at allocateEvent time). The legacy
  // `SkillPointController.deriveSPRecoveryEvents` no-op stub was deleted.
  // Talent events are registered inside runEventQueue via the trigger index.

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
    hpPercentageFn, getControlledSlotAtFrame, triggerIndex, critMode, overrides);

  // ── 5. Finalize resource controllers ──────────────────────────────────────
  if (spController && allSlotSpCosts) {
    spController.seedSlotCosts(allSlotSpCosts);
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
  return processed;
}

