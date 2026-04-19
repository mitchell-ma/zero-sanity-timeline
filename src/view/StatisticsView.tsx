import { useState, useMemo } from 'react';
import type { LoadoutTree } from '../utils/loadoutStorage';
import type { StatisticsData, StatisticsSource } from '../utils/statisticsStorage';
import type {
  ResolvedSource,
  SourceStatsBundle,
} from '../controller/statistics/statisticsController';
import StatisticsLoadoutCard from './StatisticsLoadoutCard';
import StatisticsGroupedView from './StatisticsGroupedView';
import StatisticsSourcePickerModal from './StatisticsSourcePickerModal';
import { ComparisonModeType, CritMode, LoadoutNodeType, StatisticsColumnType } from '../consts/enums';
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
  onSetCritMode: (critMode: CritMode) => void;
  onSetComparisonMode: (comparisonMode: ComparisonModeType) => void;
  onReorderSources: (fromIndex: number, toIndex: number) => void;
}

export default function StatisticsView({
  data, statisticsName, loadoutTree, activeLoadoutId, resolvedSources, sourceBundles,
  onAddSource, onRemoveSource, onNewStatistics, onToggleColumn, onToggleOperator, onSetCritMode, onSetComparisonMode, onReorderSources,
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
  const critMode = data?.critMode ?? CritMode.EXPECTED;
  const comparisonMode = data?.comparisonMode ?? ComparisonModeType.RAW;

  /** Grouped view mode kicks in when every source shares a parent loadout. */
  const sharedParentId = useMemo(() => detectSharedParentId(resolvedSources), [resolvedSources]);
  const groupedLabel = useMemo(() => {
    if (!sharedParentId) return null;
    const parentNode = loadoutTree.nodes.find((n) => n.id === sharedParentId);
    return parentNode?.name ?? null;
  }, [sharedParentId, loadoutTree]);

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
          sources={resolvedSources.map((r, i) => ({ resolved: r, bundle: sourceBundles[i] }))}
          hiddenColumns={hiddenColumns}
          hiddenOperators={hiddenOperators}
          critMode={critMode}
          comparisonMode={comparisonMode}
          onToggleColumn={onToggleColumn}
          onToggleOperator={onToggleOperator}
          onSetCritMode={onSetCritMode}
          onSetComparisonMode={onSetComparisonMode}
          onReorderSources={onReorderSources}
        />
      ) : (
        <div className="statistics-sources-stack">
          {resolvedSources.map((r, i) => (
            <StatisticsSourceCard
              key={r.source.loadoutUuid}
              resolved={r}
              bundle={sourceBundles[i]}
              hiddenColumns={hiddenColumns}
              hiddenOperators={hiddenOperators}
              critMode={critMode}
              comparisonMode={comparisonMode}
              onToggleColumn={onToggleColumn}
              onToggleOperator={onToggleOperator}
              onSetCritMode={onSetCritMode}
              onSetComparisonMode={onSetComparisonMode}
            />
          ))}
        </div>
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

// ── Per-source card ─────────────────────────────────────────────────────────

function StatisticsSourceCard({
  resolved, bundle, hiddenColumns, hiddenOperators, critMode, comparisonMode, onToggleColumn, onToggleOperator, onSetCritMode, onSetComparisonMode,
}: {
  resolved: ResolvedSource;
  bundle: SourceStatsBundle;
  hiddenColumns: ReadonlySet<StatisticsColumnType>;
  hiddenOperators: ReadonlySet<string>;
  critMode: CritMode;
  comparisonMode: ComparisonModeType;
  onToggleColumn: (column: StatisticsColumnType) => void;
  onToggleOperator: (slotId: string) => void;
  onSetCritMode: (critMode: CritMode) => void;
  onSetComparisonMode: (comparisonMode: ComparisonModeType) => void;
}) {
  const missing = !resolved.node;
  const sim = bundle.simulation;

  if (missing || !sim) {
    return (
      <section className="slc slc--unresolved">
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
      critMode={critMode}
      comparisonMode={comparisonMode}
      onToggleColumn={onToggleColumn}
      onToggleOperator={onToggleOperator}
      onSetCritMode={onSetCritMode}
      onSetComparisonMode={onSetComparisonMode}
    />
  );
}
