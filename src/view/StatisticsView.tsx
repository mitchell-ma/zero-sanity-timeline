import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LoadoutTree } from '../utils/loadoutStorage';
import type { StatisticsData, StatisticsSource } from '../utils/statisticsStorage';
import type {
  ResolvedSource,
  SourceStatsBundle,
} from '../controller/statistics/statisticsController';
import type { SimulationResult } from '../controller/statistics/simulateSheet';
import StatisticsLoadoutCard from './StatisticsLoadoutCard';
import StatisticsGroupedView from './StatisticsGroupedView';
import StatisticsSourcePickerModal from './StatisticsSourcePickerModal';
import { ComparisonModeType, CritMode, LoadoutNodeType, StatisticsColumnType } from '../consts/enums';
import { buildRowData, resolveReferenceIndex, type RowData } from './statisticsComparison';
import { t } from '../locales/locale';

/**
 * If every resolved source shares the same parent loadout (either it IS the
 * parent, or it's a view of it), returns that shared parent id. Otherwise
 * returns null — the caller falls back to the per-source stack layout.
 */
function detectSharedParentId(resolved: ResolvedSource[]): string | null {
  if (resolved.length < 2) return null;
  let sharedParentId: string | null = null;
  for (const r of resolved) {
    if (!r.node) return null;
    const parentId =
      r.node.type === LoadoutNodeType.LOADOUT_VIEW
        ? r.node.viewParentId ?? null
        : r.node.id;
    if (!parentId) return null;
    if (sharedParentId === null) sharedParentId = parentId;
    else if (sharedParentId !== parentId) return null;
  }
  return sharedParentId;
}

interface StatisticsViewProps {
  data: StatisticsData | null;
  statisticsName: string | null;
  loadoutTree: LoadoutTree;
  activeLoadoutId: string | null;
  resolvedSources: ResolvedSource[];
  sourceBundles: SourceStatsBundle[];
  onAddSource: (source: StatisticsSource) => void;
  onRemoveSource: (loadoutUuid: string) => void;
  onNewStatistics: (parentId: string | null) => void;
  onToggleColumn: (column: StatisticsColumnType) => void;
  onToggleOperator: (slotId: string) => void;
  onToggleAggregate: () => void;
  onSetCritMode: (critMode: CritMode) => void;
  onSetComparisonMode: (comparisonMode: ComparisonModeType) => void;
  onReorderSources: (fromIndex: number, toIndex: number) => void;
}

export default function StatisticsView({
  data, statisticsName, loadoutTree, activeLoadoutId, resolvedSources, sourceBundles,
  onAddSource, onRemoveSource, onNewStatistics, onToggleColumn, onToggleOperator, onToggleAggregate, onSetCritMode, onSetComparisonMode, onReorderSources,
}: StatisticsViewProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const hiddenColumns = useMemo<ReadonlySet<StatisticsColumnType>>(
    () => new Set(data?.hiddenColumns ?? []),
    [data?.hiddenColumns],
  );
  const hiddenOperators = useMemo<ReadonlySet<string>>(
    () => new Set(data?.hiddenOperators ?? []),
    [data?.hiddenOperators],
  );
  const hiddenAggregate = data?.hiddenAggregate ?? false;
  const critMode = data?.critMode ?? CritMode.EXPECTED;
  const comparisonMode = data?.comparisonMode ?? ComparisonModeType.RAW;

  /** Grouped view mode kicks in when every source shares a parent loadout. */
  const sharedParentId = useMemo(() => detectSharedParentId(resolvedSources), [resolvedSources]);
  const groupedLabel = useMemo(() => {
    if (!sharedParentId) return null;
    const parentNode = loadoutTree.nodes.find((n) => n.id === sharedParentId);
    return parentNode?.name ?? null;
  }, [sharedParentId, loadoutTree]);

  // Pair resolved sources with their bundles. Memoized so the array + wrapper
  // object identities only change when the underlying data actually changes —
  // otherwise React.memo on StatisticsGroupedView / StatisticsGroupedTable is
  // defeated and expensive buildRowData() calls fire on every UI click.
  const pairedSources = useMemo(
    () => resolvedSources.map((r, i) => ({ resolved: r, bundle: sourceBundles[i] })),
    [resolvedSources, sourceBundles],
  );

  // Build RowData per source for inter-loadout comparison mode. Cached by
  // simulation identity — content-hashed upstream, so unchanged sources return
  // the same object reference and we reuse the previously-built RowData.
  const rowDataCacheRef = useRef(new WeakMap<SimulationResult, RowData>());
  const rowDataArr = useMemo(() => {
    const cache = rowDataCacheRef.current;
    return sourceBundles.map((bundle) => {
      if (!bundle?.simulation) return null;
      const cached = cache.get(bundle.simulation);
      if (cached) return cached;
      const built = buildRowData(bundle);
      if (built) cache.set(bundle.simulation, built);
      return built;
    });
  }, [sourceBundles]);

  if (!data) {
    return (
      <div className="statistics-view statistics-view--empty">
        <div className="statistics-empty-state">
          <p>{t('statistics.view.noSheetSelected')}</p>
          <button
            className="statistics-cta-btn"
            onClick={() => onNewStatistics(null)}
          >{t('statistics.view.createFirst')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="statistics-view">
      <div className="statistics-header">
        <button className="statistics-edit-btn" onClick={() => setPickerOpen(true)}>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden>
            <path d="M12.854.146a.5.5 0 00-.707 0L10.5 1.793 14.207 5.5l1.647-1.646a.5.5 0 000-.708l-3-3zM13.5 6.207L9.793 2.5 1 11.293V15h3.707L13.5 6.207z"/>
          </svg>
          <span>{t('statistics.sources.edit')}</span>
        </button>
        <h2 className="statistics-title">{statisticsName ?? t('statistics.view.untitled')}</h2>
      </div>

      {resolvedSources.length === 0 ? (
        <div className="statistics-empty-hint">{t('statistics.sources.empty')}</div>
      ) : sharedParentId ? (
        <StatisticsGroupedView
          label={groupedLabel ?? t('statistics.view.untitled')}
          sources={pairedSources}
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
      ) : (
        <InterLoadoutStack
          resolvedSources={resolvedSources}
          sourceBundles={sourceBundles}
          rowDataArr={rowDataArr}
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
      )}

      <StatisticsSourcePickerModal
        open={pickerOpen}
        tree={loadoutTree}
        activeLoadoutId={activeLoadoutId}
        currentSources={data.sources}
        onCommit={(additions, removals) => {
          for (const uuid of removals) onRemoveSource(uuid);
          for (const src of additions) onAddSource(src);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </div>
  );
}

// ── Inter-loadout stack (drag-reorder + per-card reference) ─────────────────

interface InterLoadoutStackProps {
  resolvedSources: ResolvedSource[];
  sourceBundles: SourceStatsBundle[];
  rowDataArr: Array<RowData | null>;
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

function InterLoadoutStack({
  resolvedSources, sourceBundles, rowDataArr, hiddenColumns, hiddenOperators, hiddenAggregate,
  critMode, comparisonMode, onToggleColumn, onToggleOperator, onToggleAggregate, onSetCritMode,
  onSetComparisonMode, onReorderSources,
}: InterLoadoutStackProps) {
  const stackRef = useRef<HTMLDivElement>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

  // Mirror reorder callback to a ref so the mousemove closure always calls
  // the latest one after the parent rebuilds its sources array.
  const onReorderRef = useRef(onReorderSources);
  useEffect(() => { onReorderRef.current = onReorderSources; }, [onReorderSources]);

  const handleDragStart = useCallback((startIdx: number, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const startY = e.clientY;
    let hasMoved = false;
    let currentIdx = startIdx;
    let rafId = 0;

    const onMouseMove = (me: MouseEvent) => {
      if (!hasMoved && Math.abs(me.clientY - startY) < 4) return;
      if (!hasMoved) {
        hasMoved = true;
        setDraggingIdx(currentIdx);
        document.body.style.cursor = 'grabbing';
      }

      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const stack = stackRef.current;
        if (!stack) return;
        const cards = Array.from(stack.querySelectorAll<HTMLElement>('[data-card-idx]'));
        if (cards.length === 0) return;

        // Find which card the cursor is currently over vertically; snap to
        // the nearest end when outside the stack's bounds.
        let targetIdx = currentIdx;
        const firstRect = cards[0].getBoundingClientRect();
        const lastRect = cards[cards.length - 1].getBoundingClientRect();
        if (me.clientY < firstRect.top) {
          targetIdx = 0;
        } else if (me.clientY > lastRect.bottom) {
          targetIdx = cards.length - 1;
        } else {
          for (let i = 0; i < cards.length; i++) {
            const rect = cards[i].getBoundingClientRect();
            if (me.clientY >= rect.top && me.clientY <= rect.bottom) {
              targetIdx = i;
              break;
            }
          }
        }
        if (targetIdx !== currentIdx) {
          onReorderRef.current(currentIdx, targetIdx);
          currentIdx = targetIdx;
          setDraggingIdx(currentIdx);
        }
      });
    };

    const onMouseUp = () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      setDraggingIdx(null);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  return (
    <div ref={stackRef} className="statistics-sources-stack">
      {resolvedSources.map((r, i) => {
        const refIdx = resolveReferenceIndex(i, comparisonMode);
        const reference = refIdx == null ? null : rowDataArr[refIdx];
        return (
          <StatisticsSourceCard
            key={r.source.loadoutUuid}
            cardIndex={i}
            resolved={r}
            bundle={sourceBundles[i]}
            reference={reference}
            dragging={draggingIdx === i}
            onDragStart={(e) => handleDragStart(i, e)}
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
          />
        );
      })}
    </div>
  );
}

// ── Per-source card ─────────────────────────────────────────────────────────

function StatisticsSourceCard({
  resolved, bundle, reference, dragging, cardIndex, onDragStart,
  hiddenColumns, hiddenOperators, hiddenAggregate, critMode, comparisonMode,
  onToggleColumn, onToggleOperator, onToggleAggregate, onSetCritMode, onSetComparisonMode,
}: {
  resolved: ResolvedSource;
  bundle: SourceStatsBundle;
  reference: RowData | null;
  dragging: boolean;
  cardIndex: number;
  onDragStart: (e: React.MouseEvent) => void;
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
}) {
  const missing = !resolved.node;
  const sim = bundle?.simulation;

  if (missing || !sim) {
    return (
      <section
        className={`slc slc--unresolved${dragging ? ' slc--dragging' : ''}`}
        data-card-idx={cardIndex}
      >
        <span
          className="slc-grab-handle slc-grab-handle--card"
          onMouseDown={onDragStart}
          aria-label={t('common.dragReorder')}
        >
          <span /><span /><span />
        </span>
        <header className="slc-titlebar">
          <span className="slc-titlebar-name">{resolved.label}</span>
          {missing && <span className="statistics-source-badge">{t('statistics.sources.missing')}</span>}
        </header>
        {!missing && (
          <div className="statistics-empty-hint">{t('statistics.sources.unresolved')}</div>
        )}
      </section>
    );
  }

  return (
    <StatisticsLoadoutCard
      label={resolved.label}
      simulation={sim}
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
      onDragStart={onDragStart}
      dragging={dragging}
      cardIndex={cardIndex}
    />
  );
}
