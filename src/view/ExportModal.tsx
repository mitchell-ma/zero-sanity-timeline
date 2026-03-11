import { useState, useEffect, useCallback } from 'react';
import { SessionTree, flattenTreeNodes, loadSessionData } from '../utils/sessionStorage';
import { exportMultiSessionBundle } from '../utils/sheetStorage';

interface ExportModalProps {
  open: boolean;
  tree: SessionTree;
  activeSessionId: string | null;
  onClose: () => void;
}

export default function ExportModal({ open, tree, activeSessionId, onClose }: ExportModalProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Reset selection to all session IDs when modal opens
  useEffect(() => {
    if (open) {
      const allSessionIds = new Set(tree.nodes.filter((n) => n.type === 'session').map((n) => n.id));
      setSelectedIds(allSessionIds);
    }
  }, [open, tree]);

  const allSessionIds = tree.nodes.filter((n) => n.type === 'session').map((n) => n.id);
  const allSelected = allSessionIds.length > 0 && allSessionIds.every((id) => selectedIds.has(id));

  const handleToggleAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allSessionIds));
    }
  }, [allSelected, allSessionIds]);

  const handleToggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleExport = useCallback(() => {
    exportMultiSessionBundle(tree, selectedIds, (id) => {
      // For the active session, the caller should have already saved current state.
      // loadSessionData reads from localStorage which is kept in sync by auto-save.
      return loadSessionData(id);
    });
    onClose();
  }, [tree, selectedIds, onClose]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const flattened = flattenTreeNodes(tree);

  return (
    <div className="devlog-overlay" onClick={onClose}>
      <div className="export-modal" onClick={(e) => e.stopPropagation()}>
        <div className="devlog-header">
          <span className="devlog-title">EXPORT SESSIONS</span>
          <button className="devlog-close" onClick={onClose}>&times;</button>
        </div>

        <div className="export-modal-controls">
          <label className="export-select-all">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={handleToggleAll}
            />
            <span>Select All</span>
          </label>
        </div>

        <div className="export-modal-list">
          {flattened.map(({ node, depth }) => {
            if (node.type === 'folder') {
              return (
                <div key={node.id} className="export-modal-folder" style={{ paddingLeft: 8 + depth * 20 }}>
                  <span className="export-folder-icon">{'\u25BC'}</span>
                  <span className="export-folder-name">{node.name}</span>
                </div>
              );
            }
            const isActive = node.id === activeSessionId;
            return (
              <label
                key={node.id}
                className={`export-modal-item${isActive ? ' export-modal-item--active' : ''}`}
                style={{ paddingLeft: 8 + depth * 20 }}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(node.id)}
                  onChange={() => handleToggle(node.id)}
                />
                <span className="export-item-name">{node.name}</span>
                {isActive && <span className="export-item-badge">active</span>}
              </label>
            );
          })}
        </div>

        <div className="export-modal-footer">
          <button className="confirm-btn confirm-btn--cancel" onClick={onClose}>Cancel</button>
          <button
            className="confirm-btn confirm-btn--primary"
            onClick={handleExport}
            disabled={selectedIds.size === 0}
          >
            Export {selectedIds.size} session{selectedIds.size !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
