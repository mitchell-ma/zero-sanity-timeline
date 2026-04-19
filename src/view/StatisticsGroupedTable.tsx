/**
 * Grouped-mode stats table — one shared column header, one row-group per view.
 *
 * Columns and rows are both drag-reorderable:
 *   - Column reorder is purely visual (persisted globally in localStorage via
 *     `statisticsColumnDefs`) — no effect on sources or calculations.
 *   - Row reorder mutates the sheet's `sources` array via `onReorderSources`,
 *     changing which row acts as Base (index 0) and what counts as Previous.
 *
 * Comparison mode re-reads after every reorder so the delta recomputes against
 * the new neighbors.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ResolvedSource, SourceStatsBundle } from '../controller/statistics/statisticsController';
import type { SimulationResult } from '../controller/statistics/simulateSheet';
import type { DamageStatistics, DamageTableColumn } from '../controller/calculation/damageTableBuilder';
import { ComparisonModeType, CritMode, LoadoutNodeType, NumberFormatType, StatisticsColumnType, ViewVariableType, ELEMENT_COLORS, ElementType } from '../consts/enums';
import { NounType } from '../dsl/semantics';
import { loadSettings } from '../consts/settings';
import { weaponSkillLevelToPotential } from '../utils/metaIcons';
import ContextMenu from './ContextMenu';
import { buildStatisticsFilterItems } from './statisticsFilterItems';
import {
  STATISTICS_COLUMN_DEF_MAP,
  loadStatisticsColumnOrder,
  saveStatisticsColumnOrder,
} from './statisticsColumnDefs';
import { t } from '../locales/locale';

const FPS = 120;

/** Maps the skill-filter enum to the corresponding per-slot damage columnId. */
const SKILL_COLUMN_ID_BY_FILTER: ReadonlyMap<StatisticsColumnType, string> = new Map([
  [StatisticsColumnType.BASIC,    NounType.BASIC_ATTACK],
  [StatisticsColumnType.BATTLE,   NounType.BATTLE],
  [StatisticsColumnType.COMBO,    NounType.COMBO],
  [StatisticsColumnType.ULTIMATE, NounType.ULTIMATE],
]);

// ── Formatters ─────────────────────────────────────────────────────────────

function formatDamage(n: number): string {
  if (n <= 0) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000)    return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString();
}

function formatSeconds(frames: number): string {
  return (frames / FPS).toFixed(1);
}

function makeFormatPct(decimalPlaces: number, numberFormat: NumberFormatType) {
  return (n: number): string =>
    numberFormat === NumberFormatType.DECIMAL
      ? n.toFixed(decimalPlaces)
      : `${(n * 100).toFixed(decimalPlaces)}%`;
}

type DeltaClass = '' | ' slc-num--delta-pos' | ' slc-num--delta-neg';

function makeFormatDelta(decimalPlaces: number, numberFormat: NumberFormatType) {
  return (current: number, reference: number): { text: string; deltaClass: DeltaClass } => {
    if (reference === 0) return { text: '', deltaClass: '' };
    const delta = (current - reference) / reference;
    if (delta === 0) return { text: '', deltaClass: '' };

    if (numberFormat === NumberFormatType.DECIMAL) {
      const text = (1 + delta).toFixed(decimalPlaces);
      return { text, deltaClass: delta > 0 ? ' slc-num--delta-pos' : ' slc-num--delta-neg' };
    }
    const body = `${(delta * 100).toFixed(decimalPlaces)}%`;
    if (delta > 0) return { text: `+${body}`, deltaClass: ' slc-num--delta-pos' };
    return { text: body, deltaClass: ' slc-num--delta-neg' };
  };
}

interface CellResult {
  node: React.ReactNode;
  dim: boolean;
  deltaClass: DeltaClass;
}

function makeCellContent(
  mode: ComparisonModeType,
  formatDelta: ReturnType<typeof makeFormatDelta>,
) {
  return (
    current: number | null | undefined,
    reference: number | null | undefined,
    rawRender: (n: number) => React.ReactNode,
    rawIsEmpty: (n: number) => boolean = (n) => n <= 0,
  ): CellResult => {
    if (current == null) return { node: '', dim: true, deltaClass: '' };
    if (mode === ComparisonModeType.RAW) {
      if (rawIsEmpty(current)) return { node: '', dim: true, deltaClass: '' };
      return { node: rawRender(current), dim: false, deltaClass: '' };
    }
    if (reference == null) return { node: '', dim: true, deltaClass: '' };
    const { text, deltaClass } = formatDelta(current, reference);
    if (text === '') return { node: '', dim: true, deltaClass: '' };
    return { node: text, dim: false, deltaClass };
  };
}

// ── Aggregation helpers ────────────────────────────────────────────────────

function buildSlotColumnDamage(
  statistics: DamageStatistics,
  tableColumns: DamageTableColumn[],
): Map<string, Map<string, number>> {
  const map = new Map<string, Map<string, number>>();
  for (const col of tableColumns) {
    const dmg = statistics.columnTotals.get(col.key) ?? 0;
    let inner = map.get(col.ownerEntityId);
    if (!inner) { inner = new Map(); map.set(col.ownerEntityId, inner); }
    inner.set(col.columnId, (inner.get(col.columnId) ?? 0) + dmg);
  }
  return map;
}

function sumAllSkill(
  slotColumnDamage: Map<string, Map<string, number>>,
  columnId: string,
): number {
  let total = 0;
  slotColumnDamage.forEach((inner) => {
    total += inner.get(columnId) ?? 0;
  });
  return total;
}

interface RowData {
  sim: SimulationResult;
  slotColumnDamage: Map<string, Map<string, number>>;
  teamTotal: number;
  durationSec: number | null;
  teamSkills: Map<string, number>;
  operatorData: Map<string, { total: number; skills: Map<string, number> }>;
  teamDps: number | null;
  crowdControlPct: number | null;
  timeToKill: number | null;
}

function buildRowData(bundle: SourceStatsBundle): RowData | null {
  const sim = bundle.simulation;
  if (!sim) return null;

  const slotColumnDamage = buildSlotColumnDamage(sim.damageStatistics, sim.tableColumns);
  const teamTotal = sim.damageStatistics.teamTotalDamage;
  const durationSec =
    sim.damageStatistics.teamDps != null && sim.damageStatistics.teamDps > 0
      ? teamTotal / sim.damageStatistics.teamDps
      : null;

  const teamSkills = new Map<string, number>();
  SKILL_COLUMN_ID_BY_FILTER.forEach((columnId) => {
    teamSkills.set(columnId, sumAllSkill(slotColumnDamage, columnId));
  });

  const operatorData = new Map<string, { total: number; skills: Map<string, number> }>();
  for (const slot of sim.slots) {
    if (!slot.operator) continue;
    const opStats = sim.damageStatistics.operators.find((o) => o.ownerEntityId === slot.slotId);
    const opTotal = opStats?.totalDamage ?? 0;
    const skillBreakdown = slotColumnDamage.get(slot.slotId) ?? new Map<string, number>();
    const skills = new Map<string, number>();
    SKILL_COLUMN_ID_BY_FILTER.forEach((columnId) => {
      skills.set(columnId, skillBreakdown.get(columnId) ?? 0);
    });
    operatorData.set(slot.slotId, { total: opTotal, skills });
  }

  return {
    sim, slotColumnDamage, teamTotal, durationSec, teamSkills, operatorData,
    teamDps: sim.damageStatistics.teamDps ?? null,
    crowdControlPct: sim.damageStatistics.crowdControlPct ?? null,
    timeToKill: sim.damageStatistics.timeToKill ?? null,
  };
}

// ── Cell renderers ─────────────────────────────────────────────────────────

interface HeaderCellCtx {
  resolved: ResolvedSource;
  rowData: RowData;
  refRow: RowData | null;
  cellContent: ReturnType<typeof makeCellContent>;
}

interface SubrowCellCtx {
  resolved: ResolvedSource;
  slot: { slotId: string; operator: NonNullable<SimulationResult['slots'][number]['operator']> };
  rowData: RowData;
  refRow: RowData | null;
  cellContent: ReturnType<typeof makeCellContent>;
  formatPct: (n: number) => string;
  comparisonMode: ComparisonModeType;
}

function renderViewHeaderCell(col: StatisticsColumnType, ctx: HeaderCellCtx): React.ReactNode {
  switch (col) {
    case StatisticsColumnType.OPERATOR:
      return (
        <div className="slc-op-tag">
          <span className="slc-tag-dot" />
          <span className="slc-tag-name">{ctx.resolved.label}</span>
        </div>
      );
    case StatisticsColumnType.OPERATOR_POTENTIAL:
    case StatisticsColumnType.WEAPON_RANK:
      return <div className="slc-num-cell slc-num-cell--dim" />;
    case StatisticsColumnType.TOTAL: {
      const c = ctx.cellContent(ctx.rowData.teamTotal, ctx.refRow?.teamTotal, (n) => formatDamage(n));
      return (
        <div className={`slc-num-cell${c.dim ? ' slc-num-cell--dim' : ''}`}>
          <span className={`slc-num slc-num--lead${c.deltaClass}`}>{c.node}</span>
        </div>
      );
    }
    case StatisticsColumnType.BASIC:
    case StatisticsColumnType.BATTLE:
    case StatisticsColumnType.COMBO:
    case StatisticsColumnType.ULTIMATE: {
      const columnId = SKILL_COLUMN_ID_BY_FILTER.get(col)!;
      const dmg = ctx.rowData.teamSkills.get(columnId) ?? 0;
      const refDmg = ctx.refRow?.teamSkills.get(columnId);
      const c = ctx.cellContent(dmg, refDmg, (n) => formatDamage(n));
      return (
        <div className={`slc-num-cell${c.dim ? ' slc-num-cell--dim' : ''}`}>
          <span className={`slc-num${c.deltaClass}`}>{c.node}</span>
        </div>
      );
    }
    case StatisticsColumnType.TEAM_DPS: {
      const c = ctx.cellContent(
        ctx.rowData.teamDps,
        ctx.refRow?.teamDps ?? null,
        (n) => <>{formatDamage(n)}<span className="slc-ts-unit">/s</span></>,
      );
      return (
        <div className={`slc-num-cell${c.dim ? ' slc-num-cell--dim' : ''}`}>
          <span className={`slc-num${c.deltaClass}`}>{c.node}</span>
        </div>
      );
    }
    case StatisticsColumnType.CROWD_CONTROL: {
      const makePct = makeFormatPct(2, NumberFormatType.PERCENTAGE); // only used inside raw path
      const c = ctx.cellContent(
        ctx.rowData.crowdControlPct,
        ctx.refRow?.crowdControlPct ?? null,
        (n) => makePct(n),
        () => false,
      );
      return (
        <div className={`slc-num-cell${c.dim ? ' slc-num-cell--dim' : ''}`}>
          <span className={`slc-num${c.deltaClass}`}>{c.node}</span>
        </div>
      );
    }
    case StatisticsColumnType.DURATION: {
      const c = ctx.cellContent(
        ctx.rowData.durationSec,
        ctx.refRow?.durationSec ?? null,
        (n) => <>{n.toFixed(1)}<span className="slc-ts-unit">s</span></>,
        () => false,
      );
      return (
        <div className={`slc-num-cell${c.dim ? ' slc-num-cell--dim' : ''}`}>
          <span className={`slc-num${c.deltaClass}`}>{c.node}</span>
        </div>
      );
    }
    case StatisticsColumnType.TIME_TO_KILL: {
      const c = ctx.cellContent(
        ctx.rowData.timeToKill,
        ctx.refRow?.timeToKill ?? null,
        (n) => <>{formatSeconds(n)}<span className="slc-ts-unit">s</span></>,
        () => false,
      );
      return (
        <div className={`slc-num-cell${c.dim ? ' slc-num-cell--dim' : ''}`}>
          <span className={`slc-num${c.deltaClass}`}>{c.node}</span>
        </div>
      );
    }
    default:
      return <div className="slc-num-cell slc-num-cell--dim" />;
  }
}

function renderSubrowCell(col: StatisticsColumnType, ctx: SubrowCellCtx): React.ReactNode {
  const { slot, rowData, refRow, resolved, cellContent, formatPct, comparisonMode } = ctx;
  const currentOp = rowData.operatorData.get(slot.slotId);
  const opTotal = currentOp?.total ?? 0;
  const refOp = refRow?.operatorData.get(slot.slotId);

  switch (col) {
    case StatisticsColumnType.OPERATOR:
      return (
        <div className="slc-op-tag slc-op-tag--sub">
          <span className="slc-tag-name">{slot.operator.name}</span>
        </div>
      );
    case StatisticsColumnType.OPERATOR_POTENTIAL: {
      const slotOverride = resolved.node?.viewOverride?.[slot.slotId];
      const baseProps = rowData.sim.loadoutProperties[slot.slotId];
      const pot = slotOverride?.[ViewVariableType.OPERATOR_POTENTIAL] ?? baseProps?.operator.potential;
      return (
        <div className={`slc-num-cell${pot === undefined ? ' slc-num-cell--dim' : ''}`}>
          {pot !== undefined && <span className="slc-num">{`P${pot}`}</span>}
        </div>
      );
    }
    case StatisticsColumnType.WEAPON_RANK: {
      const slotOverride = resolved.node?.viewOverride?.[slot.slotId];
      const baseProps = rowData.sim.loadoutProperties[slot.slotId];
      const wpnLevel = slotOverride?.[ViewVariableType.WEAPON_SKILL_3_LEVEL] ?? baseProps?.weapon.skill3Level;
      const rank = wpnLevel !== undefined ? weaponSkillLevelToPotential(wpnLevel) : undefined;
      return (
        <div className={`slc-num-cell${rank === undefined ? ' slc-num-cell--dim' : ''}`}>
          {rank !== undefined && <span className="slc-num">{`R${rank}`}</span>}
        </div>
      );
    }
    case StatisticsColumnType.TOTAL: {
      const opStats = rowData.sim.damageStatistics.operators.find((o) => o.ownerEntityId === slot.slotId);
      const teamPct = opStats?.teamPct ?? 0;
      const c = cellContent(opTotal, refOp?.total, (n) => formatDamage(n));
      return (
        <div className={`slc-num-cell${c.dim ? ' slc-num-cell--dim' : ''}`}>
          <span className={`slc-num${c.deltaClass}`}>{c.node}</span>
          {comparisonMode === ComparisonModeType.RAW && opTotal > 0 && (
            <span className="slc-pct slc-pct--team">{formatPct(teamPct)}</span>
          )}
        </div>
      );
    }
    case StatisticsColumnType.BASIC:
    case StatisticsColumnType.BATTLE:
    case StatisticsColumnType.COMBO:
    case StatisticsColumnType.ULTIMATE: {
      const columnId = SKILL_COLUMN_ID_BY_FILTER.get(col)!;
      const dmg = currentOp?.skills.get(columnId) ?? 0;
      const refDmg = refOp?.skills.get(columnId);
      const c = cellContent(dmg, refDmg, (n) => formatDamage(n));
      const pct = opTotal > 0 ? dmg / opTotal : 0;
      return (
        <div className={`slc-num-cell${c.dim ? ' slc-num-cell--dim' : ''}`}>
          <span className={`slc-num${c.deltaClass}`}>{c.node}</span>
          {comparisonMode === ComparisonModeType.RAW && dmg > 0 && (
            <span className="slc-pct">{formatPct(pct)}</span>
          )}
        </div>
      );
    }
    // Team-level columns stay blank on operator subrows.
    case StatisticsColumnType.TEAM_DPS:
    case StatisticsColumnType.CROWD_CONTROL:
    case StatisticsColumnType.DURATION:
    case StatisticsColumnType.TIME_TO_KILL:
      return <div className="slc-num-cell slc-num-cell--dim" />;
    default:
      return <div className="slc-num-cell slc-num-cell--dim" />;
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

interface Props {
  sources: Array<{ resolved: ResolvedSource; bundle: SourceStatsBundle }>;
  hiddenColumns: ReadonlySet<StatisticsColumnType>;
  hiddenOperators: ReadonlySet<string>;
  critMode: CritMode;
  comparisonMode: ComparisonModeType;
  onToggleColumn: (column: StatisticsColumnType) => void;
  onToggleOperator: (slotId: string) => void;
  onSetCritMode: (critMode: CritMode) => void;
  onSetComparisonMode: (comparisonMode: ComparisonModeType) => void;
  onReorderSources: (fromIndex: number, toIndex: number) => void;
}

export default React.memo(function StatisticsGroupedTable({
  sources, hiddenColumns, hiddenOperators, critMode, comparisonMode, onToggleColumn, onToggleOperator, onSetCritMode, onSetComparisonMode, onReorderSources,
}: Props) {
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);

  // Delta + secondary pct cells obey the global decimal-places + number-format
  // settings, read once per render.
  const { decimalPlaces, numberFormat } = loadSettings();
  const formatPct = useMemo(() => makeFormatPct(decimalPlaces, numberFormat), [decimalPlaces, numberFormat]);
  const formatDelta = useMemo(() => makeFormatDelta(decimalPlaces, numberFormat), [decimalPlaces, numberFormat]);
  const cellContent = useMemo(() => makeCellContent(comparisonMode, formatDelta), [comparisonMode, formatDelta]);

  // ── Column reorder state (visual-only, persisted globally) ─────────────
  const [columnOrder, setColumnOrder] = useState<StatisticsColumnType[]>(loadStatisticsColumnOrder);
  useEffect(() => { saveStatisticsColumnOrder(columnOrder); }, [columnOrder]);
  const columnOrderRef = useRef(columnOrder);
  columnOrderRef.current = columnOrder;

  const visibleColumns = useMemo(
    () => columnOrder.filter((id) => !hiddenColumns.has(id)),
    [columnOrder, hiddenColumns],
  );
  const gridTemplate = useMemo(
    () => visibleColumns.map((id) => STATISTICS_COLUMN_DEF_MAP.get(id)!.gridTrack).join(' '),
    [visibleColumns],
  );

  // ── Source data ─────────────────────────────────────────────────────────
  // Only render LOADOUT_VIEW sources — the parent loadout that views were
  // generated from should not appear. If the user selected the baseline
  // combination in the view-generator, it will be a LOADOUT_VIEW of its own
  // and still renders here.
  const viewSources = useMemo(
    () => sources.filter(({ resolved }) => resolved.node?.type === LoadoutNodeType.LOADOUT_VIEW),
    [sources],
  );
  // Maps each rendered view-source back to its index in the original
  // `sources` array — `onReorderSources` needs original-array indices since
  // that's what `StatisticsData.sources` is ordered by. A ref mirror keeps
  // the mousemove closure using the latest mapping after each reorder.
  const viewSourceOriginalIndices = useMemo(() => {
    const indices: number[] = [];
    sources.forEach((s, i) => {
      if (s.resolved.node?.type === LoadoutNodeType.LOADOUT_VIEW) indices.push(i);
    });
    return indices;
  }, [sources]);
  const viewSourceOriginalIndicesRef = useRef(viewSourceOriginalIndices);
  viewSourceOriginalIndicesRef.current = viewSourceOriginalIndices;

  const rowDataArr = useMemo(
    () => viewSources.map(({ bundle }) => buildRowData(bundle)),
    [viewSources],
  );

  const anySim = viewSources.find((s) => s.bundle.simulation)?.bundle.simulation;
  const occupiedSlots = useMemo(
    () => (anySim?.slots.filter((s) => s.operator) ?? []),
    [anySim],
  );
  const visibleSlotIds = useMemo(
    () => new Set(occupiedSlots.filter((s) => !hiddenOperators.has(s.slotId)).map((s) => s.slotId)),
    [occupiedSlots, hiddenOperators],
  );

  const resolveReference = (i: number): RowData | null => {
    if (comparisonMode === ComparisonModeType.RAW) return null;
    if (i === 0) return null;
    if (comparisonMode === ComparisonModeType.DELTA_AGAINST_BASE) return rowDataArr[0];
    return rowDataArr[i - 1];
  };

  // ── Column drag ─────────────────────────────────────────────────────────
  const headerRef = useRef<HTMLDivElement>(null);
  const [draggingCol, setDraggingCol] = useState<StatisticsColumnType | null>(null);

  const handleColumnMouseDown = useCallback((col: StatisticsColumnType, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    let hasMoved = false;
    let rafId = 0;

    const onMouseMove = (me: MouseEvent) => {
      if (!hasMoved && Math.abs(me.clientX - startX) < 4) return;
      if (!hasMoved) {
        hasMoved = true;
        setDraggingCol(col);
        document.body.style.cursor = 'grabbing';
      }

      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const header = headerRef.current;
        if (!header) return;
        const children = Array.from(header.children) as HTMLElement[];
        // Visible columns in current DOM order.
        const visNow = columnOrderRef.current.filter((id) => !hiddenColumns.has(id));
        const srcIdx = visNow.indexOf(col);
        if (srcIdx === -1) return;

        // Find insertion target among all cells (including dragged).
        let targetIdx = children.length - 1;
        for (let i = 0; i < children.length; i++) {
          const rect = children[i].getBoundingClientRect();
          if (me.clientX < rect.left + rect.width / 2) { targetIdx = i; break; }
        }
        if (targetIdx === srcIdx) return;

        const nextVis = [...visNow];
        nextVis.splice(srcIdx, 1);
        nextVis.splice(targetIdx, 0, col);
        // Rebuild full order: splice the visible-subsequence back into the
        // full order while preserving positions of hidden columns relative
        // to their neighbours.
        const visIter = nextVis[Symbol.iterator]();
        const nextFull = columnOrderRef.current.map((id) =>
          hiddenColumns.has(id) ? id : visIter.next().value!,
        );
        setColumnOrder(nextFull);
      });
    };

    const onMouseUp = () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      setDraggingCol(null);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [hiddenColumns]);

  // ── Row drag ────────────────────────────────────────────────────────────
  const bodyRef = useRef<HTMLDivElement>(null);
  const [draggingRow, setDraggingRow] = useState<number | null>(null);

  const handleRowMouseDown = useCallback((viewIdx: number, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const startY = e.clientY;
    let hasMoved = false;
    let currentIdx = viewIdx;
    let rafId = 0;

    const onMouseMove = (me: MouseEvent) => {
      if (!hasMoved && Math.abs(me.clientY - startY) < 4) return;
      if (!hasMoved) {
        hasMoved = true;
        setDraggingRow(currentIdx);
        document.body.style.cursor = 'grabbing';
      }

      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const body = bodyRef.current;
        if (!body) return;
        const groups = Array.from(body.querySelectorAll<HTMLElement>('[data-view-idx]'));
        if (groups.length === 0) return;

        // Pick the group whose bounds contain the cursor Y; if the cursor is
        // outside all groups, snap to the nearest end.
        let targetIdx = currentIdx;
        const firstRect = groups[0].getBoundingClientRect();
        const lastRect = groups[groups.length - 1].getBoundingClientRect();
        if (me.clientY < firstRect.top) {
          targetIdx = 0;
        } else if (me.clientY > lastRect.bottom) {
          targetIdx = groups.length - 1;
        } else {
          for (let i = 0; i < groups.length; i++) {
            const rect = groups[i].getBoundingClientRect();
            if (me.clientY >= rect.top && me.clientY <= rect.bottom) {
              targetIdx = i;
              break;
            }
          }
        }
        if (targetIdx !== currentIdx) {
          const indices = viewSourceOriginalIndicesRef.current;
          onReorderSources(indices[currentIdx], indices[targetIdx]);
          currentIdx = targetIdx;
          setDraggingRow(currentIdx);
        }
      });
    };

    const onMouseUp = () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      setDraggingRow(null);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [onReorderSources]);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="slc-stats slc-stats--grouped" onContextMenu={handleContextMenu}>
      <div className="slc-stats-grid">
        <div
          ref={headerRef}
          className={`slc-stats-head${draggingCol ? ' slc-stats-head--reordering' : ''}`}
          style={{ gridTemplateColumns: gridTemplate }}
        >
          {visibleColumns.map((id) => {
            const def = STATISTICS_COLUMN_DEF_MAP.get(id)!;
            return (
              <div
                key={id}
                className={`slc-stats-head-cell${id === draggingCol ? ' slc-stats-head-cell--dragging' : ''}`}
                onMouseDown={(e) => handleColumnMouseDown(id, e)}
              >
                {def.label}
              </div>
            );
          })}
        </div>

        <div ref={bodyRef} className="slc-stats-body">
          {viewSources.map(({ resolved }, i) => {
            const rowData = rowDataArr[i];
            if (!rowData) {
              return (
                <div
                  key={resolved.source.loadoutUuid}
                  data-view-idx={i}
                  className="slc-stats-row slc-stats-row--unresolved"
                >
                  <span className="slc-grab-handle" onMouseDown={(e) => handleRowMouseDown(i, e)} aria-hidden>
                    <span /><span /><span />
                  </span>
                  <span className="slc-tag-name">{resolved.label}</span>
                  <span className="statistics-empty-hint">Sheet data could not be loaded.</span>
                </div>
              );
            }
            const refRow = resolveReference(i);
            const sim = rowData.sim;
            const firstOp = sim.slots.find((s) => s.operator)?.operator;
            const accent = firstOp?.element
              ? (ELEMENT_COLORS[firstOp.element as ElementType] ?? '#8890a0')
              : '#8890a0';
            const visibleSlotsForRows = occupiedSlots.filter((s) => visibleSlotIds.has(s.slotId));
            const headerCtx: HeaderCellCtx = { resolved, rowData, refRow, cellContent };

            return (
              <section
                key={resolved.source.loadoutUuid}
                data-view-idx={i}
                className={`slc-view-group${draggingRow === i ? ' slc-view-group--dragging' : ''}`}
                style={{ '--accent': accent } as React.CSSProperties}
              >
                <span
                  className="slc-grab-handle"
                  onMouseDown={(e) => handleRowMouseDown(i, e)}
                  aria-label={t('common.dragReorder')}
                >
                  <span /><span /><span />
                </span>

                <div
                  className="slc-stats-row slc-stats-row--view-header"
                  style={{ gridTemplateColumns: gridTemplate } as React.CSSProperties}
                >
                  {visibleColumns.map((col) => (
                    <React.Fragment key={col}>
                      {renderViewHeaderCell(col, headerCtx)}
                    </React.Fragment>
                  ))}
                </div>

                {visibleSlotsForRows.map((slot) => {
                  const subCtx: SubrowCellCtx = {
                    resolved,
                    slot: { slotId: slot.slotId, operator: slot.operator! },
                    rowData, refRow, cellContent, formatPct, comparisonMode,
                  };
                  return (
                    <div
                      key={slot.slotId}
                      className="slc-stats-row slc-stats-row--sub"
                      style={{ gridTemplateColumns: gridTemplate } as React.CSSProperties}
                    >
                      {visibleColumns.map((col) => (
                        <React.Fragment key={col}>
                          {renderSubrowCell(col, subCtx)}
                        </React.Fragment>
                      ))}
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>
      </div>

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={buildStatisticsFilterItems({
            hiddenColumns,
            hiddenOperators,
            occupiedSlots,
            critMode,
            comparisonMode,
            onToggleColumn,
            onToggleOperator,
            onSetCritMode,
            onSetComparisonMode,
          })}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
});
