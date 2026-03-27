import { useState, useEffect, useCallback } from 'react';
import { LoadoutTree, flattenTreeNodes, loadLoadoutData } from '../utils/loadoutStorage';
import { exportMultiLoadoutBundle } from '../utils/sheetStorage';
import { LoadoutNodeType } from '../consts/enums';
import { t } from '../locales/locale';

interface ExportModalProps {
  open: boolean;
  tree: LoadoutTree;
  activeLoadoutId: string | null;
  onClose: () => void;
}

export default function ExportModal({ open, tree, activeLoadoutId, onClose }: ExportModalProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Reset selection to all loadout IDs when modal opens
  useEffect(() => {
    if (open) {
      const allLoadoutIds = new Set(tree.nodes.filter((n) => n.type === LoadoutNodeType.LOADOUT).map((n) => n.id));
      setSelectedIds(allLoadoutIds);
    }
  }, [open, tree]);

  const allLoadoutIds = tree.nodes.filter((n) => n.type === LoadoutNodeType.LOADOUT).map((n) => n.id);
  const allSelected = allLoadoutIds.length > 0 && allLoadoutIds.every((id) => selectedIds.has(id));

  const handleToggleAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allLoadoutIds));
    }
  }, [allSelected, allLoadoutIds]);

  const handleToggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleExport = useCallback(() => {
    exportMultiLoadoutBundle(tree, selectedIds, (id) => {
      return loadLoadoutData(id);
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
          <span className="devlog-title">{t('export.title')}</span>
          <button className="devlog-close" onClick={onClose}>&times;</button>
        </div>

        <div className="export-modal-controls">
          <label className="export-select-all">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={handleToggleAll}
            />
            <span>{t('export.selectAll')}</span>
          </label>
        </div>

        <div className="export-modal-list">
          {flattened.map(({ node, depth }) => {
            if (node.type === LoadoutNodeType.FOLDER) {
              return (
                <div key={node.id} className="export-modal-folder" style={{ paddingLeft: 8 + depth * 20 }}>
                  <span className="export-folder-icon">{'\u25BC'}</span>
                  <span className="export-folder-name">{node.name}</span>
                </div>
              );
            }
            const isActive = node.id === activeLoadoutId;
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
                {isActive && <span className="export-item-badge">{t('export.badge.active')}</span>}
              </label>
            );
          })}
        </div>

        <div className="export-modal-footer">
          <button className="confirm-btn confirm-btn--cancel" onClick={onClose}>{t('export.cancel')}</button>
          <button
            className="confirm-btn confirm-btn--primary"
            onClick={handleExport}
            disabled={selectedIds.size === 0}
          >
            {t('export.exportCount', { count: selectedIds.size })}
          </button>
        </div>
      </div>
    </div>
  );
}
