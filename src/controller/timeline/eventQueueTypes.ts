/**
 * Shared types, constants, and configuration for the event queue pipeline.
 */
import type { TimelineEvent, EventFrameMarker } from '../../consts/viewTypes';
import type { ValueNode } from '../../dsl/semantics';
import type { ClauseEvaluationType } from '../../dsl/semantics';
import type { Predicate, TriggerEffect } from './triggerMatch';
import type { LoadoutProperties } from '../../view/InformationPane';
import { QueueFrameType, FrameHookType } from '../../consts/enums';
export { QueueFrameType, FrameHookType };

// ── Status event definition types ─────────────────────────────────────────

interface StatusFrameDef {
  metadata?: { eventComponentType?: string };
  properties?: { offset?: { value: number; unit: string } };
  clause?: EffectClause[];
}

interface StatusSegmentDef {
  metadata?: { eventComponentType?: string };
  properties?: { name?: string; duration?: { value: ValueNode; unit: string }; segmentTypes?: string[] };
  clause?: EffectClause[];
  frames?: StatusFrameDef[];
  onTriggerClause?: TriggerClause[];
  onEntryClause?: EffectClause[];
  onExitClause?: EffectClause[];
}

/** Properties block nested inside a status event definition. */
interface StatusProperties {
  id: string;
  name?: string;
  type?: string;
  eventIdType?: string;
  element?: string;
  target?: string;
  to?: string;
  targetDeterminer?: string;
  isForced?: boolean;
  enhancementTypes?: string[];
  stacks: {
    interactionType: string;
    limit: ValueNode;
  };
  duration?: { value: ValueNode; unit: string };
  susceptibility?: Record<string, number[]>;
  cooldownSeconds?: number;
}

export interface StatusEventDef {
  properties: StatusProperties;
  metadata?: { originId?: string; isEnabled?: boolean };
  onTriggerClause?: TriggerClause[];
  onEntryClause?: EffectClause[];
  clause?: EffectClause[];
  onExitClause?: EffectClause[];
  /** Multi-phase segments (e.g. Antal Focus: 20s Focus + 40s Empowered Focus). */
  segments?: StatusSegmentDef[];
  /** Clause evaluation mode: FIRST_MATCH evaluates clauses in order, fires first match only. */
  clauseType?: ClauseEvaluationType;
}

interface TriggerClause {
  conditions: Predicate[];
  effects?: TriggerEffect[];
}

interface EffectClause {
  conditions: Predicate[];
  effects: Effect[];
}

interface Effect {
  verb: string;
  object: string;
  objectId?: string;
  to?: string;
  toDeterminer?: string;
}

// ── Derive context ────────────────────────────────────────────────────────

export interface DeriveContext {
  events: readonly TimelineEvent[];
  operatorId: string;
  operatorSlotId: string;
  potential: number;
  /** Maps operator ID (lowercase) → slot ID for cross-operator target resolution. */
  operatorSlotMap: Record<string, string>;
  /** Loadout properties for the operator's slot (talent levels, etc.). */
  loadoutProperties?: LoadoutProperties;
}

// ── Engine trigger types ──────────────────────────────────────────────────

export interface EngineTriggerContext {
  def: StatusEventDef;
  operatorId: string;
  operatorSlotId: string;
  potential: number;
  operatorSlotMap: Record<string, string>;
  loadoutProperties?: LoadoutProperties;
  haveConditions: Predicate[];
  triggerEffects?: TriggerEffect[];
}

export interface EngineTriggerEntry {
  frame: number;
  sourceOwnerId: string;
  sourceSkillName: string;
  /** Slot ID of the operator that triggered this entry (for TRIGGER determiner resolution). */
  triggerSlotId?: string;
  /** Column ID of the event that matched the trigger (e.g. CRYO_INFLICTION). */
  triggerObjectId?: string;
  ctx: EngineTriggerContext;
  isEquip: boolean;
  /** Stack count before this trigger was created (for BECOME incremental evaluation). */
  previousStackCount?: number;
  /** Number of stacks consumed by the CONSUME effect that triggered this entry. */
  consumedStacks?: number;
}

// ── Constants ──────────────────────────────────────────────────────────────

export const MAX_INFLICTION_STACKS = 4;

// ── Queue entry types ──────────────────────────────────────────────────────

/**
 * Priority values — lower fires first at the same frame.
 *
 * Engine triggers (formerly `QueueFrameType.ENGINE_TRIGGER`) now ride
 * `PROCESS_FRAME` with `hookType: ON_TRIGGER` and use `ENGINE_TRIGGER`
 * priority value here. The constant is keyed by string so both queue
 * types and hook types can register a priority side-by-side.
 */
export const PRIORITY: Record<string, number> = {
  /** Unified frame processing — all frame marker effects in config order. */
  [QueueFrameType.PROCESS_FRAME]: 5,
  /** Engine triggers seeded reactively by PROCESS_FRAME or lifecycle clauses. */
  ENGINE_TRIGGER: 22,
  /** Combo trigger resolution — fires after engine triggers so absorption resolves first. */
  [QueueFrameType.COMBO_RESOLVE]: 25,
  /** Status exit clause — fires after all frame processing at the exit frame. */
  [QueueFrameType.STATUS_EXIT]: 30,
};

export interface QueueFrame {
  frame: number;
  priority: number;
  type: QueueFrameType;
  /** Lifecycle hook type for synthetic start/end entries. Undefined = normal frame marker. */
  hookType?: FrameHookType;
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
  engineTrigger?: EngineTriggerEntry;
  /** Cascade depth for ENGINE_TRIGGER chains (0 = top-level, capped at MAX_CASCADE_DEPTH). */
  cascadeDepth?: number;
  /** Source damage frame key for intra-frame ordering propagation through trigger chains. */
  sourceFrameKey?: string;

  // ── COMBO_RESOLVE fields ──────────────────────────────────────────────
  /** The combo event to resolve trigger column for. */
  comboResolveEvent?: TimelineEvent;

  // ── STATUS_EXIT fields ───────────────────────────────────────────────
  /** onExitClause effects to execute at the status end frame. */
  statusExitClauses?: { conditions: unknown[]; effects?: unknown[] }[];
  /** Owner ID of the parent status (for resolveOwnerId context). */
  statusExitOwnerId?: string;
}

/** Slot-level trigger wiring for the pipeline. */
export interface SlotTriggerWiring {
  slotId: string;
  operatorId: string;
}
