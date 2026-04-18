/**
 * Flatten TimelineEvents into priority-queue entries (PROCESS_FRAME
 * hooks, COMBO_RESOLVE, etc.) for the interpretor to drain. Single
 * authority for "turn events into queue frames" — called from
 * `createSkillEvent` for per-event ingress and from `runEventQueue`
 * for freeform derived events (inflictions/reactions/statuses that
 * bypass createSkillEvent).
 *
 * Skill events emit the full lifecycle: EVENT_START, per-segment
 * SEGMENT_START / per-frame PROCESS_FRAME / SEGMENT_END, EVENT_END.
 *
 * Non-skill non-resource (freeform inflictions / reactions / physical
 * statuses / statuses) emit only the PROCESS_FRAME queue entries that
 * carry the APPLY clause that creates the applied event. Their
 * lifecycle (EVENT_END, onEntry/onExit, offset>0 segment frames) is
 * scheduled entirely by `runStatusCreationLifecycle` on the
 * applyEvent-created event. Emitting skill-style EVENT_START /
 * SEGMENT_* / EVENT_END hooks for the raw wrapper would duplicate the
 * applied event's own hooks and cause IS_NOT to fire at the raw
 * (unextended) end, prematurely consuming BECOME-NOT talents such as
 * Yvonne's Freezing Point.
 */
import { TimelineEvent, activeEndFrame } from '../../../consts/viewTypes';
import { NounType } from '../../../dsl/semantics';
import { TimeStopRegion, absoluteFrame, foreignStopsFor } from '../processTimeStop';
import { QueueFrameType, FrameHookType } from '../eventQueueTypes';
import type { QueueFrame } from '../eventQueueTypes';
import { SKILL_COLUMN_ORDER } from '../../../model/channels';
import type { SkillType } from '../../../consts/viewTypes';
import { allocQueueFrame } from '../objectPool';

const SKILL_COLUMN_SET: ReadonlySet<string> = new Set(SKILL_COLUMN_ORDER);

/** Resource columns that should not generate synthetic PROCESS_FRAME entries. */
let _resourceColumnSet: ReadonlySet<string> | null = null;
function getResourceColumnSet(): ReadonlySet<string> {
  if (!_resourceColumnSet) {
    // Lazy init to avoid circular dependency with commonSlotController
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { COMMON_COLUMN_IDS } = require('../../slot/commonSlotController');
    _resourceColumnSet = new Set(Object.values(COMMON_COLUMN_IDS) as string[]);
  }
  return _resourceColumnSet;
}

export function flattenEventsToQueueFrames(
  events: readonly TimelineEvent[],
  stops: readonly TimeStopRegion[],
): QueueFrame[] {
  const entries: QueueFrame[] = [];

  for (const event of events) {
    const isNonSkillNonResource = !SKILL_COLUMN_SET.has(event.columnId as SkillType)
      && !getResourceColumnSet().has(event.columnId);

    if (isNonSkillNonResource) {
      emitNonSkillFrames(event, stops, entries);
      continue;
    }

    emitSkillLifecycle(event, stops, entries);

    // Seed COMBO_RESOLVE for combo events (fires after engine triggers)
    if (event.columnId === NounType.COMBO && !event.comboTriggerColumnId) {
      const combo = allocQueueFrame();
      combo.frame = event.startFrame;

      combo.type = QueueFrameType.COMBO_RESOLVE;
      combo.statusId = event.id;
      combo.columnId = event.columnId;
      combo.ownerEntityId = event.ownerEntityId;
      combo.sourceEntityId = event.ownerEntityId;
      combo.sourceSkillId = event.id;
      combo.maxStacks = 0;
      combo.durationFrames = 0;
      combo.operatorSlotId = event.ownerEntityId;
      combo.comboResolveEvent = event;
      entries.push(combo);
    }
  }

  return entries;
}

/**
 * Emit queue frames for a freeform non-skill wrapper event.
 *
 * Every freeform-placeable non-skill column ships an APPLY clause in its
 * `defaultEvent` (via `buildStatusMicroColumn`); `attachDefaultSegments`
 * attaches that frame to the raw event before the pipeline runs. So every
 * non-skill event reaching flatten carries at least one clause-carrying
 * frame — that's what gets emitted as a PROCESS_FRAME.
 *
 * No EVENT_START / SEGMENT_START / SEGMENT_END / EVENT_END are emitted —
 * the wrapper has no lifecycle of its own; the applied event that
 * `doApply` creates via `applyEvent` owns the lifecycle via
 * `runStatusCreationLifecycle`.
 */
function emitNonSkillFrames(
  event: TimelineEvent,
  stops: readonly TimeStopRegion[],
  entries: QueueFrame[],
): void {
  const fStops = foreignStopsFor(event, stops);
  let cumulativeOffset = 0;

  for (let si = 0; si < event.segments.length; si++) {
    const seg = event.segments[si];
    if (seg.frames && seg.frames.length > 0) {
      for (let fi = 0; fi < seg.frames.length; fi++) {
        const frame = seg.frames[fi];
        const absFrame = absoluteFrame(event.startFrame, cumulativeOffset, frame.offsetFrame, fStops);

        const qf = allocQueueFrame();
        qf.frame = absFrame;

        qf.type = QueueFrameType.PROCESS_FRAME;
        qf.statusId = event.id;
        qf.columnId = event.columnId;
        qf.ownerEntityId = event.ownerEntityId;
        qf.sourceEntityId = event.ownerEntityId;
        qf.sourceSkillId = event.id;
        qf.maxStacks = 0;
        qf.durationFrames = 0;
        qf.operatorSlotId = event.ownerEntityId;
        qf.frameMarker = frame;
        qf.sourceEvent = event;
        qf.segmentIndex = si;
        qf.frameIndex = fi;
        entries.push(qf);
      }
    }
    cumulativeOffset += seg.properties.duration;
  }
}

/**
 * Emit the full lifecycle of queue frames for a skill event:
 * EVENT_START, per-segment SEGMENT_START / per-frame PROCESS_FRAME /
 * SEGMENT_END, EVENT_END at the active end.
 */
function emitSkillLifecycle(
  event: TimelineEvent,
  stops: readonly TimeStopRegion[],
  entries: QueueFrame[],
): void {
  const start = allocQueueFrame();
  start.frame = event.startFrame;
  start.type = QueueFrameType.PROCESS_FRAME;
  start.hookType = FrameHookType.EVENT_START;
  start.statusId = event.id;
  start.columnId = event.columnId;
  start.ownerEntityId = event.ownerEntityId;
  start.sourceEntityId = event.ownerEntityId;
  start.sourceSkillId = event.id;
  start.maxStacks = 0;
  start.durationFrames = 0;
  start.operatorSlotId = event.ownerEntityId;
  start.sourceEvent = event;
  start.segmentIndex = -1;
  start.frameIndex = -1;
  entries.push(start);

  const fStops = foreignStopsFor(event, stops);
  let cumulativeOffset = 0;

  for (let si = 0; si < event.segments.length; si++) {
    const seg = event.segments[si];

    const segStartFrame = absoluteFrame(event.startFrame, cumulativeOffset, 0, fStops);
    const segStart = allocQueueFrame();
    segStart.frame = segStartFrame;
    segStart.type = QueueFrameType.PROCESS_FRAME;
    segStart.hookType = FrameHookType.SEGMENT_START;
    segStart.statusId = event.id;
    segStart.columnId = event.columnId;
    segStart.ownerEntityId = event.ownerEntityId;
    segStart.sourceEntityId = event.ownerEntityId;
    segStart.sourceSkillId = event.id;
    segStart.maxStacks = 0;
    segStart.durationFrames = 0;
    segStart.operatorSlotId = event.ownerEntityId;
    segStart.sourceEvent = event;
    segStart.segmentIndex = si;
    segStart.frameIndex = -1;
    entries.push(segStart);

    if (seg.frames && seg.frames.length > 0) {
      for (let fi = 0; fi < seg.frames.length; fi++) {
        const frame = seg.frames[fi];
        const absFrame = absoluteFrame(event.startFrame, cumulativeOffset, frame.offsetFrame, fStops);

        const qf = allocQueueFrame();
        qf.frame = absFrame;
        qf.type = QueueFrameType.PROCESS_FRAME;
        qf.statusId = event.id;
        qf.columnId = event.columnId;
        qf.ownerEntityId = event.ownerEntityId;
        qf.sourceEntityId = event.ownerEntityId;
        qf.sourceSkillId = event.id;
        qf.maxStacks = 0;
        qf.durationFrames = 0;
        qf.operatorSlotId = event.ownerEntityId;
        qf.frameMarker = frame;
        qf.sourceEvent = event;
        qf.segmentIndex = si;
        qf.frameIndex = fi;
        entries.push(qf);
      }
    }
    cumulativeOffset += seg.properties.duration;

    const segEndFrame = absoluteFrame(event.startFrame, cumulativeOffset, 0, fStops);
    if (segEndFrame > segStartFrame) {
      const segEnd = allocQueueFrame();
      segEnd.frame = segEndFrame;
      segEnd.type = QueueFrameType.PROCESS_FRAME;
      segEnd.hookType = FrameHookType.SEGMENT_END;
      segEnd.statusId = event.id;
      segEnd.columnId = event.columnId;
      segEnd.ownerEntityId = event.ownerEntityId;
      segEnd.sourceEntityId = event.ownerEntityId;
      segEnd.sourceSkillId = event.id;
      segEnd.maxStacks = 0;
      segEnd.durationFrames = 0;
      segEnd.operatorSlotId = event.ownerEntityId;
      segEnd.sourceEvent = event;
      segEnd.segmentIndex = si;
      segEnd.frameIndex = -1;
      entries.push(segEnd);
    }
  }

  const endFrame = activeEndFrame(event);
  if (endFrame > event.startFrame) {
    const end = allocQueueFrame();
    end.frame = endFrame;
    end.type = QueueFrameType.PROCESS_FRAME;
    end.hookType = FrameHookType.EVENT_END;
    end.statusId = event.id;
    end.columnId = event.columnId;
    end.ownerEntityId = event.ownerEntityId;
    end.sourceEntityId = event.ownerEntityId;
    end.sourceSkillId = event.id;
    end.maxStacks = 0;
    end.durationFrames = 0;
    end.operatorSlotId = event.ownerEntityId;
    end.sourceEvent = event;
    end.segmentIndex = -1;
    end.frameIndex = -1;
    entries.push(end);
  }
}
