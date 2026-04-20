import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LoadoutTree, LoadoutNode, flattenTreeNodes, getChildrenOf } from '../utils/loadoutStorage';
import {
  CollabSessionMode,
  CollaborationRole,
  ConnectionStatus,
  LoadoutNodeType,
} from '../consts/enums';
import { isCommunityLoadoutId } from '../app/communityLoadouts';
import NumberInputWithFastForwardButtons from './components/inputs/NumberInputWithFastForwardButtons';
import { t } from '../locales/locale';

export interface CollaborationPeerEntry {
  peerId: string;
  displayName: string;
  role: string;
  isLocal: boolean;
}

export interface CollaborationReconnectState {
  attempt: number;
  nextRetryAt: number | null;
  givenUp: boolean;
}

export interface CollaborationSessionInfo {
  roomId: string;
  status: ConnectionStatus;
  peers: CollaborationPeerEntry[];
  reconnect?: CollaborationReconnectState;
}

interface CollaborationSessionModalProps {
  open: boolean;
  initialMode: CollabSessionMode;
  /** Live session. When non-null, the modal shows the in-session view
   *  (room code, peers, leave/manage). When null, it shows the
   *  HOST/JOIN tabs + setup forms. */
  session: CollaborationSessionInfo | null;
  tree: LoadoutTree;
  defaultHostDisplayName: string;
  defaultJoinDisplayName: string;
  onHost: (displayName: string, loadoutUuids: string[], maxPeers: number) => void;
  onJoin: (roomId: string, displayName: string) => void;
  onLeave: () => void;
  onManageSharedLoadouts?: () => void;
  onClose: () => void;
}

const DEFAULT_MAX_PEERS = 4;
const MIN_MAX_PEERS = 1;
const MAX_MAX_PEERS = 8;
const ROOM_ID_LENGTH = 6;
const MARQUEE_THRESHOLD_PX = 4;
const COPIED_FEEDBACK_MS = 1500;

const STATUS_DOT_COLOR: Record<ConnectionStatus, string> = {
  [ConnectionStatus.CONNECTED]:    '#3cc46e',
  [ConnectionStatus.CONNECTING]:   '#e8b23a',
  [ConnectionStatus.RECONNECTING]: '#e8732a',
  [ConnectionStatus.ERROR]:        '#e05555',
  [ConnectionStatus.DISCONNECTED]: '#6a6a6a',
};

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  [ConnectionStatus.CONNECTED]:    'Connected',
  [ConnectionStatus.CONNECTING]:   'Connecting',
  [ConnectionStatus.RECONNECTING]: 'Reconnecting',
  [ConnectionStatus.ERROR]:        'Error',
  [ConnectionStatus.DISCONNECTED]: 'Disconnected',
};

type CheckState = 'off' | 'on' | 'partial';

function Check({ state }: { state: CheckState }) {
  return (
    <span className={`ex-check ex-check--${state}`} aria-hidden>
      <svg viewBox="0 0 14 14" width="14" height="14">
        <rect x="1" y="1" width="12" height="12" rx="1.5" className="ex-check-box" />
        {state === 'on' && (
          <path d="M3.4 7.2 L5.9 9.7 L10.6 4.6" className="ex-check-mark" />
        )}
        {state === 'partial' && (
          <rect x="3.5" y="6.3" width="7" height="1.4" rx="0.6" className="ex-check-mark-partial" />
        )}
      </svg>
    </span>
  );
}

function collectLoadoutDescendants(tree: LoadoutTree, folderId: string): string[] {
  const result: string[] = [];
  const children = getChildrenOf(tree, folderId);
  for (const c of children) {
    if (c.type === LoadoutNodeType.LOADOUT && !isCommunityLoadoutId(c.id)) result.push(c.id);
    if (c.type === LoadoutNodeType.FOLDER) result.push(...collectLoadoutDescendants(tree, c.id));
  }
  return result;
}

/** Copy-to-clipboard button with a transient checkmark after success. */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
  }, []);

  const onCopy = useCallback(() => {
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    const writer = nav && 'clipboard' in nav ? nav.clipboard : null;
    if (!writer) return;
    writer.writeText(text).then(() => {
      setCopied(true);
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    }).catch(() => { /* ignore */ });
  }, [text]);

  return (
    <button
      type="button"
      className={`collab-copy-btn${copied ? ' collab-copy-btn--copied' : ''}`}
      onClick={onCopy}
      aria-label={copied ? 'Copied' : 'Copy room code'}
      title={copied ? 'Copied' : 'Copy room code'}
    >
      {copied ? (
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden>
          <path
            d="M3.5 8.5 L6.5 11.5 L12.5 5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden>
          <path d="M10 1H4a2 2 0 00-2 2v8h1.5V3a.5.5 0 01.5-.5h6V1z"/>
          <path d="M13 4H6a1.5 1.5 0 00-1.5 1.5v9A1.5 1.5 0 006 16h7a1.5 1.5 0 001.5-1.5v-9A1.5 1.5 0 0013 4zm0 10.5H6a0 0 0 010 0v-9a0 0 0 010 0h7a0 0 0 010 0v9z"/>
        </svg>
      )}
    </button>
  );
}

export default function CollaborationSessionModal({
  open, initialMode, session,
  tree, defaultHostDisplayName, defaultJoinDisplayName,
  onHost, onJoin, onLeave, onManageSharedLoadouts, onClose,
}: CollaborationSessionModalProps) {
  const [mode, setMode] = useState<CollabSessionMode>(initialMode);

  const [hostDisplayName, setHostDisplayName] = useState(defaultHostDisplayName);
  const [maxPeers, setMaxPeers] = useState(DEFAULT_MAX_PEERS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  const [roomIdInput, setRoomIdInput] = useState('');
  const [joinDisplayName, setJoinDisplayName] = useState(defaultJoinDisplayName);

  const hostNameRef = useRef<HTMLInputElement>(null);
  const joinRoomRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const lastClickedRef = useRef<string | null>(null);

  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const marqueeActiveRef = useRef(false);
  const marqueeJustEndedRef = useRef(false);
  const marqueeBaseRef = useRef<Set<string>>(new Set());
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const selectedIdsRef = useRef(selectedIds);
  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);

  const inSession = session !== null;

  const allLoadoutIds = useMemo(
    () => tree.nodes
      .filter((n) => n.type === LoadoutNodeType.LOADOUT && !isCommunityLoadoutId(n.id))
      .map((n) => n.id),
    [tree],
  );

  const idToUuid = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of tree.nodes) map.set(n.id, n.uuid);
    return map;
  }, [tree]);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setHostDisplayName(defaultHostDisplayName);
    setJoinDisplayName(defaultJoinDisplayName);
    setMaxPeers(DEFAULT_MAX_PEERS);
    setSelectedIds(new Set());
    setQuery('');
    setRoomIdInput('');
    lastClickedRef.current = null;
  }, [open, initialMode, defaultHostDisplayName, defaultJoinDisplayName]);

  // Focus the first input when the setup view is shown.
  useEffect(() => {
    if (!open || inSession) return;
    const h = window.setTimeout(() => {
      if (mode === CollabSessionMode.HOST) hostNameRef.current?.focus();
      else joinRoomRef.current?.focus();
    }, 40);
    return () => window.clearTimeout(h);
  }, [open, inSession, mode]);

  const queryLower = query.trim().toLowerCase();
  const visibleIds = useMemo(() => {
    if (!queryLower) return null;
    const matching = new Set<string>();
    for (const node of tree.nodes) {
      if (node.type === LoadoutNodeType.LOADOUT_VIEW) continue;
      if (isCommunityLoadoutId(node.id)) continue;
      if (node.name.toLowerCase().includes(queryLower) && node.type === LoadoutNodeType.LOADOUT) {
        matching.add(node.id);
        let cur: LoadoutNode | undefined = node;
        while (cur?.parentId) {
          const pid: string = cur.parentId;
          matching.add(pid);
          cur = tree.nodes.find((n) => n.id === pid);
        }
      }
    }
    return matching;
  }, [tree, queryLower]);

  const flattened = useMemo(
    () => flattenTreeNodes(tree)
      .filter(({ node }) => node.type !== LoadoutNodeType.LOADOUT_VIEW)
      .filter(({ node }) => !isCommunityLoadoutId(node.id))
      .filter(({ node }) => !visibleIds || visibleIds.has(node.id)),
    [tree, visibleIds],
  );

  const orderedLoadoutIds = useMemo(
    () => flattened.filter(({ node }) => node.type === LoadoutNodeType.LOADOUT).map(({ node }) => node.id),
    [flattened],
  );
  const orderedLoadoutIdSet = useMemo(() => new Set(orderedLoadoutIds), [orderedLoadoutIds]);
  const visibleSelectedCount = useMemo(
    () => orderedLoadoutIds.reduce((acc, id) => acc + (selectedIds.has(id) ? 1 : 0), 0),
    [orderedLoadoutIds, selectedIds],
  );
  const totalSelectedCount = selectedIds.size;
  const totalLoadoutCount = allLoadoutIds.length;

  const toggleOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectRange = useCallback((from: string, to: string) => {
    const a = orderedLoadoutIds.indexOf(from);
    const b = orderedLoadoutIds.indexOf(to);
    if (a < 0 || b < 0) return;
    const [start, end] = a < b ? [a, b] : [b, a];
    const range = orderedLoadoutIds.slice(start, end + 1);
    const shouldSelect = !selectedIds.has(to);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of range) {
        if (shouldSelect) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, [orderedLoadoutIds, selectedIds]);

  const toggleFolder = useCallback((folderId: string) => {
    const descendants = collectLoadoutDescendants(tree, folderId).filter((id) => orderedLoadoutIdSet.has(id));
    if (descendants.length === 0) return;
    const anyOff = descendants.some((id) => !selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (anyOff) for (const id of descendants) next.add(id);
      else for (const id of descendants) next.delete(id);
      return next;
    });
  }, [tree, orderedLoadoutIdSet, selectedIds]);

  const handleRowClick = useCallback((e: React.MouseEvent, id: string) => {
    if (marqueeJustEndedRef.current) { marqueeJustEndedRef.current = false; return; }
    if (e.shiftKey && lastClickedRef.current && lastClickedRef.current !== id) {
      selectRange(lastClickedRef.current, id);
    } else {
      toggleOne(id);
    }
    lastClickedRef.current = id;
  }, [selectRange, toggleOne]);

  const handleFolderClick = useCallback((id: string) => {
    if (marqueeJustEndedRef.current) { marqueeJustEndedRef.current = false; return; }
    toggleFolder(id);
  }, [toggleFolder]);

  useEffect(() => {
    if (!open || inSession || mode !== CollabSessionMode.HOST) return;
    const el = listRef.current;
    if (!el) return;

    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea')) return;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      marqueeBaseRef.current = new Set(selectedIdsRef.current);
    };

    const onMove = (e: MouseEvent) => {
      const start = dragStartRef.current;
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (!marqueeActiveRef.current && Math.hypot(dx, dy) > MARQUEE_THRESHOLD_PX) {
        marqueeActiveRef.current = true;
      }
      if (!marqueeActiveRef.current) return;
      const rect = { x1: start.x, y1: start.y, x2: e.clientX, y2: e.clientY };
      setMarquee(rect);

      const left = Math.min(rect.x1, rect.x2);
      const right = Math.max(rect.x1, rect.x2);
      const top = Math.min(rect.y1, rect.y2);
      const bottom = Math.max(rect.y1, rect.y2);

      const rows = el.querySelectorAll<HTMLElement>('[data-loadout-id]');
      const inside = new Set<string>();
      rows.forEach((row) => {
        const r = row.getBoundingClientRect();
        const id = row.dataset.loadoutId;
        if (!id) return;
        if (r.right >= left && r.left <= right && r.bottom >= top && r.top <= bottom) {
          inside.add(id);
        }
      });

      const base = marqueeBaseRef.current;
      const next = new Set<string>();
      base.forEach((id) => { if (!inside.has(id)) next.add(id); });
      inside.forEach((id) => { if (!base.has(id)) next.add(id); });
      setSelectedIds(next);
    };

    const onUp = () => {
      if (marqueeActiveRef.current) marqueeJustEndedRef.current = true;
      marqueeActiveRef.current = false;
      dragStartRef.current = null;
      setMarquee(null);
    };

    el.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      el.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [open, inSession, mode]);

  const handleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (queryLower) {
        const next = new Set(prev);
        for (const id of orderedLoadoutIds) next.add(id);
        return next;
      }
      return new Set(allLoadoutIds);
    });
  }, [queryLower, orderedLoadoutIds, allLoadoutIds]);

  const handleSelectNone = useCallback(() => {
    setSelectedIds((prev) => {
      if (queryLower) {
        const next = new Set(prev);
        for (const id of orderedLoadoutIds) next.delete(id);
        return next;
      }
      return new Set();
    });
  }, [queryLower, orderedLoadoutIds]);

  const handleInvert = useCallback(() => {
    setSelectedIds((prev) => {
      const target = queryLower ? orderedLoadoutIds : allLoadoutIds;
      const next = new Set(prev);
      for (const id of target) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }, [queryLower, orderedLoadoutIds, allLoadoutIds]);

  const normalizedRoomId = roomIdInput.trim().toUpperCase();
  const canHost = hostDisplayName.trim().length > 0 && selectedIds.size > 0;
  const canJoin = normalizedRoomId.length === ROOM_ID_LENGTH && joinDisplayName.trim().length > 0;
  const canSubmit = mode === CollabSessionMode.HOST ? canHost : canJoin;

  // Submit host/join without closing the modal — once the session becomes
  // live, the modal transitions to the session view automatically.
  const handleConfirm = useCallback(() => {
    if (inSession) return;
    if (mode === CollabSessionMode.HOST) {
      const trimmed = hostDisplayName.trim();
      if (!trimmed || selectedIds.size === 0) return;
      const uuids: string[] = [];
      selectedIds.forEach((id) => {
        const uuid = idToUuid.get(id);
        if (uuid) uuids.push(uuid);
      });
      onHost(trimmed, uuids, maxPeers);
    } else {
      const trimmedName = joinDisplayName.trim();
      if (normalizedRoomId.length !== ROOM_ID_LENGTH || !trimmedName) return;
      onJoin(normalizedRoomId, trimmedName);
    }
  }, [inSession, mode, hostDisplayName, selectedIds, idToUuid, maxPeers, onHost,
      joinDisplayName, normalizedRoomId, onJoin]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (inSession) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && mode === CollabSessionMode.HOST) {
        if (!(document.activeElement instanceof HTMLInputElement)) {
          e.preventDefault();
          handleSelectAll();
        }
        return;
      }
      if (e.key === 'Enter' && canSubmit) {
        const active = document.activeElement;
        if (!(active instanceof HTMLInputElement)
          || active === hostNameRef.current
          || active === joinRoomRef.current) {
          e.preventDefault();
          handleConfirm();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, inSession, mode, canSubmit, onClose, handleSelectAll, handleConfirm]);

  // Live countdown while reconnecting.
  const [, forceTick] = useState(0);
  const sessionStatus = session?.status;
  const nextRetryAt = session?.reconnect?.nextRetryAt;
  useEffect(() => {
    if (sessionStatus !== ConnectionStatus.RECONNECTING || !nextRetryAt) return;
    const timer = window.setInterval(() => forceTick((n) => n + 1), 500);
    return () => window.clearInterval(timer);
  }, [sessionStatus, nextRetryAt]);

  if (!open) return null;

  const filteredEmpty = flattened.length === 0;
  const marqueeRect = marquee ? {
    left: Math.min(marquee.x1, marquee.x2),
    top: Math.min(marquee.y1, marquee.y2),
    width: Math.abs(marquee.x2 - marquee.x1),
    height: Math.abs(marquee.y2 - marquee.y1),
  } : null;

  const rootClass = inSession
    ? 'export-modal collab-session-modal collab-session-modal--live'
    : `export-modal collab-session-modal collab-session-modal--${mode}`;

  // ── Session view ──────────────────────────────────────────────────────
  if (inSession && session) {
    const dotColor = STATUS_DOT_COLOR[session.status];
    const statusLabel = STATUS_LABEL[session.status];
    const localPeer = session.peers.find((p) => p.isLocal);
    const isLocalHost = localPeer?.role === CollaborationRole.HOST;
    const retrySecondsLeft = session.reconnect?.nextRetryAt
      ? Math.max(0, Math.ceil((session.reconnect.nextRetryAt - Date.now()) / 1000))
      : null;
    const roleLabel = isLocalHost ? 'Host' : 'Joiner';
    const subtitle = session.status === ConnectionStatus.CONNECTED
      ? `${session.peers.length} ${session.peers.length === 1 ? 'peer' : 'peers'} in the room`
      : `${statusLabel}…`;

    return (
      <div className="devlog-overlay" onClick={onClose}>
        <div className={rootClass} onClick={(e) => e.stopPropagation()}>
          <header className="export-modal-header">
            <div className="export-modal-title-row">
              <h2 className="export-modal-title">Collaboration</h2>
              <button className="export-modal-close" onClick={onClose} aria-label={t('common.close')}>&times;</button>
            </div>
            <p className="export-modal-subtitle">{subtitle}</p>
          </header>

          <div className="collab-session-body">
            <div className="collab-session-status">
              <span className="collab-status-dot" style={{ background: dotColor }} aria-hidden />
              <span className="collab-status-label">{statusLabel}</span>
              <span className="collab-status-sep">·</span>
              <span className="collab-status-role">{roleLabel}</span>
              {session.status === ConnectionStatus.RECONNECTING && (
                <span className="collab-status-retry">
                  attempt {session.reconnect?.attempt ?? 0}
                  {retrySecondsLeft != null ? ` · retry in ${retrySecondsLeft}s` : ''}
                </span>
              )}
              {session.reconnect?.givenUp && (
                <span className="collab-status-retry collab-status-retry--failed">
                  gave up — leave and rejoin
                </span>
              )}
            </div>

            <div className="collab-code-block">
              <span className="collab-code-label">Room code</span>
              <div className="collab-code-row">
                <span className="collab-code-value">{session.roomId}</span>
                <CopyButton text={session.roomId} />
              </div>
              <span className="collab-code-hint">Share this code with anyone you want in the room.</span>
            </div>

            <div className="collab-peers">
              <div className="collab-peers-header">
                <span className="collab-peers-label">Peers</span>
                <span className="collab-peers-count">{session.peers.length}</span>
              </div>
              {session.peers.length === 0 ? (
                <div className="collab-peers-empty">Waiting for peers…</div>
              ) : (
                <ul className="collab-peers-list">
                  {session.peers.map((p) => (
                    <li
                      key={p.peerId}
                      className={`collab-peer${p.isLocal ? ' collab-peer--local' : ''}`}
                      title={p.peerId}
                    >
                      <span
                        className="collab-peer-dot"
                        style={{ background: p.role === CollaborationRole.HOST ? '#e8b23a' : '#7cb7e8' }}
                        aria-hidden
                      />
                      <span className="collab-peer-name">
                        {p.displayName || '(unnamed)'}{p.isLocal ? ' (you)' : ''}
                      </span>
                      <span className="collab-peer-role">{p.role}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <footer className="export-modal-footer">
            <span className="export-footer-hint">Close to hide · Leave room to end the session</span>
            <div className="export-footer-actions">
              {onManageSharedLoadouts && isLocalHost && (
                <button
                  className="export-btn export-btn--ghost"
                  onClick={onManageSharedLoadouts}
                >
                  <span>Shared loadouts</span>
                </button>
              )}
              <button
                className="export-btn export-btn--danger"
                onClick={() => { onLeave(); }}
              >
                <span>Leave room</span>
              </button>
            </div>
          </footer>
        </div>
      </div>
    );
  }

  // ── Setup view (HOST / JOIN tabs) ────────────────────────────────────
  const subtitle = mode === CollabSessionMode.HOST
    ? 'Start a new session and publish selected loadouts to peers.'
    : 'Enter a 6-character room code to sync with a host.';
  const primaryLabel = mode === CollabSessionMode.HOST ? 'Host room' : 'Join room';
  const footerHint = mode === CollabSessionMode.HOST
    ? 'Click to toggle · Shift+click for range · Drag to marquee-select'
    : 'Room codes are 6 letters/numbers · ask the host for theirs';

  return (
    <div className="devlog-overlay" onClick={onClose}>
      <div className={rootClass} onClick={(e) => e.stopPropagation()}>
        <header className="export-modal-header">
          <div className="export-modal-title-row">
            <h2 className="export-modal-title">Collaboration</h2>
            <button className="export-modal-close" onClick={onClose} aria-label={t('common.close')}>&times;</button>
          </div>
          <p className="export-modal-subtitle">{subtitle}</p>
        </header>

        <div className="collab-mode-tabs" role="tablist" aria-label="Session mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === CollabSessionMode.HOST}
            className={`collab-mode-tab${mode === CollabSessionMode.HOST ? ' collab-mode-tab--active' : ''}`}
            onClick={() => setMode(CollabSessionMode.HOST)}
          >
            <span className="collab-mode-tab-glyph">01</span>
            <span className="collab-mode-tab-label">Host</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === CollabSessionMode.JOIN}
            className={`collab-mode-tab${mode === CollabSessionMode.JOIN ? ' collab-mode-tab--active' : ''}`}
            onClick={() => setMode(CollabSessionMode.JOIN)}
          >
            <span className="collab-mode-tab-glyph">02</span>
            <span className="collab-mode-tab-label">Join</span>
          </button>
        </div>

        {mode === CollabSessionMode.HOST ? (
          <>
            <div className="collab-host-fields">
              <div className="stat-field">
                <span className="edit-field-label">Display name</span>
                <div className="stat-field-controls">
                  <input
                    ref={hostNameRef}
                    className="edit-input stat-field-input"
                    type="text"
                    value={hostDisplayName}
                    onChange={(e) => setHostDisplayName(e.target.value)}
                    placeholder={t('collab.host.placeholder.host')}
                  />
                </div>
              </div>
              <NumberInputWithFastForwardButtons
                label="Max peers"
                value={maxPeers}
                min={MIN_MAX_PEERS}
                max={MAX_MAX_PEERS}
                step={1}
                showMinMax
                onChange={setMaxPeers}
              />
            </div>

            <div className="export-search-row">
              <svg className="export-search-icon" viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden>
                <path d="M11.742 10.344a6.5 6.5 0 10-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 001.415-1.414l-3.85-3.85a1.007 1.007 0 00-.115-.1zM12 6.5a5.5 5.5 0 11-11 0 5.5 5.5 0 0111 0z"/>
              </svg>
              <input
                ref={searchRef}
                className="export-search-input"
                placeholder={t('collab.host.placeholder.filter')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button className="export-search-clear" onClick={() => setQuery('')} aria-label={t('common.clearFilter')}>&times;</button>
              )}
            </div>

            <div className="export-action-bar">
              <span className="export-count-badge">
                <span className="export-count-bracket">[</span>
                <span className="export-count-n">{String(queryLower ? visibleSelectedCount : totalSelectedCount).padStart(2, '0')}</span>
                <span className="export-count-sep">/</span>
                <span className="export-count-total">{String(queryLower ? orderedLoadoutIds.length : totalLoadoutCount).padStart(2, '0')}</span>
                <span className="export-count-bracket">]</span>
                <span className="export-count-label">selected</span>
              </span>
              <div className="export-chip-group" role="group">
                <button className="export-chip" onClick={handleSelectAll}>all</button>
                <button className="export-chip" onClick={handleInvert}>invert</button>
                <button className="export-chip" onClick={handleSelectNone}>none</button>
              </div>
            </div>

            <div ref={listRef} className="export-modal-list">
              {filteredEmpty && (
                <div className="export-modal-empty">No loadouts available.</div>
              )}

              {flattened.map(({ node, depth }) => {
                if (node.type === LoadoutNodeType.FOLDER) {
                  const descendants = collectLoadoutDescendants(tree, node.id).filter((id) => orderedLoadoutIdSet.has(id));
                  const selCount = descendants.reduce((acc, id) => acc + (selectedIds.has(id) ? 1 : 0), 0);
                  const state: CheckState = selCount === 0 ? 'off' : selCount === descendants.length ? 'on' : 'partial';
                  const disabled = descendants.length === 0;
                  return (
                    <button
                      key={node.id}
                      type="button"
                      className={`export-node export-node--folder${disabled ? ' export-node--empty' : ''}`}
                      style={{ paddingLeft: 10 + depth * 18 }}
                      onClick={() => !disabled && handleFolderClick(node.id)}
                      disabled={disabled}
                    >
                      <Check state={state} />
                      <span className="export-folder-glyph">{'\u25BC'}</span>
                      <span className="export-node-name">{node.name}</span>
                      {descendants.length > 0 && (
                        <span className="export-folder-count">{selCount}/{descendants.length}</span>
                      )}
                    </button>
                  );
                }
                const isSelected = selectedIds.has(node.id);
                return (
                  <button
                    key={node.id}
                    type="button"
                    data-loadout-id={node.id}
                    className={`export-node export-node--loadout${isSelected ? ' export-node--selected' : ''}`}
                    style={{ paddingLeft: 10 + depth * 18 }}
                    onClick={(e) => handleRowClick(e, node.id)}
                  >
                    <Check state={isSelected ? 'on' : 'off'} />
                    <span className="export-node-name">{node.name}</span>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div className="collab-join-body">
            <label className="collab-join-field">
              <span className="collab-join-field-label">Room code</span>
              <input
                ref={joinRoomRef}
                className="collab-join-code-input"
                value={roomIdInput}
                onChange={(e) => setRoomIdInput(e.target.value.toUpperCase())}
                placeholder="ABC123"
                maxLength={ROOM_ID_LENGTH}
                spellCheck={false}
                autoCapitalize="characters"
              />
              <span className="collab-join-field-hint">
                {normalizedRoomId.length}/{ROOM_ID_LENGTH}
              </span>
            </label>

            <label className="collab-join-field">
              <span className="collab-join-field-label">Display name</span>
              <input
                className="collab-join-name-input"
                value={joinDisplayName}
                onChange={(e) => setJoinDisplayName(e.target.value)}
                placeholder={t('collab.join.placeholder.player')}
              />
            </label>

            <div className="collab-join-note">
              <span className="collab-join-note-glyph">◈</span>
              <span>
                You'll receive the host's shared loadouts live. Changes you make
                to shared loadouts sync back to everyone in the room.
              </span>
            </div>
          </div>
        )}

        <footer className="export-modal-footer">
          <span className="export-footer-hint">{footerHint}</span>
          <div className="export-footer-actions">
            <button className="export-btn export-btn--ghost" onClick={onClose}>Cancel</button>
            <button
              className="export-btn export-btn--primary"
              onClick={handleConfirm}
              disabled={!canSubmit}
            >
              <span>{primaryLabel}</span>
            </button>
          </div>
        </footer>

        {mode === CollabSessionMode.HOST && marqueeRect && marqueeRect.width > 1 && marqueeRect.height > 1 && (
          <div
            className="export-marquee"
            style={{
              left: marqueeRect.left,
              top: marqueeRect.top,
              width: marqueeRect.width,
              height: marqueeRect.height,
            }}
          />
        )}
      </div>
    </div>
  );
}
