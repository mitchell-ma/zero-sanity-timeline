/**
 * Custom weapon skill implementations for user-created weapons.
 */
import { StatType, WeaponSkillType } from '../../consts/enums';
import { WeaponSkill, NamedEffectGroup } from './weaponSkill';
import type { CustomWeaponNamedEffect } from '../custom/customWeaponTypes';

/**
 * A stat-boost weapon skill with user-provided level-indexed values.
 */
export class CustomStatBoostSkill extends WeaponSkill {
  private readonly values: number[];
  private readonly stat: StatType | string;

  constructor(skillKey: string, level: number, stat: StatType | string, values: number[]) {
    super({
      weaponSkillType: skillKey as unknown as WeaponSkillType,
      level,
    });
    this.stat = stat;
    this.values = values;
  }

  getValue(): number {
    return this.values[Math.min(this.level - 1, this.values.length - 1)] ?? 0;
  }

  getPassiveStats(): Partial<Record<StatType, number>> {
    return { [this.stat as StatType]: this.getValue() };
  }
}

/**
 * A named weapon skill with user-provided triggered effect configuration.
 * Integrates with the existing WeaponSkillStatusEvent pipeline via
 * getNamedEffectGroups() and getPassiveStats().
 */
export class CustomNamedWeaponSkill extends WeaponSkill {
  private readonly effect: CustomWeaponNamedEffect;

  constructor(skillKey: string, level: number, effect: CustomWeaponNamedEffect) {
    super({
      weaponSkillType: skillKey as unknown as WeaponSkillType,
      level,
      description: effect.description ?? '',
    });
    this.effect = effect;
  }

  getValue(): number {
    // Named skills don't have a single scalar value — buffs are per-stat.
    // Return 0 as a no-op for the generic getValue() contract.
    return 0;
  }

  getNamedEffectGroups(): NamedEffectGroup[] | null {
    if (this.effect.buffs.length === 0) return null;
    const t = Math.min(this.level - 1, 8) / 8;
    return [{
      stats: this.effect.buffs.map((b) => ({
        stat: b.stat,
        value: b.valueMin + (b.valueMax - b.valueMin) * t,
      })),
    }];
  }

  getPassiveStats(): Partial<Record<StatType, number>> {
    if (!this.effect.passiveStats || this.effect.passiveStats.length === 0) return {};
    const result: Partial<Record<StatType, number>> = {};
    for (const ps of this.effect.passiveStats) {
      const idx = Math.min(this.level - 1, ps.values.length - 1);
      result[ps.stat as StatType] = ps.values[idx] ?? 0;
    }
    return result;
  }
}
