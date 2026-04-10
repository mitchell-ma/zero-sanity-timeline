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
import type { SlotTriggerWiring, QueueFrame } from './eventQueueTypes';
import { SkillPointController } from '../slot/skillPointController';
import { EventInterpretorController } from './eventInterpretorController';
import { invalidateConfigCache } from './configCache';
import { TriggerIndex } from './triggerIndex';
import { ENEMY_ID, ENEMY_ACTION_COLUMN_ID } from '../../model/channels';
import { getAllTriggerAssociations } from '../gameDataStore';
import { cloneAndSplitEvents, selectNewTalents, buildControlSeed } from './parser';
import { buildDamageOpCache } from '../calculation/calculationController';
import { getDefenseMultiplier } from '../../model/calculation/damageFormulas';
import { getModelEnemy } from '../calculation/enemyRegistry';
import type { HPController } from '../calculation/hpController';
import { StatAccumulator } from '../calculation/statAccumulator';
import type { OverrideStore } from '../../consts/overrideTypes';
import { buildOverrideKey } from '../overrideController';
import { CritMode } from '../../consts/enums';
import type { OperatorLoadoutState } from '../../view/OperatorLoadoutHeader';
import type { EnemyStats } from '../appStateController';
import { resolveControlledOperator } from './controlledOperatorResolver';
import { resetPools } from './objectPool';
import { flattenEventsToQueueFrames } from './parser';

// TriggerIndex is built and cached by CombatLoadoutController.syncSlots()
// and passed into the pipeline via the `triggerIndex` parameter.

// Event → QueueFrame[] flattening lives in ./parser/flattenEvents.ts. The
// parser module is the single authority for that transformation.

// ── Reusable singletons for pipeline runs ────────────────────────────────
// Lazily created on first use to avoid circular dependency issues at
// module initialization time. Reused across ticks.

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
  /** op cache + defMult for inline damage tick push. */
  damageOpCache?: ReadonlyMap<string, import('../calculation/calculationController').DamageOpData>,
  enemyDefMult?: number,
): void {
  const slotWirings = state.getSlotWirings();
  const allEvents = state.getAllEvents();
  const stops = state.getStops();

  // Always build trigger index with registered events so runtime triggers
  // (e.g. ENEMY BECOME NODE_STAGGERED) can match user-placed events.
  const triggerIdx = TriggerIndex.build(slotOperatorMap, loadoutProperties, slotWeapons, slotGearSets, allEvents);
  _lastTriggerIndex = triggerIdx;
  // eslint-disable-next-line no-console
  if (allEvents.some(e => e.columnId === 'node-stagger')) console.log('[PIPELINE] stagger events found in allEvents, triggerIndex has APPLY:node-stagger entries:', triggerIdx.matchEvent('APPLY', 'node-stagger').length);

  // Register talent events (permanent presence) before queue processing.
  // Dedup against already-registered events AND already-registered in this run
  // (strict mode double-invocation can re-register same TriggerIndex talent objects).
  const newTalents = selectNewTalents(triggerIdx, state.getAllEvents());
  for (const t of newTalents) state.createSkillEvent(t, { checkCooldown: false });

  // ── Priority queue (owned by DEC; reset() above already cleared it) ────
  // Reset interpreter (reuse singleton)
  const interpretor = getInterpretor();
  interpretor.resetWith(state, allEvents, {
    loadoutProperties, slotOperatorMap, slotWirings, getEnemyHpPercentage,
    getControlledSlotAtFrame, triggerIndex: triggerIdx, critMode, overrides,
    damageOpCache, enemyDefMult,
  });

  // Interpret APPLY STAT effects from passive talent clauses (e.g. Gilberta Messenger's Song UE efficiency)
  if (slotOperatorMap) {
    for (const slotId of Object.keys(slotOperatorMap)) {
      for (const talent of triggerIdx.getTalents(slotId)) {
        if (!talent.def.clause?.length) continue;
        for (const clause of talent.def.clause as unknown as { conditions?: unknown[]; effects?: Record<string, unknown>[] }[]) {
          if (!clause.effects?.length) continue;
          for (const raw of clause.effects) {
            // Talent passive clauses fire APPLY STAT and IGNORE UE inline at
            // pipeline start (frame 0). Other verbs (RECOVER, etc.) flow
            // through the queue path normally.
            const isApplyStat = raw.verb === VerbType.APPLY && raw.object === NounType.STAT;
            const isIgnoreUe = raw.verb === VerbType.IGNORE && raw.object === NounType.ULTIMATE_ENERGY;
            if (!isApplyStat && !isIgnoreUe) continue;
            const effect = raw as unknown as Effect;
            interpretor.interpret(effect, {
              frame: 0,
              sourceEntityId: talent.operatorId,
              sourceSlotId: talent.operatorSlotId,
              sourceSkillName: talent.def.properties.id,
            });
          }
        }
      }
    }
  }

  // Fire HP threshold checks once at pipeline start so conditions that
  // are trivially satisfied by initial HP state (e.g. "HP ≥ 100%") trigger
  // at frame 0. Subsequent checks fire reactively from the damage tick
  // push whenever HP actually changes.
  const initialHpTriggers: QueueFrame[] = [];
  interpretor.checkInitialHpThresholds(initialHpTriggers);
  if (initialHpTriggers.length > 0) state.insertQueueFrames(initialHpTriggers);

  // Skill / input / enemy-action events emit their own queue frames during
  // createSkillEvent ingress. The bulk flattenEvents call here is for
  // derived events (freeform inflictions/reactions/statuses from
  // cloneAndSplitEvents) that bypass createSkillEvent — the interpretor
  // creates their actual visible event via applyEvent when their
  // PROCESS_FRAME hook fires.
  const frameEntries = flattenEventsToQueueFrames(derivedEvents, stops);
  state.insertQueueFrames(frameEntries);

  // ── Run the queue ─────────────────────────────────────────────────────────
  while (state.queueSize > 0) {
    const entry = state.popNextFrame()!;
    const newEntries = interpretor.processQueueFrame(entry);
    state.insertQueueFrames(newEntries);
  }

  // Wire the controlled-slot resolver so pass 3 can filter CONTROLLED
  // OPERATOR combo triggers correctly.
  state.setControlledSlotResolver(getControlledSlotAtFrame);

  // Post-drain re-registration loop deleted: queue-created events now enter
  // allEvents directly via createQueueEvent (routed from
  // pushEvent / pushEventDirect / pushToOutput / addEvent). No parallel
  // storage paths. Run combo trigger resolution once over the full event
  // set to pick up combos triggered by queue-created inflictions.
  state.resolveCombosNow();

  // Apply crit pin overrides to all derived event frames. allEvents
  // is now the single source of storage — iterate it directly.
  if (overrides) {
    for (const ev of state.getAllEvents()) {
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

  // ── 0a. Initialize HP tracker for live HP% queries during queue processing.
  // tests may call processCombatSimulation without hpController;
  // in that case HP tracking is skipped entirely (damageOpCache stays undefined).
  if (hpController) hpController.initEnemyHp(bossMaxHp ?? null);

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

  // ── 2. Skill / input / enemy-action / control seed ingress ──────────────
  // Every event enters DEC via createSkillEvent. Cooldown checks are
  // suppressed for user-placed events (they're allowed to overlap with a
  // warning). Retroactive re-extension in _maybeRegisterStop keeps earlier
  // events correctly extended when later events contribute time-stops.
  const slotIds = slotOperatorMap ? Object.keys(slotOperatorMap) : [];
  const firstSlotOperatorId = slotIds[0] && slotOperatorMap ? slotOperatorMap[slotIds[0]] : undefined;
  const controlSeed = buildControlSeed(slotIds[0], firstSlotOperatorId);
  if (controlSeed) state.createSkillEvent(controlSeed, { checkCooldown: false });
  for (const ev of inputEvents) state.createSkillEvent(ev, { checkCooldown: false });

  // Enemy action events (derived-column, but need to appear in output)
  const enemyActionEvents = derivedEvents.filter(ev => ev.ownerEntityId === ENEMY_ID && ev.columnId === ENEMY_ACTION_COLUMN_ID);
  for (const ev of enemyActionEvents) state.createSkillEvent(ev, { checkCooldown: false });

  // Talent events are registered inside runEventQueue (they need the
  // TriggerIndex to be built first, which depends on the slot map).

  // ── 3. Damage op cache for inline enemy-damage tick push ─────────────────
  // Built once per pipeline run; the interpretor consults it from
  // _pushEnemyDamageTickForFrame to compute per-frame damage and push an
  // incremental tick to hpController as each damage frame fires.
  let damageOpCache: ReadonlyMap<string, import('../calculation/calculationController').DamageOpData> | undefined;
  let enemyDefMult: number | undefined;
  if (bossMaxHp != null && enemyId && slotOperatorMap && loadoutProperties) {
    const slotInfo = Object.entries(slotOperatorMap).map(([slotId, opId]) => ({ slotId, operatorId: opId }));
    damageOpCache = buildDamageOpCache(slotInfo, loadoutProperties, loadouts);
    const modelEnemy = getModelEnemy(enemyId);
    const enemyDef = modelEnemy ? modelEnemy.getDef() : 100;
    enemyDefMult = getDefenseMultiplier(enemyDef);
  }

  // ── 4. Resolve controlled operator + run the queue ─────────────────────
  const getControlledSlotAtFrame = resolveControlledOperator(state.getAllEvents(), slotIds);
  const hpPercentageFn = hpController ? hpController.getEnemyHpPercentage : undefined;
  runEventQueue(state, derivedEvents, loadoutProperties, slotWeapons, slotOperatorMap, slotGearSets,
    hpPercentageFn, getControlledSlotAtFrame, triggerIndex, critMode, overrides,
    damageOpCache, enemyDefMult);

  // ── 5. SP insufficiency-zone seeding ────────────────────────────────────
  // SP graph, stops, zones, UE notifications, HP graph, shield, UE efficiency
  // — all reactive. This is the only post-drain hook left: seed the cost map
  // so the insufficiency-zones reactive recompute covers every slot.
  if (spController && allSlotSpCosts) spController.seedSlotCosts(allSlotSpCosts);

  // ── 6. Output ───────────────────────────────────────────────────────────────
  _lastController = state;
  const processed = state.getProcessedEvents();
  return processed;
}

