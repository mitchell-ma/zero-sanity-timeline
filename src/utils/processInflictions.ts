import { TimelineEvent } from '../consts/viewTypes';

const INFLICTION_CHANNEL_IDS = new Set([
  'heatInfliction', 'cryoInfliction', 'natureInfliction', 'electricInfliction',
]);

const REACTION_CHANNEL_IDS = new Set([
  'combustion', 'solidification', 'corrosion', 'electrification',
]);

/** Number of micro-column slots for infliction stacking. */
const INFLICTION_SLOTS = 4;

/**
 * Processes raw timeline events into renderable events.
 *
 * 1. Same-element infliction refresh: slots 0–2 get durations extended to the
 *    newest stack's end time. Slot 3 shows sequential bars — when a new stack
 *    overflows, the previous slot-3 event is clamped and the new one takes over.
 * 2. Consumption clamping: infliction events are visually truncated at the
 *    frame where an arts reaction consumes them.
 */
export function processInflictionEvents(rawEvents: TimelineEvent[]): TimelineEvent[] {
  const refreshed = applySameElementRefresh(rawEvents);
  return applyConsumptionClamping(refreshed);
}

/**
 * Processes same-element infliction stacking:
 * - Extends slots 0–2 durations when later stacks refresh them
 * - Clamps slot 3 events sequentially (previous ends where next begins)
 *
 * Uses iterative refinement: extend durations first, then assign slots using
 * the extended durations so the slot assignment matches TimelineGrid's greedy
 * bin-packing on the processed output.
 */
function applySameElementRefresh(events: TimelineEvent[]): TimelineEvent[] {
  const inflictionsByChannel = new Map<string, TimelineEvent[]>();
  for (const ev of events) {
    if (ev.ownerId === 'enemy' && INFLICTION_CHANNEL_IDS.has(ev.channelId)) {
      const group = inflictionsByChannel.get(ev.channelId) ?? [];
      group.push(ev);
      inflictionsByChannel.set(ev.channelId, group);
    }
  }

  if (inflictionsByChannel.size === 0) return events;

  const processedMap = new Map<string, TimelineEvent>();

  inflictionsByChannel.forEach((group) => {
    if (group.length <= 1) return; // nothing to refresh with a single event
    const sorted = [...group].sort((a, b) => a.startFrame - b.startFrame);
    const lastSlot = INFLICTION_SLOTS - 1;

    // Step 1: Compute the maximum extended duration for each event assuming
    // all events in slots 0–2 get fully extended. We extend each event's
    // activeDuration to the latest end frame reachable through a chain of
    // overlapping subsequent stacks.
    const extendedActive: number[] = sorted.map((ev) => ev.activeDuration);
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

    // Step 2: Assign slots using extended durations (matching TimelineGrid's
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
        if (extendedActive[i] !== ev.activeDuration) {
          processedMap.set(ev.id, { ...ev, activeDuration: extendedActive[i] });
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
      const totalDur = ev.activeDuration + ev.lingeringDuration + ev.cooldownDuration;
      const originalEnd = ev.startFrame + totalDur;

      if (nextStart < originalEnd) {
        const available = Math.max(0, nextStart - ev.startFrame);
        const clampedActive = Math.min(ev.activeDuration, available);
        const remAfterActive = available - clampedActive;
        const clampedLinger = Math.min(ev.lingeringDuration, remAfterActive);
        const remAfterLinger = remAfterActive - clampedLinger;
        const clampedCooldown = Math.min(ev.cooldownDuration, remAfterLinger);

        processedMap.set(ev.id, {
          ...(processedMap.get(ev.id) ?? ev),
          activeDuration: clampedActive,
          lingeringDuration: clampedLinger,
          cooldownDuration: clampedCooldown,
        });
      }
    }
  });

  if (processedMap.size === 0) return events;
  return events.map((ev) => processedMap.get(ev.id) ?? ev);
}

/**
 * Clamp infliction events at arts reaction consumption points.
 */
function applyConsumptionClamping(events: TimelineEvent[]): TimelineEvent[] {
  const reactionFrames = events
    .filter((ev) => ev.ownerId === 'enemy' && REACTION_CHANNEL_IDS.has(ev.channelId))
    .map((ev) => ev.startFrame)
    .sort((a, b) => a - b);

  if (reactionFrames.length === 0) return events;

  return events.map((ev) => {
    if (ev.ownerId !== 'enemy' || !INFLICTION_CHANNEL_IDS.has(ev.channelId)) return ev;

    const consumeFrame = reactionFrames.find((f) => f > ev.startFrame);
    if (consumeFrame === undefined) return ev;

    const originalEnd = ev.startFrame + ev.activeDuration + ev.lingeringDuration + ev.cooldownDuration;
    if (consumeFrame >= originalEnd) return ev;

    const available = Math.max(0, consumeFrame - ev.startFrame);
    const clampedActive = Math.min(ev.activeDuration, available);
    const remAfterActive = available - clampedActive;
    const clampedLinger = Math.min(ev.lingeringDuration, remAfterActive);
    const remAfterLinger = remAfterActive - clampedLinger;
    const clampedCooldown = Math.min(ev.cooldownDuration, remAfterLinger);

    return {
      ...ev,
      activeDuration: clampedActive,
      lingeringDuration: clampedLinger,
      cooldownDuration: clampedCooldown,
    };
  });
}
