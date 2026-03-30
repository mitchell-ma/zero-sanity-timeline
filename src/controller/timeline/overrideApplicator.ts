/**
 * Override applicator — materializes OverrideStore entries onto events.
 *
 * Inserted into the pipeline after attachDefaultSegments and before
 * processCombatSimulation. Applies segment duration overrides, frame offset
 * overrides, segment/frame deletions, additional segments/frames, and
 * property overrides.
 *
 * Crit pins and chance pins are NOT applied here — they are consumed directly
 * by damageTableBuilder and effectExecutor at evaluation time.
 */

import type { TimelineEvent, EventSegmentData, EventFrameMarker } from '../../consts/viewTypes';
import type { OverrideStore, EventOverride } from '../../consts/overrideTypes';
import { buildOverrideKey } from '../overrideController';

export function applyEventOverrides(
  events: readonly TimelineEvent[],
  overrides: OverrideStore,
): TimelineEvent[] {
  if (Object.keys(overrides).length === 0) return events as TimelineEvent[];

  return events.map((ev) => {
    const key = buildOverrideKey(ev);
    const entry = overrides[key];
    if (!entry) return ev;

    let patched: TimelineEvent = ev;

    // Apply structural segment/frame overrides
    if (entry.segments || entry.deletedFrames || entry.additionalSegments || entry.additionalFrames) {
      patched = applyStructuralOverrides(patched, entry);
    }

    // Apply property overrides (shallow merge)
    if (entry.propertyOverrides && Object.keys(entry.propertyOverrides).length > 0) {
      patched = { ...patched, ...entry.propertyOverrides };
    }

    return patched;
  });
}

function applyStructuralOverrides(ev: TimelineEvent, entry: EventOverride): TimelineEvent {
  let segments = ev.segments.map((seg, i) => {
    const segOverride = entry.segments?.[i];
    if (!segOverride) return seg;

    let patched: EventSegmentData = seg;

    // Duration override
    if (segOverride.duration !== undefined) {
      patched = { ...patched, properties: { ...patched.properties, duration: segOverride.duration } };
    }

    // Frame offset overrides
    if (segOverride.frames && patched.frames) {
      const frames = patched.frames.map((frame, fi) => {
        const frameOverride = segOverride.frames?.[fi];
        if (!frameOverride?.offsetFrame) return frame;
        return { ...frame, offsetFrame: frameOverride.offsetFrame } as EventFrameMarker;
      });
      patched = { ...patched, frames };
    }

    return patched;
  });

  // Delete marked segments (process in reverse to preserve indices)
  if (entry.segments) {
    const deletedIndices = new Set<number>();
    for (const [idxStr, seg] of Object.entries(entry.segments)) {
      if (seg.deleted) deletedIndices.add(Number(idxStr));
    }
    if (deletedIndices.size > 0) {
      segments = segments.filter((_, i) => !deletedIndices.has(i));
    }
  }

  // Delete marked frames
  if (entry.deletedFrames && entry.deletedFrames.length > 0) {
    const deletedBySegment = new Map<number, Set<number>>();
    for (const [segIdx, frameIdx] of entry.deletedFrames) {
      if (!deletedBySegment.has(segIdx)) deletedBySegment.set(segIdx, new Set());
      deletedBySegment.get(segIdx)!.add(frameIdx);
    }
    segments = segments.map((seg, i) => {
      const deletedFrameIndices = deletedBySegment.get(i);
      if (!deletedFrameIndices || !seg.frames) return seg;
      return { ...seg, frames: seg.frames.filter((_, fi) => !deletedFrameIndices.has(fi)) };
    });
  }

  // Insert additional segments
  if (entry.additionalSegments && entry.additionalSegments.length > 0) {
    // Sort by insertAfter descending to preserve indices during insertion
    const sorted = [...entry.additionalSegments].sort((a, b) => b.insertAfter - a.insertAfter);
    for (const additional of sorted) {
      const newSeg: EventSegmentData = {
        properties: {
          duration: additional.duration,
          ...(additional.name ? { name: additional.name } : {}),
        },
      };
      const insertIdx = additional.insertAfter + 1;
      segments = [...segments.slice(0, insertIdx), newSeg, ...segments.slice(insertIdx)];
    }
  }

  // Insert additional frames
  if (entry.additionalFrames && entry.additionalFrames.length > 0) {
    for (const additional of entry.additionalFrames) {
      if (additional.segmentIndex < segments.length) {
        const seg = segments[additional.segmentIndex];
        const newFrame: EventFrameMarker = {
          offsetFrame: additional.offsetFrame,
          ...(additional.name ? { name: additional.name } : {}),
        };
        const frames = [...(seg.frames ?? []), newFrame].sort((a, b) => a.offsetFrame - b.offsetFrame);
        segments = segments.map((s, i) => i === additional.segmentIndex ? { ...s, frames } : s);
      }
    }
  }

  return { ...ev, segments };
}
