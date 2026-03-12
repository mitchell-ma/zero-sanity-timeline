import { TimelineEvent } from '../../consts/viewTypes';
import { CombatSkillsType, TriggerConditionType, TRIGGER_CONDITION_PARENTS } from '../../consts/enums';
import { TriggerCapability } from '../../consts/triggerCapabilities';
import { TOTAL_FRAMES } from '../../utils/timeline';
import { TimeStopRegion, isTimeStopEvent, extendByTimeStops, foreignStopsFor } from './processTimeStop';

// ── Combo time-stop chaining ─────────────────────────────────────────────────

/**
 * Combo time-stop chaining: combo time-stops are special — other combos can
 * be triggered within a combo's time-stop region. A combo's time-stop covers
 * the game-frame range [startFrame, startFrame + animationDuration). When
 * another combo's startFrame falls within that range, the earlier combo's
 * time-stop is cut short at the interruption point.
 *
 * Effective animDur = B.startFrame - A.startFrame (truncated band width).
 * The game frames [A.startFrame, B.startFrame) become a "frozen range" in
 * the layout — they collapse to zero real-time width, with A's truncated
 * time-stop band filling that space. The two bands render adjacent (no gap).
 */
export function applyComboChaining(events: TimelineEvent[]): TimelineEvent[] {
  const comboStops: { id: string; startFrame: number; animDur: number }[] = [];
  for (const ev of events) {
    if (ev.columnId !== 'combo') continue;
    const anim = ev.animationDuration;
    if (!anim || anim <= 0) continue;
    comboStops.push({ id: ev.id, startFrame: ev.startFrame, animDur: anim });
  }
  if (comboStops.length <= 1) return events;

  comboStops.sort((a, b) => a.startFrame - b.startFrame);

  const overrides = new Map<string, number>();
  for (let i = 0; i < comboStops.length; i++) {
    const a = comboStops[i];
    const effectiveAnimDur = overrides.get(a.id) ?? a.animDur;
    const coveredEnd = a.startFrame + effectiveAnimDur;

    for (let j = i + 1; j < comboStops.length; j++) {
      const b = comboStops[j];
      if (b.startFrame >= coveredEnd) break;

      // B starts within A's time-stop band (real-time overlap) — truncate
      // A's animation at B's start.
      overrides.set(a.id, b.startFrame - a.startFrame);
      break;
    }
  }

  if (overrides.size === 0) return events;
  return events.map((ev) => {
    const truncatedAnim = overrides.get(ev.id);
    if (truncatedAnim == null) return ev;
    return {
      ...ev,
      animationDuration: truncatedAnim,
      activationDuration: Math.min(ev.activationDuration, truncatedAnim),
    };
  });
}

// ── Potential-based effects ──────────────────────────────────────────────────

/** Map of ultimate skill names → combo cooldown reset at potential threshold. */
const ULTIMATE_RESETS_COMBO: Record<string, number> = {
  [CombatSkillsType.WOLVEN_FURY]: 5, // Wulfgard P5: Natural Predator
};

/**
 * Applies potential-gated effects that modify operator events:
 * - Combo cooldown reset on ultimate cast (e.g. Wulfgard P5)
 */
export function applyPotentialEffects(events: TimelineEvent[]): TimelineEvent[] {
  const ultimates = events.filter(
    (ev) => ev.columnId === 'ultimate' && ULTIMATE_RESETS_COMBO[ev.name] != null
      && (ev.operatorPotential ?? 0) >= ULTIMATE_RESETS_COMBO[ev.name],
  );
  if (ultimates.length === 0) return events;

  const modified = new Map<string, TimelineEvent>();
  for (const ult of ultimates) {
    const ultFrame = ult.startFrame;
    for (const ev of events) {
      if (ev.ownerId !== ult.ownerId || ev.columnId !== 'combo') continue;
      const activeEnd = ev.startFrame + ev.activationDuration + ev.activeDuration;
      const cooldownEnd = activeEnd + ev.cooldownDuration;
      // If the combo is in its cooldown phase when the ultimate is cast, reset it
      if (ultFrame >= activeEnd && ultFrame < cooldownEnd) {
        modified.set(ev.id, {
          ...ev,
          cooldownDuration: Math.max(0, ultFrame - activeEnd),
        });
      }
    }
  }

  if (modified.size === 0) return events;
  return events.map((ev) => modified.get(ev.id) ?? ev);
}

// ── Combo activation window derivation ──────────────────────────────────────

/** Column ID for derived combo activation window events. */
export const COMBO_WINDOW_COLUMN_ID = 'comboActivationWindow';

/**
 * Maps derived enemy event columnIds to the trigger conditions they represent.
 * Used to generate combo windows from derived events at their actual frame timing.
 */
export const ENEMY_COLUMN_TO_TRIGGERS: Record<string, TriggerConditionType[]> = {
  heatInfliction:     [TriggerConditionType.APPLY_HEAT_INFLICTION],
  cryoInfliction:     [TriggerConditionType.APPLY_CRYO_INFLICTION],
  natureInfliction:   [TriggerConditionType.APPLY_NATURE_INFLICTION],
  electricInfliction: [TriggerConditionType.APPLY_ELECTRIC_INFLICTION],
  combustion:         [TriggerConditionType.COMBUSTION],
  solidification:     [TriggerConditionType.SOLIDIFICATION],
  corrosion:          [TriggerConditionType.CORROSION],
  electrification:    [TriggerConditionType.ELECTRIFICATION],
  vulnerableInfliction: [TriggerConditionType.APPLY_VULNERABILITY],
  breach:             [TriggerConditionType.APPLY_PHYSICAL_STATUS],
};

/**
 * Trigger conditions that are always satisfiable (not dependent on team skill
 * publications).  Operators whose combo requires one of these get a full-timeline
 * activation window regardless of team composition.
 */
export const ALWAYS_AVAILABLE_TRIGGERS = new Set<TriggerConditionType>([
  TriggerConditionType.OPERATOR_ATTACKED,
  TriggerConditionType.HP_BELOW_THRESHOLD,
  TriggerConditionType.HP_ABOVE_THRESHOLD,
  TriggerConditionType.ULTIMATE_ENERGY_BELOW_THRESHOLD,
]);

/** Set of trigger condition types that are produced by derived enemy events. */
export const DERIVED_TRIGGER_TYPES = new Set<TriggerConditionType>();
for (const triggers of Object.values(ENEMY_COLUMN_TO_TRIGGERS)) {
  for (const t of triggers) {
    DERIVED_TRIGGER_TYPES.add(t);
    const parent = TRIGGER_CONDITION_PARENTS[t];
    if (parent) DERIVED_TRIGGER_TYPES.add(parent);
  }
}

/** Slot-level trigger wiring for the pipeline. */
export interface SlotTriggerWiring {
  slotId: string;
  capability: TriggerCapability;
}

/**
 * Derive combo activation window events from processed events + operator trigger capabilities.
 * Each window becomes a single-segment derived TimelineEvent.
 */
export function deriveComboActivationWindows(
  events: TimelineEvent[],
  slotWirings: SlotTriggerWiring[],
  stops: readonly TimeStopRegion[],
): TimelineEvent[] {
  // Intermediate accumulator: slotId → unsorted windows
  const windowsBySlot = new Map<string, { startFrame: number; endFrame: number; sourceEventId: string; sourceOwnerId?: string; sourceSkillName?: string; sourceColumnId?: string; triggerType?: TriggerConditionType }[]>();

  // Build slotId → index for event ownership lookup
  const slotIdToIndex = new Map<string, number>();
  for (let i = 0; i < slotWirings.length; i++) {
    slotIdToIndex.set(slotWirings[i].slotId, i);
  }

  // Build set of combo time-stop event IDs per slot, so a slot's own combo
  // time stops don't extend its combo activation window duration.
  const comboStopIdsBySlot = new Map<string, Set<string>>();
  for (const ev of events) {
    if (ev.columnId !== 'combo' || !isTimeStopEvent(ev)) continue;
    if (!comboStopIdsBySlot.has(ev.ownerId)) comboStopIdsBySlot.set(ev.ownerId, new Set());
    comboStopIdsBySlot.get(ev.ownerId)!.add(ev.id);
  }

  // Pre-index combo events per slot for cooldown checks
  const comboEventsBySlot = new Map<string, TimelineEvent[]>();
  for (const ev of events) {
    if (ev.columnId !== 'combo') continue;
    if (!comboEventsBySlot.has(ev.ownerId)) comboEventsBySlot.set(ev.ownerId, []);
    comboEventsBySlot.get(ev.ownerId)!.push(ev);
  }

  const addWindow = (
    trigger: TriggerConditionType,
    event: TimelineEvent,
    triggerFrame: number,
  ) => {
    for (const wiring of slotWirings) {
      const cap = wiring.capability;
      const matchesTrigger = cap.comboRequires.includes(trigger) ||
        (TRIGGER_CONDITION_PARENTS[trigger] !== undefined &&
          cap.comboRequires.includes(TRIGGER_CONDITION_PARENTS[trigger]!));
      if (!matchesTrigger) continue;

      // Skip self-trigger
      if (event.sourceOwnerId === wiring.slotId) continue;

      // Skip if combo skill is on cooldown at trigger time.
      // Only the cooldown phase blocks — the activation/active phases occur during
      // a time-stop where no triggers fire, and checking the full range causes a
      // circular dependency when combo events are dragged outside their window.
      // Segments are already extended by foreign time-stops (not the combo's own).
      const slotCombos = comboEventsBySlot.get(wiring.slotId);
      if (slotCombos) {
        const onCooldown = slotCombos.some((ce) => {
          if (ce.segments && ce.segments.length > 0) {
            let preCooldownDur = 0;
            let totalDur = 0;
            for (const s of ce.segments) {
              totalDur += s.durationFrames;
              if (s.label !== 'Cooldown') preCooldownDur += s.durationFrames;
            }
            const cooldownStart = ce.startFrame + preCooldownDur;
            const cooldownEnd = ce.startFrame + totalDur;
            return triggerFrame > cooldownStart && triggerFrame < cooldownEnd;
          }
          const cooldownStart = ce.startFrame + ce.activationDuration + ce.activeDuration;
          const cooldownEnd = cooldownStart + ce.cooldownDuration;
          return triggerFrame > cooldownStart && triggerFrame < cooldownEnd;
        });
        if (onCooldown) continue;
      }

      // Check comboForbidsActiveColumns
      const forbids = cap.comboForbidsActiveColumns;
      if (forbids && forbids.length > 0 && hasActiveEventInColumns(events, forbids, triggerFrame)) continue;

      // Check comboRequiresActiveColumns
      const requires = cap.comboRequiresActiveColumns;
      if (requires && requires.length > 0 && !hasActiveEventInColumns(events, requires, triggerFrame)) continue;

      const baseDuration = cap.comboWindowFrames;
      // Exclude this slot's own combo time stops from window extension
      const ownComboStops = comboStopIdsBySlot.get(wiring.slotId);
      const windowStops = ownComboStops ? stops.filter((s) => !ownComboStops.has(s.eventId)) : stops;
      const extendedDuration = extendByTimeStops(triggerFrame, baseDuration, windowStops);

      if (!windowsBySlot.has(wiring.slotId)) windowsBySlot.set(wiring.slotId, []);
      windowsBySlot.get(wiring.slotId)!.push({
        startFrame: triggerFrame,
        endFrame: triggerFrame + extendedDuration,
        sourceEventId: event.id,
        sourceOwnerId: event.ownerId !== 'enemy' ? event.ownerId : event.sourceOwnerId,
        sourceSkillName: event.name,
        sourceColumnId: event.columnId,
        triggerType: trigger,
      });
    }
  };

  // Phase 1: operator-published triggers (skip derived trigger types)
  for (const event of events) {
    const slotIndex = slotIdToIndex.get(event.ownerId);
    if (slotIndex === undefined) continue;
    const cap = slotWirings[slotIndex].capability;
    const publishedTriggers = cap.publishesTriggers[event.columnId];
    if (!publishedTriggers || publishedTriggers.length === 0) continue;

    const defaultTriggerFrame = event.startFrame + event.activationDuration;
    const finalStrikeTriggerFrame = getFinalStrikeTriggerFrame(event, stops) ?? defaultTriggerFrame;

    for (const trigger of publishedTriggers) {
      if (DERIVED_TRIGGER_TYPES.has(trigger)) continue;
      const frame = trigger === TriggerConditionType.FINAL_STRIKE ? finalStrikeTriggerFrame : defaultTriggerFrame;
      addWindow(trigger, event, frame);
    }
  }

  // Phase 2: derived enemy event triggers
  for (const event of events) {
    if (event.ownerId !== 'enemy') continue;
    const triggers = ENEMY_COLUMN_TO_TRIGGERS[event.columnId];
    if (!triggers) continue;
    for (const trigger of triggers) {
      addWindow(trigger, event, event.startFrame);
    }
  }

  // Phase 3: always-available triggers → full-timeline windows
  for (const wiring of slotWirings) {
    const hasAlwaysAvailable = wiring.capability.comboRequires.some((t) => ALWAYS_AVAILABLE_TRIGGERS.has(t));
    if (!hasAlwaysAvailable) continue;
    if (!windowsBySlot.has(wiring.slotId)) windowsBySlot.set(wiring.slotId, []);
    windowsBySlot.get(wiring.slotId)!.push({
      startFrame: 0,
      endFrame: TOTAL_FRAMES,
      sourceEventId: '__always_available__',
    });
  }

  // Sort, merge, and convert to TimelineEvents
  const derived: TimelineEvent[] = [];
  windowsBySlot.forEach((wins, slotId) => {
    wins.sort((a, b) => a.startFrame - b.startFrame);
    // Merge overlapping
    const merged: typeof wins = [];
    for (const w of wins) {
      const prev = merged.length > 0 ? merged[merged.length - 1] : null;
      if (prev && w.startFrame <= prev.endFrame) {
        prev.endFrame = Math.max(prev.endFrame, w.endFrame);
      } else {
        merged.push({ ...w });
      }
    }
    for (let i = 0; i < merged.length; i++) {
      const w = merged[i];
      const duration = w.endFrame - w.startFrame;
      derived.push({
        id: `combo-window-${slotId}-${i}`,
        name: COMBO_WINDOW_COLUMN_ID,
        ownerId: slotId,
        columnId: COMBO_WINDOW_COLUMN_ID,
        startFrame: w.startFrame,
        activationDuration: duration,
        activeDuration: 0,
        cooldownDuration: 0,
        sourceOwnerId: w.sourceOwnerId,
        sourceSkillName: w.sourceSkillName,
        comboTriggerColumnId: w.sourceColumnId,
        segments: [{ durationFrames: duration }],
      });
    }
  });

  return derived;
}

/**
 * Check if any event whose columnId is in `columnIds` is active at `frame`.
 * An event is "active" if frame falls within [startFrame, startFrame + totalDuration).
 */
export function hasActiveEventInColumns(events: TimelineEvent[], columnIds: string[], frame: number): boolean {
  for (const ev of events) {
    if (!columnIds.includes(ev.columnId) && !columnIds.includes(ev.name)) continue;
    const totalDuration = ev.segments
      ? ev.segments.reduce((sum, s) => sum + s.durationFrames, 0)
      : ev.activationDuration + ev.activeDuration + ev.cooldownDuration;
    if (frame >= ev.startFrame && frame < ev.startFrame + totalDuration) {
      return true;
    }
  }
  return false;
}

/**
 * For a sequenced event, compute the frame at which the final strike's last
 * hit lands.  Returns null if the event has no segments or fewer than 2.
 *
 * When `stops` is provided, the last hit's offset within its segment is
 * extended by any overlapping time-stop regions, matching how
 * `deriveFrameInflictions` / `absoluteFrame()` position the actual hit.
 */
export function getFinalStrikeTriggerFrame(
  event: TimelineEvent,
  stops?: readonly TimeStopRegion[],
): number | null {
  const segs = event.segments;
  if (!segs || segs.length < 2) return null;

  let offsetFrames = 0;
  for (let i = 0; i < segs.length - 1; i++) {
    offsetFrames += segs[i].durationFrames;
  }

  const lastSeg = segs[segs.length - 1];
  const frames = lastSeg.frames;
  if (frames && frames.length > 0) {
    const lastFrame = frames[frames.length - 1];
    if (lastFrame.absoluteFrame != null) return lastFrame.absoluteFrame;
  }
  const lastHitOffset = frames && frames.length > 0
    ? frames[frames.length - 1].offsetFrame
    : 0;

  const segAbsStart = event.startFrame + offsetFrames;
  if (stops && stops.length > 0) {
    const fStops = foreignStopsFor(event, stops);
    return segAbsStart + extendByTimeStops(segAbsStart, lastHitOffset, fStops);
  }
  return segAbsStart + lastHitOffset;
}

/** Get the end frame of a combo activation window event. */
export function comboWindowEndFrame(ev: TimelineEvent): number {
  const duration = ev.segments
    ? ev.segments.reduce((sum, s) => sum + s.durationFrames, 0)
    : ev.activationDuration;
  return ev.startFrame + duration;
}
