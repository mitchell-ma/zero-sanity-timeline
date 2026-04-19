/**
 * Collaboration controller — Y.Doc helpers for peer registry, shared loadout
 * tracking, room ID generation, and the (currently permissive) permission
 * gate. All side-effecting functions mutate the shared Y.Doc directly.
 */

import * as Y from 'yjs';
import { CollaborationRole, PermissionLevel } from '../consts/enums';
import {
  PeerInfo,
  SharedLoadoutEntry,
  LoadoutPermission,
  YDOC_PEERS,
  YDOC_META,
  YMETA_SHARED_LOADOUTS,
  YORIGIN_LOCAL,
} from '../consts/collaborationTypes';

// ── Room ID ──────────────────────────────────────────────────────────────────

const ROOM_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_ID_LENGTH = 6;

export function generateRoomId(): string {
  let out = '';
  const bytes = new Uint8Array(ROOM_ID_LENGTH);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < ROOM_ID_LENGTH; i++) {
    out += ROOM_ID_ALPHABET[bytes[i] % ROOM_ID_ALPHABET.length];
  }
  return out;
}

// ── Permission gate ──────────────────────────────────────────────────────────

/** Permission gate — always returns EDIT for now. Scaffolding for future per-peer permissions. */
export function checkPermission(
  _permissions: LoadoutPermission[],
  _loadoutUuid: string,
  _peerId: string,
): PermissionLevel {
  return PermissionLevel.EDIT;
}

// ── Peer presence ────────────────────────────────────────────────────────────

function getPeersMap(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap(YDOC_PEERS) as Y.Map<Y.Map<unknown>>;
}

const PEER_FIELD_DISPLAY_NAME = 'displayName';
const PEER_FIELD_ROLE = 'role';
const PEER_FIELD_JOINED_AT = 'joinedAt';

export function registerPeerInDoc(
  doc: Y.Doc,
  peerId: string,
  displayName: string,
  role: CollaborationRole,
): void {
  const peers = getPeersMap(doc);
  doc.transact(() => {
    const entry = new Y.Map<unknown>();
    entry.set(PEER_FIELD_DISPLAY_NAME, displayName);
    entry.set(PEER_FIELD_ROLE, role);
    entry.set(PEER_FIELD_JOINED_AT, Date.now());
    peers.set(peerId, entry);
  }, YORIGIN_LOCAL);
}

export function unregisterPeerFromDoc(doc: Y.Doc, peerId: string): void {
  const peers = getPeersMap(doc);
  doc.transact(() => {
    peers.delete(peerId);
  }, YORIGIN_LOCAL);
}

export function readPeersFromDoc(doc: Y.Doc): PeerInfo[] {
  const peers = getPeersMap(doc);
  const out: PeerInfo[] = [];
  peers.forEach((entry, peerId) => {
    out.push({
      peerId,
      displayName: (entry.get(PEER_FIELD_DISPLAY_NAME) as string | undefined) ?? '',
      role: (entry.get(PEER_FIELD_ROLE) as CollaborationRole | undefined) ?? CollaborationRole.JOINER,
      joinedAt: (entry.get(PEER_FIELD_JOINED_AT) as number | undefined) ?? 0,
    });
  });
  return out;
}

// ── Shared loadout registry (meta) ───────────────────────────────────────────

function getMetaMap(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap(YDOC_META);
}

function getSharedLoadoutsArray(doc: Y.Doc): Y.Array<Y.Map<unknown>> {
  const meta = getMetaMap(doc);
  let arr = meta.get(YMETA_SHARED_LOADOUTS) as Y.Array<Y.Map<unknown>> | undefined;
  if (!arr) {
    arr = new Y.Array<Y.Map<unknown>>();
    meta.set(YMETA_SHARED_LOADOUTS, arr);
  }
  return arr;
}

const SHARED_FIELD_UUID = 'uuid';
const SHARED_FIELD_NAME = 'name';
const SHARED_FIELD_OWNER = 'ownerPeerId';

export function addSharedLoadoutToDoc(doc: Y.Doc, entry: SharedLoadoutEntry): void {
  const arr = getSharedLoadoutsArray(doc);
  doc.transact(() => {
    // Idempotent: if the UUID already exists, update name/owner rather than duplicating.
    for (let i = 0; i < arr.length; i++) {
      const m = arr.get(i);
      if (m.get(SHARED_FIELD_UUID) === entry.uuid) {
        m.set(SHARED_FIELD_NAME, entry.name);
        m.set(SHARED_FIELD_OWNER, entry.ownerPeerId);
        return;
      }
    }
    const m = new Y.Map<unknown>();
    m.set(SHARED_FIELD_UUID, entry.uuid);
    m.set(SHARED_FIELD_NAME, entry.name);
    m.set(SHARED_FIELD_OWNER, entry.ownerPeerId);
    arr.push([m]);
  }, YORIGIN_LOCAL);
}

export function removeSharedLoadoutFromDoc(doc: Y.Doc, uuid: string): void {
  const arr = getSharedLoadoutsArray(doc);
  doc.transact(() => {
    for (let i = arr.length - 1; i >= 0; i--) {
      const m = arr.get(i);
      if (m.get(SHARED_FIELD_UUID) === uuid) {
        arr.delete(i, 1);
      }
    }
  }, YORIGIN_LOCAL);
}

export function readSharedLoadoutsFromDoc(doc: Y.Doc): SharedLoadoutEntry[] {
  const arr = getSharedLoadoutsArray(doc);
  const out: SharedLoadoutEntry[] = [];
  arr.forEach((m) => {
    out.push({
      uuid: (m.get(SHARED_FIELD_UUID) as string | undefined) ?? '',
      name: (m.get(SHARED_FIELD_NAME) as string | undefined) ?? '',
      ownerPeerId: (m.get(SHARED_FIELD_OWNER) as string | undefined) ?? '',
    });
  });
  return out;
}
