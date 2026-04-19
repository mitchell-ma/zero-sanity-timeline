/**
 * Integration tests for PeerJSProvider — uses an in-memory mock of PeerJS
 * with a shared registry so that host/joiner peers can discover each other
 * without touching the real signaling server. Exercises the state machine
 * transitions that drive the AppBar connection badge.
 */

import * as Y from 'yjs';
import { CollaborationRole, ConnectionStatus } from '../../consts/enums';

// ── Mock peerjs ──────────────────────────────────────────────────────────────

type Handler<T = unknown> = (arg: T) => void;

class MockEmitter {
  private listeners = new Map<string, Handler[]>();
  on(event: string, handler: Handler): void {
    let list = this.listeners.get(event);
    if (!list) { list = []; this.listeners.set(event, list); }
    list.push(handler);
  }
  off(event: string, handler: Handler): void {
    const list = this.listeners.get(event);
    if (!list) return;
    const idx = list.indexOf(handler);
    if (idx >= 0) list.splice(idx, 1);
  }
  emit(event: string, arg?: unknown): void {
    const list = this.listeners.get(event);
    if (!list) return;
    for (const h of list.slice()) h(arg);
  }
}

class MockDataConnection extends MockEmitter {
  peer: string;
  open = false;
  private partner: MockDataConnection | null = null;
  constructor(remotePeerId: string) {
    super();
    this.peer = remotePeerId;
  }
  bind(partner: MockDataConnection): void {
    this.partner = partner;
  }
  markOpen(): void {
    this.open = true;
    // Fire synchronously so tests don't need timer ticks to observe CONNECTED.
    this.emit('open');
  }
  send(data: unknown): void {
    if (!this.open || !this.partner) return;
    // Defer one microtask so send() returns synchronously but receiver sees async delivery.
    queueMicrotask(() => this.partner?.emit('data', data));
  }
  close(): void {
    if (!this.open) return;
    this.open = false;
    this.emit('close');
    if (this.partner && this.partner.open) {
      this.partner.open = false;
      this.partner.emit('close');
    }
  }
}

const mockRegistry = new Map<string, MockPeer>();
let mockIdCounter = 0;

class MockPeer extends MockEmitter {
  id: string;
  destroyed = false;
  constructor(id?: string) {
    super();
    this.id = id ?? `mock-peer-${++mockIdCounter}`;
    if (mockRegistry.has(this.id)) {
      // Fire async error — PeerJS does this when the id is taken.
      queueMicrotask(() => this.emit('error', Object.assign(new Error(`id taken: ${this.id}`), { type: 'unavailable-id' })));
      return;
    }
    mockRegistry.set(this.id, this);
    queueMicrotask(() => {
      if (this.destroyed) return;
      this.emit('open', this.id);
    });
  }
  connect(remotePeerId: string, _opts?: unknown): MockDataConnection {
    const remote = mockRegistry.get(remotePeerId);
    const localConn = new MockDataConnection(remotePeerId);
    if (!remote) {
      queueMicrotask(() => this.emit('error', Object.assign(new Error('peer unavailable'), { type: 'peer-unavailable' })));
      return localConn;
    }
    const remoteConn = new MockDataConnection(this.id);
    localConn.bind(remoteConn);
    remoteConn.bind(localConn);
    queueMicrotask(() => {
      remote.emit('connection', remoteConn);
      localConn.markOpen();
      remoteConn.markOpen();
    });
    return localConn;
  }
  disconnect(): void { /* no-op for tests */ }
  reconnect(): void { /* no-op for tests */ }
  destroy(): void {
    this.destroyed = true;
    mockRegistry.delete(this.id);
  }
}

jest.mock('peerjs', () => {
  return { Peer: MockPeer, DataConnection: MockDataConnection };
});

// Import provider AFTER jest.mock so it picks up the mock.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PeerJSProvider } = require('../../collaboration/peerjsProvider');

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Wait until `pred` returns true, ticking microtasks in between. */
async function waitFor(pred: () => boolean, maxMs: number = 500): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > maxMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 5));
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('PeerJSProvider state machine', () => {
  beforeEach(() => {
    mockRegistry.clear();
    mockIdCounter = 0;
  });

  test('host reaches CONNECTED when its peer opens', async () => {
    const doc = new Y.Doc();
    const provider = new PeerJSProvider(doc, 'ROOM01', CollaborationRole.HOST, 'Alice');
    expect(provider.getStatus()).toBe(ConnectionStatus.CONNECTING);
    await waitFor(() => provider.getStatus() === ConnectionStatus.CONNECTED);
    expect(provider.getLocalPeerId()).toBe('ROOM01');
    provider.destroy();
  });

  test('joiner reaches CONNECTED when DataConnection to host opens', async () => {
    const hostDoc = new Y.Doc();
    const joinerDoc = new Y.Doc();
    const host = new PeerJSProvider(hostDoc, 'ROOM02', CollaborationRole.HOST, 'Alice');
    await waitFor(() => host.getStatus() === ConnectionStatus.CONNECTED);

    const joiner = new PeerJSProvider(joinerDoc, 'ROOM02', CollaborationRole.JOINER, 'Bob');
    expect(joiner.getStatus()).toBe(ConnectionStatus.CONNECTING);

    await waitFor(() => joiner.getStatus() === ConnectionStatus.CONNECTED, 1000);
    expect(joiner.getConnectedPeerIds()).toContain('ROOM02');

    host.destroy();
    joiner.destroy();
  });

  test('initial Y.Doc state transfers from host to joiner on connect', async () => {
    const hostDoc = new Y.Doc();
    hostDoc.getMap('meta').set('seeded', 'yes');

    const host = new PeerJSProvider(hostDoc, 'ROOM03', CollaborationRole.HOST, 'Alice');
    await waitFor(() => host.getStatus() === ConnectionStatus.CONNECTED);

    const joinerDoc = new Y.Doc();
    const joiner = new PeerJSProvider(joinerDoc, 'ROOM03', CollaborationRole.JOINER, 'Bob');

    let synced = false;
    joiner.onSynced(() => { synced = true; });

    await waitFor(() => synced, 1000);
    expect(joinerDoc.getMap('meta').get('seeded')).toBe('yes');

    host.destroy();
    joiner.destroy();
  });

  test('local Y.Doc update on joiner propagates to host', async () => {
    const hostDoc = new Y.Doc();
    const joinerDoc = new Y.Doc();
    const host = new PeerJSProvider(hostDoc, 'ROOM04', CollaborationRole.HOST, 'Alice');
    await waitFor(() => host.getStatus() === ConnectionStatus.CONNECTED);
    const joiner = new PeerJSProvider(joinerDoc, 'ROOM04', CollaborationRole.JOINER, 'Bob');
    await waitFor(() => joiner.getStatus() === ConnectionStatus.CONNECTED);

    joinerDoc.getMap('shared').set('msg', 'hello from joiner');

    await waitFor(() => hostDoc.getMap('shared').get('msg') === 'hello from joiner', 1000);

    host.destroy();
    joiner.destroy();
  });

  test('joiner enters RECONNECTING when host connection closes after successful connect', async () => {
    const hostDoc = new Y.Doc();
    const joinerDoc = new Y.Doc();
    const host = new PeerJSProvider(hostDoc, 'ROOM05', CollaborationRole.HOST, 'Alice');
    await waitFor(() => host.getStatus() === ConnectionStatus.CONNECTED);
    const joiner = new PeerJSProvider(joinerDoc, 'ROOM05', CollaborationRole.JOINER, 'Bob');
    await waitFor(() => joiner.getStatus() === ConnectionStatus.CONNECTED);

    host.destroy();
    // The host destroy closes its side of the data channel — joiner should detect.
    // Allow a couple of ticks for the close event to propagate.
    await new Promise((r) => setTimeout(r, 20));
    // After a successful connection, drops route to RECONNECTING, not CONNECTING.
    expect([ConnectionStatus.RECONNECTING, ConnectionStatus.DISCONNECTED]).toContain(joiner.getStatus());
    expect(joiner.getReconnectInfo().attempt).toBeGreaterThanOrEqual(1);
    joiner.destroy();
  });

  test('joiner retries when initial ICE fails before open fires', async () => {
    const hostDoc = new Y.Doc();
    const joinerDoc = new Y.Doc();
    const host = new PeerJSProvider(hostDoc, 'ROOM07', CollaborationRole.HOST, 'Alice');
    await waitFor(() => host.getStatus() === ConnectionStatus.CONNECTED);

    // Patch the mock so the FIRST connect() call fails before open.
    let failFirstAttempt = true;
    const origConnect = MockPeer.prototype.connect;
    MockPeer.prototype.connect = function (this: MockPeer, remoteId: string, opts?: unknown): MockDataConnection {
      const conn = origConnect.call(this, remoteId, opts);
      if (failFirstAttempt) {
        failFirstAttempt = false;
        // Simulate ICE failure: emit error before open fires.
        queueMicrotask(() => conn.emit('error', Object.assign(new Error('Negotiation failed'), {})));
      }
      return conn;
    };

    try {
      const joiner = new PeerJSProvider(joinerDoc, 'ROOM07', CollaborationRole.JOINER, 'Bob');
      // First attempt errors; scheduleReconnect kicks in. Wait long enough
      // for the initial 2s backoff + fresh connect to succeed.
      await waitFor(() => joiner.getStatus() === ConnectionStatus.CONNECTED, 5000);
      expect(joiner.getConnectedPeerIds()).toContain('ROOM07');
      joiner.destroy();
    } finally {
      MockPeer.prototype.connect = origConnect;
      host.destroy();
    }
  });

  test('destroy tears down peer and removes from registry', async () => {
    const doc = new Y.Doc();
    const provider = new PeerJSProvider(doc, 'ROOM06', CollaborationRole.HOST, 'Alice');
    await waitFor(() => provider.getStatus() === ConnectionStatus.CONNECTED);
    provider.destroy();
    expect(provider.getStatus()).toBe(ConnectionStatus.DISCONNECTED);
    expect(mockRegistry.has('ROOM06')).toBe(false);
  });
});
