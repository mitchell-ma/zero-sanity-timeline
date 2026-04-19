/**
 * Shared types, constants, and configuration for the event queue pipeline.
 */
import type { TimelineEvent, EventFrameMarker } from '../../consts/viewTypes';
import type { ValueNode } from '../../dsl/semantics';
import type { ClauseEvaluationType } from '../../dsl/semantics';
import type { Predicate, TriggerEffect } from './triggerMatch';
import type { LifecycleClauseGroup } from './triggerIndex';
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
  eventCategoryType?: string;
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
  /** CC kinds this status imposes on its target (see CrowdControlType). */
  crowdControls?: string[];
}

export interface StatusEventDef {
  properties: StatusProperties;
  metadata?: { originId?: string; isEnabled?: boolean };
  onTriggerClause?: TriggerClause[];
  onEntryClause?: EffectClause[];
  onExitClause?: EffectClause[];
  /** Multi-phase segments (e.g. Antal Focus: 20s Focus + 40s Empowered Focus). */
  segments?: StatusSegmentDef[];
  /** Evaluation mode for onTriggerClause entries. FIRST_MATCH fires only the
   *  first matching clause (e.g. talents with a base clause + potential-gated
   *  refinement). Default (omitted) fires every matching clause. */
  onTriggerClauseType?: ClauseEvaluationType;
  /** Evaluation mode for onEntryClause entries. */
  onEntryClauseType?: ClauseEvaluationType;
  /** Evaluation mode for onExitClause entries. */
  onExitClauseType?: ClauseEvaluationType;
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
  /** All conditions from the trigger clause, evaluated at trigger time. */
  conditions: Predicate[];
  triggerEffects?: TriggerEffect[];
  /** Lifecycle clause groups — when present, this is a lifecycle trigger (not onTriggerClause). */
  clauseGroups?: LifecycleClauseGroup[];
  /** Clause evaluation mode: "FIRST_MATCH" stops after the first group whose HAVE conditions match. Default: evaluate all matching groups. */
  clauseType?: string;
}

export interface EngineTriggerEntry {
  frame: number;
  sourceEntityId: string;
  sourceSkillId: string;
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

export interface QueueFrame {
  frame: number;
  type: QueueFrameType;
  /** Lifecycle hook type for synthetic start/end entries. Undefined = normal frame marker. */
  hookType?: FrameHookType;
  /** Event UID template (for infliction entries). */
  uid?: string;
  statusId: string;
  columnId: string;
  ownerEntityId: string;
  sourceEntityId: string;
  sourceSkillId: string;
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
  /** True when this PROCESS_FRAME carries a segment's `clause` (segment-passive
   *  effects) rather than a real damage-frame marker. doApply already pushes a
   *  long-lived `_statReversals` entry at parentSegmentEndFrame for these,
   *  so handleProcessFrame must NOT also do frame-scoped APPLY STAT reversal
   *  (which would double-reverse and net negative across the segment lifetime)
   *  and must NOT fire reactive triggers (those belong to author-frame hooks). */
  isSegmentClauseDispatch?: boolean;

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
  /** Evaluation mode for the deferred exit clause (FIRST_MATCH / ALL). */
  statusExitClauseType?: ClauseEvaluationType;
  /** Owner ID of the parent status (for resolveEntityId context). */
  statusExitEntityId?: string;
}

/** Slot-level trigger wiring for the pipeline. */
export interface SlotTriggerWiring {
  slotId: string;
  operatorId: string;
}
