/**
 * Unit tests for the warfarin weapon parser's flat-vs-percent stat-key
 * resolution heuristic.
 *
 * Context: the raw game data's `cardAttributeModifier.formulaItem` field
 * distinguishes flat additions (`BaseFinalAddition`) from percentage bonuses
 * (`BaseFinalMultiplication`), but warfarin's flattened blackboard strips
 * that field. The parser therefore resolves ambiguous keys (`atk`/`atk_up`/
 * `hp`/`hp_up`) by inspecting the max absolute value across all levels:
 * values ≥ 1 are flat (FLAT_ATTACK / FLAT_HP); values < 1 are percentage
 * (ATTACK_BONUS / HP_BONUS).
 */

import { buildKeyResolution } from '../../model/utils/parsers/parseWarfarinWeapons';

// Minimal SkillLevelEntry shape — only blackboard matters for buildKeyResolution.
function lv(level: number, blackboard: { key: string; value: number }[]) {
  return {
    skillId: 'test',
    skillName: 'test',
    description: '',
    level,
    blackboard: blackboard.map(({ key, value }) => ({ key, value, valueStr: '' })),
    tagId: '',
    coolDown: 0,
    maxChargeTime: 0,
  };
}

describe('buildKeyResolution — flat vs percent ATK/HP heuristic', () => {
  it('classifies atk_up ≥ 1 as FLAT_ATTACK (Darhoff 7 regression: 10, 18, …, 79)', () => {
    const resolution = buildKeyResolution([
      lv(1, [{ key: 'atk_up', value: 10 }]),
      lv(2, [{ key: 'atk_up', value: 18 }]),
      lv(3, [{ key: 'atk_up', value: 26 }]),
      lv(4, [{ key: 'atk_up', value: 34 }]),
      lv(5, [{ key: 'atk_up', value: 42 }]),
      lv(6, [{ key: 'atk_up', value: 51 }]),
      lv(7, [{ key: 'atk_up', value: 59 }]),
      lv(8, [{ key: 'atk_up', value: 67 }]),
      lv(9, [{ key: 'atk_up', value: 79 }]),
    ]);
    expect(resolution.get('atk_up')).toBe('FLAT_ATTACK');
  });

  it('classifies atk_up < 1 as ATTACK_BONUS (generic ATTACK_BOOST_S: 0.03, …, 0.234)', () => {
    const resolution = buildKeyResolution([
      lv(1, [{ key: 'atk_up', value: 0.03 }]),
      lv(9, [{ key: 'atk_up', value: 0.234 }]),
    ]);
    expect(resolution.get('atk_up')).toBe('ATTACK_BONUS');
  });

  it('classifies the alt key `atk` the same way as `atk_up`', () => {
    const flatResolution = buildKeyResolution([lv(1, [{ key: 'atk', value: 20 }])]);
    expect(flatResolution.get('atk')).toBe('FLAT_ATTACK');

    const pctResolution = buildKeyResolution([lv(1, [{ key: 'atk', value: 0.08 }])]);
    expect(pctResolution.get('atk')).toBe('ATTACK_BONUS');
  });

  it('classifies hp_up ≥ 1 as FLAT_HP and < 1 as HP_BONUS', () => {
    const flatResolution = buildKeyResolution([
      lv(1, [{ key: 'hp_up', value: 100 }]),
      lv(9, [{ key: 'hp_up', value: 800 }]),
    ]);
    expect(flatResolution.get('hp_up')).toBe('FLAT_HP');

    const pctResolution = buildKeyResolution([
      lv(1, [{ key: 'hp_up', value: 0.05 }]),
      lv(9, [{ key: 'hp_up', value: 0.3 }]),
    ]);
    expect(pctResolution.get('hp_up')).toBe('HP_BONUS');
  });

  it('uses max absolute value across all levels (not per-level classification)', () => {
    // If L1 happens to be 0 but other levels are flat, still classify as flat.
    // Per-level heuristic would misfire on level 1 = 0.
    const resolution = buildKeyResolution([
      lv(1, [{ key: 'atk_up', value: 0 }]),
      lv(2, [{ key: 'atk_up', value: 0 }]),
      lv(3, [{ key: 'atk_up', value: 26 }]),
      lv(9, [{ key: 'atk_up', value: 79 }]),
    ]);
    expect(resolution.get('atk_up')).toBe('FLAT_ATTACK');
  });

  it('handles all-zero ambiguous keys as percentage (safe fallback)', () => {
    // Degenerate case: all levels have zero. No way to infer — default to the
    // percentage bucket, matching the parser's prior behavior.
    const resolution = buildKeyResolution([
      lv(1, [{ key: 'atk_up', value: 0 }]),
      lv(9, [{ key: 'atk_up', value: 0 }]),
    ]);
    expect(resolution.get('atk_up')).toBe('ATTACK_BONUS');
  });

  it('resolves unambiguous keys via the static BLACKBOARD_KEY_TO_STAT table', () => {
    const resolution = buildKeyResolution([
      lv(1, [
        { key: 'str', value: 20 },
        { key: 'agi', value: 15 },
        { key: 'mainattr', value: 10 },
        { key: 'crirate', value: 0.05 },
        { key: 'heal_up', value: 0.1 },
      ]),
    ]);
    expect(resolution.get('str')).toBe('STRENGTH');
    expect(resolution.get('agi')).toBe('AGILITY');
    expect(resolution.get('mainattr')).toBe('MAIN_ATTRIBUTE');
    expect(resolution.get('crirate')).toBe('CRITICAL_RATE');
    expect(resolution.get('heal_up')).toBe('TREATMENT_BONUS');
  });

  it('skips non-stat metadata keys (duration, max_stack, …)', () => {
    const resolution = buildKeyResolution([
      lv(1, [
        { key: 'atk_up', value: 79 },
        { key: 'duration', value: 10 },
        { key: 'max_stack', value: 3 },
        { key: 'cd', value: 20 },
      ]),
    ]);
    expect(resolution.get('atk_up')).toBe('FLAT_ATTACK');
    expect(resolution.has('duration')).toBe(false);
    expect(resolution.has('max_stack')).toBe(false);
    expect(resolution.has('cd')).toBe(false);
  });

  it('classifies ATK and HP independently within the same skill', () => {
    // A skill that grants both flat ATK and percent HP → must resolve each
    // ambiguous key on its own value range.
    const resolution = buildKeyResolution([
      lv(1, [
        { key: 'atk_up', value: 10 },
        { key: 'hp_up', value: 0.05 },
      ]),
      lv(9, [
        { key: 'atk_up', value: 79 },
        { key: 'hp_up', value: 0.25 },
      ]),
    ]);
    expect(resolution.get('atk_up')).toBe('FLAT_ATTACK');
    expect(resolution.get('hp_up')).toBe('HP_BONUS');
  });

  it('unknown blackboard keys pass through unchanged', () => {
    const resolution = buildKeyResolution([
      lv(1, [{ key: 'some_exotic_key_not_in_map', value: 0.5 }]),
    ]);
    expect(resolution.get('some_exotic_key_not_in_map')).toBe('some_exotic_key_not_in_map');
  });
});
