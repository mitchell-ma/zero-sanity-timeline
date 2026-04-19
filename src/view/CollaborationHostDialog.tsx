import { useEffect, useState, useMemo } from 'react';
import { LoadoutTree, flattenTreeNodes } from '../utils/loadoutStorage';
import { LoadoutNodeType } from '../consts/enums';
import { isCommunityLoadoutId } from '../app/communityLoadouts';

interface CollaborationHostDialogProps {
  open: boolean;
  tree: LoadoutTree;
  defaultDisplayName: string;
  onHost: (displayName: string, loadoutUuids: string[], maxPeers: number) => void;
  onClose: () => void;
}

const DEFAULT_MAX_PEERS = 4;
const MIN_MAX_PEERS = 1;
const MAX_MAX_PEERS = 8;

export default function CollaborationHostDialog({
  open, tree, defaultDisplayName, onHost, onClose,
}: CollaborationHostDialogProps) {
  const [displayName, setDisplayName] = useState(defaultDisplayName);
  const [maxPeers, setMaxPeers] = useState(DEFAULT_MAX_PEERS);
  const [selectedUuids, setSelectedUuids] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setDisplayName(defaultDisplayName);
    setSelectedUuids(new Set());
  }, [open, defaultDisplayName]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const loadoutRows = useMemo(() => {
    return flattenTreeNodes(tree)
      .filter(({ node }) => node.type === LoadoutNodeType.LOADOUT && !isCommunityLoadoutId(node.id))
      .map(({ node, depth }) => ({ node, depth }));
  }, [tree]);

  if (!open) return null;

  const toggleSelection = (uuid: string) => {
    setSelectedUuids((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });
  };

  const handleConfirm = () => {
    if (!displayName.trim()) return;
    if (selectedUuids.size === 0) return;
    onHost(displayName.trim(), Array.from(selectedUuids), maxPeers);
    onClose();
  };

  return (
    <div className="devlog-overlay" onClick={onClose}>
      <div className="confirm-modal" onClick={(e) => e.stopPropagation()} style={{ minWidth: 380, maxWidth: 520 }}>
        <div className="confirm-message" style={{ fontWeight: 600, marginBottom: 12 }}>
          Host a collaboration room
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            <span>Your display name</span>
            <input
              className="app-bar-loadout-input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Player"
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            <span>Max peers</span>
            <input
              className="app-bar-loadout-input"
              type="number"
              min={MIN_MAX_PEERS}
              max={MAX_MAX_PEERS}
              value={maxPeers}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isFinite(n)) return;
                setMaxPeers(Math.max(MIN_MAX_PEERS, Math.min(MAX_MAX_PEERS, Math.floor(n))));
              }}
            />
          </label>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            <span>Loadouts to share</span>
            <div
              style={{
                maxHeight: 220, overflow: 'auto',
                border: '1px solid var(--border-muted)', borderRadius: 4,
                padding: 4, display: 'flex', flexDirection: 'column', gap: 2,
              }}
            >
              {loadoutRows.length === 0 ? (
                <div style={{ opacity: 0.6, padding: 6 }}>No loadouts available.</div>
              ) : loadoutRows.map(({ node, depth }) => (
                <label
                  key={node.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    paddingLeft: 4 + depth * 12, cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedUuids.has(node.uuid)}
                    onChange={() => toggleSelection(node.uuid)}
                  />
                  <span>{node.name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="confirm-actions" style={{ marginTop: 14 }}>
          <button className="confirm-btn confirm-btn--cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            className="confirm-btn confirm-btn--danger"
            onClick={handleConfirm}
            disabled={!displayName.trim() || selectedUuids.size === 0}
          >
            Host room
          </button>
        </div>
      </div>
    </div>
  );
}
