/**
 * Flatten TimelineEvents into priority-queue entries (PROCESS_FRAME
 * hooks, COMBO_RESOLVE, etc.) for the interpretor to drain. Single
 * authority for "turn events into queue frames" — called from
 * `createSkillEvent` for per-event ingress and from `runEventQueue`
 * for freeform derived events (inflictions/reactions/statuses that
 * bypass createSkillEvent).
 */
import { TimelineEvent, activeEndFrame } from '../../../consts/viewTypes';
import { NounType } from '../../../dsl/semantics';
import { TimeStopRegion, absoluteFrame, foreignStopsFor } from '../processTimeStop';
import { PRIORITY, QueueFrameType, FrameHookType } from '../eventQueueTypes';
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

/**
 * Flatten registered events into PROCESS_FRAME (and COMBO_RESOLVE) queue
 * entries. One EVENT_START hook, one SEGMENT_START / SEGMENT_END pair per
 * segment, one ON_FRAME per frame marker, one EVENT_END hook at the active
 * end. Freeform non-skill events without frame markers get a single synthetic
 * PROCESS_FRAME at their startFrame. Combo events without a resolved trigger
 * column get a deferred COMBO_RESOLVE entry.
 *
 * Uses the shared object pool so drag ticks stay allocation-free.
 */
export function flattenEventsToQueueFrames(
  events: readonly TimelineEvent[],
  stops: readonly TimeStopRegion[],
): QueueFrame[] {
  const entries: QueueFrame[] = [];

  for (const event of events) {
    // Seed an event-start entry at the event's start frame
    const start = allocQueueFrame();
    start.frame = event.startFrame;
    start.priority = PRIORITY.PROCESS_FRAME;
    start.type = QueueFrameType.PROCESS_FRAME;
    start.hookType = FrameHookType.EVENT_START;
    start.statusId = event.id;
    start.columnId = event.columnId;
    start.ownerEntityId = event.ownerEntityId;
    start.sourceEntityId = event.ownerEntityId;
    start.sourceSkillName = event.id;
    start.maxStacks = 0;
    start.durationFrames = 0;
    start.operatorSlotId = event.ownerEntityId;
    start.sourceEvent = event;
    start.segmentIndex = -1;
    start.frameIndex = -1;
    entries.push(start);

    const fStops = foreignStopsFor(event, stops);
    let cumulativeOffset = 0;
    let hasFrames = false;
    for (let si = 0; si < event.segments.length; si++) {
      const seg = event.segments[si];

      // SEGMENT_START lifecycle hook
      const segStartFrame = absoluteFrame(event.startFrame, cumulativeOffset, 0, fStops);
      const segStart = allocQueueFrame();
      segStart.frame = segStartFrame;
      segStart.priority = PRIORITY.PROCESS_FRAME;
      segStart.type = QueueFrameType.PROCESS_FRAME;
      segStart.hookType = FrameHookType.SEGMENT_START;
      segStart.statusId = event.id;
      segStart.columnId = event.columnId;
      segStart.ownerEntityId = event.ownerEntityId;
      segStart.sourceEntityId = event.ownerEntityId;
      segStart.sourceSkillName = event.id;
      segStart.maxStacks = 0;
      segStart.durationFrames = 0;
      segStart.operatorSlotId = event.ownerEntityId;
      segStart.sourceEvent = event;
      segStart.segmentIndex = si;
      segStart.frameIndex = -1;
      entries.push(segStart);

      if (seg.frames && seg.frames.length > 0) {
        hasFrames = true;
        for (let fi = 0; fi < seg.frames.length; fi++) {
          const frame = seg.frames[fi];
          const absFrame = absoluteFrame(event.startFrame, cumulativeOffset, frame.offsetFrame, fStops);

          const qf = allocQueueFrame();
          qf.frame = absFrame;
          qf.priority = PRIORITY.PROCESS_FRAME;
          qf.type = QueueFrameType.PROCESS_FRAME;
          qf.statusId = event.id;
          qf.columnId = event.columnId;
          qf.ownerEntityId = event.ownerEntityId;
          qf.sourceEntityId = event.ownerEntityId;
          qf.sourceSkillName = event.id;
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

      // SEGMENT_END lifecycle hook
      const segEndFrame = absoluteFrame(event.startFrame, cumulativeOffset, 0, fStops);
      if (segEndFrame > segStartFrame) {
        const segEnd = allocQueueFrame();
        segEnd.frame = segEndFrame;
        segEnd.priority = PRIORITY.PROCESS_FRAME;
        segEnd.type = QueueFrameType.PROCESS_FRAME;
        segEnd.hookType = FrameHookType.SEGMENT_END;
        segEnd.statusId = event.id;
        segEnd.columnId = event.columnId;
        segEnd.ownerEntityId = event.ownerEntityId;
        segEnd.sourceEntityId = event.ownerEntityId;
        segEnd.sourceSkillName = event.id;
        segEnd.maxStacks = 0;
        segEnd.durationFrames = 0;
        segEnd.operatorSlotId = event.ownerEntityId;
        segEnd.sourceEvent = event;
        segEnd.segmentIndex = si;
        segEnd.frameIndex = -1;
        entries.push(segEnd);
      }
    }

    // Synthesize a frame entry for non-skill events with no frame markers.
    // This routes freeform inflictions, reactions, and statuses through the same
    // PROCESS_FRAME → interpret path as engine-created events.
    if (!hasFrames && !SKILL_COLUMN_SET.has(event.columnId as SkillType) && !getResourceColumnSet().has(event.columnId)) {
      const synth = allocQueueFrame();
      synth.frame = event.startFrame;
      synth.priority = PRIORITY.PROCESS_FRAME;
      synth.type = QueueFrameType.PROCESS_FRAME;
      synth.statusId = event.id;
      synth.columnId = event.columnId;
      synth.ownerEntityId = event.ownerEntityId;
      synth.sourceEntityId = event.ownerEntityId;
      synth.sourceSkillName = event.id;
      synth.maxStacks = 0;
      synth.durationFrames = 0;
      synth.operatorSlotId = event.ownerEntityId;
      synth.frameMarker = { offsetFrame: 0 };
      synth.sourceEvent = event;
      synth.segmentIndex = 0;
      synth.frameIndex = 0;
      entries.push(synth);
    }

    // Seed an event-end entry at the active end frame (before cooldown segments)
    const endFrame = activeEndFrame(event);
    if (endFrame > event.startFrame) {
      const end = allocQueueFrame();
      end.frame = endFrame;
      end.priority = PRIORITY.PROCESS_FRAME;
      end.type = QueueFrameType.PROCESS_FRAME;
      end.hookType = FrameHookType.EVENT_END;
      end.statusId = event.id;
      end.columnId = event.columnId;
      end.ownerEntityId = event.ownerEntityId;
      end.sourceEntityId = event.ownerEntityId;
      end.sourceSkillName = event.id;
      end.maxStacks = 0;
      end.durationFrames = 0;
      end.operatorSlotId = event.ownerEntityId;
      end.sourceEvent = event;
      end.segmentIndex = -1;
      end.frameIndex = -1;
      entries.push(end);
    }

    // Seed COMBO_RESOLVE for combo events (fires after engine triggers)
    if (event.columnId === NounType.COMBO && !event.comboTriggerColumnId) {
      const combo = allocQueueFrame();
      combo.frame = event.startFrame;
      combo.priority = PRIORITY.COMBO_RESOLVE;
      combo.type = QueueFrameType.COMBO_RESOLVE;
      combo.statusId = event.id;
      combo.columnId = event.columnId;
      combo.ownerEntityId = event.ownerEntityId;
      combo.sourceEntityId = event.ownerEntityId;
      combo.sourceSkillName = event.id;
      combo.maxStacks = 0;
      combo.durationFrames = 0;
      combo.operatorSlotId = event.ownerEntityId;
      combo.comboResolveEvent = event;
      entries.push(combo);
    }
  }

  return entries;
}
