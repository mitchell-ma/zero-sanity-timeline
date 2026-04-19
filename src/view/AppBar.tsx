import { useState, useRef, useEffect } from 'react';
import { IS_DEV } from '../consts/devFlags';
import { InteractionModeType, ConnectionStatus } from '../consts/enums';
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

interface AppBarProps {
  onDevlog: () => void;
  onSettings: () => void;
  onKeys: () => void;
  interactionMode?: InteractionModeType;
  onToggleInteractionMode?: () => void;
  lightMode?: boolean;
  onToggleTheme?: () => void;
  collaborationStatus?: ConnectionStatus | null;
  collaborationPeerCount?: number;
  collaborationRoomId?: string | null;
  collaborationPeers?: CollaborationPeerDescriptor[];
  collaborationReconnect?: CollaborationReconnectInfo;
  onHostCollaboration?: () => void;
  onJoinCollaboration?: () => void;
  onLeaveCollaboration?: () => void;
}

export default function AppBar({
  onDevlog, onSettings, onKeys,
  interactionMode, onToggleInteractionMode,
  lightMode, onToggleTheme,
  collaborationStatus, collaborationPeerCount, collaborationRoomId, collaborationPeers,
  collaborationReconnect,
  onHostCollaboration, onJoinCollaboration, onLeaveCollaboration,
}: AppBarProps) {
  const [collabMenuOpen, setCollabMenuOpen] = useState(false);
  const collabMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!collabMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (collabMenuRef.current && !collabMenuRef.current.contains(e.target as Node)) {
        setCollabMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [collabMenuOpen]);
  const collabActive = collaborationStatus != null && collaborationStatus !== ConnectionStatus.DISCONNECTED;
  const collabColor = collaborationStatus === ConnectionStatus.CONNECTED ? '#3cc46e'
    : collaborationStatus === ConnectionStatus.CONNECTING ? '#e8b23a'
    : collaborationStatus === ConnectionStatus.RECONNECTING ? '#e8732a'
    : collaborationStatus === ConnectionStatus.ERROR ? '#e05555'
    : 'transparent';
  const isReconnecting = collaborationStatus === ConnectionStatus.RECONNECTING;

  // Tick once a second while reconnecting so the "next retry in N s" countdown updates.
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!isReconnecting || !collaborationReconnect?.nextRetryAt) return;
    const timer = setInterval(() => forceTick((n) => n + 1), 500);
    return () => clearInterval(timer);
  }, [isReconnecting, collaborationReconnect?.nextRetryAt]);

  const retrySecondsLeft = collaborationReconnect?.nextRetryAt
    ? Math.max(0, Math.ceil((collaborationReconnect.nextRetryAt - Date.now()) / 1000))
    : null;

  return (
    <div className="app-bar">
      <div className="app-brand">
        <span className="brand-hex">&#x2B21;</span>
        <div className="brand-text">
          <span className="brand-title">{t('app.brand.title')}</span>
          <span className="brand-sub">{t('app.brand.subtitle')}</span>
        </div>
      </div>

      <div className="app-bar-right">
        <button
          className="btn-theme"
          onClick={onToggleTheme}
          title={lightMode ? t('app.tooltip.darkMode') : t('app.tooltip.lightMode')}
        >
          {lightMode ? (
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M12 3a9 9 0 109 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 01-4.4 2.26 5.403 5.403 0 01-3.14-9.8c-.44-.06-.9-.1-1.36-.1z"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0a.996.996 0 000-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/>
            </svg>
          )}
        </button>
        <button
          className={`btn-debug${interactionMode !== InteractionModeType.STRICT ? ' btn-debug--active' : ''}`}
          onClick={onToggleInteractionMode}
          title={t('app.tooltip.freeformMode')}
        >
          {t('app.btn.freeform')}
        </button>
        {!IS_DEV && <span className="wip-badge">{t('app.badge.wip')}</span>}
        <div ref={collabMenuRef} style={{ position: 'relative' }}>
          <button
            className="btn-devlog"
            onClick={() => setCollabMenuOpen((v) => !v)}
            title={
              isReconnecting
                ? `Reconnecting (attempt ${collaborationReconnect?.attempt ?? 0})${retrySecondsLeft != null ? ` — next try in ${retrySecondsLeft}s` : ''}`
                : collabActive ? `Room ${collaborationRoomId ?? ''} — ${collaborationPeerCount ?? 0} peer(s)` : 'Collaborate'
            }
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            {collabActive && (
              <span
                aria-hidden
                style={{
                  display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                  background: collabColor,
                }}
              />
            )}
            Collab{collabActive && collaborationPeerCount != null ? ` (${collaborationPeerCount})` : ''}
          </button>
          {collabMenuOpen && (
            <div
              style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 4,
                background: 'var(--bg-panel, #1a1a1a)', border: '1px solid var(--border-muted, #333)',
                padding: 6, display: 'flex', flexDirection: 'column', gap: 4,
                minWidth: 160, zIndex: 50, borderRadius: 4,
              }}
            >
              {collabActive ? (
                <>
                  <div style={{ fontSize: 11, opacity: 0.7, padding: '2px 6px' }}>
                    Room: <code>{collaborationRoomId ?? ''}</code>
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.7, padding: '2px 6px' }}>
                    Status: {collaborationStatus}
                  </div>
                  {isReconnecting && (
                    <div style={{ fontSize: 11, padding: '2px 6px', color: '#e8732a' }}>
                      Reconnecting (attempt {collaborationReconnect?.attempt ?? 0})
                      {retrySecondsLeft != null ? ` — next try in ${retrySecondsLeft}s` : ''}
                    </div>
                  )}
                  {collaborationReconnect?.givenUp && (
                    <div style={{ fontSize: 11, padding: '2px 6px', color: '#e05555' }}>
                      Gave up reconnecting. Leave and rejoin to retry.
                    </div>
                  )}
                  <div style={{ height: 1, background: 'var(--border-muted, #333)', margin: '2px 0' }} />
                  <div style={{ fontSize: 11, opacity: 0.7, padding: '2px 6px' }}>
                    Peers ({collaborationPeers?.length ?? 0})
                  </div>
                  {(collaborationPeers ?? []).length === 0 ? (
                    <div style={{ fontSize: 11, opacity: 0.5, padding: '2px 10px' }}>—</div>
                  ) : (
                    (collaborationPeers ?? []).map((p) => (
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
                            background: p.role === 'host' ? '#e8b23a' : '#7cb7e8',
                          }}
                        />
                        <span style={{ fontWeight: p.isLocal ? 600 : 400 }}>
                          {p.displayName || '(unnamed)'}{p.isLocal ? ' (you)' : ''}
                        </span>
                        <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.6 }}>{p.role}</span>
                      </div>
                    ))
                  )}
                  <div style={{ height: 1, background: 'var(--border-muted, #333)', margin: '2px 0' }} />
                  <button
                    className="btn-devlog"
                    style={{ textAlign: 'left' }}
                    onClick={() => { setCollabMenuOpen(false); onLeaveCollaboration?.(); }}
                  >
                    Leave room
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="btn-devlog"
                    style={{ textAlign: 'left' }}
                    onClick={() => { setCollabMenuOpen(false); onHostCollaboration?.(); }}
                  >
                    Host a room
                  </button>
                  <button
                    className="btn-devlog"
                    style={{ textAlign: 'left' }}
                    onClick={() => { setCollabMenuOpen(false); onJoinCollaboration?.(); }}
                  >
                    Join a room
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        <button className="btn-devlog" onClick={onDevlog}>
          {t('app.btn.devlog')}
        </button>

        <button
          className="btn-settings"
          onClick={onSettings}
          title={t('app.tooltip.settings')}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1115.6 12 3.611 3.611 0 0112 15.6z"/>
          </svg>
        </button>

        <button className="btn-keys" onClick={onKeys}>
          ?
        </button>
        <a
          className="github-link"
          href="https://github.com/mitchell-ma/zero-sanity-timeline"
          target="_blank"
          rel="noopener noreferrer"
          title={t('app.tooltip.github')}
        >
          <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
          </svg>
        </a>
      </div>
    </div>
  );
}
