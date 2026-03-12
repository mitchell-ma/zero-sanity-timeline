/**
 * Sheet default constants and initial state loading.
 *
 * Centralizes the default slot IDs, initial operator/loadout/visibility state,
 * and the logic for loading and applying saved sheet data.
 */

import { Operator, TimelineEvent, VisibleSkills, SkillType } from '../consts/viewTypes';
import { OperatorLoadoutState, EMPTY_LOADOUT } from '../view/OperatorLoadoutHeader';
import { LoadoutStats, DEFAULT_LOADOUT_STATS, getDefaultLoadoutStats } from '../view/InformationPane';
import { ALL_OPERATORS } from '../controller/operators/operatorRegistry';
import { ALL_ENEMIES, DEFAULT_ENEMY } from '../utils/enemies';
import { loadFromLocalStorage, SheetData } from '../utils/sheetStorage';
import { setNextEventId, genEventId } from '../controller/timeline/eventController';

export const NUM_SLOTS = 4;
export const SLOT_IDS = Array.from({ length: NUM_SLOTS }, (_, i) => `slot-${i}`);

const DEFAULT_OP_IDS = ['laevatain', 'akekuri', 'antal', 'ardelia'];
export const INITIAL_OPERATORS: (Operator | null)[] = DEFAULT_OP_IDS.map(
  (id) => ALL_OPERATORS.find((op) => op.id === id) ?? null,
);

export const INITIAL_VISIBLE: VisibleSkills = Object.fromEntries(
  SLOT_IDS.map((slotId) => [
    slotId,
    {
      basic: true,
      battle: true,
      combo: true,
      ultimate: true,
    } satisfies Record<SkillType, boolean>,
  ]),
);

export const INITIAL_LOADOUTS: Record<string, OperatorLoadoutState> = Object.fromEntries(
  SLOT_IDS.map((id) => [id, EMPTY_LOADOUT]),
);

export const INITIAL_LOADOUT_STATS: Record<string, LoadoutStats> = Object.fromEntries(
  SLOT_IDS.map((id, i) => {
    const op = INITIAL_OPERATORS[i];
    return [id, op ? getDefaultLoadoutStats(op) : DEFAULT_LOADOUT_STATS];
  }),
);

// ── Sheet data resolution ───────────────────────────────────────────────────

function resolveOperatorId(id: string | null): Operator | null {
  if (!id) return null;
  return ALL_OPERATORS.find((op) => op.id === id) ?? null;
}

export function applySheetData(data: SheetData) {
  setNextEventId(data.nextEventId);
  // Migrate v1 events: backfill missing `name` field with columnId
  let events: TimelineEvent[] = data.events.map((ev) => {
    if (!ev.name) return { ...ev, name: ev.columnId };
    return ev;
  });
  // Deduplicate: if saved data has duplicate IDs (data corruption), assign fresh IDs
  const seen = new Set<string>();
  let hasDupes = false;
  for (const ev of events) {
    if (seen.has(ev.id)) { hasDupes = true; break; }
    seen.add(ev.id);
  }
  if (hasDupes) {
    console.warn('[zst] Duplicate event IDs detected in saved data — reassigning IDs');
    const deduped = new Set<string>();
    events = events.map((ev) => {
      if (deduped.has(ev.id)) {
        const newId = genEventId();
        console.warn(`[zst]   ${ev.id} (${ev.ownerId}/${ev.columnId}) → ${newId}`);
        return { ...ev, id: newId };
      }
      deduped.add(ev.id);
      return ev;
    });
  }
  return {
    operators: data.operatorIds.map(resolveOperatorId),
    enemy: ALL_ENEMIES.find((e) => e.id === data.enemyId) ?? DEFAULT_ENEMY,
    enemyStats: data.enemyStats,
    events,
    loadouts: { ...INITIAL_LOADOUTS, ...data.loadouts },
    loadoutStats: Object.fromEntries(
      Object.entries({ ...INITIAL_LOADOUT_STATS, ...data.loadoutStats }).map(
        ([k, v]) => [k, { ...DEFAULT_LOADOUT_STATS, ...v }],
      ),
    ),
    visibleSkills: { ...INITIAL_VISIBLE, ...data.visibleSkills },
    resourceConfigs: data.resourceConfigs ?? {},
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
