/**
 * Type definitions for user-created custom skills.
 * Skills are standalone entities that can be assigned to operators.
 */
import { CombatSkillType, ElementType, TimeInteractionType } from '../../consts/enums';
import type { Interaction, StatusReaction } from '../../consts/semantics';
import type { StatType } from '../enums';

/** A user-created custom skill. */
export interface CustomSkill {
  id: string;
  name: string;
  combatSkillType: CombatSkillType;
  element?: ElementType;
  durationSeconds: number;
  cooldownSeconds?: number;
  animationSeconds?: number;
  timeInteractionType?: TimeInteractionType;
  resourceInteractions?: CustomSkillResourceInteraction[];
  activationConditions?: Interaction[][];
  segments?: CustomSkillSegmentDef[];
  multipliers?: { label: string; values: number[] }[];
  publishesTriggers?: Interaction[];
  description?: string;
}

export interface CustomSkillResourceInteraction {
  resourceType: string;
  verbType: string;
  value: number;
  target?: string;
}

export interface CustomSkillSegmentDef {
  name?: string;
  durationSeconds: number;
  stats?: { statType: StatType | string; value: number[] }[];
}
