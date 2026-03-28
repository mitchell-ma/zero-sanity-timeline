/**
 * EventColumn — interface for column-specific stacking and consumption behavior.
 *
 * Each timeline column type (infliction, reaction, physical status, config-driven
 * status) implements this interface with its own domain logic. Columns are stateless
 * strategy objects — all event storage goes through the ColumnHost.
 */

import type { TimelineEvent } from '../../../consts/viewTypes';

// ── Source metadata ──────────────────────────────────────────────────────────

/** Source metadata for event mutations (who caused the event). */
export interface EventSource {
  ownerId: string;
  skillName: string;
}

// ── Options ──────────────────────────────────────────────────────────────────

export interface AddOptions {
  uid?: string;
  stacks?: number;
  forcedReaction?: boolean;
  statusId?: string;
  stackingMode?: string;
  maxStacks?: number;
  event?: Partial<TimelineEvent>;
}

export interface ConsumeOptions {
  count?: number;
  restack?: boolean;
}

// ── ColumnHost ───────────────────────────────────────────────────────────────

/**
 * Callback interface that EventColumn implementations use to interact with the
 * controller. Columns are stateless — all state queries and mutations go here.
 */
export interface ColumnHost {
  /** Get all active (non-consumed) events for a column+owner at a frame. */
  activeEventsIn(columnId: string, ownerId: string, frame: number): TimelineEvent[];
  /** Count active events for a column+owner at a frame. */
  activeCount(columnId: string, ownerId: string, frame: number): number;
  /** Extend a raw game-time duration by active time-stop regions. */
  extendDuration(startFrame: number, rawDuration: number, eventUid?: string): number;
  /** Register a raw (pre-extension) duration for later re-extension. */
  trackRawDuration(uid: string, rawDuration: number): void;
  /** Insert an event: extend duration, push to stacks + output, register stop if applicable. */
  pushEvent(event: TimelineEvent, rawDuration: number): void;
  /** Insert an already-extended event directly (no duration extension). */
  pushEventDirect(event: TimelineEvent): void;
  /** Push an event to output only (e.g. consumed copies for freeform state tracking). */
  pushToOutput(event: TimelineEvent): void;
  /** Delegate creation to another column (cross-column side effects). */
  applyToColumn(columnId: string, ownerId: string, frame: number, durationFrames: number,
    source: EventSource, options?: AddOptions): boolean;
  /** Delegate consumption to another column. */
  consumeFromColumn(columnId: string, ownerId: string, frame: number,
    source: EventSource, options?: ConsumeOptions): number;
  /** Get foreign time-stop regions for reaction segment building. */
  foreignStopsFor(event: TimelineEvent): readonly import('../processTimeStop').TimeStopRegion[];
  /** Get all time-stop regions discovered so far. */
  getStops(): readonly import('../processTimeStop').TimeStopRegion[];
}

// ── EventColumn ──────────────────────────────────────────────────────────────

export interface EventColumn {
  /** Column ID this instance manages. */
  readonly columnId: string;

  /**
   * Add an event to this column. Handles stacking, eviction, duration extension,
   * and any cross-column side effects (e.g. infliction triggering a reaction).
   * Returns true if the event was accepted (false = rejected, e.g. NONE at capacity).
   */
  add(ownerId: string, frame: number, durationFrames: number,
    source: EventSource, options?: AddOptions): boolean;

  /**
   * Consume active events in this column. Semantics depend on column type
   * (FIFO for inflictions, clamp-all for reactions/statuses).
   * Returns the number of events consumed.
   */
  consume(ownerId: string, frame: number, source: EventSource,
    options?: ConsumeOptions): number;

  /** Check if an add() would succeed at this frame. */
  canAdd(ownerId: string, frame: number): boolean;

  /** Check if a consume() would find any active events. */
  canConsume(ownerId: string, frame: number): boolean;
}
