/**
 * Status view controller — computes stack-aware display labels and visual
 * overrides for status events rendered in micro-column columns.
 *
 * When multiple instances of the same status type overlap in time:
 * - Each event's label reflects its stack position: "Heat I", "Heat II", etc.
 * - Earlier events are visually truncated where the next same-type event starts.
 * - All same-type events share a single visual column (not split side-by-side).
 *
 * Statuses with max 1 instance and no stacking interactions (NONE/RESET) omit
 * the roman numeral suffix since only one can be active at a time in-game.
 *
 * Beyond 9 stacks, standard numbers are used (e.g. "Heat 10").
 */
import { TimelineEvent, Column } from '../../consts/viewTypes';
import { INFLICTION_EVENT_LABELS } from '../../consts/timelineColumnLabels';
import { formatSegmentShortName } from '../../utils/semanticsTranslation';
import { getOperatorJson, getAllOperatorIds } from '../../model/event-frames/operatorJsonLoader';
import { REACTION_COLUMNS } from '../../model/channels';

const REACTION_COLUMN_IDS: Set<string> = new Set(Object.values(REACTION_COLUMNS));

const MAX_ROMAN = 9;

function stackLabel(stackNumber: number): string {
  if (stackNumber <= MAX_ROMAN) return formatSegmentShortName(undefined, stackNumber - 1);
  return `${stackNumber}`;
}

// ── Status stack metadata cache ────────────────────────────────────────────

interface StatusStackInfo {
  instances: number;
  verb: string;
}

/** Lazily-built map from status name → stack config. */
let statusStackCache: Map<string, StatusStackInfo> | null = null;

function getStatusStackInfo(statusName: string): StatusStackInfo | undefined {
  if (!statusStackCache) {
    statusStackCache = new Map();
    for (const opId of getAllOperatorIds()) {
      const json = getOperatorJson(opId);
      const statusEvents = json?.statusEvents as { id: string; statusLevel?: { limit?: { P0?: number }; statusLevelInteractionType?: string } }[] | undefined;
      if (!statusEvents) continue;
      for (const se of statusEvents) {
        if (statusStackCache.has(se.id)) continue;
        const limitP0 = se.statusLevel?.limit?.P0 ?? 1;
        const verb = se.statusLevel?.statusLevelInteractionType ?? 'NONE';
        statusStackCache.set(se.id, { instances: limitP0, verb });
      }
    }
  }
  return statusStackCache.get(statusName);
}

/** Returns true if this status should NOT show roman numeral suffixes. */
function isSingleInstanceStatus(statusName: string): boolean {
  const info = getStatusStackInfo(statusName);
  if (!info) return false;
  return info.instances <= 1 && (info.verb === 'NONE' || info.verb === 'RESET');
}

/** Returns true if this status is stackable (more than 1 instance). */
function isStackableStatus(statusName: string): boolean {
  const info = getStatusStackInfo(statusName);
  return !!info && info.instances > 1;
}

export interface StatusViewOverride {
  label: string;
  /** Truncated activation duration (frames) for visual rendering. */
  visualActivationDuration?: number;
}

/**
 * Compute stack-aware labels and visual truncations for all status events
 * in micro-column columns.
 *
 * For same-type overlapping events:
 * - Labels become "{StatusName} {I/II/III/...}" based on chronological position
 * - Earlier events are visually truncated to end where the next same-type event starts
 * - Statuses with max 1 instance and no stacking use the base name without numerals
 *
 * Returns a map of eventId → StatusViewOverride.
 */
export function computeStatusViewOverrides(
  events: TimelineEvent[],
  columns: Column[],
): Map<string, StatusViewOverride> {
  const overrides = new Map<string, StatusViewOverride>();

  for (const col of columns) {
    if (col.type !== 'mini-timeline' || !col.microColumns) continue;

    const matchSet = col.matchColumnIds ? new Set(col.matchColumnIds) : null;
    const colEvents = events.filter(
      (ev) => ev.ownerId === col.ownerId &&
        (matchSet ? matchSet.has(ev.columnId) : ev.columnId === col.columnId),
    );

    // Group events by their columnId (status type)
    const byType = new Map<string, TimelineEvent[]>();
    for (const ev of colEvents) {
      const group = byType.get(ev.columnId) ?? [];
      group.push(ev);
      byType.set(ev.columnId, group);
    }

    for (const [columnId, typeEvents] of Array.from(byType.entries())) {
      // Reaction columns get their level from segment labels (based on inflictionStacks),
      // not positional numerals — skip them here.
      if (REACTION_COLUMN_IDS.has(columnId)) continue;

      const sorted = [...typeEvents].sort((a, b) => a.startFrame - b.startFrame || a.id.localeCompare(b.id));
      const baseName = INFLICTION_EVENT_LABELS[columnId] ?? INFLICTION_EVENT_LABELS[sorted[0].name] ?? sorted[0].name;

      // Check if this status type is single-instance (no stacking numerals needed)
      const singleInstance = isSingleInstanceStatus(sorted[0].name);
      const stackable = isStackableStatus(sorted[0].name);

      // Skip single events that don't need any override from the status view layer
      if (typeEvents.length <= 1 && !stackable) continue;

      for (let i = 0; i < sorted.length; i++) {
        const ev = sorted[i];
        // Count how many earlier same-type events are still active at this event's start
        let activeEarlier = 0;
        for (let j = 0; j < i; j++) {
          const prev = sorted[j];
          const prevEnd = prev.startFrame + prev.activationDuration + prev.activeDuration + prev.cooldownDuration;
          if (prevEnd > ev.startFrame) activeEarlier++;
        }
        const position = activeEarlier + 1;

        const override: StatusViewOverride = {
          label: singleInstance ? baseName : `${baseName} ${stackLabel(position)}`,
        };

        // Truncate visual duration: if there's a next same-type event that starts
        // before this event's natural end, clamp this event's visual activation
        // duration to end where the next one starts.
        if (i < sorted.length - 1) {
          const nextStart = sorted[i + 1].startFrame;
          const totalDur = ev.activationDuration + ev.activeDuration + ev.cooldownDuration;
          const evEnd = ev.startFrame + totalDur;
          if (nextStart < evEnd) {
            // Truncate: visual activation ends at next event's start
            const visualDur = nextStart - ev.startFrame;
            if (visualDur >= 0) {
              override.visualActivationDuration = visualDur;
            }
          }
        }

        overrides.set(ev.id, override);
      }
    }
  }

  return overrides;
}
