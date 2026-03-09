import { TimelineEvent, FrameAbsorptionMarker } from '../consts/viewTypes';
import { INFLICTION_COLUMN_IDS, INFLICTION_TO_REACTION, REACTION_COLUMN_IDS } from '../model/channels';
import { TOTAL_FRAMES } from './timeline';

/** Maps forced reaction name → reaction columnId. */
const FORCED_REACTION_COLUMN: Record<string, string> = {
  COMBUSTION: 'combustion',
  SOLIDIFICATION: 'solidification',
  CORROSION: 'corrosion',
  ELECTRIFICATION: 'electrification',
};

/** Default active duration for derived reaction events (20s at 120fps). */
const REACTION_DURATION = 2400;

/** Forced reaction durations by type (frames at 120fps). */
const FORCED_REACTION_DURATION: Record<string, number> = {
  combustion: 600,        // 5s
  solidification: 600,    // 5s
  corrosion: 600,         // 5s
  electrification: 600,   // 5s
};

/** Default active duration for derived infliction events (20s at 120fps). */
const INFLICTION_DURATION = 2400;

/** Number of micro-column slots for infliction stacking. */
const INFLICTION_SLOTS = 4;

/** Maps element key (from frame data) → infliction columnId. */
const ELEMENT_TO_INFLICTION_COLUMN: Record<string, string> = {
  HEAT: 'heatInfliction',
  CRYO: 'cryoInfliction',
  NATURE: 'natureInfliction',
  ELECTRIC: 'electricInfliction',
};

/**
 * Processes raw timeline events into renderable events.
 *
 * 1. Derives infliction events from operator frames with applyArtsInfliction.
 * 2. Derives arts reaction events from cross-element infliction overlaps.
 *    The triggering (incoming) infliction is removed; the consumed inflictions
 *    are clamped at the reaction frame.
 * 3. Same-element infliction refresh: slots 0–2 get durations extended to the
 *    newest stack's end time. Slot 3 shows sequential bars.
 */
export function processInflictionEvents(rawEvents: TimelineEvent[]): TimelineEvent[] {
  const withDerivedInflictions = deriveFrameInflictions(rawEvents);
  const withAbsorptions = applyAbsorptions(withDerivedInflictions);
  const withReactions = deriveReactions(withAbsorptions);
  const mergedReactions = mergeReactions(withReactions);
  return applySameElementRefresh(mergedReactions);
}

/**
 * Scans sequenced operator events for frames with `applyArtsInfliction` markers
 * and generates corresponding enemy infliction events at the correct absolute frame.
 */
function deriveFrameInflictions(events: TimelineEvent[]): TimelineEvent[] {
  const derived: TimelineEvent[] = [];

  for (const event of events) {
    if (!event.segments || event.ownerId === 'enemy') continue;

    let cumulativeOffset = 0;
    for (let si = 0; si < event.segments.length; si++) {
      const seg = event.segments[si];
      if (seg.frames) {
        for (let fi = 0; fi < seg.frames.length; fi++) {
          const frame = seg.frames[fi];
          const absoluteFrame = event.startFrame + cumulativeOffset + frame.offsetFrame;

          if (frame.applyArtsInfliction) {
            const columnId = ELEMENT_TO_INFLICTION_COLUMN[frame.applyArtsInfliction.element];
            if (columnId) {
              derived.push({
                id: `${event.id}-inflict-${si}-${fi}`,
                name: columnId,
                ownerId: 'enemy',
                columnId,
                startFrame: absoluteFrame,
                activationDuration: INFLICTION_DURATION,
                activeDuration: 0,
                cooldownDuration: 0,
              });
            }
          }

          // Forced reactions bypass infliction stacks entirely
          if (frame.applyForcedReaction) {
            const reactionColumnId = FORCED_REACTION_COLUMN[frame.applyForcedReaction.reaction];
            if (reactionColumnId) {
              derived.push({
                id: `${event.id}-forced-${si}-${fi}`,
                name: reactionColumnId,
                ownerId: 'enemy',
                columnId: reactionColumnId,
                startFrame: absoluteFrame,
                activationDuration: FORCED_REACTION_DURATION[reactionColumnId] ?? REACTION_DURATION,
                activeDuration: 0,
                cooldownDuration: 0,
                statusLevel: frame.applyForcedReaction.statusLevel,
              });
            }
          }
        }
      }
      cumulativeOffset += seg.durationFrames;
    }
  }

  if (derived.length === 0) return events;
  return [...events, ...derived];
}

/** Maps absorption exchange status → columnId for generated events. */
const EXCHANGE_STATUS_COLUMN: Record<string, string> = {
  MELTING_FLAME: 'melting-flame',
};

/** Max micro-column slots for each exchange status. */
const EXCHANGE_STATUS_MAX_SLOTS: Record<string, number> = {
  MELTING_FLAME: 4,
};

/** Default duration for generated exchange events (effectively permanent). */
const EXCHANGE_EVENT_DURATION = TOTAL_FRAMES * 10;

/**
 * Processes absorption frames: consumes enemy infliction stacks and generates
 * exchange status events (e.g. Melting Flame) on the absorbing operator.
 *
 * For each absorption marker found on operator events:
 * 1. Count active infliction events of the matching element on the enemy
 * 2. Count active exchange status events on the operator
 * 3. Consume min(active inflictions, available slots, marker max stacks)
 * 4. Clamp consumed inflictions at the absorption frame
 * 5. Generate new exchange status events
 */
function applyAbsorptions(events: TimelineEvent[]): TimelineEvent[] {
  // Collect all absorption points: { absoluteFrame, ownerId, marker }
  type AbsorptionPoint = {
    absoluteFrame: number;
    ownerId: string;
    marker: FrameAbsorptionMarker;
    eventId: string;
    segmentIndex: number;
    frameIndex: number;
  };

  const absorptions: AbsorptionPoint[] = [];

  for (const event of events) {
    if (!event.segments || event.ownerId === 'enemy') continue;

    let cumulativeOffset = 0;
    for (let si = 0; si < event.segments.length; si++) {
      const seg = event.segments[si];
      if (seg.frames) {
        for (let fi = 0; fi < seg.frames.length; fi++) {
          const frame = seg.frames[fi];
          if (frame.absorbArtsInfliction) {
            absorptions.push({
              absoluteFrame: event.startFrame + cumulativeOffset + frame.offsetFrame,
              ownerId: event.ownerId,
              marker: frame.absorbArtsInfliction,
              eventId: event.id,
              segmentIndex: si,
              frameIndex: fi,
            });
          }
        }
      }
      cumulativeOffset += seg.durationFrames;
    }
  }

  if (absorptions.length === 0) return events;

  // Sort absorptions chronologically
  absorptions.sort((a, b) => a.absoluteFrame - b.absoluteFrame);

  // Track modifications: clamped inflictions and removed inflictions
  const clampMap = new Map<string, number>(); // infliction id → clamp frame
  const removedIds = new Set<string>();
  const generated: TimelineEvent[] = [];

  for (const absorption of absorptions) {
    const { absoluteFrame, ownerId, marker } = absorption;
    const inflictionColumnId = ELEMENT_TO_INFLICTION_COLUMN[marker.element];
    const exchangeColumnId = EXCHANGE_STATUS_COLUMN[marker.exchangeStatus];
    const maxSlots = EXCHANGE_STATUS_MAX_SLOTS[marker.exchangeStatus] ?? 4;

    if (!inflictionColumnId || !exchangeColumnId) continue;

    // Find active enemy infliction events of the matching element at this frame
    const activeInflictions: TimelineEvent[] = [];
    for (const ev of events) {
      if (ev.ownerId !== 'enemy' || ev.columnId !== inflictionColumnId) continue;
      if (removedIds.has(ev.id)) continue;

      const clampFrame = clampMap.get(ev.id);
      const endFrame = clampFrame !== undefined
        ? clampFrame
        : ev.startFrame + ev.activationDuration + ev.activeDuration + ev.cooldownDuration;

      if (ev.startFrame <= absoluteFrame && endFrame > absoluteFrame) {
        activeInflictions.push(ev);
      }
    }

    if (activeInflictions.length === 0) continue;

    // Count active exchange status events for this operator at this frame
    let activeExchangeCount = 0;
    for (const ev of [...events, ...generated]) {
      if (ev.ownerId !== ownerId || ev.columnId !== exchangeColumnId) continue;
      if (removedIds.has(ev.id)) continue;

      const clampFrame = clampMap.get(ev.id);
      const endFrame = clampFrame !== undefined
        ? clampFrame
        : ev.startFrame + ev.activationDuration + ev.activeDuration + ev.cooldownDuration;

      if (ev.startFrame <= absoluteFrame && endFrame > absoluteFrame) {
        activeExchangeCount++;
      }
    }

    const availableSlots = maxSlots - activeExchangeCount;
    if (availableSlots <= 0) continue;

    const stacksToConsume = Math.min(activeInflictions.length, availableSlots, marker.stacks);
    if (stacksToConsume <= 0) continue;

    // Sort active inflictions by startFrame (consume oldest first)
    activeInflictions.sort((a, b) => a.startFrame - b.startFrame);

    // Consume inflictions: clamp them at the absorption frame
    for (let i = 0; i < stacksToConsume; i++) {
      const consumed = activeInflictions[i];
      clampMap.set(consumed.id, absoluteFrame);
    }

    // Generate exchange status events
    for (let i = 0; i < stacksToConsume; i++) {
      generated.push({
        id: `${absorption.eventId}-absorb-${absorption.segmentIndex}-${absorption.frameIndex}-${i}`,
        name: marker.exchangeStatus,
        ownerId,
        columnId: exchangeColumnId,
        startFrame: absoluteFrame,
        activationDuration: EXCHANGE_EVENT_DURATION,
        activeDuration: 0,
        cooldownDuration: 0,
      });
    }
  }

  if (clampMap.size === 0 && generated.length === 0) return events;

  // Build output: clamp consumed inflictions, append generated events
  const result: TimelineEvent[] = [];
  for (const ev of events) {
    if (removedIds.has(ev.id)) continue;

    const clampFrame = clampMap.get(ev.id);
    if (clampFrame !== undefined) {
      const available = Math.max(0, clampFrame - ev.startFrame);
      const clampedActive = Math.min(ev.activationDuration, available);
      const remAfterActive = available - clampedActive;
      const clampedLinger = Math.min(ev.activeDuration, remAfterActive);
      const remAfterLinger = remAfterActive - clampedLinger;
      const clampedCooldown = Math.min(ev.cooldownDuration, remAfterLinger);
      result.push({
        ...ev,
        activationDuration: clampedActive,
        activeDuration: clampedLinger,
        cooldownDuration: clampedCooldown,
      });
    } else {
      result.push(ev);
    }
  }

  return [...result, ...generated];
}

/**
 * Detects cross-element infliction overlaps and derives reaction events.
 *
 * When an infliction of element B arrives while element A is still active:
 * - A reaction event (typed by B) is generated at B's start frame
 * - The triggering B infliction is removed from output
 * - All active A inflictions are clamped at the reaction frame
 */
function deriveReactions(events: TimelineEvent[]): TimelineEvent[] {
  // Collect all enemy infliction events, sorted by start frame
  const inflictions = events
    .filter((ev) => ev.ownerId === 'enemy' && INFLICTION_COLUMN_IDS.has(ev.columnId))
    .sort((a, b) => a.startFrame - b.startFrame);

  if (inflictions.length === 0) return events;

  // Track which infliction IDs are consumed (triggering infliction removed,
  // consumed inflictions clamped)
  const removedIds = new Set<string>();
  const clampMap = new Map<string, number>(); // infliction id → clamp frame
  const generatedReactions: TimelineEvent[] = [];

  // Walk through inflictions in chronological order
  for (let i = 0; i < inflictions.length; i++) {
    const incoming = inflictions[i];
    if (removedIds.has(incoming.id)) continue;

    // Find active inflictions of a DIFFERENT element at incoming's start frame
    const activeOther: TimelineEvent[] = [];
    for (let j = 0; j < i; j++) {
      const prev = inflictions[j];
      if (removedIds.has(prev.id)) continue;
      if (prev.columnId === incoming.columnId) continue;

      // Use clamped end if already clamped by a prior reaction
      const clampFrame = clampMap.get(prev.id);
      const endFrame = clampFrame !== undefined
        ? clampFrame
        : prev.startFrame + prev.activationDuration + prev.activeDuration + prev.cooldownDuration;

      if (endFrame > incoming.startFrame) {
        activeOther.push(prev);
      }
    }

    if (activeOther.length > 0) {
      // Generate reaction event
      const reactionColumnId = INFLICTION_TO_REACTION[incoming.columnId];
      generatedReactions.push({
        id: `${incoming.id}-reaction`,
        name: reactionColumnId,
        ownerId: 'enemy',
        columnId: reactionColumnId,
        startFrame: incoming.startFrame,
        activationDuration: REACTION_DURATION,
        activeDuration: 0,
        cooldownDuration: 0,
      });

      // Remove the triggering infliction
      removedIds.add(incoming.id);

      // Clamp all active other-element inflictions at the reaction frame
      for (const consumed of activeOther) {
        clampMap.set(consumed.id, incoming.startFrame);
      }
    }
  }

  if (removedIds.size === 0 && generatedReactions.length === 0) return events;

  // Build output: filter removed, clamp consumed, append generated reactions
  const result: TimelineEvent[] = [];
  for (const ev of events) {
    if (removedIds.has(ev.id)) continue;

    const clampFrame = clampMap.get(ev.id);
    if (clampFrame !== undefined) {
      const available = Math.max(0, clampFrame - ev.startFrame);
      const clampedActive = Math.min(ev.activationDuration, available);
      const remAfterActive = available - clampedActive;
      const clampedLinger = Math.min(ev.activeDuration, remAfterActive);
      const remAfterLinger = remAfterActive - clampedLinger;
      const clampedCooldown = Math.min(ev.cooldownDuration, remAfterLinger);
      result.push({
        ...ev,
        activationDuration: clampedActive,
        activeDuration: clampedLinger,
        cooldownDuration: clampedCooldown,
      });
    } else {
      result.push(ev);
    }
  }

  return [...result, ...generatedReactions];
}

/**
 * Merges overlapping same-type arts reaction events.
 *
 * When two reactions of the same type overlap, the later one refreshes the
 * earlier's duration (extends to the later's end) and the merged result takes
 * the higher statusLevel. The later event is removed from output.
 */
function mergeReactions(events: TimelineEvent[]): TimelineEvent[] {
  const reactionsByType = new Map<string, TimelineEvent[]>();
  for (const ev of events) {
    if (ev.ownerId === 'enemy' && REACTION_COLUMN_IDS.has(ev.columnId)) {
      const group = reactionsByType.get(ev.columnId) ?? [];
      group.push(ev);
      reactionsByType.set(ev.columnId, group);
    }
  }

  if (reactionsByType.size === 0) return events;

  const removedIds = new Set<string>();
  const mergedMap = new Map<string, TimelineEvent>();

  reactionsByType.forEach((group) => {
    if (group.length <= 1) return;
    const sorted = [...group].sort((a, b) => a.startFrame - b.startFrame);

    // Walk through chronologically, merging into the current "active" reaction
    let active = sorted[0];
    let activeEnd = active.startFrame + active.activationDuration;
    let activeLevel = active.statusLevel ?? 1;

    for (let i = 1; i < sorted.length; i++) {
      const next = sorted[i];
      const nextEnd = next.startFrame + next.activationDuration;
      const nextLevel = next.statusLevel ?? 1;

      if (next.startFrame < activeEnd) {
        // Overlap: extend duration to the later end, take max statusLevel
        activeEnd = Math.max(activeEnd, nextEnd);
        activeLevel = Math.max(activeLevel, nextLevel);
        removedIds.add(next.id);
      } else {
        // No overlap: finalize the active reaction and start a new one
        if (activeEnd !== active.startFrame + active.activationDuration || activeLevel !== (active.statusLevel ?? 1)) {
          mergedMap.set(active.id, {
            ...active,
            activationDuration: activeEnd - active.startFrame,
            statusLevel: activeLevel,
          });
        }
        active = next;
        activeEnd = nextEnd;
        activeLevel = nextLevel;
      }
    }

    // Finalize the last active reaction
    if (activeEnd !== active.startFrame + active.activationDuration || activeLevel !== (active.statusLevel ?? 1)) {
      mergedMap.set(active.id, {
        ...active,
        activationDuration: activeEnd - active.startFrame,
        statusLevel: activeLevel,
      });
    }
  });

  if (removedIds.size === 0 && mergedMap.size === 0) return events;

  return events
    .filter((ev) => !removedIds.has(ev.id))
    .map((ev) => mergedMap.get(ev.id) ?? ev);
}

/**
 * Processes same-element infliction stacking:
 * - Extends slots 0–2 durations when later stacks refresh them
 * - Clamps slot 3 events sequentially (previous ends where next begins)
 *
 * Uses iterative refinement: extend durations first, then assign slots using
 * the extended durations so the slot assignment matches CombatPlanner's greedy
 * bin-packing on the processed output.
 */
function applySameElementRefresh(events: TimelineEvent[]): TimelineEvent[] {
  const inflictionsByColumn = new Map<string, TimelineEvent[]>();
  for (const ev of events) {
    if (ev.ownerId === 'enemy' && INFLICTION_COLUMN_IDS.has(ev.columnId)) {
      const group = inflictionsByColumn.get(ev.columnId) ?? [];
      group.push(ev);
      inflictionsByColumn.set(ev.columnId, group);
    }
  }

  if (inflictionsByColumn.size === 0) return events;

  const processedMap = new Map<string, TimelineEvent>();

  inflictionsByColumn.forEach((group) => {
    if (group.length <= 1) return; // nothing to refresh with a single event
    const sorted = [...group].sort((a, b) => a.startFrame - b.startFrame);
    const lastSlot = INFLICTION_SLOTS - 1;

    // Step 1: Compute the maximum extended duration for each event assuming
    // all events in slots 0–2 get fully extended. We extend each event's
    // activationDuration to the latest end frame reachable through a chain of
    // overlapping subsequent stacks.
    const extendedActive: number[] = sorted.map((ev) => ev.activationDuration);
    for (let i = sorted.length - 2; i >= 0; i--) {
      const ev = sorted[i];
      // Walk forward to find the latest chained end
      let maxEnd = ev.startFrame + extendedActive[i];
      for (let j = i + 1; j < sorted.length; j++) {
        if (sorted[j].startFrame > maxEnd) break;
        const jEnd = sorted[j].startFrame + extendedActive[j];
        if (jEnd > maxEnd) maxEnd = jEnd;
      }
      extendedActive[i] = maxEnd - ev.startFrame;
    }

    // Step 2: Assign slots using extended durations (matching CombatPlanner's
    // greedy algorithm on the processed output).
    const slotEndFrames = new Array(INFLICTION_SLOTS).fill(-1);
    const slotAssignment: number[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const ev = sorted[i];
      const endFrame = ev.startFrame + extendedActive[i];
      let assigned = -1;
      for (let s = 0; s < INFLICTION_SLOTS; s++) {
        if (slotEndFrames[s] <= ev.startFrame) {
          assigned = s;
          break;
        }
      }
      if (assigned < 0) assigned = lastSlot; // overflow to last slot
      slotEndFrames[assigned] = endFrame;
      slotAssignment.push(assigned);
    }

    // Step 3: Apply refresh to slots 0–(lastSlot-1), clamp sequential on lastSlot
    for (let i = 0; i < sorted.length; i++) {
      const ev = sorted[i];
      const slot = slotAssignment[i];

      if (slot < lastSlot) {
        // Extend duration
        if (extendedActive[i] !== ev.activationDuration) {
          processedMap.set(ev.id, { ...ev, activationDuration: extendedActive[i] });
        }
      }
    }

    // Clamp last-slot events: each ends when the next last-slot event starts
    const lastSlotIndices: number[] = [];
    for (let i = 0; i < sorted.length; i++) {
      if (slotAssignment[i] === lastSlot) lastSlotIndices.push(i);
    }

    for (let k = 0; k < lastSlotIndices.length - 1; k++) {
      const idx = lastSlotIndices[k];
      const nextIdx = lastSlotIndices[k + 1];
      const ev = sorted[idx];
      const nextStart = sorted[nextIdx].startFrame;
      const totalDur = ev.activationDuration + ev.activeDuration + ev.cooldownDuration;
      const originalEnd = ev.startFrame + totalDur;

      if (nextStart < originalEnd) {
        const available = Math.max(0, nextStart - ev.startFrame);
        const clampedActive = Math.min(ev.activationDuration, available);
        const remAfterActive = available - clampedActive;
        const clampedLinger = Math.min(ev.activeDuration, remAfterActive);
        const remAfterLinger = remAfterActive - clampedLinger;
        const clampedCooldown = Math.min(ev.cooldownDuration, remAfterLinger);

        processedMap.set(ev.id, {
          ...(processedMap.get(ev.id) ?? ev),
          activationDuration: clampedActive,
          activeDuration: clampedLinger,
          cooldownDuration: clampedCooldown,
        });
      }
    }
  });

  if (processedMap.size === 0) return events;
  return events.map((ev) => processedMap.get(ev.id) ?? ev);
}
