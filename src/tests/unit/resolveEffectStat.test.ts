/**
 * resolveEffectStat — flattens `{object: STAT, objectId, objectQualifier}`
 * triples into the corresponding StatType enum value.
 *
 * Pins the qualifier resolution paths the engine depends on:
 *   - Element qualifier: HEAT + DAMAGE_BONUS → HEAT_DAMAGE_BONUS
 *   - Skill-type qualifier: BATTLE + DAMAGE_BONUS → BATTLE_SKILL_DAMAGE_BONUS
 *     (BATTLE/COMBO carry the `_SKILL_` infix; BASIC_ATTACK/ULTIMATE don't)
 *   - Unqualified passthrough: ATTACK_BONUS → ATTACK_BONUS
 *   - Non-STAT legacy shape: INTELLECT → INTELLECT
 *   - Unknown objectId or qualifier → undefined
 */
import { StatType, resolveEffectStat } from '../../model/enums/stats';
import { NounType, AdjectiveType } from '../../dsl/semantics';

describe('resolveEffectStat', () => {
  describe('element qualifiers — {ELEMENT}_DAMAGE_BONUS pattern', () => {
    test('HEAT + DAMAGE_BONUS → HEAT_DAMAGE_BONUS', () => {
      expect(resolveEffectStat(NounType.STAT, 'DAMAGE_BONUS', AdjectiveType.HEAT))
        .toBe(StatType.HEAT_DAMAGE_BONUS);
    });

    test('CRYO + DAMAGE_BONUS → CRYO_DAMAGE_BONUS', () => {
      expect(resolveEffectStat(NounType.STAT, 'DAMAGE_BONUS', AdjectiveType.CRYO))
        .toBe(StatType.CRYO_DAMAGE_BONUS);
    });

    test('NATURE + DAMAGE_BONUS → NATURE_DAMAGE_BONUS', () => {
      expect(resolveEffectStat(NounType.STAT, 'DAMAGE_BONUS', AdjectiveType.NATURE))
        .toBe(StatType.NATURE_DAMAGE_BONUS);
    });

    test('ELECTRIC + DAMAGE_BONUS → ELECTRIC_DAMAGE_BONUS', () => {
      expect(resolveEffectStat(NounType.STAT, 'DAMAGE_BONUS', AdjectiveType.ELECTRIC))
        .toBe(StatType.ELECTRIC_DAMAGE_BONUS);
    });

    test('PHYSICAL + DAMAGE_BONUS → PHYSICAL_DAMAGE_BONUS', () => {
      expect(resolveEffectStat(NounType.STAT, 'DAMAGE_BONUS', AdjectiveType.PHYSICAL))
        .toBe(StatType.PHYSICAL_DAMAGE_BONUS);
    });

    test('ARTS + DAMAGE_BONUS → ARTS_DAMAGE_BONUS', () => {
      expect(resolveEffectStat(NounType.STAT, 'DAMAGE_BONUS', AdjectiveType.ARTS))
        .toBe(StatType.ARTS_DAMAGE_BONUS);
    });

    test('HEAT + AMP → HEAT_AMP', () => {
      expect(resolveEffectStat(NounType.STAT, 'AMP', AdjectiveType.HEAT))
        .toBe(StatType.HEAT_AMP);
    });

    test('PHYSICAL + SUSCEPTIBILITY → PHYSICAL_SUSCEPTIBILITY', () => {
      expect(resolveEffectStat(NounType.STAT, 'SUSCEPTIBILITY', AdjectiveType.PHYSICAL))
        .toBe(StatType.PHYSICAL_SUSCEPTIBILITY);
    });

    // Per-element AMP — added when Force of Nature talent migrated off the
    // dead damageFactorType filter onto APPLY STAT.
    test('CRYO + AMP → CRYO_AMP', () => {
      expect(resolveEffectStat(NounType.STAT, NounType.AMP, AdjectiveType.CRYO))
        .toBe(StatType.CRYO_AMP);
    });
    test('NATURE + AMP → NATURE_AMP', () => {
      expect(resolveEffectStat(NounType.STAT, NounType.AMP, AdjectiveType.NATURE))
        .toBe(StatType.NATURE_AMP);
    });
    test('ELECTRIC + AMP → ELECTRIC_AMP', () => {
      expect(resolveEffectStat(NounType.STAT, NounType.AMP, AdjectiveType.ELECTRIC))
        .toBe(StatType.ELECTRIC_AMP);
    });
    test('PHYSICAL + AMP → PHYSICAL_AMP', () => {
      expect(resolveEffectStat(NounType.STAT, NounType.AMP, AdjectiveType.PHYSICAL))
        .toBe(StatType.PHYSICAL_AMP);
    });
    test('ARTS + AMP → ARTS_AMP', () => {
      expect(resolveEffectStat(NounType.STAT, NounType.AMP, AdjectiveType.ARTS))
        .toBe(StatType.ARTS_AMP);
    });

    // Per-element RESISTANCE_IGNORE (operator-side stat for Scorching Heart etc.)
    test('HEAT + RESISTANCE_IGNORE → HEAT_RESISTANCE_IGNORE', () => {
      expect(resolveEffectStat(NounType.STAT, NounType.RESISTANCE_IGNORE, AdjectiveType.HEAT))
        .toBe(StatType.HEAT_RESISTANCE_IGNORE);
    });
    test('CRYO + RESISTANCE_IGNORE → CRYO_RESISTANCE_IGNORE', () => {
      expect(resolveEffectStat(NounType.STAT, NounType.RESISTANCE_IGNORE, AdjectiveType.CRYO))
        .toBe(StatType.CRYO_RESISTANCE_IGNORE);
    });
    test('NATURE + RESISTANCE_IGNORE → NATURE_RESISTANCE_IGNORE', () => {
      expect(resolveEffectStat(NounType.STAT, NounType.RESISTANCE_IGNORE, AdjectiveType.NATURE))
        .toBe(StatType.NATURE_RESISTANCE_IGNORE);
    });
    test('ELECTRIC + RESISTANCE_IGNORE → ELECTRIC_RESISTANCE_IGNORE', () => {
      expect(resolveEffectStat(NounType.STAT, NounType.RESISTANCE_IGNORE, AdjectiveType.ELECTRIC))
        .toBe(StatType.ELECTRIC_RESISTANCE_IGNORE);
    });
    test('PHYSICAL + RESISTANCE_IGNORE → PHYSICAL_RESISTANCE_IGNORE', () => {
      expect(resolveEffectStat(NounType.STAT, NounType.RESISTANCE_IGNORE, AdjectiveType.PHYSICAL))
        .toBe(StatType.PHYSICAL_RESISTANCE_IGNORE);
    });
    test('ARTS + RESISTANCE_IGNORE → ARTS_RESISTANCE_IGNORE', () => {
      expect(resolveEffectStat(NounType.STAT, NounType.RESISTANCE_IGNORE, AdjectiveType.ARTS))
        .toBe(StatType.ARTS_RESISTANCE_IGNORE);
    });

    // Per-element RESISTANCE_REDUCTION (enemy-side stat — Corrosion etc.)
    test('HEAT + RESISTANCE_REDUCTION → HEAT_RESISTANCE_REDUCTION', () => {
      expect(resolveEffectStat(NounType.STAT, NounType.RESISTANCE_REDUCTION, AdjectiveType.HEAT))
        .toBe(StatType.HEAT_RESISTANCE_REDUCTION);
    });
    test('CRYO + RESISTANCE_REDUCTION → CRYO_RESISTANCE_REDUCTION', () => {
      expect(resolveEffectStat(NounType.STAT, NounType.RESISTANCE_REDUCTION, AdjectiveType.CRYO))
        .toBe(StatType.CRYO_RESISTANCE_REDUCTION);
    });
    test('NATURE + RESISTANCE_REDUCTION → NATURE_RESISTANCE_REDUCTION', () => {
      expect(resolveEffectStat(NounType.STAT, NounType.RESISTANCE_REDUCTION, AdjectiveType.NATURE))
        .toBe(StatType.NATURE_RESISTANCE_REDUCTION);
    });
    test('ELECTRIC + RESISTANCE_REDUCTION → ELECTRIC_RESISTANCE_REDUCTION', () => {
      expect(resolveEffectStat(NounType.STAT, NounType.RESISTANCE_REDUCTION, AdjectiveType.ELECTRIC))
        .toBe(StatType.ELECTRIC_RESISTANCE_REDUCTION);
    });
    test('PHYSICAL + RESISTANCE_REDUCTION → PHYSICAL_RESISTANCE_REDUCTION', () => {
      expect(resolveEffectStat(NounType.STAT, NounType.RESISTANCE_REDUCTION, AdjectiveType.PHYSICAL))
        .toBe(StatType.PHYSICAL_RESISTANCE_REDUCTION);
    });
    test('ARTS + RESISTANCE_REDUCTION → ARTS_RESISTANCE_REDUCTION', () => {
      expect(resolveEffectStat(NounType.STAT, NounType.RESISTANCE_REDUCTION, AdjectiveType.ARTS))
        .toBe(StatType.ARTS_RESISTANCE_REDUCTION);
    });
  });

  describe('skill-type qualifiers — {SKILL}_SKILL_DAMAGE_BONUS pattern', () => {
    test('BATTLE + DAMAGE_BONUS → BATTLE_SKILL_DAMAGE_BONUS (inserts _SKILL_)', () => {
      expect(resolveEffectStat(NounType.STAT, 'DAMAGE_BONUS', 'BATTLE'))
        .toBe(StatType.BATTLE_SKILL_DAMAGE_BONUS);
    });

    test('COMBO + DAMAGE_BONUS → COMBO_SKILL_DAMAGE_BONUS (inserts _SKILL_)', () => {
      expect(resolveEffectStat(NounType.STAT, 'DAMAGE_BONUS', 'COMBO'))
        .toBe(StatType.COMBO_SKILL_DAMAGE_BONUS);
    });

    test('BASIC_ATTACK + DAMAGE_BONUS → BASIC_ATTACK_DAMAGE_BONUS (no _SKILL_ infix)', () => {
      expect(resolveEffectStat(NounType.STAT, 'DAMAGE_BONUS', 'BASIC_ATTACK'))
        .toBe(StatType.BASIC_ATTACK_DAMAGE_BONUS);
    });

    test('ULTIMATE + DAMAGE_BONUS → ULTIMATE_DAMAGE_BONUS (no _SKILL_ infix)', () => {
      expect(resolveEffectStat(NounType.STAT, 'DAMAGE_BONUS', 'ULTIMATE'))
        .toBe(StatType.ULTIMATE_DAMAGE_BONUS);
    });
  });

  describe('compound skill × element qualifiers — {STEM}_{ELEMENT}_DAMAGE_BONUS', () => {
    test('BATTLE_ELECTRIC + DAMAGE_BONUS → BATTLE_SKILL_ELECTRIC_DAMAGE_BONUS', () => {
      expect(resolveEffectStat(NounType.STAT, 'DAMAGE_BONUS', 'BATTLE_ELECTRIC'))
        .toBe(StatType.BATTLE_SKILL_ELECTRIC_DAMAGE_BONUS);
    });

    test('BATTLE_PHYSICAL + DAMAGE_BONUS → BATTLE_SKILL_PHYSICAL_DAMAGE_BONUS', () => {
      expect(resolveEffectStat(NounType.STAT, 'DAMAGE_BONUS', 'BATTLE_PHYSICAL'))
        .toBe(StatType.BATTLE_SKILL_PHYSICAL_DAMAGE_BONUS);
    });

    test('COMBO_PHYSICAL + DAMAGE_BONUS → COMBO_SKILL_PHYSICAL_DAMAGE_BONUS', () => {
      expect(resolveEffectStat(NounType.STAT, 'DAMAGE_BONUS', 'COMBO_PHYSICAL'))
        .toBe(StatType.COMBO_SKILL_PHYSICAL_DAMAGE_BONUS);
    });

    test('BATK_PHYSICAL + DAMAGE_BONUS → BASIC_ATTACK_PHYSICAL_DAMAGE_BONUS (shorthand)', () => {
      expect(resolveEffectStat(NounType.STAT, 'DAMAGE_BONUS', 'BATK_PHYSICAL'))
        .toBe(StatType.BASIC_ATTACK_PHYSICAL_DAMAGE_BONUS);
    });

    test('BASIC_ATTACK_PHYSICAL + DAMAGE_BONUS → BASIC_ATTACK_PHYSICAL_DAMAGE_BONUS (verbose)', () => {
      expect(resolveEffectStat(NounType.STAT, 'DAMAGE_BONUS', 'BASIC_ATTACK_PHYSICAL'))
        .toBe(StatType.BASIC_ATTACK_PHYSICAL_DAMAGE_BONUS);
    });

    test('FINISHER_ELECTRIC + DAMAGE_BONUS → FINAL_STRIKE_ELECTRIC_DAMAGE_BONUS (shorthand)', () => {
      expect(resolveEffectStat(NounType.STAT, 'DAMAGE_BONUS', 'FINISHER_ELECTRIC'))
        .toBe(StatType.FINAL_STRIKE_ELECTRIC_DAMAGE_BONUS);
    });

    test('FINAL_STRIKE_ELECTRIC + DAMAGE_BONUS → FINAL_STRIKE_ELECTRIC_DAMAGE_BONUS (verbose)', () => {
      expect(resolveEffectStat(NounType.STAT, 'DAMAGE_BONUS', 'FINAL_STRIKE_ELECTRIC'))
        .toBe(StatType.FINAL_STRIKE_ELECTRIC_DAMAGE_BONUS);
    });

    test('ULTIMATE_PHYSICAL + DAMAGE_BONUS → ULTIMATE_PHYSICAL_DAMAGE_BONUS', () => {
      expect(resolveEffectStat(NounType.STAT, 'DAMAGE_BONUS', 'ULTIMATE_PHYSICAL'))
        .toBe(StatType.ULTIMATE_PHYSICAL_DAMAGE_BONUS);
    });

    test('ULTIMATE_ARTS + DAMAGE_BONUS → ULTIMATE_ARTS_DAMAGE_BONUS', () => {
      expect(resolveEffectStat(NounType.STAT, 'DAMAGE_BONUS', 'ULTIMATE_ARTS'))
        .toBe(StatType.ULTIMATE_ARTS_DAMAGE_BONUS);
    });

    test('unknown stem (NOT_A_STEM_ELECTRIC) falls through to bare id', () => {
      expect(resolveEffectStat(NounType.STAT, 'DAMAGE_BONUS', 'NOT_A_STEM_ELECTRIC'))
        .toBe(StatType.DAMAGE_BONUS);
    });

    test('known stem but unknown element falls through to bare id', () => {
      expect(resolveEffectStat(NounType.STAT, 'DAMAGE_BONUS', 'BATTLE_BOGUS'))
        .toBe(StatType.DAMAGE_BONUS);
    });
  });

  describe('unqualified / direct shapes', () => {
    test('STAT + ATTACK_BONUS (no qualifier) → ATTACK_BONUS', () => {
      expect(resolveEffectStat(NounType.STAT, 'ATTACK_BONUS'))
        .toBe(StatType.ATTACK_BONUS);
    });

    test('STAT + SKILL_DAMAGE_BONUS (no qualifier) → SKILL_DAMAGE_BONUS', () => {
      expect(resolveEffectStat(NounType.STAT, 'SKILL_DAMAGE_BONUS'))
        .toBe(StatType.SKILL_DAMAGE_BONUS);
    });

    test('STAT + ARTS_INTENSITY → ARTS_INTENSITY', () => {
      expect(resolveEffectStat(NounType.STAT, 'ARTS_INTENSITY'))
        .toBe(StatType.ARTS_INTENSITY);
    });

    test('legacy direct: INTELLECT (no STAT wrapper) → INTELLECT', () => {
      expect(resolveEffectStat('INTELLECT'))
        .toBe(StatType.INTELLECT);
    });

    test('legacy direct: AGILITY (no STAT wrapper) → AGILITY', () => {
      expect(resolveEffectStat('AGILITY'))
        .toBe(StatType.AGILITY);
    });
  });

  describe('unknown / invalid inputs', () => {
    test('STAT + unknown objectId → undefined', () => {
      expect(resolveEffectStat(NounType.STAT, 'NOT_A_STAT'))
        .toBeUndefined();
    });

    test('STAT + DAMAGE_BONUS + unknown qualifier falls back to bare objectId', () => {
      // DAMAGE_BONUS is itself a valid StatType (the umbrella). When neither
      // `{QUAL}_{ID}` nor `{QUAL}_SKILL_{ID}` resolves, we fall through to the
      // bare objectId — DAMAGE_BONUS is valid, so we get it back.
      expect(resolveEffectStat(NounType.STAT, 'DAMAGE_BONUS', 'NOT_AN_ELEMENT'))
        .toBe(StatType.DAMAGE_BONUS);
    });

    test('STAT + unknown objectId + unknown qualifier → undefined', () => {
      expect(resolveEffectStat(NounType.STAT, 'NOT_A_STAT', 'NOT_AN_ELEMENT'))
        .toBeUndefined();
    });

    test('non-STAT object + unknown id → undefined', () => {
      expect(resolveEffectStat('NOT_A_STAT'))
        .toBeUndefined();
    });
  });

  describe('effect-shaped overload', () => {
    test('reads object/objectId/objectQualifier from an effect-shape object', () => {
      const effect = {
        object: NounType.STAT,
        objectId: 'DAMAGE_BONUS',
        objectQualifier: AdjectiveType.HEAT,
      };
      expect(resolveEffectStat(effect)).toBe(StatType.HEAT_DAMAGE_BONUS);
    });

    test('effect-shape with skill-type qualifier', () => {
      const effect = {
        object: NounType.STAT,
        objectId: 'DAMAGE_BONUS',
        objectQualifier: 'COMBO',
      };
      expect(resolveEffectStat(effect)).toBe(StatType.COMBO_SKILL_DAMAGE_BONUS);
    });
  });
});
