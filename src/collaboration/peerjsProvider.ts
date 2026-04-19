/**
 * Custom Yjs provider over PeerJS DataChannels.
 *
 * Topology: star — joiners connect to the host by its PeerJS ID (which IS
 * the room code). The host relays local updates to all peers and forwards
 * remote updates it receives from one peer out to the others.
 *
 * Transport: each Yjs update is a Uint8Array sent via a PeerJS
 * DataConnection with `serialization: 'none'`. No peer discovery beyond
 * the room code; no mesh; no SFU.
 *
 * Reconnection: joiners retry to the host with exponential backoff on
 * connection loss. Host does not retry — joiners are responsible for
 * re-establishing. Signaling-server failures trigger a connection-level
 * error event.
 */

import * as Y from 'yjs';
import { Peer, DataConnection } from 'peerjs';
import { CollaborationRole, ConnectionStatus } from '../consts/enums';
import { PEERJS_SERIALIZATION, loadIceServers, YORIGIN_REMOTE, ReconnectInfo } from '../consts/collaborationTypes';

const MAX_PEERS_DEFAULT = 4;
// Start retries fast (500ms) so accidental refreshes recover within a second
// or two; back off exponentially for persistent failures.
const RECONNECT_INITIAL_MS = 500;
const RECONNECT_MAX_MS = 30_000;
const RECONNECT_GIVE_UP_MS = 60_000;

export type ProviderStatusListener = (status: ConnectionStatus, err?: Error) => void;
export type ProviderPeersListener = (peerIds: string[]) => void;

export class PeerJSProvider {
  readonly doc: Y.Doc;
  readonly roomId: string;
  readonly role: CollaborationRole;
  readonly displayName: string;
  readonly maxPeers: number;

  private peer: Peer | null = null;
  private connections = new Map<string, DataConnection>();
  private status: ConnectionStatus = ConnectionStatus.CONNECTING;

  private readonly statusListeners = new Set<ProviderStatusListener>();
  private readonly peersListeners = new Set<ProviderPeersListener>();
  private readonly syncedCallbacks: (() => void)[] = [];

  private readonly onDocUpdate: (update: Uint8Array, origin: unknown) => void;

  private synced: boolean;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private reconnectStartedAt = 0;
  private nextRetryAt: number | null = null;
  private hasBeenConnected = false;
  private destroyed = false;
  private readonly reconnectListeners = new Set<(info: ReconnectInfo) => void>();

  constructor(
    doc: Y.Doc,
    roomId: string,
    role: CollaborationRole,
    displayName: string,
    maxPeers: number = MAX_PEERS_DEFAULT,
  ) {
    this.doc = doc;
    this.roomId = roomId;
    this.role = role;
    this.displayName = displayName;
    this.maxPeers = maxPeers;
    this.synced = role === CollaborationRole.HOST;

    this.onDocUpdate = (update, origin) => {
      if (origin === YORIGIN_REMOTE) return;
      this.broadcast(update);
    };
    this.doc.on('update', this.onDocUpdate);

    this.start();
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  private start(): void {
    this.destroyed = false;
    this.setStatus(ConnectionStatus.CONNECTING);
    const iceServers = loadIceServers();
    console.info('[collab] using ICE servers:', iceServers.map((s) => s.urls));
    const peerOptions = { config: { iceServers } };
    if (this.role === CollaborationRole.HOST) {
      this.peer = new Peer(this.roomId, peerOptions);
      this.peer.on('open', (id) => {
        console.info('[collab] host peer open:', id);
        this.setStatus(ConnectionStatus.CONNECTED);
      });
      this.peer.on('connection', (conn) => {
        console.info('[collab] host received connection from:', conn.peer);
        this.acceptIncoming(conn);
      });
      this.peer.on('error', (err) => {
        console.warn('[collab] host peer error:', (err as { type?: string }).type, err);
        this.handlePeerError(err);
      });
      this.peer.on('disconnected', () => {
        console.warn('[collab] host peer disconnected from signaling');
        this.setStatus(ConnectionStatus.CONNECTING);
      });
    } else {
      this.peer = new Peer(peerOptions);
      this.peer.on('open', (id) => {
        console.info('[collab] joiner peer open:', id, '-> connecting to host', this.roomId);
        this.connectToHost();
      });
      this.peer.on('error', (err) => {
        console.warn('[collab] joiner peer error:', (err as { type?: string }).type, err);
        this.handlePeerError(err);
      });
      this.peer.on('disconnected', () => {
        console.warn('[collab] joiner peer disconnected from signaling');
        this.setStatus(ConnectionStatus.CONNECTING);
      });
    }
  }

  destroy(): void {
    this.destroyed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.doc.off('update', this.onDocUpdate);
    this.connections.forEach((conn) => {
      try { conn.close(); } catch { /* ignore */ }
    });
    this.connections.clear();
    if (this.peer) {
      try { this.peer.destroy(); } catch { /* ignore */ }
      this.peer = null;
    }
    this.setStatus(ConnectionStatus.DISCONNECTED);
    this.statusListeners.clear();
    this.peersListeners.clear();
    this.reconnectListeners.clear();
    this.syncedCallbacks.length = 0;
  }

  // ── Status + listeners ─────────────────────────────────────────────────────

  getStatus(): ConnectionStatus {
    return this.status;
  }

  onStatus(listener: ProviderStatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  onPeers(listener: ProviderPeersListener): () => void {
    this.peersListeners.add(listener);
    return () => this.peersListeners.delete(listener);
  }

  getReconnectInfo(): ReconnectInfo {
    return {
      attempt: this.reconnectAttempt,
      nextRetryAt: this.nextRetryAt,
      givenUp: this.status === ConnectionStatus.DISCONNECTED && this.reconnectAttempt > 0,
    };
  }

  onReconnect(listener: (info: ReconnectInfo) => void): () => void {
    this.reconnectListeners.add(listener);
    return () => this.reconnectListeners.delete(listener);
  }

  private notifyReconnect(): void {
    const info = this.getReconnectInfo();
    this.reconnectListeners.forEach((l) => l(info));
  }

  onSynced(callback: () => void): void {
    if (this.synced) {
      callback();
      return;
    }
    this.syncedCallbacks.push(callback);
  }

  getLocalPeerId(): string | null {
    return this.peer?.id ?? null;
  }

  getConnectedPeerIds(): string[] {
    return Array.from(this.connections.keys());
  }

  private setStatus(next: ConnectionStatus, err?: Error): void {
    if (this.status === next) return;
    this.status = next;
    this.statusListeners.forEach((l) => l(next, err));
  }

  private notifyPeers(): void {
    const ids = this.getConnectedPeerIds();
    this.peersListeners.forEach((l) => l(ids));
  }

  // ── Host: accept incoming ──────────────────────────────────────────────────

  private acceptIncoming(conn: DataConnection): void {
    if (this.connections.size >= this.maxPeers) {
      try { conn.close(); } catch { /* ignore */ }
      return;
    }
    this.wireConnection(conn, /* sendInitialState */ true);
  }

  // ── Joiner: connect to host ────────────────────────────────────────────────

  private connectToHost(): void {
    if (!this.peer || this.destroyed) return;
    const conn = this.peer.connect(this.roomId, {
      serialization: PEERJS_SERIALIZATION,
      reliable: true,
    });
    this.wireConnection(conn, /* sendInitialState */ false);
  }

  // ── Shared wire ─────────────────────────────────────────────────────────────

  private wireConnection(conn: DataConnection, sendInitialState: boolean): void {
    const handleOpen = () => {
      console.info('[collab] DataConnection open:', conn.peer, 'role:', this.role);
      this.connections.set(conn.peer, conn);
      this.notifyPeers();
      this.setStatus(ConnectionStatus.CONNECTED);
      this.hasBeenConnected = true;
      // Reset reconnect accounting on successful connection.
      this.reconnectAttempt = 0;
      this.reconnectStartedAt = 0;
      this.nextRetryAt = null;
      this.notifyReconnect();
      // BOTH host and joiner send their full Y.Doc state on open. The CRDT
      // merges idempotently, so after the exchange both sides are consistent
      // regardless of who had local-only edits (e.g. from a refresh where
      // the joiner's doc survived but the host was rebuilt from localStorage,
      // or vice versa).
      const snapshot = Y.encodeStateAsUpdate(this.doc);
      if (snapshot.byteLength > 0) {
        this.safeSend(conn, snapshot);
      } else if (sendInitialState) {
        // Force-send an empty update so the joiner's onSynced fires on an
        // otherwise-empty host doc.
        this.safeSend(conn, snapshot);
      }
    };
    // PeerJS may have already opened the channel before our listener attaches
    // (race: emit('connection') followed immediately by emit('open') before the
    // host's acceptIncoming wires handlers). Fire manually if already open.
    if (conn.open) {
      handleOpen();
    } else {
      conn.on('open', handleOpen);
    }
    conn.on('data', (data) => this.handleIncomingData(conn, data));
    conn.on('close', () => {
      console.info('[collab] DataConnection closed:', conn.peer);
      this.handleConnectionClose(conn);
    });
    conn.on('error', (err) => {
      const msg = String((err as { message?: string })?.message ?? err);
      console.warn('[collab] DataConnection error:', conn.peer, err);
      if (/Negotiation|ICE/i.test(msg)) {
        console.warn(
          '[collab] ICE/WebRTC negotiation failed. Likely causes:\n' +
          '  • Firefox + localhost: mDNS host obfuscation. Set\n' +
          '    about:config → media.peerconnection.ice.obfuscate_host_addresses = false\n' +
          '  • Both peers behind symmetric NAT (different networks): need a TURN\n' +
          '    server. Add one via localStorage: localStorage.setItem("zst-turn-config",\n' +
          '    JSON.stringify({urls:"turn:...", username:"...", credential:"..."}))',
        );
      }
      this.handleConnectionClose(conn);
    });
  }

  private handleIncomingData(fromConn: DataConnection, data: unknown): void {
    const update = coerceToUint8Array(data);
    if (!update) return;
    Y.applyUpdate(this.doc, update, YORIGIN_REMOTE);

    // Host relays this update to all other peers.
    if (this.role === CollaborationRole.HOST) {
      this.connections.forEach((conn, peerId) => {
        if (peerId === fromConn.peer) return;
        this.safeSend(conn, update);
      });
    }

    // Joiner receiving first data is considered synced.
    if (!this.synced && this.role === CollaborationRole.JOINER) {
      this.synced = true;
      const cbs = this.syncedCallbacks.splice(0, this.syncedCallbacks.length);
      for (const cb of cbs) cb();
    }
  }

  private handleConnectionClose(conn: DataConnection): void {
    const wasOpen = this.connections.has(conn.peer);
    if (wasOpen) {
      this.connections.delete(conn.peer);
      this.notifyPeers();
    }
    // Joiner: if the conn to the host drops OR the initial negotiation fails
    // before 'open' ever fires (wasOpen === false), retry. ICE can be flaky
    // even without TURN — a fresh DataConnection often picks a different
    // candidate pair and succeeds on the second attempt.
    if (this.role === CollaborationRole.JOINER && conn.peer === this.roomId) {
      this.scheduleReconnect();
    }
  }

  // ── Broadcast ──────────────────────────────────────────────────────────────

  private broadcast(update: Uint8Array): void {
    if (this.role === CollaborationRole.HOST) {
      this.connections.forEach((conn) => this.safeSend(conn, update));
    } else {
      const host = this.connections.get(this.roomId);
      if (host) this.safeSend(host, update);
    }
  }

  private safeSend(conn: DataConnection, data: Uint8Array): void {
    if (!conn.open) return;
    try {
      conn.send(data);
    } catch { /* ignore */ }
  }

  // ── Reconnect (joiner-only) ────────────────────────────────────────────────

  private scheduleReconnect(): void {
    if (this.destroyed || this.role !== CollaborationRole.JOINER) return;
    if (this.reconnectStartedAt === 0) this.reconnectStartedAt = Date.now();
    if (Date.now() - this.reconnectStartedAt > RECONNECT_GIVE_UP_MS) {
      this.nextRetryAt = null;
      this.setStatus(ConnectionStatus.DISCONNECTED);
      this.notifyReconnect();
      return;
    }
    // RECONNECTING only applies after we've had at least one successful
    // connect; otherwise it's still the initial attempt path.
    this.setStatus(this.hasBeenConnected ? ConnectionStatus.RECONNECTING : ConnectionStatus.CONNECTING);
    const delay = Math.min(
      RECONNECT_INITIAL_MS * Math.pow(2, this.reconnectAttempt),
      RECONNECT_MAX_MS,
    );
    this.reconnectAttempt++;
    this.nextRetryAt = Date.now() + delay;
    this.notifyReconnect();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.nextRetryAt = null;
      this.notifyReconnect();
      if (this.destroyed) return;
      if (this.peer && !this.peer.destroyed) {
        this.connectToHost();
      } else {
        // Recreate peer entirely
        this.start();
      }
    }, delay);
  }

  private handlePeerError(err: Error & { type?: string }): void {
    // Unknown peer on joiner side means the host isn't up yet — retry.
    if (this.role === CollaborationRole.JOINER && err.type === 'peer-unavailable') {
      this.scheduleReconnect();
      return;
    }
    // Host refreshed but PeerJS Cloud still holds the old peer id (usually
    // released within a few seconds of the previous tab closing). Retry at
    // 1s intervals so recovery is quick.
    if (this.role === CollaborationRole.HOST && err.type === 'unavailable-id') {
      this.setStatus(ConnectionStatus.CONNECTING);
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        if (this.destroyed) return;
        if (this.peer) {
          try { this.peer.destroy(); } catch { /* ignore */ }
          this.peer = null;
        }
        this.start();
      }, 1000);
      return;
    }
    this.setStatus(ConnectionStatus.ERROR, err);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function coerceToUint8Array(data: unknown): Uint8Array | null {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    const v = data as ArrayBufferView;
    return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  }
  return null;
}
