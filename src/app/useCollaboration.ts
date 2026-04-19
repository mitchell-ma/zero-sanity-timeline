/**
 * Collaboration hook — owns the Y.Doc, PeerJS provider, and per-loadout
 * sync bookkeeping for a room. Callers provide the local integration:
 *
 *  - `buildSheetData()` produces the active loadout's current SheetData
 *    for outbound diffs.
 *  - `applyRemoteSheetData(uuid, sheetData)` delivers inbound sheets. The
 *    caller decides whether to route the sheet through `resetCombatState`
 *    (active loadout), `applyRemote` (active loadout, preserving undo), or
 *    `saveLoadoutData` (background loadout).
 *  - `createLocalLoadoutForUuid(uuid, name)` is called when the joiner
 *    receives a shared loadout whose UUID does not yet exist locally. The
 *    caller should add a node and return its local id (or null to skip).
 *  - `getLocalIdForUuid(uuid)` resolves the caller's local loadout id
 *    from the cross-peer UUID.
 *
 * The hook exposes imperative `hostRoom`, `joinRoom`, `leaveRoom`,
 * `shareLoadout`, `unshareLoadout`, and `pushLocalChange` methods. A
 * `session` object is returned in state for UI consumers.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import * as Y from 'yjs';
import { SheetData } from '../utils/sheetStorage';
import {
  CollaborationRole,
  ConnectionStatus,
  SyncStatus,
} from '../consts/enums';
import {
  CollaborationSession,
  YDOC_LOADOUTS,
  YDOC_META,
  YDOC_PEERS,
  YORIGIN_LOCAL,
} from '../consts/collaborationTypes';
import { PeerJSProvider } from '../collaboration/peerjsProvider';
import {
  sheetDataToYMap,
  yMapToSheetData,
  applySheetDataDiff,
  getOrCreateLoadoutMap,
} from '../collaboration/yjsCodec';
import {
  generateRoomId,
  registerPeerInDoc,
  unregisterPeerFromDoc,
  readPeersFromDoc,
  readSharedLoadoutsFromDoc,
  addSharedLoadoutToDoc,
  removeSharedLoadoutFromDoc,
} from '../controller/collaborationController';

const INBOUND_DEBOUNCE_MS = 16;

// ── Persistent session (survives accidental refreshes) ──────────────────────

const COLLAB_SESSION_LS_KEY = 'zst-collab-session';
/** Auto-restore window — sessions older than this are discarded on load.
 *  Extended on every live connection so an active session won't expire. */
const COLLAB_SESSION_TTL_MS = 30 * 60 * 1000; // 30min

interface PersistedSession {
  roomId: string;
  role: CollaborationRole;
  displayName: string;
  sharedUuids: string[];
  maxPeers: number;
  savedAt: number;
}

function loadPersistedSession(): PersistedSession | null {
  try {
    const raw = localStorage.getItem(COLLAB_SESSION_LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedSession;
    if (typeof parsed?.roomId !== 'string' || typeof parsed?.role !== 'string') return null;
    if (Date.now() - (parsed.savedAt ?? 0) > COLLAB_SESSION_TTL_MS) {
      localStorage.removeItem(COLLAB_SESSION_LS_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function savePersistedSession(s: PersistedSession): void {
  try { localStorage.setItem(COLLAB_SESSION_LS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

function clearPersistedSession(): void {
  try { localStorage.removeItem(COLLAB_SESSION_LS_KEY); } catch { /* ignore */ }
}

export interface UseCollaborationParams {
  /** Snapshot the active loadout as SheetData. */
  buildSheetData: () => SheetData;
  /** Deliver a remote sheet for a UUID. Caller decides active vs background handling. */
  applyRemoteSheetData: (uuid: string, sheetData: SheetData, isInitial: boolean) => void;
  /** Create a local loadout for a newly-shared UUID. Return the local id or null to skip. */
  createLocalLoadoutForUuid: (uuid: string, name: string) => string | null;
  /** Resolve a UUID to the local loadout id, if one exists. */
  getLocalIdForUuid: (uuid: string) => string | null;
  /** Rename the local loadout node when a peer renames a shared loadout. */
  renameLocalLoadout: (localId: string, name: string) => void;
}

export interface UseCollaborationReturn {
  session: CollaborationSession | null;
  hostRoom: (displayName: string, loadoutUuids: string[], maxPeers?: number) => string;
  joinRoom: (roomId: string, displayName: string) => void;
  leaveRoom: () => void;
  shareLoadout: (uuid: string) => void;
  unshareLoadout: (uuid: string) => void;
  pushLocalChange: (uuid: string, prev: SheetData | null, next: SheetData) => void;
  isLoadoutSyncing: (uuid: string) => boolean;
  isConnected: boolean;
  isHost: boolean;
  syncingLoadoutUuids: string[];
  /** Attempt to restore a recent session from localStorage. Returns true if restored. */
  tryRestoreSession: () => boolean;
}

export function useCollaboration(params: UseCollaborationParams): UseCollaborationReturn {
  const {
    buildSheetData,
    applyRemoteSheetData,
    createLocalLoadoutForUuid,
    getLocalIdForUuid,
    renameLocalLoadout,
  } = params;

  const [session, setSession] = useState<CollaborationSession | null>(null);
  const sessionRef = useRef<CollaborationSession | null>(null);
  sessionRef.current = session;

  const docRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<PeerJSProvider | null>(null);
  const loadoutObserversRef = useRef<Map<string, () => void>>(new Map());
  const metaObserverRef = useRef<(() => void) | null>(null);
  const peersObserverRef = useRef<(() => void) | null>(null);
  const inboundTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const initialAppliedRef = useRef<Set<string>>(new Set());
  const latestBuildSheetDataRef = useRef(buildSheetData);
  latestBuildSheetDataRef.current = buildSheetData;

  // ── Helpers ────────────────────────────────────────────────────────────────

  const updateSession = useCallback((patch: Partial<CollaborationSession>) => {
    setSession((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const setSyncStatus = useCallback((uuid: string, status: SyncStatus) => {
    setSession((prev) => {
      if (!prev) return prev;
      const next = new Map(prev.syncStates);
      next.set(uuid, { uuid, status, lastSyncedAt: Date.now() });
      return { ...prev, syncStates: next };
    });
  }, []);

  const scheduleInboundApply = useCallback((uuid: string) => {
    const existing = inboundTimersRef.current.get(uuid);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      inboundTimersRef.current.delete(uuid);
      const doc = docRef.current;
      if (!doc) return;
      const loadoutMap = getOrCreateLoadoutMap(doc, uuid);
      const sheetData = yMapToSheetData(loadoutMap);
      const isInitial = !initialAppliedRef.current.has(uuid);
      initialAppliedRef.current.add(uuid);
      applyRemoteSheetData(uuid, sheetData, isInitial);
      setSyncStatus(uuid, SyncStatus.IDLE);
    }, INBOUND_DEBOUNCE_MS);
    inboundTimersRef.current.set(uuid, t);
    setSyncStatus(uuid, SyncStatus.SYNCING);
  }, [applyRemoteSheetData, setSyncStatus]);

  // Start observing a per-loadout Y.Map for inbound updates.
  const observeLoadout = useCallback((uuid: string) => {
    const doc = docRef.current;
    if (!doc) return;
    if (loadoutObserversRef.current.has(uuid)) return;
    const loadoutMap = getOrCreateLoadoutMap(doc, uuid);
    const handler = (_events: unknown, txn: Y.Transaction) => {
      if (txn.origin === YORIGIN_LOCAL) return;
      scheduleInboundApply(uuid);
    };
    loadoutMap.observeDeep(handler);
    loadoutObserversRef.current.set(uuid, () => loadoutMap.unobserveDeep(handler));
  }, [scheduleInboundApply]);

  const stopObservingLoadout = useCallback((uuid: string) => {
    const off = loadoutObserversRef.current.get(uuid);
    if (off) off();
    loadoutObserversRef.current.delete(uuid);
    initialAppliedRef.current.delete(uuid);
    const t = inboundTimersRef.current.get(uuid);
    if (t) {
      clearTimeout(t);
      inboundTimersRef.current.delete(uuid);
    }
  }, []);

  // Observe meta (shared loadouts list, peer list) — fires on updates from any peer.
  const observeMeta = useCallback(() => {
    const doc = docRef.current;
    if (!doc) return;
    const metaMap = doc.getMap(YDOC_META);
    const peersMap = doc.getMap(YDOC_PEERS);

    const metaHandler = (_events: unknown, txn: Y.Transaction) => {
      if (txn.origin === YORIGIN_LOCAL) return;
      handleMetaChange();
    };
    const peersHandler = (_events: unknown, txn: Y.Transaction) => {
      if (txn.origin === YORIGIN_LOCAL) return;
      updateSession({ peers: readPeersFromDoc(doc) });
    };
    metaMap.observeDeep(metaHandler);
    peersMap.observeDeep(peersHandler);
    metaObserverRef.current = () => metaMap.unobserveDeep(metaHandler);
    peersObserverRef.current = () => peersMap.unobserveDeep(peersHandler);
  }, [updateSession]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMetaChange = useCallback(() => {
    const doc = docRef.current;
    if (!doc) return;
    const shared = readSharedLoadoutsFromDoc(doc);
    // Start sync for any newly shared loadouts; stop for removed ones.
    const currentUuids = new Set(shared.map((e) => e.uuid));
    const prevShared = sessionRef.current?.sharedLoadouts ?? [];
    const prevUuids = new Set(prevShared.map((e) => e.uuid));

    for (const entry of shared) {
      if (!prevUuids.has(entry.uuid)) {
        // Newly shared — ensure local presence then start observing.
        let localId = getLocalIdForUuid(entry.uuid);
        if (!localId) {
          localId = createLocalLoadoutForUuid(entry.uuid, entry.name);
        }
        if (localId) observeLoadout(entry.uuid);
      } else {
        // Name may have changed — propagate to local node.
        const prevEntry = prevShared.find((e) => e.uuid === entry.uuid);
        if (prevEntry && prevEntry.name !== entry.name) {
          const localId = getLocalIdForUuid(entry.uuid);
          if (localId) renameLocalLoadout(localId, entry.name);
        }
      }
    }
    for (const uuid of Array.from(prevUuids)) {
      if (!currentUuids.has(uuid)) stopObservingLoadout(uuid);
    }

    updateSession({ sharedLoadouts: shared });
  }, [createLocalLoadoutForUuid, getLocalIdForUuid, observeLoadout, renameLocalLoadout, stopObservingLoadout, updateSession]);

  // ── Teardown ───────────────────────────────────────────────────────────────

  const cleanup = useCallback(() => {
    inboundTimersRef.current.forEach((t) => clearTimeout(t));
    inboundTimersRef.current.clear();
    loadoutObserversRef.current.forEach((off) => off());
    loadoutObserversRef.current.clear();
    if (metaObserverRef.current) {
      metaObserverRef.current();
      metaObserverRef.current = null;
    }
    if (peersObserverRef.current) {
      peersObserverRef.current();
      peersObserverRef.current = null;
    }
    initialAppliedRef.current.clear();
    if (providerRef.current) {
      providerRef.current.destroy();
      providerRef.current = null;
    }
    if (docRef.current) {
      docRef.current.destroy();
      docRef.current = null;
    }
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  // ── Public API ─────────────────────────────────────────────────────────────

  // Internal: set up the Y.Doc + provider for a host session. Extracted so
  // both the public hostRoom (fresh room) and tryRestoreSession (existing
  // roomId) can share the setup.
  const bootstrapHost = useCallback((roomId: string, displayName: string, maxPeers: number) => {
    cleanup();
    const doc = new Y.Doc();
    docRef.current = doc;
    doc.getMap(YDOC_LOADOUTS);
    doc.getMap(YDOC_PEERS);
    doc.getMap(YDOC_META);

    const provider = new PeerJSProvider(doc, roomId, CollaborationRole.HOST, displayName, maxPeers);
    providerRef.current = provider;
    const localPeerId = roomId;
    registerPeerInDoc(doc, localPeerId, displayName, CollaborationRole.HOST);

    setSession({
      roomId,
      role: CollaborationRole.HOST,
      localPeerId,
      localDisplayName: displayName,
      connectionStatus: provider.getStatus(),
      peers: readPeersFromDoc(doc),
      sharedLoadouts: [],
      syncStates: new Map(),
      permissions: [],
      maxPeers,
      reconnect: provider.getReconnectInfo(),
    });
    provider.onStatus((status) => updateSession({ connectionStatus: status }));
    provider.onReconnect((info) => updateSession({ reconnect: info }));
    provider.onPeers((peerIds) => {
      const live = new Set(peerIds);
      live.add(localPeerId);
      const docPeers = readPeersFromDoc(doc);
      for (const p of docPeers) {
        if (!live.has(p.peerId)) unregisterPeerFromDoc(doc, p.peerId);
      }
      updateSession({ peers: readPeersFromDoc(doc) });
    });

    observeMeta();
  }, [cleanup, observeMeta, updateSession]);

  const hostRoom = useCallback((displayName: string, _loadoutUuids: string[], maxPeers: number = 4): string => {
    const roomId = generateRoomId();
    bootstrapHost(roomId, displayName, maxPeers);
    // Caller owns shareLoadout calls for each uuid (needs buildSheetData to
    // be fresh). Persistence of the shared set happens in an effect below.
    savePersistedSession({
      roomId, role: CollaborationRole.HOST, displayName,
      sharedUuids: [], maxPeers, savedAt: Date.now(),
    });
    return roomId;
  }, [bootstrapHost]);

  const joinRoom = useCallback((roomId: string, displayName: string): void => {
    cleanup();
    const doc = new Y.Doc();
    docRef.current = doc;
    doc.getMap(YDOC_LOADOUTS);
    doc.getMap(YDOC_PEERS);
    doc.getMap(YDOC_META);

    const provider = new PeerJSProvider(doc, roomId, CollaborationRole.JOINER, displayName);
    providerRef.current = provider;
    // Actual PeerJS peer ID is assigned on 'open' — set a placeholder until then
    // so session.localPeerId is never undefined.
    const placeholderLocalPeerId = `joiner-${uuidv4().slice(0, 8)}`;

    setSession({
      roomId,
      role: CollaborationRole.JOINER,
      localPeerId: placeholderLocalPeerId,
      localDisplayName: displayName,
      connectionStatus: provider.getStatus(),
      peers: [],
      sharedLoadouts: [],
      syncStates: new Map(),
      permissions: [],
      maxPeers: 0,
      reconnect: provider.getReconnectInfo(),
    });
    provider.onStatus((status) => updateSession({ connectionStatus: status }));
    provider.onReconnect((info) => updateSession({ reconnect: info }));
    provider.onPeers(() => updateSession({ peers: readPeersFromDoc(doc) }));

    provider.onSynced(() => {
      // Use the real PeerJS peer ID so the host can correlate conn.peer ↔ registry entry.
      const realId = provider.getLocalPeerId() ?? placeholderLocalPeerId;
      registerPeerInDoc(doc, realId, displayName, CollaborationRole.JOINER);
      observeMeta();
      handleMetaChange();
      // Seed peers from the doc state we received in the initial snapshot.
      // The snapshot arrived before observeMeta wired up, so nothing else
      // triggers an update; do it explicitly here.
      updateSession({ localPeerId: realId, peers: readPeersFromDoc(doc) });
    });

    savePersistedSession({
      roomId, role: CollaborationRole.JOINER, displayName,
      sharedUuids: [], maxPeers: 0, savedAt: Date.now(),
    });
  }, [cleanup, handleMetaChange, observeMeta, updateSession]);

  const leaveRoom = useCallback((): void => {
    const doc = docRef.current;
    const s = sessionRef.current;
    if (doc && s) {
      try { unregisterPeerFromDoc(doc, s.localPeerId); } catch { /* ignore */ }
    }
    cleanup();
    setSession(null);
    clearPersistedSession();
  }, [cleanup]);

  const shareLoadout = useCallback((uuid: string): void => {
    const doc = docRef.current;
    const s = sessionRef.current;
    if (!doc || !s || s.role !== CollaborationRole.HOST) return;
    // Seed the doc with the current SheetData for this uuid.
    const sheet = latestBuildSheetDataRef.current();
    sheetDataToYMap(doc, uuid, sheet);
    addSharedLoadoutToDoc(doc, { uuid, name: `Shared-${uuid.slice(0, 4)}`, ownerPeerId: s.localPeerId });
    observeLoadout(uuid);
    initialAppliedRef.current.add(uuid);
    updateSession({ sharedLoadouts: readSharedLoadoutsFromDoc(doc) });
  }, [observeLoadout, updateSession]);

  const unshareLoadout = useCallback((uuid: string): void => {
    const doc = docRef.current;
    const s = sessionRef.current;
    if (!doc || !s || s.role !== CollaborationRole.HOST) return;
    removeSharedLoadoutFromDoc(doc, uuid);
    stopObservingLoadout(uuid);
    updateSession({ sharedLoadouts: readSharedLoadoutsFromDoc(doc) });
  }, [stopObservingLoadout, updateSession]);

  const pushLocalChange = useCallback((uuid: string, prev: SheetData | null, next: SheetData): void => {
    const doc = docRef.current;
    if (!doc) return;
    applySheetDataDiff(doc, uuid, prev, next);
  }, []);

  const isLoadoutSyncing = useCallback((uuid: string): boolean => {
    const s = sessionRef.current;
    if (!s) return false;
    return s.sharedLoadouts.some((e) => e.uuid === uuid);
  }, []);

  const syncingLoadoutUuids = session?.sharedLoadouts.map((e) => e.uuid) ?? [];
  const isConnected = session?.connectionStatus === ConnectionStatus.CONNECTED;
  const isHost = session?.role === CollaborationRole.HOST;

  // Keep the persisted session's sharedUuids in sync with the live session,
  // and bump `savedAt` whenever we're actively connected so the TTL doesn't
  // tick down while a session is alive.
  useEffect(() => {
    if (!session) return;
    const persisted = loadPersistedSession();
    if (!persisted) return;
    const nextUuids = session.sharedLoadouts.map((e) => e.uuid);
    const uuidsChanged = persisted.sharedUuids.length !== nextUuids.length
      || persisted.sharedUuids.some((u, i) => u !== nextUuids[i]);
    const isConnected = session.connectionStatus === ConnectionStatus.CONNECTED;
    if (!uuidsChanged && !isConnected) return;
    savePersistedSession({ ...persisted, sharedUuids: nextUuids, savedAt: Date.now() });
  }, [session]);

  // Attempt to restore a recent session saved in localStorage. Returns true
  // if a session was found and restoration began (connection + sync happen
  // asynchronously — caller should listen on `session.connectionStatus`).
  const tryRestoreSession = useCallback((): boolean => {
    const persisted = loadPersistedSession();
    console.info('[collab] tryRestoreSession — persisted:', persisted);
    if (!persisted) {
      console.info('[collab] no persisted session (check: ttl expired? user left? never joined?)');
      return false;
    }
    console.info('[collab] restoring as', persisted.role, 'room=', persisted.roomId);
    if (persisted.role === CollaborationRole.HOST) {
      bootstrapHost(persisted.roomId, persisted.displayName, persisted.maxPeers);
      // Re-share each previously shared uuid with its current SheetData.
      const doc = docRef.current;
      const s = sessionRef.current;
      if (doc && s) {
        for (const uuid of persisted.sharedUuids) {
          const sheet = latestBuildSheetDataRef.current();
          sheetDataToYMap(doc, uuid, sheet);
          addSharedLoadoutToDoc(doc, { uuid, name: `Shared-${uuid.slice(0, 4)}`, ownerPeerId: s.localPeerId });
          observeLoadout(uuid);
          initialAppliedRef.current.add(uuid);
        }
        updateSession({ sharedLoadouts: readSharedLoadoutsFromDoc(doc) });
      }
    } else {
      joinRoom(persisted.roomId, persisted.displayName);
    }
    return true;
  }, [bootstrapHost, joinRoom, observeLoadout, updateSession]);

  return {
    session,
    hostRoom,
    joinRoom,
    leaveRoom,
    shareLoadout,
    unshareLoadout,
    pushLocalChange,
    isLoadoutSyncing,
    isConnected,
    isHost,
    syncingLoadoutUuids,
    tryRestoreSession,
  };
}
