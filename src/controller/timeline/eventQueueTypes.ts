/**
 * Shared types, constants, and configuration for the event queue pipeline.
 */
import { TimelineEvent } from '../../consts/viewTypes';
import type { DslTarget } from '../../dsl/semantics';
import { OPERATOR_COLUMNS, ENEMY_OWNER_ID } from '../../model/channels';

// ── Constants ──────────────────────────────────────────────────────────────

export const MAX_INFLICTION_STACKS = 4;

// ── Queue entry types ──────────────────────────────────────────────────────

/** Priority values — lower fires first at the same frame. */
export const PRIORITY = {
  FRAME_EFFECT: 5,
  INFLICTION_CREATE: 10,
  CONSUME: 15,
  COMBO_RESOLVE: 16,
  ENGINE_TRIGGER: 22,
} as const;

export interface QueueFrame {
  frame: number;
  priority: number;
  type: 'FRAME_EFFECT' | 'COMBO_RESOLVE' | 'INFLICTION_CREATE' | 'CONSUME' | 'ENGINE_TRIGGER';
  /** Event UID template (for infliction entries). */
  uid?: string;
  statusName: string;
  columnId: string;
  ownerId: string;
  sourceOwnerId: string;
  sourceSkillName: string;
  maxStacks: number;
  durationFrames: number;
  operatorSlotId: string;
  /** Pre-built event for FRAME_EFFECT entries. */
  derivedEvent?: TimelineEvent;
  /** Stacking interaction for FRAME_EFFECT enemy statuses. */
  stackingInteraction?: string;
  /** Max inflictions to consume (for CONSUME entries targeting inflictions). */
  maxConsume?: number;
  /** Consume an active reaction and optionally apply a status (from consumeReaction frame markers). */
  consumeReaction?: {
    reactionColumnId: string;
    applyStatus?: {
      target: DslTarget;
      status: string;
      stacks: number;
      durationFrames: number;
      susceptibility?: Partial<Record<string, readonly number[]>>;
      eventName?: string;
    };
    sourceColumnId: string;
  };
  /** Consume cryo inflictions and derive susceptibility (Last Rite talent). */
  cryoSusceptibility?: {
    perStack: number;
  };
  /** Engine trigger context for ENGINE_TRIGGER entries. */
  engineTrigger?: import('./statusTriggerCollector').EngineTriggerEntry;
  /** Deferred combo trigger resolution context. */
  comboResolve?: {
    comboEvent: import('../../consts/viewTypes').TimelineEvent;
  };
}

// ── Status consumption configuration ────────────────────────────────────────

/** Maps consumeStatus name → column + target owner for queue consumption. */
let _consumeStatusConfig: Record<string, { columnId: string; targetOwnerId?: string }> | null = null;
export function getConsumeStatusConfig(): Record<string, { columnId: string; targetOwnerId?: string }> {
  if (!_consumeStatusConfig) {
    _consumeStatusConfig = {
      ORIGINIUM_CRYSTAL: { columnId: OPERATOR_COLUMNS.ORIGINIUM_CRYSTAL, targetOwnerId: ENEMY_OWNER_ID },
    };
  }
  return _consumeStatusConfig;
}

/** Skill column IDs that consume team statuses (Link) when cast. */
export const CONSUMING_COLUMNS = new Set(['battle', 'combo', 'ultimate']);

/** Slot-level trigger wiring for the pipeline. */
export interface SlotTriggerWiring {
  slotId: string;
  operatorId: string;
}
