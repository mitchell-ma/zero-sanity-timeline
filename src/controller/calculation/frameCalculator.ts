import {
  CombatSkillType,
  ElementType,
  EnemyTierType,
  StatType,
} from "../../consts/enums";
import { OperatorLoadout } from "../../model/loadout/operatorLoadout";
import { Enemy } from "../../model/enemies/enemy";
import {
  calculateDamage,
  calculateStatusDamage,
  DamageParams,
  StatusDamageParams,
  getAttributeBonus,
  getCritMultiplier,
  getDamageBonus,
  getDefenseMultiplier,
  getDmgReductionMultiplier,
  getElementDamageBonusStat,
  getExpectedCritMultiplier,
  getFinisherMultiplier,
  getResistanceMultiplier,
  getSkillTypeDamageBonusStat,
  getStaggerMultiplier,
  getTotalAttack,
  getWeakenMultiplier,
  getProtectionMultiplier,
  getAmpMultiplier,
  getSusceptibilityMultiplier,
  getIncreasedDmgTakenMultiplier,
  getLinkMultiplier,
  getArtsIntensityMultiplier,
} from "../../model/calculation/damageFormulas";

// ── Types ───────────────────────────────────────────────────────────────────

/** Snapshot of all combat conditions at a specific frame. */
export interface FrameContext {
  /** The loadout of the attacking operator. */
  loadout: OperatorLoadout;
  /** The target enemy. */
  enemy: Enemy;
  /** The skill multiplier for this hit (from the combat skill's level table). */
  skillMultiplier: number;
  /** Which type of skill is being used. */
  skillType: CombatSkillType;
  /** Element of the attack. */
  element: ElementType;
  /** Whether this specific hit is a critical. */
  isCrit: boolean;
  /** Whether the enemy is currently staggered. */
  isStaggered: boolean;
  /** Whether this is a finisher hit. */
  isFinisher: boolean;
  /** Whether this is a link attack. */
  isLinkAttack: boolean;
  /** Link bonus value (if link attack). */
  linkBonus: number;
  /** Amp bonuses on the target (additive sum). */
  ampBonuses: number;
  /** Weaken effects on the attacker (each is a fraction, e.g. 0.1 = 10%). */
  weakenEffects: number[];
  /** Susceptibility effects on the target (additive sum). */
  susceptibilityEffects: number;
  /** Increased damage taken effects on the target (additive sum). */
  increasedDmgTaken: number;
  /** Damage reduction effects on the target (each is a fraction). */
  dmgReductionEffects: number[];
  /** Protection effects on the target (each is a fraction; strongest wins). */
  protectionEffects: number[];
  /** Any flat ATK bonuses from temporary buffs (gear procs, consumables, etc). */
  flatAtkBonuses: number;
}

export interface DamageResult {
  /** Final damage number. */
  damage: number;
  /** All intermediate factors for inspection/debugging. */
  factors: DamageParams;
}

export interface ExpectedDamageResult {
  /** Expected damage (crit-weighted average). */
  expectedDamage: number;
  /** Damage on non-crit. */
  nonCritDamage: number;
  /** Damage on crit. */
  critDamage: number;
  /** Effective crit rate used. */
  critRate: number;
}

// ── Frame Calculator ────────────────────────────────────────────────────────

export class FrameCalculator {
  /**
   * Calculate damage for a single hit at a specific frame, given full context.
   */
  calculateDamage(ctx: FrameContext): DamageResult {
    const factors = this.buildDamageParams(ctx);
    const damage = calculateDamage(factors);
    return { damage, factors };
  }

  /**
   * Calculate expected (crit-averaged) damage for a hit.
   */
  calculateExpectedDamage(ctx: Omit<FrameContext, "isCrit">): ExpectedDamageResult {
    const stats = this.getAggregatedStats(ctx.loadout);
    const critRate = Math.min(Math.max(stats[StatType.CRITICAL_RATE], 0), 1);
    const critDamage = stats[StatType.CRITICAL_DAMAGE];

    const nonCritResult = this.calculateDamage({ ...ctx, isCrit: false });
    const critResult = this.calculateDamage({ ...ctx, isCrit: true });

    return {
      expectedDamage: nonCritResult.damage * (1 - critRate) + critResult.damage * critRate,
      nonCritDamage: nonCritResult.damage,
      critDamage: critResult.damage,
      critRate,
    };
  }

  /**
   * Aggregate all stats from operator + weapon skills + gears + consumable.
   */
  getAggregatedStats(loadout: OperatorLoadout): Record<StatType, number> {
    const op = loadout.operator;
    if (!op) {
      throw new Error("Cannot aggregate stats: no operator in loadout");
    }

    // Start with operator base stats
    const stats = { ...op.stats };

    // Add weapon skill stats
    const weapon = loadout.weapon;
    if (weapon) {
      this.applyWeaponSkillStats(stats, weapon, op);
    }

    // Add gear stats
    for (const gear of [loadout.armor, loadout.gloves, loadout.kit1, loadout.kit2]) {
      if (gear) {
        const gearStats = gear.getStats();
        for (const [key, value] of Object.entries(gearStats)) {
          stats[key as StatType] += value!;
        }
      }
    }

    // Add consumable stats
    if (loadout.consumable) {
      for (const [key, value] of Object.entries(loadout.consumable.stats)) {
        stats[key as StatType] += value!;
      }
    }

    // Add tactical stats
    if (loadout.tactical) {
      for (const [key, value] of Object.entries(loadout.tactical.stats)) {
        stats[key as StatType] += value!;
      }
    }

    return stats;
  }

  /**
   * Get total attack for a loadout.
   */
  getTotalAttack(loadout: OperatorLoadout, flatBonuses: number = 0): number {
    const op = loadout.operator;
    const weapon = loadout.weapon;
    if (!op) throw new Error("Cannot compute attack: no operator in loadout");

    const stats = this.getAggregatedStats(loadout);
    const operatorAtk = op.getBaseAttack();
    const weaponAtk = weapon ? weapon.getBaseAttack() : 0;
    const atkBonus = stats[StatType.ATTACK_BONUS];

    return getTotalAttack(operatorAtk, weaponAtk, atkBonus, flatBonuses);
  }

  /**
   * Get the attribute bonus for a loadout's operator.
   */
  getAttributeBonus(loadout: OperatorLoadout): number {
    const op = loadout.operator;
    if (!op) throw new Error("Cannot compute attribute bonus: no operator");

    const stats = this.getAggregatedStats(loadout);
    const mainAttr = stats[op.mainAttributeType];
    const secAttr = stats[op.secondaryAttributeType];
    return getAttributeBonus(mainAttr, secAttr);
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private buildDamageParams(ctx: FrameContext): DamageParams {
    const stats = this.getAggregatedStats(ctx.loadout);
    const op = ctx.loadout.operator!;

    // Attack
    const operatorAtk = op.getBaseAttack();
    const weaponAtk = ctx.loadout.weapon ? ctx.loadout.weapon.getBaseAttack() : 0;
    const attack = getTotalAttack(
      operatorAtk,
      weaponAtk,
      stats[StatType.ATTACK_BONUS],
      ctx.flatAtkBonuses,
    );

    // Attribute bonus
    const mainAttr = stats[op.mainAttributeType];
    const secAttr = stats[op.secondaryAttributeType];
    const attributeBonus = getAttributeBonus(mainAttr, secAttr);

    // Damage bonus group
    const elementBonusStat = getElementDamageBonusStat(ctx.element);
    const skillTypeBonusStat = getSkillTypeDamageBonusStat(ctx.skillType);
    const isArts = ctx.element !== ElementType.PHYSICAL;
    const multiplierGroup = getDamageBonus(
      stats[elementBonusStat],
      stats[skillTypeBonusStat],
      stats[StatType.SKILL_DAMAGE_BONUS],
      isArts ? stats[StatType.ARTS_DAMAGE_BONUS] : 0,
    );

    // Crit
    const critMultiplier = getCritMultiplier(ctx.isCrit, stats[StatType.CRITICAL_DAMAGE]);

    // Defense & Resistance
    const defenseMultiplier = getDefenseMultiplier(ctx.enemy.getDef());
    const resistanceMultiplier = getResistanceMultiplier(ctx.enemy, ctx.element);

    return {
      attack,
      baseMultiplier: ctx.skillMultiplier,
      attributeBonus,
      multiplierGroup,
      critMultiplier,
      ampMultiplier: getAmpMultiplier(ctx.ampBonuses),
      staggerMultiplier: getStaggerMultiplier(ctx.isStaggered),
      finisherMultiplier: getFinisherMultiplier(ctx.enemy.tier, ctx.isFinisher),
      linkMultiplier: getLinkMultiplier(ctx.linkBonus, ctx.isLinkAttack),
      weakenMultiplier: getWeakenMultiplier(ctx.weakenEffects),
      susceptibilityMultiplier: getSusceptibilityMultiplier(ctx.susceptibilityEffects),
      increasedDmgTakenMultiplier: getIncreasedDmgTakenMultiplier(ctx.increasedDmgTaken),
      dmgReductionMultiplier: getDmgReductionMultiplier(ctx.dmgReductionEffects),
      protectionMultiplier: getProtectionMultiplier(ctx.protectionEffects),
      defenseMultiplier,
      resistanceMultiplier,
    };
  }

  private applyWeaponSkillStats(
    stats: Record<StatType, number>,
    weapon: import("../../model/weapons/weapon").Weapon,
    operator: import("../../model/operators/operator").Operator,
  ): void {
    const skills = [weapon.weaponSkillOne, weapon.weaponSkillTwo];
    if (weapon.weaponSkillThree) skills.push(weapon.weaponSkillThree);

    for (const skill of skills) {
      const value = skill.getValue();
      const type = skill.weaponSkillType;

      // Map weapon skill types to stat types
      // The naming convention is consistent: e.g. ATTACK_BOOST_L → ATTACK_BONUS
      // For main attribute boosts, we need the operator's main attribute
      if (type.startsWith("MAIN_ATTRIBUTE_BOOST")) {
        const bonusStat = (operator.mainAttributeType + "_BONUS") as StatType;
        if (bonusStat in stats) {
          stats[bonusStat] += value;
        }
      } else if (type.startsWith("ATTACK_BOOST")) {
        stats[StatType.ATTACK_BONUS] += value;
      } else if (type.startsWith("STRENGTH_BOOST")) {
        stats[StatType.STRENGTH_BONUS] += value;
      } else if (type.startsWith("AGILITY_BOOST")) {
        stats[StatType.AGILITY_BONUS] += value;
      } else if (type.startsWith("INTELLECT_BOOST")) {
        stats[StatType.INTELLECT_BONUS] += value;
      } else if (type.startsWith("WILL_BOOST")) {
        stats[StatType.WILL_BONUS] += value;
      } else if (type.startsWith("PHYSICAL_DAMAGE_BOOST")) {
        stats[StatType.PHYSICAL_DAMAGE_BONUS] += value;
      } else if (type.startsWith("HEAT_DAMAGE_BOOST")) {
        stats[StatType.HEAT_DAMAGE_BONUS] += value;
      } else if (type.startsWith("CRYO_DAMAGE_BOOST")) {
        stats[StatType.CRYO_DAMAGE_BONUS] += value;
      } else if (type.startsWith("NATURE_DAMAGE_BOOST")) {
        stats[StatType.NATURE_DAMAGE_BONUS] += value;
      } else if (type.startsWith("ELECTRIC_DAMAGE_BOOST")) {
        stats[StatType.ELECTRIC_DAMAGE_BONUS] += value;
      } else if (type.startsWith("ULTIMATE_GAIN_EFFICIENCY_BOOST")) {
        stats[StatType.ULTIMATE_GAIN_EFFICIENCY] += value;
      } else if (type.startsWith("HP_BOOST")) {
        stats[StatType.HP_BONUS] += value;
      } else if (type.startsWith("ARTS_INTENSITY_BOOST")) {
        stats[StatType.ARTS_INTENSITY] += value;
      } else if (type.startsWith("CRITICAL_RATE_BOOST")) {
        stats[StatType.CRITICAL_RATE] += value;
      } else if (type.startsWith("TREATMENT_EFFICIENCY_BOOST")) {
        stats[StatType.TREATMENT_BONUS] += value;
      } else if (type.startsWith("ARTS_BOOST")) {
        stats[StatType.ARTS_DAMAGE_BONUS] += value;
      }
      // Named weapon skills have operator-specific effects handled elsewhere
    }
  }
}
