/**
 * Unit tests for collaboration controller — room ID format, permission gate,
 * Y.Doc peer registry, shared-loadout registry.
 */

import * as Y from 'yjs';
import { CollaborationRole, PermissionLevel } from '../../consts/enums';
import {
  generateRoomId,
  checkPermission,
  registerPeerInDoc,
  unregisterPeerFromDoc,
  readPeersFromDoc,
  addSharedLoadoutToDoc,
  removeSharedLoadoutFromDoc,
  readSharedLoadoutsFromDoc,
} from '../../controller/collaborationController';

// Polyfill crypto.getRandomValues for Node test env.
if (typeof (globalThis as unknown as { crypto?: { getRandomValues?: unknown } }).crypto === 'undefined' ||
    typeof (globalThis as unknown as { crypto: { getRandomValues?: unknown } }).crypto.getRandomValues === 'undefined') {
  (globalThis as unknown as { crypto: { getRandomValues: <T extends ArrayBufferView>(arr: T) => T } }).crypto = {
    getRandomValues: <T extends ArrayBufferView>(arr: T): T => {
      const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
      for (let i = 0; i < u8.length; i++) u8[i] = Math.floor(Math.random() * 256);
      return arr;
    },
  };
}

describe('generateRoomId', () => {
  test('returns 6-char string using alphabet without 0/O/1/I/L', () => {
    const id = generateRoomId();
    expect(id).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });

  test('produces unique values across calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) ids.add(generateRoomId());
    expect(ids.size).toBeGreaterThan(95);
  });
});

describe('checkPermission', () => {
  test('returns EDIT regardless of inputs (v1 scaffolding)', () => {
    expect(checkPermission([], 'uuid-a', 'peer-1')).toBe(PermissionLevel.EDIT);
  });
});

describe('peer registry', () => {
  test('register/read/unregister round-trip', () => {
    const doc = new Y.Doc();
    registerPeerInDoc(doc, 'peer-A', 'Alice', CollaborationRole.HOST);
    registerPeerInDoc(doc, 'peer-B', 'Bob', CollaborationRole.JOINER);

    const peers = readPeersFromDoc(doc);
    expect(peers).toHaveLength(2);
    const alice = peers.find((p) => p.peerId === 'peer-A')!;
    expect(alice.displayName).toBe('Alice');
    expect(alice.role).toBe(CollaborationRole.HOST);
    expect(alice.joinedAt).toBeGreaterThan(0);

    unregisterPeerFromDoc(doc, 'peer-A');
    const after = readPeersFromDoc(doc);
    expect(after).toHaveLength(1);
    expect(after[0].peerId).toBe('peer-B');
  });
});

describe('shared loadout registry', () => {
  test('add/read/remove round-trip', () => {
    const doc = new Y.Doc();
    addSharedLoadoutToDoc(doc, { uuid: 'uuid-1', name: 'Build A', ownerPeerId: 'peer-A' });
    addSharedLoadoutToDoc(doc, { uuid: 'uuid-2', name: 'Build B', ownerPeerId: 'peer-A' });

    const read = readSharedLoadoutsFromDoc(doc);
    expect(read).toHaveLength(2);
    expect(read.map((e) => e.uuid).sort()).toEqual(['uuid-1', 'uuid-2']);

    removeSharedLoadoutFromDoc(doc, 'uuid-1');
    const after = readSharedLoadoutsFromDoc(doc);
    expect(after).toHaveLength(1);
    expect(after[0].uuid).toBe('uuid-2');
  });

  test('adding same uuid updates name/owner (idempotent)', () => {
    const doc = new Y.Doc();
    addSharedLoadoutToDoc(doc, { uuid: 'uuid-1', name: 'Build A', ownerPeerId: 'peer-A' });
    addSharedLoadoutToDoc(doc, { uuid: 'uuid-1', name: 'Renamed Build', ownerPeerId: 'peer-B' });

    const read = readSharedLoadoutsFromDoc(doc);
    expect(read).toHaveLength(1);
    expect(read[0].name).toBe('Renamed Build');
    expect(read[0].ownerPeerId).toBe('peer-B');
  });
});
