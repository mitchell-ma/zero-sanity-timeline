/**
 * Freeform event helpers for unit tests.
 *
 * Production user-placements flow through `attachDefaultSegments` (in the app
 * layer's `validEvents` memo) which copies an APPLY-clause frame from the
 * column's `defaultEvent` onto the raw event before it enters the engine.
 * Unit tests that call `processCombatSimulation` directly (without going
 * through `useApp`) bypass that step — so they must attach the same frame
 * manually to exercise the real codepath.
 *
 * Use `withApplyFrame` to wrap a bare event's first segment with the
 * APPLY-clause frame that `buildStatusMicroColumn` would attach.
 */
import type { TimelineEvent, EventSegmentData } from '../../consts/viewTypes';
import { NounType, VerbType, type Effect } from '../../dsl/semantics';

export interface ApplyFrameOptions {
  statusId: string;
  to?: string;
  isForced?: boolean;
  objectId?: string;
  objectQualifier?: string;
}

/**
 * Return an APPLY-clause frame at offset 0 that doApply routes through its
 * generic qualified-status path (matching `buildStatusMicroColumn`'s
 * `syntheticSegments` output for freeform placements).
 */
export function applyFrame(opts: ApplyFrameOptions) {
  const effect: Partial<Effect> = {
    verb: VerbType.APPLY,
    object: NounType.STATUS,
    objectId: (opts.objectId ?? opts.statusId) as Effect['objectId'],
    ...(opts.objectQualifier !== undefined ? { objectQualifier: opts.objectQualifier as Effect['objectQualifier'] } : {}),
    to: (opts.to ?? NounType.ENEMY) as Effect['to'],
    ...(opts.isForced ? { with: { isForced: { verb: VerbType.IS, value: 1 } } } : {}),
  };
  return {
    offsetFrame: 0,
    clause: [{
      conditions: [],
      effects: [effect as Effect],
    }],
  };
}

/**
 * Wrap a TimelineEvent's first segment with an APPLY-clause frame at offset 0
 * (if the segment doesn't already have a frame). Idempotent: events that
 * already carry frames are returned unchanged.
 */
export function withApplyFrame(
  event: TimelineEvent,
  opts: ApplyFrameOptions,
): TimelineEvent {
  const seg0 = event.segments[0];
  if (!seg0) return event;
  if (seg0.frames && seg0.frames.length > 0) return event;
  const patched: EventSegmentData = { ...seg0, frames: [applyFrame(opts)] };
  return { ...event, segments: [patched, ...event.segments.slice(1)] };
}
