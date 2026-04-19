/**
 * Source picker for statistics sheets.
 *
 * Structurally mirrors `ExportModal` — same search row, count badge, quick-
 * action chips (All / Invert / None), marquee-drag invert, folder partial
 * checkboxes, shift-range. Reuses the `.export-*` CSS classes so the two
 * modals feel like one cohesive selection UI.
 *
 * Differences from ExportModal:
 *   - Targets a statistics sheet's sources, not a bundle export.
 *   - Pre-selects the sheet's currently-added loadouts (by uuid).
 *   - Allows `LOADOUT_VIEW` entries in addition to `LOADOUT`.
 *   - Commits a diff on submit: add newly-checked, remove newly-unchecked.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { LoadoutTree, LoadoutNode, flattenTreeNodes, getChildrenOf } from '../utils/loadoutStorage';
import type { StatisticsSource } from '../utils/statisticsStorage';
import { LoadoutNodeType } from '../consts/enums';
import { t } from '../locales/locale';

interface Props {
  open: boolean;
  tree: LoadoutTree;
  activeLoadoutId: string | null;
  currentSources: StatisticsSource[];
  onCommit: (additions: StatisticsSource[], removals: string[]) => void;
  onClose: () => void;
}

type CheckState = 'off' | 'on' | 'partial';

function Check({ state }: { state: CheckState }) {
  return (
    <span className={`ex-check ex-check--${state}`} aria-hidden>
      <svg viewBox="0 0 14 14" width="14" height="14">
        <rect x="1" y="1" width="12" height="12" rx="1.5" className="ex-check-box" />
        {state === 'on' && (
          <path d="M3.4 7.2 L5.9 9.7 L10.6 4.6" className="ex-check-mark" />
        )}
        {state === 'partial' && (
          <rect x="3.5" y="6.3" width="7" height="1.4" rx="0.6" className="ex-check-mark-partial" />
        )}
      </svg>
    </span>
  );
}

/** Every LOADOUT + LOADOUT_VIEW descendant id of a folder, recursively. */
function collectSelectableDescendants(tree: LoadoutTree, folderId: string): string[] {
  const result: string[] = [];
  const children = getChildrenOf(tree, folderId);
  for (const c of children) {
    if (c.type === LoadoutNodeType.LOADOUT || c.type === LoadoutNodeType.LOADOUT_VIEW) result.push(c.id);
    if (c.type === LoadoutNodeType.FOLDER) result.push(...collectSelectableDescendants(tree, c.id));
    // LOADOUT can host LOADOUT_VIEW children — recurse into loadouts too.
    if (c.type === LoadoutNodeType.LOADOUT) result.push(...collectSelectableDescendants(tree, c.id));
  }
  return result;
}

const MARQUEE_THRESHOLD_PX = 4;

export default function StatisticsSourcePickerModal({
  open, tree, activeLoadoutId, currentSources, onCommit, onClose,
}: Props) {
  // Pre-selected: map each current source uuid back to its tree node id.
  const initialSelection = useMemo(() => {
    const out = new Set<string>();
    for (const src of currentSources) {
      const node = tree.nodes.find((n) => n.uuid === src.loadoutUuid);
      if (node) out.add(node.id);
    }
    return out;
  }, [currentSources, tree]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(initialSelection);
  const [query, setQuery] = useState('');
  const lastClickedRef = useRef<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const marqueeActiveRef = useRef(false);
  const marqueeJustEndedRef = useRef(false);
  const marqueeBaseRef = useRef<Set<string>>(new Set());
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const selectedIdsRef = useRef(selectedIds);
  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);

  /** Every LOADOUT + LOADOUT_VIEW node id in the tree — stable base set. */
  const allSelectableIds = useMemo(
    () => tree.nodes
      .filter((n) => n.type === LoadoutNodeType.LOADOUT || n.type === LoadoutNodeType.LOADOUT_VIEW)
      .map((n) => n.id),
    [tree],
  );

  // Reset state whenever the modal opens.
  useEffect(() => {
    if (!open) return;
    setSelectedIds(new Set(initialSelection));
    setQuery('');
    lastClickedRef.current = null;
    const h = window.setTimeout(() => searchRef.current?.focus(), 40);
    return () => window.clearTimeout(h);
  }, [open, initialSelection]);

  // ── Filter ───────────────────────────────────────────────────
  const queryLower = query.trim().toLowerCase();
  const visibleIds = useMemo(() => {
    if (!queryLower) return null;
    const matching = new Set<string>();
    for (const node of tree.nodes) {
      const selectable = node.type === LoadoutNodeType.LOADOUT || node.type === LoadoutNodeType.LOADOUT_VIEW;
      if (!selectable) continue;
      if (node.name.toLowerCase().includes(queryLower)) {
        matching.add(node.id);
        let cur: LoadoutNode | undefined = node;
        while (cur?.parentId) {
          const pid: string = cur.parentId;
          matching.add(pid);
          cur = tree.nodes.find((n) => n.id === pid);
        }
      }
    }
    return matching;
  }, [tree, queryLower]);

  const flattened = useMemo(
    () => flattenTreeNodes(tree).filter(({ node }) => !visibleIds || visibleIds.has(node.id)),
    [tree, visibleIds],
  );

  const orderedSelectableIds = useMemo(
    () => flattened
      .filter(({ node }) => node.type === LoadoutNodeType.LOADOUT || node.type === LoadoutNodeType.LOADOUT_VIEW)
      .map(({ node }) => node.id),
    [flattened],
  );

  const orderedSelectableIdSet = useMemo(() => new Set(orderedSelectableIds), [orderedSelectableIds]);
  const visibleSelectedCount = useMemo(
    () => orderedSelectableIds.reduce((acc, id) => acc + (selectedIds.has(id) ? 1 : 0), 0),
    [orderedSelectableIds, selectedIds],
  );
  const totalSelectedCount = selectedIds.size;
  const totalSelectableCount = allSelectableIds.length;

  // ── Mutations ────────────────────────────────────────────────
  const toggleOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectRange = useCallback((from: string, to: string) => {
    const a = orderedSelectableIds.indexOf(from);
    const b = orderedSelectableIds.indexOf(to);
    if (a < 0 || b < 0) return;
    const [start, end] = a < b ? [a, b] : [b, a];
    const range = orderedSelectableIds.slice(start, end + 1);
    const shouldSelect = !selectedIds.has(to);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of range) {
        if (shouldSelect) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, [orderedSelectableIds, selectedIds]);

  const toggleFolder = useCallback((folderId: string) => {
    const descendants = collectSelectableDescendants(tree, folderId).filter((id) => orderedSelectableIdSet.has(id));
    if (descendants.length === 0) return;
    const anyOff = descendants.some((id) => !selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (anyOff) for (const id of descendants) next.add(id);
      else for (const id of descendants) next.delete(id);
      return next;
    });
  }, [tree, orderedSelectableIdSet, selectedIds]);

  const handleRowClick = useCallback((e: React.MouseEvent, id: string) => {
    if (marqueeJustEndedRef.current) { marqueeJustEndedRef.current = false; return; }
    if (e.shiftKey && lastClickedRef.current && lastClickedRef.current !== id) {
      selectRange(lastClickedRef.current, id);
    } else {
      toggleOne(id);
    }
    lastClickedRef.current = id;
  }, [selectRange, toggleOne]);

  const handleFolderClick = useCallback((id: string) => {
    if (marqueeJustEndedRef.current) { marqueeJustEndedRef.current = false; return; }
    toggleFolder(id);
  }, [toggleFolder]);

  // ── Marquee ──────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (!el) return;

    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea')) return;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      marqueeBaseRef.current = new Set(selectedIdsRef.current);
    };

    const onMove = (e: MouseEvent) => {
      const start = dragStartRef.current;
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (!marqueeActiveRef.current && Math.hypot(dx, dy) > MARQUEE_THRESHOLD_PX) {
        marqueeActiveRef.current = true;
      }
      if (!marqueeActiveRef.current) return;

      const rect = { x1: start.x, y1: start.y, x2: e.clientX, y2: e.clientY };
      setMarquee(rect);

      const left = Math.min(rect.x1, rect.x2);
      const right = Math.max(rect.x1, rect.x2);
      const top = Math.min(rect.y1, rect.y2);
      const bottom = Math.max(rect.y1, rect.y2);

      const rows = el.querySelectorAll<HTMLElement>('[data-loadout-id]');
      const inside = new Set<string>();
      rows.forEach((row) => {
        const r = row.getBoundingClientRect();
        const id = row.dataset.loadoutId;
        if (!id) return;
        if (r.right >= left && r.left <= right && r.bottom >= top && r.top <= bottom) {
          inside.add(id);
        }
      });

      const base = marqueeBaseRef.current;
      const next = new Set<string>();
      base.forEach((id) => { if (!inside.has(id)) next.add(id); });
      inside.forEach((id) => { if (!base.has(id)) next.add(id); });
      setSelectedIds(next);
    };

    const onUp = () => {
      if (marqueeActiveRef.current) marqueeJustEndedRef.current = true;
      marqueeActiveRef.current = false;
      dragStartRef.current = null;
      setMarquee(null);
    };

    el.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      el.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [open]);

  // ── Quick actions ────────────────────────────────────────────
  const handleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (queryLower) {
        const next = new Set(prev);
        for (const id of orderedSelectableIds) next.add(id);
        return next;
      }
      return new Set(allSelectableIds);
    });
  }, [queryLower, orderedSelectableIds, allSelectableIds]);

  const handleSelectNone = useCallback(() => {
    setSelectedIds((prev) => {
      if (queryLower) {
        const next = new Set(prev);
        for (const id of orderedSelectableIds) next.delete(id);
        return next;
      }
      return new Set();
    });
  }, [queryLower, orderedSelectableIds]);

  const handleInvert = useCallback(() => {
    setSelectedIds((prev) => {
      const target = queryLower ? orderedSelectableIds : allSelectableIds;
      const next = new Set(prev);
      for (const id of target) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }, [queryLower, orderedSelectableIds, allSelectableIds]);

  /** Diff against the initial selection and commit additions + removals. */
  const handleCommit = useCallback(() => {
    const additions: StatisticsSource[] = [];
    const removals: string[] = [];
    selectedIds.forEach((id) => {
      if (!initialSelection.has(id)) {
        const node = tree.nodes.find((n) => n.id === id);
        if (node) additions.push({ loadoutUuid: node.uuid });
      }
    });
    initialSelection.forEach((id) => {
      if (!selectedIds.has(id)) {
        const node = tree.nodes.find((n) => n.id === id);
        if (node) removals.push(node.uuid);
      }
    });
    onCommit(additions, removals);
    onClose();
  }, [selectedIds, initialSelection, tree, onCommit, onClose]);

  // ── Keyboard ─────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        handleSelectAll();
        return;
      }
      if (e.key === 'Enter') {
        if (!(document.activeElement instanceof HTMLInputElement)) {
          e.preventDefault();
          handleCommit();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose, handleSelectAll, handleCommit]);

  if (!open) return null;

  const filteredEmpty = flattened.length === 0;
  const marqueeRect = marquee ? {
    left: Math.min(marquee.x1, marquee.x2),
    top: Math.min(marquee.y1, marquee.y2),
    width: Math.abs(marquee.x2 - marquee.x1),
    height: Math.abs(marquee.y2 - marquee.y1),
  } : null;

  // Diff size for the commit button label.
  let addCount = 0;
  let removeCount = 0;
  selectedIds.forEach((id) => { if (!initialSelection.has(id)) addCount++; });
  initialSelection.forEach((id) => { if (!selectedIds.has(id)) removeCount++; });
  const diffSize = addCount + removeCount;

  return (
    <div className="devlog-overlay" onClick={onClose}>
      <div className="export-modal" onClick={(e) => e.stopPropagation()}>
        <header className="export-modal-header">
          <div className="export-modal-title-row">
            <h2 className="export-modal-title">{t('statistics.picker.title')}</h2>
            <button className="export-modal-close" onClick={onClose} aria-label={t('common.close')}>&times;</button>
          </div>
          <p className="export-modal-subtitle">{t('statistics.picker.subtitle')}</p>
        </header>

        <div className="export-search-row">
          <svg className="export-search-icon" viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden>
            <path d="M11.742 10.344a6.5 6.5 0 10-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 001.415-1.414l-3.85-3.85a1.007 1.007 0 00-.115-.1zM12 6.5a5.5 5.5 0 11-11 0 5.5 5.5 0 0111 0z"/>
          </svg>
          <input
            ref={searchRef}
            className="export-search-input"
            placeholder={t('export.search.placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="export-search-clear" onClick={() => setQuery('')} aria-label={t('common.clearFilter')}>&times;</button>
          )}
        </div>

        <div className="export-action-bar">
          <span className="export-count-badge">
            <span className="export-count-bracket">[</span>
            <span className="export-count-n">{String(queryLower ? visibleSelectedCount : totalSelectedCount).padStart(2, '0')}</span>
            <span className="export-count-sep">/</span>
            <span className="export-count-total">{String(queryLower ? orderedSelectableIds.length : totalSelectableCount).padStart(2, '0')}</span>
            <span className="export-count-bracket">]</span>
            <span className="export-count-label">{queryLower ? t('export.count.visible') : t('export.count.selected')}</span>
          </span>
          <div className="export-chip-group" role="group">
            <button className="export-chip" onClick={handleSelectAll}>{t('export.action.all')}</button>
            <button className="export-chip" onClick={handleInvert}>{t('export.action.invert')}</button>
            <button className="export-chip" onClick={handleSelectNone}>{t('export.action.none')}</button>
          </div>
        </div>

        <div ref={listRef} className="export-modal-list">
          {filteredEmpty && (
            <div className="export-modal-empty">{t('export.empty')}</div>
          )}

          {flattened.map(({ node, depth }) => {
            if (node.type === LoadoutNodeType.FOLDER) {
              const descendants = collectSelectableDescendants(tree, node.id).filter((id) => orderedSelectableIdSet.has(id));
              const selCount = descendants.reduce((acc, id) => acc + (selectedIds.has(id) ? 1 : 0), 0);
              const state: CheckState = selCount === 0 ? 'off' : selCount === descendants.length ? 'on' : 'partial';
              const disabled = descendants.length === 0;
              return (
                <button
                  key={node.id}
                  type="button"
                  className={`export-node export-node--folder${disabled ? ' export-node--empty' : ''}`}
                  style={{ paddingLeft: 10 + depth * 18 }}
                  onClick={() => !disabled && handleFolderClick(node.id)}
                  disabled={disabled}
                >
                  <Check state={state} />
                  <span className="export-folder-glyph">{'\u25BC'}</span>
                  <span className="export-node-name">{node.name}</span>
                  {descendants.length > 0 && (
                    <span className="export-folder-count">{selCount}/{descendants.length}</span>
                  )}
                </button>
              );
            }
            if (node.type !== LoadoutNodeType.LOADOUT && node.type !== LoadoutNodeType.LOADOUT_VIEW) return null;
            const isActive = node.id === activeLoadoutId;
            const isSelected = selectedIds.has(node.id);
            const isView = node.type === LoadoutNodeType.LOADOUT_VIEW;
            return (
              <button
                key={node.id}
                type="button"
                data-loadout-id={node.id}
                className={`export-node export-node--loadout${isSelected ? ' export-node--selected' : ''}${isActive ? ' export-node--active' : ''}`}
                style={{ paddingLeft: 10 + depth * 18 }}
                onClick={(e) => handleRowClick(e, node.id)}
              >
                <Check state={isSelected ? 'on' : 'off'} />
                {isView && <span className="export-folder-glyph" aria-hidden>{'\u25C7'}</span>}
                <span className="export-node-name">{node.name}</span>
                {isActive && <span className="export-node-badge">{t('export.badge.active')}</span>}
              </button>
            );
          })}
        </div>

        <footer className="export-modal-footer">
          <span className="export-footer-hint">{t('export.hint')}</span>
          <div className="export-footer-actions">
            <button className="export-btn export-btn--ghost" onClick={onClose}>{t('export.cancel')}</button>
            <button
              className="export-btn export-btn--primary"
              onClick={handleCommit}
              disabled={diffSize === 0}
            >
              <span>{t('statistics.picker.commit', { count: diffSize })}</span>
            </button>
          </div>
        </footer>

        {marqueeRect && marqueeRect.width > 1 && marqueeRect.height > 1 && (
          <div
            className="export-marquee"
            style={{
              left: marqueeRect.left,
              top: marqueeRect.top,
              width: marqueeRect.width,
              height: marqueeRect.height,
            }}
          />
        )}
      </div>
    </div>
  );
}
