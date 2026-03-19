import { useState, useCallback, useRef, useEffect, useMemo, forwardRef, lazy, Suspense } from 'react';
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
} from '../utils/loadoutStorage';
import type { ContentSelection } from '../consts/contentBrowserTypes';

const ContentBrowserPanel = lazy(() => import('./custom/ContentBrowserPanel'));

export type SidebarMode = 'loadouts' | 'custom' | 'workbench' | null;

interface LoadoutSidebarProps {
  tree: LoadoutTree;
  activeLoadoutId: string | null;
  onTreeChange: (tree: LoadoutTree) => void;
  onSelectLoadout: (id: string) => void;
  onNewLoadout: (parentId: string | null) => void;
  onDuplicateLoadout: (sourceId: string) => void;
  onDeleteLoadout: (loadoutIds: string[], nodeId: string) => void;
  onWarning?: (message: string) => void;
  sidebarMode: SidebarMode;
  onSidebarModeChange: (mode: SidebarMode) => void;
  selectedContentItem?: ContentSelection | null;
  onSelectContentItem?: (item: ContentSelection) => void;
  onCloneContentAsCustom?: (item: ContentSelection) => void;
  onEditCustomContent?: (item: ContentSelection) => void;
  onOpenInWorkbench?: (item: ContentSelection) => void;
  onContentChanged?: () => void;
  contentRefreshKey?: number;
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
    if (node.type === 'folder' && (!node.collapsed || filterActive)) {
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
  onWarning,
  sidebarMode,
  onSidebarModeChange,
  selectedContentItem,
  onSelectContentItem,
  onCloneContentAsCustom,
  onEditCustomContent,
  onOpenInWorkbench,
  onContentChanged,
  contentRefreshKey,
}, ref) {
  const [filter, setFilter] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameRef = useRef<HTMLInputElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string | null; position: 'before' | 'inside' | 'after' } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; nodeId: string | null; parentId: string | null } | null>(null);

  // ─── Multi-select state ───────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastClickedRef = useRef<string | null>(null);

  // ─── Marquee state ────────────────────────────────────────────────────
  const [marquee, setMarquee] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  const marqueeActiveRef = useRef(false);
  const marqueeJustEndedRef = useRef(false);
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
      if (node.type === 'loadout') onSelectLoadout(node.id);
      else handleToggleFolder(node.id);
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
    const selected = new Set<string>();
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

    if (dropTarget.position === 'inside' && targetNode?.type === 'folder') {
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

    const isActive = node.type === 'loadout' && node.id === activeLoadoutId;
    const isSelected = selectedIds.has(node.id);
    const isDragging = node.id === dragId;
    const isDropInside = dropTarget?.id === node.id && dropTarget.position === 'inside';
    const isDropBefore = dropTarget?.id === node.id && dropTarget.position === 'before';
    const isDropAfter = dropTarget?.id === node.id && dropTarget.position === 'after';

    const children = node.type === 'folder' ? getChildrenOf(tree, node.id) : [];
    const isCollapsed = node.type === 'folder' && node.collapsed && !filterLower;

    return (
      <div key={node.id} style={{ opacity: isDragging ? 0.4 : 1 }}>
        {isDropBefore && <div className="loadout-drop-indicator" style={{ marginLeft: depth * 16 }} />}
        <div
          className={`loadout-node${isActive ? ' loadout-node--active' : ''}${isSelected && !isActive ? ' loadout-node--selected' : ''}${isDropInside ? ' loadout-node--drop-target' : ''}`}
          style={{ paddingLeft: 8 + depth * 16 }}
          data-node-id={node.id}
          draggable
          onDragStart={(e) => handleDragStart(e, node.id)}
          onDragOver={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const y = e.clientY - rect.top;
            const third = rect.height / 3;
            if (node.type === 'folder' && y > third && y < third * 2) {
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
            setRenamingId(node.id);
            setRenameValue(node.name);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            // If right-clicking a selected node with multi-selection, keep the selection
            if (!selectedIds.has(node.id) || selectedIds.size <= 1) {
              setSelectedIds(new Set([node.id]));
              // Load the loadout when right-clicking it
              if (node.type === 'loadout') onSelectLoadout(node.id);
            }
            setCtxMenu({ x: e.clientX, y: e.clientY, nodeId: node.id, parentId: node.type === 'folder' ? node.id : node.parentId });
          }}
        >
          {node.type === 'folder' ? (
            <span className="loadout-node-icon loadout-node-chevron">
              {isCollapsed ? '\u25B6' : '\u25BC'}
            </span>
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
            <span className="loadout-node-name">{node.name}</span>
          )}

          <span className="loadout-node-actions" onClick={(e) => e.stopPropagation()}>
            {node.type === 'folder' && (
              <>
                <button
                  className="loadout-action-btn"
                  title="New loadout"
                  onClick={() => handleAddLoadout(node.id)}
                >+</button>
                <button
                  className="loadout-action-btn"
                  title="New folder"
                  onClick={() => handleAddFolder(node.id)}
                >
                  <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
                    <path d="M1 3.5A1.5 1.5 0 012.5 2h3.879a1.5 1.5 0 011.06.44l1.122 1.12A1.5 1.5 0 009.62 4H13.5A1.5 1.5 0 0115 5.5v7a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12.5v-9z"/>
                  </svg>
                </button>
              </>
            )}
            <button
              className="loadout-action-btn loadout-action-btn--delete"
              title="Delete"
              onClick={() => handleDelete(node.id)}
            >
              <svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor">
                <path d="M4.646 4.646a.5.5 0 01.708 0L8 7.293l2.646-2.647a.5.5 0 01.708.708L8.707 8l2.647 2.646a.5.5 0 01-.708.708L8 8.707l-2.646 2.647a.5.5 0 01-.708-.708L7.293 8 4.646 5.354a.5.5 0 010-.708z"/>
              </svg>
            </button>
          </span>
        </div>
        {isDropAfter && <div className="loadout-drop-indicator" style={{ marginLeft: depth * 16 }} />}

        {node.type === 'folder' && !isCollapsed && children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  const rootNodes = getChildrenOf(tree, null);

  const handleIconClick = (mode: 'loadouts' | 'custom' | 'workbench') => {
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
          className={`sidebar-mode-btn${sidebarMode === 'loadouts' ? ' sidebar-mode-btn--active' : ''}`}
          onClick={() => handleIconClick('loadouts')}
          title="Loadouts"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
          </svg>
        </button>
        <button
          className={`sidebar-mode-btn${sidebarMode === 'custom' ? ' sidebar-mode-btn--active' : ''}`}
          onClick={() => handleIconClick('custom')}
          title="Customization"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1.003 1.003 0 000-1.42l-2.34-2.33a1.003 1.003 0 00-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.83z"/>
          </svg>
        </button>
        <button
          className={`sidebar-mode-btn${sidebarMode === 'workbench' ? ' sidebar-mode-btn--active' : ''}`}
          onClick={() => handleIconClick('workbench')}
          title="Workbench"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/>
          </svg>
        </button>
      </div>

      {/* ── Loadouts panel ─────────────────────────────────────── */}
      {sidebarMode === 'loadouts' && (
        <div className="sidebar-panel">
          <div className="loadout-sidebar-header">
            <span className="loadout-sidebar-title">LOADOUTS</span>
            <div className="loadout-sidebar-header-actions">
              <button
                className="loadout-action-btn"
                title="New loadout"
                onClick={() => handleAddLoadout(null)}
              >+</button>
              <button
                className="loadout-action-btn"
                title="New folder"
                onClick={() => handleAddFolder(null)}
              >
                <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
                  <path d="M1 3.5A1.5 1.5 0 012.5 2h3.879a1.5 1.5 0 011.06.44l1.122 1.12A1.5 1.5 0 009.62 4H13.5A1.5 1.5 0 0115 5.5v7a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12.5v-9z"/>
                </svg>
              </button>
            </div>
          </div>

          <div className="loadout-filter-row">
            <input
              className="loadout-filter-input"
              placeholder="Filter..."
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
              const isOverNode = (e.target as HTMLElement).closest('.loadout-node');
              if (!isOverNode) setSelectedIds(new Set());
            }}
          >
            {rootNodes.length === 0 && !filter && (
              <div className="loadout-empty">No loadouts yet</div>
            )}
            {rootNodes.map((node) => renderNode(node, 0))}
            {filter && visibleIds?.size === 0 && (
              <div className="loadout-empty">No matches</div>
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
              onClose={() => setCtxMenu(null)}
            />,
            document.body,
          )}
        </div>
      )}

      {sidebarMode === 'custom' && onSelectContentItem && (
        <Suspense fallback={<div className="tl-loading" />}>
          <ContentBrowserPanel
            selectedItem={selectedContentItem ?? null}
            onSelectItem={onSelectContentItem}
            onCloneAsCustom={onCloneContentAsCustom}
            onEditCustom={onEditCustomContent}
            onOpenInWorkbench={onOpenInWorkbench}
            onContentChanged={onContentChanged}
            refreshKey={contentRefreshKey}
          />
        </Suspense>
      )}
    </div>
  );
});

export default LoadoutSidebar;

// ─── Context menu sub-component ──────────────────────────────────────────────

function LoadoutContextMenu({
  x, y, nodeId, node, parentId, selectedIds,
  onNewLoadout, onNewFolder, onDuplicate, onRename, onDelete, onBatchDelete, onClose,
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
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

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

  // Position: clamp to viewport
  const style: React.CSSProperties = {
    position: 'fixed',
    left: x,
    top: y,
    zIndex: 9999,
  };

  const isBatch = selectedIds.size > 1 && (!nodeId || selectedIds.has(nodeId));
  const batchCount = selectedIds.size;

  return (
    <div ref={menuRef} className="loadout-ctx-menu" style={style}>
      {!confirmDelete ? (
        <>
          <button className="loadout-ctx-item" onClick={() => onNewLoadout(parentId)}>
            New Loadout
          </button>
          <button className="loadout-ctx-item" onClick={() => onNewFolder(parentId)}>
            New Folder
          </button>
          {nodeId && node && !isBatch && (
            <>
              <div className="loadout-ctx-separator" />
              {node.type === 'loadout' && (
                <button className="loadout-ctx-item" onClick={() => onDuplicate(nodeId)}>
                  Duplicate
                </button>
              )}
              <button className="loadout-ctx-item" onClick={() => onRename(nodeId)}>
                Rename
              </button>
              <button
                className="loadout-ctx-item loadout-ctx-item--danger"
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </button>
            </>
          )}
          {isBatch && (
            <>
              <div className="loadout-ctx-separator" />
              <button
                className="loadout-ctx-item loadout-ctx-item--danger"
                onClick={() => setConfirmDelete(true)}
              >
                {`Delete ${batchCount} items`}
              </button>
            </>
          )}
        </>
      ) : (
        <>
          <div className="loadout-ctx-confirm-label">
            {isBatch ? `Delete ${batchCount} items?` : `Delete "${node?.name}"?`}
          </div>
          <div className="loadout-ctx-separator" />
          <button
            className="loadout-ctx-item loadout-ctx-item--danger"
            onClick={() => {
              if (isBatch) onBatchDelete(Array.from(selectedIds));
              else if (nodeId) onDelete(nodeId);
            }}
          >
            Confirm Delete
          </button>
          <button className="loadout-ctx-item" onClick={() => setConfirmDelete(false)}>
            Cancel
          </button>
        </>
      )}
    </div>
  );
}
