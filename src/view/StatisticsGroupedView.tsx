/**
 * Grouped view mode — activates when every statistics source belongs to the
 * same parent loadout (or is that parent itself plus its views).
 *
 * Renders:
 *   - ONE shared operator section at the top (operators / gear / weapons are
 *     invariant across views).
 *   - One stats table per source below, with Pot · Rank columns added to
 *     each row pulling from that source's per-slot viewOverride. The parent
 *     loadout (no override) just shows dashes in those columns.
 */

import React from 'react';
import type { ResolvedSource, SourceStatsBundle } from '../controller/statistics/statisticsController';
import type { ComparisonModeType, CritMode, StatisticsColumnType } from '../consts/enums';
import StatisticsOperatorSection from './StatisticsOperatorSection';
import StatisticsGroupedTable from './StatisticsGroupedTable';

interface Props {
  label: string;
  sources: Array<{ resolved: ResolvedSource; bundle: SourceStatsBundle }>;
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
  onReorderSources: (fromIndex: number, toIndex: number) => void;
}

export default React.memo(function StatisticsGroupedView({
  label, sources, hiddenColumns, hiddenOperators, hiddenAggregate, critMode, comparisonMode, onToggleColumn, onToggleOperator, onToggleAggregate, onSetCritMode, onSetComparisonMode, onReorderSources,
}: Props) {
  // Pick the first resolvable source's sim as the "shared operator section"
  // canvas. Operators/gear/weapons don't vary across views, so any source's
  // sim paints the shared section identically.
  const first = sources.find((s) => s.bundle.simulation);
  if (!first?.bundle.simulation) return null;
  const sharedSim = first.bundle.simulation;

  return (
    <article className="slc slc--grouped">
      <header className="slc-titlebar">
        <h3 className="slc-titlebar-name">{label}</h3>
      </header>

      <section className="slc-widget slc-widget--grouped">
        <span className="slc-tick slc-tick--tl" />
        <span className="slc-tick slc-tick--tr" />
        <span className="slc-tick slc-tick--bl" />
        <span className="slc-tick slc-tick--br" />

        <StatisticsOperatorSection
          slots={sharedSim.slots}
          loadouts={sharedSim.loadouts}
          loadoutProperties={sharedSim.loadoutProperties}
        />

        <StatisticsGroupedTable
          sources={sources}
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
          onReorderSources={onReorderSources}
        />
      </section>
    </article>
  );
});
