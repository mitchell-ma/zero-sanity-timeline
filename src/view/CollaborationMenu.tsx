import { useEffect, useState } from 'react';
import { ConnectionStatus } from '../consts/enums';
import { t } from '../locales/locale';

interface CollaborationReconnectInfo {
  attempt: number;
  nextRetryAt: number | null;
  givenUp: boolean;
}

interface CollaborationMenuProps {
  status: ConnectionStatus | null;
  peerCount: number;
  roomId: string | null;
  reconnect?: CollaborationReconnectInfo;
  /** Opens the unified collaboration modal. The modal handles every
   *  state (HOST/JOIN setup, live session with room code + peers). */
  onOpenSession: () => void;
}

export default function CollaborationMenu({
  status, peerCount, roomId, reconnect, onOpenSession,
}: CollaborationMenuProps) {
  const active = status != null && status !== ConnectionStatus.DISCONNECTED;
  const dotColor = status === ConnectionStatus.CONNECTED ? '#3cc46e'
    : status === ConnectionStatus.CONNECTING ? '#e8b23a'
    : status === ConnectionStatus.RECONNECTING ? '#e8732a'
    : status === ConnectionStatus.ERROR ? '#e05555'
    : null;
  const isReconnecting = status === ConnectionStatus.RECONNECTING;

  // Tick while reconnecting so the tooltip's countdown updates.
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!isReconnecting || !reconnect?.nextRetryAt) return;
    const timer = setInterval(() => forceTick((n) => n + 1), 500);
    return () => clearInterval(timer);
  }, [isReconnecting, reconnect?.nextRetryAt]);

  const retrySecondsLeft = reconnect?.nextRetryAt
    ? Math.max(0, Math.ceil((reconnect.nextRetryAt - Date.now()) / 1000))
    : null;

  const tooltip = isReconnecting
    ? `Reconnecting (attempt ${reconnect?.attempt ?? 0})${retrySecondsLeft != null ? ` — next try in ${retrySecondsLeft}s` : ''}`
    : active ? `${t('sidebar.btn.collab')} — room ${roomId ?? ''}, ${peerCount} peer(s)`
    : t('sidebar.btn.collab');

  return (
    <button
      className="loadout-action-btn"
      onClick={onOpenSession}
      title={tooltip}
      style={{ position: 'relative' }}
    >
      <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden>
        <path d="M5.5 6a2 2 0 100-4 2 2 0 000 4zm5 0a2 2 0 100-4 2 2 0 000 4zM1 13c0-2.1 2-3.5 4.5-3.5S10 10.9 10 13v1H1v-1zm9 0c0-.8-.2-1.6-.6-2.2.4-.2.8-.3 1.3-.3 2 0 3.8 1.1 3.8 2.7V14H10v-1z"/>
      </svg>
      {dotColor && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            right: 1, bottom: 1,
            width: 6, height: 6, borderRadius: '50%',
            background: dotColor,
            boxShadow: '0 0 0 1px var(--bg-panel, #111)',
          }}
        />
      )}
    </button>
  );
}
