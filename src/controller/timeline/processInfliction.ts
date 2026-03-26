import { TimelineEvent, EventFrameMarker, EventSegmentData, SkillType, eventDuration } from '../../consts/viewTypes';
import { LoadoutProperties, DEFAULT_LOADOUT_PROPERTIES } from '../../view/InformationPane';
import { ElementType, EventFrameType, EventStatusType } from '../../consts/enums';
import { StatusLevel } from '../../consts/types';
import { getCorrosionBaseReduction, getCorrosionReductionMultiplier } from '../../model/calculation/damageFormulas';
import {
  ENEMY_OWNER_ID, REACTION_COLUMN_IDS, REACTION_COLUMNS,
} from '../../model/channels';
import { FPS } from '../../utils/timeline';
import { contractByTimeStops, TimeStopRegion } from './processTimeStop';

/** Maximum 0-based index for skill level arrays (12 levels → index 0–11). */
const MAX_SKILL_LEVEL_INDEX = 11;

// Re-export domain constants now defined in channels
export {
  ELEMENT_TO_INFLICTION_COLUMN,
  FORCED_REACTION_COLUMN,
  FORCED_REACTION_DURATION,
  REACTION_DURATION,
  INFLICTION_DURATION,
  BREACH_DURATION,
  PHYSICAL_INFLICTION_DURATION,
} from '../../model/channels';

/** Source information for event status changes (consumed/refreshed). */
export interface StatusSource {
  ownerId: string;
  skillName?: string;
}

/** Resolves per-level susceptibility array to a scalar using the source operator's skill level. */
export function resolveSusceptibility(
  raw: Partial<Record<ElementType, readonly number[]>>,
  sourceColumnId: string,
  sourceOwnerId: string,
  loadoutProperties?: Record<string, LoadoutProperties>,
): Partial<Record<ElementType, number>> {
  const stats = loadoutProperties?.[sourceOwnerId] ?? DEFAULT_LOADOUT_PROPERTIES;
  const skillType = sourceColumnId as SkillType;
  let skillLevel: number;
  switch (skillType) {
    case 'combo': skillLevel = stats.skills.comboSkillLevel; break;
    case 'ultimate': skillLevel = stats.skills.ultimateLevel; break;
    default: skillLevel = stats.skills.battleSkillLevel; break;
  }
  const idx = Math.max(0, Math.min(skillLevel - 1, MAX_SKILL_LEVEL_INDEX));
  const resolved: Partial<Record<ElementType, number>> = {};
  for (const [element, table] of Object.entries(raw)) {
    // Normalize key to uppercase to match ElementType enum values
    const normalizedKey = element.toUpperCase() as ElementType;
    resolved[normalizedKey] = table[Math.min(idx, table.length - 1)];
  }
  return resolved;
}

/**
 * Merges overlapping same-type arts reaction events.
 *
 * **Corrosion** uses merge semantics: when a newer corrosion overlaps an
 * active older one, the older is clamped at the merge point and the newer
 * inherits max(stacks) and extends its duration if the older would
 * have lasted longer.
 *
 * **Other reactions** use refresh semantics: the older event is clamped
 * when the newer one would outlast it.
 *
 * Segment arrays are rebuilt after merge/clamp to reflect new durations.
 */
export function mergeReactions(events: TimelineEvent[]): TimelineEvent[] {
  const reactionsByType = new Map<string, TimelineEvent[]>();
  for (const ev of events) {
    if (ev.ownerId === ENEMY_OWNER_ID && REACTION_COLUMN_IDS.has(ev.columnId)
      && !ev.eventStatus) { // Skip already-processed (refreshed/consumed) events
      const group = reactionsByType.get(ev.columnId) ?? [];
      group.push(ev);
      reactionsByType.set(ev.columnId, group);
    }
  }

  if (reactionsByType.size === 0) return events;

  const clampMap = new Map<string, { duration: number; source: StatusSource }>();
  const mergeMap = new Map<string, { duration: number; stacks: number; reductionFloor?: number }>();

  reactionsByType.forEach((group, columnId) => {
    if (group.length <= 1) return;
    const sorted = [...group].sort((a, b) => a.startFrame - b.startFrame);

    if (columnId === REACTION_COLUMNS.CORROSION) {
      // Corrosion merge: newer absorbs older's stats and remaining duration
      for (let i = 0; i < sorted.length - 1; i++) {
        const current = sorted[i];
        const currentDur = mergeMap.get(current.uid)?.duration ?? eventDuration(current);
        const currentEnd = current.startFrame + currentDur;
        const next = sorted[i + 1];

        if (next.startFrame >= currentEnd) continue;

        clampMap.set(current.uid, {
          duration: Math.max(0, next.startFrame - current.startFrame),
          source: { ownerId: next.sourceOwnerId ?? ENEMY_OWNER_ID, skillName: next.sourceSkillName },
        });

        const currentStacks = mergeMap.get(current.uid)?.stacks ?? current.stacks ?? 1;
        const nextStacks = next.stacks ?? 1;

        const remainingOldDuration = currentEnd - next.startFrame;
        const newDuration = eventDuration(next);

        // Compute the old corrosion's reduction at the merge point (with arts intensity)
        const elapsedSeconds = (next.startFrame - current.startFrame) / FPS;
        const oldReductionFloor = mergeMap.get(current.uid)?.reductionFloor ?? 0;
        const oldArtsIntensity = current.artsIntensity ?? 0;
        const oldBaseReduction = getCorrosionBaseReduction(
          Math.min(currentStacks, 4) as StatusLevel,
          elapsedSeconds,
        ) * getCorrosionReductionMultiplier(oldArtsIntensity);
        const currentReduction = Math.max(oldReductionFloor, oldBaseReduction);

        mergeMap.set(next.uid, {
          duration: Math.max(remainingOldDuration, newDuration),
          stacks: Math.max(currentStacks, nextStacks),
          reductionFloor: currentReduction,
        });
      }
    } else {
      // Other reactions: refresh semantics — clamp older, newer inherits max stacks
      for (let i = 0; i < sorted.length - 1; i++) {
        const current = sorted[i];
        const currentDur = mergeMap.get(current.uid)?.duration ?? eventDuration(current);
        const currentEnd = current.startFrame + currentDur;
        const next = sorted[i + 1];

        if (next.startFrame >= currentEnd) continue;

        // Clamp older event at the point the newer starts
        clampMap.set(current.uid, {
          duration: Math.max(0, next.startFrame - current.startFrame),
          source: { ownerId: next.sourceOwnerId ?? ENEMY_OWNER_ID, skillName: next.sourceSkillName },
        });

        // Newer inherits max stacks
        const currentStacks = mergeMap.get(current.uid)?.stacks ?? current.stacks ?? 1;
        const nextStacks = next.stacks ?? 1;

        mergeMap.set(next.uid, {
          duration: eventDuration(next),
          stacks: Math.max(currentStacks, nextStacks),
        });
      }
    }
  });

  if (clampMap.size === 0 && mergeMap.size === 0) return events;

  return events.map((ev) => {
    const clamp = clampMap.get(ev.uid);
    const merge = mergeMap.get(ev.uid);

    if (clamp !== undefined) {
      // Truncate segments to fit the clamped duration
      const truncated = truncateSegments(ev.segments, clamp.duration);
      ev.segments = truncated ?? [{ properties: { duration: clamp.duration } }];
      ev.eventStatus = EventStatusType.REFRESHED;
      ev.eventStatusOwnerId = clamp.source.ownerId;
      ev.eventStatusSkillName = clamp.source.skillName;
      return ev;
    }
    if (merge !== undefined) {
      // Rebuild segments with merged stats (inherited max stacks)
      ev.segments = [{ properties: { duration: merge.duration } }];
      ev.stacks = merge.stacks;
      ev.reductionFloor = merge.reductionFloor;
      attachReactionFrames([ev]);
      return ev;
    }
    return ev;
  });
}

/** Truncate a segment array to fit within a new total duration. */
function truncateSegments(
  segments: EventSegmentData[],
  newDuration: number,
): EventSegmentData[] | undefined {
  if (segments.length === 0) return undefined;
  const result: EventSegmentData[] = [];
  let remaining = newDuration;
  for (const seg of segments) {
    if (remaining <= 0) break;
    if (seg.properties.duration <= remaining) {
      result.push(seg);
      remaining -= seg.properties.duration;
    } else {
      const clampedDuration = remaining;
      const truncated = { ...seg, properties: { ...seg.properties, duration: clampedDuration } };
      // Filter out frames that exceed the truncated segment duration
      if (truncated.frames) {
        truncated.frames = truncated.frames.filter(f => f.offsetFrame <= clampedDuration);
      }
      result.push(truncated);
      remaining = 0;
    }
  }
  return result.length > 0 ? result : undefined;
}

// ── Reaction frame attachment ─────────────────────────────────────────────

/** Maps reaction columnId → damage element. */
const REACTION_DAMAGE_ELEMENT: Record<string, ElementType> = {
  combustion:      ElementType.HEAT,
  solidification:  ElementType.CRYO,
  corrosion:       ElementType.NATURE,
  electrification: ElementType.ELECTRIC,
};

/**
 * Attach damage frame markers to arts reaction events.
 *
 * - Combustion: initial hit + DoT ticks at 1-second intervals
 * - Solidification: initial hit + shatter at end
 * - Corrosion: initial hit only (resistance reduction is a debuff)
 * - Electrification: initial hit only (fragility is a debuff)
 *
 * Forced reactions skip the initial hit frame.
 * Call before time-stop extension so frame positions get adjusted.
 */
export function attachReactionFrames(events: TimelineEvent[]): TimelineEvent[] {
  for (const ev of events) {
    if (ev.ownerId !== ENEMY_OWNER_ID || !REACTION_COLUMN_IDS.has(ev.columnId)) continue;
    // Skip if event already has rich segments (more than a single default duration segment)
    if (ev.segments.length > 1 || ev.segments[0]?.frames) continue;

    if (ev.columnId === REACTION_COLUMNS.CORROSION) {
      const segments = buildCorrosionSegments(ev);
      if (segments) ev.segments = segments;
    } else {
      const segment = buildReactionSegment(ev);
      if (segment) ev.segments = [segment];
    }
  }
  return events;
}

/** Label lookup for reaction segments. */
const REACTION_SEGMENT_LABEL: Record<string, string> = {
  combustion:      'Combustion',
  solidification:  'Solidification',
  corrosion:       'Corrosion',
  electrification: 'Electrification',
  shatter:         'Shatter',
};

export function buildReactionSegment(ev: TimelineEvent, rawDuration?: number, foreignStops?: readonly TimeStopRegion[]): EventSegmentData | null {
  const element = REACTION_DAMAGE_ELEMENT[ev.columnId];
  if (!element) return null;

  const dur = eventDuration(ev);
  // Convert real-time duration to game-time (subtract time-stop gaps) so tick
  // count reflects actual game seconds, not wall-clock frames.
  const gameTimeDur = foreignStops && foreignStops.length > 0
    ? contractByTimeStops(ev.startFrame, dur, foreignStops)
    : dur;
  // Clamp to raw game-time duration to prevent inflation from time-stop extension.
  const tickDur = rawDuration != null ? Math.min(rawDuration, gameTimeDur) : gameTimeDur;

  const forced = ev.isForced || ev.forcedReaction;
  const frames: EventFrameMarker[] = [];

  // Initial reaction hit at frame 0 (skipped for forced reactions)
  if (!forced) {
    frames.push({ offsetFrame: 0, damageElement: element });
  }

  const COMBUSTION_FRAME_TYPES = [EventFrameType.GUARANTEED_HIT, EventFrameType.DAMAGE_OVER_TIME, EventFrameType.PASSIVE];
  if (ev.columnId === REACTION_COLUMNS.COMBUSTION) {
    // Initial hit also gets combustion frame types
    if (frames.length > 0) frames[0].frameTypes = COMBUSTION_FRAME_TYPES;
    // DoT ticks at 1-second intervals, clamped to raw game-time duration
    const tickCount = Math.floor(tickDur / FPS);
    for (let i = 1; i <= tickCount; i++) {
      frames.push({ offsetFrame: i * FPS, damageElement: element, frameTypes: COMBUSTION_FRAME_TYPES });
    }
  }
  // Solidification: initial hit only — shatter is triggered by physical status consumption
  // Corrosion: handled separately in buildCorrosionSegments
  // Electrification: initial hit only (no additional frames)
  // Shatter: frames are set at creation time in eventInterpretorController

  const baseName = REACTION_SEGMENT_LABEL[ev.columnId] ?? ev.columnId;
  const level = ev.stacks ?? 1;
  const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'][level - 1] ?? `${level}`;

  return {
    properties: { duration: dur, name: `${baseName} ${roman}` },
    frames,
  };
}

/**
 * Build per-second segments for corrosion, each carrying the reduction effect.
 * Segment 1 is named "Corrosion 1", subsequent segments are "2", "3", etc.
 * Each segment contains a status frame showing the base resistance reduction.
 */
export function buildCorrosionSegments(ev: TimelineEvent): EventSegmentData[] | null {
  const element = REACTION_DAMAGE_ELEMENT[ev.columnId];
  if (!element) return null;

  const cappedStacks = Math.min(ev.stacks ?? 1, 4) as StatusLevel;
  const totalDuration = eventDuration(ev);
  const durationSeconds = Math.floor(totalDuration / FPS);
  const segments: EventSegmentData[] = [];
  const floor = ev.reductionFloor ?? 0;
  const aiMultiplier = getCorrosionReductionMultiplier(ev.artsIntensity ?? 0);

  const forced = ev.isForced || ev.forcedReaction;

  for (let i = 0; i < durationSeconds; i++) {
    const segDuration = Math.min(FPS, totalDuration - i * FPS);
    if (segDuration <= 0) break;

    const segIndex = i + 1;
    const scaledReduction = getCorrosionBaseReduction(cappedStacks, segIndex) * aiMultiplier;
    const reduction = Math.max(floor, scaledReduction);

    // Natural corrosion: initial damage hit on first segment
    const frames = (i === 0 && !forced)
      ? [{ offsetFrame: 0, damageElement: element }]
      : undefined;

    const ROMAN = ['I', 'II', 'III', 'IV'];
    segments.push({
      properties: {
        duration: segDuration,
        name: i === 0 ? `Corrosion ${ROMAN[cappedStacks - 1]}` : undefined,
      },
      unknown: { statusLabel: `-${reduction.toFixed(1)} Res` },
      frames,
    });
  }

  // Handle any remaining frames beyond the last full second
  const remainingFrames = totalDuration - durationSeconds * FPS;
  if (remainingFrames > 0) {
    const scaledReduction = getCorrosionBaseReduction(cappedStacks, durationSeconds + 1) * aiMultiplier;
    const reduction = Math.max(floor, scaledReduction);
    segments.push({
      properties: { duration: remainingFrames },
      unknown: { statusLabel: `-${reduction.toFixed(1)} Res`, name: `Tick ${durationSeconds}` },
    });
  }

  return segments.length > 0 ? segments : null;
}
