import { CombatResourceType, CombatSkillType, StatusType } from "./enums";

/** Valid weapon rarity values. */
export type WeaponRarity = 3 | 4 | 5 | 6;

/** Valid operator rarity values. */
export type OperatorRarity = 4 | 5 | 6;

/** Talent level, ranging 0–3. */
export type TalentLevel = 0 | 1 | 2 | 3;

/** Skill level, ranging 1–12. */
export type SkillLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/** Operator promotion stage, ranging 0–4. */
export type OperatorPromotionStage = 0 | 1 | 2 | 3 | 4;

/** Potential, ranging 0–5. */
export type Potential = 0 | 1 | 2 | 3 | 4 | 5;

/** Status level, ranging 1–4. */
export type StatusLevel = 1 | 2 | 3 | 4;

/** Gear rank, ranging 1–4. */
export type GearRank = 1 | 2 | 3 | 4;

/** Union of all types that can be used as a requirement subject. */
export type RequirementType = StatusType | CombatResourceType | CombatSkillType;

/** CombatSkillType values that an ultimate can empower (excludes ULTIMATE itself). */
export type EmpowerSkillTarget = Exclude<
  CombatSkillType,
  CombatSkillType.ULTIMATE
>;
