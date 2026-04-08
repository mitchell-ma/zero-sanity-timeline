/**
 * Override applicator — materializes OverrideStore entries onto events.
 *
 * Inserted into the pipeline after attachDefaultSegments and before
 * processCombatSimulation. Applies segment duration overrides, frame offset
 * overrides, segment/frame deletions, additional segments/frames, and
 * property overrides.
 *
 * Crit pins and chance pins are NOT applied here — they are consumed directly
 * by damageTableBuilder and the interpreter at evaluation time.
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

    // Apply JSON-path numeric overrides (deep clone, walk, write)
    if (entry.jsonOverrides && Object.keys(entry.jsonOverrides).length > 0) {
      patched = applyJsonOverrides(patched, entry.jsonOverrides);
    }

    return patched;
  });
}

// ── JSON-path override application ───────────────────────────────────

/** Parse "a.b[0].c" → ["a","b",0,"c"]. */
function parseJsonPath(path: string): (string | number)[] {
  const tokens: (string | number)[] = [];
  const re = /([^.[\]]+)|\[(\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(path)) !== null) {
    if (m[1] !== undefined) tokens.push(m[1]);
    else if (m[2] !== undefined) tokens.push(Number(m[2]));
  }
  return tokens;
}

/**
 * Deep-clone `event` and write each `jsonOverrides` value at its parsed path.
 * Clones only along each path (path-copy), leaving unrelated subtrees shared.
 * Silently skips paths that don't resolve (e.g. stale overrides after a config change).
 */
export function applyJsonOverrides(
  event: TimelineEvent,
  jsonOverrides: Record<string, number>,
): TimelineEvent {
  let out: TimelineEvent = event;
  for (const [path, value] of Object.entries(jsonOverrides)) {
    const tokens = parseJsonPath(path);
    if (tokens.length === 0) continue;
    const next = writePath(out as unknown as Record<string | number, unknown>, tokens, value);
    if (next !== undefined) out = next as unknown as TimelineEvent;
  }
  return out;
}

/**
 * Return a new node where `tokens` from `root` has been set to `value`.
 * Returns undefined if the path doesn't resolve (missing intermediate node).
 */
function writePath(
  root: Record<string | number, unknown>,
  tokens: (string | number)[],
  value: number,
): Record<string | number, unknown> | undefined {
  if (tokens.length === 0) return undefined;
  const [head, ...rest] = tokens;
  const current = root[head];

  if (rest.length === 0) {
    // Leaf: only write if current is a number (matches the intended leaf type)
    if (typeof current !== 'number') return undefined;
    return cloneWith(root, head, value);
  }

  if (current == null || typeof current !== 'object') return undefined;
  const childWritten = writePath(current as Record<string | number, unknown>, rest, value);
  if (childWritten === undefined) return undefined;
  return cloneWith(root, head, childWritten);
}

/** Shallow-clone `root` (preserving array vs object) with one key replaced. */
function cloneWith(
  root: Record<string | number, unknown>,
  key: string | number,
  value: unknown,
): Record<string | number, unknown> {
  if (Array.isArray(root)) {
    const copy = root.slice() as unknown[];
    copy[key as number] = value;
    return copy as unknown as Record<string | number, unknown>;
  }
  return { ...root, [key]: value };
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
