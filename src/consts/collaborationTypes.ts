import { CollaborationRole, PermissionLevel, ConnectionStatus, SyncStatus } from './enums';

/** Y.Doc top-level map names. */
export const YDOC_LOADOUTS = 'loadouts';
export const YDOC_PEERS = 'peers';
export const YDOC_META = 'meta';

/** Keys used inside the meta map. */
export const YMETA_SHARED_LOADOUTS = 'sharedLoadouts';

/** Keys used inside a per-loadout Y.Map. */
export const YLOADOUT_VERSION = 'version';
export const YLOADOUT_OPERATOR_IDS = 'operatorIds';
export const YLOADOUT_ENEMY_ID = 'enemyId';
export const YLOADOUT_ENEMY_STATS = 'enemyStatsJson';
export const YLOADOUT_VISIBLE_SKILLS = 'visibleSkillsJson';
export const YLOADOUT_NEXT_EVENT_ID = 'nextEventId';
export const YLOADOUT_LOADOUTS = 'loadoutsJson';
export const YLOADOUT_LOADOUT_PROPERTIES = 'loadoutPropertiesJson';
export const YLOADOUT_RESOURCE_CONFIGS = 'resourceConfigsJson';
export const YLOADOUT_EVENTS = 'events';
export const YLOADOUT_OVERRIDES = 'overrides';

/** Yjs transaction origin tags. */
export const YORIGIN_LOCAL = 'local';
export const YORIGIN_REMOTE = 'remote';

/** PeerJS DataConnection serialization option. `raw` passes ArrayBuffer/Uint8Array through untouched. */
export const PEERJS_SERIALIZATION = 'raw' as const;

/**
 * ICE servers used for WebRTC NAT traversal. STUN handles the common case
 * of peers behind cone NATs. When peers are behind symmetric NATs OR when
 * a browser blocks host-candidate exposure (Firefox does this by default
 * via mDNS obfuscation), a TURN relay is required.
 *
 * We don't ship a default TURN server — the free public TURN ecosystem is
 * unreliable (OpenRelay was discontinued in 2024, others are rate-limited
 * or require signup). Users who need TURN can plug in their own via
 * `zst-turn-config` in localStorage, shape `{urls, username, credential}`.
 */
const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

const TURN_CONFIG_LS_KEY = 'zst-turn-config';

export function loadIceServers(): RTCIceServer[] {
  const out = [...DEFAULT_ICE_SERVERS];
  try {
    const raw = localStorage.getItem(TURN_CONFIG_LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const s of parsed) {
          if (s && typeof s === 'object' && s.urls) out.push(s as RTCIceServer);
        }
      } else if (parsed && typeof parsed === 'object' && parsed.urls) {
        out.push(parsed as RTCIceServer);
      }
    }
  } catch { /* ignore */ }
  return out;
}

export interface PeerInfo {
  peerId: string;
  displayName: string;
  role: CollaborationRole;
  joinedAt: number;
}

export interface LoadoutPermission {
  loadoutUuid: string;
  peerId: string;
  level: PermissionLevel;
}

export interface SharedLoadoutEntry {
  uuid: string;
  name: string;
  ownerPeerId: string;
}

export interface LoadoutSyncState {
  uuid: string;
  status: SyncStatus;
  lastSyncedAt: number;
}

export interface ReconnectInfo {
  /** 1-indexed current retry number (e.g. "attempt 3"). 0 when not retrying. */
  attempt: number;
  /** Timestamp (ms since epoch) when the next retry will fire. Null when no retry is pending. */
  nextRetryAt: number | null;
  /** Whether we've given up reconnecting (past the TTL). */
  givenUp: boolean;
}

export interface CollaborationSession {
  roomId: string;
  role: CollaborationRole;
  localPeerId: string;
  localDisplayName: string;
  connectionStatus: ConnectionStatus;
  peers: PeerInfo[];
  sharedLoadouts: SharedLoadoutEntry[];
  syncStates: Map<string, LoadoutSyncState>;
  permissions: LoadoutPermission[];
  maxPeers: number;
  reconnect: ReconnectInfo;
}
