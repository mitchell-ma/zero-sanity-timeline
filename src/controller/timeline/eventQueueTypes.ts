/**
 * Shared types, constants, and configuration for the event queue pipeline.
 */
import type { TimelineEvent, EventFrameMarker } from '../../consts/viewTypes';
import { QueueFrameType } from '../../consts/enums';
export { QueueFrameType };

// ── Constants ──────────────────────────────────────────────────────────────

export const MAX_INFLICTION_STACKS = 4;

// ── Queue entry types ──────────────────────────────────────────────────────

/** Priority values — lower fires first at the same frame. */
export const PRIORITY = {
  /** Unified frame processing — all frame marker effects in config order. */
  [QueueFrameType.PROCESS_FRAME]: 5,
  /** Engine triggers seeded reactively by PROCESS_FRAME or lifecycle clauses. */
  [QueueFrameType.ENGINE_TRIGGER]: 22,
  /** Combo trigger resolution — fires after engine triggers so absorption resolves first. */
  [QueueFrameType.COMBO_RESOLVE]: 25,
} as const;

export interface QueueFrame {
  frame: number;
  priority: number;
  type: QueueFrameType;
  /** Event UID template (for infliction entries). */
  uid?: string;
  statusId: string;
  columnId: string;
  ownerId: string;
  sourceOwnerId: string;
  sourceSkillName: string;
  maxStacks: number;
  durationFrames: number;
  operatorSlotId: string;

  // ── PROCESS_FRAME fields ──────────────────────────────────────────────
  /** The frame marker being processed. */
  frameMarker?: EventFrameMarker;
  /** The parent skill event that owns this frame. */
  sourceEvent?: TimelineEvent;
  /** Segment index within the parent event. */
  segmentIndex?: number;
  /** Frame index within the segment. */
  frameIndex?: number;

  // ── ENGINE_TRIGGER fields ─────────────────────────────────────────────
  /** Engine trigger context for ENGINE_TRIGGER entries. */
  engineTrigger?: import('./statusTriggerCollector').EngineTriggerEntry;
  /** Cascade depth for ENGINE_TRIGGER chains (0 = top-level, capped at MAX_CASCADE_DEPTH). */
  cascadeDepth?: number;

  // ── COMBO_RESOLVE fields ──────────────────────────────────────────────
  /** The combo event to resolve trigger column for. */
  comboResolveEvent?: TimelineEvent;
}

/** Slot-level trigger wiring for the pipeline. */
export interface SlotTriggerWiring {
  slotId: string;
  operatorId: string;
}
