/**
 * Override controller — sole interface between the app and the OverrideStore.
 *
 * All event edits (timeline drag, info pane, context menu) route through this
 * controller. Pure functions: write operations return a new OverrideStore.
 */

import type { TimelineEvent } from '../consts/viewTypes';
import type {
  OverrideStore,
  EventOverride,
  SegmentOverride,
  FrameOverride,
  AdditionalSegment,
  AdditionalFrame,
} from '../consts/overrideTypes';

// ── Key helper ───────────────────────────────────────────────────────

const KEY_SEP = ':';

export function buildOverrideKey(event: TimelineEvent): string {
  return `${event.id}${KEY_SEP}${event.ownerId}${KEY_SEP}${event.columnId}${KEY_SEP}${event.startFrame}`;
}

// ── Internal helpers ─────────────────────────────────────────────────

function getOrCreateOverride(store: OverrideStore, key: string): EventOverride {
  return store[key] ?? {};
}

function getOrCreateSegment(override: EventOverride, segIdx: number): SegmentOverride {
  return override.segments?.[segIdx] ?? {};
}

function getOrCreateFrame(segment: SegmentOverride, frameIdx: number): FrameOverride {
  return segment.frames?.[frameIdx] ?? {};
}

/** Remove empty leaf objects to keep the store clean. */
function isFrameOverrideEmpty(fo: FrameOverride): boolean {
  return fo.isCritical === undefined && fo.offsetFrame === undefined;
}

function isSegmentOverrideEmpty(so: SegmentOverride): boolean {
  if (so.duration !== undefined || so.deleted) return false;
  if (so.frames) {
    for (const idx of Object.keys(so.frames)) {
      if (!isFrameOverrideEmpty(so.frames[Number(idx)])) return false;
    }
  }
  return true;
}

function isEventOverrideEmpty(eo: EventOverride): boolean {
  if (eo.segments) {
    for (const idx of Object.keys(eo.segments)) {
      if (!isSegmentOverrideEmpty(eo.segments[Number(idx)])) return false;
    }
  }
  if (eo.additionalSegments && eo.additionalSegments.length > 0) return false;
  if (eo.additionalFrames && eo.additionalFrames.length > 0) return false;
  if (eo.deletedFrames && eo.deletedFrames.length > 0) return false;
  if (eo.chanceOverrides && eo.chanceOverrides.length > 0) return false;
  if (eo.propertyOverrides && Object.keys(eo.propertyOverrides).length > 0) return false;
  return true;
}

/** Write an override entry, pruning if empty. */
function setEntry(store: OverrideStore, key: string, entry: EventOverride): OverrideStore {
  if (isEventOverrideEmpty(entry)) {
    if (!(key in store)) return store;
    const { [key]: _, ...rest } = store;
    return rest;
  }
  return { ...store, [key]: entry };
}

/** Write a segment override into an event override. */
function withSegment(override: EventOverride, segIdx: number, seg: SegmentOverride): EventOverride {
  const segments = { ...override.segments, [segIdx]: seg };
  // Prune empty segment entries
  if (isSegmentOverrideEmpty(seg)) {
    delete segments[segIdx];
  }
  return { ...override, segments: Object.keys(segments).length > 0 ? segments : undefined };
}

/** Write a frame override into a segment override. */
function withFrame(segment: SegmentOverride, frameIdx: number, frame: FrameOverride): SegmentOverride {
  const frames = { ...segment.frames, [frameIdx]: frame };
  // Prune empty frame entries
  if (isFrameOverrideEmpty(frame)) {
    delete frames[frameIdx];
  }
  return { ...segment, frames: Object.keys(frames).length > 0 ? frames : undefined };
}

// ── Read ─────────────────────────────────────────────────────────────

export function getOverride(store: OverrideStore, event: TimelineEvent): EventOverride | undefined {
  return store[buildOverrideKey(event)];
}

export function getSegmentOverride(store: OverrideStore, event: TimelineEvent, segIdx: number): SegmentOverride | undefined {
  return store[buildOverrideKey(event)]?.segments?.[segIdx];
}

export function getFrameOverride(store: OverrideStore, event: TimelineEvent, segIdx: number, frameIdx: number): FrameOverride | undefined {
  return store[buildOverrideKey(event)]?.segments?.[segIdx]?.frames?.[frameIdx];
}

export function getCritPin(store: OverrideStore, event: TimelineEvent, segIdx: number, frameIdx: number): boolean | undefined {
  return store[buildOverrideKey(event)]?.segments?.[segIdx]?.frames?.[frameIdx]?.isCritical;
}

export function getChancePin(store: OverrideStore, event: TimelineEvent, clausePath: string): boolean | undefined {
  const entry = store[buildOverrideKey(event)];
  return entry?.chanceOverrides?.find((c) => c.clausePath === clausePath)?.outcome;
}

// ── Write (all return new OverrideStore — immutable) ─────────────────

export function setSegmentDuration(store: OverrideStore, event: TimelineEvent, segIdx: number, duration: number): OverrideStore {
  const key = buildOverrideKey(event);
  const entry = getOrCreateOverride(store, key);
  const seg = { ...getOrCreateSegment(entry, segIdx), duration };
  return setEntry(store, key, withSegment(entry, segIdx, seg));
}

export function setFrameOffset(store: OverrideStore, event: TimelineEvent, segIdx: number, frameIdx: number, offset: number): OverrideStore {
  const key = buildOverrideKey(event);
  const entry = getOrCreateOverride(store, key);
  const seg = getOrCreateSegment(entry, segIdx);
  const frame = { ...getOrCreateFrame(seg, frameIdx), offsetFrame: offset };
  return setEntry(store, key, withSegment(entry, segIdx, withFrame(seg, frameIdx, frame)));
}

export function deleteSegment(store: OverrideStore, event: TimelineEvent, segIdx: number): OverrideStore {
  const key = buildOverrideKey(event);
  const entry = getOrCreateOverride(store, key);
  const seg = { ...getOrCreateSegment(entry, segIdx), deleted: true };
  return setEntry(store, key, withSegment(entry, segIdx, seg));
}

export function deleteFrame(store: OverrideStore, event: TimelineEvent, segIdx: number, frameIdx: number): OverrideStore {
  const key = buildOverrideKey(event);
  const entry = getOrCreateOverride(store, key);
  const deletedFrames: [number, number][] = [...(entry.deletedFrames ?? []), [segIdx, frameIdx]];
  return setEntry(store, key, { ...entry, deletedFrames });
}

export function addSegment(store: OverrideStore, event: TimelineEvent, segment: AdditionalSegment): OverrideStore {
  const key = buildOverrideKey(event);
  const entry = getOrCreateOverride(store, key);
  const additionalSegments = [...(entry.additionalSegments ?? []), segment];
  return setEntry(store, key, { ...entry, additionalSegments });
}

export function addFrame(store: OverrideStore, event: TimelineEvent, frame: AdditionalFrame): OverrideStore {
  const key = buildOverrideKey(event);
  const entry = getOrCreateOverride(store, key);
  const additionalFrames = [...(entry.additionalFrames ?? []), frame];
  return setEntry(store, key, { ...entry, additionalFrames });
}

export function setCritPin(store: OverrideStore, event: TimelineEvent, segIdx: number, frameIdx: number, value: boolean): OverrideStore {
  const key = buildOverrideKey(event);
  const entry = getOrCreateOverride(store, key);
  const seg = getOrCreateSegment(entry, segIdx);
  const frame = { ...getOrCreateFrame(seg, frameIdx), isCritical: value };
  return setEntry(store, key, withSegment(entry, segIdx, withFrame(seg, frameIdx, frame)));
}

export function clearCritPin(store: OverrideStore, event: TimelineEvent, segIdx: number, frameIdx: number): OverrideStore {
  const key = buildOverrideKey(event);
  const entry = getOrCreateOverride(store, key);
  const seg = getOrCreateSegment(entry, segIdx);
  const frame = { ...getOrCreateFrame(seg, frameIdx) };
  delete frame.isCritical;
  return setEntry(store, key, withSegment(entry, segIdx, withFrame(seg, frameIdx, frame)));
}

export function setChancePin(store: OverrideStore, event: TimelineEvent, clausePath: string, outcome: boolean): OverrideStore {
  const key = buildOverrideKey(event);
  const entry = getOrCreateOverride(store, key);
  const existing = entry.chanceOverrides ?? [];
  const idx = existing.findIndex((c) => c.clausePath === clausePath);
  const chanceOverrides = idx >= 0
    ? existing.map((c, i) => i === idx ? { ...c, outcome } : c)
    : [...existing, { clausePath, outcome }];
  return setEntry(store, key, { ...entry, chanceOverrides });
}

export function clearChancePin(store: OverrideStore, event: TimelineEvent, clausePath: string): OverrideStore {
  const key = buildOverrideKey(event);
  const entry = getOrCreateOverride(store, key);
  const chanceOverrides = (entry.chanceOverrides ?? []).filter((c) => c.clausePath !== clausePath);
  return setEntry(store, key, { ...entry, chanceOverrides: chanceOverrides.length > 0 ? chanceOverrides : undefined });
}

export function setPropertyOverride(store: OverrideStore, event: TimelineEvent, prop: string, value: unknown): OverrideStore {
  const key = buildOverrideKey(event);
  const entry = getOrCreateOverride(store, key);
  const propertyOverrides = { ...entry.propertyOverrides, [prop]: value };
  return setEntry(store, key, { ...entry, propertyOverrides });
}

// ── Undo deletions ──────────────────────────────────────────────────

/** Clear a segment deletion override (re-enables the segment from the template). */
export function undeleteSegment(store: OverrideStore, event: TimelineEvent, segIdx: number): OverrideStore {
  const key = buildOverrideKey(event);
  const entry = store[key];
  if (!entry?.segments?.[segIdx]?.deleted) return store;
  const seg = { ...entry.segments[segIdx] };
  delete seg.deleted;
  return setEntry(store, key, withSegment(entry, segIdx, seg));
}

/** Clear a frame deletion override (re-enables the frame from the template). */
export function undeleteFrame(store: OverrideStore, event: TimelineEvent, segIdx: number, frameIdx: number): OverrideStore {
  const key = buildOverrideKey(event);
  const entry = store[key];
  if (!entry?.deletedFrames) return store;
  const filtered = entry.deletedFrames.filter(([si, fi]) => !(si === segIdx && fi === frameIdx));
  if (filtered.length === entry.deletedFrames.length) return store;
  return setEntry(store, key, { ...entry, deletedFrames: filtered.length > 0 ? filtered : undefined });
}

// ── Scoped clears ───────────────────────────────────────────────────

/** Clear all segment-level overrides (durations, deletions) but keep frame overrides. */
export function clearSegmentOverrides(store: OverrideStore, event: TimelineEvent): OverrideStore {
  const key = buildOverrideKey(event);
  const entry = store[key];
  if (!entry?.segments) return store;
  const segments: Record<number, SegmentOverride> = {};
  for (const [idx, seg] of Object.entries(entry.segments)) {
    if (seg.frames) segments[Number(idx)] = { frames: seg.frames };
  }
  return setEntry(store, key, { ...entry, segments: Object.keys(segments).length > 0 ? segments : undefined });
}

/** Clear all frame-level overrides (offsets, deletions) but keep segment overrides. */
export function clearFrameOverrides(store: OverrideStore, event: TimelineEvent): OverrideStore {
  const key = buildOverrideKey(event);
  const entry = store[key];
  if (!entry) return store;
  let segments: Record<number, SegmentOverride> | undefined;
  if (entry.segments) {
    segments = {};
    for (const [idx, seg] of Object.entries(entry.segments)) {
      const { frames: _, ...rest } = seg;
      if (rest.duration !== undefined || rest.deleted) segments[Number(idx)] = rest;
    }
    if (Object.keys(segments).length === 0) segments = undefined;
  }
  return setEntry(store, key, { ...entry, segments, deletedFrames: undefined });
}

// ── Bulk operations ──────────────────────────────────────────────────

export function clearAllOverrides(store: OverrideStore, event: TimelineEvent): OverrideStore {
  const key = buildOverrideKey(event);
  if (!(key in store)) return store;
  const { [key]: _, ...rest } = store;
  return rest;
}

export function removeOverride(store: OverrideStore, event: TimelineEvent): OverrideStore {
  return clearAllOverrides(store, event);
}

/** Migrate an override entry when an event's identity changes (e.g. startFrame after drag). */
export function migrateOverrideKey(store: OverrideStore, oldEvent: TimelineEvent, newEvent: TimelineEvent): OverrideStore {
  const oldKey = buildOverrideKey(oldEvent);
  const newKey = buildOverrideKey(newEvent);
  if (oldKey === newKey) return store;
  const entry = store[oldKey];
  if (!entry) return store;
  const { [oldKey]: _, ...rest } = store;
  return { ...rest, [newKey]: entry };
}

export function clearAllCritPins(store: OverrideStore): OverrideStore {
  let result = store;
  for (const [key, entry] of Object.entries(store)) {
    if (!entry.segments) continue;
    let changed = false;
    const newSegments: Record<number, SegmentOverride> = {};
    for (const [segIdxStr, seg] of Object.entries(entry.segments)) {
      const segIdx = Number(segIdxStr);
      if (!seg.frames) { newSegments[segIdx] = seg; continue; }
      let segChanged = false;
      const newFrames: Record<number, FrameOverride> = {};
      for (const [frameIdxStr, frame] of Object.entries(seg.frames)) {
        const frameIdx = Number(frameIdxStr);
        if (frame.isCritical !== undefined) {
          segChanged = true;
          changed = true;
          const { isCritical: _, ...rest } = frame;
          if (!isFrameOverrideEmpty(rest)) newFrames[frameIdx] = rest;
        } else {
          newFrames[frameIdx] = frame;
        }
      }
      newSegments[segIdx] = segChanged
        ? { ...seg, frames: Object.keys(newFrames).length > 0 ? newFrames : undefined }
        : seg;
    }
    if (changed) {
      const newEntry = { ...entry, segments: Object.keys(newSegments).length > 0 ? newSegments : undefined };
      result = setEntry(result, key, newEntry);
    }
  }
  return result;
}

/** Persist unpinned crit results from SIMULATION mode into the override store.
 *  Only writes frames that don't already have a pin — avoids overwriting user-pinned values. */
export function persistUnpinnedCrits(
  store: OverrideStore,
  unpinnedCrits: Map<string, Map<number, Map<number, boolean>>>,
): OverrideStore {
  if (unpinnedCrits.size === 0) return store;
  let result = store;
  unpinnedCrits.forEach((segMap, key) => {
    let entry = getOrCreateOverride(result, key);
    segMap.forEach((frameMap, segIdx) => {
      let seg = getOrCreateSegment(entry, segIdx);
      frameMap.forEach((isCrit, frameIdx) => {
        if (seg.frames?.[frameIdx]?.isCritical !== undefined) return;
        const frame = { ...getOrCreateFrame(seg, frameIdx), isCritical: isCrit };
        seg = withFrame(seg, frameIdx, frame);
      });
      entry = withSegment(entry, segIdx, seg);
    });
    result = setEntry(result, key, entry);
  });
  return result;
}

export function pinSimulationResults(
  store: OverrideStore,
  events: readonly TimelineEvent[],
  critResults: Map<string, boolean[][]>,
): OverrideStore {
  let result = store;
  for (const ev of events) {
    const key = buildOverrideKey(ev);
    const crits = critResults.get(ev.uid);
    if (!crits) continue;
    let entry = getOrCreateOverride(result, key);
    for (let segIdx = 0; segIdx < crits.length; segIdx++) {
      const segCrits = crits[segIdx];
      let seg = getOrCreateSegment(entry, segIdx);
      for (let frameIdx = 0; frameIdx < segCrits.length; frameIdx++) {
        const frame = { ...getOrCreateFrame(seg, frameIdx), isCritical: segCrits[frameIdx] };
        seg = withFrame(seg, frameIdx, frame);
      }
      entry = withSegment(entry, segIdx, seg);
    }
    result = setEntry(result, key, entry);
  }
  return result;
}
