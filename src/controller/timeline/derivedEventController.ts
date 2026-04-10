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
import { NounType } from '../../dsl/semantics';
import { EventStatusType, SegmentType, StatType, StatusType, TimeDependency } from '../../consts/enums';
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
import { TEAM_ID, COMMON_COLUMN_IDS } from '../slot/commonSlotController';
import GENERAL_MECHANICS from '../../model/game-data/generalMechanics.json';
import { getStatusConfig } from './configCache';
import type { LoadoutProperties } from '../../view/InformationPane';
import type { ColumnHost, EventSource, AddOptions, ConsumeOptions } from './columns/eventColumn';
import { ColumnRegistry } from './columns/columnRegistry';
import { CausalityGraph } from './causalityGraph';
import { EdgeKind } from '../../consts/enums';
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
  private allEvents: TimelineEvent[] = [];
  private stops: TimeStopRegion[] = [];
  private registeredStopIds = new Set<string>();
  private rawDurations = new Map<string, number>();
  /**
   * Causality DAG — child uid → ordered parent uids. Side-car to the event
   * storage so events can be mutated/pooled without dangling references,
   * and multi-parent cases (reactions with multiple source inflictions)
   * are natively representable. Populated at ingress sites in Phase 2;
   * Phase 1 leaves it empty and relies on the `_ingest` owner backfill.
   */
  private causality = new CausalityGraph();
  /**
   * per-segment raw (pre-extension) duration store for
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
  // state.output removed — registeredEvents is the single source of storage.
  private triggerAssociations: TriggerAssociation[] = [];
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

  // No constructor — all state wired via reset() per pipeline run.


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
    this.allEvents.length = 0;
    this.stops.length = 0;
    this.registeredStopIds.clear();
    this.rawDurations.clear();
    this.rawSegmentDurations.clear();
    this.causality.clear();
    this.comboStops.length = 0;
    this.queue.clear();
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

  private key(columnId: string, ownerEntityId: string) {
    return `${columnId}:${ownerEntityId}`;
  }

  // ── Resource controller passthroughs (for the interpretor) ──────────────
  //
  // The interpretor reaches the SP/UE controllers via DEC so all effect
  // application has a single hub. These methods are no-ops if the resource
  // controller hasn't been wired in (e.g. cheap test setups).

  recordSkillPointRecovery(frame: number, amount: number, sourceEntityId: string, sourceSkillName: string) {
    if (this.spController && amount > 0) {
      this.spController.addRecovery(frame, amount, sourceEntityId, sourceSkillName);
    }
  }

  /**
   * Mark a slot as ignoring external UE gains. Routed from interpret() when
   * an IGNORE ULTIMATE_ENERGY effect fires (typically from a status def's
   * clause during runStatusCreationLifecycle), so the flag takes effect at
   * status creation time — not at post-drain re-registration.
   */
  setIgnoreExternalGain(slotId: string, ignore: boolean) {
    if (this.ueController) this.ueController.setIgnoreExternalGain(slotId, ignore);
  }

  /**
   * Push an incremental enemy damage tick to hpController. Called from
   * `handleProcessFrame` per damage frame marker as the queue drains.
   */
  addEnemyDamageTick(frame: number, damage: number) {
    this.hpController?.addEnemyDamageTick(frame, damage);
  }

  recordUltimateEnergyGain(frame: number, slotId: string, selfGain: number, teamGain = 0) {
    if (!this.ueController) return;
    if (selfGain <= 0 && teamGain <= 0) return;
    // Snapshot per-recipient ultimate gain efficiency from the stat accumulator
    // AT THIS FRAME, so a boost activating at frame 200 doesn't retroactively
    // scale gains from frames 0-199.
    let slotEfficiencies: Map<string, number> | undefined;
    if (this.statAccumulator) {
      slotEfficiencies = new Map();
      for (const recipientSlotId of Object.keys(this.slotOperatorMap)) {
        slotEfficiencies.set(
          recipientSlotId,
          this.statAccumulator.getStat(recipientSlotId, StatType.ULTIMATE_GAIN_EFFICIENCY),
        );
      }
    }
    this.ueController.addUltimateEnergyGain(frame, slotId, selfGain, teamGain, slotEfficiencies);
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
  // ── Priority queue (ownership moved into DEC) ───────────

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
   * single-event ingress. The only path through which events
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
    if (this.allEvents.some(r => r.uid === ev.uid)) return null;

    // Pass 1: combo chaining, reaction segments, stop discovery
    ev = chainComboPredecessor(ev, {
      comboStops: this.comboStops,
      allEvents: this.allEvents,
      stops: this.stops,
    });
    ev = buildReactionSegments(ev, {
      rawDurations: this.rawDurations,
      foreignStops: this.foreignStopsFor(ev),
    });
    clampPriorControlEvents(ev, this.allEvents);
    const owned = this._ingest(ev, { deepClone: true, captureRaw: true });

    // Pass 2: extension, frame positions, validation, resource notification
    let out = this.extendSingleEvent(owned);
    out = computeFramePositions(out, this.stops);
    out = this.validateTimeStopStart(out);
    const idx = this.allEvents.length - 1;
    this.allEvents[idx] = out;
    this._validateSiblingOverlap(out);
    this.notifyResourceControllers(out);

    // Pass 3: re-resolve combo trigger columns across the full event set.
    // Runs every ingress because new events can open or merge combo windows
    // reactively; the prior batch pass 3 is gone.
    if (this.slotWirings.length > 0) {
      this.resolveComboTriggersInline();
    }

    // Emit queue frames for this event using the current stops set. Stops
    // discovered by later createSkillEvent calls retroactively re-extend
    // segments (via _maybeRegisterStop) and reactively shift already-queued
    // frames (via _shiftQueueForNewStop), so ingress order doesn't matter.
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
    for (const prev of this.allEvents) {
      if (prev.ownerEntityId !== ev.ownerEntityId || prev.columnId !== ev.columnId) continue;
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
   * reactively emits COMBO_WINDOW events via openComboWindow
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
    this.allEvents = this.allEvents.filter(
      ev => ev.columnId !== COMBO_WINDOW_COLUMN_ID,
    );
    for (const ev of this.allEvents) {
      if (ev.columnId !== NounType.COMBO) continue;
      ev.comboTriggerColumnId = undefined;
      ev.triggerEventUid = undefined;
      ev.triggerStacks = undefined;
    }

    for (const wiring of this.slotWirings) {
      const clause = getComboTriggerClause(wiring.operatorId);
      if (!clause?.length) continue;
      const matches = findClauseTriggerMatches(
        clause, this.allEvents, wiring.slotId, this.stops, this.controlledSlotResolver,
      );
      // findClauseTriggerMatches already returns matches sorted by frame.
      for (const match of matches) {
        this.openComboWindow(
          wiring,
          match.frame,
          match.sourceEntityId,
          match.sourceSkillName,
          match.sourceColumnId,
          match.originEntityId,
          match.triggerStacks,
          match.sourceEventUid,
        );
      }
    }

    // After all windows are emitted, run the multi-skill CD clamp
    // (truncates earlier combos' CDs to the next combo's start in
    // multi-skill windows) then clamp window durations to the earliest
    // contained combo-event end.
    this.clampMultiSkillComboCooldowns();
    this.clampComboWindowsToEventEnd();
  }

  /**
   * Reactively open (or extend) a combo activation window on the given slot.
   * Single source of truth for combo window emission.
   *
   * - Silently drops self-triggers (originEntityId === wiring.slotId).
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
    sourceEntityId: string,
    sourceSkillName: string,
    sourceColumnId: string | undefined,
    originEntityId: string | undefined,
    triggerStacks: number | undefined,
    triggerEventUid?: string,
  ): void {
    // Self-trigger skip
    if (originEntityId === wiring.slotId) return;

    // CD check: if any combo event on this slot is on cooldown at triggerFrame, drop.
    for (const ce of this.allEvents) {
      if (ce.columnId !== NounType.COMBO || ce.ownerEntityId !== wiring.slotId) continue;
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
    for (const ev of this.allEvents) {
      if (ev.columnId === NounType.COMBO && ev.ownerEntityId === wiring.slotId && isTimeStopEvent(ev)) {
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
    for (const ev of this.allEvents) {
      if (ev.columnId !== COMBO_WINDOW_COLUMN_ID || ev.ownerEntityId !== wiring.slotId) continue;
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
        const comboSplit = this.allEvents.some(ce => {
          if (ce.columnId !== NounType.COMBO || ce.ownerEntityId !== wiring.slotId) return false;
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
    const existingCount = this.allEvents.reduce(
      (n, ev) => (ev.columnId === COMBO_WINDOW_COLUMN_ID && ev.ownerEntityId === wiring.slotId ? n + 1 : n),
      0,
    );
    const newWindow: TimelineEvent = {
      uid: `combo-window-${wiring.slotId}-${existingCount}-${triggerFrame}`,
      id: COMBO_WINDOW_COLUMN_ID,
      name: COMBO_WINDOW_COLUMN_ID,
      ownerEntityId: wiring.slotId,
      columnId: COMBO_WINDOW_COLUMN_ID,
      startFrame: triggerFrame,
      sourceEntityId: sourceEntityId,
      sourceSkillName: sourceSkillName,
      // Combo windows bypass _ingest (intentional — they're markers, not
      // real events), so we stamp owner fields + causality link inline.
      ownerSlotId: wiring.slotId,
      ownerOperatorId: this.slotOperatorMap[wiring.slotId] ?? wiring.slotId,
      comboTriggerColumnId: sourceColumnId,
      triggerEventUid: triggerEventUid,
      triggerStacks: triggerStacks,
      maxSkills: info?.maxSkills ?? 1,
      segments: [{ properties: { duration: extDuration } }],
    };
    this.allEvents.push(newWindow);
    if (triggerEventUid) this.causality.link(newWindow.uid, [triggerEventUid], EdgeKind.CREATION);

    this._applyComboWindowToCombos(newWindow, wiring.slotId);
  }

  /**
   * Walk combo events on the given slot and apply a window's trigger column
   * / trigger stacks to any combo whose startFrame lies within the window.
   * First-wins: does not overwrite an already-set comboTriggerColumnId.
   */
  private _applyComboWindowToCombos(win: TimelineEvent, slotId: string) {
    const winEnd = win.startFrame + computeSegmentsSpan(win.segments);
    for (const ev of this.allEvents) {
      if (ev.columnId !== NounType.COMBO || ev.ownerEntityId !== slotId) continue;
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
        this.spController.addCost(ev.uid, ev.startFrame, ev.skillPointCost, ev.ownerEntityId, ultimateEnergyGainFrame);
      }

      // SP recovery events (derived from deriveSPRecoveryEvents)
      if (ev.ownerEntityId === TEAM_ID && ev.columnId === COMMON_COLUMN_IDS.SKILL_POINTS) {
        this.spController.addSpRecoveryEvent(ev);
      }

      // Perfect dodge → SP recovery
      if (ev.columnId === OPERATOR_COLUMNS.INPUT && ev.isPerfectDodge) {
        this.spController.addRecovery(
          ev.startFrame, GENERAL_MECHANICS.skillPoints.perfectDodgeRecovery,
          ev.ownerEntityId, ev.id,
        );
      }
    }

    // ── UE notifications ──────────────────────────────────────────────────
    // All frame-level UE gains are now routed via interpret() → doRecover →
    // DEC.recordUltimateEnergyGain. The four scan blocks (combo/battle/ultimate
    // frames) and the derived-status sourceEntityId routing block were deleted
    // as part of Phase 0a — they were the parallel write path that caused the
    // double-UE-gain bug. The interpreter resolves the source slot from
    // ev.sourceEntityId at handleProcessFrame ctx-build time.
    if (this.ueController) {
      // Ultimate event → consume + no-gain windows (event-level only,
      // frame-level UE gain comes through the clause path)
      if (ev.columnId === NounType.ULTIMATE) {
        this.ueController.addConsume(ev.startFrame, ev.ownerEntityId);
        const windows = collectNoGainWindowsForEvent(ev);
        for (const w of windows) {
          this.ueController.addNoGainWindow(w.start, w.end, ev.ownerEntityId);
        }
      }
      // IGNORE ULTIMATE_ENERGY: previously detected via status def lookup
      // here (which only fired at post-drain re-registration). Now handled
      // by the IGNORE verb in interpret() during runStatusCreationLifecycle,
      // so the flag takes effect at status creation time.
    }
  }

  // validateAll() (post-pass) deleted — sibling overlap is now annotated
  // per-event in pass 2 via _validateSiblingOverlap.

  /**
   * Per-event sibling overlap validation. Called from createSkillEvent pass 2.
   * Walks already-registered events with the same (ownerEntityId, columnId, id) and
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
    for (const prev of this.allEvents) {
      if (prev === ev) continue;
      if (prev.uid === ev.uid) continue;
      if (prev.ownerEntityId !== ev.ownerEntityId || prev.columnId !== ev.columnId || prev.id !== ev.id) continue;
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
   * by uid .
   */
  setComboTriggerColumnId(eventUid: string, columnId: string, sourceEventUid?: string) {
    for (let i = 0; i < this.allEvents.length; i++) {
      if (this.allEvents[i].uid === eventUid) {
        // Mutate in-place so PROCESS_FRAME entries referencing this event see the update
        this.allEvents[i].comboTriggerColumnId = columnId;
        if (sourceEventUid != null) this.allEvents[i].triggerEventUid = sourceEventUid;
        return;
      }
    }
  }

  /**
   * Get all registered events with reactions merged and reaction frames attached.
   * This is the final output for the view layer — replaces external mergeReactions + attachReactionFrames calls.
   */
  getProcessedEvents(): TimelineEvent[] {
    return attachReactionFrames(mergeReactions(this.allEvents, this.causality));
  }

  /** Get all events. Single source of storage — registeredEvents has everything. */
  getAllEvents(): TimelineEvent[] {
    return this.allEvents;
  }

  /**
   * Look up an event by uid. Linear scan — fine for Phase 3 determiner
   * resolution because chain walks are single-digit depth in practice.
   * If a hot path appears, add a uid → event index alongside `stacks`.
   */
  getEventByUid(uid: string): TimelineEvent | undefined {
    for (let i = 0; i < this.allEvents.length; i++) {
      if (this.allEvents[i].uid === uid) return this.allEvents[i];
    }
    return undefined;
  }

  /** Get combo chaining state (debug). */
  getComboStops(): readonly ComboStopEntry[] {
    return this.comboStops;
  }

  /**
   * Public entrypoint for pass 3 (combo trigger resolution) — called once
   * post-drain to pick up combo windows triggered by queue-created
   * inflictions/statuses. Replaces the per-event pass 3 runs that used to
   * happen during the post-drain re-registration loop.
   */
  resolveCombosNow() {
    if (this.slotWirings.length > 0) this.resolveComboTriggersInline();
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

  /** Replace the registered events array (e.g. after late combo trigger resolution). */
  replaceEvents(events: TimelineEvent[]) {
    this.allEvents = events;
  }

  // ── ColumnHost interface ────────────────────────────────────────────────

  /** Get all active (non-consumed) events for a column+owner at a frame. */
  activeEventsIn(columnId: string, ownerEntityId: string, frame: number): TimelineEvent[] {
    return this._activeEventsIn(columnId, ownerEntityId, frame);
  }

  /** Count active events for a column+owner at a frame. */
  activeCount(columnId: string, ownerEntityId: string, frame: number) {
    return this._activeEventsIn(columnId, ownerEntityId, frame).length;
  }

  /** Extend a raw game-time duration by active time-stop regions. */
  extendDuration(startFrame: number, rawDuration: number, eventUid?: string) {
    return this._extendDuration(startFrame, rawDuration, eventUid);
  }

  /** Register a raw (pre-extension) duration for later re-extension. */
  trackRawDuration(uid: string, rawDuration: number) {
    this.rawDurations.set(uid, rawDuration);
  }

  /**
   * Unified queue-event ingress. Single public entry point for events that
   * enter DEC mid-queue (statuses, inflictions, reactions, freeform markers)
   * — symmetric with `createSkillEvent` via the shared `_ingest` core.
   *
   * Skipped vs createSkillEvent's full pipeline:
   *   - combo chain / reaction segments / clamp controls (skill-specific)
   *   - notifyResourceControllers (queue events are statuses/inflictions/
   *     reactions — none of notifyResourceControllers' branches apply;
   *     IGNORE UE flows through interpret() dispatch since 85912595)
   *   - pass 3 resolveComboTriggersInline (run once post-drain instead)
   *   - pass 4 queue frame emission (lifecycle already handled inline)
   *
   * When `captureRaw` is true (the default), `_ingest` records per-segment
   * raw durations and this method runs `extendSingleEvent` so the caller
   * observes extended durations on return. Reaction events whose segments
   * are already built with stops baked in must pass `captureRaw: false`.
   */
  createQueueEvent(
    ev: TimelineEvent,
    opts: { captureRaw?: boolean } = {},
  ): TimelineEvent {
    const captureRaw = opts.captureRaw ?? true;
    const owned = this._ingest(ev, { deepClone: false, captureRaw });
    if (captureRaw) this.extendSingleEvent(owned);
    return owned;
  }

  /**
   * Insert an event with a raw duration to be extended by current stops.
   * Used by infliction / status / MF columns for freshly-built events whose
   * segments carry the pre-extension duration. Extension now runs via the
   * shared `extendSingleEvent` path inside `createQueueEvent`, so callers
   * observe extended durations on return (same contract as before the merge).
   */
  pushEvent(event: TimelineEvent) {
    this.createQueueEvent(event);
  }

  /** Insert an already-extended event directly (no duration extension). */
  pushEventDirect(event: TimelineEvent) {
    // Reaction events arrive with stops baked into their segments (see
    // reactionColumn.add → buildReactionSegment). Skip raw capture so the
    // retroactive re-extension loop in `_maybeRegisterStop` doesn't treat
    // already-extended durations as raw and double-extend on a later stop.
    if (!this.rawDurations.has(event.uid)) {
      this.rawDurations.set(event.uid, eventDuration(event));
    }
    this.createQueueEvent(event, { captureRaw: false });
  }

  /** Push a "marker" event (e.g. consumed copy for freeform state tracking). */
  pushToOutput(event: TimelineEvent) {
    if (!this.rawDurations.has(event.uid)) {
      this.rawDurations.set(event.uid, eventDuration(event));
    }
    this.createQueueEvent(event, { captureRaw: false });
  }

  /** Delegate creation to another column (cross-column side effects). */
  applyToColumn(columnId: string, ownerEntityId: string, frame: number, durationFrames: number,
    source: EventSource, options?: AddOptions): boolean {
    return this.registry.get(columnId).add(ownerEntityId, frame, durationFrames, source, options);
  }

  /** Get foreign time-stop regions for reaction segment building. */
  foreignStopsFor(event: TimelineEvent): readonly TimeStopRegion[] {
    return isTimeStopEvent(event) ? this.stops.filter(s => s.eventUid !== event.uid) : this.stops;
  }

  // ── Domain Controllers ──────────────────────────────────────────────────

  /** Apply (create) an event on a column. Routes to the appropriate EventColumn. */
  applyEvent(
    columnId: string, ownerEntityId: string, frame: number,
    durationFrames: number, source: EventSource,
    options?: AddOptions,
  ): boolean {
    return this.registry.get(columnId).add(ownerEntityId, frame, durationFrames, source, options);
  }

  /** Consume events on a column. Routes to the appropriate EventColumn. */
  consumeEvent(
    columnId: string, ownerEntityId: string, frame: number,
    source: EventSource, options?: ConsumeOptions,
  ): number {
    return this.registry.get(columnId).consume(ownerEntityId, frame, source, options);
  }

  /** Check if an event can be applied on a column. */
  canApplyEvent(columnId: string, ownerEntityId: string, frame: number): boolean {
    return this.registry.get(columnId).canAdd(ownerEntityId, frame);
  }

  /** Check if events can be consumed on a column. */
  canConsumeEvent(columnId: string, ownerEntityId: string, frame: number): boolean {
    return this.registry.get(columnId).canConsume(ownerEntityId, frame);
  }

  /** No-op — stagger is display-only. */
  createStagger(_columnId: string, _ownerId: string, _frame: number, _value: number, _source: EventSource) {}

  // ── Link consumption tracking ──────────────────────────────────────────

  /** Consume Link for a battle skill/ultimate. Records stack count against event UID. */
  consumeLink(eventUid: string, frame: number, source: EventSource): number {
    const linkColumnId = StatusType.LINK;
    const isLink = (ev: TimelineEvent) => ev.id === StatusType.LINK;
    const linkEvents = this._activeEventsIn(linkColumnId, TEAM_ID, frame)
      .filter(isLink);
    if (linkEvents.length === 0) return 0;
    this.clampActiveFiltered(linkColumnId, TEAM_ID, frame, source, EventStatusType.CONSUMED, isLink);
    const clampedStacks = Math.min(linkEvents.length, 4);
    this.linkConsumptions.set(eventUid, clampedStacks);
    return clampedStacks;
  }

  getLinkStacks(eventUid: string): number {
    return this.linkConsumptions.get(eventUid) ?? 0;
  }

  /**
   * Shared ingress core — the single point where any event enters DEC storage.
   * Runs stop registration (+ retroactive re-extension of prior events),
   * optionally deep-clones segments (for skill events sourced from React raw
   * state), optionally captures per-segment raw durations (for idempotent
   * time-stop re-extension via extendSingleEvent), and pushes the event to
   * both `allEvents` and the `stacks` index.
   *
   * Called by `createSkillEvent` ({deepClone:true, captureRaw:true}) and
   * `createQueueEvent` (column-built events pass captureRaw depending on
   * whether the event arrived pre-extended — reactions do, everything else
   * does not).
   */
  private _ingest(
    ev: TimelineEvent,
    opts: { deepClone: boolean; captureRaw: boolean },
  ): TimelineEvent {
    this._maybeRegisterStop(ev);

    let owned = ev;
    if (opts.deepClone) {
      const segments = ev.segments.map(s => ({
        ...s,
        properties: { ...s.properties },
        ...(s.frames ? { frames: s.frames.map(f => ({ ...f })) } : {}),
      }));
      owned = { ...ev, segments };
    }

    if (opts.captureRaw) {
      this.rawSegmentDurations.set(owned.uid, owned.segments.map(s => s.properties.duration));
    }

    // Phase 1 chainRef backfill: every event entering DEC must have
    // ownerSlotId + ownerOperatorId populated so readers can trust the
    // fields without null-checking. Phase 2 will populate them at real
    // ingress sites; this backfill guarantees the invariant in the meantime.
    this._backfillOwnerIds(owned);

    this.allEvents.push(owned);
    const stackKey = this.key(owned.columnId, owned.ownerEntityId);
    const stackArr = this.stacks.get(stackKey) ?? [];
    stackArr.push(owned);
    this.stacks.set(stackKey, stackArr);
    return owned;
  }

  /**
   * Phase 1 backfill: derive `ownerSlotId` / `ownerOperatorId` from whatever
   * fields the caller already populated. Precedence:
   *   1. Already-set fields are left alone (Phase 2 call sites populate them directly).
   *   2. If `ev.ownerEntityId` is a known slot, it's the slot id; operator id
   *      comes from slotOperatorMap.
   *   3. Else if `ev.sourceEntityId` is a known slot (legacy stamping), use that.
   *   4. Else reverse-lookup `ev.sourceEntityId` as an operator id in slotOperatorMap.
   *   5. Fall back to `ev.ownerEntityId` for both fields (enemy/common events — the
   *      owner IS the enemy/common sentinel, not a slot).
   */
  private _backfillOwnerIds(ev: TimelineEvent): void {
    if (ev.ownerSlotId && ev.ownerOperatorId) return;

    let slotId: string | undefined;
    let operatorId: string | undefined;

    if (this.slotOperatorMap[ev.ownerEntityId]) {
      slotId = ev.ownerEntityId;
      operatorId = this.slotOperatorMap[ev.ownerEntityId];
    } else if (ev.sourceEntityId && this.slotOperatorMap[ev.sourceEntityId]) {
      slotId = ev.sourceEntityId;
      operatorId = this.slotOperatorMap[ev.sourceEntityId];
    } else if (ev.sourceEntityId) {
      // sourceEntityId might be a raw operator id — reverse-lookup to find its slot
      for (const [sid, opId] of Object.entries(this.slotOperatorMap)) {
        if (opId === ev.sourceEntityId) { slotId = sid; operatorId = opId; break; }
      }
      if (!slotId) {
        // Unrecognized sourceEntityId (e.g. 'debugger', legacy 'user'): fall
        // back to ownerEntityId-based derivation so we match the old
        // resolveRoutedSource semantics rather than letting an unknown string
        // leak into owner fields.
        slotId = ev.ownerEntityId;
        operatorId = ev.ownerEntityId;
      }
    } else {
      slotId = ev.ownerEntityId;
      operatorId = ev.ownerEntityId;
    }

    if (!ev.ownerSlotId) ev.ownerSlotId = slotId;
    if (!ev.ownerOperatorId) ev.ownerOperatorId = operatorId;
  }

  /** Expose the causality graph for reader migration in Phase 3. */
  getCausality(): CausalityGraph {
    return this.causality;
  }

  /** ColumnHost: record causal parents for a freshly-inserted event. */
  linkCausality(childUid: string, parentUids: readonly string[]): void {
    this.causality.link(childUid, parentUids, EdgeKind.CREATION);
  }

  /** ColumnHost: record a TRANSITION edge (status transition caused by source event). */
  linkTransition(targetEventUid: string, sourceEventUid: string): void {
    this.causality.link(targetEventUid, [sourceEventUid], EdgeKind.TRANSITION);
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
    // forward stops to spController so its timeline recomputes
    // regen pauses immediately, without waiting for a finalize-time sweep.
    if (this.spController) this.spController.setTimeStops(this.stops);
    // Retroactive re-extension: events already pushed whose active range
    // overlaps the new stop need extendSingleEvent + computeFramePositions
    // re-run. extendSingleEvent reads raw from rawSegmentDurations and
    // mutates in place idempotently, so this is safe to run any number of
    // times.
    if (durationFrames > 0) {
      const stopEnd = startFrame + durationFrames;
      for (let i = 0; i < this.allEvents.length; i++) {
        const other = this.allEvents[i];
        if (other.uid === ev.uid) continue;
        if (!this.rawSegmentDurations.has(other.uid)) continue;
        const otherEnd = other.startFrame + eventDuration(other);
        if (other.startFrame < stopEnd && otherEnd > startFrame) {
          this.extendSingleEvent(other);
          computeFramePositions(other, this.stops);
        }
      }
    }
    // Reactive queue shift: queue frames whose source event's active range
    // overlaps the new stop AND whose frame > startFrame must move forward
    // by the stop duration so they fire at the correct extended time.
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
   * idempotent per-segment extension.
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
      const source = this.allEvents.find(e => e.uid === stop.eventUid);
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

  private _activeEventsIn(columnId: string, ownerEntityId: string, frame: number): TimelineEvent[] {
    // Single source of storage — stacks is the per-(column, owner) index
    // over registeredEvents, populated by _pushToStorage AND createQueueEvent.
    const result: TimelineEvent[] = [];
    const events = this.stacks.get(this.key(columnId, ownerEntityId)) ?? [];
    for (const ev of events) {
      if (ev.eventStatus === EventStatusType.CONSUMED) continue;
      if (ev.startFrame <= frame && frame < ev.startFrame + eventDuration(ev)) result.push(ev);
    }
    return result;
  }

  /** Public query: get active events at a frame for a column+owner. */
  getActiveEvents(columnId: string, ownerEntityId: string, frame: number): TimelineEvent[] {
    return this._activeEventsIn(columnId, ownerEntityId, frame);
  }

  /** Check if a given operator is the controlled operator at a given frame. */
  isControlledAt(ownerEntityId: string, frame: number): boolean {
    return this._activeEventsIn(OPERATOR_COLUMNS.INPUT, ownerEntityId, frame)
      .some((ev) => ev.id === NounType.CONTROL);
  }

  // ── Generic event insertion ──────────────────────────────────────────────

  /** Generic event insertion (used by tests). Routes through pushEvent. */
  addEvent(ev: TimelineEvent) {
    if (eventDuration(ev) > 0) this.pushEvent(ev);
    else this.pushToOutput(ev);
  }

  /** Clamp the oldest active event in a column to make room for a new stack. */
  private resetOldest(columnId: string, ownerEntityId: string, frame: number, source: EventSource) {
    const active = this._activeEventsIn(columnId, ownerEntityId, frame)
      .sort((a, b) => a.startFrame - b.startFrame);
    if (active.length > 0) {
      const oldest = active[0];
      setEventDuration(oldest, frame - oldest.startFrame);
      oldest.eventStatus = EventStatusType.REFRESHED;
      if (source.sourceEventUid) this.causality.link(oldest.uid, [source.sourceEventUid], EdgeKind.TRANSITION);
    }
  }

  /**
   * For each multi-skill activation window, clamp earlier combo cooldowns
   * so they end where the next combo starts. Called after windows are registered.
   */
  clampMultiSkillComboCooldowns() {
    // Find all multi-skill windows
    const windows = this.allEvents.filter(
      (ev) => ev.columnId === COMBO_WINDOW_COLUMN_ID && (ev.maxSkills ?? 1) > 1,
    );
    if (windows.length === 0) return;

    for (const win of windows) {
      const winEnd = win.startFrame + computeSegmentsSpan(win.segments);
      // Find all combo events in this window, sorted by startFrame
      const combos = this.allEvents
        .filter((ev) =>
          ev.columnId === NounType.COMBO &&
          ev.ownerEntityId === win.ownerEntityId &&
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
    for (let i = 0; i < this.allEvents.length; i++) {
      if (this.allEvents[i].uid !== eventUid) continue;
      const ev = this.allEvents[i];
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
    for (let i = 0; i < this.allEvents.length; i++) {
      if (this.allEvents[i].uid !== eventUid) continue;
      const ev = this.allEvents[i];
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
    const windows = this.allEvents.filter(ev => ev.columnId === COMBO_WINDOW_COLUMN_ID);
    for (const win of windows) {
      const winEnd = win.startFrame + computeSegmentsSpan(win.segments);
      const combos = this.allEvents.filter(ev =>
        ev.columnId === NounType.COMBO &&
        ev.ownerEntityId === win.ownerEntityId &&
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

  /**
   * Clamp active events matching a predicate in a column: truncate their
   * duration to `frame` and mark them with `status`. Uses the stacks index
   * as the single source — stacks holds the same event references as
   * allEvents, so one pass covers both.
   */
  private clampActiveFiltered(
    columnId: string, ownerEntityId: string, frame: number,
    source: EventSource, status: EventStatusType, predicate: (ev: TimelineEvent) => boolean,
  ) {
    const queueEvents = this.stacks.get(this.key(columnId, ownerEntityId)) ?? [];
    for (const ev of queueEvents) {
      if (!predicate(ev)) continue;
      if (ev.eventStatus === EventStatusType.CONSUMED) continue;
      const end = ev.startFrame + eventDuration(ev);
      if (ev.startFrame <= frame && frame < end) {
        setEventDuration(ev, frame - ev.startFrame);
        ev.eventStatus = status;
        if (source.sourceEventUid) this.causality.link(ev.uid, [source.sourceEventUid], EdgeKind.TRANSITION);
      }
    }
  }
}