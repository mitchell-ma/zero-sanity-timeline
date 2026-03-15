import { TimelineEvent, computeSegmentsSpan } from '../../consts/viewTypes';
import { CombatSkillsType } from '../../consts/enums';
import { SubjectType, VerbType, ObjectType, matchInteraction } from '../../consts/semantics';
import type { Interaction } from '../../consts/semantics';
import { TriggerCapability } from '../../consts/triggerCapabilities';
import { TOTAL_FRAMES } from '../../utils/timeline';
import { ENEMY_OWNER_ID, SKILL_COLUMNS } from '../../model/channels';
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
    if (ev.columnId !== SKILL_COLUMNS.COMBO) continue;
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
    (ev) => ev.columnId === SKILL_COLUMNS.ULTIMATE && ULTIMATE_RESETS_COMBO[ev.name] != null
      && (ev.operatorPotential ?? 0) >= ULTIMATE_RESETS_COMBO[ev.name],
  );
  if (ultimates.length === 0) return events;

  const modified = new Map<string, TimelineEvent>();
  for (const ult of ultimates) {
    const ultFrame = ult.startFrame;
    for (const ev of events) {
      if (ev.ownerId !== ult.ownerId || ev.columnId !== SKILL_COLUMNS.COMBO) continue;
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
const _I = (subjectType: any, verbType: any, objectType: any, extra?: Partial<Interaction>): Interaction =>
  ({ subjectType, verbType, objectType, ...extra } as Interaction);

export const ENEMY_COLUMN_TO_INTERACTIONS: Record<string, Interaction[]> = {
  heatInfliction:       [_I(SubjectType.THIS_OPERATOR, VerbType.APPLY, ObjectType.INFLICTION, { element: 'HEAT' })],
  cryoInfliction:       [_I(SubjectType.THIS_OPERATOR, VerbType.APPLY, ObjectType.INFLICTION, { element: 'CRYO' })],
  natureInfliction:     [_I(SubjectType.THIS_OPERATOR, VerbType.APPLY, ObjectType.INFLICTION, { element: 'NATURE' })],
  electricInfliction:   [_I(SubjectType.THIS_OPERATOR, VerbType.APPLY, ObjectType.INFLICTION, { element: 'ELECTRIC' })],
  combustion:           [_I(SubjectType.ENEMY, VerbType.IS, ObjectType.COMBUSTED)],
  solidification:       [_I(SubjectType.ENEMY, VerbType.IS, ObjectType.SOLIDIFIED)],
  corrosion:            [_I(SubjectType.ENEMY, VerbType.IS, ObjectType.CORRODED)],
  electrification:      [_I(SubjectType.ENEMY, VerbType.IS, ObjectType.ELECTRIFIED)],
  vulnerableInfliction: [_I(SubjectType.THIS_OPERATOR, VerbType.APPLY, ObjectType.STATUS, { objectId: 'VULNERABILITY' })],
  breach:               [_I(SubjectType.THIS_OPERATOR, VerbType.APPLY, ObjectType.STATUS, { objectId: 'PHYSICAL' })],
};

const ALWAYS_AVAILABLE_INTERACTIONS: Interaction[] = [
  _I(SubjectType.ENEMY, VerbType.HIT, ObjectType.THIS_OPERATOR),
  _I(SubjectType.THIS_OPERATOR, VerbType.HAVE, ObjectType.HP, { cardinalityConstraint: 'AT_MOST' as any }),
  _I(SubjectType.THIS_OPERATOR, VerbType.HAVE, ObjectType.HP, { cardinalityConstraint: 'AT_LEAST' as any }),
  _I(SubjectType.THIS_OPERATOR, VerbType.HAVE, ObjectType.ULTIMATE_ENERGY, { cardinalityConstraint: 'AT_MOST' as any }),
];

function isAlwaysAvailable(i: Interaction): boolean {
  return ALWAYS_AVAILABLE_INTERACTIONS.some((aa) => matchInteraction(i, aa));
}

const DERIVED_INTERACTIONS: Interaction[] = [];
for (const interactions of Object.values(ENEMY_COLUMN_TO_INTERACTIONS)) {
  for (const i of interactions) DERIVED_INTERACTIONS.push(i);
}

function isDerivedInteraction(i: Interaction): boolean {
  return DERIVED_INTERACTIONS.some((d) => matchInteraction(i, d));
}

function isFinalStrike(i: Interaction): boolean {
  return i.verbType === VerbType.PERFORM && i.objectType === ObjectType.FINAL_STRIKE;
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
  const windowsBySlot = new Map<string, { startFrame: number; endFrame: number; sourceEventId: string; sourceOwnerId?: string; sourceSkillName?: string; sourceColumnId?: string; triggerInteraction?: Interaction }[]>();

  // Build slotId → index for event ownership lookup
  const slotIdToIndex = new Map<string, number>();
  for (let i = 0; i < slotWirings.length; i++) {
    slotIdToIndex.set(slotWirings[i].slotId, i);
  }

  // Build set of combo time-stop event IDs per slot, so a slot's own combo
  // time stops don't extend its combo activation window duration.
  const comboStopIdsBySlot = new Map<string, Set<string>>();
  for (const ev of events) {
    if (ev.columnId !== SKILL_COLUMNS.COMBO || !isTimeStopEvent(ev)) continue;
    if (!comboStopIdsBySlot.has(ev.ownerId)) comboStopIdsBySlot.set(ev.ownerId, new Set());
    comboStopIdsBySlot.get(ev.ownerId)!.add(ev.id);
  }

  // Pre-index combo events per slot for cooldown checks
  const comboEventsBySlot = new Map<string, TimelineEvent[]>();
  for (const ev of events) {
    if (ev.columnId !== SKILL_COLUMNS.COMBO) continue;
    if (!comboEventsBySlot.has(ev.ownerId)) comboEventsBySlot.set(ev.ownerId, []);
    comboEventsBySlot.get(ev.ownerId)!.push(ev);
  }

  const addWindow = (
    published: Interaction,
    event: TimelineEvent,
    triggerFrame: number,
  ) => {
    for (const wiring of slotWirings) {
      const cap = wiring.capability;
      const matchesTrigger = cap.comboRequires.some((req) => matchInteraction(published, req));
      if (!matchesTrigger) continue;

      // Skip self-trigger
      if (event.sourceOwnerId === wiring.slotId) continue;

      // Skip if combo skill is on cooldown at trigger time.
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
      const ownComboStops = comboStopIdsBySlot.get(wiring.slotId);
      const windowStops = ownComboStops ? stops.filter((s) => !ownComboStops.has(s.eventId)) : stops;
      const extendedDuration = extendByTimeStops(triggerFrame, baseDuration, windowStops);

      if (!windowsBySlot.has(wiring.slotId)) windowsBySlot.set(wiring.slotId, []);
      windowsBySlot.get(wiring.slotId)!.push({
        startFrame: triggerFrame,
        endFrame: triggerFrame + extendedDuration,
        sourceEventId: event.id,
        sourceOwnerId: event.ownerId !== ENEMY_OWNER_ID ? event.ownerId : event.sourceOwnerId,
        sourceSkillName: event.name,
        sourceColumnId: event.columnId,
        triggerInteraction: published,
      });
    }
  };

  // Phase 1: operator-published interactions (skip derived)
  for (const event of events) {
    const slotIndex = slotIdToIndex.get(event.ownerId);
    if (slotIndex === undefined) continue;
    const cap = slotWirings[slotIndex].capability;
    const published = cap.publishesTriggers[event.columnId];
    if (!published || published.length === 0) continue;

    const isNonSequenceBasic = event.name === CombatSkillsType.FINISHER || event.name === CombatSkillsType.DIVE;

    const defaultTriggerFrame = event.startFrame + event.activationDuration;
    const finalStrikeTriggerFrame = getFinalStrikeTriggerFrame(event, stops) ?? defaultTriggerFrame;

    for (const interaction of published) {
      if (isDerivedInteraction(interaction)) continue;
      if (isNonSequenceBasic && isFinalStrike(interaction)) continue;
      const frame = isFinalStrike(interaction) ? finalStrikeTriggerFrame : defaultTriggerFrame;
      addWindow(interaction, event, frame);
    }
  }

  // Phase 2: derived enemy event interactions
  for (const event of events) {
    if (event.ownerId !== ENEMY_OWNER_ID) continue;
    const interactions = ENEMY_COLUMN_TO_INTERACTIONS[event.columnId];
    if (!interactions) continue;
    for (const interaction of interactions) {
      addWindow(interaction, event, event.startFrame);
    }
  }

  // Phase 3: always-available interactions → full-timeline windows
  for (const wiring of slotWirings) {
    const hasAlways = wiring.capability.comboRequires.some((req) => isAlwaysAvailable(req));
    if (!hasAlways) continue;
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
      ? computeSegmentsSpan(ev.segments)
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
    ? computeSegmentsSpan(ev.segments)
    : ev.activationDuration;
  return ev.startFrame + duration;
}
