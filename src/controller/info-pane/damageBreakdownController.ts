import type { DamageParams, StatusDamageParams } from '../../model/calculation/damageFormulas';
import { ElementType, StatType } from '../../consts/enums';

/** Multiplier display entry for the breakdown table. */
export interface MultiplierEntry {
  label: string;
  value: number;
  /** How to format: 'flat' for attack, 'multiplier' for xN.NN, 'percent' for N.N% */
  format: 'flat' | 'multiplier' | 'percent';
  /** Short description of where this value comes from. */
  source: string;
  formattedValue: string;
  cssClass: string;
  /** Sub-component entries displayed indented under this entry. */
  subEntries?: MultiplierEntry[];
}

function formatValue(value: number, format: MultiplierEntry['format']): string {
  if (format === 'flat') {
    const rounded = Math.round(value);
    return rounded >= 1_000_000 ? rounded.toLocaleString() : String(rounded);
  }
  if (format === 'percent') return `${(value * 100).toFixed(1)}%`;
  return `x${value.toFixed(4)}`;
}

function classifyValue(value: number, format: MultiplierEntry['format']): string {
  if (format === 'flat') return '';
  if (value > 1.001) return 'dmg-breakdown-positive';
  if (value < 0.999) return 'dmg-breakdown-negative';
  return 'dmg-breakdown-neutral';
}

function classifyBonus(value: number): string {
  if (value > 0.0001) return 'dmg-breakdown-positive';
  if (value < -0.0001) return 'dmg-breakdown-negative';
  return 'dmg-breakdown-neutral';
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function makeSubEntry(label: string, value: number, source: string, format: 'percent' | 'multiplier' | 'flat' = 'percent'): MultiplierEntry {
  const formattedValue = format === 'percent' ? formatPercent(value) : formatValue(value, format);
  return {
    label,
    value,
    format,
    source,
    formattedValue,
    cssClass: format === 'percent' ? classifyBonus(value) : classifyValue(value, format),
  };
}

const STAT_LABELS: Partial<Record<StatType, string>> = {
  [StatType.STRENGTH]: 'STR',
  [StatType.AGILITY]: 'AGI',
  [StatType.INTELLECT]: 'INT',
  [StatType.WILL]: 'WIL',
};

const ELEMENT_DMG_LABELS: Record<ElementType, string> = {
  [ElementType.NONE]: 'Physical DMG%',
  [ElementType.PHYSICAL]: 'Physical DMG%',
  [ElementType.HEAT]: 'Heat DMG%',
  [ElementType.CRYO]: 'Cryo DMG%',
  [ElementType.NATURE]: 'Nature DMG%',
  [ElementType.ELECTRIC]: 'Electric DMG%',
  [ElementType.ARTS]: 'Arts DMG%',
};

/** The display elements (no NONE — Physical covers it). */
const DISPLAY_ELEMENTS: ElementType[] = [
  ElementType.PHYSICAL,
  ElementType.HEAT,
  ElementType.CRYO,
  ElementType.NATURE,
  ElementType.ELECTRIC,
];

function buildElementDmgSubEntries(sub: import('../../model/calculation/damageFormulas').DamageSubComponents): MultiplierEntry[] {
  return DISPLAY_ELEMENTS.map((el) => {
    const value = sub.allElementDmgBonuses[el] ?? 0;
    const isActive = el === sub.element || (el === ElementType.PHYSICAL && sub.element === ElementType.NONE);
    const label = isActive
      ? ELEMENT_DMG_LABELS[el]
      : `${ELEMENT_DMG_LABELS[el]} (n/a)`;
    return makeSubEntry(label, value, isActive ? 'Active element bonus' : 'Does not apply to this hit');
  });
}

export function buildMultiplierEntries(params: DamageParams): MultiplierEntry[] {
  const sub = params.sub;

  const raw: { label: string; value: number; format: MultiplierEntry['format']; source: string; subEntries?: MultiplierEntry[] }[] = [
    {
      label: 'Attack',
      value: params.attack,
      format: 'flat',
      source: '(Operator ATK + Weapon ATK) x (1 + ATK%) + flat bonuses',
      subEntries: sub ? [
        makeSubEntry('Operator Base ATK', sub.operatorBaseAttack, 'From operator level', 'flat'),
        makeSubEntry('Weapon Base ATK', sub.weaponBaseAttack, 'From weapon level', 'flat'),
        makeSubEntry('ATK%', sub.atkBonusPct, 'Sum of all ATK% sources'),
        ...(sub.flatAtkBonuses > 0 ? [makeSubEntry('Flat ATK Bonus', sub.flatAtkBonuses, 'Gear effects, consumables, tacticals', 'flat')] : []),
      ] : undefined,
    },
    ...(sub?.segmentMultiplier != null ? [{
      label: 'Skill Segment Multiplier',
      value: sub.segmentMultiplier,
      format: 'percent' as const,
      source: sub.segmentFrameCount != null
        ? `Total segment ATK% spread across ${sub.segmentFrameCount} frames`
        : 'Total segment ATK%',
    }] : []),
    {
      label: sub?.isPerTickMultiplier ? 'Skill Tick Multiplier' : 'Skill Frame Multiplier',
      value: params.baseMultiplier,
      format: 'percent',
      source: sub?.isPerTickMultiplier
        ? 'Per-tick ATK% (ramping: base + increment × tick)'
        : sub?.segmentFrameCount != null
          ? `Per-frame ATK% (segment ÷ ${sub.segmentFrameCount} frames)`
          : 'Skill scaling (% of ATK)',
    },
    {
      label: 'Attribute Bonus',
      value: params.attributeBonus,
      format: 'multiplier',
      source: '1 + 0.005 x Main Attr + 0.002 x Secondary Attr',
      subEntries: sub ? [
        makeSubEntry(
          `${STAT_LABELS[sub.mainAttrType] ?? sub.mainAttrType} (Main)`,
          sub.mainAttrValue,
          `+${(sub.mainAttrValue * 0.005 * 100).toFixed(1)}% (x0.005)`,
          'flat',
        ),
        makeSubEntry(
          `${STAT_LABELS[sub.secondaryAttrType] ?? sub.secondaryAttrType} (Secondary)`,
          sub.secondaryAttrValue,
          `+${(sub.secondaryAttrValue * 0.002 * 100).toFixed(1)}% (x0.002)`,
          'flat',
        ),
      ] : undefined,
    },
    {
      label: 'Damage Bonus',
      value: params.multiplierGroup,
      format: 'multiplier',
      source: '1 + Element DMG% + Skill Type DMG% + Skill DMG% + Arts DMG%',
      subEntries: sub ? [
        ...buildElementDmgSubEntries(sub),
        makeSubEntry('Skill Type DMG%', sub.skillTypeDmgBonus, 'Basic/Battle/Combo/Ultimate DMG bonus'),
        makeSubEntry('Skill DMG%', sub.skillDmgBonus, 'Generic skill damage bonus'),
        makeSubEntry('Arts DMG%', sub.artsDmgBonus, 'Arts damage bonus'),
        ...(sub.staggerDmgBonus > 0 ? [makeSubEntry('Stagger DMG%', sub.staggerDmgBonus, 'DMG Bonus vs. Staggered')] : []),
        ...(sub.talentDmgDealBonus > 0 ? [makeSubEntry('Talent DMG%', sub.talentDmgDealBonus, 'Talent/potential conditional DMG bonus')] : []),
      ] : undefined,
    },
    {
      label: 'Arts Amp',
      value: params.ampMultiplier,
      format: 'multiplier',
      source: params.ampMultiplier > 1.001 ? 'Arts Amp active' : 'No Arts Amp',
      subEntries: sub && sub.ampSources.length > 0 ? sub.ampSources.map((s) =>
        makeSubEntry(s.label, s.value, 'Amp bonus source'),
      ) : undefined,
    },
    {
      label: 'Stagger',
      value: params.staggerMultiplier,
      format: 'multiplier',
      source: params.staggerMultiplier > 1.001 ? 'Enemy staggered (x1.3)' : 'Enemy not staggered',
    },
    {
      label: 'Finisher',
      value: params.finisherMultiplier,
      format: 'multiplier',
      source: params.finisherMultiplier > 1.001 ? 'Final strike bonus' : 'Not a final strike',
    },
    {
      label: 'Link',
      value: params.linkMultiplier,
      format: 'multiplier',
      source: params.linkMultiplier > 1.001 ? 'Link attack active' : 'No link buff',
    },
    {
      label: 'Weaken',
      value: params.weakenMultiplier,
      format: 'multiplier',
      source: params.weakenMultiplier < 0.999 ? 'Enemy weakened' : 'No weaken debuff',
      subEntries: sub && sub.weakenEffects.length > 0 ? sub.weakenEffects.map((eff, i) =>
        makeSubEntry(`Weaken #${i + 1}`, eff, `Reduces DMG by ${formatPercent(eff)}`),
      ) : undefined,
    },
    {
      label: 'Susceptibility',
      value: params.susceptibilityMultiplier,
      format: 'multiplier',
      source: params.susceptibilityMultiplier > 1.001 ? 'Element susceptibility active' : 'No susceptibility',
      subEntries: sub && sub.susceptibilitySources.length > 0 ? sub.susceptibilitySources.map((s) =>
        makeSubEntry(s.label, s.value, 'Susceptibility source'),
      ) : undefined,
    },
    {
      label: 'Fragility',
      value: params.fragilityMultiplier,
      format: 'multiplier',
      source: params.fragilityMultiplier > 1.001 ? 'Increased DMG Taken active' : 'No fragility debuff',
      subEntries: sub && sub.fragilitySources.length > 0 ? sub.fragilitySources.map((s) =>
        makeSubEntry(s.label, s.value, 'Fragility source'),
      ) : undefined,
    },
    {
      label: 'DMG Reduction',
      value: params.dmgReductionMultiplier,
      format: 'multiplier',
      source: params.dmgReductionMultiplier < 0.999 ? 'Enemy has DMG reduction' : 'No DMG reduction',
      subEntries: sub && sub.dmgReductionEffects.length > 0 ? sub.dmgReductionEffects.map((eff, i) =>
        makeSubEntry(`DMG Reduction #${i + 1}`, eff, `Reduces DMG by ${formatPercent(eff)}`),
      ) : undefined,
    },
    {
      label: 'Protection',
      value: params.protectionMultiplier,
      format: 'multiplier',
      source: params.protectionMultiplier < 0.999 ? 'Enemy has protection' : 'No protection',
      subEntries: sub && sub.protectionEffects.length > 0 ? sub.protectionEffects.map((eff, i) =>
        makeSubEntry(`Protection #${i + 1}`, eff, `Reduces DMG by ${formatPercent(eff)}`),
      ) : undefined,
    },
    {
      label: 'Defense',
      value: params.defenseMultiplier,
      format: 'multiplier',
      source: `100 / (DEF + 100)`,
    },
    {
      label: 'Resistance',
      value: params.resistanceMultiplier,
      format: 'multiplier',
      source: params.resistanceMultiplier < 0.999 ? 'Enemy resists this element'
        : params.resistanceMultiplier > 1.001 ? 'Enemy weak to this element'
        : 'No elemental resistance',
      subEntries: sub && (sub.corrosionReduction > 0 || sub.ignoredResistance > 0) ? [
        makeSubEntry('Base Resistance', sub.baseResistance, 'Enemy elemental resistance', 'multiplier'),
        ...(sub.corrosionReduction > 0 ? [makeSubEntry('Corrosion', sub.corrosionReduction, 'Resistance reduction from Corrosion', 'flat')] : []),
        ...(sub.ignoredResistance > 0 ? [makeSubEntry('Ignored Resistance', sub.ignoredResistance, 'Resistance ignored (Scorching Heart, etc.)', 'flat')] : []),
      ] : undefined,
    },
    ...((params.specialMultiplier ?? 1) !== 1 ? [{
      label: 'Special',
      value: params.specialMultiplier!,
      format: 'multiplier' as const,
      source: 'Operator talent conditional bonus',
      subEntries: sub && sub.specialSources.length > 0 ? sub.specialSources.map((s) =>
        makeSubEntry(s.label, s.value, 'Talent conditional', 'multiplier'),
      ) : undefined,
    }] : []),
  ];

  return raw.map((e) => ({
    ...e,
    formattedValue: formatValue(e.value, e.format),
    cssClass: classifyValue(e.value, e.format),
  }));
}

/**
 * Build multiplier entries for status/reaction damage breakdown.
 * Uses the status damage formula (no crit, attribute bonus, damage bonus group, etc.)
 */
export function buildStatusMultiplierEntries(params: StatusDamageParams): MultiplierEntry[] {
  const raw: { label: string; value: number; format: MultiplierEntry['format']; source: string }[] = [
    {
      label: 'Attack',
      value: params.attack,
      format: 'flat',
      source: 'Triggering operator ATK',
    },
    {
      label: 'Status Multiplier',
      value: params.statusBaseMultiplier,
      format: 'percent',
      source: 'Reaction base damage (% of ATK)',
    },
    {
      label: 'Arts Intensity',
      value: params.artsIntensityMultiplier,
      format: 'multiplier',
      source: '1 + Arts Intensity / 100',
    },
    {
      label: 'Hidden Multiplier',
      value: params.hiddenMultiplier,
      format: 'multiplier',
      source: '1 + (Operator Level - 119) / 6',
    },
    {
      label: 'Defense',
      value: params.defenseMultiplier,
      format: 'multiplier',
      source: '100 / (DEF + 100)',
    },
    {
      label: 'Resistance',
      value: params.resistanceMultiplier,
      format: 'multiplier',
      source: params.resistanceMultiplier < 0.999 ? 'Enemy resists this element'
        : params.resistanceMultiplier > 1.001 ? 'Enemy weak to this element'
        : 'No elemental resistance',
    },
    {
      label: 'Susceptibility',
      value: params.susceptibilityMultiplier,
      format: 'multiplier',
      source: params.susceptibilityMultiplier > 1.001 ? 'Element susceptibility active' : 'No susceptibility',
    },
    {
      label: 'Weaken',
      value: params.weakenMultiplier,
      format: 'multiplier',
      source: params.weakenMultiplier < 0.999 ? 'Enemy weakened' : 'No weaken debuff',
    },
    {
      label: 'Fragility',
      value: params.fragilityMultiplier,
      format: 'multiplier',
      source: params.fragilityMultiplier > 1.001 ? 'Increased DMG Taken active' : 'No fragility debuff',
    },
    {
      label: 'DMG Reduction',
      value: params.dmgReductionMultiplier,
      format: 'multiplier',
      source: params.dmgReductionMultiplier < 0.999 ? 'Enemy has DMG reduction' : 'No DMG reduction',
    },
  ];

  return raw.map((e) => ({
    ...e,
    formattedValue: formatValue(e.value, e.format),
    cssClass: classifyValue(e.value, e.format),
  }));
}
