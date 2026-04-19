import { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  StatisticsTree,
  StatisticsNode,
  getChildrenOf,
  addFolder,
  removeNode,
  renameNode,
  toggleFolder,
  moveNode,
  uniqueName,
} from '../utils/statisticsStorage';
import { StatisticsNodeType } from '../consts/enums';
import { t } from '../locales/locale';

interface StatisticsSidebarProps {
  tree: StatisticsTree;
  activeId: string | null;
  onTreeChange: (tree: StatisticsTree) => void;
  onSelect: (id: string) => void;
  onNew: (parentId: string | null) => void;
  onDelete: (dataIds: string[]) => void;
  onWarning?: (message: string) => void;
}

function flattenVisibleNodes(
  tree: StatisticsTree,
  parentId: string | null,
  visibleIds: Set<string> | null,
  filterActive: boolean,
): string[] {
  const result: string[] = [];
  const children = getChildrenOf(tree, parentId);
  for (const node of children) {
    if (visibleIds && !visibleIds.has(node.id)) continue;
    result.push(node.id);
    if (node.type === StatisticsNodeType.FOLDER && (!node.collapsed || filterActive)) {
      result.push(...flattenVisibleNodes(tree, node.id, visibleIds, filterActive));
    }
  }
  return result;
}

export default function StatisticsSidebar({
  tree, activeId, onTreeChange, onSelect, onNew, onDelete, onWarning,
}: StatisticsSidebarProps) {
  const [filter, setFilter] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameRef = useRef<HTMLInputElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string | null; position: 'before' | 'inside' | 'after' } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; nodeId: string | null; parentId: string | null } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastClickedRef = useRef<string | null>(null);
  const treeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (renamingId && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [renamingId]);

  const filterLower = filter.toLowerCase();

  const visibleIds = useMemo(() => {
    if (!filterLower) return null;
    const matching = new Set<string>();
    for (const node of tree.nodes) {
      if (node.name.toLowerCase().includes(filterLower)) {
        matching.add(node.id);
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

  const flatOrder = useMemo(
    () => flattenVisibleNodes(tree, null, visibleIds, !!filterLower),
    [tree, visibleIds, filterLower],
  );

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
    const { tree: newTree, removedStatisticsIds } = removeNode(tree, nodeId);
    onDelete(removedStatisticsIds);
    onTreeChange(newTree);
  }, [tree, onTreeChange, onDelete]);

  const handleBatchDelete = useCallback((nodeIds: string[]) => {
    let currentTree = tree;
    const allRemovedIds: string[] = [];
    for (const nodeId of nodeIds) {
      if (!currentTree.nodes.find((n) => n.id === nodeId)) continue;
      const { tree: newTree, removedStatisticsIds } = removeNode(currentTree, nodeId);
      currentTree = newTree;
      allRemovedIds.push(...removedStatisticsIds);
    }
    onDelete(allRemovedIds);
    onTreeChange(currentTree);
    setSelectedIds(new Set());
  }, [tree, onTreeChange, onDelete]);

  const handleToggleFolder = useCallback((folderId: string) => {
    onTreeChange(toggleFolder(tree, folderId));
  }, [tree, onTreeChange]);

  const handleNodeClick = useCallback((e: React.MouseEvent, node: StatisticsNode) => {
    if (e.ctrlKey || e.metaKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(node.id)) next.delete(node.id);
        else next.add(node.id);
        return next;
      });
      lastClickedRef.current = node.id;
    } else if (e.shiftKey && lastClickedRef.current) {
      const lastIdx = flatOrder.indexOf(lastClickedRef.current);
      const curIdx = flatOrder.indexOf(node.id);
      if (lastIdx >= 0 && curIdx >= 0) {
        const start = Math.min(lastIdx, curIdx);
        const end = Math.max(lastIdx, curIdx);
        setSelectedIds(new Set(flatOrder.slice(start, end + 1)));
      }
    } else {
      setSelectedIds(new Set([node.id]));
      lastClickedRef.current = node.id;
      if (node.type === StatisticsNodeType.STATISTICS) {
        onSelect(node.id);
      } else {
        handleToggleFolder(node.id);
      }
    }
  }, [flatOrder, onSelect, handleToggleFolder]);

  // ── Drag & Drop ─────────────────────────────────────────────────────────
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

  const handleDragLeave = useCallback(() => { setDropTarget(null); }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!dragId || !dropTarget) { setDragId(null); setDropTarget(null); return; }

    const dragNode = tree.nodes.find((n) => n.id === dragId);
    if (!dragNode) { setDragId(null); setDropTarget(null); return; }

    let newParentId: string | null;
    let newOrder: number;
    const targetNode = dropTarget.id ? tree.nodes.find((n) => n.id === dropTarget.id) : null;

    if (dropTarget.position === 'inside' && targetNode?.type === StatisticsNodeType.FOLDER) {
      newParentId = targetNode.id;
      newOrder = getChildrenOf(tree, targetNode.id).length;
    } else {
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

  const handleDragEnd = useCallback(() => { setDragId(null); setDropTarget(null); }, []);

  // ── Tree rendering ──────────────────────────────────────────────────────
  const renderNode = (node: StatisticsNode, depth: number) => {
    if (visibleIds && !visibleIds.has(node.id)) return null;

    const isActive = node.type === StatisticsNodeType.STATISTICS && node.id === activeId;
    const isSelected = selectedIds.has(node.id);
    const isDragging = node.id === dragId;
    const isDropInside = dropTarget?.id === node.id && dropTarget.position === 'inside';
    const isDropBefore = dropTarget?.id === node.id && dropTarget.position === 'before';
    const isDropAfter = dropTarget?.id === node.id && dropTarget.position === 'after';

    const children = node.type === StatisticsNodeType.FOLDER ? getChildrenOf(tree, node.id) : [];
    const isCollapsed = node.type === StatisticsNodeType.FOLDER && node.collapsed === true && !filterLower;

    return (
      <div key={node.id} style={{ opacity: isDragging ? 0.4 : 1 }}>
        {isDropBefore && <div className="loadout-drop-indicator" style={{ marginLeft: depth * 16 }} />}
        <div
          className={`loadout-node${isActive ? ' loadout-node--active' : ''}${isSelected && !isActive ? ' loadout-node--selected' : ''}${isDropInside ? ' loadout-node--drop-target' : ''}`}
          style={{ paddingLeft: 8 + depth * 16 }}
          data-node-id={node.id}
          draggable={renamingId !== node.id}
          onDragStart={(e) => renamingId !== node.id && handleDragStart(e, node.id)}
          onDragOver={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const y = e.clientY - rect.top;
            const third = rect.height / 3;
            if (node.type === StatisticsNodeType.FOLDER && y > third && y < third * 2) {
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
            if (!selectedIds.has(node.id) || selectedIds.size <= 1) {
              setSelectedIds(new Set([node.id]));
              if (node.type === StatisticsNodeType.STATISTICS) onSelect(node.id);
            }
            setCtxMenu({ x: e.clientX, y: e.clientY, nodeId: node.id, parentId: node.type === StatisticsNodeType.FOLDER ? node.id : node.parentId });
          }}
        >
          {node.type === StatisticsNodeType.FOLDER ? (
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
            {node.type === StatisticsNodeType.FOLDER ? (
              <>
                <button
                  className="loadout-action-btn"
                  title={t('statisticsSidebar.btn.newStatistics')}
                  onClick={() => onNew(node.id)}
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
            ) : null}
          </span>
        </div>
        {isDropAfter && <div className="loadout-drop-indicator" style={{ marginLeft: depth * 16 }} />}

        {node.type === StatisticsNodeType.FOLDER && !isCollapsed && children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  const rootNodes = getChildrenOf(tree, null);

  return (
    <div className="sidebar-panel">
      <div className="loadout-sidebar-header">
        <span className="loadout-sidebar-title">{t('statisticsSidebar.title')}</span>
        <div className="loadout-sidebar-header-actions">
          <button
            className="loadout-action-btn"
            title={t('statisticsSidebar.btn.newStatistics')}
            onClick={() => onNew(null)}
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
          if (e.ctrlKey || e.metaKey) return;
          const isOverNode = (e.target as HTMLElement).closest('.loadout-node');
          if (!isOverNode) setSelectedIds(new Set());
        }}
      >
        {rootNodes.length === 0 && !filter && (
          <div className="loadout-empty">{t('statisticsSidebar.empty')}</div>
        )}
        {rootNodes.map((node) => renderNode(node, 0))}
        {filter && visibleIds?.size === 0 && (
          <div className="loadout-empty">{t('sidebar.emptyFilter')}</div>
        )}
      </div>

      {ctxMenu && createPortal(
        <StatisticsContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          nodeId={ctxMenu.nodeId}
          node={ctxMenu.nodeId ? tree.nodes.find((n) => n.id === ctxMenu.nodeId) ?? null : null}
          parentId={ctxMenu.parentId}
          selectedIds={selectedIds}
          onNew={(parentId) => { onNew(parentId); setCtxMenu(null); }}
          onNewFolder={(parentId) => { handleAddFolder(parentId); setCtxMenu(null); }}
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
  );
}

// ─── Context menu sub-component ─────────────────────────────────────────────

function StatisticsContextMenu({
  x, y, nodeId, node, parentId, selectedIds,
  onNew, onNewFolder, onRename, onDelete, onBatchDelete, onClose,
}: {
  x: number;
  y: number;
  nodeId: string | null;
  node: StatisticsNode | null;
  parentId: string | null;
  selectedIds: Set<string>;
  onNew: (parentId: string | null) => void;
  onNewFolder: (parentId: string | null) => void;
  onRename: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onBatchDelete: (ids: string[]) => void;
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
          <button className="loadout-ctx-item" onClick={() => onNew(parentId)}>
            {t('statisticsSidebar.ctx.newStatistics')}
          </button>
          <button className="loadout-ctx-item" onClick={() => onNewFolder(parentId)}>
            {t('sidebar.ctx.newFolder')}
          </button>
          {nodeId && node && !isBatch && (
            <>
              <div className="loadout-ctx-separator" />
              <button className="loadout-ctx-item" onClick={() => onRename(nodeId)}>
                {t('sidebar.ctx.rename')}
              </button>
              <button
                className="loadout-ctx-item loadout-ctx-item--danger"
                onClick={() => setConfirmDelete(true)}
              >
                {t('sidebar.ctx.delete')}
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
