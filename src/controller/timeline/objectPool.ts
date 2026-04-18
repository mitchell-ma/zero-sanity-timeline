/**
 * Object allocation helpers for the event processing pipeline.
 *
 * resetPools() resets derived event UID counters at the start of each pipeline run.
 */

import type { TimelineEvent } from '../../consts/viewTypes';
import { QueueFrameType } from './eventQueueTypes';
import type { QueueFrame } from './eventQueueTypes';

// ── TimelineEvent allocation ───────────────────────────────────────────────

const EVENT_DEFAULTS: TimelineEvent = {
  uid: '', id: '', name: '', ownerEntityId: '', columnId: '',
  startFrame: 0, segments: [],
};

/** Allocate an input event (controlled operator seed, SP recovery, etc.). */
export function allocInputEvent(): TimelineEvent {
  return { ...EVENT_DEFAULTS, segments: [] };
}

/** Allocate a derived event (infliction, reaction, status). */
export function allocDerivedEvent(): TimelineEvent {
  return { ...EVENT_DEFAULTS, segments: [] };
}

// ── QueueFrame allocation ──────────────────────────────────────────────────

export function allocQueueFrame(): QueueFrame {
  return {
    frame: 0, type: QueueFrameType.PROCESS_FRAME,
    statusId: '', columnId: '', ownerEntityId: '',
    sourceEntityId: '', sourceSkillId: '',
    maxStacks: 0, durationFrames: 0, operatorSlotId: '',
  };
}

// ── Reset ──────────────────────────────────────────────────────────────────

/** Reset derived event UID counters. Call at the start of each pipeline run. */
export function resetPools() {
  // Lazy import to avoid circular dependency
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { resetSegmentCloneCache, resetDerivedEventUids } = require('./inputEventController');
  resetSegmentCloneCache();
  resetDerivedEventUids();
}
