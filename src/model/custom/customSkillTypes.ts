/**
 * Type definitions for user-created custom skills.
 * Skills are standalone entities that can be assigned to operators.
 */
import { ElementType, TimeInteractionType, TimeDependency, SegmentType, EventFrameType, CombatResourceType } from '../../consts/enums';
import type { Interaction, Clause, ClauseEvaluationType } from '../../dsl/semantics';
import type { StatType } from '../enums';

/** A user-created custom skill. */
export interface CustomSkill {
  id: string;
  name: string;
  /** The operator this skill was originally created from. */
  originId?: string;
  /** Operator IDs associated with this skill. Kept in sync with the link table. */
  associationIds?: string[];
  combatSkillType: string;
  element?: ElementType;
  durationSeconds: number;
  cooldownSeconds?: number;
  animationSeconds?: number;
  timeInteractionType?: TimeInteractionType;
  resourceInteractions?: CustomSkillResourceInteraction[];
  activationConditions?: Interaction[][];
  segments?: CustomSkillSegmentDef[];
  multipliers?: { label: string; values: number[] }[];
  description?: string;
  // Top-level clause buckets — mirror the skill-JSON root keys.
  clauseType?: ClauseEvaluationType;
  clause?: Clause;
  onTriggerClause?: Clause;
  onEntryClause?: Clause;
  onExitClause?: Clause;
}

export interface CustomSkillResourceInteraction {
  resourceType: CombatResourceType;
  verb: string;
  value: number;
  target?: string;
}

/** Mirrors the skill-JSON `segments[i]` shape: properties bucket + four clause buckets + frames. */
export interface CustomSkillSegmentDef {
  // properties
  name?: string;
  durationSeconds: number;
  element?: ElementType;
  segmentTypes?: SegmentType[];
  timeDependency?: TimeDependency;
  timeInteractionType?: TimeInteractionType;
  // top-level segment keys
  clauseType?: ClauseEvaluationType;
  clause?: Clause;
  onTriggerClause?: Clause;
  onEntryClause?: Clause;
  onExitClause?: Clause;
  // legacy per-segment stats (unused by new editor but kept for compat)
  stats?: { statType: StatType | string; value: number[] }[];
  // nested frames
  frames?: CustomSkillFrameDef[];
}

/** Mirrors the skill-JSON `segments[i].frames[i]` shape. */
export interface CustomSkillFrameDef {
  // properties
  name?: string;
  offsetSeconds: number;
  element?: ElementType;
  frameTypes?: EventFrameType[];
  // top-level frame keys
  clauseType?: ClauseEvaluationType;
  clause?: Clause;
  onTriggerClause?: Clause;
  onEntryClause?: Clause;
  onExitClause?: Clause;
}
