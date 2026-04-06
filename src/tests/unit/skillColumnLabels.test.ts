/**
 * Tests that skill column labels and category mappings use NounType-based keys
 * (BASIC_ATTACK, BATTLE, COMBO, ULTIMATE) after the SkillType→NounType migration.
 *
 * Covers:
 * - SKILL_LABELS in timelineColumnLabels.ts maps all NounType skill keys
 * - resolveSusceptibility matches NounType column IDs for skill level lookup
 * - buildSkillEntries returns results for NounType category keys
 */

import { NounType } from '../../dsl/semantics';
import { SKILL_LABELS } from '../../consts/timelineColumnLabels';
import { resolveSusceptibility } from '../../controller/timeline/processInfliction';
import { ElementType } from '../../consts/enums';
import { buildSkillEntries } from '../../view/custom/OperatorEventEditor';
import { DEFAULT_LOADOUT_PROPERTIES } from '../../view/InformationPane';

// ── SKILL_LABELS mapping ────────────────────────────────────────────────────

describe('SKILL_LABELS (timelineColumnLabels)', () => {
  it('maps NounType.BASIC_ATTACK to a label', () => {
    expect(SKILL_LABELS[NounType.BASIC_ATTACK]).toBeDefined();
    expect(typeof SKILL_LABELS[NounType.BASIC_ATTACK]).toBe('string');
  });

  it('maps NounType.BATTLE to a label', () => {
    expect(SKILL_LABELS[NounType.BATTLE]).toBeDefined();
    expect(typeof SKILL_LABELS[NounType.BATTLE]).toBe('string');
  });

  it('maps NounType.COMBO to a label', () => {
    expect(SKILL_LABELS[NounType.COMBO]).toBeDefined();
    expect(typeof SKILL_LABELS[NounType.COMBO]).toBe('string');
  });

  it('maps NounType.ULTIMATE to a label', () => {
    expect(SKILL_LABELS[NounType.ULTIMATE]).toBeDefined();
    expect(typeof SKILL_LABELS[NounType.ULTIMATE]).toBe('string');
  });

  it('does NOT have old lowercase keys', () => {
    expect(SKILL_LABELS['basic']).toBeUndefined();
    expect(SKILL_LABELS['battle']).toBeUndefined();
    expect(SKILL_LABELS['combo']).toBeUndefined();
    expect(SKILL_LABELS['ultimate']).toBeUndefined();
  });
});

// ── resolveSusceptibility column ID matching ─────────────────────────────────

describe('resolveSusceptibility — NounType column ID matching', () => {
  const heatTable = { [ElementType.HEAT]: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120] };
  const defaultProps = {
    ...DEFAULT_LOADOUT_PROPERTIES,
    skills: { basicAttackLevel: 1, battleSkillLevel: 5, comboSkillLevel: 8, ultimateLevel: 12 },
  };
  const loadoutProps = { 'slot-0': defaultProps };

  it('uses battleSkillLevel for NounType.BATTLE column', () => {
    const result = resolveSusceptibility(heatTable, NounType.BATTLE, 'slot-0', loadoutProps);
    // battleSkillLevel = 5 → index 4 → value 50
    expect(result[ElementType.HEAT]).toBe(50);
  });

  it('uses comboSkillLevel for NounType.COMBO column', () => {
    const result = resolveSusceptibility(heatTable, NounType.COMBO, 'slot-0', loadoutProps);
    // comboSkillLevel = 8 → index 7 → value 80
    expect(result[ElementType.HEAT]).toBe(80);
  });

  it('uses ultimateLevel for NounType.ULTIMATE column', () => {
    const result = resolveSusceptibility(heatTable, NounType.ULTIMATE, 'slot-0', loadoutProps);
    // ultimateLevel = 12 → index 11 → value 120
    expect(result[ElementType.HEAT]).toBe(120);
  });

  it('defaults to battleSkillLevel for NounType.BASIC_ATTACK column', () => {
    const result = resolveSusceptibility(heatTable, NounType.BASIC_ATTACK, 'slot-0', loadoutProps);
    // default case → battleSkillLevel = 5 → index 4 → value 50
    expect(result[ElementType.HEAT]).toBe(50);
  });

  it('does NOT match old lowercase column IDs', () => {
    // Old lowercase 'combo' should fall through to default (battleSkillLevel=5, not comboSkillLevel=8)
    const result = resolveSusceptibility(heatTable, 'combo', 'slot-0', loadoutProps);
    expect(result[ElementType.HEAT]).toBe(50); // default = battleSkillLevel
  });
});

// ── buildSkillEntries NounType category keys ─────────────────────────────────

describe('buildSkillEntries — NounType category keys', () => {
  it('returns entries for NounType.BATTLE (Laevatain)', () => {
    const entries = buildSkillEntries('LAEVATAIN', NounType.BATTLE);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].id).toBeDefined();
  });

  it('returns entries for NounType.BASIC_ATTACK (Laevatain)', () => {
    const entries = buildSkillEntries('LAEVATAIN', NounType.BASIC_ATTACK);
    expect(entries.length).toBeGreaterThan(0);
  });

  it('returns entries for NounType.COMBO (Laevatain)', () => {
    const entries = buildSkillEntries('LAEVATAIN', NounType.COMBO);
    expect(entries.length).toBeGreaterThan(0);
  });

  it('returns entries for NounType.ULTIMATE (Laevatain)', () => {
    const entries = buildSkillEntries('LAEVATAIN', NounType.ULTIMATE);
    expect(entries.length).toBeGreaterThan(0);
  });

  it('returns empty for old lowercase keys', () => {
    expect(buildSkillEntries('LAEVATAIN', 'battle')).toHaveLength(0);
    expect(buildSkillEntries('LAEVATAIN', 'basic')).toHaveLength(0);
    expect(buildSkillEntries('LAEVATAIN', 'combo')).toHaveLength(0);
    expect(buildSkillEntries('LAEVATAIN', 'ultimate')).toHaveLength(0);
  });
});
