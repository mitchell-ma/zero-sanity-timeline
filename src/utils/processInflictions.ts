import { TimelineEvent } from '../consts/viewTypes';
import { INFLICTION_COLUMN_IDS, INFLICTION_TO_REACTION, REACTION_COLUMN_IDS } from '../model/channels';

/** Default active duration for derived reaction events (20s at 120fps). */
const REACTION_DURATION = 2400;

/** Number of micro-column slots for infliction stacking. */
const INFLICTION_SLOTS = 4;

/**
 * Processes raw timeline events into renderable events.
 *
 * 1. Derives arts reaction events from cross-element infliction overlaps.
 *    The triggering (incoming) infliction is removed; the consumed inflictions
 *    are clamped at the reaction frame.
 * 2. Same-element infliction refresh: slots 0–2 get durations extended to the
 *    newest stack's end time. Slot 3 shows sequential bars.
 */
export function processInflictionEvents(rawEvents: TimelineEvent[]): TimelineEvent[] {
  const withReactions = deriveReactions(rawEvents);
  const mergedReactions = mergeReactions(withReactions);
  return applySameElementRefresh(mergedReactions);
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
 * the extended durations so the slot assignment matches TimelineGrid's greedy
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
