export enum StatType {
  // ── Attributes ───────────────────────────────────────────────────────────────
  // _BONUS suffix = non-flat multiplicative factor (e.g. 0.10 = ×1.10)
  BASE_HP = "BASE_HP",
  BASE_DEFENSE = "BASE_DEFENSE",
  BASE_ATTACK = "BASE_ATTACK",
  /** Flat ATK additions from APPLY STAT effects (weapon skills, gear, consumables).
   *  Distinct from BASE_ATTACK (operator/weapon level-table base) and ATTACK_BONUS
   *  (percentage). Summed into totalAttack as a pure flat addition. */
  FLAT_ATTACK = "FLAT_ATTACK",
  ATTACK_BONUS = "ATTACK_BONUS",
  STRENGTH = "STRENGTH",
  STRENGTH_BONUS = "STRENGTH_BONUS",
  AGILITY = "AGILITY",
  AGILITY_BONUS = "AGILITY_BONUS",
  INTELLECT = "INTELLECT",
  INTELLECT_BONUS = "INTELLECT_BONUS",
  WILL = "WILL",
  WILL_BONUS = "WILL_BONUS",
  /** Virtual alias — resolves to the operator's main attribute (STR/AGI/INT/WILL)
   *  at the loadout aggregator. Never stored as itself; always translated. */
  MAIN_ATTRIBUTE = "MAIN_ATTRIBUTE",
  /** Virtual alias — resolves to the operator's secondary attribute. */
  SECONDARY_ATTRIBUTE = "SECONDARY_ATTRIBUTE",
  // ── Combat stats ─────────────────────────────────────────────────────────────
  CRITICAL_RATE = "CRITICAL_RATE",
  CRITICAL_DAMAGE = "CRITICAL_DAMAGE",
  ARTS_INTENSITY = "ARTS_INTENSITY",
  PHYSICAL_RESISTANCE = "PHYSICAL_RESISTANCE",
  ARTS_RESISTANCE = "ARTS_RESISTANCE",
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
  FINAL_STRIKE_DAMAGE_BONUS = "FINAL_STRIKE_DAMAGE_BONUS",
  FINAL_DAMAGE_REDUCTION = "FINAL_DAMAGE_REDUCTION",
  SKILL_DAMAGE_BONUS = "SKILL_DAMAGE_BONUS",
  ARTS_DAMAGE_BONUS = "ARTS_DAMAGE_BONUS",
  HP_BONUS = "HP_BONUS",
  FLAT_HP = "FLAT_HP",
  // ── Damage factor stats ──────────────────────────────────────────────────────
  /** Elemental/skill damage bonus (percentage). Qualified by element or skill type in DSL. */
  DAMAGE_BONUS = "DAMAGE_BONUS",
  /** Damage taken bonus (percentage increase to damage received). Qualified by element in DSL. */
  DAMAGE_TAKEN_BONUS = "DAMAGE_TAKEN_BONUS",
  // AMP, SUSCEPTIBILITY, FRAGILITY must always be qualified in authored DSL
  // (`{object: STAT, objectId: AMP, objectQualifier: <EL>}` → flattened to
  // `<EL>_AMP`). No unqualified AMP/SUSCEPTIBILITY stat exists.
  ARTS_AMP = "ARTS_AMP",
  HEAT_SUSCEPTIBILITY = "HEAT_SUSCEPTIBILITY",
  CRYO_SUSCEPTIBILITY = "CRYO_SUSCEPTIBILITY",
  NATURE_SUSCEPTIBILITY = "NATURE_SUSCEPTIBILITY",
  ELECTRIC_SUSCEPTIBILITY = "ELECTRIC_SUSCEPTIBILITY",
  PHYSICAL_SUSCEPTIBILITY = "PHYSICAL_SUSCEPTIBILITY",
  ARTS_SUSCEPTIBILITY = "ARTS_SUSCEPTIBILITY",
  /** Element-qualified fragility debuff on enemy (percentage increase to damage taken of that element). */
  PHYSICAL_FRAGILITY = "PHYSICAL_FRAGILITY",
  HEAT_FRAGILITY = "HEAT_FRAGILITY",
  CRYO_FRAGILITY = "CRYO_FRAGILITY",
  NATURE_FRAGILITY = "NATURE_FRAGILITY",
  ELECTRIC_FRAGILITY = "ELECTRIC_FRAGILITY",
  ARTS_FRAGILITY = "ARTS_FRAGILITY",
  // ── Debuff stats ─────────────────────────────────────────────────────────────
  /** Damage dealt reduction debuff on enemy (percentage). Damage formula uses (1 - WEAKNESS). */
  WEAKNESS = "WEAKNESS",
  /** Movement speed reduction (percentage). Applied by statuses with SLOW effects. */
  SLOW = "SLOW",
  /** Stagger frailty — non-zero while enemy is in any stagger state. Stat-based trigger source. */
  STAGGER_FRAILTY = "STAGGER_FRAILTY",
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
  [StatType.FLAT_ATTACK]: [StatOwnerType.OPERATOR, StatOwnerType.WEAPON, StatOwnerType.SKILL],
  [StatType.BASE_DEFENSE]: [StatOwnerType.OPERATOR, StatOwnerType.ENEMY],
  [StatType.PHYSICAL_RESISTANCE]: [StatOwnerType.OPERATOR, StatOwnerType.ENEMY],
  [StatType.ARTS_RESISTANCE]: [StatOwnerType.OPERATOR],
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
  // Virtual aliases — translated to the operator's main/secondary attribute
  // by the loadout aggregator. No real owner; never persisted under these keys.
  [StatType.MAIN_ATTRIBUTE]: [],
  [StatType.SECONDARY_ATTRIBUTE]: [],
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
  [StatType.FINAL_STRIKE_DAMAGE_BONUS]: [StatOwnerType.OPERATOR, StatOwnerType.SKILL],
  [StatType.SKILL_DAMAGE_BONUS]: [StatOwnerType.OPERATOR, StatOwnerType.SKILL],
  [StatType.ARTS_DAMAGE_BONUS]: [StatOwnerType.OPERATOR, StatOwnerType.WEAPON, StatOwnerType.SKILL],
  // ── Damage factor stats ───────────────────────────────────────────────────
  [StatType.DAMAGE_BONUS]: [StatOwnerType.OPERATOR, StatOwnerType.WEAPON, StatOwnerType.SKILL],
  [StatType.DAMAGE_TAKEN_BONUS]: [StatOwnerType.ENEMY],
  [StatType.ARTS_AMP]: [StatOwnerType.OPERATOR],
  [StatType.HEAT_SUSCEPTIBILITY]: [StatOwnerType.ENEMY],
  [StatType.CRYO_SUSCEPTIBILITY]: [StatOwnerType.ENEMY],
  [StatType.NATURE_SUSCEPTIBILITY]: [StatOwnerType.ENEMY],
  [StatType.ELECTRIC_SUSCEPTIBILITY]: [StatOwnerType.ENEMY],
  [StatType.PHYSICAL_SUSCEPTIBILITY]: [StatOwnerType.ENEMY],
  [StatType.ARTS_SUSCEPTIBILITY]: [StatOwnerType.ENEMY],
  [StatType.PHYSICAL_FRAGILITY]: [StatOwnerType.ENEMY],
  [StatType.HEAT_FRAGILITY]: [StatOwnerType.ENEMY],
  [StatType.CRYO_FRAGILITY]: [StatOwnerType.ENEMY],
  [StatType.NATURE_FRAGILITY]: [StatOwnerType.ENEMY],
  [StatType.ELECTRIC_FRAGILITY]: [StatOwnerType.ENEMY],
  [StatType.ARTS_FRAGILITY]: [StatOwnerType.ENEMY],
  // ── Enemy only ────────────────────────────────────────────────────────────
  [StatType.STAGGER_HP]: [StatOwnerType.ENEMY],
  [StatType.STAGGER_RECOVERY]: [StatOwnerType.ENEMY],
  [StatType.FINISHER_ATK_MULTIPLIER]: [StatOwnerType.ENEMY],
  [StatType.FINISHER_SP_GAIN]: [StatOwnerType.ENEMY],
  [StatType.ATTACK_RANGE]: [StatOwnerType.ENEMY],
  [StatType.WEIGHT]: [StatOwnerType.ENEMY],
  [StatType.WEAKNESS]: [StatOwnerType.ENEMY],
  [StatType.SLOW]: [StatOwnerType.ENEMY],
  [StatType.STAGGER_FRAILTY]: [StatOwnerType.ENEMY],
};

/** Returns stats that include the given owner type. */
export function getStatsForTarget(target: StatOwnerType): StatType[] {
  return (Object.keys(STAT_ATTRIBUTION) as StatType[]).filter(
    (stat) => STAT_ATTRIBUTION[stat].includes(target),
  );
}

// ── Qualified stat resolution ──────────────────────────────────────────────

/** All valid StatType values for O(1) lookup. */
const STAT_TYPE_SET = new Set<string>(Object.values(StatType));

/** The DSL object type for stat effects. Duplicated here to avoid model→DSL dependency. */
const STAT_OBJECT = 'STAT' as const;

/**
 * Resolve a DSL effect's object/objectId/objectQualifier into a StatType.
 *
 * Qualified stats: object=STAT, objectId=DAMAGE_BONUS, objectQualifier=HEAT → HEAT_DAMAGE_BONUS
 * Unqualified stats: object=STAT, objectId=ATTACK_BONUS → ATTACK_BONUS
 * Legacy direct stats: object=INTELLECT → INTELLECT
 *
 * Accepts either an effect-shaped object or individual fields.
 * Returns undefined if the resolved key is not a valid StatType.
 */
export function resolveEffectStat(effect: { object: string; objectId?: string; objectQualifier?: string }): StatType | undefined;
export function resolveEffectStat(object: string, objectId?: string, objectQualifier?: string): StatType | undefined;
export function resolveEffectStat(
  effectOrObject: string | { object: string; objectId?: string; objectQualifier?: string },
  objectId?: string,
  objectQualifier?: string,
): StatType | undefined {
  const obj = typeof effectOrObject === 'string' ? effectOrObject : effectOrObject.object;
  const id = typeof effectOrObject === 'string' ? objectId : effectOrObject.objectId;
  const qual = typeof effectOrObject === 'string' ? objectQualifier : effectOrObject.objectQualifier;
  const key = obj === STAT_OBJECT
    ? (qual ? `${qual}_${id}` : id ?? obj)
    : obj;
  return STAT_TYPE_SET.has(key) ? key as StatType : undefined;
}
