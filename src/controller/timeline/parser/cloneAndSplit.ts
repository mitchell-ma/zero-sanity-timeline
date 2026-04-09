/**
 * Clone + classify raw events into input events (strict-mode skills) and
 * derived events (freeform inflictions, reactions, statuses).
 *
 * moved out of `inputEventController.ts` and into the parser
 * module so all event ingress logic lives under `parser/`. Input events go
 * into `DEC.registerEvents`; derived events are seeded into the queue and
 * processed via `create*` methods.
 *
 * Cloning semantics: each raw event is shallow-copied via the object pool
 * and its `segments` array is deep-cloned through `cloneSegments()` below
 * so pipeline mutations (time-stop duration extension, frame marker
 * derived offsets) don't leak back to React raw state.
 */
import { TimelineEvent, EventSegmentData } from '../../../consts/viewTypes';
import {
  OPERATOR_COLUMNS,
  SKILL_COLUMN_ORDER,
  ENEMY_ACTION_COLUMN_ID,
} from '../../../model/channels';
import { allocInputEvent, allocDerivedEvent } from '../objectPool';

const SKILL_COLUMN_SET: ReadonlySet<string> = new Set(SKILL_COLUMN_ORDER);

// ── Segment clone cache ─────────────────────────────────────────────────────
// Keyed by event UID. Caches individual segment + properties objects for reuse.
// Each tick creates a NEW array (so React sees a new reference after pipeline
// mutation), but reuses the segment/properties objects inside — resetting them
// to source values via Object.assign. This avoids ~600 spread allocations per
// tick while keeping React's reference-based change detection working.
let _segObjCache = new Map<string, { ref: readonly EventSegmentData[]; objs: EventSegmentData[] }>();
let _segObjCacheNext = new Map<string, { ref: readonly EventSegmentData[]; objs: EventSegmentData[] }>();

/** Clear segment clone cache. Call from resetPools(). */
export function resetSegmentCloneCache() {
  const tmp = _segObjCache;
  _segObjCache = _segObjCacheNext;
  _segObjCacheNext = tmp;
  _segObjCacheNext.clear();
}

function cloneSegments(uid: string, segments: readonly EventSegmentData[]): EventSegmentData[] {
  const cached = _segObjCache.get(uid);
  if (cached && cached.ref === segments && cached.objs.length === segments.length) {
    // Same source — reuse both segment objects AND array. Reset to source values
    // so pipeline mutations from the previous tick don't carry over.
    // The reconciler detects changes via per-segment fingerprints (duration + absoluteStartFrame),
    // not via array/object reference equality.
    const objs = cached.objs;
    for (let i = 0; i < segments.length; i++) {
      const cachedProps = objs[i].properties;
      Object.assign(objs[i], segments[i]);
      objs[i].properties = cachedProps;
      Object.assign(cachedProps, segments[i].properties);
    }
    _segObjCacheNext.set(uid, { ref: segments, objs });
    return objs;
  }
  // New or changed — allocate fresh objects
  const objs = segments.map(s => ({ ...s, properties: { ...s.properties } }));
  _segObjCacheNext.set(uid, { ref: segments, objs });
  return objs;
}

export function cloneAndSplitEvents(rawEvents: TimelineEvent[]): { inputEvents: TimelineEvent[]; derivedEvents: TimelineEvent[] } {
  const inputEvents: TimelineEvent[] = [];
  const derivedEvents: TimelineEvent[] = [];
  for (const ev of rawEvents) {
    // Clone to prevent engine mutations (eventStatus, stacks, segments
    // reassignment) from leaking back to raw state. Uses object pool when
    // pooling is enabled to avoid per-tick allocation churn.
    const isDerived = !SKILL_COLUMN_SET.has(ev.columnId)
      && ev.columnId !== OPERATOR_COLUMNS.INPUT
      && ev.columnId !== OPERATOR_COLUMNS.CONTROLLED
      && ev.columnId !== ENEMY_ACTION_COLUMN_ID;
    const copy = isDerived ? allocDerivedEvent() : allocInputEvent();
    Object.assign(copy, ev);
    // Deep-clone segment properties so pipeline mutations (time-stop duration
    // extension) don't leak back to raw state and cause double-extension.
    copy.segments = cloneSegments(ev.uid, ev.segments);
    if (isDerived) {
      derivedEvents.push(copy);
    } else {
      inputEvents.push(copy);
    }
  }
  inputEvents.sort((a, b) => a.startFrame - b.startFrame);
  return { inputEvents, derivedEvents };
}
