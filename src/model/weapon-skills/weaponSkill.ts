import { StatType, WeaponSkillType } from "../../consts/enums";

/** A single stat value within a named weapon skill effect group. */
export interface NamedEffectStat {
  stat: StatType | string;
  value: number;
}

/** A group of stats for one effect target (wielder, team, or enemy).
 *  Each group maps 1:1 with an effect entry in weaponSkillEffects. */
export interface NamedEffectGroup {
  stats: NamedEffectStat[];
}

export abstract class WeaponSkill {
  readonly weaponSkillType: WeaponSkillType;

  level: number;

  constructor(params: { weaponSkillType: WeaponSkillType; level: number }) {
    this.weaponSkillType = params.weaponSkillType;
    this.level = params.level;
  }

  abstract getValue(): number;

  /** Returns named effect stat groups at the current skill level.
   *  Each group corresponds to an effect entry in weaponSkillEffects.
   *  Returns null for generic stat-boost skills. */
  getNamedEffectGroups(): NamedEffectGroup[] | null { return null; }

  /** Returns passive (always-active) stats from this skill at the current level.
   *  These are added unconditionally to loadout stats, unlike triggered effects. */
  getPassiveStats(): Partial<Record<StatType, number>> { return {}; }
}
