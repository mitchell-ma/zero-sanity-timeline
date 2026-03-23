/**
 * Arts reaction derivation from infliction events.
 *
 * Reactions are cross-element: when an incoming infliction finds active
 * inflictions of a DIFFERENT element, a reaction is triggered.
 *
 * Reaction type is determined by the incoming element's mapping
 * (INFLICTION_TO_REACTION from channels).
 *
 * Stacks = min(active other-element infliction count, 2).
 * All inflictions (incoming + active same/other element) are consumed.
 */
import type { TimelineEvent } from '../../consts/viewTypes';
import { eventEndFrame, durationSegment, setEventDuration, eventDuration } from '../../consts/viewTypes';
import { EventStatusType } from '../../consts/enums';
import { ENEMY_OWNER_ID, INFLICTION_COLUMN_IDS, INFLICTION_TO_REACTION } from '../../model/channels';

/** Default active duration for derived reaction events (20s at 120fps). */
const REACTION_DURATION = 2400;

interface StatusSource {
  ownerId: string;
  skillName?: string;
}

export function deriveReactions(events: TimelineEvent[]): TimelineEvent[] {
  // Collect all enemy infliction events, sorted by start frame
  const inflictions = events
    .filter((ev) => ev.ownerId === ENEMY_OWNER_ID && INFLICTION_COLUMN_IDS.has(ev.columnId))
    .sort((a, b) => a.startFrame - b.startFrame);

  if (inflictions.length === 0) return events;

  // Track which infliction IDs are consumed (triggering infliction removed,
  // consumed inflictions clamped)
  const removedIds = new Set<string>();
  const clampMap = new Map<string, { frame: number; source: StatusSource }>();
  const generatedReactions: TimelineEvent[] = [];

  // Walk through inflictions in chronological order
  for (let i = 0; i < inflictions.length; i++) {
    const incoming = inflictions[i];
    if (removedIds.has(incoming.uid)) continue;
    // Skip inflictions already consumed by absorption — they shouldn't trigger reactions
    if (incoming.eventStatus === EventStatusType.CONSUMED) continue;

    // Find active inflictions of a DIFFERENT element at incoming's start frame
    const activeOther: TimelineEvent[] = [];
    for (let j = 0; j < i; j++) {
      const prev = inflictions[j];
      if (removedIds.has(prev.uid)) continue;
      if (prev.columnId === incoming.columnId) continue;
      // Skip inflictions already consumed by absorption — they shouldn't trigger reactions
      if (prev.eventStatus === EventStatusType.CONSUMED) continue;

      // Use clamped end if already clamped by a prior reaction
      const clamp = clampMap.get(prev.uid);
      const endFrame = clamp !== undefined
        ? clamp.frame
        : eventEndFrame(prev);

      if (endFrame > incoming.startFrame) {
        activeOther.push(prev);
      }
    }

    if (activeOther.length > 0) {
      // Generate reaction event.
      const reactionColumnId = INFLICTION_TO_REACTION[incoming.columnId];
      generatedReactions.push({
        uid: `${incoming.uid}-reaction`,
        id: reactionColumnId,
        name: reactionColumnId,
        ownerId: ENEMY_OWNER_ID,
        columnId: reactionColumnId,
        startFrame: incoming.startFrame,
        segments: durationSegment(REACTION_DURATION),
        sourceOwnerId: incoming.sourceOwnerId,
        sourceSkillName: incoming.sourceSkillName,
        stacks: Math.min(activeOther.length, 2),
      });

      // Remove the triggering infliction
      removedIds.add(incoming.uid);

      // Clamp ALL active other-element inflictions at the reaction frame
      const reactionSource: StatusSource = { ownerId: incoming.sourceOwnerId ?? ENEMY_OWNER_ID, skillName: incoming.sourceSkillName };
      for (const consumed of activeOther) {
        clampMap.set(consumed.uid, { frame: incoming.startFrame, source: reactionSource });
      }

      // Also consume any active same-element inflictions at the reaction frame
      for (let j = 0; j < i; j++) {
        const prev = inflictions[j];
        if (removedIds.has(prev.uid)) continue;
        if (clampMap.has(prev.uid)) continue; // already clamped by other-element pass
        if (prev.eventStatus === EventStatusType.CONSUMED) continue;
        const endFrame = eventEndFrame(prev);
        if (endFrame > incoming.startFrame) {
          clampMap.set(prev.uid, { frame: incoming.startFrame, source: reactionSource });
        }
      }
    }
  }

  if (removedIds.size === 0 && generatedReactions.length === 0) return events;

  // Build output: filter removed, clamp consumed, append generated reactions
  const result: TimelineEvent[] = [];
  for (const ev of events) {
    if (removedIds.has(ev.uid)) continue;

    const clamp = clampMap.get(ev.uid);
    if (clamp !== undefined) {
      const available = Math.max(0, clamp.frame - ev.startFrame);
      const clampedDuration = Math.min(eventDuration(ev), available);
      const clamped = { ...ev, segments: [...ev.segments] };
      setEventDuration(clamped, clampedDuration);
      result.push({
        ...clamped,
        eventStatus: EventStatusType.CONSUMED,
        eventStatusOwnerId: clamp.source.ownerId,
        eventStatusSkillName: clamp.source.skillName,
      });
    } else {
      result.push(ev);
    }
  }

  return [...result, ...generatedReactions];
}
