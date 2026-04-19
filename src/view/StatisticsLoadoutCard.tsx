/**
 * Composite card for a single statistics source: a title bar, the operator
 * section on the left, and the stats table on the right. Both child sections
 * are standalone components (StatisticsOperatorSection, StatisticsStatsTable).
 *
 * The stats table owns the filter context menu; this component is purely
 * compositional and delegates column-visibility state up to the caller.
 */

import React from 'react';
import type { SimulationResult } from '../controller/statistics/simulateSheet';
import type { ComparisonModeType, CritMode, StatisticsColumnType } from '../consts/enums';
import StatisticsOperatorSection from './StatisticsOperatorSection';
import StatisticsStatsTable from './StatisticsStatsTable';

interface Props {
  label: string;
  simulation: SimulationResult;
  hiddenColumns: ReadonlySet<StatisticsColumnType>;
  hiddenOperators: ReadonlySet<string>;
  critMode: CritMode;
  comparisonMode: ComparisonModeType;
  onToggleColumn: (column: StatisticsColumnType) => void;
  onToggleOperator: (slotId: string) => void;
  onSetCritMode: (critMode: CritMode) => void;
  onSetComparisonMode: (comparisonMode: ComparisonModeType) => void;
}

export default React.memo(function StatisticsLoadoutCard({
  label, simulation, hiddenColumns, hiddenOperators, critMode, comparisonMode, onToggleColumn, onToggleOperator, onSetCritMode, onSetComparisonMode,
}: Props) {
  const { slots, loadouts, loadoutProperties, damageStatistics, tableColumns } = simulation;

  return (
    <article className="slc">
      <header className="slc-titlebar">
        <h3 className="slc-titlebar-name">{label}</h3>
      </header>

      <section className="slc-widget">
        <span className="slc-tick slc-tick--tl" />
        <span className="slc-tick slc-tick--tr" />
        <span className="slc-tick slc-tick--bl" />
        <span className="slc-tick slc-tick--br" />

        <StatisticsOperatorSection
          slots={slots}
          loadouts={loadouts}
          loadoutProperties={loadoutProperties}
        />
        <StatisticsStatsTable
          slots={slots}
          statistics={damageStatistics}
          tableColumns={tableColumns}
          hiddenColumns={hiddenColumns}
          hiddenOperators={hiddenOperators}
          critMode={critMode}
          comparisonMode={comparisonMode}
          onToggleColumn={onToggleColumn}
          onToggleOperator={onToggleOperator}
          onSetCritMode={onSetCritMode}
          onSetComparisonMode={onSetComparisonMode}
        />
      </section>
    </article>
  );
});
