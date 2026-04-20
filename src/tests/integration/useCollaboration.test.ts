/**
 * @jest-environment jsdom
 */

/**
 * useCollaboration hook integration — verifies the joiner receives the host's
 * initial loadout content on first sync.
 *
 * Regression: `handleMetaChange` used to create an empty local loadout for each
 * shared uuid and attach an observer, but never read the current Y.Map content
 * into local state. Since the snapshot arrives BEFORE observers are wired, the
 * observer callback never fired for the initial state, so the joiner saw empty
 * loadouts until the host made a fresh edit. The fix calls
 * `scheduleInboundApply` for newly-shared uuids.
 */

import { SheetData } from '../../utils/sheetStorage';
import { TimelineEvent, VisibleSkills } from '../../consts/viewTypes';
import { OperatorLoadoutState } from '../../view/OperatorLoadoutHeader';

// ── Mock peerjs (in-process registry, synchronous open) ──────────────────────

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
  bind(partner: MockDataConnection): void { this.partner = partner; }
  markOpen(): void { this.open = true; this.emit('open'); }
  send(data: unknown): void {
    if (!this.open || !this.partner) return;
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
  disconnect(): void { /* no-op */ }
  reconnect(): void { /* no-op */ }
  destroy(): void {
    this.destroyed = true;
    mockRegistry.delete(this.id);
  }
}

jest.mock('peerjs', () => ({ Peer: MockPeer, DataConnection: MockDataConnection }));

// Imports AFTER jest.mock so the hook picks up the mocked PeerJS.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { renderHook, act, waitFor } = require('@testing-library/react');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { useCollaboration } = require('../../app/useCollaboration');

// ── Fixtures ─────────────────────────────────────────────────────────────────

const EMPTY_LOADOUT: OperatorLoadoutState = {
  weaponId: null, armorId: null, glovesId: null,
  kit1Id: null, kit2Id: null, consumableId: null, tacticalId: null,
};
const EMPTY_VISIBLE: VisibleSkills = {};

function makeEvent(uid: string, id: string, columnId: string, startFrame: number): TimelineEvent {
  return { uid, id, name: id, ownerEntityId: 'slot-1', columnId, startFrame, segments: [] };
}

function makeSheet(partial: Partial<SheetData> = {}): SheetData {
  return {
    version: 3,
    operatorIds: ['laevatain', 'antal', null, null],
    enemyId: 'test-enemy',
    events: [],
    loadouts: { 'slot-1': EMPTY_LOADOUT },
    loadoutProperties: {},
    visibleSkills: EMPTY_VISIBLE,
    nextEventId: 1,
    ...partial,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useCollaboration — joiner initial apply', () => {
  beforeEach(() => {
    mockRegistry.clear();
    mockIdCounter = 0;
    localStorage.clear();
  });

  test('joiner receives host-shared loadout content on first sync', async () => {
    const HOST_UUID = 'host-loadout-uuid';
    const hostSheet = makeSheet({
      events: [makeEvent('ev-1', 'FLAMING_CINDERS', 'col-basic', 0)],
      operatorIds: ['laevatain', 'antal', 'akekuri', null],
    });

    // Host bookkeeping: one local loadout with a known uuid + name.
    const hostParams = {
      loadSheetDataForUuid: jest.fn((uuid: string) => (uuid === HOST_UUID ? hostSheet : null)),
      applyRemoteSheetData: jest.fn(),
      createLocalLoadoutForUuid: jest.fn((_uuid: string, _name: string) => 'host-local-id'),
      getLocalIdForUuid: jest.fn((uuid: string) => (uuid === HOST_UUID ? 'host-local-id' : null)),
      getLocalNameForUuid: jest.fn((uuid: string) => (uuid === HOST_UUID ? 'Build A' : null)),
      renameLocalLoadout: jest.fn(),
    };

    const { result: hostHook, unmount: unmountHost } = renderHook(() => useCollaboration(hostParams));

    let roomId = '';
    act(() => { roomId = hostHook.current.hostRoom('Alice', [HOST_UUID], 4); });
    await waitFor(() => expect(hostHook.current.isConnected).toBe(true), { timeout: 2000 });
    act(() => { hostHook.current.shareLoadout(HOST_UUID); });

    // Joiner bookkeeping: track created nodes in a map so the hook's
    // `getLocalIdForUuid` can resolve uuids back to local ids on subsequent
    // calls (mirrors the useApp loadoutTree flow).
    const joinerUuidToLocalId = new Map<string, string>();
    const joinerParams = {
      loadSheetDataForUuid: jest.fn(() => null),
      applyRemoteSheetData: jest.fn(),
      createLocalLoadoutForUuid: jest.fn((uuid: string, _name: string) => {
        const localId = `joiner-local-${uuid}`;
        joinerUuidToLocalId.set(uuid, localId);
        return localId;
      }),
      getLocalIdForUuid: jest.fn((uuid: string) => joinerUuidToLocalId.get(uuid) ?? null),
      getLocalNameForUuid: jest.fn(() => null),
      renameLocalLoadout: jest.fn(),
    };

    const { result: joinerHook, unmount: unmountJoiner } = renderHook(() => useCollaboration(joinerParams));
    act(() => { joinerHook.current.joinRoom(roomId, 'Bob'); });

    // Wait for the joiner to sync and the initial apply to land
    // (scheduleInboundApply debounces 16ms).
    await waitFor(
      () => expect(joinerParams.applyRemoteSheetData).toHaveBeenCalled(),
      { timeout: 2000 },
    );

    expect(joinerParams.createLocalLoadoutForUuid).toHaveBeenCalledWith(HOST_UUID, 'Build A');

    const [calledUuid, calledSheet, isInitial] = joinerParams.applyRemoteSheetData.mock.calls[0];
    expect(calledUuid).toBe(HOST_UUID);
    expect(isInitial).toBe(true);
    expect(calledSheet.events.map((e: TimelineEvent) => e.uid)).toEqual(['ev-1']);
    expect(calledSheet.operatorIds).toEqual(['laevatain', 'antal', 'akekuri', null]);
    expect(calledSheet.enemyId).toBe('test-enemy');

    unmountJoiner();
    unmountHost();
  });

  test('joiner receives loadout content when host shares mid-session', async () => {
    const LATE_UUID = 'late-shared-uuid';
    const lateSheet = makeSheet({
      events: [makeEvent('ev-late', 'ULTIMATE', 'col-ult', 300)],
    });

    const hostParams = {
      loadSheetDataForUuid: jest.fn((uuid: string) => (uuid === LATE_UUID ? lateSheet : null)),
      applyRemoteSheetData: jest.fn(),
      createLocalLoadoutForUuid: jest.fn(() => 'host-local-id'),
      getLocalIdForUuid: jest.fn((uuid: string) => (uuid === LATE_UUID ? 'host-local-id' : null)),
      getLocalNameForUuid: jest.fn((uuid: string) => (uuid === LATE_UUID ? 'Late Build' : null)),
      renameLocalLoadout: jest.fn(),
    };
    const { result: hostHook, unmount: unmountHost } = renderHook(() => useCollaboration(hostParams));

    let roomId = '';
    act(() => { roomId = hostHook.current.hostRoom('Alice', [], 4); });
    await waitFor(() => expect(hostHook.current.isConnected).toBe(true), { timeout: 2000 });

    const joinerUuidToLocalId = new Map<string, string>();
    const joinerParams = {
      loadSheetDataForUuid: jest.fn(() => null),
      applyRemoteSheetData: jest.fn(),
      createLocalLoadoutForUuid: jest.fn((uuid: string) => {
        const localId = `joiner-${uuid}`;
        joinerUuidToLocalId.set(uuid, localId);
        return localId;
      }),
      getLocalIdForUuid: jest.fn((uuid: string) => joinerUuidToLocalId.get(uuid) ?? null),
      getLocalNameForUuid: jest.fn(() => null),
      renameLocalLoadout: jest.fn(),
    };
    const { result: joinerHook, unmount: unmountJoiner } = renderHook(() => useCollaboration(joinerParams));

    act(() => { joinerHook.current.joinRoom(roomId, 'Bob'); });
    // Let the joiner finish its initial sync (empty — nothing shared yet).
    await waitFor(() => expect(joinerHook.current.isConnected).toBe(true), { timeout: 2000 });

    // Host shares a loadout AFTER joiner is already in the room. The joiner's
    // meta observer sees the new entry and must trigger an initial apply.
    act(() => { hostHook.current.shareLoadout(LATE_UUID); });

    await waitFor(
      () => expect(joinerParams.applyRemoteSheetData).toHaveBeenCalled(),
      { timeout: 2000 },
    );

    const [calledUuid, calledSheet, isInitial] = joinerParams.applyRemoteSheetData.mock.calls[0];
    expect(calledUuid).toBe(LATE_UUID);
    expect(isInitial).toBe(true);
    expect(calledSheet.events.map((e: TimelineEvent) => e.uid)).toEqual(['ev-late']);

    unmountJoiner();
    unmountHost();
  });
});

/**
 * Regression — shares must survive synchronous host-then-share.
 *
 * App.tsx calls `hostRoom(...)` and `shareLoadout(uuid)` synchronously in the
 * same event handler (the session-modal onHost callback). An earlier bug read
 * a stale `sessionRef.current === null` inside shareLoadout because setSession
 * had not yet re-rendered — so the share silently bailed, the Y.Doc stayed
 * empty for those uuids, and the persisted `sharedUuids` stayed [] (losing
 * the shares on refresh). This test reproduces that exact call pattern and
 * asserts the share actually landed.
 */
describe('useCollaboration — synchronous host-then-share', () => {
  beforeEach(() => {
    mockRegistry.clear();
    mockIdCounter = 0;
    localStorage.clear();
  });

  test('shareLoadout called immediately after hostRoom persists and syncs', () => {
    const UUID_A = 'uuid-build-A';
    const UUID_B = 'uuid-build-B';
    const sheetA = makeSheet({ events: [makeEvent('ev-a', 'FLAMING_CINDERS', 'c1', 0)] });
    const sheetB = makeSheet({ events: [makeEvent('ev-b', 'ULTIMATE', 'c2', 120)] });

    const sheetByUuid: Record<string, SheetData> = {
      [UUID_A]: sheetA,
      [UUID_B]: sheetB,
    };
    const nameByUuid: Record<string, string> = {
      [UUID_A]: 'Build A',
      [UUID_B]: 'Build B',
    };

    const params = {
      loadSheetDataForUuid: jest.fn((uuid: string) => sheetByUuid[uuid] ?? null),
      applyRemoteSheetData: jest.fn(),
      createLocalLoadoutForUuid: jest.fn(() => 'local-id'),
      getLocalIdForUuid: jest.fn((uuid: string) => (sheetByUuid[uuid] ? `local-${uuid}` : null)),
      getLocalNameForUuid: jest.fn((uuid: string) => nameByUuid[uuid] ?? null),
      renameLocalLoadout: jest.fn(),
    };

    const { result, unmount } = renderHook(() => useCollaboration(params));

    // Mirror App.tsx's onHost callback: hostRoom + shareLoadout synchronously.
    act(() => {
      result.current.hostRoom('Alice', [UUID_A, UUID_B], 4);
      result.current.shareLoadout(UUID_A);
      result.current.shareLoadout(UUID_B);
    });

    // Live session state — both uuids must appear as syncing.
    expect(result.current.syncingLoadoutUuids.sort()).toEqual([UUID_A, UUID_B].sort());
    expect(result.current.isLoadoutSyncing(UUID_A)).toBe(true);
    expect(result.current.isLoadoutSyncing(UUID_B)).toBe(true);

    // shareLoadout must actually have read each sheet (earlier bug: it
    // bailed before reaching loadSheetDataForUuid).
    expect(params.loadSheetDataForUuid).toHaveBeenCalledWith(UUID_A);
    expect(params.loadSheetDataForUuid).toHaveBeenCalledWith(UUID_B);

    // Persisted session must list both uuids so a refresh re-shares them.
    const raw = localStorage.getItem('zst-collab-session');
    expect(raw).not.toBeNull();
    const persisted = JSON.parse(raw as string);
    expect(persisted.role).toBe('host');
    expect(persisted.sharedUuids.sort()).toEqual([UUID_A, UUID_B].sort());

    unmount();
  });

  test('joiner receives shares that were added synchronously at host time', async () => {
    const UUID = 'sync-shared-uuid';
    const sheet = makeSheet({ events: [makeEvent('ev-sync', 'COMBO', 'c-combo', 60)] });

    const hostParams = {
      loadSheetDataForUuid: jest.fn((uuid: string) => (uuid === UUID ? sheet : null)),
      applyRemoteSheetData: jest.fn(),
      createLocalLoadoutForUuid: jest.fn(() => 'host-local'),
      getLocalIdForUuid: jest.fn((uuid: string) => (uuid === UUID ? 'host-local' : null)),
      getLocalNameForUuid: jest.fn((uuid: string) => (uuid === UUID ? 'Sync Build' : null)),
      renameLocalLoadout: jest.fn(),
    };
    const { result: hostHook, unmount: unmountHost } = renderHook(() => useCollaboration(hostParams));

    let roomId = '';
    // Synchronous host-then-share, mirroring App.tsx's onHost callback.
    act(() => {
      roomId = hostHook.current.hostRoom('Alice', [UUID], 4);
      hostHook.current.shareLoadout(UUID);
    });

    await waitFor(() => expect(hostHook.current.isConnected).toBe(true), { timeout: 2000 });

    // Joiner connects and must receive the share that was queued pre-connect.
    const joinerUuidToLocalId = new Map<string, string>();
    const joinerParams = {
      loadSheetDataForUuid: jest.fn(() => null),
      applyRemoteSheetData: jest.fn(),
      createLocalLoadoutForUuid: jest.fn((uuid: string) => {
        const localId = `joiner-${uuid}`;
        joinerUuidToLocalId.set(uuid, localId);
        return localId;
      }),
      getLocalIdForUuid: jest.fn((uuid: string) => joinerUuidToLocalId.get(uuid) ?? null),
      getLocalNameForUuid: jest.fn(() => null),
      renameLocalLoadout: jest.fn(),
    };
    const { result: joinerHook, unmount: unmountJoiner } = renderHook(() => useCollaboration(joinerParams));
    act(() => { joinerHook.current.joinRoom(roomId, 'Bob'); });

    await waitFor(
      () => expect(joinerParams.applyRemoteSheetData).toHaveBeenCalled(),
      { timeout: 2000 },
    );

    const [calledUuid, calledSheet] = joinerParams.applyRemoteSheetData.mock.calls[0];
    expect(calledUuid).toBe(UUID);
    expect(calledSheet.events.map((e: TimelineEvent) => e.uid)).toEqual(['ev-sync']);

    unmountJoiner();
    unmountHost();
  });
});
