import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { ConnectionStatus } from '../consts/enums';
import { t } from '../locales/locale';

interface CollaborationReconnectInfo {
  attempt: number;
  nextRetryAt: number | null;
  givenUp: boolean;
}

interface CollaborationPeerDescriptor {
  peerId: string;
  displayName: string;
  role: string;
  isLocal: boolean;
}

interface CollaborationMenuProps {
  status: ConnectionStatus | null;
  peerCount: number;
  roomId: string | null;
  peers: CollaborationPeerDescriptor[];
  reconnect?: CollaborationReconnectInfo;
  onHost: () => void;
  onJoin: () => void;
  onLeave: () => void;
  onManageSharedLoadouts?: () => void;
}

const ROLE_HOST = 'host';

export default function CollaborationMenu({
  status, peerCount, roomId, peers, reconnect,
  onHost, onJoin, onLeave, onManageSharedLoadouts,
}: CollaborationMenuProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);

  // Position the portal-rendered dropdown directly below the trigger button.
  // Recomputed on open + on window resize/scroll so it tracks the button.
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const r = buttonRef.current?.getBoundingClientRect();
      if (!r) return;
      setAnchor({ left: r.left, top: r.bottom + 4 });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  const active = status != null && status !== ConnectionStatus.DISCONNECTED;
  const dotColor = status === ConnectionStatus.CONNECTED ? '#3cc46e'
    : status === ConnectionStatus.CONNECTING ? '#e8b23a'
    : status === ConnectionStatus.RECONNECTING ? '#e8732a'
    : status === ConnectionStatus.ERROR ? '#e05555'
    : null;
  const isReconnecting = status === ConnectionStatus.RECONNECTING;

  // Tick while reconnecting so the countdown updates.
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

  const isLocalHost = peers.some((p) => p.isLocal && p.role === ROLE_HOST);

  // Portaled into document.body so it escapes the sidebar's overflow/stacking
  // context; otherwise the dropdown gets clipped by adjacent panels.
  const dropdown = open && anchor ? createPortal(
    <div
      ref={dropdownRef}
      style={{
        position: 'fixed', top: anchor.top, left: anchor.left,
        background: 'var(--bg-panel, #1a1a1a)', border: '1px solid var(--border-muted, #333)',
        padding: 6, display: 'flex', flexDirection: 'column', gap: 4,
        minWidth: 200, zIndex: 9999, borderRadius: 4,
        boxShadow: '0 6px 20px var(--scrim-70, rgba(0, 0, 0, 0.5))',
      }}
    >
      {active ? (
        <>
          <div style={{ fontSize: 11, opacity: 0.7, padding: '2px 6px' }}>
            Room: <code>{roomId ?? ''}</code>
          </div>
          <div style={{ fontSize: 11, opacity: 0.7, padding: '2px 6px' }}>
            Status: {status}
          </div>
          {isReconnecting && (
            <div style={{ fontSize: 11, padding: '2px 6px', color: '#e8732a' }}>
              Reconnecting (attempt {reconnect?.attempt ?? 0})
              {retrySecondsLeft != null ? ` — next try in ${retrySecondsLeft}s` : ''}
            </div>
          )}
          {reconnect?.givenUp && (
            <div style={{ fontSize: 11, padding: '2px 6px', color: '#e05555' }}>
              Gave up reconnecting. Leave and rejoin to retry.
            </div>
          )}
          <div style={{ height: 1, background: 'var(--border-muted, #333)', margin: '2px 0' }} />
          <div style={{ fontSize: 11, opacity: 0.7, padding: '2px 6px' }}>
            Peers ({peers.length})
          </div>
          {peers.length === 0 ? (
            <div style={{ fontSize: 11, opacity: 0.5, padding: '2px 10px' }}>—</div>
          ) : peers.map((p) => (
            <div
              key={p.peerId}
              style={{
                fontSize: 12, padding: '3px 10px',
                display: 'flex', alignItems: 'center', gap: 6,
                opacity: p.isLocal ? 1 : 0.9,
              }}
              title={p.peerId}
            >
              <span
                aria-hidden
                style={{
                  display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                  background: p.role === ROLE_HOST ? '#e8b23a' : '#7cb7e8',
                }}
              />
              <span style={{ fontWeight: p.isLocal ? 600 : 400 }}>
                {p.displayName || '(unnamed)'}{p.isLocal ? ' (you)' : ''}
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.6 }}>{p.role}</span>
            </div>
          ))}
          <div style={{ height: 1, background: 'var(--border-muted, #333)', margin: '2px 0' }} />
          {onManageSharedLoadouts && isLocalHost && (
            <button
              className="btn-devlog"
              style={{ textAlign: 'left' }}
              onClick={() => { setOpen(false); onManageSharedLoadouts(); }}
            >
              Edit shared loadouts
            </button>
          )}
          <button
            className="btn-devlog"
            style={{ textAlign: 'left' }}
            onClick={() => { setOpen(false); onLeave(); }}
          >
            Leave room
          </button>
        </>
      ) : (
        <>
          <button
            className="btn-devlog"
            style={{ textAlign: 'left' }}
            onClick={() => { setOpen(false); onHost(); }}
          >
            Host a room
          </button>
          <button
            className="btn-devlog"
            style={{ textAlign: 'left' }}
            onClick={() => { setOpen(false); onJoin(); }}
          >
            Join a room
          </button>
        </>
      )}
    </div>,
    document.body,
  ) : null;

  return (
    <div style={{ display: 'inline-flex' }}>
      <button
        ref={buttonRef}
        className="loadout-action-btn"
        onClick={() => setOpen((v) => !v)}
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
      {dropdown}
    </div>
  );
}
