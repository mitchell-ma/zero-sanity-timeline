/**
 * Right pane of the statistics source card — per-operator damage table and
 * team footer stats (DPS / Crowd Control / Duration / Time to Kill / Team Total).
 *
 * Right-click the pane to open a filter menu that toggles any column or footer
 * stat. Hidden columns are persisted per-sheet on `StatisticsData.hiddenColumns`,
 * so every source in the sheet shows the same columns — comparable side-by-side.
 *
 * When `reference` is supplied and `comparisonMode !== RAW`, numeric cells
 * render as deltas against that reference — mirroring the grouped-mode table.
 */

import React, { useCallback, useMemo, useState } from 'react';
import type { Slot } from '../controller/timeline/columnBuilder';
import type { DamageStatistics, DamageTableColumn } from '../controller/calculation/damageTableBuilder';
import type { ViewOverride } from '../utils/loadoutStorage';
import { ComparisonModeType, CritMode, ELEMENT_COLORS, ElementType, StatisticsColumnType, ViewVariableType } from '../consts/enums';
import { NounType } from '../dsl/semantics';
import { loadSettings } from '../consts/settings';
import { weaponSkillLevelToPotential } from '../utils/metaIcons';
import ContextMenu from './ContextMenu';
import { buildStatisticsFilterItems } from './statisticsFilterItems';
import {
  formatDamage,
  formatSeconds,
  makeCellContent,
  makeFormatDelta,
  makeFormatPct,
  type CellResult,
  type RowData,
} from './statisticsComparison';

/** Skill-damage columns in the body table, in order. */
const SKILL_COLUMNS: ReadonlyArray<{
  columnId: string;
  label: string;
  filter: StatisticsColumnType;
}> = [
  { columnId: NounType.BASIC_ATTACK, label: 'Basic',    filter: StatisticsColumnType.BASIC    },
  { columnId: NounType.BATTLE,       label: 'Battle',   filter: StatisticsColumnType.BATTLE   },
  { columnId: NounType.COMBO,        label: 'Combo',    filter: StatisticsColumnType.COMBO    },
  { columnId: NounType.ULTIMATE,     label: 'Ultimate', filter: StatisticsColumnType.ULTIMATE },
];

function accentFor(element: ElementType): string {
  return ELEMENT_COLORS[element] ?? '#8890a0';
}

// ── Main ───────────────────────────────────────────────────────────────────

interface Props {
  slots: Slot[];
  statistics: DamageStatistics;
  tableColumns: DamageTableColumn[];
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
  /**
   * If true, two extra columns (Potential · Weapon Rank) are inserted after
   * the Operator column. Intended for grouped view mode where all source
   * tables need to align even when a given source is the parent loadout
   * with no override (those cells render blank).
   */
  showPermutationCols?: boolean;
  /** Per-slot pinned values used to fill the permutation columns. */
  viewOverride?: ViewOverride;
  /**
   * Reference row used for delta formatting when comparisonMode !== RAW.
   * null / undefined falls back to raw rendering (e.g. the base card, or
   * when the reference sim is unavailable).
   */
  reference?: RowData | null;
}

export default React.memo(function StatisticsStatsTable({
  slots, statistics, tableColumns, hiddenColumns, hiddenOperators, hiddenAggregate, critMode, comparisonMode, onToggleColumn, onToggleOperator, onToggleAggregate, onSetCritMode, onSetComparisonMode,
  showPermutationCols: showPermutationColsProp, viewOverride, reference,
}: Props) {
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const { decimalPlaces, numberFormat } = loadSettings();
  const formatPct = useMemo(() => makeFormatPct(decimalPlaces, numberFormat), [decimalPlaces, numberFormat]);
  const formatDelta = useMemo(() => makeFormatDelta(decimalPlaces, numberFormat), [decimalPlaces, numberFormat]);
  const cellContent = useMemo(() => makeCellContent(comparisonMode, formatDelta), [comparisonMode, formatDelta]);
  const teamPctFormat = useMemo(() => makeFormatPct(1, numberFormat), [numberFormat]);

  /** `ownerEntityId → columnId → damage` lookup. */
  const opColumnDamage = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const col of tableColumns) {
      const dmg = statistics.columnTotals.get(col.key) ?? 0;
      let inner = map.get(col.ownerEntityId);
      if (!inner) { inner = new Map(); map.set(col.ownerEntityId, inner); }
      inner.set(col.columnId, (inner.get(col.columnId) ?? 0) + dmg);
    }
    return map;
  }, [statistics.columnTotals, tableColumns]);

  const durationSec =
    statistics.teamDps != null && statistics.teamDps > 0
      ? statistics.teamTotalDamage / statistics.teamDps
      : null;

  const occupiedSlots = slots.filter((s) => s.operator);
  const visibleOperatorSlots = occupiedSlots.filter((s) => !hiddenOperators.has(s.slotId));

  const showOperator = !hiddenColumns.has(StatisticsColumnType.OPERATOR);
  const showTotal    = !hiddenColumns.has(StatisticsColumnType.TOTAL);
  const visibleSkills = SKILL_COLUMNS.filter((c) => !hiddenColumns.has(c.filter));
  const showPermutationCols = showPermutationColsProp ?? !!viewOverride;
  const isDelta = comparisonMode !== ComparisonModeType.RAW;

  // ── Derived grid template ────────────────────────────────────────────────
  // Build the grid-template-columns string from the visible columns so the
  // stats-head and stats-row share the same layout even when columns are
  // toggled off.
  const bodyColumnCount =
    (showOperator ? 1 : 0)
    + (showPermutationCols ? 2 : 0)
    + (showTotal ? 1 : 0)
    + visibleSkills.length;
  const gridTemplate = [
    showOperator ? 'minmax(0, 1.6fr)' : null,
    ...(showPermutationCols ? ['minmax(0, 0.6fr)', 'minmax(0, 0.6fr)'] : []),
    ...(showTotal ? ['minmax(0, 1fr)'] : []),
    ...visibleSkills.map(() => 'minmax(0, 1fr)'),
  ].filter(Boolean).join(' ');

  if (bodyColumnCount === 0 && (hiddenAggregate || allFooterHidden(hiddenColumns, statistics))) {
    return (
      <div className="slc-stats slc-stats--empty" onContextMenu={handleContextMenu}>
        <span className="slc-stats-empty">All columns hidden · right-click to restore</span>
        {ctxMenu && (
          <ContextMenu
            x={ctxMenu.x}
            y={ctxMenu.y}
            items={buildStatisticsFilterItems({
              hiddenColumns,
              hiddenOperators,
              hiddenAggregate,
              occupiedSlots,
              critMode,
              comparisonMode,
              statistics,
              onToggleColumn,
              onToggleOperator,
              onToggleAggregate,
              onSetCritMode,
              onSetComparisonMode,
            })}
            onClose={() => setCtxMenu(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="slc-stats" onContextMenu={handleContextMenu}>
      {bodyColumnCount > 0 && (
        <div className="slc-stats-grid">
          <div className="slc-stats-head" style={{ gridTemplateColumns: gridTemplate }}>
            {showOperator && <div>Operator</div>}
            {showPermutationCols && <div>Pot</div>}
            {showPermutationCols && <div>Rank</div>}
            {showTotal && <div>Total</div>}
            {visibleSkills.map((c) => <div key={c.columnId}>{c.label}</div>)}
          </div>
          {visibleOperatorSlots.map((slot) => {
            const op = slot.operator!;
            const element = op.element as ElementType;
            const accent = accentFor(element);
            const opStats = statistics.operators.find((o) => o.ownerEntityId === slot.slotId);
            const total = opStats?.totalDamage ?? 0;
            const teamPct = opStats?.teamPct ?? 0;
            const skillBreakdown = opColumnDamage.get(slot.slotId);
            const refOp = reference?.operatorData.get(slot.slotId);
            const slotOverride = viewOverride?.[slot.slotId];
            const pot = slotOverride?.[ViewVariableType.OPERATOR_POTENTIAL];
            const wpnLevel = slotOverride?.[ViewVariableType.WEAPON_SKILL_3_LEVEL];
            const rank = wpnLevel !== undefined ? weaponSkillLevelToPotential(wpnLevel) : undefined;
            const totalCell = cellContent(total, refOp?.total, (n) => formatDamage(n));
            return (
              <div
                key={slot.slotId}
                className="slc-stats-row"
                style={{
                  '--accent': accent,
                  gridTemplateColumns: gridTemplate,
                } as React.CSSProperties}
              >
                {showOperator && (
                  <div className="slc-op-tag">
                    <span className="slc-tag-dot" />
                    <span className="slc-tag-name">{op.name}</span>
                  </div>
                )}
                {showPermutationCols && (
                  <div className={`slc-num-cell${pot === undefined ? ' slc-num-cell--dim' : ''}`}>
                    {pot !== undefined && <span className="slc-num">{`P${pot}`}</span>}
                  </div>
                )}
                {showPermutationCols && (
                  <div className={`slc-num-cell${rank === undefined ? ' slc-num-cell--dim' : ''}`}>
                    {rank !== undefined && <span className="slc-num">{`R${rank}`}</span>}
                  </div>
                )}
                {showTotal && (
                  <div className={`slc-num-cell${totalCell.dim ? ' slc-num-cell--dim' : ''}`}>
                    <span className={`slc-num slc-num--lead${totalCell.deltaClass}`}>{totalCell.node}</span>
                    {!isDelta && total > 0 && (
                      <span className="slc-pct slc-pct--team">{teamPctFormat(teamPct)}</span>
                    )}
                  </div>
                )}
                {visibleSkills.map((col) => {
                  const dmg = skillBreakdown?.get(col.columnId) ?? 0;
                  const pct = total > 0 ? dmg / total : 0;
                  const skillCell = cellContent(dmg, refOp?.skills.get(col.columnId), (n) => formatDamage(n));
                  return (
                    <div
                      key={col.columnId}
                      className={`slc-num-cell${skillCell.dim ? ' slc-num-cell--dim' : ''}`}
                    >
                      <span className={`slc-num${skillCell.deltaClass}`}>{skillCell.node}</span>
                      {!isDelta && dmg > 0 && (
                        <span className="slc-pct">{formatPct(pct)}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {!hiddenAggregate && (
        <TeamFooter
          statistics={statistics}
          durationSec={durationSec}
          hiddenColumns={hiddenColumns}
          cellContent={cellContent}
          reference={reference ?? null}
        />
      )}

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={buildStatisticsFilterItems({
            hiddenColumns,
            hiddenOperators,
            hiddenAggregate,
            occupiedSlots,
            critMode,
            comparisonMode,
            statistics,
            onToggleColumn,
            onToggleOperator,
            onToggleAggregate,
            onSetCritMode,
            onSetComparisonMode,
          })}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
});

// ── Team footer ────────────────────────────────────────────────────────────

type CellContentFn = ReturnType<typeof makeCellContent>;

function TeamFooter({
  statistics, durationSec, hiddenColumns, cellContent, reference,
}: {
  statistics: DamageStatistics;
  durationSec: number | null;
  hiddenColumns: ReadonlySet<StatisticsColumnType>;
  cellContent: CellContentFn;
  reference: RowData | null;
}) {
  const stats: { key: StatisticsColumnType; render: () => React.ReactNode }[] = [];

  if (!hiddenColumns.has(StatisticsColumnType.TEAM_DPS)) {
    stats.push({
      key: StatisticsColumnType.TEAM_DPS,
      render: () => {
        const cell = cellContent(
          statistics.teamDps,
          reference?.teamDps,
          (n) => formatDamage(n),
        );
        return <FooterCell label="Team DPS" cell={cell} rawUnit={statistics.teamDps != null ? '/s' : undefined} />;
      },
    });
  }
  if (!hiddenColumns.has(StatisticsColumnType.CROWD_CONTROL) && statistics.crowdControlPct != null) {
    stats.push({
      key: StatisticsColumnType.CROWD_CONTROL,
      render: () => {
        const cell = cellContent(
          statistics.crowdControlPct,
          reference?.crowdControlPct,
          (n) => (n * 100).toFixed(1),
          () => false,
        );
        return <FooterCell label="Crowd Control" cell={cell} rawUnit="%" />;
      },
    });
  }
  if (!hiddenColumns.has(StatisticsColumnType.DURATION)) {
    stats.push({
      key: StatisticsColumnType.DURATION,
      render: () => {
        const cell = cellContent(
          durationSec,
          reference?.durationSec,
          (n) => n.toFixed(1),
          () => false,
        );
        return <FooterCell label="Duration" cell={cell} rawUnit={durationSec != null ? 's' : undefined} />;
      },
    });
  }
  if (!hiddenColumns.has(StatisticsColumnType.TIME_TO_KILL) && statistics.timeToKill != null) {
    stats.push({
      key: StatisticsColumnType.TIME_TO_KILL,
      render: () => {
        const cell = cellContent(
          statistics.timeToKill,
          reference?.timeToKill,
          (n) => formatSeconds(n),
          () => false,
        );
        return <FooterCell label="Time to Kill" cell={cell} rawUnit="s" />;
      },
    });
  }
  if (!hiddenColumns.has(StatisticsColumnType.TEAM_TOTAL)) {
    stats.push({
      key: StatisticsColumnType.TEAM_TOTAL,
      render: () => {
        const cell = cellContent(
          statistics.teamTotalDamage,
          reference?.teamTotal,
          (n) => formatDamage(n),
        );
        return <FooterCell label="Team Total" cell={cell} />;
      },
    });
  }

  if (stats.length === 0) return null;

  return (
    <div className="slc-team-footer">
      {stats.map((s, i) => (
        <React.Fragment key={s.key}>
          {i > 0 && <div className="slc-team-divider" />}
          {s.render()}
        </React.Fragment>
      ))}
    </div>
  );
}

function FooterCell({ label, cell, rawUnit }: { label: string; cell: CellResult; rawUnit?: string }) {
  const isDelta = cell.deltaClass !== '';
  return (
    <div className={`slc-team-stat${cell.dim ? ' slc-team-stat--dim' : ''}`}>
      <div className="slc-ts-label">{label}</div>
      <div className={`slc-ts-value${cell.deltaClass}`}>
        {cell.node}
        {!isDelta && rawUnit && cell.node !== '' && <span className="slc-ts-unit">{rawUnit}</span>}
      </div>
    </div>
  );
}

function allFooterHidden(
  hidden: ReadonlySet<StatisticsColumnType>,
  statistics: DamageStatistics,
): boolean {
  if (!hidden.has(StatisticsColumnType.TEAM_DPS)) return false;
  if (statistics.crowdControlPct != null && !hidden.has(StatisticsColumnType.CROWD_CONTROL)) return false;
  if (!hidden.has(StatisticsColumnType.DURATION)) return false;
  if (statistics.timeToKill != null && !hidden.has(StatisticsColumnType.TIME_TO_KILL)) return false;
  if (!hidden.has(StatisticsColumnType.TEAM_TOTAL)) return false;
  return true;
}
