import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { LoadoutTree, LoadoutNode, flattenTreeNodes, getChildrenOf } from '../utils/loadoutStorage';
import { LoadoutNodeType } from '../consts/enums';
import { isCommunityLoadoutId } from '../app/communityLoadouts';
import { t } from '../locales/locale';

interface CollaborationManageLoadoutsDialogProps {
  open: boolean;
  tree: LoadoutTree;
  /** UUIDs currently being shared in the active host session. */
  sharedUuids: string[];
  onShareLoadout: (uuid: string) => void;
  onUnshareLoadout: (uuid: string) => void;
  onClose: () => void;
}

type CheckState = 'off' | 'on' | 'partial';

function SharedIcon() {
  return (
    <span
      className="loadout-node-sync-icon"
      title="Currently shared with collaborators"
      aria-label={t('collab.manageLoadouts.sharedAria')}
      style={{ display: 'inline-flex', alignItems: 'center', marginLeft: 4, opacity: 0.85 }}
    >
      <svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor" aria-hidden>
        <path d="M5.5 6a2 2 0 100-4 2 2 0 000 4zm5 0a2 2 0 100-4 2 2 0 000 4zM1 13c0-2.1 2-3.5 4.5-3.5S10 10.9 10 13v1H1v-1zm9 0c0-.8-.2-1.6-.6-2.2.4-.2.8-.3 1.3-.3 2 0 3.8 1.1 3.8 2.7V14H10v-1z"/>
      </svg>
    </span>
  );
}

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

function collectLoadoutDescendants(tree: LoadoutTree, folderId: string): string[] {
  const result: string[] = [];
  const children = getChildrenOf(tree, folderId);
  for (const c of children) {
    if (c.type === LoadoutNodeType.LOADOUT && !isCommunityLoadoutId(c.id)) result.push(c.id);
    if (c.type === LoadoutNodeType.FOLDER) result.push(...collectLoadoutDescendants(tree, c.id));
  }
  return result;
}

export default function CollaborationManageLoadoutsDialog({
  open, tree, sharedUuids, onShareLoadout, onUnshareLoadout, onClose,
}: CollaborationManageLoadoutsDialogProps) {
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const lastClickedRef = useRef<string | null>(null);

  // Live "shared" set derived from prop — each toggle calls share/unshare directly.
  const sharedUuidSet = useMemo(() => new Set(sharedUuids), [sharedUuids]);

  const uuidByNodeId = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of tree.nodes) m.set(n.id, n.uuid);
    return m;
  }, [tree]);

  // Resolve node id <-> uuid: picker operates on node ids for ordering/UI;
  // the collab layer keys by uuid.
  const selectedIds = useMemo(() => {
    const s = new Set<string>();
    for (const n of tree.nodes) if (sharedUuidSet.has(n.uuid)) s.add(n.id);
    return s;
  }, [tree, sharedUuidSet]);

  const allLoadoutIds = useMemo(
    () => tree.nodes
      .filter((n) => n.type === LoadoutNodeType.LOADOUT && !isCommunityLoadoutId(n.id))
      .map((n) => n.id),
    [tree],
  );

  useEffect(() => {
    if (!open) return;
    setQuery('');
    lastClickedRef.current = null;
    const h = window.setTimeout(() => searchRef.current?.focus(), 40);
    return () => window.clearTimeout(h);
  }, [open]);

  // ── Filter ─────────────────────────────────────────────────
  const queryLower = query.trim().toLowerCase();
  const visibleIds = useMemo(() => {
    if (!queryLower) return null;
    const matching = new Set<string>();
    for (const node of tree.nodes) {
      if (node.type === LoadoutNodeType.LOADOUT_VIEW) continue;
      if (isCommunityLoadoutId(node.id)) continue;
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
      .filter(({ node }) => !isCommunityLoadoutId(node.id))
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

  // ── Apply a diff ─────────────────────────────────────────────
  const applyDiff = useCallback((add: readonly string[], remove: readonly string[]) => {
    add.forEach((id) => {
      const uuid = uuidByNodeId.get(id);
      if (uuid && !sharedUuidSet.has(uuid)) onShareLoadout(uuid);
    });
    remove.forEach((id) => {
      const uuid = uuidByNodeId.get(id);
      if (uuid && sharedUuidSet.has(uuid)) onUnshareLoadout(uuid);
    });
  }, [uuidByNodeId, sharedUuidSet, onShareLoadout, onUnshareLoadout]);

  const toggleOne = useCallback((id: string) => {
    const uuid = uuidByNodeId.get(id);
    if (!uuid) return;
    if (sharedUuidSet.has(uuid)) onUnshareLoadout(uuid);
    else onShareLoadout(uuid);
  }, [uuidByNodeId, sharedUuidSet, onShareLoadout, onUnshareLoadout]);

  const selectRange = useCallback((from: string, to: string) => {
    const a = orderedLoadoutIds.indexOf(from);
    const b = orderedLoadoutIds.indexOf(to);
    if (a < 0 || b < 0) return;
    const [start, end] = a < b ? [a, b] : [b, a];
    const range = orderedLoadoutIds.slice(start, end + 1);
    const shouldAdd = !selectedIds.has(to);
    if (shouldAdd) applyDiff(range, []);
    else applyDiff([], range);
  }, [orderedLoadoutIds, selectedIds, applyDiff]);

  const toggleFolder = useCallback((folderId: string) => {
    const descendants = collectLoadoutDescendants(tree, folderId).filter((id) => orderedLoadoutIdSet.has(id));
    if (descendants.length === 0) return;
    const anyOff = descendants.some((id) => !selectedIds.has(id));
    if (anyOff) applyDiff(descendants, []);
    else applyDiff([], descendants);
  }, [tree, orderedLoadoutIdSet, selectedIds, applyDiff]);

  const handleRowClick = useCallback((e: React.MouseEvent, id: string) => {
    if (e.shiftKey && lastClickedRef.current && lastClickedRef.current !== id) {
      selectRange(lastClickedRef.current, id);
    } else {
      toggleOne(id);
    }
    lastClickedRef.current = id;
  }, [selectRange, toggleOne]);

  // ── Quick actions ───────────────────────────────────────────
  const handleSelectAll = useCallback(() => {
    const target = queryLower ? orderedLoadoutIds : allLoadoutIds;
    applyDiff(target, []);
  }, [queryLower, orderedLoadoutIds, allLoadoutIds, applyDiff]);

  const handleSelectNone = useCallback(() => {
    const target = queryLower ? orderedLoadoutIds : allLoadoutIds;
    applyDiff([], target);
  }, [queryLower, orderedLoadoutIds, allLoadoutIds, applyDiff]);

  const handleInvert = useCallback(() => {
    const target = queryLower ? orderedLoadoutIds : allLoadoutIds;
    const toAdd: string[] = [];
    const toRemove: string[] = [];
    for (const id of target) {
      if (selectedIds.has(id)) toRemove.push(id);
      else toAdd.push(id);
    }
    applyDiff(toAdd, toRemove);
  }, [queryLower, orderedLoadoutIds, allLoadoutIds, selectedIds, applyDiff]);

  // ── Keyboard ────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        if (!(document.activeElement instanceof HTMLInputElement)) {
          e.preventDefault();
          handleSelectAll();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose, handleSelectAll]);

  if (!open) return null;

  const filteredEmpty = flattened.length === 0;

  return (
    <div className="devlog-overlay" onClick={onClose}>
      <div className="export-modal" onClick={(e) => e.stopPropagation()}>
        <header className="export-modal-header">
          <div className="export-modal-title-row">
            <h2 className="export-modal-title">Manage Shared Loadouts</h2>
            <button className="export-modal-close" onClick={onClose} aria-label={t('common.close')}>&times;</button>
          </div>
          <p className="export-modal-subtitle">Changes apply live — peers see updates immediately.</p>
        </header>

        <div className="export-search-row">
          <svg className="export-search-icon" viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden>
            <path d="M11.742 10.344a6.5 6.5 0 10-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 001.415-1.414l-3.85-3.85a1.007 1.007 0 00-.115-.1zM12 6.5a5.5 5.5 0 11-11 0 5.5 5.5 0 0111 0z"/>
          </svg>
          <input
            ref={searchRef}
            className="export-search-input"
            placeholder={t('collab.host.placeholder.filter')}
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
            <span className="export-count-total">{String(queryLower ? orderedLoadoutIds.length : totalLoadoutCount).padStart(2, '0')}</span>
            <span className="export-count-bracket">]</span>
            <span className="export-count-label">shared</span>
          </span>
          <div className="export-chip-group" role="group">
            <button className="export-chip" onClick={handleSelectAll}>all</button>
            <button className="export-chip" onClick={handleInvert}>invert</button>
            <button className="export-chip" onClick={handleSelectNone}>none</button>
          </div>
        </div>

        <div ref={listRef} className="export-modal-list">
          {filteredEmpty && (
            <div className="export-modal-empty">No loadouts available.</div>
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
                  onClick={() => !disabled && toggleFolder(node.id)}
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
            const isSelected = selectedIds.has(node.id);
            return (
              <button
                key={node.id}
                type="button"
                data-loadout-id={node.id}
                className={`export-node export-node--loadout${isSelected ? ' export-node--selected' : ''}`}
                style={{ paddingLeft: 10 + depth * 18 }}
                onClick={(e) => handleRowClick(e, node.id)}
              >
                <Check state={isSelected ? 'on' : 'off'} />
                <span className="export-node-name">{node.name}</span>
                {isSelected && <SharedIcon />}
              </button>
            );
          })}
        </div>

        <footer className="export-modal-footer">
          <span className="export-footer-hint">Click to toggle · Shift+click for range</span>
          <div className="export-footer-actions">
            <button className="export-btn export-btn--primary" onClick={onClose}>Done</button>
          </div>
        </footer>
      </div>
    </div>
  );
}

