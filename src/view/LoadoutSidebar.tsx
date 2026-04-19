import { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import {
  LoadoutTree,
  LoadoutNode,
  getChildrenOf,
  addFolder,
  removeNode,
  renameNode,
  toggleFolder,
  moveNode,
  uniqueName,
  isReadOnlyNode,
} from '../utils/loadoutStorage';
import { LoadoutNodeType, SidebarMode as SidebarModeEnum } from '../consts/enums';
import { t } from '../locales/locale';
import { COMMUNITY_FOLDERS, CommunityFolder } from '../app/communityLoadouts';

export type SidebarMode = SidebarModeEnum | null;

interface LoadoutSidebarProps {
  tree: LoadoutTree;
  activeLoadoutId: string | null;
  onTreeChange: (tree: LoadoutTree) => void;
  onSelectLoadout: (id: string) => void;
  onNewLoadout: (parentId: string | null) => void;
  onDuplicateLoadout: (sourceId: string) => void;
  onDeleteLoadout: (loadoutIds: string[], nodeId: string) => void;
  onDownloadLoadout: (loadoutId: string) => void;
  onShareLoadout: (loadoutId: string) => Promise<boolean>;
  onExport: () => void;
  onImport: () => void;
  onWarning?: (message: string) => void;
  onLoadCommunityLoadout: (loadoutId: string) => void;
  onOpenViewsModal: (parentLoadoutId: string) => void;
  onClearViews: (parentLoadoutId: string) => void;
  /** Per-view-id flag indicating placement validation errors (warning icon). */
  viewWarningMap?: Record<string, boolean>;
  sidebarMode: SidebarMode;
  onSidebarModeChange: (mode: SidebarMode) => void;
}


/** Get a flattened list of visible node IDs in render order. */
function flattenVisibleNodes(
  tree: LoadoutTree,
  parentId: string | null,
  visibleIds: Set<string> | null,
  filterActive: boolean,
): string[] {
  const result: string[] = [];
  const children = getChildrenOf(tree, parentId);
  for (const node of children) {
    if (visibleIds && !visibleIds.has(node.id)) continue;
    result.push(node.id);
    if (node.type === LoadoutNodeType.FOLDER && (!node.collapsed || filterActive)) {
      result.push(...flattenVisibleNodes(tree, node.id, visibleIds, filterActive));
    } else if (node.type === LoadoutNodeType.LOADOUT && (!node.collapsed || filterActive)) {
      // LOADOUT_VIEW children are nested under their parent loadout
      result.push(...flattenVisibleNodes(tree, node.id, visibleIds, filterActive));
    }
  }
  return result;
}

const LoadoutSidebar = forwardRef<HTMLDivElement, LoadoutSidebarProps>(function LoadoutSidebar({
  tree,
  activeLoadoutId,
  onTreeChange,
  onSelectLoadout,
  onNewLoadout,
  onDuplicateLoadout,
  onDeleteLoadout,
  onDownloadLoadout,
  onShareLoadout,
  onExport,
  onImport,
  onWarning,
  onLoadCommunityLoadout,
  onOpenViewsModal,
  onClearViews,
  viewWarningMap,
  sidebarMode,
  onSidebarModeChange,
}, ref) {
  const [filter, setFilter] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameRef = useRef<HTMLInputElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string | null; position: 'before' | 'inside' | 'after' } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; nodeId: string | null; parentId: string | null } | null>(null);
  const [copiedNodeId, setCopiedNodeId] = useState<string | null>(null);

  // ─── Multi-select state ───────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastClickedRef = useRef<string | null>(null);

  // ─── Marquee state ────────────────────────────────────────────────────
  const [marquee, setMarquee] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  const marqueeActiveRef = useRef(false);
  const marqueeJustEndedRef = useRef(false);
  const marqueeAdditiveRef = useRef(false);
  const marqueeBaseRef = useRef<Set<string>>(new Set());
  const selectedIdsRef = useRef(selectedIds);
  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);
  const treeRef = useRef<HTMLDivElement>(null);

  // Focus rename input when it appears
  useEffect(() => {
    if (renamingId && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [renamingId]);

  const filterLower = filter.toLowerCase();

  // Compute which nodes match filter (and their ancestor folders)
  const visibleIds = useMemo(() => {
    if (!filterLower) return null; // null = show all
    const matching = new Set<string>();
    for (const node of tree.nodes) {
      if (node.name.toLowerCase().includes(filterLower)) {
        matching.add(node.id);
        // Add all ancestors
        let current = node;
        while (current.parentId) {
          matching.add(current.parentId);
          const currentNode = current;
          const parent = tree.nodes.find((n) => n.id === currentNode.parentId);
          if (!parent) break;
          current = parent;
        }
      }
    }
    return matching;
  }, [tree, filterLower]);

  // Flattened visible node order for shift-click range selection
  const flatOrder = useMemo(
    () => flattenVisibleNodes(tree, null, visibleIds, !!filterLower),
    [tree, visibleIds, filterLower],
  );

  const handleAddLoadout = useCallback((parentId: string | null) => {
    onNewLoadout(parentId);
  }, [onNewLoadout]);

  const handleAddFolder = useCallback((parentId: string | null) => {
    const result = addFolder(tree, 'New Folder', parentId);
    if ('error' in result) {
      onWarning?.(result.error);
      return;
    }
    onTreeChange(result.tree);
    setRenamingId(result.node.id);
    setRenameValue(result.node.name);
  }, [tree, onTreeChange, onWarning]);

  const handleRenameSubmit = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      const node = tree.nodes.find((n) => n.id === renamingId);
      const finalName = uniqueName(tree, renameValue.trim(), node?.parentId ?? null, renamingId);
      onTreeChange(renameNode(tree, renamingId, finalName));
    }
    setRenamingId(null);
  }, [renamingId, renameValue, tree, onTreeChange]);

  const handleDelete = useCallback((nodeId: string) => {
    const { tree: newTree, removedLoadoutIds } = removeNode(tree, nodeId);
    onDeleteLoadout(removedLoadoutIds, nodeId);
    onTreeChange(newTree);
  }, [tree, onTreeChange, onDeleteLoadout]);

  const handleBatchDelete = useCallback((nodeIds: string[]) => {
    let currentTree = tree;
    const allRemovedLoadoutIds: string[] = [];
    for (const nodeId of nodeIds) {
      // Node may have been removed already as child of a previously deleted folder
      if (!currentTree.nodes.find((n) => n.id === nodeId)) continue;
      const { tree: newTree, removedLoadoutIds } = removeNode(currentTree, nodeId);
      currentTree = newTree;
      allRemovedLoadoutIds.push(...removedLoadoutIds);
    }
    // Use the first nodeId for the onDeleteLoadout callback
    onDeleteLoadout(allRemovedLoadoutIds, nodeIds[0]);
    onTreeChange(currentTree);
    setSelectedIds(new Set());
  }, [tree, onTreeChange, onDeleteLoadout]);

  const handleShare = useCallback(async (nodeId: string) => {
    const ok = await onShareLoadout(nodeId);
    if (ok) {
      setCopiedNodeId(nodeId);
      setTimeout(() => setCopiedNodeId((prev) => (prev === nodeId ? null : prev)), 1400);
    }
  }, [onShareLoadout]);

  const handleToggleFolder = useCallback((folderId: string) => {
    onTreeChange(toggleFolder(tree, folderId));
  }, [tree, onTreeChange]);

  // ─── Click selection logic ────────────────────────────────────────────
  const handleNodeClick = useCallback((e: React.MouseEvent, node: LoadoutNode) => {
    if (e.ctrlKey || e.metaKey) {
      // Toggle individual selection
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(node.id)) next.delete(node.id);
        else next.add(node.id);
        return next;
      });
      lastClickedRef.current = node.id;
    } else if (e.shiftKey && lastClickedRef.current) {
      // Range select from last clicked to this node
      const lastIdx = flatOrder.indexOf(lastClickedRef.current);
      const curIdx = flatOrder.indexOf(node.id);
      if (lastIdx >= 0 && curIdx >= 0) {
        const start = Math.min(lastIdx, curIdx);
        const end = Math.max(lastIdx, curIdx);
        const range = new Set(flatOrder.slice(start, end + 1));
        setSelectedIds(range);
      }
    } else {
      // Normal click — select single, also trigger loadout switch / folder toggle
      setSelectedIds(new Set([node.id]));
      lastClickedRef.current = node.id;
      if (node.type === LoadoutNodeType.LOADOUT || node.type === LoadoutNodeType.LOADOUT_VIEW) {
        onSelectLoadout(node.id);
      } else {
        handleToggleFolder(node.id);
      }
    }
  }, [flatOrder, onSelectLoadout, handleToggleFolder]);

  // ─── Marquee selection ────────────────────────────────────────────────
  useEffect(() => {
    if (!treeRef.current) return;

    const handleMouseDown = (e: MouseEvent) => {
      // Only start marquee on direct clicks on the tree container (not on nodes)
      const isNode = (e.target as HTMLElement).closest('.loadout-node');
      if (isNode || e.button !== 0) return;
      marqueeActiveRef.current = true;
      marqueeAdditiveRef.current = e.ctrlKey || e.metaKey;
      marqueeBaseRef.current = marqueeAdditiveRef.current ? new Set(selectedIdsRef.current) : new Set();
      setMarquee({ startX: e.clientX, startY: e.clientY, endX: e.clientX, endY: e.clientY });
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!marqueeActiveRef.current) return;
      setMarquee((prev) => prev ? { ...prev, endX: e.clientX, endY: e.clientY } : null);
    };

    const handleMouseUp = () => {
      if (marqueeActiveRef.current) {
        // Suppress the click event that fires after mouseup so it doesn't clear the selection
        marqueeJustEndedRef.current = true;
      }
      marqueeActiveRef.current = false;
      setMarquee(null);
    };

    const el = treeRef.current;
    el.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      el.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Compute marquee-selected nodes
  useEffect(() => {
    if (!marquee || !treeRef.current) return;
    const rect = {
      left: Math.min(marquee.startX, marquee.endX),
      top: Math.min(marquee.startY, marquee.endY),
      right: Math.max(marquee.startX, marquee.endX),
      bottom: Math.max(marquee.startY, marquee.endY),
    };
    const nodeEls = treeRef.current.querySelectorAll('.loadout-node');
    const selected = new Set<string>(marqueeBaseRef.current);
    nodeEls.forEach((el) => {
      const r = el.getBoundingClientRect();
      const nodeId = (el as HTMLElement).dataset.nodeId;
      if (!nodeId) return;
      // Check overlap
      if (r.right >= rect.left && r.left <= rect.right && r.bottom >= rect.top && r.top <= rect.bottom) {
        selected.add(nodeId);
      }
    });
    setSelectedIds(selected);
  }, [marquee]);

  // ─── Drag & Drop ───────────────────────────────────────────────────────
  const handleDragStart = useCallback((e: React.DragEvent, nodeId: string) => {
    setDragId(nodeId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', nodeId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, nodeId: string | null, position: 'before' | 'inside' | 'after') => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget({ id: nodeId, position });
  }, []);

  const handleDragLeave = useCallback(() => {
    setDropTarget(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!dragId || !dropTarget) { setDragId(null); setDropTarget(null); return; }

    const dragNode = tree.nodes.find((n) => n.id === dragId);
    if (!dragNode) { setDragId(null); setDropTarget(null); return; }

    let newParentId: string | null;
    let newOrder: number;

    const targetNode = dropTarget.id ? tree.nodes.find((n) => n.id === dropTarget.id) : null;

    if (dropTarget.position === 'inside' && targetNode?.type === LoadoutNodeType.FOLDER) {
      // Drop inside a folder
      newParentId = targetNode.id;
      newOrder = getChildrenOf(tree, targetNode.id).length;
    } else {
      // Drop before/after a sibling
      newParentId = targetNode?.parentId ?? null;
      const siblings = getChildrenOf(tree, newParentId);
      const targetIdx = targetNode ? siblings.findIndex((s) => s.id === targetNode.id) : siblings.length;
      newOrder = dropTarget.position === 'after' ? targetIdx + 1 : targetIdx;
    }

    const result = moveNode(tree, dragId, newParentId, newOrder);
    if (typeof result === 'object' && 'error' in result) {
      onWarning?.(result.error);
    } else {
      onTreeChange(result);
    }
    setDragId(null);
    setDropTarget(null);
  }, [dragId, dropTarget, tree, onTreeChange, onWarning]);

  const handleDragEnd = useCallback(() => {
    setDragId(null);
    setDropTarget(null);
  }, []);

  // ─── Tree rendering ────────────────────────────────────────────────────
  const renderNode = (node: LoadoutNode, depth: number) => {
    if (visibleIds && !visibleIds.has(node.id)) return null;

    const isView = node.type === LoadoutNodeType.LOADOUT_VIEW;
    const isLoadoutLike = node.type === LoadoutNodeType.LOADOUT || isView;
    const isActive = isLoadoutLike && node.id === activeLoadoutId;
    const isSelected = selectedIds.has(node.id);
    const isDragging = node.id === dragId;
    const isDropInside = dropTarget?.id === node.id && dropTarget.position === 'inside';
    const isDropBefore = dropTarget?.id === node.id && dropTarget.position === 'before';
    const isDropAfter = dropTarget?.id === node.id && dropTarget.position === 'after';

    const children =
      node.type === LoadoutNodeType.FOLDER || node.type === LoadoutNodeType.LOADOUT
        ? getChildrenOf(tree, node.id)
        : [];
    const hasViewChildren =
      node.type === LoadoutNodeType.LOADOUT && children.some((c) => c.type === LoadoutNodeType.LOADOUT_VIEW);
    const isCollapsed =
      ((node.type === LoadoutNodeType.FOLDER) || (node.type === LoadoutNodeType.LOADOUT && hasViewChildren)) &&
      node.collapsed === true && !filterLower;

    return (
      <div key={node.id} style={{ opacity: isDragging ? 0.4 : 1 }}>
        {isDropBefore && <div className="loadout-drop-indicator" style={{ marginLeft: depth * 16 }} />}
        <div
          className={`loadout-node${isActive ? ' loadout-node--active' : ''}${isSelected && !isActive ? ' loadout-node--selected' : ''}${isDropInside ? ' loadout-node--drop-target' : ''}${isView ? ' loadout-node--view' : ''}`}
          style={{ paddingLeft: 8 + depth * 16 }}
          data-node-id={node.id}
          draggable={!isView && renamingId !== node.id}
          onDragStart={(e) => !isView && renamingId !== node.id && handleDragStart(e, node.id)}
          onDragOver={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const y = e.clientY - rect.top;
            const third = rect.height / 3;
            if (node.type === LoadoutNodeType.FOLDER && y > third && y < third * 2) {
              handleDragOver(e, node.id, 'inside');
            } else if (y < rect.height / 2) {
              handleDragOver(e, node.id, 'before');
            } else {
              handleDragOver(e, node.id, 'after');
            }
          }}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onDragEnd={handleDragEnd}
          onClick={(e) => handleNodeClick(e, node)}
          onDoubleClick={() => {
            if (isView) return; // view names are derived; no rename
            setRenamingId(node.id);
            setRenameValue(node.name);
          }}
          title={isView ? t('sidebar.view.readonlyTooltip') : undefined}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            // If right-clicking a selected node with multi-selection, keep the selection
            if (!selectedIds.has(node.id) || selectedIds.size <= 1) {
              setSelectedIds(new Set([node.id]));
              // Load the loadout when right-clicking it
              if (isLoadoutLike) onSelectLoadout(node.id);
            }
            setCtxMenu({ x: e.clientX, y: e.clientY, nodeId: node.id, parentId: node.type === LoadoutNodeType.FOLDER ? node.id : node.parentId });
          }}
        >
          {node.type === LoadoutNodeType.FOLDER ? (
            <span className="loadout-node-icon loadout-node-chevron">
              {isCollapsed ? '\u25B6' : '\u25BC'}
            </span>
          ) : node.type === LoadoutNodeType.LOADOUT && hasViewChildren ? (
            <span
              className="loadout-node-icon loadout-node-chevron"
              onClick={(e) => {
                e.stopPropagation();
                onTreeChange({
                  nodes: tree.nodes.map((n) => n.id === node.id ? { ...n, collapsed: !n.collapsed } : n),
                });
              }}
              role="button"
            >
              {isCollapsed ? '\u25B6' : '\u25BC'}
            </span>
          ) : isView ? (
            <span className="loadout-node-icon loadout-view-icon" aria-hidden>{'\u25C7'}</span>
          ) : (
            <span className="loadout-node-icon loadout-node-dot">
              {isActive ? '\u25CF' : '\u25CB'}
            </span>
          )}

          {renamingId === node.id ? (
            <input
              ref={renameRef}
              className="loadout-rename-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={handleRenameSubmit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameSubmit();
                if (e.key === 'Escape') setRenamingId(null);
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="loadout-node-name">
              {node.name}
              {isView && viewWarningMap?.[node.id] && (
                <span
                  className="loadout-view-warning"
                  title={t('sidebar.view.invalidTooltip')}
                  aria-label="invalid permutation"
                >{'\u26A0'}</span>
              )}
            </span>
          )}

          <span className="loadout-node-actions" onClick={(e) => e.stopPropagation()}>
            {isView ? null : node.type === LoadoutNodeType.FOLDER ? (
              <>
                <button
                  className="loadout-action-btn"
                  title={t('sidebar.btn.newLoadout')}
                  onClick={() => handleAddLoadout(node.id)}
                >+</button>
                <button
                  className="loadout-action-btn"
                  title={t('sidebar.btn.newFolder')}
                  onClick={() => handleAddFolder(node.id)}
                >
                  <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
                    <path d="M1 3.5A1.5 1.5 0 012.5 2h3.879a1.5 1.5 0 011.06.44l1.122 1.12A1.5 1.5 0 009.62 4H13.5A1.5 1.5 0 0115 5.5v7a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12.5v-9z"/>
                  </svg>
                </button>
              </>
            ) : (
              <>
                <button
                  className="loadout-action-btn"
                  title={t('sidebar.btn.download')}
                  onClick={() => onDownloadLoadout(node.id)}
                >
                  <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
                    <path d="M8 1a.5.5 0 01.5.5v7.793l2.646-2.647a.5.5 0 01.708.708l-3.5 3.5a.5.5 0 01-.708 0l-3.5-3.5a.5.5 0 11.708-.708L7.5 9.293V1.5A.5.5 0 018 1zM2.5 12a.5.5 0 01.5.5V14h10v-1.5a.5.5 0 011 0V14a1 1 0 01-1 1H3a1 1 0 01-1-1v-1.5a.5.5 0 01.5-.5z"/>
                  </svg>
                </button>
                <button
                  className={`loadout-action-btn${copiedNodeId === node.id ? ' loadout-action-btn--copied' : ''}`}
                  title={copiedNodeId === node.id ? t('sidebar.btn.shareCopied') : t('sidebar.btn.share')}
                  onClick={() => handleShare(node.id)}
                >
                  {copiedNodeId === node.id ? (
                    <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
                      <path d="M13.854 3.646a.5.5 0 010 .708l-7 7a.5.5 0 01-.708 0l-3.5-3.5a.5.5 0 11.708-.708L6.5 10.293l6.646-6.647a.5.5 0 01.708 0z"/>
                    </svg>
                  ) : (
                    <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
                      <path d="M4.715 6.542 3.343 7.914a3 3 0 1 0 4.243 4.243l1.828-1.829A3 3 0 0 0 8.586 5.5L8 6.086a1.002 1.002 0 0 0-.154.199 2 2 0 0 1 .861 3.337L6.88 11.45a2 2 0 1 1-2.83-2.83l.793-.792a4.018 4.018 0 0 1-.128-1.287z"/>
                      <path d="M6.586 4.672A3 3 0 0 0 7.414 9.5l.775-.776a2 2 0 0 1-.896-3.346L9.12 3.55a2 2 0 1 1 2.83 2.83l-.793.792c.112.42.155.855.128 1.287l1.372-1.372a3 3 0 1 0-4.243-4.243L6.586 4.672z"/>
                    </svg>
                  )}
                </button>
              </>
            )}
          </span>
        </div>
        {isDropAfter && <div className="loadout-drop-indicator" style={{ marginLeft: depth * 16 }} />}

        {(node.type === LoadoutNodeType.FOLDER || node.type === LoadoutNodeType.LOADOUT) && !isCollapsed && children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  const rootNodes = getChildrenOf(tree, null);

  const handleIconClick = (mode: SidebarModeEnum) => {
    if (sidebarMode === mode) {
      // Same icon clicked — collapse the panel
      onSidebarModeChange(null);
    } else {
      onSidebarModeChange(mode);
    }
  };

  // Marquee rectangle in CSS coordinates
  const marqueeRect = marquee ? {
    left: Math.min(marquee.startX, marquee.endX),
    top: Math.min(marquee.startY, marquee.endY),
    width: Math.abs(marquee.endX - marquee.startX),
    height: Math.abs(marquee.endY - marquee.startY),
  } : null;

  return (
    <div ref={ref} className="sidebar-container" tabIndex={-1}>
      {/* ── Icon strip (always visible) ────────────────────────── */}
      <div className="sidebar-icon-strip">
        <button
          className={`sidebar-mode-btn${sidebarMode === SidebarModeEnum.LOADOUTS ? ' sidebar-mode-btn--active' : ''}`}
          onClick={() => handleIconClick(SidebarModeEnum.LOADOUTS)}
          title={t('sidebar.tooltip.loadouts')}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
          </svg>
        </button>
        <button
          className={`sidebar-mode-btn${sidebarMode === SidebarModeEnum.WORKBENCH ? ' sidebar-mode-btn--active' : ''}`}
          onClick={() => handleIconClick(SidebarModeEnum.WORKBENCH)}
          title={t('sidebar.tooltip.workbench')}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/>
          </svg>
        </button>
      </div>

      {/* ── Loadouts panel ─────────────────────────────────────── */}
      {sidebarMode === SidebarModeEnum.LOADOUTS && (
        <div className="sidebar-panel">
          <div className="loadout-sidebar-header">
            <span className="loadout-sidebar-title">{t('sidebar.title')}</span>
            <div className="loadout-sidebar-header-actions">
              <button
                className="loadout-action-btn"
                title={t('sidebar.btn.newLoadout')}
                onClick={() => handleAddLoadout(null)}
              >+</button>
              <button
                className="loadout-action-btn"
                title={t('sidebar.btn.newFolder')}
                onClick={() => handleAddFolder(null)}
              >
                <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
                  <path d="M1 3.5A1.5 1.5 0 012.5 2h3.879a1.5 1.5 0 011.06.44l1.122 1.12A1.5 1.5 0 009.62 4H13.5A1.5 1.5 0 0115 5.5v7a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12.5v-9z"/>
                </svg>
              </button>
              <button
                className="loadout-action-btn"
                title={t('sidebar.btn.import')}
                onClick={onImport}
              >
                <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
                  <path d="M8 1a.5.5 0 01.354.146l3.5 3.5a.5.5 0 01-.708.708L8.5 2.707V10.5a.5.5 0 01-1 0V2.707L4.854 5.354a.5.5 0 11-.708-.708l3.5-3.5A.5.5 0 018 1zM2.5 12a.5.5 0 01.5.5V14h10v-1.5a.5.5 0 011 0V14a1 1 0 01-1 1H3a1 1 0 01-1-1v-1.5a.5.5 0 01.5-.5z"/>
                </svg>
              </button>
              <button
                className="loadout-action-btn"
                title={t('sidebar.btn.export')}
                onClick={onExport}
              >
                <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
                  <path d="M8 1a.5.5 0 01.5.5v7.793l2.646-2.647a.5.5 0 01.708.708l-3.5 3.5a.5.5 0 01-.708 0l-3.5-3.5a.5.5 0 11.708-.708L7.5 9.293V1.5A.5.5 0 018 1zM2.5 12a.5.5 0 01.5.5V14h10v-1.5a.5.5 0 011 0V14a1 1 0 01-1 1H3a1 1 0 01-1-1v-1.5a.5.5 0 01.5-.5z"/>
                </svg>
              </button>
            </div>
          </div>

          <div className="loadout-filter-row">
            <input
              className="loadout-filter-input"
              placeholder={t('sidebar.filter.placeholder')}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>

          <div
            ref={treeRef}
            className="loadout-tree"
            onDragOver={(e) => {
              e.preventDefault();
              const isOverChild = (e.target as HTMLElement).closest('.loadout-node');
              if (!isOverChild) setDropTarget({ id: null, position: 'inside' });
            }}
            onDrop={handleDrop}
            onContextMenu={(e) => {
              const isOverNode = (e.target as HTMLElement).closest('.loadout-node');
              if (!isOverNode) {
                e.preventDefault();
                setCtxMenu({ x: e.clientX, y: e.clientY, nodeId: null, parentId: null });
              }
            }}
            onClick={(e) => {
              if (marqueeJustEndedRef.current) {
                marqueeJustEndedRef.current = false;
                return;
              }
              if (e.ctrlKey || e.metaKey) return;
              const isOverNode = (e.target as HTMLElement).closest('.loadout-node');
              if (!isOverNode) setSelectedIds(new Set());
            }}
          >
            <CommunitySection folders={COMMUNITY_FOLDERS} activeId={activeLoadoutId} onLoad={onLoadCommunityLoadout} onDuplicate={onDuplicateLoadout} />
            {rootNodes.length === 0 && !filter && (
              <div className="loadout-empty">{t('sidebar.empty')}</div>
            )}
            {rootNodes.map((node) => renderNode(node, 0))}
            {filter && visibleIds?.size === 0 && (
              <div className="loadout-empty">{t('sidebar.emptyFilter')}</div>
            )}
          </div>

          {marqueeRect && marqueeRect.width > 3 && marqueeRect.height > 3 && (
            <div
              className="loadout-marquee"
              style={{
                position: 'fixed',
                left: marqueeRect.left,
                top: marqueeRect.top,
                width: marqueeRect.width,
                height: marqueeRect.height,
              }}
            />
          )}

          {ctxMenu && createPortal(
            <LoadoutContextMenu
              x={ctxMenu.x}
              y={ctxMenu.y}
              nodeId={ctxMenu.nodeId}
              node={ctxMenu.nodeId ? tree.nodes.find((n) => n.id === ctxMenu.nodeId) ?? null : null}
              parentId={ctxMenu.parentId}
              selectedIds={selectedIds}
              onNewLoadout={(parentId) => { handleAddLoadout(parentId); setCtxMenu(null); }}
              onNewFolder={(parentId) => { handleAddFolder(parentId); setCtxMenu(null); }}
              onDuplicate={(nodeId) => { onDuplicateLoadout(nodeId); setCtxMenu(null); }}
              onRename={(nodeId) => {
                const node = tree.nodes.find((n) => n.id === nodeId);
                if (node) { setRenamingId(nodeId); setRenameValue(node.name); }
                setCtxMenu(null);
              }}
              onDelete={(nodeId) => { handleDelete(nodeId); setCtxMenu(null); }}
              onBatchDelete={(ids) => { handleBatchDelete(ids); setCtxMenu(null); }}
              onDownload={(nodeId) => { onDownloadLoadout(nodeId); setCtxMenu(null); }}
              onShare={(nodeId) => { handleShare(nodeId); setCtxMenu(null); }}
              onCreateViews={(nodeId) => { onOpenViewsModal(nodeId); setCtxMenu(null); }}
              onClearViews={(nodeId) => { onClearViews(nodeId); setCtxMenu(null); }}
              onClose={() => setCtxMenu(null)}
            />,
            document.body,
          )}
        </div>
      )}

    </div>
  );
});

export default LoadoutSidebar;

// ─── Community section sub-component ─────────────────────────────────────────

function CommunitySection({ folders, activeId, onLoad, onDuplicate }: { folders: CommunityFolder[]; activeId: string | null; onLoad: (id: string) => void; onDuplicate: (id: string) => void }) {
  const [collapsed, setCollapsed] = useState(false);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; loadoutId: string } | null>(null);
  const [ctxPos, setCtxPos] = useState<{ left: number; top: number } | null>(null);
  const ctxRef = useRef<HTMLDivElement>(null);

  const toggleFolder = useCallback((folderId: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!ctxMenu) return;
    const dismiss = (e: MouseEvent) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setCtxMenu(null);
    };
    const dismissKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCtxMenu(null); };
    window.addEventListener('mousedown', dismiss);
    window.addEventListener('keydown', dismissKey);
    return () => { window.removeEventListener('mousedown', dismiss); window.removeEventListener('keydown', dismissKey); };
  }, [ctxMenu]);

  useLayoutEffect(() => {
    if (!ctxMenu) { setCtxPos(null); return; }
    const el = ctxRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const margin = 8;
    const left = Math.max(margin, Math.min(ctxMenu.x, window.innerWidth - w - margin));
    const top = Math.max(margin, Math.min(ctxMenu.y, window.innerHeight - h - margin));
    setCtxPos({ left, top });
  }, [ctxMenu]);

  return (
    <div className="community-section">
      <div className="community-section-header" onClick={() => setCollapsed((p) => !p)}>
        <span className="loadout-node-icon loadout-node-chevron">
          {collapsed ? '\u25B6' : '\u25BC'}
        </span>
        <span className="community-section-title">{t('sidebar.community.title')}</span>
      </div>
      {!collapsed && folders.map((folder) => (
        <div key={folder.id}>
          <div
            className="community-node community-node--folder"
            style={{ paddingLeft: 16 }}
            onClick={() => toggleFolder(folder.id)}
          >
            <span className="loadout-node-icon loadout-node-chevron">
              {collapsedFolders.has(folder.id) ? '\u25B6' : '\u25BC'}
            </span>
            <span className="loadout-node-name">{folder.name}</span>
          </div>
          {!collapsedFolders.has(folder.id) && folder.loadouts.map((loadout) => {
            const isActive = loadout.id === activeId;
            return (
              <div
                key={loadout.id}
                className={`community-node${isActive ? ' community-node--active' : ''}`}
                style={{ paddingLeft: 32 }}
                title={t('sidebar.community.tooltip')}
                onClick={() => onLoad(loadout.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onLoad(loadout.id);
                  setCtxMenu({ x: e.clientX, y: e.clientY, loadoutId: loadout.id });
                }}
              >
                <span className="loadout-node-icon loadout-node-dot">{isActive ? '\u25CF' : '\u25CB'}</span>
                <span className="loadout-node-name">{loadout.name}</span>
              </div>
            );
          })}
        </div>
      ))}
      {ctxMenu && createPortal(
        <div
          ref={ctxRef}
          className="loadout-ctx-menu"
          style={{
            position: 'fixed',
            left: ctxPos?.left ?? ctxMenu.x,
            top: ctxPos?.top ?? ctxMenu.y,
            zIndex: 9999,
            visibility: ctxPos ? 'visible' : 'hidden',
          }}
        >
          <button className="loadout-ctx-item" onClick={() => { onDuplicate(ctxMenu.loadoutId); setCtxMenu(null); }}>
            {t('sidebar.ctx.duplicate')}
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}

// ─── Context menu sub-component ──────────────────────────────────────────────

function LoadoutContextMenu({
  x, y, nodeId, node, parentId, selectedIds,
  onNewLoadout, onNewFolder, onDuplicate, onRename, onDelete, onBatchDelete, onDownload, onShare, onCreateViews, onClearViews, onClose,
}: {
  x: number;
  y: number;
  nodeId: string | null;
  node: LoadoutNode | null;
  parentId: string | null;
  selectedIds: Set<string>;
  onNewLoadout: (parentId: string | null) => void;
  onNewFolder: (parentId: string | null) => void;
  onDuplicate: (nodeId: string) => void;
  onRename: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onBatchDelete: (ids: string[]) => void;
  onDownload: (nodeId: string) => void;
  onShare: (nodeId: string) => void;
  onCreateViews: (parentLoadoutId: string) => void;
  onClearViews: (parentLoadoutId: string) => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { if (confirmDelete) setConfirmDelete(false); else onClose(); }
    };
    window.addEventListener('mousedown', handleClick);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', handleClick);
      window.removeEventListener('keydown', handleKey);
    };
  }, [onClose, confirmDelete]);

  // Measure the rendered menu and flip upward / leftward if it would overflow
  // the viewport. Runs again when confirmDelete toggles since the menu content
  // (and therefore its height) changes.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const margin = 8;
    const left = Math.max(margin, Math.min(x, window.innerWidth - w - margin));
    const top = Math.max(margin, Math.min(y, window.innerHeight - h - margin));
    setPos({ left, top });
  }, [x, y, confirmDelete]);

  const style: React.CSSProperties = {
    position: 'fixed',
    left: pos?.left ?? x,
    top: pos?.top ?? y,
    zIndex: 9999,
    visibility: pos ? 'visible' : 'hidden',
  };

  const isBatch = selectedIds.size > 1 && (!nodeId || selectedIds.has(nodeId));
  const batchCount = selectedIds.size;

  return (
    <div ref={menuRef} className="loadout-ctx-menu" style={style}>
      {!confirmDelete ? (
        <>
          <button className="loadout-ctx-item" onClick={() => onNewLoadout(parentId)}>
            {t('sidebar.ctx.newLoadout')}
          </button>
          <button className="loadout-ctx-item" onClick={() => onNewFolder(parentId)}>
            {t('sidebar.ctx.newFolder')}
          </button>
          {nodeId && node && !isBatch && (
            <>
              <div className="loadout-ctx-separator" />
              {node.type === LoadoutNodeType.LOADOUT && (
                <>
                  <button className="loadout-ctx-item" onClick={() => onDuplicate(nodeId)}>
                    {t('sidebar.ctx.duplicate')}
                  </button>
                  <button className="loadout-ctx-item" onClick={() => onDownload(nodeId)}>
                    {t('sidebar.ctx.download')}
                  </button>
                  <button className="loadout-ctx-item" onClick={() => onShare(nodeId)}>
                    {t('sidebar.ctx.share')}
                  </button>
                  <div className="loadout-ctx-separator" />
                  <button className="loadout-ctx-item" onClick={() => onCreateViews(nodeId)}>
                    {node.viewSelections ? t('sidebar.ctx.editViews') : t('sidebar.ctx.createViews')}
                  </button>
                  {node.viewSelections && (
                    <button className="loadout-ctx-item" onClick={() => onClearViews(nodeId)}>
                      {t('sidebar.ctx.clearViews')}
                    </button>
                  )}
                </>
              )}
              {!isReadOnlyNode(node) && (
                <button className="loadout-ctx-item" onClick={() => onRename(nodeId)}>
                  {t('sidebar.ctx.rename')}
                </button>
              )}
              {!isReadOnlyNode(node) && (
                <button
                  className="loadout-ctx-item loadout-ctx-item--danger"
                  onClick={() => setConfirmDelete(true)}
                >
                  {t('sidebar.ctx.delete')}
                </button>
              )}
            </>
          )}
          {isBatch && (
            <>
              <div className="loadout-ctx-separator" />
              <button
                className="loadout-ctx-item loadout-ctx-item--danger"
                onClick={() => setConfirmDelete(true)}
              >
                {t('sidebar.ctx.batchDelete', { count: batchCount })}
              </button>
            </>
          )}
        </>
      ) : (
        <>
          <div className="loadout-ctx-confirm-label">
            {isBatch ? t('sidebar.confirm.batchDelete', { count: batchCount }) : t('sidebar.confirm.deleteItem', { name: node?.name ?? '' })}
          </div>
          <div className="loadout-ctx-separator" />
          <button
            className="loadout-ctx-item loadout-ctx-item--danger"
            onClick={() => {
              if (isBatch) onBatchDelete(Array.from(selectedIds));
              else if (nodeId) onDelete(nodeId);
            }}
          >
            {t('sidebar.confirm.confirmDelete')}
          </button>
          <button className="loadout-ctx-item" onClick={() => setConfirmDelete(false)}>
            {t('sidebar.confirm.cancel')}
          </button>
        </>
      )}
    </div>
  );
}
