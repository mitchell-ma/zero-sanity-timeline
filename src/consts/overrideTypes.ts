// ── Per-frame overrides ──────────────────────────────────────────────

export interface FrameOverride {
  /** Pin crit outcome: true = force crit, false = force no-crit, undefined = use mode default. */
  isCritical?: boolean;
  /** Override frame position within segment. */
  offsetFrame?: number;
}

// ── Per-segment overrides ────────────────────────────────────────────

export interface SegmentOverride {
  /** Override segment duration (frames). */
  duration?: number;
  /** Per-frame overrides, keyed by frame index. */
  frames?: Record<number, FrameOverride>;
  /** Mark segment for deletion. */
  deleted?: boolean;
}

// ── Additional user-created content ──────────────────────────────────

export interface AdditionalSegment {
  /** Insert position (index in the segment array to insert after; -1 = prepend). */
  insertAfter: number;
  duration: number;
  name?: string;
}

export interface AdditionalFrame {
  segmentIndex: number;
  offsetFrame: number;
  name?: string;
}

// ── Chance verb pin ──────────────────────────────────────────────────

export interface ChanceOverride {
  /** DSL clause path identifying the CHANCE node (e.g. "predicates[0].effects[1]"). */
  clausePath: string;
  /** Pinned outcome: true = always fire, false = never fire. */
  outcome: boolean;
}

// ── Per-event override bundle ────────────────────────────────────────

export interface EventOverride {
  /** Per-segment overrides, keyed by segment index. */
  segments?: Record<number, SegmentOverride>;
  /** Additional user-added segments. */
  additionalSegments?: AdditionalSegment[];
  /** Additional user-added frames. */
  additionalFrames?: AdditionalFrame[];
  /** Deleted frame identifiers [segmentIndex, frameIndex]. */
  deletedFrames?: [number, number][];
  /** Pinned CHANCE verb outcomes. */
  chanceOverrides?: ChanceOverride[];
  /** Catch-all property overrides (shallow merge onto TimelineEvent). */
  propertyOverrides?: Record<string, unknown>;
  /**
   * JSON-path numeric overrides applied after structural overrides.
   * Key: dot/bracket path rooted at the event (e.g.
   *   "segments[0].frames[1].clause[0].effects[0].with.multiplier.value[2]").
   * Value: numeric leaf to write at that path on a deep clone of the event.
   * Applied at apply-time by overrideApplicator. Delta-only; empty map pruned.
   */
  jsonOverrides?: Record<string, number>;
}

// ── The store ────────────────────────────────────────────────────────
// Keyed by composite key: `${id}:${ownerEntityId}:${columnId}:${startFrame}`

export type OverrideStore = Record<string, EventOverride>;
