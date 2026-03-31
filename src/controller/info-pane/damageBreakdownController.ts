import type { DamageParams, DamageSubComponents, StatusDamageParams } from '../../model/calculation/damageFormulas';
import { getElementDamageBonusStat } from '../../model/calculation/damageFormulas';
import type { DamageTableRow } from '../calculation/damageTableBuilder';
import { getCritMultiplier, getExpectedCritMultiplier } from '../../model/calculation/damageFormulas';
import { CritMode, ElementType, StatType } from '../../consts/enums';

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


function buildSourceSubEntries(
  sub: DamageSubComponents,
  statType: StatType,
): MultiplierEntry[] | undefined {
  const sources = sub.statSources?.[statType];
  if (!sources || sources.length === 0) return undefined;
  return sources
    .filter((s) => Math.abs(s.value) > 0.00001)
    .map((s) => makeSubEntry(s.source, s.value, ''));
}

/** Order: Physical, Arts, Heat, Cryo, Nature, Electric */
function buildDamageBonusSubEntries(sub: DamageSubComponents): MultiplierEntry[] {
  const entries: MultiplierEntry[] = [];
  // Physical
  const physEntry = makeElementEntry(sub, ElementType.PHYSICAL);
  entries.push(physEntry);
  // Arts DMG% — between Physical and Heat
  const artsEntry = makeSubEntry('Arts DMG%', sub.artsDmgBonus, 'Arts damage bonus');
  artsEntry.subEntries = buildSourceSubEntries(sub, StatType.ARTS_DAMAGE_BONUS);
  entries.push(artsEntry);
  // Heat, Cryo, Nature, Electric
  for (const el of [ElementType.HEAT, ElementType.CRYO, ElementType.NATURE, ElementType.ELECTRIC]) {
    entries.push(makeElementEntry(sub, el));
  }
  return entries;
}

function makeElementEntry(sub: DamageSubComponents, el: ElementType): MultiplierEntry {
  const value = sub.allElementDmgBonuses[el] ?? 0;
  const isActive = el === sub.element || (el === ElementType.PHYSICAL && sub.element === ElementType.NONE);
  const label = ELEMENT_DMG_LABELS[el];
  const entry = makeSubEntry(label, value, isActive ? 'Active element bonus' : 'Does not apply to this hit');
  if (isActive) {
    entry.subEntries = buildSourceSubEntries(sub, getElementDamageBonusStat(el));
  }
  return entry;
}

const BREAKDOWN_ELEMENTS: { el: ElementType; label: string }[] = [
  { el: ElementType.PHYSICAL, label: 'Physical' },
  { el: ElementType.ARTS, label: 'Arts' },
  { el: ElementType.HEAT, label: 'Heat' },
  { el: ElementType.CRYO, label: 'Cryo' },
  { el: ElementType.NATURE, label: 'Nature' },
  { el: ElementType.ELECTRIC, label: 'Electric' },
];

/** Build per-element sub-entries from a per-element source map. Active element is highlighted. */
function buildPerElementSubEntries(
  allSources: Partial<Record<ElementType, import('../../model/calculation/damageFormulas').MultiplierSource[]>>,
  activeElement: ElementType,
): MultiplierEntry[] {
  return BREAKDOWN_ELEMENTS.map(({ el, label }) => {
    const sources = allSources[el] ?? [];
    const total = sources.reduce((sum: number, s) => sum + s.value, 0);
    const isActive = el === activeElement || (el === ElementType.PHYSICAL && activeElement === ElementType.NONE);
    const entry = makeSubEntry(
      label,
      total,
      isActive ? 'Active element' : 'Does not apply to this hit',
    );
    if (sources.length > 0) {
      entry.subEntries = sources.map((s) => makeSubEntry(s.label, s.value, ''));
    }
    return entry;
  });
}

function buildCritSubEntries(sub: DamageSubComponents): MultiplierEntry[] {
  const { critRate, critDamage, critMode, isCrit, critSnapshot } = sub;

  // EXPECTED mode with crit model: show sources with probabilities
  if (critSnapshot && critMode === CritMode.EXPECTED) {
    const entries: MultiplierEntry[] = [];

    // E(T) effective crit rate
    entries.push(makeSubEntry(
      'Expected Crit Rate',
      critSnapshot.expectedCritRate,
      `Effective E(T) at this frame`,
    ));

    // Crit DMG
    entries.push(makeSubEntry('Crit DMG', critDamage, 'Bonus damage on crit'));

    // Sources breakdown
    for (const source of critSnapshot.critSources) {
      const entry = makeSubEntry(
        source.label,
        source.value,
        source.probability != null
          ? `${formatPercent(source.probability)} chance active`
          : 'Unconditional',
      );
      entries.push(entry);
    }

    // Status uptimes
    critSnapshot.statusDistributions.forEach((dist, statusId) => {
      const uptime = 1 - dist[0];
      if (uptime > 1e-6) {
        entries.push(makeSubEntry(
          `${statusId} uptime`,
          uptime,
          `P(stacks > 0)`,
        ));
      }
    });

    return entries;
  }

  // Non-model modes: show all 4 static calculations
  const neverValue = getCritMultiplier(false, critDamage);
  const alwaysValue = getCritMultiplier(true, critDamage);
  const expectedValue = getExpectedCritMultiplier(critRate, critDamage);
  const simValue = getCritMultiplier(!!isCrit, critDamage);

  const modes: { label: string; mode: CritMode; value: number; source: string }[] = [
    { label: 'Never Crit', mode: CritMode.NEVER, value: neverValue, source: 'No crit contribution' },
    { label: 'Always Crit', mode: CritMode.ALWAYS, value: alwaysValue, source: `1 + ${formatPercent(critDamage)} Crit DMG` },
    { label: 'Expected', mode: CritMode.EXPECTED, value: expectedValue, source: `1 + ${formatPercent(critRate)} Rate x ${formatPercent(critDamage)} DMG` },
    { label: 'Random', mode: CritMode.RANDOM, value: simValue, source: isCrit ? 'This frame crits' : 'This frame does not crit' },
    { label: 'Manual', mode: CritMode.MANUAL, value: simValue, source: isCrit ? 'Pinned crit' : 'Pinned no crit' },
  ];

  return modes.map(({ label, mode, value, source }) => {
    const entry = makeSubEntry(label, value, mode === critMode ? 'Active' : source, 'multiplier');
    if (mode === critMode) entry.cssClass = 'dmg-breakdown-active';
    return entry;
  });
}

export function buildMultiplierEntries(params: DamageParams, foldedFrames?: DamageTableRow[]): MultiplierEntry[] {
  const sub = params.sub;
  const isFolded = foldedFrames && foldedFrames.length > 1;

  // Build frame children for segment multiplier in folded mode
  const frameChildren: MultiplierEntry[] | undefined = isFolded
    ? foldedFrames.map((fr, i) => makeSubEntry(
      `Frame ${i + 1}`,
      fr.params?.baseMultiplier ?? 0,
      fr.damage != null ? `${Math.round(fr.damage).toLocaleString()} dmg` : '',
      'percent',
    ))
    : undefined;

  const raw: { label: string; value: number; format: MultiplierEntry['format']; source: string; subEntries?: MultiplierEntry[] }[] = [
    {
      label: 'Attack',
      value: params.attack,
      format: 'flat',
      source: '(Operator ATK + Weapon ATK) x (1 + ATK%) + flat bonuses',
      subEntries: sub ? [
        makeSubEntry('Operator Base ATK', sub.operatorBaseAttack, 'From operator level', 'flat'),
        makeSubEntry('Weapon Base ATK', sub.weaponBaseAttack, 'From weapon level', 'flat'),
        { ...makeSubEntry('ATK%', sub.atkBonusPct, 'Sum of all ATK% sources'), subEntries: buildSourceSubEntries(sub, StatType.ATTACK_BONUS) },
        ...(sub.flatAtkBonuses > 0 ? [makeSubEntry('Flat ATK Bonus', sub.flatAtkBonuses, 'Gear effects, consumables, tacticals', 'flat')] : []),
      ] : undefined,
    },
    ...(isFolded && sub?.segmentMultiplier != null ? [{
      label: 'Skill Segment Multiplier',
      value: sub.segmentMultiplier,
      format: 'percent' as const,
      source: sub.segmentFrameCount != null
        ? `Total segment ATK% across ${sub.segmentFrameCount} frames`
        : 'Total segment ATK%',
      subEntries: frameChildren,
    }] : []),
    ...(!isFolded ? [{
      label: 'Skill Frame Multiplier',
      value: params.baseMultiplier,
      format: 'percent' as const,
      source: sub?.isPerTickMultiplier
        ? 'Per-frame ATK% (ramping: base + increment × frame)'
        : sub?.segmentFrameCount != null
          ? `Per-frame ATK% (segment ÷ ${sub.segmentFrameCount} frames)`
          : 'Skill scaling (% of ATK)',
    }] : []),
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
        ...buildDamageBonusSubEntries(sub),
        { ...makeSubEntry('Skill Type DMG%', sub.skillTypeDmgBonus, 'Basic/Battle/Combo/Ultimate DMG bonus'), subEntries: sub.skillTypeDmgBonusStat ? buildSourceSubEntries(sub, sub.skillTypeDmgBonusStat) : undefined },
        { ...makeSubEntry('Skill DMG%', sub.skillDmgBonus, 'Generic skill damage bonus'), subEntries: buildSourceSubEntries(sub, StatType.SKILL_DAMAGE_BONUS) },
        ...(sub.staggerDmgBonus > 0 ? [makeSubEntry('Stagger DMG%', sub.staggerDmgBonus, 'DMG Bonus vs. Staggered')] : []),
      ] : undefined,
    },
    {
      label: 'Crit',
      value: params.critMultiplier,
      format: 'multiplier',
      source: params.critMultiplier > 1.001 ? 'Critical hit' : 'No crit',
      subEntries: sub ? buildCritSubEntries(sub) : undefined,
    },
    {
      label: 'Amp',
      value: params.ampMultiplier,
      format: 'multiplier',
      source: params.ampMultiplier > 1.001 ? 'Amp active' : 'No Amp',
      subEntries: sub?.allAmpSources ? buildPerElementSubEntries(sub.allAmpSources, sub.element) : undefined,
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
      subEntries: sub?.allSusceptibilitySources ? buildPerElementSubEntries(sub.allSusceptibilitySources, sub.element) : undefined,
    },
    {
      label: 'Fragility',
      value: params.fragilityMultiplier,
      format: 'multiplier',
      source: params.fragilityMultiplier > 1.001 ? 'Increased DMG Taken active' : 'No fragility debuff',
      subEntries: sub?.allFragilitySources ? buildPerElementSubEntries(sub.allFragilitySources, sub.element) : undefined,
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
