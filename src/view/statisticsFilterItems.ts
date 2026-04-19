/**
 * Shared builder for the statistics filter context menu. Both the grouped
 * and single-source stats tables open the same filter menu via the shared
 * `<ContextMenu>` component — this function produces the item list.
 *
 * Structure (in order):
 *   1. Critical mode stepper (header + discrete stepper)
 *   2. Column filters (one toggle per StatisticsColumnType)
 *   3. Operator filters (one toggle per occupied slot)
 *
 * All toggle items use `keepOpen: true` so the menu stays open while the
 * user enables/disables multiple filters.
 */

import type { Slot } from '../controller/timeline/columnBuilder';
import type { DamageStatistics } from '../controller/calculation/damageTableBuilder';
import type { ContextMenuItem } from '../consts/viewTypes';
import { ComparisonModeType, CritMode, StatisticsColumnType } from '../consts/enums';
import { t } from '../locales/locale';

/** All column keys the filter menu exposes, in display order. */
const FILTER_ORDER: ReadonlyArray<{ key: StatisticsColumnType; label: string }> = [
  { key: StatisticsColumnType.OPERATOR,           label: 'Operator' },
  { key: StatisticsColumnType.OPERATOR_POTENTIAL, label: 'Potential' },
  { key: StatisticsColumnType.WEAPON_RANK,        label: 'Weapon Rank' },
  { key: StatisticsColumnType.TOTAL,              label: 'Total' },
  { key: StatisticsColumnType.BASIC,              label: 'Basic' },
  { key: StatisticsColumnType.BATTLE,             label: 'Battle' },
  { key: StatisticsColumnType.COMBO,              label: 'Combo' },
  { key: StatisticsColumnType.ULTIMATE,           label: 'Ultimate' },
  { key: StatisticsColumnType.TEAM_DPS,           label: 'Team DPS' },
  { key: StatisticsColumnType.CROWD_CONTROL,      label: 'Crowd Control' },
  { key: StatisticsColumnType.DURATION,           label: 'Duration' },
  { key: StatisticsColumnType.TIME_TO_KILL,       label: 'Time to Kill' },
  { key: StatisticsColumnType.TEAM_TOTAL,         label: 'Team Total' },
];

const CRIT_MODE_CYCLE: readonly CritMode[] = [CritMode.EXPECTED, CritMode.NEVER, CritMode.ALWAYS, CritMode.MANUAL];

const CRIT_MODE_LABELS: Record<CritMode, string> = {
  [CritMode.EXPECTED]: t('sheet.crit.expected'),
  [CritMode.NEVER]:    t('sheet.crit.never'),
  [CritMode.ALWAYS]:   t('sheet.crit.always'),
  [CritMode.MANUAL]:   t('sheet.crit.manual'),
};

function cycleCritMode(current: CritMode, delta: 1 | -1): CritMode {
  const idx = CRIT_MODE_CYCLE.indexOf(current);
  const base = idx === -1 ? 0 : idx;
  const n = CRIT_MODE_CYCLE.length;
  return CRIT_MODE_CYCLE[(base + delta + n) % n];
}

const COMPARISON_MODE_CYCLE: readonly ComparisonModeType[] = [
  ComparisonModeType.RAW,
  ComparisonModeType.DELTA_AGAINST_BASE,
  ComparisonModeType.DELTA_AGAINST_PREVIOUS,
];

const COMPARISON_MODE_LABELS: Record<ComparisonModeType, string> = {
  [ComparisonModeType.RAW]:                    t('statistics.comparison.raw'),
  [ComparisonModeType.DELTA_AGAINST_BASE]:     t('statistics.comparison.deltaBase'),
  [ComparisonModeType.DELTA_AGAINST_PREVIOUS]: t('statistics.comparison.deltaPrevious'),
};

function cycleComparisonMode(current: ComparisonModeType, delta: 1 | -1): ComparisonModeType {
  const idx = COMPARISON_MODE_CYCLE.indexOf(current);
  const base = idx === -1 ? 0 : idx;
  const n = COMPARISON_MODE_CYCLE.length;
  return COMPARISON_MODE_CYCLE[(base + delta + n) % n];
}

export interface StatisticsFilterItemsConfig {
  hiddenColumns: ReadonlySet<StatisticsColumnType>;
  hiddenOperators: ReadonlySet<string>;
  occupiedSlots: Slot[];
  critMode: CritMode;
  comparisonMode: ComparisonModeType;
  /** Optional — when provided, CC / TTK toggles render as disabled (no data). */
  statistics?: DamageStatistics;
  onToggleColumn: (column: StatisticsColumnType) => void;
  onToggleOperator: (slotId: string) => void;
  onSetCritMode: (critMode: CritMode) => void;
  onSetComparisonMode: (comparisonMode: ComparisonModeType) => void;
}

export function buildStatisticsFilterItems({
  hiddenColumns,
  hiddenOperators,
  occupiedSlots,
  critMode,
  comparisonMode,
  statistics,
  onToggleColumn,
  onToggleOperator,
  onSetCritMode,
  onSetComparisonMode,
}: StatisticsFilterItemsConfig): ContextMenuItem[] {
  const items: ContextMenuItem[] = [
    { header: true, label: t('sheet.menu.critMode') },
    {
      stepper: {
        valueLabel: CRIT_MODE_LABELS[critMode],
        onPrev: () => onSetCritMode(cycleCritMode(critMode, -1)),
        onNext: () => onSetCritMode(cycleCritMode(critMode, 1)),
      },
    },
    { header: true, label: t('statistics.filter.comparisonMode') },
    {
      stepper: {
        valueLabel: COMPARISON_MODE_LABELS[comparisonMode],
        onPrev: () => onSetComparisonMode(cycleComparisonMode(comparisonMode, -1)),
        onNext: () => onSetComparisonMode(cycleComparisonMode(comparisonMode, 1)),
      },
    },
    { header: true, label: t('statistics.filter.columns') },
    ...FILTER_ORDER.map((item): ContextMenuItem => {
      const disabled =
        (item.key === StatisticsColumnType.CROWD_CONTROL && statistics?.crowdControlPct == null) ||
        (item.key === StatisticsColumnType.TIME_TO_KILL && statistics?.timeToKill == null);
      return {
        label: item.label,
        checked: !hiddenColumns.has(item.key),
        keepOpen: true,
        disabled,
        action: () => onToggleColumn(item.key),
      };
    }),
  ];

  if (occupiedSlots.length > 0) {
    items.push(
      { header: true, label: t('statistics.filter.operators') },
      ...occupiedSlots.map((slot): ContextMenuItem => ({
        label: slot.operator?.name ?? slot.slotId,
        checked: !hiddenOperators.has(slot.slotId),
        keepOpen: true,
        action: () => onToggleOperator(slot.slotId),
      })),
    );
  }

  return items;
}
