/**
 * Shared types, constants, and configuration for the event queue pipeline.
 */
import { TimelineEvent } from '../../consts/viewTypes';
import { OPERATOR_COLUMNS, ENEMY_OWNER_ID } from '../../model/channels';
import { EXCHANGE_STATUS_COLUMN } from './processInfliction';

// ── Constants ──────────────────────────────────────────────────────────────

export const MAX_INFLICTION_STACKS = 4;

// ── Queue entry types ──────────────────────────────────────────────────────

/** Priority values — lower fires first at the same frame. */
export const PRIORITY = {
  FRAME_EFFECT: 5,
  INFLICTION_CREATE: 10,
  CONSUME: 15,
  COMBO_RESOLVE: 16,
  ABSORPTION_CHECK: 18,
  EXCHANGE_CREATE: 20,
  ENGINE_TRIGGER: 22,
} as const;

export interface QueueFrame {
  frame: number;
  priority: number;
  type: 'FRAME_EFFECT' | 'COMBO_RESOLVE' | 'INFLICTION_CREATE' | 'ABSORPTION_CHECK' | 'EXCHANGE_CREATE' | 'CONSUME' | 'ENGINE_TRIGGER';
  /** Event ID template (for infliction entries). */
  id?: string;
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
  /** Direct absorption data from absorbArtsInfliction frame marker. */
  absorptionMarker?: {
    inflictionColumnId: string;
    exchangeStatus: string;
    exchangeColumnId: string;
    maxAbsorb: number;
    exchangeMaxStacks: number;
    eventId: string;
    segmentIndex: number;
    frameIndex: number;
  };
  /** Max inflictions to consume (for CONSUME entries targeting inflictions). */
  maxConsume?: number;
  /** Consume an active reaction and optionally apply a status (from consumeReaction frame markers). */
  consumeReaction?: {
    reactionColumnId: string;
    applyStatus?: {
      target: string;
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
  engineTrigger?: import('./statusDerivationEngine').EngineTriggerEntry;
  /** Deferred combo trigger resolution context. */
  comboResolve?: {
    comboEvent: import('../../consts/viewTypes').TimelineEvent;
  };
}

// ── Status consumption configuration ────────────────────────────────────────

/** Maps consumeStatus name → column + target owner for queue consumption. */
export const CONSUME_STATUS_CONFIG: Record<string, { columnId: string; targetOwnerId?: string }> = {
  MELTING_FLAME: { columnId: EXCHANGE_STATUS_COLUMN.MELTING_FLAME },
  THUNDERLANCE: { columnId: EXCHANGE_STATUS_COLUMN.THUNDERLANCE },
  ORIGINIUM_CRYSTAL: { columnId: OPERATOR_COLUMNS.ORIGINIUM_CRYSTAL, targetOwnerId: ENEMY_OWNER_ID },
};

/** Skill column IDs that consume team statuses (Link) when cast. */
export const CONSUMING_COLUMNS = new Set(['battle', 'combo', 'ultimate']);

/** Set of status def names handled by the queue (not the engine). */
export const EXCHANGE_STATUS_NAMES = new Set(Object.keys(EXCHANGE_STATUS_COLUMN));
