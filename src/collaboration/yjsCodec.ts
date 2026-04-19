/**
 * SheetData <-> Y.Doc codec.
 *
 * Each shared loadout lives as a Y.Map under the Y.Doc "loadouts" map, keyed
 * by the loadout's cross-peer UUID. Within a per-loadout Y.Map:
 *  - primitive fields go in directly (version, enemyId, nextEventId)
 *  - structured fields with low conflict risk are JSON-stringified
 *  - events + overrides are Y.Map<eventUid, jsonString> — UID keys so
 *    concurrent add/remove from different peers merges naturally via CRDT
 *
 * Override keys sync as event UIDs (not composite keys). The composite key
 * contains `startFrame` which changes on event moves, so UID-keying decouples
 * sync identity from volatile local state.
 */

import * as Y from 'yjs';
import { SheetData } from '../utils/sheetStorage';
import { TimelineEvent } from '../consts/viewTypes';
import { EventOverride, OverrideStore } from '../consts/overrideTypes';
import { buildOverrideKey } from '../controller/overrideController';
import {
  YDOC_LOADOUTS,
  YLOADOUT_VERSION,
  YLOADOUT_OPERATOR_IDS,
  YLOADOUT_ENEMY_ID,
  YLOADOUT_ENEMY_STATS,
  YLOADOUT_VISIBLE_SKILLS,
  YLOADOUT_NEXT_EVENT_ID,
  YLOADOUT_LOADOUTS,
  YLOADOUT_LOADOUT_PROPERTIES,
  YLOADOUT_RESOURCE_CONFIGS,
  YLOADOUT_EVENTS,
  YLOADOUT_OVERRIDES,
  YORIGIN_LOCAL,
} from '../consts/collaborationTypes';

// ── Helpers ──────────────────────────────────────────────────────────────────

function getLoadoutsRoot(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap(YDOC_LOADOUTS) as Y.Map<Y.Map<unknown>>;
}

export function getOrCreateLoadoutMap(doc: Y.Doc, uuid: string): Y.Map<unknown> {
  const root = getLoadoutsRoot(doc);
  let m = root.get(uuid);
  if (!m) {
    m = new Y.Map();
    root.set(uuid, m);
  }
  return m;
}

function getEventsMap(loadoutMap: Y.Map<unknown>): Y.Map<string> {
  let events = loadoutMap.get(YLOADOUT_EVENTS) as Y.Map<string> | undefined;
  if (!events) {
    events = new Y.Map<string>();
    loadoutMap.set(YLOADOUT_EVENTS, events);
  }
  return events;
}

function getOverridesMap(loadoutMap: Y.Map<unknown>): Y.Map<string> {
  let overrides = loadoutMap.get(YLOADOUT_OVERRIDES) as Y.Map<string> | undefined;
  if (!overrides) {
    overrides = new Y.Map<string>();
    loadoutMap.set(YLOADOUT_OVERRIDES, overrides);
  }
  return overrides;
}

function getOperatorIdsArray(loadoutMap: Y.Map<unknown>): Y.Array<string | null> {
  let arr = loadoutMap.get(YLOADOUT_OPERATOR_IDS) as Y.Array<string | null> | undefined;
  if (!arr) {
    arr = new Y.Array<string | null>();
    loadoutMap.set(YLOADOUT_OPERATOR_IDS, arr);
  }
  return arr;
}

// ── Encode ───────────────────────────────────────────────────────────────────

/**
 * Populate a Y.Map with the full contents of a SheetData. Used for initial
 * share — wipes any existing state under the loadout UUID and writes fresh.
 */
export function sheetDataToYMap(doc: Y.Doc, uuid: string, sheetData: SheetData): Y.Map<unknown> {
  const loadoutMap = getOrCreateLoadoutMap(doc, uuid);
  doc.transact(() => {
    loadoutMap.clear();
    loadoutMap.set(YLOADOUT_VERSION, sheetData.version);
    loadoutMap.set(YLOADOUT_ENEMY_ID, sheetData.enemyId);
    loadoutMap.set(YLOADOUT_NEXT_EVENT_ID, sheetData.nextEventId);
    loadoutMap.set(YLOADOUT_ENEMY_STATS, sheetData.enemyStats ? JSON.stringify(sheetData.enemyStats) : '');
    loadoutMap.set(YLOADOUT_VISIBLE_SKILLS, JSON.stringify(sheetData.visibleSkills));
    loadoutMap.set(YLOADOUT_LOADOUTS, JSON.stringify(sheetData.loadouts));
    loadoutMap.set(YLOADOUT_LOADOUT_PROPERTIES, JSON.stringify(sheetData.loadoutProperties));
    loadoutMap.set(YLOADOUT_RESOURCE_CONFIGS, sheetData.resourceConfigs ? JSON.stringify(sheetData.resourceConfigs) : '');

    const opIds = new Y.Array<string | null>();
    opIds.push(sheetData.operatorIds);
    loadoutMap.set(YLOADOUT_OPERATOR_IDS, opIds);

    const eventsMap = new Y.Map<string>();
    for (const ev of sheetData.events) {
      eventsMap.set(ev.uid, JSON.stringify(ev));
    }
    loadoutMap.set(YLOADOUT_EVENTS, eventsMap);

    const overridesMap = new Y.Map<string>();
    if (sheetData.overrides) {
      const uidByKey = buildUidByKeyMap(sheetData.events);
      for (const [compositeKey, override] of Object.entries(sheetData.overrides)) {
        const uid = uidByKey.get(compositeKey);
        if (uid) overridesMap.set(uid, JSON.stringify(override));
      }
    }
    loadoutMap.set(YLOADOUT_OVERRIDES, overridesMap);
  }, YORIGIN_LOCAL);
  return loadoutMap;
}

function buildUidByKeyMap(events: TimelineEvent[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const ev of events) map.set(buildOverrideKey(ev), ev.uid);
  return map;
}

// ── Decode ───────────────────────────────────────────────────────────────────

/** Read a Y.Map back into a plain SheetData object. */
export function yMapToSheetData(loadoutMap: Y.Map<unknown>): SheetData {
  const version = (loadoutMap.get(YLOADOUT_VERSION) as number | undefined) ?? 3;
  const enemyId = (loadoutMap.get(YLOADOUT_ENEMY_ID) as string | undefined) ?? '';
  const nextEventId = (loadoutMap.get(YLOADOUT_NEXT_EVENT_ID) as number | undefined) ?? 0;
  const enemyStatsRaw = loadoutMap.get(YLOADOUT_ENEMY_STATS) as string | undefined;
  const visibleSkillsRaw = loadoutMap.get(YLOADOUT_VISIBLE_SKILLS) as string | undefined;
  const loadoutsRaw = loadoutMap.get(YLOADOUT_LOADOUTS) as string | undefined;
  const loadoutPropertiesRaw = loadoutMap.get(YLOADOUT_LOADOUT_PROPERTIES) as string | undefined;
  const resourceConfigsRaw = loadoutMap.get(YLOADOUT_RESOURCE_CONFIGS) as string | undefined;

  const opIdsArr = loadoutMap.get(YLOADOUT_OPERATOR_IDS) as Y.Array<string | null> | undefined;
  const operatorIds: (string | null)[] = opIdsArr ? opIdsArr.toArray() : [];

  const eventsMap = loadoutMap.get(YLOADOUT_EVENTS) as Y.Map<string> | undefined;
  const events: TimelineEvent[] = [];
  if (eventsMap) {
    eventsMap.forEach((json) => {
      try {
        events.push(JSON.parse(json) as TimelineEvent);
      } catch {
        // skip corrupted entries
      }
    });
  }

  const overridesMap = loadoutMap.get(YLOADOUT_OVERRIDES) as Y.Map<string> | undefined;
  const overrides: OverrideStore = {};
  if (overridesMap) {
    const eventByUid = new Map<string, TimelineEvent>();
    for (const ev of events) eventByUid.set(ev.uid, ev);
    overridesMap.forEach((json, uid) => {
      const ev = eventByUid.get(uid);
      if (!ev) return;
      try {
        overrides[buildOverrideKey(ev)] = JSON.parse(json) as EventOverride;
      } catch {
        // skip corrupted entries
      }
    });
  }

  const data: SheetData = {
    version,
    operatorIds,
    enemyId,
    events,
    loadouts: loadoutsRaw ? JSON.parse(loadoutsRaw) : {},
    loadoutProperties: loadoutPropertiesRaw ? JSON.parse(loadoutPropertiesRaw) : {},
    visibleSkills: visibleSkillsRaw ? JSON.parse(visibleSkillsRaw) : {},
    nextEventId,
  };
  if (enemyStatsRaw) data.enemyStats = JSON.parse(enemyStatsRaw);
  if (resourceConfigsRaw) data.resourceConfigs = JSON.parse(resourceConfigsRaw);
  if (Object.keys(overrides).length > 0) data.overrides = overrides;
  return data;
}

// ── Diff ─────────────────────────────────────────────────────────────────────

/**
 * Apply the minimal delta from `prev` to `next` onto the Y.Map. Only fields
 * that actually changed are written — Yjs broadcasts only the delta on its
 * own, so the codec's job is just to avoid touching fields that are equal.
 *
 * All writes are wrapped in a single `doc.transact(..., YORIGIN_LOCAL)` so
 * remote listeners can filter echoes and so the full change ships as one
 * coalesced update.
 */
export function applySheetDataDiff(
  doc: Y.Doc,
  uuid: string,
  prev: SheetData | null,
  next: SheetData,
): void {
  const loadoutMap = getOrCreateLoadoutMap(doc, uuid);
  doc.transact(() => {
    if (prev == null) {
      // First write under this UUID — full seed.
      loadoutMap.clear();
    }
    if (prev?.version !== next.version) {
      loadoutMap.set(YLOADOUT_VERSION, next.version);
    }
    if (prev?.enemyId !== next.enemyId) {
      loadoutMap.set(YLOADOUT_ENEMY_ID, next.enemyId);
    }
    if (prev?.nextEventId !== next.nextEventId) {
      loadoutMap.set(YLOADOUT_NEXT_EVENT_ID, next.nextEventId);
    }
    const enemyStatsNext = next.enemyStats ? JSON.stringify(next.enemyStats) : '';
    const enemyStatsPrev = prev?.enemyStats ? JSON.stringify(prev.enemyStats) : '';
    if (enemyStatsNext !== enemyStatsPrev) {
      loadoutMap.set(YLOADOUT_ENEMY_STATS, enemyStatsNext);
    }
    const vsNext = JSON.stringify(next.visibleSkills);
    const vsPrev = prev ? JSON.stringify(prev.visibleSkills) : undefined;
    if (vsNext !== vsPrev) loadoutMap.set(YLOADOUT_VISIBLE_SKILLS, vsNext);

    const loNext = JSON.stringify(next.loadouts);
    const loPrev = prev ? JSON.stringify(prev.loadouts) : undefined;
    if (loNext !== loPrev) loadoutMap.set(YLOADOUT_LOADOUTS, loNext);

    const lpNext = JSON.stringify(next.loadoutProperties);
    const lpPrev = prev ? JSON.stringify(prev.loadoutProperties) : undefined;
    if (lpNext !== lpPrev) loadoutMap.set(YLOADOUT_LOADOUT_PROPERTIES, lpNext);

    const rcNext = next.resourceConfigs ? JSON.stringify(next.resourceConfigs) : '';
    const rcPrev = prev?.resourceConfigs ? JSON.stringify(prev.resourceConfigs) : '';
    if (rcNext !== rcPrev) loadoutMap.set(YLOADOUT_RESOURCE_CONFIGS, rcNext);

    // operatorIds: slot-indexed, small, replace fully if changed
    const opPrev = prev?.operatorIds ?? [];
    const opNext = next.operatorIds;
    const opChanged = opPrev.length !== opNext.length || opPrev.some((v, i) => v !== opNext[i]);
    if (opChanged) {
      const arr = getOperatorIdsArray(loadoutMap);
      if (arr.length > 0) arr.delete(0, arr.length);
      arr.push(opNext);
    }

    // Events — diff by UID
    const eventsMap = getEventsMap(loadoutMap);
    const prevEvents = new Map<string, TimelineEvent>();
    if (prev) for (const ev of prev.events) prevEvents.set(ev.uid, ev);
    const nextUids = new Set<string>();
    for (const ev of next.events) {
      nextUids.add(ev.uid);
      const prevEv = prevEvents.get(ev.uid);
      const nextJson = JSON.stringify(ev);
      const prevJson = prevEv ? JSON.stringify(prevEv) : undefined;
      if (nextJson !== prevJson) eventsMap.set(ev.uid, nextJson);
    }
    prevEvents.forEach((_, uid) => {
      if (!nextUids.has(uid)) eventsMap.delete(uid);
    });

    // Overrides — translate composite keys to UID keys
    const overridesMap = getOverridesMap(loadoutMap);
    const nextUidByKey = buildUidByKeyMap(next.events);
    const prevUidByKey = prev ? buildUidByKeyMap(prev.events) : new Map<string, string>();
    const nextOverrides = next.overrides ?? {};
    const prevOverrides = prev?.overrides ?? {};

    const nextUidToOverride = new Map<string, EventOverride>();
    for (const [key, ov] of Object.entries(nextOverrides)) {
      const uid = nextUidByKey.get(key);
      if (uid) nextUidToOverride.set(uid, ov);
    }
    const prevUidToOverride = new Map<string, EventOverride>();
    for (const [key, ov] of Object.entries(prevOverrides)) {
      const uid = prevUidByKey.get(key);
      if (uid) prevUidToOverride.set(uid, ov);
    }

    nextUidToOverride.forEach((ov, uid) => {
      const prevOv = prevUidToOverride.get(uid);
      const nextJson = JSON.stringify(ov);
      const prevJson = prevOv ? JSON.stringify(prevOv) : undefined;
      if (nextJson !== prevJson) overridesMap.set(uid, nextJson);
    });
    prevUidToOverride.forEach((_, uid) => {
      if (!nextUidToOverride.has(uid)) overridesMap.delete(uid);
    });
  }, YORIGIN_LOCAL);
}
