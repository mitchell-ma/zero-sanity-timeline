import type { DamageParams, DamageSubComponents, StatusDamageParams } from '../../model/calculation/damageFormulas';
import {
  COMPOUND_SKILL_BASE_STATS,
  ELEMENT_DMG_BONUS_STATS,
  SKILL_TYPE_DMG_BONUS_STATS,
  getCombinedDamageBonusStat,
  getCritMultiplier,
  getExpectedCritMultiplier,
} from '../../model/calculation/damageFormulas';
import type { DamageTableRow } from '../calculation/damageTableBuilder';
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

const COMBINED_STEM_LABELS: Readonly<Record<string, string>> = {
  BASIC_ATTACK: 'Basic ATK',
  BATTLE_SKILL: 'Battle Skill',
  COMBO_SKILL: 'Combo Skill',
  ULTIMATE: 'Ultimate',
  FINAL_STRIKE: 'Final Strike',
};

const COMBINED_ELEMENT_LABELS: Readonly<Record<string, string>> = {
  PHYSICAL: 'Physical', HEAT: 'Heat', CRYO: 'Cryo',
  NATURE: 'Nature', ELECTRIC: 'Electric', ARTS: 'Arts',
};

/** Build a display label for a compound skill×element DMG% stat by splitting
 *  its enum name (e.g. BATTLE_SKILL_ELECTRIC_DAMAGE_BONUS → "Battle Skill ×
 *  Electric DMG%"). Falls back to the raw enum string if the split fails. */
function combinedStatLabel(stat: StatType): string {
  const str = stat as string;
  const suffix = '_DAMAGE_BONUS';
  if (!str.endsWith(suffix)) return str;
  const body = str.slice(0, -suffix.length);
  for (const token of Object.keys(COMBINED_ELEMENT_LABELS)) {
    const suffixToken = `_${token}`;
    if (body.endsWith(suffixToken)) {
      const stem = body.slice(0, -suffixToken.length);
      const stemLabel = COMBINED_STEM_LABELS[stem] ?? stem;
      return `${stemLabel} × ${COMBINED_ELEMENT_LABELS[token]} DMG%`;
    }
  }
  return str;
}


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

const SKILL_TYPE_ROW_LABELS: Readonly<Record<string, string>> = {
  [StatType.BASIC_ATTACK_DAMAGE_BONUS]: 'Basic ATK DMG%',
  [StatType.BATTLE_SKILL_DAMAGE_BONUS]: 'Battle Skill DMG%',
  [StatType.COMBO_SKILL_DAMAGE_BONUS]: 'Combo Skill DMG%',
  [StatType.ULTIMATE_DAMAGE_BONUS]: 'Ultimate DMG%',
  [StatType.FINAL_STRIKE_DAMAGE_BONUS]: 'Final Strike DMG%',
  [StatType.STAGGER_DAMAGE_BONUS]: 'Stagger DMG%',
  [StatType.SKILL_DAMAGE_BONUS]: 'Skill DMG%',
};

function isElementActive(el: ElementType, hitElement: ElementType): boolean {
  if (el === ElementType.PHYSICAL) return hitElement === ElementType.PHYSICAL || hitElement === ElementType.NONE;
  if (el === ElementType.ARTS) return hitElement !== ElementType.PHYSICAL && hitElement !== ElementType.NONE;
  return el === hitElement;
}

function isSkillTypeActive(stat: StatType, sub: DamageSubComponents): boolean {
  if (stat === StatType.SKILL_DAMAGE_BONUS) return true;
  if (stat === StatType.STAGGER_DAMAGE_BONUS) return sub.isStaggered;
  if (stat === StatType.FINAL_STRIKE_DAMAGE_BONUS) return sub.isFinalStrike;
  return sub.skillTypeDmgBonusStat === stat;
}

function makeDmgBonusRow(
  sub: DamageSubComponents,
  stat: StatType,
  label: string,
  active: boolean,
): MultiplierEntry {
  const value = sub.allDmgBonusStats[stat] ?? 0;
  const entry = makeSubEntry(label, value, active ? 'Active on this hit' : 'Does not apply to this hit');
  // Surface per-source attribution regardless of active state — users want to
  // see what's contributing to a stat even when it doesn't apply to this hit.
  // Inactive rows grey the entry + sub-sources for visual consistency with
  // other per-element factors (Amp, Susceptibility, Fragility, Resistance).
  entry.subEntries = buildSourceSubEntries(sub, stat);
  if (!active) {
    entry.cssClass = 'dmg-breakdown-neutral';
    entry.subEntries?.forEach((ss) => {
      ss.cssClass = 'dmg-breakdown-neutral';
      ss.subEntries?.forEach((sss) => { sss.cssClass = 'dmg-breakdown-neutral'; });
    });
  }
  return entry;
}

/** Build the full Damage Bonus breakdown: every possible DMG% row
 *  (element, skill-type, generic skill, and compound skill×element).
 *  Inactive rows are rendered but greyed out. */
function buildDamageBonusSubEntries(sub: DamageSubComponents): MultiplierEntry[] {
  const entries: MultiplierEntry[] = [];

  // Element rows
  for (const [el, stat] of ELEMENT_DMG_BONUS_STATS) {
    entries.push(makeDmgBonusRow(sub, stat, ELEMENT_DMG_LABELS[el], isElementActive(el, sub.element)));
  }

  // Skill-type / situational rows (includes generic Skill DMG%)
  for (const stat of SKILL_TYPE_DMG_BONUS_STATS) {
    entries.push(makeDmgBonusRow(sub, stat, SKILL_TYPE_ROW_LABELS[stat] ?? stat, isSkillTypeActive(stat, sub)));
  }

  // Compound skill × element rows (30 total)
  for (const base of COMPOUND_SKILL_BASE_STATS) {
    const baseActive = isSkillTypeActive(base, sub);
    for (const [el] of ELEMENT_DMG_BONUS_STATS) {
      const stat = getCombinedDamageBonusStat(base, el);
      if (!stat) continue;
      const active = baseActive && isElementActive(el, sub.element);
      entries.push(makeDmgBonusRow(sub, stat, combinedStatLabel(stat), active));
    }
  }

  return entries;
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

/** Elements surfaced as dedicated base-resistance rows. Mirrors the enemy
 *  stat sheet — no ARTS row because AETHER_RESISTANCE is not an exposed stat. */
const RESISTANCE_BASE_ELEMENTS: { el: ElementType; label: string }[] = [
  { el: ElementType.PHYSICAL, label: 'Physical' },
  { el: ElementType.HEAT,     label: 'Heat' },
  { el: ElementType.CRYO,     label: 'Cryo' },
  { el: ElementType.NATURE,   label: 'Nature' },
  { el: ElementType.ELECTRIC, label: 'Electric' },
];

/** Elements that can carry RESISTANCE_IGNORE / RESISTANCE_REDUCTION sources.
 *  ARTS is kept because it's the umbrella stat applied to arts-element hits. */
const RESISTANCE_MODIFIER_ELEMENTS: { el: ElementType; label: string }[] = [
  ...RESISTANCE_BASE_ELEMENTS,
  { el: ElementType.ARTS, label: 'Arts' },
];

/** Whether a modifier source tagged with `el` applies to a hit of `activeElement`.
 *  Matches the damage math in `readResistanceAddback`: per-element stat applies
 *  exactly when `el === activeElement` (with NONE aliasing PHYSICAL), plus the
 *  ARTS umbrella applies to any arts element (HEAT/CRYO/NATURE/ELECTRIC). */
function isResistanceSourceActive(el: ElementType, activeElement: ElementType): boolean {
  const isArtsHit = activeElement === ElementType.HEAT || activeElement === ElementType.CRYO
    || activeElement === ElementType.NATURE || activeElement === ElementType.ELECTRIC;
  if (el === activeElement) return true;
  if (el === ElementType.PHYSICAL && activeElement === ElementType.NONE) return true;
  if (el === ElementType.ARTS && isArtsHit) return true;
  return false;
}

/** Build per-element rows for a RESISTANCE_IGNORE/REDUCTION source map. One row
 *  per element (matches the base-resistance section above); each row's value is
 *  the sum of its element's sources, and individual contributors (e.g. Storm of
 *  Transformation P5) are nested as sub-entries under their element. Inactive
 *  elements are kept visible but greyed. Returns `{ entries, activeTotal }`
 *  where `activeTotal` is the sum over active elements — matches the damage
 *  math (per-element + ARTS umbrella for arts hits). */
function buildResistanceModifierRows(
  sourcesByEl: Partial<Record<ElementType, import('../../model/calculation/damageFormulas').MultiplierSource[]>>,
  activeElement: ElementType,
): { entries: MultiplierEntry[]; activeTotal: number } {
  const entries: MultiplierEntry[] = [];
  let activeTotal = 0;
  for (const { el, label } of RESISTANCE_MODIFIER_ELEMENTS) {
    const sources = sourcesByEl[el] ?? [];
    const total = sources.reduce((sum, s) => sum + s.value, 0);
    const active = isResistanceSourceActive(el, activeElement);
    const row = makeSubEntry(label, total, active ? 'Active element' : 'Does not apply to this hit');
    if (sources.length > 0) {
      row.subEntries = sources.map((s) => {
        const sub = makeSubEntry(s.label, s.value, '');
        if (s.subSources?.length) {
          sub.subEntries = s.subSources.map((ss) => makeSubEntry(ss.label, ss.value, ''));
        }
        return sub;
      });
    }
    if (!active) {
      row.cssClass = 'dmg-breakdown-neutral';
      row.subEntries?.forEach((ss) => {
        ss.cssClass = 'dmg-breakdown-neutral';
        ss.subEntries?.forEach((sss) => { sss.cssClass = 'dmg-breakdown-neutral'; });
      });
    } else {
      activeTotal += total;
    }
    entries.push(row);
  }
  return { entries, activeTotal };
}

/** Build the Resistance branch sub-entries:
 *   1. Per-element base resistance rows (enemy's own stat, one per element).
 *   2. Aggregate "Resistance Ignore" row (operator modifiers).
 *   3. Aggregate "Resistance Reduction" row (enemy debuffs).
 *  The old "Base Resistance" parent row is gone — enemies don't have a single
 *  base-resistance stat, they have five independent per-element values. */
function buildResistanceSubEntries(sub: DamageSubComponents): MultiplierEntry[] {
  const entries: MultiplierEntry[] = [];

  for (const { el, label } of RESISTANCE_BASE_ELEMENTS) {
    const mult = sub.baseResistanceByElement[el] ?? 1;
    const active = isResistanceSourceActive(el, sub.element);
    const entry = makeSubEntry(
      label,
      mult,
      active ? 'Active element' : 'Does not apply to this hit',
      'multiplier',
    );
    if (!active) entry.cssClass = 'dmg-breakdown-neutral';
    entries.push(entry);
  }

  const ignore = buildResistanceModifierRows(sub.allResistanceIgnoreSources, sub.element);
  const ignoreEntry = makeSubEntry(
    'Resistance Ignore',
    ignore.activeTotal,
    'Operator stats ignoring enemy resistance',
  );
  ignoreEntry.subEntries = ignore.entries;
  entries.push(ignoreEntry);

  const reduction = buildResistanceModifierRows(sub.allResistanceReductionSources, sub.element);
  const reductionEntry = makeSubEntry(
    'Resistance Reduction',
    reduction.activeTotal,
    'Enemy debuffs reducing its own resistance',
  );
  reductionEntry.subEntries = reduction.entries;
  entries.push(reductionEntry);

  return entries;
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
      source: '1 + Element DMG% + Skill Type DMG% + Skill DMG% + Arts DMG% + Skill × Element DMG%',
      subEntries: sub ? buildDamageBonusSubEntries(sub) : undefined,
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
      subEntries: sub ? buildResistanceSubEntries(sub) : undefined,
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
