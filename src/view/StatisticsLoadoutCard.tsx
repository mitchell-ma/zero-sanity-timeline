/**
 * Composite card for a single statistics source: a title bar, the operator
 * section on the left, and the stats table on the right. Both child sections
 * are standalone components (StatisticsOperatorSection, StatisticsStatsTable).
 *
 * The stats table owns the filter context menu; this component is purely
 * compositional and delegates column-visibility state up to the caller.
 *
 * When stacked in the inter-loadout view, the card exposes a grab handle for
 * drag-reordering and accepts a `reference` row so the stats table can render
 * deltas under Base / Previous comparison modes.
 */

import React from 'react';
import type { SimulationResult } from '../controller/statistics/simulateSheet';
import { GearLayoutType, type ComparisonModeType, type CritMode, type StatisticsColumnType } from '../consts/enums';
import StatisticsOperatorSection from './StatisticsOperatorSection';
import StatisticsStatsTable from './StatisticsStatsTable';
import type { RowData } from './statisticsComparison';
import { t } from '../locales/locale';

interface Props {
  label: string;
  simulation: SimulationResult;
  hiddenColumns: ReadonlySet<StatisticsColumnType>;
  hiddenOperators: ReadonlySet<string>;
  hiddenAggregate: boolean;
  critMode: CritMode;
  comparisonMode: ComparisonModeType;
  onToggleColumn: (column: StatisticsColumnType) => void;
  onToggleOperator: (slotId: string) => void;
  onToggleAggregate: () => void;
  onSetCritMode: (critMode: CritMode) => void;
  onSetComparisonMode: (comparisonMode: ComparisonModeType) => void;
  /** Reference row for delta rendering; null when this card is the base. */
  reference?: RowData | null;
  /**
   * Optional drag handle — when provided, the card renders a grip in the
   * titlebar that invokes this on mousedown. Parent wires it to the
   * source-reorder flow.
   */
  onDragStart?: (e: React.MouseEvent) => void;
  /** Visual flag when this card is currently being dragged. */
  dragging?: boolean;
  /** Card index in the enclosing stack — used only for the data-* hook. */
  cardIndex?: number;
}

export default React.memo(function StatisticsLoadoutCard({
  label, simulation, hiddenColumns, hiddenOperators, hiddenAggregate, critMode, comparisonMode, onToggleColumn, onToggleOperator, onToggleAggregate, onSetCritMode, onSetComparisonMode,
  reference, onDragStart, dragging, cardIndex,
}: Props) {
  const { slots, loadouts, loadoutProperties, damageStatistics, tableColumns } = simulation;

  // Drives `.slc-widget` height via --row-count: one unit per visible operator
  // row, plus one for the team footer when the Aggregate filter is on.
  const visibleOperatorCount = slots.filter((s) => s.operator && !hiddenOperators.has(s.slotId)).length;
  const rowCount = visibleOperatorCount + (hiddenAggregate ? 0 : 1);

  return (
    <article
      className={`slc${dragging ? ' slc--dragging' : ''}`}
      data-card-idx={cardIndex}
    >
      {onDragStart && (
        <span
          className="slc-grab-handle slc-grab-handle--card"
          onMouseDown={onDragStart}
          aria-label={t('common.dragReorder')}
        >
          <span /><span /><span />
        </span>
      )}
      <header className="slc-titlebar">
        <h3 className="slc-titlebar-name">{label}</h3>
      </header>

      <section
        className="slc-widget"
        style={{ '--row-count': rowCount } as React.CSSProperties}
      >
        <span className="slc-tick slc-tick--tl" />
        <span className="slc-tick slc-tick--tr" />
        <span className="slc-tick slc-tick--bl" />
        <span className="slc-tick slc-tick--br" />

        <StatisticsOperatorSection
          slots={slots}
          loadouts={loadouts}
          loadoutProperties={loadoutProperties}
          gearLayout={GearLayoutType.BOTTOM}
        />
        <StatisticsStatsTable
          slots={slots}
          statistics={damageStatistics}
          tableColumns={tableColumns}
          hiddenColumns={hiddenColumns}
          hiddenOperators={hiddenOperators}
          hiddenAggregate={hiddenAggregate}
          critMode={critMode}
          comparisonMode={comparisonMode}
          onToggleColumn={onToggleColumn}
          onToggleOperator={onToggleOperator}
          onToggleAggregate={onToggleAggregate}
          onSetCritMode={onSetCritMode}
          onSetComparisonMode={onSetComparisonMode}
          reference={reference}
        />
      </section>
    </article>
  );
});
