import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { LoadoutTree, LoadoutNode, flattenTreeNodes, loadLoadoutData, getChildrenOf } from '../utils/loadoutStorage';
import { exportMultiLoadoutBundle } from '../utils/sheetStorage';
import { LoadoutNodeType } from '../consts/enums';
import { t } from '../locales/locale';

interface ExportModalProps {
  open: boolean;
  tree: LoadoutTree;
  activeLoadoutId: string | null;
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

/** Collect every LOADOUT descendant id of a given folder (recursing through subfolders). */
function collectLoadoutDescendants(tree: LoadoutTree, folderId: string): string[] {
  const result: string[] = [];
  const children = getChildrenOf(tree, folderId);
  for (const c of children) {
    if (c.type === LoadoutNodeType.LOADOUT) result.push(c.id);
    if (c.type === LoadoutNodeType.FOLDER) result.push(...collectLoadoutDescendants(tree, c.id));
  }
  return result;
}

const MARQUEE_THRESHOLD_PX = 4;

export default function ExportModal({ open, tree, activeLoadoutId, onClose }: ExportModalProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const lastClickedRef = useRef<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Marquee-drag state (invert selection as the rect passes over loadouts)
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const marqueeActiveRef = useRef(false);
  const marqueeJustEndedRef = useRef(false);
  const marqueeBaseRef = useRef<Set<string>>(new Set());
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const selectedIdsRef = useRef(selectedIds);
  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);

  const allLoadoutIds = useMemo(
    () => tree.nodes.filter((n) => n.type === LoadoutNodeType.LOADOUT).map((n) => n.id),
    [tree],
  );

  // Reset selection to everything and focus search whenever the modal opens.
  useEffect(() => {
    if (!open) return;
    setSelectedIds(new Set(allLoadoutIds));
    setQuery('');
    lastClickedRef.current = null;
    const handle = window.setTimeout(() => searchRef.current?.focus(), 40);
    return () => window.clearTimeout(handle);
  }, [open, allLoadoutIds]);

  // ── Filter logic ────────────────────────────────────────────
  const queryLower = query.trim().toLowerCase();
  const visibleIds = useMemo(() => {
    if (!queryLower) return null; // null = no filter
    const matching = new Set<string>();
    for (const node of tree.nodes) {
      if (node.type === LoadoutNodeType.LOADOUT_VIEW) continue;
      if (node.name.toLowerCase().includes(queryLower) && node.type === LoadoutNodeType.LOADOUT) {
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
    () => flattenTreeNodes(tree)
      .filter(({ node }) => node.type !== LoadoutNodeType.LOADOUT_VIEW)
      .filter(({ node }) => !visibleIds || visibleIds.has(node.id)),
    [tree, visibleIds],
  );

  const orderedLoadoutIds = useMemo(
    () => flattened.filter(({ node }) => node.type === LoadoutNodeType.LOADOUT).map(({ node }) => node.id),
    [flattened],
  );

  const orderedLoadoutIdSet = useMemo(() => new Set(orderedLoadoutIds), [orderedLoadoutIds]);
  const visibleSelectedCount = useMemo(
    () => orderedLoadoutIds.reduce((acc, id) => acc + (selectedIds.has(id) ? 1 : 0), 0),
    [orderedLoadoutIds, selectedIds],
  );
  const totalSelectedCount = selectedIds.size;
  const totalLoadoutCount = allLoadoutIds.length;

  // ── Mutation helpers ────────────────────────────────────────
  const toggleOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectRange = useCallback((from: string, to: string) => {
    const a = orderedLoadoutIds.indexOf(from);
    const b = orderedLoadoutIds.indexOf(to);
    if (a < 0 || b < 0) return;
    const [start, end] = a < b ? [a, b] : [b, a];
    const range = orderedLoadoutIds.slice(start, end + 1);
    const shouldSelect = !selectedIds.has(to);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of range) {
        if (shouldSelect) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, [orderedLoadoutIds, selectedIds]);

  const toggleFolder = useCallback((folderId: string) => {
    const descendants = collectLoadoutDescendants(tree, folderId).filter((id) => orderedLoadoutIdSet.has(id));
    if (descendants.length === 0) return;
    const anyOff = descendants.some((id) => !selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (anyOff) for (const id of descendants) next.add(id);
      else for (const id of descendants) next.delete(id);
      return next;
    });
  }, [tree, orderedLoadoutIdSet, selectedIds]);

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

  // ── Marquee drag: sweeping a row toggles (inverts) its state ────────────
  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (!el) return;

    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      // Don't initiate marquee from form-like controls inside the list.
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

      // Selection = baseline XOR rows inside the marquee (inversion)
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

  // ── Quick action handlers ───────────────────────────────────
  const handleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (queryLower) {
        const next = new Set(prev);
        for (const id of orderedLoadoutIds) next.add(id);
        return next;
      }
      return new Set(allLoadoutIds);
    });
  }, [queryLower, orderedLoadoutIds, allLoadoutIds]);

  const handleSelectNone = useCallback(() => {
    setSelectedIds((prev) => {
      if (queryLower) {
        const next = new Set(prev);
        for (const id of orderedLoadoutIds) next.delete(id);
        return next;
      }
      return new Set();
    });
  }, [queryLower, orderedLoadoutIds]);

  const handleInvert = useCallback(() => {
    setSelectedIds((prev) => {
      const target = queryLower ? orderedLoadoutIds : allLoadoutIds;
      const next = new Set(prev);
      for (const id of target) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }, [queryLower, orderedLoadoutIds, allLoadoutIds]);

  const handleExport = useCallback(() => {
    exportMultiLoadoutBundle(tree, selectedIds, (id) => loadLoadoutData(id));
    onClose();
  }, [tree, selectedIds, onClose]);

  // ── Keyboard shortcuts ──────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        handleSelectAll();
        return;
      }
      if (e.key === 'Enter' && selectedIds.size > 0) {
        if (!(document.activeElement instanceof HTMLInputElement)) {
          e.preventDefault();
          handleExport();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose, handleSelectAll, handleExport, selectedIds.size]);

  if (!open) return null;

  const filteredEmpty = flattened.length === 0;
  const marqueeRect = marquee ? {
    left: Math.min(marquee.x1, marquee.x2),
    top: Math.min(marquee.y1, marquee.y2),
    width: Math.abs(marquee.x2 - marquee.x1),
    height: Math.abs(marquee.y2 - marquee.y1),
  } : null;

  return (
    <div className="devlog-overlay" onClick={onClose}>
      <div className="export-modal" onClick={(e) => e.stopPropagation()}>
        <header className="export-modal-header">
          <div className="export-modal-title-row">
            <h2 className="export-modal-title">{t('export.title')}</h2>
            <button className="export-modal-close" onClick={onClose} aria-label="Close">&times;</button>
          </div>
          <p className="export-modal-subtitle">{t('export.subtitle')}</p>
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
            <button className="export-search-clear" onClick={() => setQuery('')} aria-label="Clear filter">&times;</button>
          )}
        </div>

        <div className="export-action-bar">
          <span className="export-count-badge">
            <span className="export-count-bracket">[</span>
            <span className="export-count-n">{String(queryLower ? visibleSelectedCount : totalSelectedCount).padStart(2, '0')}</span>
            <span className="export-count-sep">/</span>
            <span className="export-count-total">{String(queryLower ? orderedLoadoutIds.length : totalLoadoutCount).padStart(2, '0')}</span>
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
              const descendants = collectLoadoutDescendants(tree, node.id).filter((id) => orderedLoadoutIdSet.has(id));
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
            const isActive = node.id === activeLoadoutId;
            const isSelected = selectedIds.has(node.id);
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
              onClick={handleExport}
              disabled={selectedIds.size === 0}
            >
              <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden>
                <path d="M8 1a.5.5 0 01.5.5v7.793l2.646-2.647a.5.5 0 01.708.708l-3.5 3.5a.5.5 0 01-.708 0l-3.5-3.5a.5.5 0 11.708-.708L7.5 9.293V1.5A.5.5 0 018 1zM2.5 12a.5.5 0 01.5.5V14h10v-1.5a.5.5 0 011 0V14a1 1 0 01-1 1H3a1 1 0 01-1-1v-1.5a.5.5 0 01.5-.5z"/>
              </svg>
              <span>{t('export.exportCount', { count: selectedIds.size })}</span>
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
