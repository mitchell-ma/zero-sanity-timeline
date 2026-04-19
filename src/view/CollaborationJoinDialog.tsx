import { useEffect, useState } from 'react';

interface CollaborationJoinDialogProps {
  open: boolean;
  defaultDisplayName: string;
  onJoin: (roomId: string, displayName: string) => void;
  onClose: () => void;
}

const ROOM_ID_LENGTH = 6;

export default function CollaborationJoinDialog({
  open, defaultDisplayName, onJoin, onClose,
}: CollaborationJoinDialogProps) {
  const [roomId, setRoomId] = useState('');
  const [displayName, setDisplayName] = useState(defaultDisplayName);

  useEffect(() => {
    if (!open) return;
    setRoomId('');
    setDisplayName(defaultDisplayName);
  }, [open, defaultDisplayName]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const normalizedRoomId = roomId.trim().toUpperCase();
  const canJoin = normalizedRoomId.length === ROOM_ID_LENGTH && displayName.trim().length > 0;

  const handleJoin = () => {
    if (!canJoin) return;
    onJoin(normalizedRoomId, displayName.trim());
  };

  return (
    <div className="devlog-overlay" onClick={onClose}>
      <div className="confirm-modal" onClick={(e) => e.stopPropagation()} style={{ minWidth: 340 }}>
        <div className="confirm-message" style={{ fontWeight: 600, marginBottom: 12 }}>
          Join a collaboration room
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            <span>Room code</span>
            <input
              className="app-bar-loadout-input"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={ROOM_ID_LENGTH}
              style={{ letterSpacing: 2, textAlign: 'center', fontSize: 18 }}
              onKeyDown={(e) => { if (e.key === 'Enter' && canJoin) handleJoin(); }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            <span>Your display name</span>
            <input
              className="app-bar-loadout-input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Player"
              onKeyDown={(e) => { if (e.key === 'Enter' && canJoin) handleJoin(); }}
            />
          </label>
        </div>

        <div className="confirm-actions" style={{ marginTop: 14 }}>
          <button className="confirm-btn confirm-btn--cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            className="confirm-btn confirm-btn--danger"
            onClick={handleJoin}
            disabled={!canJoin}
          >
            Join room
          </button>
        </div>
      </div>
    </div>
  );
}
