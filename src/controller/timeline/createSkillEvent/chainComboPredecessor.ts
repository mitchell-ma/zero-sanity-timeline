/**
 * Combo chaining: when a new combo event is registered, truncate overlapping
 * combo animations in both directions (older combos get clipped if the new
 * one starts inside their animation; the new combo gets clipped if an older
 * combo starts inside its animation). Pushes ev into the comboStops tracker.
 *
 * Pure w.r.t. its state argument: all mutation happens on the passed-in
 * arrays/objects, no hidden globals.
 */
import { TimelineEvent, getAnimationDuration } from '../../../consts/viewTypes';
import { NounType } from '../../../dsl/semantics';
import { TimeStopRegion } from '../processTimeStop';
import { setAnimationSegmentDuration } from './segmentUtils';

export type ComboStopEntry = { uid: string; startFrame: number; animDur: number };

export interface ChainComboPredecessorState {
  comboStops: ComboStopEntry[];
  registeredEvents: TimelineEvent[];
  stops: TimeStopRegion[];
}

export function chainComboPredecessor(
  ev: TimelineEvent,
  state: ChainComboPredecessorState,
): TimelineEvent {
  if (ev.columnId !== NounType.COMBO || getAnimationDuration(ev) <= 0) return ev;

  let animDur = getAnimationDuration(ev);
  const evEnd = ev.startFrame + animDur;
  let changed = false;

  // Truncate older combos whose animation ev starts inside of
  for (const cs of state.comboStops) {
    const csEnd = cs.startFrame + cs.animDur;
    if (ev.startFrame > cs.startFrame && ev.startFrame < csEnd) {
      const truncated = ev.startFrame - cs.startFrame;
      cs.animDur = truncated;
      const regIdx = state.registeredEvents.findIndex(e => e.uid === cs.uid);
      if (regIdx >= 0) {
        const reg = state.registeredEvents[regIdx];
        state.registeredEvents[regIdx] = {
          ...reg,
          segments: setAnimationSegmentDuration(reg.segments, truncated),
        };
      }
      const stop = state.stops.find(s => s.eventUid === cs.uid);
      if (stop) stop.durationFrames = truncated;
    }
  }

  // Truncate ev if any older combo starts inside ev's animation
  for (const cs of state.comboStops) {
    if (cs.startFrame > ev.startFrame && cs.startFrame < evEnd) {
      const truncated = cs.startFrame - ev.startFrame;
      animDur = truncated;
      changed = true;
      break;
    }
  }

  state.comboStops.push({ uid: ev.uid, startFrame: ev.startFrame, animDur });
  state.comboStops.sort((a, b) => a.startFrame - b.startFrame);

  if (changed) {
    ev.segments = setAnimationSegmentDuration(ev.segments, animDur);
  }
  return ev;
}
