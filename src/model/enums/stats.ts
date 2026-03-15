export enum StatType {
  // ── Attributes ───────────────────────────────────────────────────────────────
  // _BONUS suffix = non-flat multiplicative factor (e.g. 0.10 = ×1.10)
  BASE_HP = "BASE_HP",
  BASE_DEFENSE = "BASE_DEFENSE",
  BASE_ATTACK = "BASE_ATTACK",
  ATTACK_BONUS = "ATTACK_BONUS",
  STRENGTH = "STRENGTH",
  STRENGTH_BONUS = "STRENGTH_BONUS",
  AGILITY = "AGILITY",
  AGILITY_BONUS = "AGILITY_BONUS",
  INTELLECT = "INTELLECT",
  INTELLECT_BONUS = "INTELLECT_BONUS",
  WILL = "WILL",
  WILL_BONUS = "WILL_BONUS",
  // ── Combat stats ─────────────────────────────────────────────────────────────
  CRITICAL_RATE = "CRITICAL_RATE",
  CRITICAL_DAMAGE = "CRITICAL_DAMAGE",
  ARTS_INTENSITY = "ARTS_INTENSITY",
  PHYSICAL_RESISTANCE = "PHYSICAL_RESISTANCE",
  HEAT_RESISTANCE = "HEAT_RESISTANCE",
  ELECTRIC_RESISTANCE = "ELECTRIC_RESISTANCE",
  CRYO_RESISTANCE = "CRYO_RESISTANCE",
  NATURE_RESISTANCE = "NATURE_RESISTANCE",
  AETHER_RESISTANCE = "AETHER_RESISTANCE",
  TREATMENT_BONUS = "TREATMENT_BONUS",
  TREATMENT_RECEIVED_BONUS = "TREATMENT_RECEIVED_BONUS",
  COMBO_SKILL_COOLDOWN_REDUCTION = "COMBO_SKILL_COOLDOWN_REDUCTION",
  ULTIMATE_GAIN_EFFICIENCY = "ULTIMATE_GAIN_EFFICIENCY",
  STAGGER_EFFICIENCY_BONUS = "STAGGER_EFFICIENCY_BONUS",
  PHYSICAL_DAMAGE_BONUS = "PHYSICAL_DAMAGE_BONUS",
  HEAT_DAMAGE_BONUS = "HEAT_DAMAGE_BONUS",
  ELECTRIC_DAMAGE_BONUS = "ELECTRIC_DAMAGE_BONUS",
  CRYO_DAMAGE_BONUS = "CRYO_DAMAGE_BONUS",
  NATURE_DAMAGE_BONUS = "NATURE_DAMAGE_BONUS",
  BASIC_ATTACK_DAMAGE_BONUS = "BASIC_ATTACK_DAMAGE_BONUS",
  BATTLE_SKILL_DAMAGE_BONUS = "BATTLE_SKILL_DAMAGE_BONUS",
  COMBO_SKILL_DAMAGE_BONUS = "COMBO_SKILL_DAMAGE_BONUS",
  ULTIMATE_DAMAGE_BONUS = "ULTIMATE_DAMAGE_BONUS",
  STAGGER_DAMAGE_BONUS = "STAGGER_DAMAGE_BONUS",
  FINAL_DAMAGE_REDUCTION = "FINAL_DAMAGE_REDUCTION",
  SKILL_DAMAGE_BONUS = "SKILL_DAMAGE_BONUS",
  ARTS_DAMAGE_BONUS = "ARTS_DAMAGE_BONUS",
  HP_BONUS = "HP_BONUS",
  FLAT_HP = "FLAT_HP",
  // ── Enemy stats ──────────────────────────────────────────────────────────────
  STAGGER_HP = "STAGGER_HP",
  STAGGER_RECOVERY = "STAGGER_RECOVERY",
  FINISHER_ATK_MULTIPLIER = "FINISHER_ATK_MULTIPLIER",
  FINISHER_SP_GAIN = "FINISHER_SP_GAIN",
  ATTACK_RANGE = "ATTACK_RANGE",
  WEIGHT = "WEIGHT",
}

export enum StatOwnerType {
  OPERATOR = "OPERATOR",
  ENEMY = "ENEMY",
  SKILL = "SKILL",
  WEAPON = "WEAPON",
}

/** Maps each StatType to the owner types that can provide it. */
export const STAT_ATTRIBUTION: Record<StatType, StatOwnerType[]> = {
  // ── Shared (operators and enemies) ────────────────────────────────────────
  [StatType.BASE_HP]: [StatOwnerType.OPERATOR, StatOwnerType.ENEMY],
  [StatType.FLAT_HP]: [StatOwnerType.OPERATOR, StatOwnerType.ENEMY],
  [StatType.HP_BONUS]: [StatOwnerType.OPERATOR, StatOwnerType.ENEMY],
  [StatType.BASE_ATTACK]: [StatOwnerType.OPERATOR, StatOwnerType.ENEMY, StatOwnerType.WEAPON],
  [StatType.BASE_DEFENSE]: [StatOwnerType.OPERATOR, StatOwnerType.ENEMY],
  [StatType.PHYSICAL_RESISTANCE]: [StatOwnerType.OPERATOR, StatOwnerType.ENEMY],
  [StatType.HEAT_RESISTANCE]: [StatOwnerType.OPERATOR, StatOwnerType.ENEMY],
  [StatType.ELECTRIC_RESISTANCE]: [StatOwnerType.OPERATOR, StatOwnerType.ENEMY],
  [StatType.CRYO_RESISTANCE]: [StatOwnerType.OPERATOR, StatOwnerType.ENEMY],
  [StatType.NATURE_RESISTANCE]: [StatOwnerType.OPERATOR, StatOwnerType.ENEMY],
  [StatType.AETHER_RESISTANCE]: [StatOwnerType.OPERATOR, StatOwnerType.ENEMY],
  [StatType.FINAL_DAMAGE_REDUCTION]: [StatOwnerType.OPERATOR, StatOwnerType.ENEMY],
  // ── Operator base attributes ──────────────────────────────────────────────
  [StatType.STRENGTH]: [StatOwnerType.OPERATOR],
  [StatType.STRENGTH_BONUS]: [StatOwnerType.OPERATOR, StatOwnerType.WEAPON],
  [StatType.AGILITY]: [StatOwnerType.OPERATOR],
  [StatType.AGILITY_BONUS]: [StatOwnerType.OPERATOR, StatOwnerType.WEAPON],
  [StatType.INTELLECT]: [StatOwnerType.OPERATOR],
  [StatType.INTELLECT_BONUS]: [StatOwnerType.OPERATOR, StatOwnerType.WEAPON],
  [StatType.WILL]: [StatOwnerType.OPERATOR],
  [StatType.WILL_BONUS]: [StatOwnerType.OPERATOR, StatOwnerType.WEAPON, StatOwnerType.SKILL],
  // ── Combat stats ──────────────────────────────────────────────────────────
  [StatType.ATTACK_BONUS]: [StatOwnerType.OPERATOR, StatOwnerType.WEAPON, StatOwnerType.SKILL],
  [StatType.CRITICAL_RATE]: [StatOwnerType.OPERATOR, StatOwnerType.WEAPON, StatOwnerType.SKILL],
  [StatType.CRITICAL_DAMAGE]: [StatOwnerType.OPERATOR],
  [StatType.ARTS_INTENSITY]: [StatOwnerType.OPERATOR, StatOwnerType.WEAPON, StatOwnerType.SKILL],
  [StatType.TREATMENT_BONUS]: [StatOwnerType.OPERATOR],
  [StatType.TREATMENT_RECEIVED_BONUS]: [StatOwnerType.OPERATOR],
  [StatType.COMBO_SKILL_COOLDOWN_REDUCTION]: [StatOwnerType.OPERATOR],
  [StatType.ULTIMATE_GAIN_EFFICIENCY]: [StatOwnerType.OPERATOR],
  [StatType.STAGGER_EFFICIENCY_BONUS]: [StatOwnerType.OPERATOR, StatOwnerType.WEAPON, StatOwnerType.SKILL],
  // ── Damage bonuses ────────────────────────────────────────────────────────
  [StatType.PHYSICAL_DAMAGE_BONUS]: [StatOwnerType.OPERATOR, StatOwnerType.WEAPON, StatOwnerType.SKILL],
  [StatType.HEAT_DAMAGE_BONUS]: [StatOwnerType.OPERATOR, StatOwnerType.WEAPON, StatOwnerType.SKILL],
  [StatType.ELECTRIC_DAMAGE_BONUS]: [StatOwnerType.OPERATOR, StatOwnerType.WEAPON, StatOwnerType.SKILL],
  [StatType.CRYO_DAMAGE_BONUS]: [StatOwnerType.OPERATOR, StatOwnerType.WEAPON, StatOwnerType.SKILL],
  [StatType.NATURE_DAMAGE_BONUS]: [StatOwnerType.OPERATOR, StatOwnerType.WEAPON, StatOwnerType.SKILL],
  [StatType.BASIC_ATTACK_DAMAGE_BONUS]: [StatOwnerType.OPERATOR, StatOwnerType.WEAPON, StatOwnerType.SKILL],
  [StatType.BATTLE_SKILL_DAMAGE_BONUS]: [StatOwnerType.OPERATOR, StatOwnerType.WEAPON, StatOwnerType.SKILL],
  [StatType.COMBO_SKILL_DAMAGE_BONUS]: [StatOwnerType.OPERATOR, StatOwnerType.WEAPON, StatOwnerType.SKILL],
  [StatType.ULTIMATE_DAMAGE_BONUS]: [StatOwnerType.OPERATOR],
  [StatType.STAGGER_DAMAGE_BONUS]: [StatOwnerType.OPERATOR],
  [StatType.SKILL_DAMAGE_BONUS]: [StatOwnerType.OPERATOR, StatOwnerType.SKILL],
  [StatType.ARTS_DAMAGE_BONUS]: [StatOwnerType.OPERATOR, StatOwnerType.WEAPON, StatOwnerType.SKILL],
  // ── Enemy only ────────────────────────────────────────────────────────────
  [StatType.STAGGER_HP]: [StatOwnerType.ENEMY],
  [StatType.STAGGER_RECOVERY]: [StatOwnerType.ENEMY],
  [StatType.FINISHER_ATK_MULTIPLIER]: [StatOwnerType.ENEMY],
  [StatType.FINISHER_SP_GAIN]: [StatOwnerType.ENEMY],
  [StatType.ATTACK_RANGE]: [StatOwnerType.ENEMY],
  [StatType.WEIGHT]: [StatOwnerType.ENEMY],
};

/** Returns stats that include the given owner type. */
export function getStatsForTarget(target: StatOwnerType): StatType[] {
  return (Object.keys(STAT_ATTRIBUTION) as StatType[]).filter(
    (stat) => STAT_ATTRIBUTION[stat].includes(target),
  );
}
