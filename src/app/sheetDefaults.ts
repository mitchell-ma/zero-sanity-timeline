/**
 * Sheet default constants and initial state loading.
 *
 * Centralizes the default slot IDs, initial operator/loadout/visibility state,
 * and the logic for loading and applying saved sheet data.
 */

import { Operator, TimelineEvent, VisibleSkills } from '../consts/viewTypes';
import { NounType } from '../dsl/semantics';
import { OperatorLoadoutState, EMPTY_LOADOUT } from '../view/OperatorLoadoutHeader';
import { LoadoutProperties, DEFAULT_LOADOUT_PROPERTIES, getDefaultLoadoutProperties } from '../view/InformationPane';
import { ALL_OPERATORS } from '../controller/operators/operatorRegistry';
import { ALL_ENEMIES, DEFAULT_ENEMY } from '../utils/enemies';
import { loadFromLocalStorage, SheetData } from '../utils/sheetStorage';
import { setNextEventUid, genEventUid } from '../controller/timeline/inputEventController';
import { IS_DEV } from '../consts/devFlags';

export const NUM_SLOTS = 4;
export const SLOT_IDS = Array.from({ length: NUM_SLOTS }, (_, i) => `slot-${i}`);

const DEFAULT_OP_IDS = ['LAEVATAIN', 'AKEKURI', 'ANTAL', 'ARDELIA'];
export const INITIAL_OPERATORS: (Operator | null)[] = DEFAULT_OP_IDS.map(
  (id) => ALL_OPERATORS.find((op) => op.id === id) ?? null,
);

export const INITIAL_VISIBLE: VisibleSkills = Object.fromEntries(
  SLOT_IDS.map((slotId) => [
    slotId,
    {
      [NounType.BASIC_ATTACK]: true,
      [NounType.BATTLE]: true,
      [NounType.COMBO]: true,
      [NounType.ULTIMATE]: true,
    },
  ]),
);

const DEV_LAEVATAIN_LOADOUT: OperatorLoadoutState = {
  weaponId:     'FORGEBORN_SCATHE',
  armorId:      'TIDE_FALL_LIGHT_ARMOR',
  glovesId:     'HOT_WORK_GAUNTLETS',
  kit1Id:       'REDEEMER_SEAL',
  kit2Id:       'REDEEMER_SEAL',
  consumableId: null,
  tacticalId:   null,
};

export const INITIAL_LOADOUTS: Record<string, OperatorLoadoutState> = Object.fromEntries(
  SLOT_IDS.map((id, i) => [id, IS_DEV && i === 0 ? DEV_LAEVATAIN_LOADOUT : EMPTY_LOADOUT]),
);

export const INITIAL_LOADOUT_PROPERTIES: Record<string, LoadoutProperties> = Object.fromEntries(
  SLOT_IDS.map((id, i) => {
    const op = INITIAL_OPERATORS[i];
    return [id, op ? getDefaultLoadoutProperties(op) : DEFAULT_LOADOUT_PROPERTIES];
  }),
);

// ── Sheet data resolution ───────────────────────────────────────────────────

function resolveOperatorId(id: string | null): Operator | null {
  if (!id) return null;
  return ALL_OPERATORS.find((op) => op.id === id) ?? null;
}

export function applySheetData(data: SheetData) {
  setNextEventUid(data.nextEventId);
  let events: TimelineEvent[] = data.events;
  // Deduplicate: if saved data has duplicate UIDs (data corruption), assign fresh UIDs
  const seen = new Set<string>();
  let hasDupes = false;
  for (const ev of events) {
    if (seen.has(ev.uid)) { hasDupes = true; break; }
    seen.add(ev.uid);
  }
  if (hasDupes) {
    console.warn('[zst] Duplicate event UIDs detected in saved data — reassigning UIDs');
    const deduped = new Set<string>();
    events = events.map((ev) => {
      if (deduped.has(ev.uid)) {
        const newUid = genEventUid();
        console.warn(`[zst]   ${ev.uid} (${ev.ownerEntityId}/${ev.columnId}) → ${newUid}`);
        return { ...ev, uid: newUid };
      }
      deduped.add(ev.uid);
      return ev;
    });
  }
  return {
    operators: data.operatorIds.map(resolveOperatorId),
    enemy: ALL_ENEMIES.find((e) => e.id === data.enemyId) ?? DEFAULT_ENEMY,
    enemyStats: data.enemyStats,
    events,
    loadouts: { ...INITIAL_LOADOUTS, ...data.loadouts },
    loadoutProperties: Object.fromEntries(
      Object.entries({ ...INITIAL_LOADOUT_PROPERTIES, ...data.loadoutProperties }).map(
        ([k, v]) => [k, {
          ...DEFAULT_LOADOUT_PROPERTIES,
          operator: { ...DEFAULT_LOADOUT_PROPERTIES.operator, ...v.operator },
          skills: { ...DEFAULT_LOADOUT_PROPERTIES.skills, ...v.skills },
          weapon: { ...DEFAULT_LOADOUT_PROPERTIES.weapon, ...v.weapon },
          gear: { ...DEFAULT_LOADOUT_PROPERTIES.gear, ...v.gear },
          ...(v.tacticalMaxUses != null ? { tacticalMaxUses: v.tacticalMaxUses } : {}),
        }],
      ),
    ),
    visibleSkills: { ...INITIAL_VISIBLE, ...data.visibleSkills },
    resourceConfigs: data.resourceConfigs ?? {},
    overrides: data.overrides ?? {},
  };
}

/** Load saved state from localStorage at module init time (before first render). */
export function loadInitialState() {
  const result = loadFromLocalStorage();
  if (result && result.ok) {
    return { loaded: applySheetData(result.data), error: null };
  }
  if (result && !result.ok) {
    return { loaded: null, error: result.error };
  }
  return { loaded: null, error: null };
}
