/**
 * DerivedEventController — owns all derived events with domain controller methods.
 *
 * Owns the full event lifecycle: registration (with
 * combo chaining and time-stop discovery), duration extension, potential effects,
 * combo trigger resolution, frame position caching, and validation.
 *
 * Domain controllers handle creation/consumption logic:
 * - createInfliction: deque stacking (cap 4), cross-element reaction trigger
 * - createReaction: corrosion merge (max stats, extend duration), non-corrosion refresh
 * - createStatus: stacking behavior (RESET, MERGE), exchange cap, time-stop extension
 * - consumeInfliction: absorb oldest N active
 * - consumeReaction: clamp active reaction
 * - consumeStatus: clamp active in column
 *
 * No external bulk passes — all processing is internal to DerivedEventController methods.
 */
import { TimelineEvent, computeSegmentsSpan, getAnimationDuration, eventDuration, setEventDuration } from '../../consts/viewTypes';
import { NounType, VerbType } from '../../dsl/semantics';
import { EventStatusType, SegmentType, StatusType, TimeDependency } from '../../consts/enums';
import { TimeStopRegion, extendByTimeStops, isTimeStopEvent } from './processTimeStop';
import { flattenEventsToQueueFrames } from './parser/flattenEvents';
import { mergeReactions, attachReactionFrames } from './processInfliction';
import { OPERATOR_COLUMNS, COMBO_WINDOW_COLUMN_ID } from '../../model/channels';
import {
  chainComboPredecessor,
  buildReactionSegments,
  clampPriorControlEvents,
  computeFramePositions,
  type ComboStopEntry,
} from './createSkillEvent';
import { PriorityQueue } from './priorityQueue';
import type { QueueFrame } from './eventQueueTypes';
import type { SlotTriggerWiring } from './eventQueueTypes';
import { findClauseTriggerMatches } from './triggerMatch';
import { getComboTriggerClause, getComboTriggerInfo } from '../gameDataStore';
import type { TriggerAssociation } from '../gameDataStore';
import type { SkillPointController } from '../slot/skillPointController';
import type { UltimateEnergyController } from './ultimateEnergyController';
import { collectNoGainWindowsForEvent } from './ultimateEnergyController';
import type { HPController } from '../calculation/hpController';
import type { ShieldController } from '../calculation/shieldController';
import type { StatAccumulator, StatSource } from '../calculation/statAccumulator';
import type { StatType } from '../../consts/enums';
import { COMMON_OWNER_ID, COMMON_COLUMN_IDS } from '../slot/commonSlotController';
import GENERAL_MECHANICS from '../../model/game-data/generalMechanics.json';
import { getStatusDef, getStatusConfig } from './configCache';
import type { LoadoutProperties } from '../../view/InformationPane';
import type { ColumnHost, EventSource, AddOptions, ConsumeOptions } from './columns/eventColumn';
import { ColumnRegistry } from './columns/columnRegistry';
export type { EventSource } from './columns/eventColumn';
export type { StatSource } from '../calculation/statAccumulator';

// ── Status stack limit cache (from operator status configs) ──────────────────

/**
 * Resolved static stack limit for a status, looked up via `configCache` —
 * the single source of truth for all status configuration. Returns
 * `undefined` when the status has no stack limit at all AND when the limit
 * is a runtime ValueExpression (e.g. status-dependent maxStacks); callers
 * that need the runtime form consult `getStatusConfig(id).maxStacksNode`.
 */
export function getStatusStackLimit(statusId: string): number | undefined {
  return getStatusConfig(statusId)?.maxStacks;
}

export class DerivedEventController implements ColumnHost {
  private stacks = new Map<string, TimelineEvent[]>();
  private registry = new ColumnRegistry(this);
  private registeredEvents: TimelineEvent[] = [];
  private stops: TimeStopRegion[] = [];
  private registeredStopIds = new Set<string>();
  private rawDurations = new Map<string, number>();
  /**
   * Phase 8 step 7e-prep: per-segment raw (pre-extension) duration store for
   * registered skill events. Populated in `_pushToStorage` after the segment
   * deep-clone. `extendSingleEvent` reads raw values from here on every call,
   * making extension idempotent — safe to re-run when a new stop retroactively
   * lands on an already-registered event.
   */
  private rawSegmentDurations = new Map<string, number[]>();
  private comboStops: ComboStopEntry[] = [];
  private queue = new PriorityQueue<QueueFrame>(
    (a, b) => a.frame !== b.frame ? a.frame - b.frame : a.priority - b.priority,
  );
  readonly output: TimelineEvent[] = [];
  private idCounter = 0;
  private triggerAssociations: TriggerAssociation[];
  private slotWirings: SlotTriggerWiring[] = [];
  private controlledSlotResolver?: (frame: number) => string;
  private spController: SkillPointController | null = null;
  private ueController: UltimateEnergyController | null = null;
  private hpController: HPController | null = null;
  private shieldController: ShieldController | null = null;
  private statAccumulator: StatAccumulator | null = null;
  private loadoutProperties: Record<string, LoadoutProperties> = {};
  private slotOperatorMap: Record<string, string> = {};
  /** Event UIDs that consumed Link, mapped to their stack count at consumption time. */
  private linkConsumptions = new Map<string, number>();

  constructor(
    baseEvents?: TimelineEvent[],
    triggerAssociations?: TriggerAssociation[],
    slotWirings?: SlotTriggerWiring[],
    spController?: SkillPointController,
    ueController?: UltimateEnergyController,
    loadoutProperties?: Record<string, LoadoutProperties>,
    slotOperatorMap?: Record<string, string>,
  ) {
    this.triggerAssociations = triggerAssociations ?? [];
    this.slotWirings = slotWirings ?? [];
    this.spController = spController ?? null;
    this.ueController = ueController ?? null;
    this.loadoutProperties = loadoutProperties ?? {};
    this.slotOperatorMap = slotOperatorMap ?? {};
    if (baseEvents) {
      this.registeredEvents = baseEvents;
      for (const ev of baseEvents) {
        this._maybeRegisterStop(ev);
      }
    }
  }

  /**
   * Reset all internal state for the next pipeline run (singleton reuse).
   * Arrays are cleared in-place (.length = 0) so the same references are reused —
   * callers of getProcessedEvents() must copy the result if reference identity matters.
   */
  reset(
    triggerAssociations?: TriggerAssociation[],
    slotWirings?: SlotTriggerWiring[],
    spController?: SkillPointController,
    ueController?: UltimateEnergyController,
    loadoutProperties?: Record<string, LoadoutProperties>,
    slotOperatorMap?: Record<string, string>,
    hpController?: HPController,
    shieldController?: ShieldController,
    statAccumulator?: StatAccumulator,
  ) {
    this.stacks.clear();
    this.registry.clear();
    this.registeredEvents.length = 0;
    this.stops.length = 0;
    this.registeredStopIds.clear();
    this.rawDurations.clear();
    this.rawSegmentDurations.clear();
    this.comboStops.length = 0;
    this.queue.clear();
    (this.output as TimelineEvent[]).length = 0;
    this.idCounter = 0;
    this.linkConsumptions.clear();
    this.controlledSlotResolver = undefined;
    this.triggerAssociations = triggerAssociations ?? [];
    this.slotWirings = slotWirings ?? [];
    this.spController = spController ?? null;
    this.ueController = ueController ?? null;
    this.hpController = hpController ?? null;
    this.shieldController = shieldController ?? null;
    this.statAccumulator = statAccumulator ?? null;
    this.loadoutProperties = loadoutProperties ?? {};
    this.slotOperatorMap = slotOperatorMap ?? {};
  }

  private key(columnId: string, ownerId: string) {
    return `${columnId}:${ownerId}`;
  }

  // ── Resource controller passthroughs (for the interpretor) ──────────────
  //
  // The interpretor reaches the SP/UE controllers via DEC so all effect
  // application has a single hub. These methods are no-ops if the resource
  // controller hasn't been wired in (e.g. cheap test setups).

  recordSkillPointRecovery(frame: number, amount: number, sourceOwnerId: string, sourceSkillName: string) {
    if (this.spController && amount > 0) {
      this.spController.addRecovery(frame, amount, sourceOwnerId, sourceSkillName);
    }
  }

  recordUltimateEnergyGain(frame: number, slotId: string, selfGain: number, teamGain = 0) {
    if (this.ueController && (selfGain > 0 || teamGain > 0)) {
      this.ueController.addUltimateEnergyGain(frame, slotId, selfGain, teamGain);
    }
  }

  // ── Stat accumulator passthroughs ──────────────────────────────────────
  // The interpreter calls these so it doesn't need a direct StatAccumulator
  // reference. All sites are no-ops if the accumulator hasn't been wired in.

  applyStatDelta(entityId: string, delta: Record<string, number>) {
    this.statAccumulator?.applyStatDelta(entityId, delta);
  }

  applyStatMultiplier(entityId: string, stat: StatType, multiplier: number) {
    this.statAccumulator?.applyStatMultiplier(entityId, stat, multiplier);
  }

  pushStatSource(entityId: string, stat: StatType, source: StatSource) {
    this.statAccumulator?.pushStatSource(entityId, stat, source);
  }

  popStatSource(entityId: string, stat: StatType) {
    this.statAccumulator?.popStatSource(entityId, stat);
  }

  snapshotStatDeltas(frameKey: string, entityId: string) {
    this.statAccumulator?.snapshotDeltas(frameKey, entityId);
  }

  getStat(entityId: string, stat: StatType): number {
    return this.statAccumulator?.getStat(entityId, stat) ?? 0;
  }

  hasStatAccumulator(): boolean {
    return this.statAccumulator !== null;
  }

  // ── HP / shield passthroughs ───────────────────────────────────────────

  applyShield(operatorId: string, frame: number, value: number, expirationFrame: number) {
    this.shieldController?.applyShield(operatorId, frame, value, expirationFrame);
  }

  /** Absorb damage through any active shields; returns the residual damage. */
  absorbShield(operatorId: string, frame: number, damage: number): number {
    return this.shieldController
      ? this.shieldController.absorbDamage(operatorId, frame, damage)
      : damage;
  }

  /**
   * Apply HP healing or damage to an operator. Positive `value` heals,
   * negative damages — the existing `hpController.applyHeal` API treats
   * negative heals as damage so we delegate directly.
   */
  recoverHp(operatorId: string, frame: number, value: number) {
    this.hpController?.applyHeal(operatorId, frame, value);
  }

  getOperatorIds(): string[] {
    return this.hpController?.getOperatorIds() ?? [];
  }

  getOperatorPercentageHp(operatorId: string, frame: number): number {
    return this.hpController?.getOperatorPercentageHp(operatorId, frame) ?? 1;
  }

  hasHpController(): boolean {
    return this.hpController !== null;
  }

  hasShieldController(): boolean {
    return this.shieldController !== null;
  }

  // ── Controlled operator seeding ──────────────────────────────────────────

  /**
   * Seed the initial CONTROLLED event for the first occupied operator slot.
   * Must be called before registerEvents so that user-placed swaps clamp
   * this seed during registration. No-op if no slots are occupied.
   */
  // ── Priority queue (Phase 8 step 4: ownership moved into DEC) ───────────

  /** Pop the next queue frame in priority order, or undefined if empty. */
  popNextFrame(): QueueFrame | undefined {
    return this.queue.size > 0 ? this.queue.extractMin()! : undefined;
  }

  /** Insert one or more queue frames. Used by interpret handlers when they generate cascade work. */
  insertQueueFrames(entries: readonly QueueFrame[]) {
    for (const e of entries) this.queue.insert(e);
  }

  get queueSize(): number {
    return this.queue.size;
  }

  // ── Registration ──────────────────────────────────────────────────────────

  /**
   * Phase 8 step 7: single-event ingress. The only path through which events
   * enter DEC's registered-event storage. Runs combo chaining, reaction
   * segmentation, stop discovery (+ retroactive re-extension of overlapping
   * prior events), push-to-storage with deep clone + raw duration capture,
   * time-stop extension, frame position computation, validation, and
   * resource-controller notification — all for a single event.
   *
   * Returns the registered event on success, or null if rejected by cooldown
   * or already registered (uid dedup).
   */
  createSkillEvent(
    ev: TimelineEvent,
    opts: { checkCooldown?: boolean; emitQueueFrames?: boolean } = {},
  ): TimelineEvent | null {
    const checkCooldown = opts.checkCooldown ?? true;
    const emitQueueFrames = opts.emitQueueFrames ?? true;
    if (checkCooldown && this._checkCooldown(ev)) return null;
    // Dedup by uid — prevents double-registration from React strict-mode re-entry.
    if (this.registeredEvents.some(r => r.uid === ev.uid)) return null;

    // Pass 1: combo chaining, reaction segments, stop discovery
    ev = chainComboPredecessor(ev, {
      comboStops: this.comboStops,
      registeredEvents: this.registeredEvents,
      stops: this.stops,
    });
    ev = buildReactionSegments(ev, {
      rawDurations: this.rawDurations,
      foreignStops: this.foreignStopsFor(ev),
    });
    clampPriorControlEvents(ev, this.registeredEvents);
    this._maybeRegisterStop(ev);
    const owned = this._pushToStorage(ev);

    // Pass 2: extension, frame positions, validation, resource notification
    let out = this.extendSingleEvent(owned);
    out = computeFramePositions(out, this.stops);
    out = this.validateTimeStopStart(out);
    const idx = this.registeredEvents.length - 1;
    this.registeredEvents[idx] = out;
    this._validateSiblingOverlap(out);
    this.notifyResourceControllers(out);

    // Pass 3: re-resolve combo trigger columns across the full event set.
    // Runs every ingress because new events can open or merge combo windows
    // reactively; the prior batch pass 3 is gone.
    if (this.slotWirings.length > 0) {
      this.resolveComboTriggersInline();
    }

    // Phase 8 step 7h: emit queue frames for the event as part of ingress,
    // using the current stops set. Later stops discovered by subsequent
    // createSkillEvent calls retroactively re-extend segments (via
    // _maybeRegisterStop) AND reactively shift queued frames (via
    // _shiftQueueForNewStop), so ordering does not matter.
    if (emitQueueFrames) {
      const entries = flattenEventsToQueueFrames([out], this.stops);
      this.insertQueueFrames(entries);
    }

    return out;
  }

  /**
   * Returns true if ev should be rejected due to an active cooldown on the
   * same owner + column at ev.startFrame. Used by reactive creators to
   * silently drop impossible events (e.g. combo trigger firing while the
   * target combo is still on CD).
   */
  private _checkCooldown(ev: TimelineEvent): boolean {
    for (const prev of this.registeredEvents) {
      if (prev.ownerId !== ev.ownerId || prev.columnId !== ev.columnId) continue;
      if (prev.uid === ev.uid) continue;
      const prevEnd = prev.startFrame + computeSegmentsSpan(prev.segments);
      if (prev.startFrame <= ev.startFrame && ev.startFrame < prevEnd) {
        // Only reject when the active range includes a COOLDOWN segment at ev.startFrame
        let cursor = prev.startFrame;
        for (const seg of prev.segments) {
          const segEnd = cursor + seg.properties.duration;
          if (ev.startFrame >= cursor && ev.startFrame < segEnd) {
            if (seg.properties.segmentTypes?.includes(SegmentType.COOLDOWN)) return true;
            break;
          }
          cursor = segEnd;
        }
      }
    }
    return false;
  }



  /**
   * Resolve combo trigger columns inline during registration.
   * Phase 8 step 6a: reactively emits COMBO_WINDOW events via openComboWindow
   * (which merges overlap, handles time-stop extension, and sets
   * comboTriggerColumnId on covered combo events). This is the single source
   * of truth for pass 3; the post-queue batch re-derive in processCombatSimulation
   * still runs as a safety net and will be deleted in 6c.
   */
  private resolveComboTriggersInline() {
    // Fully reconstruct combo windows and comboTriggerColumnId from the
    // current event list. Clear all existing COMBO_WINDOW events and clear
    // combo events' trigger column, then re-emit via openComboWindow so the
    // resolver (if wired) applies to the latest pass.
    this.registeredEvents = this.registeredEvents.filter(
      ev => ev.columnId !== COMBO_WINDOW_COLUMN_ID,
    );
    for (const ev of this.registeredEvents) {
      if (ev.columnId !== NounType.COMBO) continue;
      ev.comboTriggerColumnId = undefined;
      ev.triggerEventUid = undefined;
      ev.triggerStacks = undefined;
    }

    for (const wiring of this.slotWirings) {
      const clause = getComboTriggerClause(wiring.operatorId);
      if (!clause?.length) continue;
      const matches = findClauseTriggerMatches(
        clause, this.registeredEvents, wiring.slotId, this.stops, this.controlledSlotResolver,
      );
      // findClauseTriggerMatches already returns matches sorted by frame.
      for (const match of matches) {
        this.openComboWindow(
          wiring,
          match.frame,
          match.sourceOwnerId,
          match.sourceSkillName,
          match.sourceColumnId,
          match.originOwnerId,
          match.triggerStacks,
          match.sourceEventUid,
        );
      }
    }

    // Phase 8 step 6d: after all windows are emitted for this pass, run the
    // multi-skill CD clamp (truncates earlier combos' CDs to the next combo's
    // start in multi-skill windows) and then clamp window durations to the
    // earliest contained combo-event end. Order matches the former post-queue
    // sequence: clampMultiSkillComboCooldowns → clampComboWindowsToEventEnd.
    this.clampMultiSkillComboCooldowns();
    this.clampComboWindowsToEventEnd();
  }

  /**
   * Reactively open (or extend) a combo activation window on the given slot.
   * Phase 8 step 6a: single source of truth for combo window emission.
   *
   * - Silently drops self-triggers (originOwnerId === wiring.slotId).
   * - Silently drops if the slot's combo skill is on cooldown at triggerFrame.
   * - Extends an existing COMBO_WINDOW event on the same slot when the match
   *   overlaps it (respecting combo-event-end boundary splits — if a combo
   *   event ends between the existing window and the new trigger, they
   *   remain separate).
   * - Otherwise emits a new COMBO_WINDOW TimelineEvent into registeredEvents.
   * - Walks combo events on the slot and sets comboTriggerColumnId /
   *   triggerStacks (first-wins) for any combo that falls inside the window.
   */
  openComboWindow(
    wiring: SlotTriggerWiring,
    triggerFrame: number,
    sourceOwnerId: string,
    sourceSkillName: string,
    sourceColumnId: string | undefined,
    originOwnerId: string | undefined,
    triggerStacks: number | undefined,
    triggerEventUid?: string,
  ): void {
    // Self-trigger skip
    if (originOwnerId === wiring.slotId) return;

    // CD check: if any combo event on this slot is on cooldown at triggerFrame, drop.
    for (const ce of this.registeredEvents) {
      if (ce.columnId !== NounType.COMBO || ce.ownerId !== wiring.slotId) continue;
      const eventSpan = computeSegmentsSpan(ce.segments);
      let preCooldownDur = 0;
      for (const s of ce.segments) {
        if (s.properties.segmentTypes?.includes(SegmentType.COOLDOWN)) break;
        if (s.properties.segmentTypes?.includes(SegmentType.IMMEDIATE_COOLDOWN)) break;
        preCooldownDur += s.properties.duration;
      }
      const hasCooldown = ce.segments.some(s =>
        s.properties.segmentTypes?.includes(SegmentType.COOLDOWN) ||
        s.properties.segmentTypes?.includes(SegmentType.IMMEDIATE_COOLDOWN));
      if (!hasCooldown) continue;
      const isImmediate = ce.segments.some(s =>
        s.properties.segmentTypes?.includes(SegmentType.IMMEDIATE_COOLDOWN));
      const cooldownStart = isImmediate ? ce.startFrame : ce.startFrame + preCooldownDur;
      const cooldownEnd = ce.startFrame + eventSpan;
      if (triggerFrame > cooldownStart && triggerFrame < cooldownEnd) return;
    }

    // Time-stop extension, excluding the slot's own combo-originated stops
    const ownComboStopIds = new Set<string>();
    for (const ev of this.registeredEvents) {
      if (ev.columnId === NounType.COMBO && ev.ownerId === wiring.slotId && isTimeStopEvent(ev)) {
        ownComboStopIds.add(ev.uid);
      }
    }
    const windowStops = ownComboStopIds.size > 0
      ? this.stops.filter(s => !ownComboStopIds.has(s.eventUid))
      : this.stops;
    const info = getComboTriggerInfo(wiring.operatorId);
    const baseDuration = info?.windowFrames ?? 720;
    const extDuration = extendByTimeStops(triggerFrame, baseDuration, windowStops);
    const newEndFrame = triggerFrame + extDuration;

    // Find the latest existing COMBO_WINDOW event on this slot.
    let mergeTarget: TimelineEvent | null = null;
    let latestStart = -1;
    for (const ev of this.registeredEvents) {
      if (ev.columnId !== COMBO_WINDOW_COLUMN_ID || ev.ownerId !== wiring.slotId) continue;
      if (ev.startFrame > latestStart) {
        latestStart = ev.startFrame;
        mergeTarget = ev;
      }
    }
    if (mergeTarget) {
      const mtEnd = mergeTarget.startFrame + computeSegmentsSpan(mergeTarget.segments);
      if (triggerFrame <= mtEnd) {
        // Combo-event-boundary split: if any combo event on this slot ends
        // strictly after the existing window's start and at-or-before the new
        // trigger frame, keep windows separate (matches batch-derive semantics).
        const mt = mergeTarget;
        const comboSplit = this.registeredEvents.some(ce => {
          if (ce.columnId !== NounType.COMBO || ce.ownerId !== wiring.slotId) return false;
          const ceEnd = ce.startFrame + computeSegmentsSpan(ce.segments);
          return ceEnd > mt.startFrame && ceEnd <= triggerFrame;
        });
        if (!comboSplit) {
          const newSpan = Math.max(mtEnd, newEndFrame) - mergeTarget.startFrame;
          if (mergeTarget.segments.length > 0) {
            mergeTarget.segments[0].properties.duration = newSpan;
            mergeTarget.nonOverlappableRange = newSpan;
          }
          this._applyComboWindowToCombos(mergeTarget, wiring.slotId);
          return;
        }
      }
    }

    // Create a new COMBO_WINDOW event and append to registered events.
    const existingCount = this.registeredEvents.reduce(
      (n, ev) => (ev.columnId === COMBO_WINDOW_COLUMN_ID && ev.ownerId === wiring.slotId ? n + 1 : n),
      0,
    );
    const newWindow: TimelineEvent = {
      uid: `combo-window-${wiring.slotId}-${existingCount}-${triggerFrame}`,
      id: COMBO_WINDOW_COLUMN_ID,
      name: COMBO_WINDOW_COLUMN_ID,
      ownerId: wiring.slotId,
      columnId: COMBO_WINDOW_COLUMN_ID,
      startFrame: triggerFrame,
      sourceOwnerId: sourceOwnerId,
      sourceSkillName: sourceSkillName,
      comboTriggerColumnId: sourceColumnId,
      triggerEventUid: triggerEventUid,
      triggerStacks: triggerStacks,
      maxSkills: info?.maxSkills ?? 1,
      segments: [{ properties: { duration: extDuration } }],
    };
    this.registeredEvents.push(newWindow);

    this._applyComboWindowToCombos(newWindow, wiring.slotId);
  }

  /**
   * Walk combo events on the given slot and apply a window's trigger column
   * / trigger stacks to any combo whose startFrame lies within the window.
   * First-wins: does not overwrite an already-set comboTriggerColumnId.
   */
  private _applyComboWindowToCombos(win: TimelineEvent, slotId: string) {
    const winEnd = win.startFrame + computeSegmentsSpan(win.segments);
    for (const ev of this.registeredEvents) {
      if (ev.columnId !== NounType.COMBO || ev.ownerId !== slotId) continue;
      if (ev.startFrame < win.startFrame || ev.startFrame >= winEnd) continue;
      if (ev.comboTriggerColumnId == null && win.comboTriggerColumnId != null) {
        ev.comboTriggerColumnId = win.comboTriggerColumnId;
      }
      if (ev.triggerEventUid == null && win.triggerEventUid != null) {
        ev.triggerEventUid = win.triggerEventUid;
      }
      if (ev.triggerStacks == null && win.triggerStacks != null) {
        ev.triggerStacks = win.triggerStacks;
      }
    }
  }

  /** Build a ValueResolutionContext with loadout properties for runtime VARY_BY resolution. */
  /**
   * Notify SP and UE controllers about resource effects on a newly registered event.
   * Called per-event after extension and frame position computation in pass 2.
   */
  private notifyResourceControllers(ev: TimelineEvent) {
    // ── SP notifications ──────────────────────────────────────────────────
    if (this.spController) {
      // Battle skill with SP cost → event-level cost only.
      // Frame-level RECOVER/RETURN SP is handled by interpret() via DEC.recordSkillPointRecovery
      // when the frame's DSL clause runs; this loop would otherwise double-count it.
      if (ev.columnId === NounType.BATTLE && ev.skillPointCost) {
        const firstFrame = ev.segments[0]?.frames?.[0];
        const ultimateEnergyGainFrame = firstFrame?.absoluteFrame ?? ev.startFrame;
        this.spController.addCost(ev.uid, ev.startFrame, ev.skillPointCost, ev.ownerId, ultimateEnergyGainFrame);
      }

      // SP recovery events (derived from deriveSPRecoveryEvents)
      if (ev.ownerId === COMMON_OWNER_ID && ev.columnId === COMMON_COLUMN_IDS.SKILL_POINTS) {
        this.spController.addSpRecoveryEvent(ev);
      }

      // Perfect dodge → SP recovery
      if (ev.columnId === OPERATOR_COLUMNS.INPUT && ev.isPerfectDodge) {
        this.spController.addRecovery(
          ev.startFrame, GENERAL_MECHANICS.skillPoints.perfectDodgeRecovery,
          ev.ownerId, ev.id,
        );
      }
    }

    // ── UE notifications ──────────────────────────────────────────────────
    // All frame-level UE gains are now routed via interpret() → doRecover →
    // DEC.recordUltimateEnergyGain. The four scan blocks (combo/battle/ultimate
    // frames) and the derived-status sourceOwnerId routing block were deleted
    // as part of Phase 0a — they were the parallel write path that caused the
    // double-UE-gain bug. The interpreter resolves the source slot from
    // ev.sourceOwnerId at handleProcessFrame ctx-build time.
    if (this.ueController) {
      // Ultimate event → consume + no-gain windows (event-level only,
      // frame-level UE gain comes through the clause path)
      if (ev.columnId === NounType.ULTIMATE) {
        this.ueController.addConsume(ev.startFrame, ev.ownerId);
        const windows = collectNoGainWindowsForEvent(ev);
        for (const w of windows) {
          this.ueController.addNoGainWindow(w.start, w.end, ev.ownerId);
        }
      }

      // Status/talent events with IGNORE ULTIMATE_ENERGY clause → self-only UE gain
      if (ev.id && ev.columnId !== NounType.ULTIMATE) {
        const statusDef = getStatusDef(ev.id);
        if (statusDef?.clause) {
          const hasIgnoreUE = (statusDef.clause as { effects?: { verb?: string; object?: string }[] }[])
            .some(c => c.effects?.some(e => e.verb === VerbType.IGNORE && e.object === NounType.ULTIMATE_ENERGY));
          if (hasIgnoreUE) {
            this.ueController.setIgnoreExternalGain(ev.ownerId, true);
          }
        }
      }
    }
  }

  // validateAll() (post-pass) deleted — sibling overlap is now annotated
  // per-event in pass 2 via _validateSiblingOverlap.

  /**
   * Per-event sibling overlap validation. Called from createSkillEvent pass 2.
   * Walks already-registered events with the same (ownerId, columnId, id) and
   * attaches an overlap warning to both `ev` and the sibling if their active
   * ranges overlap. Read-only annotation, not a bulk transformation.
   */
  private _validateSiblingOverlap(ev: TimelineEvent) {
    if (!ev.nonOverlappableRange) {
      // Even if ev itself has no nonOverlappableRange, we still need to check
      // whether ev starts inside an existing sibling's overlap range.
      this._checkOverlapAgainstPriors(ev, /* annotateNew */ true);
      return;
    }
    this._checkOverlapAgainstPriors(ev, /* annotateNew */ true);
  }

  private _checkOverlapAgainstPriors(ev: TimelineEvent, annotateNew: boolean) {
    const evRange = computeSegmentsSpan(ev.segments);
    const evEnd = ev.startFrame + evRange;
    for (const prev of this.registeredEvents) {
      if (prev === ev) continue;
      if (prev.uid === ev.uid) continue;
      if (prev.ownerId !== ev.ownerId || prev.columnId !== ev.columnId || prev.id !== ev.id) continue;
      // Either side's nonOverlappableRange triggers the warning if the spans overlap.
      const prevHasGuard = !!prev.nonOverlappableRange;
      const evHasGuard = !!ev.nonOverlappableRange;
      if (!prevHasGuard && !evHasGuard) continue;
      const prevRange = computeSegmentsSpan(prev.segments);
      const prevEnd = prev.startFrame + prevRange;
      const overlap = prev.startFrame < evEnd && ev.startFrame < prevEnd;
      if (!overlap) continue;
      if (annotateNew) this._appendOverlapWarning(ev);
      this._appendOverlapWarning(prev);
    }
  }

  private _appendOverlapWarning(ev: TimelineEvent) {
    const msg = 'Overlaps with another event in the same column';
    if (ev.warnings?.includes(msg)) return;
    ev.warnings = ev.warnings ? [...ev.warnings, msg] : [msg];
  }

  /** Get all registered events (extended, with transforms applied). */
  getRegisteredEvents(): TimelineEvent[] {
    return this.registeredEvents;
  }

  /** Get slot wirings (for combo window derivation). */
  getSlotWirings(): SlotTriggerWiring[] {
    return this.slotWirings;
  }

  /**
   * Set the controlled-slot resolver used by pass 3 (resolveComboTriggersInline).
   * Called by runEventQueue once the resolver has been computed from registered
   * events, so per-event createSkillEvent pass 3 can filter CONTROLLED OPERATOR
   * combo triggers to the correct slot.
   */
  setControlledSlotResolver(resolver?: (frame: number) => string) {
    this.controlledSlotResolver = resolver;
  }

  /** Get discovered time-stop regions. */
  getStops(): readonly TimeStopRegion[] {
    return this.stops;
  }

  /**
   * Update comboTriggerColumnId + triggerEventUid on a registered combo event
   * (deferred resolution path). Both fields are set together so the
   * `duplicateTriggerSource` interpreter handler can look up the source event
   * by uid (Phase 8 step 7.5 chain-of-action ref).
   */
  setComboTriggerColumnId(eventUid: string, columnId: string, sourceEventUid?: string) {
    for (let i = 0; i < this.registeredEvents.length; i++) {
      if (this.registeredEvents[i].uid === eventUid) {
        // Mutate in-place so PROCESS_FRAME entries referencing this event see the update
        this.registeredEvents[i].comboTriggerColumnId = columnId;
        if (sourceEventUid != null) this.registeredEvents[i].triggerEventUid = sourceEventUid;
        return;
      }
    }
  }

  /**
   * Get all registered events with reactions merged and reaction frames attached.
   * This is the final output for the view layer — replaces external mergeReactions + attachReactionFrames calls.
   */
  getProcessedEvents(): TimelineEvent[] {
    return attachReactionFrames(mergeReactions(this.registeredEvents));
  }

  /** Get all events (registered + queue-created). */
  getAllEvents(): TimelineEvent[] {
    return [...this.registeredEvents, ...this.output];
  }

  /** Get combo chaining state (debug). */
  getComboStops(): readonly ComboStopEntry[] {
    return this.comboStops;
  }

  /** Get queue-created events (debug). */
  getQueueOutput(): readonly TimelineEvent[] {
    return this.output;
  }

  /**
   * Check which trigger associations match a given event.
   * Returns associations whose triggerClause conditions could be satisfied
   * by the event's column/name/owner. Actual condition evaluation deferred to Phase 2.
   */
  checkTriggerAssociations(event: TimelineEvent): TriggerAssociation[] {
    if (this.triggerAssociations.length === 0) return [];
    return this.triggerAssociations.filter(assoc =>
      assoc.triggerClause.some(clause =>
        clause.conditions.some(cond =>
          cond.object === event.id || cond.object === event.columnId
        )
      )
    );
  }

  /** Get the base (pre-time-stop) activation duration for an event, or undefined if not extended. */
  getBaseDuration(eventId: string): number | undefined {
    return this.rawDurations.get(eventId);
  }

  /** Merge raw durations from another controller (e.g. queue controller into main state). */
  mergeRawDurations(other: DerivedEventController) {
    other.rawDurations.forEach((dur, id) => {
      if (!this.rawDurations.has(id)) this.rawDurations.set(id, dur);
    });
  }

  /** Replace the registered events array (e.g. after late combo trigger resolution). */
  replaceEvents(events: TimelineEvent[]) {
    this.registeredEvents = events;
  }

  // ── ColumnHost interface ────────────────────────────────────────────────

  /** Get all active (non-consumed) events for a column+owner at a frame. */
  activeEventsIn(columnId: string, ownerId: string, frame: number): TimelineEvent[] {
    return this._activeEventsIn(columnId, ownerId, frame);
  }

  /** Count active events for a column+owner at a frame. */
  activeCount(columnId: string, ownerId: string, frame: number) {
    return this._activeEventsIn(columnId, ownerId, frame).length;
  }

  /** Extend a raw game-time duration by active time-stop regions. */
  extendDuration(startFrame: number, rawDuration: number, eventUid?: string) {
    return this._extendDuration(startFrame, rawDuration, eventUid);
  }

  /** Register a raw (pre-extension) duration for later re-extension. */
  trackRawDuration(uid: string, rawDuration: number) {
    this.rawDurations.set(uid, rawDuration);
  }

  /** Insert an event: extend duration, push to stacks + output, register stop if applicable. */
  pushEvent(event: TimelineEvent, rawDuration: number) {
    const extDur = this._extendDuration(event.startFrame, rawDuration, event.uid);
    setEventDuration(event, extDur);
    this.rawDurations.set(event.uid, rawDuration);
    const key = this.key(event.columnId, event.ownerId);
    const existing = this.stacks.get(key) ?? [];
    existing.push(event);
    this.stacks.set(key, existing);
    this.output.push(event);
    if (this._maybeRegisterStop(event)) {
      this.reExtendQueueEvents();
    }
  }

  /** Insert an already-extended event directly (no duration extension). */
  pushEventDirect(event: TimelineEvent) {
    const key = this.key(event.columnId, event.ownerId);
    const existing = this.stacks.get(key) ?? [];
    existing.push(event);
    this.stacks.set(key, existing);
    this.output.push(event);
  }

  /** Push an event to output only (e.g. consumed copies for freeform state tracking). */
  pushToOutput(event: TimelineEvent) {
    this.output.push(event);
  }

  /** Delegate creation to another column (cross-column side effects). */
  applyToColumn(columnId: string, ownerId: string, frame: number, durationFrames: number,
    source: EventSource, options?: AddOptions): boolean {
    return this.registry.get(columnId).add(ownerId, frame, durationFrames, source, options);
  }

  /** Delegate consumption to another column. */
  consumeFromColumn(columnId: string, ownerId: string, frame: number,
    source: EventSource, options?: ConsumeOptions): number {
    return this.registry.get(columnId).consume(ownerId, frame, source, options);
  }

  /** Get foreign time-stop regions for reaction segment building. */
  foreignStopsFor(event: TimelineEvent): readonly TimeStopRegion[] {
    return isTimeStopEvent(event) ? this.stops.filter(s => s.eventUid !== event.uid) : this.stops;
  }

  // ── Domain Controllers ──────────────────────────────────────────────────

  /** Apply (create) an event on a column. Routes to the appropriate EventColumn. */
  applyEvent(
    columnId: string, ownerId: string, frame: number,
    durationFrames: number, source: EventSource,
    options?: AddOptions,
  ): boolean {
    return this.registry.get(columnId).add(ownerId, frame, durationFrames, source, options);
  }

  /** Consume events on a column. Routes to the appropriate EventColumn. */
  consumeEvent(
    columnId: string, ownerId: string, frame: number,
    source: EventSource, options?: ConsumeOptions,
  ): number {
    return this.registry.get(columnId).consume(ownerId, frame, source, options);
  }

  /** Check if an event can be applied on a column. */
  canApplyEvent(columnId: string, ownerId: string, frame: number): boolean {
    return this.registry.get(columnId).canAdd(ownerId, frame);
  }

  /** Check if events can be consumed on a column. */
  canConsumeEvent(columnId: string, ownerId: string, frame: number): boolean {
    return this.registry.get(columnId).canConsume(ownerId, frame);
  }

  /** No-op — stagger is display-only. */
  createStagger(_columnId: string, _ownerId: string, _frame: number, _value: number, _source: EventSource) {}

  // ── Link consumption tracking ──────────────────────────────────────────

  /** Consume Link for a battle skill/ultimate. Records stack count against event UID. */
  consumeLink(eventUid: string, frame: number, source: EventSource): number {
    const linkColumnId = StatusType.LINK;
    const isLink = (ev: TimelineEvent) => ev.id === StatusType.LINK;
    const linkEvents = this._activeEventsIn(linkColumnId, COMMON_OWNER_ID, frame)
      .filter(isLink);
    if (linkEvents.length === 0) return 0;
    this.clampActiveFiltered(linkColumnId, COMMON_OWNER_ID, frame, source, EventStatusType.CONSUMED, isLink);
    const clampedStacks = Math.min(linkEvents.length, 4);
    this.linkConsumptions.set(eventUid, clampedStacks);
    return clampedStacks;
  }

  getLinkStacks(eventUid: string): number {
    return this.linkConsumptions.get(eventUid) ?? 0;
  }

  /** Append ev to the registered events array. */
  private _pushToStorage(ev: TimelineEvent): TimelineEvent {
    // Deep-clone segments (and frame markers) into DEC-owned copies so
    // pipeline mutations (duration extension, frame marker positioning) do
    // not leak back to the raw React state the event originated from.
    // After this point the event is DEC-owned and may be mutated in place.
    const segments = ev.segments.map(s => ({
      ...s,
      properties: { ...s.properties },
      ...(s.frames ? { frames: s.frames.map(f => ({ ...f })) } : {}),
    }));
    const owned: TimelineEvent = { ...ev, segments };
    // Capture raw (pre-extension) segment durations for fresh skill events
    // only. Events already tracked by rawDurations (the single-total map)
    // came in via pushEvent mid-queue — their durations may already be
    // extended and/or consumption-truncated. For those, skip
    // rawSegmentDurations entirely so extendSingleEvent is a no-op on them
    // (pre-existing behavior: queue events are not re-extended here).
    if (!this.rawDurations.has(owned.uid)) {
      this.rawSegmentDurations.set(owned.uid, segments.map(s => s.properties.duration));
    }
    this.registeredEvents.push(owned);
    return owned;
  }

  // ── Time-stop management ─────────────────────────────────────────────────

  private _maybeRegisterStop(ev: TimelineEvent): boolean {
    if (!isTimeStopEvent(ev)) return false;
    if (this.registeredStopIds.has(ev.uid)) return false;
    this.registeredStopIds.add(ev.uid);
    const startFrame = ev.startFrame;
    const durationFrames = getAnimationDuration(ev);
    this.stops.push({ startFrame, durationFrames, eventUid: ev.uid });
    this.stops.sort((a, b) => a.startFrame - b.startFrame);
    // Phase 8 step 7e-prep: retroactive re-extension. When a new stop is
    // registered after other skill events have already been pushed, walk
    // events in rawSegmentDurations whose active range overlaps the new
    // stop and re-run extendSingleEvent + computeFramePositions. Because
    // extension reads raw from rawSegmentDurations and mutates in place
    // idempotently, this is safe to run at any time.
    if (durationFrames > 0) {
      const stopEnd = startFrame + durationFrames;
      for (let i = 0; i < this.registeredEvents.length; i++) {
        const other = this.registeredEvents[i];
        if (other.uid === ev.uid) continue;
        if (!this.rawSegmentDurations.has(other.uid)) continue;
        const otherEnd = other.startFrame + eventDuration(other);
        if (other.startFrame < stopEnd && otherEnd > startFrame) {
          this.extendSingleEvent(other);
          computeFramePositions(other, this.stops);
        }
      }
    }
    // Phase 8 step 5: reactive shift. When a stop is discovered while the
    // queue is mid-drain, every queued frame whose source event's active
    // range overlaps the stop AND whose current frame > startFrame must be
    // shifted by the stop duration so it lands at the correct extended time.
    // No-op when the queue is empty (pre-pass registerEvents path), so
    // existing batch behavior is preserved.
    if (this.queue.size > 0 && durationFrames > 0) {
      this._shiftQueueForNewStop(startFrame, durationFrames, ev.uid);
    }
    return true;
  }

  /**
   * Walk the queue and shift entries past a newly-registered stop.
   * Excludes entries belonging to the stop's own event (a stop does not
   * extend itself), and only shifts entries strictly after `startFrame`.
   */
  private _shiftQueueForNewStop(startFrame: number, durationFrames: number, ownStopEventUid: string) {
    const entries = this.queue.toArray();
    let shifted = false;
    for (const e of entries) {
      if (e.frame <= startFrame) continue;
      if (e.sourceEvent && e.sourceEvent.uid === ownStopEventUid) continue;
      e.frame += durationFrames;
      shifted = true;
    }
    if (shifted) this.queue.reheapify();
  }

  private _extendDuration(startFrame: number, rawDuration: number, eventUid?: string) {
    const foreign = eventUid && this.registeredStopIds.has(eventUid)
      ? this.stops.filter(s => s.eventUid !== eventUid)
      : this.stops;
    return extendByTimeStops(startFrame, rawDuration, foreign);
  }

  /**
   * Extend a single event's durations by foreign time-stops.
   * Handles segmented events, 3-phase events, and time-stop events.
   */
  /**
   * Phase 8 step 7e-prep: idempotent per-segment extension.
   *
   * Reads raw segment durations from `rawSegmentDurations` (populated in
   * `_pushToStorage` after a deep clone), computes extended durations
   * against the current stops list, and mutates the event's segments in
   * place. Safe to re-run whenever a new stop retroactively lands on an
   * already-registered event — always starts from raw.
   */
  private extendSingleEvent(ev: TimelineEvent): TimelineEvent {
    // Control status is not affected by time-stops — its timer keeps ticking
    if (ev.id === NounType.CONTROL) return ev;

    const raw = this.rawSegmentDurations.get(ev.uid);
    if (!raw || ev.segments.length === 0) return ev;

    const isOwn = isTimeStopEvent(ev);
    const animDur = getAnimationDuration(ev);
    const foreignStops = isOwn
      ? this.stops.filter(s => s.eventUid !== ev.uid)
      : this.stops;

    if (foreignStops.length === 0) {
      // Restore raw durations (idempotent reset)
      for (let i = 0; i < ev.segments.length; i++) {
        ev.segments[i].properties.duration = raw[i];
      }
      return ev;
    }

    let rawOffset = 0;
    let derivedOffset = 0;
    for (let i = 0; i < ev.segments.length; i++) {
      const seg = ev.segments[i];
      const rawDur = raw[i];
      const rawSegStart = rawOffset;
      rawOffset += rawDur;

      if (seg.properties.timeDependency === TimeDependency.REAL_TIME || rawDur === 0) {
        seg.properties.duration = rawDur;
        derivedOffset += rawDur;
        continue;
      }

      if (isOwn && animDur > 0 && rawSegStart + rawDur <= animDur) {
        seg.properties.duration = rawDur;
        derivedOffset += rawDur;
        continue;
      }

      let ext: number;
      if (isOwn && animDur > 0 && rawSegStart < animDur) {
        const animPortion = animDur - rawSegStart;
        const postAnimPortion = rawDur - animPortion;
        ext = animPortion + extendByTimeStops(ev.startFrame + animDur, postAnimPortion, foreignStops);
      } else {
        ext = extendByTimeStops(ev.startFrame + derivedOffset, rawDur, foreignStops);
      }

      seg.properties.duration = ext;
      derivedOffset += ext;
    }
    return ev;
  }

  private reExtendQueueEvents() {
    this.stacks.forEach((events) => {
      for (const ev of events) {
        if (ev.eventStatus === EventStatusType.CONSUMED || ev.eventStatus === EventStatusType.REFRESHED) continue;
        if (ev.eventStatus === EventStatusType.EXTENDED) continue;
        const raw = this.rawDurations.get(ev.uid);
        if (raw == null) continue;
        setEventDuration(ev, this._extendDuration(ev.startFrame, raw, ev.uid));
      }
    });
  }

  /**
   * Per-event time-stop start validation. Checks if an event starts inside
   * a time-stop region and attaches warnings. Called inline during registration.
   */
  private validateTimeStopStart(ev: TimelineEvent): TimelineEvent {
    if (this.stops.length === 0) return ev;
    const warnings: string[] = [];
    for (const stop of this.stops) {
      if (stop.eventUid === ev.uid) continue;
      const stopEnd = stop.startFrame + stop.durationFrames;
      if (ev.startFrame <= stop.startFrame || ev.startFrame >= stopEnd) continue;

      // Look up source event to determine stop type
      const source = this.registeredEvents.find(e => e.uid === stop.eventUid);
      if (!source) continue;

      // Control swap cannot occur during any time-stop (including dodge)
      if (ev.id === NounType.CONTROL) {
        warnings.push('Control swap cannot occur during time-stop');
        continue;
      }

      const sourceIsDodge = source.columnId === OPERATOR_COLUMNS.INPUT && !!source.isPerfectDodge;
      if (sourceIsDodge) continue;

      const sourceIsUltimate = source.columnId === NounType.ULTIMATE;
      if (ev.columnId === NounType.COMBO && sourceIsUltimate) {
        warnings.push('Combo skill cannot start during ultimate animation time-stop');
      }
      if (ev.columnId === NounType.ULTIMATE && sourceIsUltimate) {
        warnings.push("Ultimate cannot start during another ultimate's animation time-stop");
      }
    }
    if (warnings.length === 0) return ev;
    ev.warnings = ev.warnings ? [...ev.warnings, ...warnings] : warnings;
    return ev;
  }

  // ── Active event queries ─────────────────────────────────────────────────

  private _activeEventsIn(columnId: string, ownerId: string, frame: number): TimelineEvent[] {
    const result: TimelineEvent[] = [];
    const queueEvents = this.stacks.get(this.key(columnId, ownerId)) ?? [];
    for (const ev of queueEvents) {
      if (ev.eventStatus === EventStatusType.CONSUMED) continue;
      if (ev.startFrame <= frame && frame < ev.startFrame + eventDuration(ev)) result.push(ev);
    }
    for (const ev of this.registeredEvents) {
      if (ev.columnId !== columnId || ev.ownerId !== ownerId) continue;
      if (ev.eventStatus === EventStatusType.CONSUMED) continue;
      if (ev.startFrame <= frame && frame < ev.startFrame + eventDuration(ev)) result.push(ev);
    }
    return result;
  }

  /** Public query: get active events at a frame for a column+owner. */
  getActiveEvents(columnId: string, ownerId: string, frame: number): TimelineEvent[] {
    return this._activeEventsIn(columnId, ownerId, frame);
  }

  /** Check if a given operator is the controlled operator at a given frame. */
  isControlledAt(ownerId: string, frame: number): boolean {
    return this._activeEventsIn(OPERATOR_COLUMNS.INPUT, ownerId, frame)
      .some((ev) => ev.id === NounType.CONTROL);
  }

  // ── Generic event insertion ──────────────────────────────────────────────

  addEvent(ev: TimelineEvent) {
    const rawDur = eventDuration(ev);
    if (rawDur > 0) {
      setEventDuration(ev, this._extendDuration(ev.startFrame, rawDur, ev.uid));
    }
    this.rawDurations.set(ev.uid, rawDur);
    const key = this.key(ev.columnId, ev.ownerId);
    const existing = this.stacks.get(key) ?? [];
    existing.push(ev);
    this.stacks.set(key, existing);
    this.output.push(ev);
    if (this._maybeRegisterStop(ev)) {
      this.reExtendQueueEvents();
    }
  }

  /** Clamp the oldest active event in a column to make room for a new stack. */
  private resetOldest(columnId: string, ownerId: string, frame: number, source: EventSource) {
    const active = this._activeEventsIn(columnId, ownerId, frame)
      .sort((a, b) => a.startFrame - b.startFrame);
    if (active.length > 0) {
      const oldest = active[0];
      setEventDuration(oldest, frame - oldest.startFrame);
      oldest.eventStatus = EventStatusType.REFRESHED;
      oldest.eventStatusOwnerId = source.ownerId;
      oldest.eventStatusSkillName = source.skillName;
    }
  }

  /** Clamp all active events in a column — set status and truncate duration. */
  resetStatus(columnId: string, ownerId: string, frame: number, source: EventSource) {
    this.clampActive(columnId, ownerId, frame, source, EventStatusType.REFRESHED);
  }

  /**
   * Reset a skill event's cooldown segment at a given frame.
   * Truncates the Cooldown segment so the event ends at resetFrame.
   */
  /**
   * For each multi-skill activation window, clamp earlier combo cooldowns
   * so they end where the next combo starts. Called after windows are registered.
   */
  clampMultiSkillComboCooldowns() {
    // Find all multi-skill windows
    const windows = this.registeredEvents.filter(
      (ev) => ev.columnId === COMBO_WINDOW_COLUMN_ID && (ev.maxSkills ?? 1) > 1,
    );
    if (windows.length === 0) return;

    for (const win of windows) {
      const winEnd = win.startFrame + computeSegmentsSpan(win.segments);
      // Find all combo events in this window, sorted by startFrame
      const combos = this.registeredEvents
        .filter((ev) =>
          ev.columnId === NounType.COMBO &&
          ev.ownerId === win.ownerId &&
          ev.startFrame >= win.startFrame &&
          ev.startFrame < winEnd,
        )
        .sort((a, b) => a.startFrame - b.startFrame);

      // Clamp each combo's cooldown to end at the next combo's start
      for (let i = 0; i < combos.length - 1; i++) {
        this.resetCooldown(combos[i].uid, combos[i + 1].startFrame);
      }
    }
  }

  resetCooldown(eventUid: string, resetFrame: number) {
    for (let i = 0; i < this.registeredEvents.length; i++) {
      if (this.registeredEvents[i].uid !== eventUid) continue;
      const ev = this.registeredEvents[i];
      let preCooldownDur = 0;
      for (const s of ev.segments) {
        if (s.properties.name === 'Cooldown') {
          // IMMEDIATE_COOLDOWN starts at event offset 0, so don't subtract pre-cooldown duration
          const isImmediate = s.properties.segmentTypes?.includes(SegmentType.IMMEDIATE_COOLDOWN);
          s.properties.duration = Math.max(0, resetFrame - ev.startFrame - (isImmediate ? 0 : preCooldownDur));
        } else {
          preCooldownDur += s.properties.duration;
        }
      }
      ev.nonOverlappableRange = computeSegmentsSpan(ev.segments);
      return;
    }
  }

  reduceCooldown(eventUid: string, newCooldownDuration: number) {
    for (let i = 0; i < this.registeredEvents.length; i++) {
      if (this.registeredEvents[i].uid !== eventUid) continue;
      const ev = this.registeredEvents[i];
      for (const s of ev.segments) {
        if (s.properties.name === 'Cooldown') {
          s.properties.duration = Math.max(0, newCooldownDuration);
        }
      }
      ev.nonOverlappableRange = computeSegmentsSpan(ev.segments);
      return;
    }
  }

  /**
   * Clamp combo activation windows so they don't extend past the combo event's end.
   * Called after the queue run when CD resets may have shortened combo events.
   */
  clampComboWindowsToEventEnd() {
    const windows = this.registeredEvents.filter(ev => ev.columnId === COMBO_WINDOW_COLUMN_ID);
    for (const win of windows) {
      const winEnd = win.startFrame + computeSegmentsSpan(win.segments);
      const combos = this.registeredEvents.filter(ev =>
        ev.columnId === NounType.COMBO &&
        ev.ownerId === win.ownerId &&
        ev.startFrame >= win.startFrame &&
        ev.startFrame < winEnd,
      );
      if (combos.length === 0) continue;
      // Use the earliest combo end that falls before the window end (the CD-reset combo)
      const comboEnds = combos.map(c => c.startFrame + computeSegmentsSpan(c.segments)).filter(e => e < winEnd);
      if (comboEnds.length === 0) continue;
      const clampEnd = Math.min(...comboEnds);
      if (win.segments.length > 0) {
        win.segments[0].properties.duration = Math.max(0, clampEnd - win.startFrame);
      }
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────

  /** Clamp all active events at frame in a column: truncate duration and set status. */
  private clampActive(
    columnId: string, ownerId: string, frame: number,
    source: EventSource, status: EventStatusType,
  ) {
    const queueEvents = this.stacks.get(this.key(columnId, ownerId)) ?? [];
    for (const ev of queueEvents) {
      if (ev.eventStatus === EventStatusType.CONSUMED) continue;
      const end = ev.startFrame + eventDuration(ev);
      if (ev.startFrame <= frame && frame < end) {
        setEventDuration(ev, frame - ev.startFrame);
        ev.eventStatus = status;
        ev.eventStatusOwnerId = source.ownerId;
        ev.eventStatusSkillName = source.skillName;
      }
    }
    for (const ev of this.registeredEvents) {
      if (ev.columnId !== columnId || ev.ownerId !== ownerId) continue;
      if (ev.eventStatus === EventStatusType.CONSUMED) continue;
      const end = ev.startFrame + eventDuration(ev);
      if (ev.startFrame <= frame && frame < end) {
        setEventDuration(ev, frame - ev.startFrame);
        ev.eventStatus = status;
        ev.eventStatusOwnerId = source.ownerId;
        ev.eventStatusSkillName = source.skillName;
      }
    }
  }

  /** Clamp only active events matching a predicate in a column. */
  private clampActiveFiltered(
    columnId: string, ownerId: string, frame: number,
    source: EventSource, status: EventStatusType, predicate: (ev: TimelineEvent) => boolean,
  ) {
    const queueEvents = this.stacks.get(this.key(columnId, ownerId)) ?? [];
    for (const ev of queueEvents) {
      if (!predicate(ev)) continue;
      if (ev.eventStatus === EventStatusType.CONSUMED) continue;
      const end = ev.startFrame + eventDuration(ev);
      if (ev.startFrame <= frame && frame < end) {
        setEventDuration(ev, frame - ev.startFrame);
        ev.eventStatus = status;
        ev.eventStatusOwnerId = source.ownerId;
        ev.eventStatusSkillName = source.skillName;
      }
    }
    for (const ev of this.registeredEvents) {
      if (ev.columnId !== columnId || ev.ownerId !== ownerId) continue;
      if (!predicate(ev)) continue;
      if (ev.eventStatus === EventStatusType.CONSUMED) continue;
      const end = ev.startFrame + eventDuration(ev);
      if (ev.startFrame <= frame && frame < end) {
        setEventDuration(ev, frame - ev.startFrame);
        ev.eventStatus = status;
        ev.eventStatusOwnerId = source.ownerId;
        ev.eventStatusSkillName = source.skillName;
      }
    }
  }
}