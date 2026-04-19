/**
 * Two-doc sync integration tests — wire two Y.Doc instances via direct
 * Y.applyUpdate (no PeerJS), simulating what the PeerJSProvider would do
 * over the network. Verifies that the codec + Y.Doc structure produce
 * correct inbound state on the joiner side and CRDT-merge concurrent edits.
 */

import * as Y from 'yjs';
import { SheetData } from '../../utils/sheetStorage';
import { TimelineEvent, VisibleSkills } from '../../consts/viewTypes';
import { OperatorLoadoutState } from '../../view/OperatorLoadoutHeader';
import {
  sheetDataToYMap,
  yMapToSheetData,
  applySheetDataDiff,
  getOrCreateLoadoutMap,
} from '../../collaboration/yjsCodec';
import {
  addSharedLoadoutToDoc,
  readSharedLoadoutsFromDoc,
} from '../../controller/collaborationController';
import { YORIGIN_REMOTE } from '../../consts/collaborationTypes';

const VISIBLE: VisibleSkills = {};
const LOADOUT: OperatorLoadoutState = {
  weaponId: null, armorId: null, glovesId: null,
  kit1Id: null, kit2Id: null, consumableId: null, tacticalId: null,
};

function makeEvent(uid: string, id: string, columnId: string, startFrame: number): TimelineEvent {
  return { uid, id, name: id, ownerEntityId: 'slot-1', columnId, startFrame, segments: [] };
}

function makeSheet(partial: Partial<SheetData> = {}): SheetData {
  return {
    version: 3,
    operatorIds: [null, null, null, null],
    enemyId: 'test-enemy',
    events: [],
    loadouts: { 'slot-1': LOADOUT },
    loadoutProperties: {},
    visibleSkills: VISIBLE,
    nextEventId: 1,
    ...partial,
  };
}

/** Wire two docs bidirectionally — every local update on A applies to B and vice versa. */
function wireBidirectional(a: Y.Doc, b: Y.Doc): () => void {
  const aToB = (update: Uint8Array, origin: unknown) => {
    if (origin === YORIGIN_REMOTE) return;
    Y.applyUpdate(b, update, YORIGIN_REMOTE);
  };
  const bToA = (update: Uint8Array, origin: unknown) => {
    if (origin === YORIGIN_REMOTE) return;
    Y.applyUpdate(a, update, YORIGIN_REMOTE);
  };
  a.on('update', aToB);
  b.on('update', bToA);
  return () => { a.off('update', aToB); b.off('update', bToA); };
}

describe('two-doc sync via Y.applyUpdate', () => {
  const UUID = 'shared-loadout-1';

  test('host seeds loadout -> joiner reads identical sheet', () => {
    const host = new Y.Doc();
    const joiner = new Y.Doc();

    // Host seeds before wiring (simulates initial state) then delivers full snapshot.
    const sheet = makeSheet({
      events: [makeEvent('ev-1', 'SKILL_A', 'col-basic', 0)],
    });
    sheetDataToYMap(host, UUID, sheet);
    addSharedLoadoutToDoc(host, { uuid: UUID, name: 'Build A', ownerPeerId: 'peer-A' });

    // Deliver full state snapshot from host to joiner (what PeerJSProvider does on connect).
    Y.applyUpdate(joiner, Y.encodeStateAsUpdate(host), YORIGIN_REMOTE);

    const shared = readSharedLoadoutsFromDoc(joiner);
    expect(shared).toHaveLength(1);
    expect(shared[0].uuid).toBe(UUID);

    const joinerSheet = yMapToSheetData(getOrCreateLoadoutMap(joiner, UUID));
    expect(joinerSheet.events.map((e) => e.uid)).toEqual(['ev-1']);
    expect(joinerSheet.enemyId).toBe('test-enemy');
  });

  test('joiner adds event -> host receives it via live diff', () => {
    const host = new Y.Doc();
    const joiner = new Y.Doc();
    const seed = makeSheet();
    sheetDataToYMap(host, UUID, seed);
    Y.applyUpdate(joiner, Y.encodeStateAsUpdate(host), YORIGIN_REMOTE);
    const unwire = wireBidirectional(host, joiner);

    const joinerPrev = yMapToSheetData(getOrCreateLoadoutMap(joiner, UUID));
    const joinerNext = { ...joinerPrev, events: [makeEvent('ev-new', 'SKILL_X', 'col-battle', 60)] };
    applySheetDataDiff(joiner, UUID, joinerPrev, joinerNext);

    const hostSheet = yMapToSheetData(getOrCreateLoadoutMap(host, UUID));
    expect(hostSheet.events.map((e) => e.uid)).toEqual(['ev-new']);

    unwire();
  });

  test('concurrent adds from both peers merge via CRDT (different UIDs)', () => {
    const host = new Y.Doc();
    const joiner = new Y.Doc();
    sheetDataToYMap(host, UUID, makeSheet());
    Y.applyUpdate(joiner, Y.encodeStateAsUpdate(host), YORIGIN_REMOTE);
    const unwire = wireBidirectional(host, joiner);

    const base = yMapToSheetData(getOrCreateLoadoutMap(host, UUID));
    const hostAdds = { ...base, events: [...base.events, makeEvent('ev-host', 'SKILL_H', 'col-basic', 0)] };
    const joinerAdds = { ...base, events: [...base.events, makeEvent('ev-joiner', 'SKILL_J', 'col-battle', 60)] };

    // Apply both "concurrently" (serial in test, but wire relays each side)
    applySheetDataDiff(host, UUID, base, hostAdds);
    applySheetDataDiff(joiner, UUID, base, joinerAdds);

    const hostFinal = yMapToSheetData(getOrCreateLoadoutMap(host, UUID));
    const joinerFinal = yMapToSheetData(getOrCreateLoadoutMap(joiner, UUID));
    const hostUids = hostFinal.events.map((e) => e.uid).sort();
    const joinerUids = joinerFinal.events.map((e) => e.uid).sort();
    expect(hostUids).toEqual(['ev-host', 'ev-joiner']);
    expect(joinerUids).toEqual(['ev-host', 'ev-joiner']);

    unwire();
  });

  test('joiner sees host in peer registry after initial state snapshot', () => {
    // Regression: session.peers on the joiner side was empty even after the
    // snapshot arrived, because the peer list was only seeded when observers
    // fired on *remote* changes — but the snapshot is applied before the
    // observers are wired up. `onSynced` must seed peers from doc state.
    const { registerPeerInDoc, readPeersFromDoc } = require('../../controller/collaborationController');
    const { CollaborationRole } = require('../../consts/enums');

    const hostDoc = new Y.Doc();
    const HOST_ID = 'ROOMID';
    registerPeerInDoc(hostDoc, HOST_ID, 'Alice', CollaborationRole.HOST);
    sheetDataToYMap(hostDoc, 'uuid-x', makeSheet());

    const joinerDoc = new Y.Doc();
    // Simulate the PeerJS provider delivering the full snapshot.
    Y.applyUpdate(joinerDoc, Y.encodeStateAsUpdate(hostDoc), YORIGIN_REMOTE);

    // Joiner reads its doc — the host's peer entry should already be present.
    const joinerPeers = readPeersFromDoc(joinerDoc);
    expect(joinerPeers.map((p: { peerId: string }) => p.peerId)).toContain(HOST_ID);
  });

  test('event move on one peer propagates without orphaning override', () => {
    const host = new Y.Doc();
    const joiner = new Y.Doc();

    const { buildOverrideKey } = require('../../controller/overrideController');
    const ev = makeEvent('ev-1', 'SKILL_A', 'col-basic', 30);
    const override = { segments: { 0: { duration: 48 } } };
    const seed = makeSheet({ events: [ev], overrides: { [buildOverrideKey(ev)]: override } });
    sheetDataToYMap(host, UUID, seed);
    Y.applyUpdate(joiner, Y.encodeStateAsUpdate(host), YORIGIN_REMOTE);
    const unwire = wireBidirectional(host, joiner);

    // Host moves the event.
    const evMoved = { ...ev, startFrame: 120 };
    const next = makeSheet({ events: [evMoved], overrides: { [buildOverrideKey(evMoved)]: override } });
    applySheetDataDiff(host, UUID, seed, next);

    const joinerSheet = yMapToSheetData(getOrCreateLoadoutMap(joiner, UUID));
    const joinerEv = joinerSheet.events.find((e) => e.uid === 'ev-1')!;
    expect(joinerEv.startFrame).toBe(120);
    expect(joinerSheet.overrides![buildOverrideKey(joinerEv)]).toEqual(override);

    unwire();
  });
});
