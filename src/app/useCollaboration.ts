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

/** Role the local user held in the most recent persisted session, if one
 *  survives (within TTL, not explicitly left). Used by the collab modal to
 *  default the mode toggle to the user's last role after a refresh. */
export function getPersistedCollabRole(): CollaborationRole | null {
  return loadPersistedSession()?.role ?? null;
}

export interface UseCollaborationParams {
  /** Load the SheetData for an arbitrary UUID (uses buildSheetData() for the active
   *  loadout, loadLoadoutData() for background ones). Returns null if the uuid
   *  doesn't correspond to any local loadout. */
  loadSheetDataForUuid: (uuid: string) => SheetData | null;
  /** Deliver a remote sheet for a UUID. Caller decides active vs background handling. */
  applyRemoteSheetData: (uuid: string, sheetData: SheetData, isInitial: boolean) => void;
  /** Create a local loadout for a newly-shared UUID. Return the local id or null to skip. */
  createLocalLoadoutForUuid: (uuid: string, name: string) => string | null;
  /** Resolve a UUID to the local loadout id, if one exists. */
  getLocalIdForUuid: (uuid: string) => string | null;
  /** Resolve a UUID to the local loadout's display name, if one exists. */
  getLocalNameForUuid: (uuid: string) => string | null;
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
  /** Reconcile the live doc with the current set of tree UUIDs. Called by the
   *  hook consumer whenever the loadout tree changes, so that deleting a shared
   *  loadout auto-unshares it (and undoing the delete auto-restores it).
   *  Remembered share intent is independent of whether the node currently exists. */
  reconcileWithTree: (presentUuids: ReadonlySet<string>) => void;
  /** Attempt to restore a recent session from localStorage. Returns true if restored. */
  tryRestoreSession: () => boolean;
}

export function useCollaboration(params: UseCollaborationParams): UseCollaborationReturn {
  const {
    loadSheetDataForUuid,
    applyRemoteSheetData,
    createLocalLoadoutForUuid,
    getLocalIdForUuid,
    getLocalNameForUuid,
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
  /** UUIDs the host has INTENDED to share. Independent of whether each uuid's
   *  node currently exists in the tree — so deleting a shared loadout and then
   *  undoing the delete re-shares automatically. */
  const rememberedSharedUuidsRef = useRef<Set<string>>(new Set());
  const inboundTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const initialAppliedRef = useRef<Set<string>>(new Set());
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
        if (localId) {
          observeLoadout(entry.uuid);
          // The snapshot that populated the Y.Doc arrived before our observer
          // was attached, so no observer callback will fire for it. Pull the
          // current Y.Map state into local state explicitly — otherwise the
          // joiner sees empty loadouts until the host makes a fresh edit.
          scheduleInboundApply(entry.uuid);
        }
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
  }, [createLocalLoadoutForUuid, getLocalIdForUuid, observeLoadout, renameLocalLoadout, scheduleInboundApply, stopObservingLoadout, updateSession]);

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

    const newSession: CollaborationSession = {
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
    };
    // Sync the ref eagerly so synchronous follow-up calls (e.g. the
    // caller's shareLoadout loop) see the live session instead of the
    // stale `null` from before setSession has re-rendered.
    sessionRef.current = newSession;
    setSession(newSession);
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
    rememberedSharedUuidsRef.current = new Set();
    bootstrapHost(roomId, displayName, maxPeers);
    // Caller calls shareLoadout for each selected uuid — that populates
    // rememberedSharedUuidsRef and writes to the doc.
    savePersistedSession({
      roomId, role: CollaborationRole.HOST, displayName,
      sharedUuids: [], maxPeers, savedAt: Date.now(),
    });
    return roomId;
  }, [bootstrapHost]);

  /** Persist the current rememberedSharedUuidsRef into localStorage. */
  const persistRemembered = useCallback(() => {
    const persisted = loadPersistedSession();
    if (!persisted) return;
    const next = Array.from(rememberedSharedUuidsRef.current);
    const same = persisted.sharedUuids.length === next.length
      && persisted.sharedUuids.every((u, i) => u === next[i]);
    if (same) return;
    savePersistedSession({ ...persisted, sharedUuids: next, savedAt: Date.now() });
  }, []);

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

    const newSession: CollaborationSession = {
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
    };
    // Sync the ref eagerly so synchronous follow-up calls see the live session.
    sessionRef.current = newSession;
    setSession(newSession);
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
    rememberedSharedUuidsRef.current = new Set();
    sessionRef.current = null;
    setSession(null);
    clearPersistedSession();
  }, [cleanup]);

  const shareLoadout = useCallback((uuid: string): void => {
    const doc = docRef.current;
    const s = sessionRef.current;
    if (!doc || !s || s.role !== CollaborationRole.HOST) return;
    const name = getLocalNameForUuid(uuid);
    if (name == null) {
      console.warn('[collab] shareLoadout: uuid not found in local tree, skipping:', uuid);
      return;
    }
    const sheet = loadSheetDataForUuid(uuid);
    if (!sheet) {
      console.warn('[collab] shareLoadout: failed to load sheet data for uuid:', uuid);
      return;
    }
    rememberedSharedUuidsRef.current.add(uuid);
    sheetDataToYMap(doc, uuid, sheet);
    addSharedLoadoutToDoc(doc, { uuid, name, ownerPeerId: s.localPeerId });
    observeLoadout(uuid);
    initialAppliedRef.current.add(uuid);
    updateSession({ sharedLoadouts: readSharedLoadoutsFromDoc(doc) });
    persistRemembered();
  }, [getLocalNameForUuid, loadSheetDataForUuid, observeLoadout, persistRemembered, updateSession]);

  const unshareLoadout = useCallback((uuid: string): void => {
    const doc = docRef.current;
    const s = sessionRef.current;
    if (!doc || !s || s.role !== CollaborationRole.HOST) return;
    rememberedSharedUuidsRef.current.delete(uuid);
    removeSharedLoadoutFromDoc(doc, uuid);
    stopObservingLoadout(uuid);
    updateSession({ sharedLoadouts: readSharedLoadoutsFromDoc(doc) });
    persistRemembered();
  }, [persistRemembered, stopObservingLoadout, updateSession]);

  /** Reconcile the live doc's shared-loadout set with the current tree.
   *  Called by the hook consumer whenever the loadout tree changes.
   *  - If a remembered uuid no longer has a tree node → auto-unshare (doc only;
   *    intent is preserved so undo restores it).
   *  - If a remembered uuid reappears in the tree → auto-share (doc only). */
  const reconcileWithTree = useCallback((presentUuids: ReadonlySet<string>) => {
    const doc = docRef.current;
    const s = sessionRef.current;
    if (!doc || !s || s.role !== CollaborationRole.HOST) return;
    const inDoc = new Set(readSharedLoadoutsFromDoc(doc).map((e) => e.uuid));
    let changed = false;
    rememberedSharedUuidsRef.current.forEach((uuid) => {
      const treeHas = presentUuids.has(uuid);
      const docHas = inDoc.has(uuid);
      if (treeHas && !docHas) {
        // Reappeared in tree (undo of delete) — re-share.
        const name = getLocalNameForUuid(uuid);
        const sheet = loadSheetDataForUuid(uuid);
        if (name == null || sheet == null) return;
        sheetDataToYMap(doc, uuid, sheet);
        addSharedLoadoutToDoc(doc, { uuid, name, ownerPeerId: s.localPeerId });
        observeLoadout(uuid);
        initialAppliedRef.current.add(uuid);
        changed = true;
      } else if (!treeHas && docHas) {
        // Vanished from tree (delete) — auto-unshare from doc but keep intent.
        removeSharedLoadoutFromDoc(doc, uuid);
        stopObservingLoadout(uuid);
        changed = true;
      }
    });
    if (changed) updateSession({ sharedLoadouts: readSharedLoadoutsFromDoc(doc) });
  }, [getLocalNameForUuid, loadSheetDataForUuid, observeLoadout, stopObservingLoadout, updateSession]);

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

  // Bump `savedAt` on every CONNECTED transition so an active session's TTL
  // doesn't tick down. sharedUuids persistence is handled by persistRemembered
  // called from share/unshare — the live doc set can diverge from intent (when
  // a shared loadout is deleted), so we intentionally don't mirror session
  // state into localStorage here.
  useEffect(() => {
    if (!session) return;
    if (session.connectionStatus !== ConnectionStatus.CONNECTED) return;
    const persisted = loadPersistedSession();
    if (!persisted) return;
    savePersistedSession({ ...persisted, savedAt: Date.now() });
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
      // Seed remembered intent from persisted set; the host's localPeerId IS
      // the roomId, so we can construct doc entries without reading sessionRef
      // (which hasn't synced yet — setSession inside bootstrapHost is queued).
      rememberedSharedUuidsRef.current = new Set(persisted.sharedUuids);
      bootstrapHost(persisted.roomId, persisted.displayName, persisted.maxPeers);
      const doc = docRef.current;
      if (doc) {
        for (const uuid of persisted.sharedUuids) {
          const name = getLocalNameForUuid(uuid);
          if (name == null) {
            // Node was deleted while offline — remembered intent persists,
            // reconcileWithTree will re-share if the node comes back.
            continue;
          }
          const sheet = loadSheetDataForUuid(uuid);
          if (sheet == null) continue;
          sheetDataToYMap(doc, uuid, sheet);
          addSharedLoadoutToDoc(doc, { uuid, name, ownerPeerId: persisted.roomId });
          observeLoadout(uuid);
          initialAppliedRef.current.add(uuid);
        }
        updateSession({ sharedLoadouts: readSharedLoadoutsFromDoc(doc) });
      }
    } else {
      joinRoom(persisted.roomId, persisted.displayName);
    }
    return true;
  }, [bootstrapHost, getLocalNameForUuid, joinRoom, loadSheetDataForUuid, observeLoadout, updateSession]);

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
    reconcileWithTree,
    tryRestoreSession,
  };
}
