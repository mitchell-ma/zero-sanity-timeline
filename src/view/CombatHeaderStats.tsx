/**
 * Combat-sheet header damage strip — dashboard layout.
 *
 * Replaces the spreadsheet-style table previously borrowed from the statistics
 * page. Two zones: a team vital-stats block on the left (Total / DPS / Duration
 * / Crowd Control) and one horizontal lane per occupied operator on the right.
 * Skill breakdown renders as a stacked bar inside each lane, so empty
 * Combo/Ultimate columns naturally collapse and operators with no damage
 * shrink to a slim placeholder.
 *
 * Right-click opens the same filter menu used by the statistics card.
 */

import React, { useCallback, useMemo, useState } from 'react';
import type { Slot } from '../controller/timeline/columnBuilder';
import type { DamageStatistics, DamageTableColumn } from '../controller/calculation/damageTableBuilder';
import { CritMode, ELEMENT_COLORS, ElementType, StatisticsColumnType } from '../consts/enums';
import { NounType } from '../dsl/semantics';
import { loadSettings } from '../consts/settings';
import ContextMenu from './ContextMenu';
import { buildStatisticsFilterItems } from './statisticsFilterItems';
import { formatDamage, formatSeconds, makeFormatPct } from './statisticsComparison';
import { ComparisonModeType } from '../consts/enums';

interface SkillSpec {
  columnId: string;
  label: string;
  filter: StatisticsColumnType;
  /** CSS variable that resolves to the segment colour. */
  colorVar: string;
}

// Skill-type colours match the badge palette established at .skill-badge--*
// (App.css line 3463). Keeps the strip in sync with the rest of the app so
// users carry the same colour-to-skill mapping across surfaces.
const SKILL_COLUMNS: ReadonlyArray<SkillSpec> = [
  { columnId: NounType.BASIC_ATTACK, label: 'Basic',    filter: StatisticsColumnType.BASIC,    colorVar: '#9ab8cc' },
  { columnId: NounType.BATTLE,       label: 'Battle',   filter: StatisticsColumnType.BATTLE,   colorVar: '#5599ff' },
  { columnId: NounType.COMBO,        label: 'Combo',    filter: StatisticsColumnType.COMBO,    colorVar: '#22ddcc' },
  { columnId: NounType.ULTIMATE,     label: 'Ultimate', filter: StatisticsColumnType.ULTIMATE, colorVar: '#f0a040' },
];

function accentFor(element: ElementType): string {
  return ELEMENT_COLORS[element] ?? '#8890a0';
}

interface Props {
  slots: Slot[];
  statistics: DamageStatistics;
  tableColumns: DamageTableColumn[];
  critMode: CritMode;
  onSetCritMode: (mode: CritMode) => void;
}

export default React.memo(function CombatHeaderStats({
  slots, statistics, tableColumns, critMode, onSetCritMode,
}: Props) {
  // Ephemeral visibility state — mirrors the statistics card. Right-click the
  // strip to hide/show columns, operators, or the team aggregate. Not persisted.
  const [hiddenColumns, setHiddenColumns] = useState<ReadonlySet<StatisticsColumnType>>(() => new Set());
  const [hiddenOperators, setHiddenOperators] = useState<ReadonlySet<string>>(() => new Set());
  const [hiddenAggregate, setHiddenAggregate] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

  const toggleColumn = useCallback((col: StatisticsColumnType) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col); else next.add(col);
      return next;
    });
  }, []);
  const toggleOperator = useCallback((slotId: string) => {
    setHiddenOperators((prev) => {
      const next = new Set(prev);
      if (next.has(slotId)) next.delete(slotId); else next.add(slotId);
      return next;
    });
  }, []);
  const toggleAggregate = useCallback(() => setHiddenAggregate((v) => !v), []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const { decimalPlaces, numberFormat } = loadSettings();
  const formatPct = useMemo(() => makeFormatPct(decimalPlaces, numberFormat), [decimalPlaces, numberFormat]);
  const teamPctFormat = useMemo(() => makeFormatPct(1, numberFormat), [numberFormat]);

  /** ownerEntityId → columnId → damage. */
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

  const occupiedSlots = slots.filter((s) => s.operator);
  const visibleSlots = occupiedSlots.filter((s) => !hiddenOperators.has(s.slotId));

  // Sort lanes by damage descending — the dominant operator floats to the top.
  const rankedLanes = useMemo(() => {
    const lanes = visibleSlots.map((slot) => {
      const opStats = statistics.operators.find((o) => o.ownerEntityId === slot.slotId);
      const total = opStats?.totalDamage ?? 0;
      const teamPct = opStats?.teamPct ?? 0;
      return { slot, total, teamPct };
    });
    lanes.sort((a, b) => b.total - a.total);
    return lanes;
  }, [visibleSlots, statistics.operators]);

  // Bar scale: each operator's stacked bar fills proportional to the leader's
  // total. The leader fills 100% of the lane's bar track; everyone else scales
  // down. This makes magnitude differences obvious at a glance.
  const leaderTotal = rankedLanes[0]?.total ?? 0;

  const visibleSkills = SKILL_COLUMNS.filter((c) => !hiddenColumns.has(c.filter));
  const showTotalCol = !hiddenColumns.has(StatisticsColumnType.TOTAL);

  const durationSec =
    statistics.teamDps != null && statistics.teamDps > 0
      ? statistics.teamTotalDamage / statistics.teamDps
      : null;

  // Vital-stats cards. Each card is independent — they render only when their
  // filter flag is on AND their value is meaningful.
  const vitals: { key: StatisticsColumnType; label: string; value: string; unit?: string; emphasis?: boolean }[] = [];
  if (!hiddenColumns.has(StatisticsColumnType.TEAM_TOTAL)) {
    vitals.push({
      key: StatisticsColumnType.TEAM_TOTAL,
      label: 'Team Total',
      value: statistics.teamTotalDamage > 0 ? formatDamage(statistics.teamTotalDamage) : '',
      emphasis: true,
    });
  }
  if (!hiddenColumns.has(StatisticsColumnType.TEAM_DPS)) {
    vitals.push({
      key: StatisticsColumnType.TEAM_DPS,
      label: 'Team DPS',
      value: statistics.teamDps != null && statistics.teamDps > 0 ? formatDamage(statistics.teamDps) : '',
      unit: statistics.teamDps != null && statistics.teamDps > 0 ? '/s' : undefined,
    });
  }
  if (!hiddenColumns.has(StatisticsColumnType.DURATION)) {
    vitals.push({
      key: StatisticsColumnType.DURATION,
      label: 'Duration',
      value: durationSec != null ? durationSec.toFixed(1) : '',
      unit: durationSec != null ? 's' : undefined,
    });
  }
  if (!hiddenColumns.has(StatisticsColumnType.TIME_TO_KILL) && statistics.timeToKill != null) {
    vitals.push({
      key: StatisticsColumnType.TIME_TO_KILL,
      label: 'Kill',
      value: formatSeconds(statistics.timeToKill),
      unit: 's',
    });
  }
  if (!hiddenColumns.has(StatisticsColumnType.CROWD_CONTROL)) {
    vitals.push({
      key: StatisticsColumnType.CROWD_CONTROL,
      label: 'Crowd Ctrl',
      value: statistics.crowdControlPct != null ? (statistics.crowdControlPct * 100).toFixed(1) : '',
      unit: statistics.crowdControlPct != null ? '%' : undefined,
    });
  }

  const showVitals = !hiddenAggregate && vitals.length > 0;

  const empty = rankedLanes.length === 0 && !showVitals;
  if (empty) {
    return (
      <div className="chs chs--empty" onContextMenu={handleContextMenu}>
        <span className="chs-empty">All columns hidden · right-click to restore</span>
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
              comparisonMode: ComparisonModeType.RAW,
              statistics,
              onToggleColumn: toggleColumn,
              onToggleOperator: toggleOperator,
              onToggleAggregate: toggleAggregate,
              onSetCritMode,
              onSetComparisonMode: () => {},
            })}
            onClose={() => setCtxMenu(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="chs" onContextMenu={handleContextMenu}>
      {showVitals && (
        <div className="chs-vitals">
          <div className="chs-vitals-rail" aria-hidden="true" />
          <div className="chs-vitals-grid">
            {vitals.map((v) => (
              <div
                key={v.key}
                className={`chs-vital${v.emphasis ? ' chs-vital--lead' : ''}`}
              >
                <span className="chs-vital-label">{v.label}</span>
                <span className="chs-vital-value">
                  {v.value}
                  {v.unit && <span className="chs-vital-unit">{v.unit}</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="chs-lanes">
        {rankedLanes.length === 0 && (
          <div className="chs-lane chs-lane--placeholder">
            <span className="chs-lane-placeholder">No operators visible</span>
          </div>
        )}
        {rankedLanes.map(({ slot, total, teamPct }, idx) => {
          const op = slot.operator!;
          const accent = accentFor(op.element as ElementType);
          const skillBreakdown = opColumnDamage.get(slot.slotId);
          const isEmpty = total <= 0;
          // Bar fill = this operator's share of the leader's total, clamped
          // to leave a 1px hairline visible when total === 0.
          const barFill = leaderTotal > 0 ? Math.max(total / leaderTotal, 0) : 0;

          return (
            <div
              key={slot.slotId}
              className={`chs-lane${isEmpty ? ' chs-lane--empty' : ''}${idx === 0 && !isEmpty ? ' chs-lane--lead' : ''}`}
              style={{ '--accent': accent } as React.CSSProperties}
            >
              <div className="chs-lane-id">
                <span className="chs-lane-dot" aria-hidden="true" />
                <span className="chs-lane-name">{op.name}</span>
              </div>

              <div className="chs-lane-bar" style={{ '--bar-fill': `${barFill * 100}%` } as React.CSSProperties}>
                <div className="chs-bar-track">
                  {visibleSkills.map((spec) => {
                    const dmg = skillBreakdown?.get(spec.columnId) ?? 0;
                    const widthPct = total > 0 ? (dmg / total) * 100 : 0;
                    if (widthPct === 0) return null;
                    return (
                      <div
                        key={spec.columnId}
                        className="chs-bar-seg"
                        style={{
                          width: `${widthPct}%`,
                          background: spec.colorVar,
                        }}
                        title={`${spec.label}: ${formatDamage(dmg)} (${formatPct(dmg / total)})`}
                      />
                    );
                  })}
                </div>
              </div>

              {showTotalCol && !isEmpty && (
                <div className="chs-lane-total">
                  <span className="chs-lane-num">{formatDamage(total)}</span>
                  {/* "1.0 of 1.0" is noise — only show share when the
                      operator is one of multiple contributors. */}
                  {teamPct < 0.995 && (
                    <span className="chs-lane-pct">{teamPctFormat(teamPct)}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {visibleSkills.length > 0 && (
        <div className="chs-legend" aria-hidden="true">
          {visibleSkills.map((spec) => (
            <span key={spec.columnId} className="chs-legend-item">
              <span className="chs-legend-swatch" style={{ background: spec.colorVar }} />
              <span className="chs-legend-label">{spec.label}</span>
            </span>
          ))}
        </div>
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
            comparisonMode: ComparisonModeType.RAW,
            statistics,
            onToggleColumn: toggleColumn,
            onToggleOperator: toggleOperator,
            onToggleAggregate: toggleAggregate,
            onSetCritMode,
            onSetComparisonMode: () => {},
          })}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
});
