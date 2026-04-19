/**
 * Unit tests for the Yjs codec — round-trip SheetData <-> Y.Map, minimal
 * diff writes, and UID-keyed override translation surviving event moves.
 */

import * as Y from 'yjs';
import { SheetData } from '../../utils/sheetStorage';
import { TimelineEvent } from '../../consts/viewTypes';
import { EventOverride } from '../../consts/overrideTypes';
import { buildOverrideKey } from '../../controller/overrideController';
import {
  sheetDataToYMap,
  yMapToSheetData,
  applySheetDataDiff,
  getOrCreateLoadoutMap,
} from '../../collaboration/yjsCodec';
import { YLOADOUT_EVENTS, YLOADOUT_OVERRIDES } from '../../consts/collaborationTypes';
import { VisibleSkills } from '../../consts/viewTypes';
import { OperatorLoadoutState } from '../../view/OperatorLoadoutHeader';

const VISIBLE: VisibleSkills = {};
const LOADOUT: OperatorLoadoutState = {
  weaponId: null,
  armorId: null,
  glovesId: null,
  kit1Id: null,
  kit2Id: null,
  consumableId: null,
  tacticalId: null,
};

function makeEvent(uid: string, id: string, columnId: string, startFrame: number): TimelineEvent {
  return {
    uid,
    id,
    name: id,
    ownerEntityId: 'slot-1',
    columnId,
    startFrame,
    segments: [],
  };
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

describe('yjsCodec — round-trip', () => {
  const UUID = 'test-uuid-1';

  test('empty sheet round-trips', () => {
    const doc = new Y.Doc();
    const sheet = makeSheet();
    sheetDataToYMap(doc, UUID, sheet);
    const round = yMapToSheetData(getOrCreateLoadoutMap(doc, UUID));
    expect(round.version).toBe(sheet.version);
    expect(round.enemyId).toBe(sheet.enemyId);
    expect(round.operatorIds).toEqual(sheet.operatorIds);
    expect(round.events).toEqual([]);
    expect(round.loadouts).toEqual(sheet.loadouts);
    expect(round.visibleSkills).toEqual(sheet.visibleSkills);
  });

  test('sheet with events round-trips preserving UIDs', () => {
    const doc = new Y.Doc();
    const evA = makeEvent('ev-1', 'SKILL_A', 'col-basic', 0);
    const evB = makeEvent('ev-2', 'SKILL_B', 'col-battle', 60);
    const sheet = makeSheet({ events: [evA, evB] });
    sheetDataToYMap(doc, UUID, sheet);
    const round = yMapToSheetData(getOrCreateLoadoutMap(doc, UUID));
    const uids = round.events.map((e) => e.uid).sort();
    expect(uids).toEqual(['ev-1', 'ev-2']);
  });

  test('overrides round-trip via UID keys', () => {
    const doc = new Y.Doc();
    const ev = makeEvent('ev-1', 'SKILL_A', 'col-basic', 30);
    const override: EventOverride = { segments: { 0: { duration: 48 } } };
    const overrides = { [buildOverrideKey(ev)]: override };
    const sheet = makeSheet({ events: [ev], overrides });
    sheetDataToYMap(doc, UUID, sheet);
    const round = yMapToSheetData(getOrCreateLoadoutMap(doc, UUID));
    const roundEv = round.events.find((e) => e.uid === 'ev-1')!;
    expect(round.overrides![buildOverrideKey(roundEv)]).toEqual(override);
  });

  test('moving an event preserves its override via UID', () => {
    const doc = new Y.Doc();
    const ev = makeEvent('ev-1', 'SKILL_A', 'col-basic', 30);
    const override: EventOverride = { segments: { 0: { duration: 48 } } };
    const prev = makeSheet({ events: [ev], overrides: { [buildOverrideKey(ev)]: override } });
    sheetDataToYMap(doc, UUID, prev);

    // Move the event: startFrame changes, so composite key changes, but UID stays.
    const evMoved = { ...ev, startFrame: 120 };
    const next = makeSheet({ events: [evMoved], overrides: { [buildOverrideKey(evMoved)]: override } });
    applySheetDataDiff(doc, UUID, prev, next);

    const round = yMapToSheetData(getOrCreateLoadoutMap(doc, UUID));
    const roundEv = round.events.find((e) => e.uid === 'ev-1')!;
    expect(roundEv.startFrame).toBe(120);
    expect(round.overrides![buildOverrideKey(roundEv)]).toEqual(override);
  });
});

describe('yjsCodec — applySheetDataDiff', () => {
  const UUID = 'test-uuid-diff';

  test('only adds new events, leaves unchanged events alone', () => {
    const doc = new Y.Doc();
    const evA = makeEvent('ev-1', 'SKILL_A', 'col-basic', 0);
    const prev = makeSheet({ events: [evA] });
    sheetDataToYMap(doc, UUID, prev);

    const loadoutMap = getOrCreateLoadoutMap(doc, UUID);
    const eventsMap = loadoutMap.get(YLOADOUT_EVENTS) as Y.Map<string>;
    const originalA = eventsMap.get('ev-1');

    const evB = makeEvent('ev-2', 'SKILL_B', 'col-battle', 60);
    const next = makeSheet({ events: [evA, evB] });
    applySheetDataDiff(doc, UUID, prev, next);

    expect(eventsMap.get('ev-1')).toBe(originalA); // unchanged
    expect(eventsMap.get('ev-2')).toBeDefined();   // added
  });

  test('removes events that vanish from next', () => {
    const doc = new Y.Doc();
    const evA = makeEvent('ev-1', 'SKILL_A', 'col-basic', 0);
    const evB = makeEvent('ev-2', 'SKILL_B', 'col-battle', 60);
    const prev = makeSheet({ events: [evA, evB] });
    sheetDataToYMap(doc, UUID, prev);

    const loadoutMap = getOrCreateLoadoutMap(doc, UUID);
    const eventsMap = loadoutMap.get(YLOADOUT_EVENTS) as Y.Map<string>;
    expect(eventsMap.size).toBe(2);

    const next = makeSheet({ events: [evA] });
    applySheetDataDiff(doc, UUID, prev, next);
    expect(eventsMap.has('ev-2')).toBe(false);
  });

  test('removes overrides whose events are deleted', () => {
    const doc = new Y.Doc();
    const ev = makeEvent('ev-1', 'SKILL_A', 'col-basic', 0);
    const override: EventOverride = { segments: { 0: { duration: 48 } } };
    const prev = makeSheet({ events: [ev], overrides: { [buildOverrideKey(ev)]: override } });
    sheetDataToYMap(doc, UUID, prev);

    const loadoutMap = getOrCreateLoadoutMap(doc, UUID);
    const overridesMap = loadoutMap.get(YLOADOUT_OVERRIDES) as Y.Map<string>;
    expect(overridesMap.size).toBe(1);

    const next = makeSheet({ events: [], overrides: {} });
    applySheetDataDiff(doc, UUID, prev, next);
    expect(overridesMap.size).toBe(0);
  });
});
