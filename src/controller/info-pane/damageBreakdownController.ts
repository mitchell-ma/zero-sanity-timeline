import type { DamageParams, DamageSubComponents, StatusDamageParams } from '../../model/calculation/damageFormulas';
import { getElementDamageBonusStat } from '../../model/calculation/damageFormulas';
import type { DamageTableRow } from '../calculation/damageTableBuilder';
import { getCritMultiplier, getExpectedCritMultiplier } from '../../model/calculation/damageFormulas';
import { CritMode, ElementType, NumberFormatType, StatType } from '../../consts/enums';
import type { StatusStatContribution } from '../calculation/critExpectationModel';

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

/** Module-level formatting state for the current breakdown build. Set by entry functions. */
let _dp = 1;
let _decimal = false;

function formatValue(value: number, format: MultiplierEntry['format']): string {
  if (format === 'flat') {
    const rounded = Math.round(value);
    return rounded >= 1_000_000 ? rounded.toLocaleString() : String(rounded);
  }
  if (format === 'percent') return formatPercent(value);
  return `x${value.toFixed(_dp)}`;
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
  if (_decimal) return value.toFixed(_dp);
  return `${(value * 100).toFixed(_dp)}%`;
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


/** Build sub-branch entries for a runtime status contribution (stacks, per-stack, uptime). */
function buildContributionSubEntries(c: StatusStatContribution, critMode: CritMode): MultiplierEntry[] {
  const valueFormat: 'flat' | 'percent' = FLAT_STAT_TYPES.has(c.stat) ? 'flat' : 'percent';
  const isExpected = critMode === CritMode.EXPECTED;

  if (c.threshold) {
    const entries = [
      makeSubEntry(`Value (${c.threshold.atStacks} stacks)`, c.threshold.probability > 0 ? c.total / c.threshold.probability : 0, '', valueFormat),
    ];
    if (isExpected) entries.push(makeSubEntry('Uptime', c.threshold.probability, ''));
    return entries;
  }
  const stacksEntry: MultiplierEntry = {
    label: 'Stacks',
    value: c.expectedStacks,
    format: 'flat',
    source: '',
    formattedValue: c.expectedStacks.toFixed(_dp),
    cssClass: '',
  };
  const entries = [stacksEntry, makeSubEntry('Per Stack', c.valuePerStack, '', valueFormat)];
  return entries;
}

/** Stat types that are flat integer values (not percentages). */
const FLAT_STAT_TYPES: ReadonlySet<StatType> = new Set([
  StatType.STRENGTH, StatType.AGILITY, StatType.INTELLECT, StatType.WILL,
  StatType.BASE_ATTACK, StatType.BASE_HP, StatType.BASE_DEFENSE, StatType.FLAT_HP,
  StatType.ARTS_INTENSITY,
]);

function buildSourceSubEntries(
  sub: DamageSubComponents,
  statType: StatType,
): MultiplierEntry[] | undefined {
  const sources = sub.statSources?.[statType];
  if (!sources || sources.length === 0) return undefined;

  const format: 'flat' | 'percent' = FLAT_STAT_TYPES.has(statType) ? 'flat' : 'percent';
  const contributions = sub.statContributions;

  // Consolidate sources with the same label (e.g. 10 crit stack events each
  // contributing 0.03 → one entry "Cryoblasting Pistolier (Crit) ×10: 0.30").
  const filtered = sources.filter((s) => Math.abs(s.value) > 0.00001);
  const grouped = new Map<string, { total: number; count: number; contributionIndex?: number; subSources?: { source: string; value: number }[] }>();
  const order: string[] = [];
  for (const s of filtered) {
    const existing = grouped.get(s.source);
    if (existing) {
      existing.total += s.value;
      existing.count++;
    } else {
      grouped.set(s.source, { total: s.value, count: 1, contributionIndex: s.contributionIndex, subSources: s.subSources });
      order.push(s.source);
    }
  }

  return order.map((label) => {
    const g = grouped.get(label)!;
    const displayLabel = g.count > 1 ? `${label} ×${g.count}` : label;
    const entry = makeSubEntry(displayLabel, g.total, '', format);
    if (g.contributionIndex != null && contributions?.[g.contributionIndex]) {
      entry.subEntries = buildContributionSubEntries(contributions[g.contributionIndex], sub.critMode ?? CritMode.EXPECTED);
    } else if (g.subSources?.length) {
      entry.subEntries = g.subSources.map(ss => makeSubEntry(ss.source, ss.value, '', format));
    }
    return entry;
  });
}

/** Order: Physical, Arts, Heat, Cryo, Nature, Electric */
function buildDamageBonusSubEntries(sub: DamageSubComponents): MultiplierEntry[] {
  const entries: MultiplierEntry[] = [];
  // Physical
  const physEntry = makeElementEntry(sub, ElementType.PHYSICAL);
  entries.push(physEntry);
  // Arts DMG% — applies only to arts-element hits (Heat, Cryo, Nature, Electric)
  const isArtsActive = sub.element !== ElementType.PHYSICAL && sub.element !== ElementType.NONE;
  const artsEntry = makeSubEntry('Arts DMG%', sub.artsDmgBonus, isArtsActive ? 'Arts damage bonus' : 'Does not apply to this hit');
  if (isArtsActive) {
    artsEntry.subEntries = buildSourceSubEntries(sub, StatType.ARTS_DAMAGE_BONUS);
  } else {
    artsEntry.cssClass = 'dmg-breakdown-neutral';
  }
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
  } else {
    entry.cssClass = 'dmg-breakdown-neutral';
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
    const isArtsElement = activeElement !== ElementType.PHYSICAL && activeElement !== ElementType.NONE;
    const isActive = el === activeElement
      || (el === ElementType.PHYSICAL && activeElement === ElementType.NONE)
      || (el === ElementType.ARTS && isArtsElement);
    const entry = makeSubEntry(
      label,
      total,
      isActive ? 'Active element' : 'Does not apply to this hit',
    );
    // Surface per-source attribution for every element with deltas, regardless
    // of whether it applies to the active hit — users want to see what FOCUS
    // is contributing to ELECTRIC even while a HEAT frame is selected. Inactive
    // elements grey out the entire subtree (entry + sub-entries + sub-sources)
    // so the breakdown visually communicates "present but not contributing".
    if (sources.length > 0) {
      entry.subEntries = sources.map((s) => {
        const sub = makeSubEntry(s.label, s.value, '');
        if (s.subSources?.length) {
          sub.subEntries = s.subSources.map((ss) => makeSubEntry(ss.label, ss.value, ''));
        }
        if (!isActive) {
          sub.cssClass = 'dmg-breakdown-neutral';
          sub.subEntries?.forEach(ss => { ss.cssClass = 'dmg-breakdown-neutral'; });
        }
        return sub;
      });
    }
    if (!isActive) {
      entry.cssClass = 'dmg-breakdown-neutral';
    }
    return entry;
  });
}

function buildCritRateSourceEntries(sub: DamageSubComponents): MultiplierEntry[] {
  const critRateEntry = makeSubEntry('Crit Rate', sub.critRate, 'Sum of all crit rate sources');
  critRateEntry.subEntries = buildSourceSubEntries(sub, StatType.CRITICAL_RATE);
  const critDmgEntry = makeSubEntry('Crit DMG', sub.critDamage, 'Sum of all crit damage sources');
  critDmgEntry.subEntries = buildSourceSubEntries(sub, StatType.CRITICAL_DAMAGE);
  return [critRateEntry, critDmgEntry];
}

function buildCritSubEntries(sub: DamageSubComponents): MultiplierEntry[] {
  const { critRate, critDamage, critMode, isCrit, critSnapshot } = sub;

  // Crit model available: show sources with mode-appropriate values
  if (critSnapshot) {
    const entries: MultiplierEntry[] = [];
    // Expected Crit Rate with static source breakdown as sub-entries
    const critRateEntry = makeSubEntry(
      critMode === CritMode.EXPECTED ? 'Expected Crit Rate' : 'Crit Rate',
      critSnapshot.expectedCritRate,
      critMode === CritMode.EXPECTED ? 'Effective E(T) at this frame' : '',
    );
    const critRateSubs: MultiplierEntry[] = buildSourceSubEntries(sub, StatType.CRITICAL_RATE) ?? [];

    // Conditional crit sources (threshold-gated, e.g. MI Security at 5 stacks)
    // nest under Crit Rate since their contribution adds to the Crit Rate total.
    const isExpectedCrit = critMode === CritMode.EXPECTED;
    for (const source of critSnapshot.critSources) {
      if (source.probability == null) continue;
      const expectedValue = source.value * source.probability;
      const entry = makeSubEntry(source.label, expectedValue, '');
      const stacksLabel = source.thresholdStacks != null
        ? `Value (${source.thresholdStacks} stacks)`
        : 'Value';
      const subEntries = [makeSubEntry(stacksLabel, source.value, '')];
      if (isExpectedCrit) subEntries.push(makeSubEntry('Uptime', source.probability, ''));
      entry.subEntries = subEntries;
      critRateSubs.push(entry);
    }

    critRateEntry.subEntries = critRateSubs;
    entries.push(critRateEntry);

    // Crit DMG
    const critDmgEntry = makeSubEntry('Crit DMG', critDamage, 'Bonus damage on crit');
    critDmgEntry.subEntries = buildSourceSubEntries(sub, StatType.CRITICAL_DAMAGE);
    entries.push(critDmgEntry);

    return entries;
  }

  // Non-model modes: show crit rate/damage sources, then mode calculations
  const sourceEntries = buildCritRateSourceEntries(sub);

  const neverValue = getCritMultiplier(false, critDamage);
  const alwaysValue = getCritMultiplier(true, critDamage);
  const expectedValue = getExpectedCritMultiplier(critRate, critDamage);
  const simValue = getCritMultiplier(!!isCrit, critDamage);

  const modes: { label: string; mode: CritMode; value: number; source: string }[] = [
    { label: 'Never Crit', mode: CritMode.NEVER, value: neverValue, source: 'No crit contribution' },
    { label: 'Always Crit', mode: CritMode.ALWAYS, value: alwaysValue, source: `1 + ${formatPercent(critDamage)} Crit DMG` },
    { label: 'Expected', mode: CritMode.EXPECTED, value: expectedValue, source: `1 + ${formatPercent(critRate)} Rate x ${formatPercent(critDamage)} DMG` },
    { label: 'Manual', mode: CritMode.MANUAL, value: simValue, source: isCrit ? 'Pinned crit' : 'Pinned no crit' },
  ];

  const modeEntries = modes.map(({ label, mode, value, source }) => {
    const entry = makeSubEntry(label, value, mode === critMode ? 'Active' : source, 'multiplier');
    if (mode === critMode) entry.cssClass = 'dmg-breakdown-active';
    return entry;
  });

  return [...sourceEntries, ...modeEntries];
}

export function buildMultiplierEntries(params: DamageParams, foldedFrames?: DamageTableRow[], decimalPlaces?: number, numberFormat?: NumberFormatType): MultiplierEntry[] {
  _dp = decimalPlaces ?? 1;
  _decimal = numberFormat === NumberFormatType.DECIMAL;
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
        {
          ...makeSubEntry(
            `${STAT_LABELS[sub.mainAttrType] ?? sub.mainAttrType} (Main)`,
            sub.mainAttrValue,
            `+${(sub.mainAttrValue * 0.005 * 100).toFixed(_dp)}% (x0.005)`,
            'flat',
          ),
          subEntries: buildSourceSubEntries(sub, sub.mainAttrType),
        },
        {
          ...makeSubEntry(
            `${STAT_LABELS[sub.secondaryAttrType] ?? sub.secondaryAttrType} (Secondary)`,
            sub.secondaryAttrValue,
            `+${(sub.secondaryAttrValue * 0.002 * 100).toFixed(_dp)}% (x0.002)`,
            'flat',
          ),
          subEntries: buildSourceSubEntries(sub, sub.secondaryAttrType),
        },
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
        ...(sub.staggerDmgBonus > 0 ? [{ ...makeSubEntry('Stagger DMG%', sub.staggerDmgBonus, 'DMG Bonus vs. Staggered'), subEntries: buildSourceSubEntries(sub, StatType.STAGGER_DAMAGE_BONUS) }] : []),
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
      label: 'Weakness',
      value: params.weaknessMultiplier,
      format: 'multiplier',
      source: params.weaknessMultiplier < 0.999 ? 'Enemy has weakness debuff' : 'No weakness debuff',
      subEntries: sub && sub.weaknessSources.length > 0
        ? sub.weaknessSources.map((s) => makeSubEntry(s.label, -s.value, `Reduces DMG by ${formatPercent(-s.value)}`))
        : undefined,
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
      subEntries: sub && sub.dmgReductionSources.length > 0
        ? sub.dmgReductionSources.map((s) => makeSubEntry(s.label, s.value, `Reduces DMG by ${formatPercent(s.value)}`))
        : sub && sub.dmgReductionEffects.length > 0
          ? sub.dmgReductionEffects.map((eff, i) => makeSubEntry(`DMG Reduction #${i + 1}`, eff, `Reduces DMG by ${formatPercent(eff)}`))
          : undefined,
    },
    {
      label: 'Protection',
      value: params.protectionMultiplier,
      format: 'multiplier',
      source: params.protectionMultiplier < 0.999 ? 'Enemy has protection' : 'No protection',
      subEntries: sub && sub.protectionSources.length > 0
        ? sub.protectionSources.map((s) => makeSubEntry(s.label, s.value, `Reduces DMG by ${formatPercent(s.value)}`))
        : sub && sub.protectionEffects.length > 0
          ? sub.protectionEffects.map((eff, i) => makeSubEntry(`Protection #${i + 1}`, eff, `Reduces DMG by ${formatPercent(eff)}`))
          : undefined,
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
export function buildStatusMultiplierEntries(params: StatusDamageParams, decimalPlaces?: number, numberFormat?: NumberFormatType): MultiplierEntry[] {
  _dp = decimalPlaces ?? 1;
  _decimal = numberFormat === NumberFormatType.DECIMAL;
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
      label: 'Weakness',
      value: params.weaknessMultiplier,
      format: 'multiplier',
      source: params.weaknessMultiplier < 0.999 ? 'Enemy has weakness debuff' : 'No weakness debuff',
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
