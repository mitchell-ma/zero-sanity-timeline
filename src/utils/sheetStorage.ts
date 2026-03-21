import { TimelineEvent, VisibleSkills, ResourceConfig } from '../consts/viewTypes';
import { OperatorLoadoutState } from '../view/OperatorLoadoutHeader';
import { LoadoutProperties } from '../view/InformationPane';
import { EnemyStats } from '../controller/appStateController';
import { LoadoutTree } from './loadoutStorage';

import {
  resolveWeaponId,
  resolveGearPieceId,
  resolveConsumableId,
  resolveTacticalId,
} from '../controller/gameDataController';

const STORAGE_KEY = 'zst-sheet';
const CURRENT_VERSION = 3;

export interface SheetData {
  version: number;
  operatorIds: (string | null)[];
  enemyId: string;
  enemyStats?: EnemyStats;
  events: TimelineEvent[];
  loadouts: Record<string, OperatorLoadoutState>;
  loadoutProperties: Record<string, LoadoutProperties>;
  visibleSkills: VisibleSkills;
  nextEventId: number;
  resourceConfigs?: Record<string, ResourceConfig>;
  derivedEventOverrides?: Record<string, Partial<TimelineEvent>>;
}

export function serializeSheet(
  operatorIds: (string | null)[],
  enemyId: string,
  enemyStats: EnemyStats | undefined,
  events: TimelineEvent[],
  loadouts: Record<string, OperatorLoadoutState>,
  loadoutProperties: Record<string, LoadoutProperties>,
  visibleSkills: VisibleSkills,
  nextEventId: number,
  resourceConfigs?: Record<string, ResourceConfig>,
  derivedEventOverrides?: Record<string, Partial<TimelineEvent>>,
): SheetData {
  return {
    version: CURRENT_VERSION,
    operatorIds,
    enemyId,
    ...(enemyStats ? { enemyStats } : {}),
    events,
    loadouts,
    loadoutProperties,
    visibleSkills,
    nextEventId,
    ...(resourceConfigs && Object.keys(resourceConfigs).length > 0 ? { resourceConfigs } : {}),
    ...(derivedEventOverrides && Object.keys(derivedEventOverrides).length > 0 ? { derivedEventOverrides } : {}),
  };
}

export type LoadResult =
  | { ok: true; data: SheetData }
  | { ok: false; error: string };

/** Migrate a loadout from v2 (name-based) to v3 (ID-based). */
function migrateLoadoutV2toV3(loadout: Record<string, unknown>): OperatorLoadoutState {
  return {
    weaponId: loadout.weaponName ? resolveWeaponId(loadout.weaponName as string) ?? null : (loadout.weaponId as string | null) ?? null,
    armorId: loadout.armorName ? resolveGearPieceId(loadout.armorName as string) ?? null : (loadout.armorId as string | null) ?? null,
    glovesId: loadout.glovesName ? resolveGearPieceId(loadout.glovesName as string) ?? null : (loadout.glovesId as string | null) ?? null,
    kit1Id: loadout.kit1Name ? resolveGearPieceId(loadout.kit1Name as string) ?? null : (loadout.kit1Id as string | null) ?? null,
    kit2Id: loadout.kit2Name ? resolveGearPieceId(loadout.kit2Name as string) ?? null : (loadout.kit2Id as string | null) ?? null,
    consumableId: loadout.consumableName ? resolveConsumableId(loadout.consumableName as string) ?? null : (loadout.consumableId as string | null) ?? null,
    tacticalId: loadout.tacticalName ? resolveTacticalId(loadout.tacticalName as string) ?? null : (loadout.tacticalId as string | null) ?? null,
  };
}

/** Migrate sheet data from older versions. */
function migrateSheetData(data: Record<string, unknown>): SheetData {
  const version = (data.version as number) ?? 1;
  if (version < 3 && data.loadouts) {
    const oldLoadouts = data.loadouts as Record<string, Record<string, unknown>>;
    const newLoadouts: Record<string, OperatorLoadoutState> = {};
    for (const [key, lo] of Object.entries(oldLoadouts)) {
      newLoadouts[key] = migrateLoadoutV2toV3(lo);
    }
    data.loadouts = newLoadouts;
    data.version = CURRENT_VERSION;
  }
  return data as unknown as SheetData;
}

export function validateSheetData(raw: unknown): LoadResult {
  if (raw == null || typeof raw !== 'object') {
    return { ok: false, error: 'Save data is not a valid object.' };
  }
  const migrated = migrateSheetData(raw as Record<string, unknown>);
  return { ok: true, data: migrated };
}

// ─── Clean & normalize ───────────────────────────────────────────────────

/** Stamp current version and strip transient derived fields before persisting.
 *  Segments are preserved — user edits to segment durations and frame offsets
 *  live on the segments array and must survive save/load round-trips.
 *  Unedited events never have segments on the raw event (they are attached
 *  from column templates at display time by attachDefaultSegments).
 */
export function cleanSheetData(data: SheetData): SheetData {
  return { ...data, version: CURRENT_VERSION };
}

// ─── LocalStorage ────────────────────────────────────────────────────────

export function saveToLocalStorage(data: SheetData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanSheetData(data)));
  } catch {
    // Storage full or unavailable — silently fail
  }
}

export function loadFromLocalStorage(): LoadResult | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return null;
    const parsed = JSON.parse(raw);
    return validateSheetData(parsed);
  } catch (e) {
    return { ok: false, error: `Failed to parse saved data: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export function clearLocalStorage(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// ─── File export/import ──────────────────────────────────────────────────

export function exportToFile(data: SheetData): void {
  const json = JSON.stringify(cleanSheetData(data), null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'endfield-timeline.json';
  a.click();
  URL.revokeObjectURL(url);
}

export function importFromFile(): Promise<LoadResult> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve({ ok: false, error: 'No file selected.' });
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result as string);
          resolve(validateSheetData(parsed));
        } catch (e) {
          resolve({ ok: false, error: `Failed to parse file: ${e instanceof Error ? e.message : String(e)}` });
        }
      };
      reader.onerror = () => {
        resolve({ ok: false, error: 'Failed to read file.' });
      };
      reader.readAsText(file);
    };
    input.click();
  });
}

// ─── Multi-loadout bundle export/import ──────────────────────────────────

const BUNDLE_VERSION = 1;

export interface MultiLoadoutBundle {
  bundleVersion: number;
  tree: LoadoutTree;
  loadouts: Record<string, SheetData>;
}

export type BundleLoadResult =
  | { ok: true; data: MultiLoadoutBundle }
  | { ok: false; error: string };

export function exportMultiLoadoutBundle(
  tree: LoadoutTree,
  selectedLoadoutIds: Set<string>,
  getLoadoutData: (id: string) => SheetData | null,
): void {
  // Collect ancestor folder IDs for selected loadouts to preserve structure
  const selectedArr = Array.from(selectedLoadoutIds);
  const includedIds = new Set<string>(selectedArr);
  for (const sid of selectedArr) {
    let node = tree.nodes.find((n) => n.id === sid);
    while (node?.parentId) {
      includedIds.add(node.parentId);
      const parentId = node.parentId;
      node = tree.nodes.find((n) => n.id === parentId);
    }
  }

  const filteredTree: LoadoutTree = {
    nodes: tree.nodes.filter((n) => includedIds.has(n.id)),
  };

  const loadouts: Record<string, SheetData> = {};
  for (const sid of selectedArr) {
    const data = getLoadoutData(sid);
    if (data) loadouts[sid] = cleanSheetData(data);
  }

  const bundle: MultiLoadoutBundle = {
    bundleVersion: BUNDLE_VERSION,
    tree: filteredTree,
    loadouts,
  };

  const json = JSON.stringify(bundle, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'endfield-timeline.json';
  a.click();
  URL.revokeObjectURL(url);
}

export function validateMultiLoadoutBundle(raw: unknown): BundleLoadResult {
  if (raw == null || typeof raw !== 'object') {
    return { ok: false, error: 'Bundle is not a valid object.' };
  }
  const obj = raw as Record<string, unknown>;

  if (typeof obj.bundleVersion !== 'number') {
    return { ok: false, error: 'Missing or invalid bundleVersion field.' };
  }
  if (obj.bundleVersion > BUNDLE_VERSION) {
    return { ok: false, error: `Bundle version (${obj.bundleVersion}) is newer than this app supports (${BUNDLE_VERSION}).` };
  }

  const tree = obj.tree as Record<string, unknown> | undefined;
  if (!tree || !Array.isArray(tree.nodes)) {
    return { ok: false, error: 'Missing or invalid tree field.' };
  }
  for (const node of tree.nodes as unknown[]) {
    const n = node as Record<string, unknown>;
    if (!n || typeof n.id !== 'string' || typeof n.name !== 'string' || typeof n.type !== 'string') {
      return { ok: false, error: 'Invalid node in tree.' };
    }
  }

  const loadoutsObj = obj.loadouts as Record<string, unknown> | undefined;
  if (typeof loadoutsObj !== 'object' || loadoutsObj == null) {
    return { ok: false, error: 'Missing or invalid loadouts field.' };
  }
  for (const [id, loadoutData] of Object.entries(loadoutsObj)) {
    const result = validateSheetData(loadoutData);
    if (!result.ok) {
      return { ok: false, error: `Invalid loadout data for "${id}": ${result.error}` };
    }
  }

  return { ok: true, data: obj as unknown as MultiLoadoutBundle };
}

export function importMultiLoadoutFile(): Promise<BundleLoadResult> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve({ ok: false, error: 'No file selected.' });
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result as string);
          resolve(validateMultiLoadoutBundle(parsed));
        } catch (e) {
          resolve({ ok: false, error: `Failed to parse file: ${e instanceof Error ? e.message : String(e)}` });
        }
      };
      reader.onerror = () => {
        resolve({ ok: false, error: 'Failed to read file.' });
      };
      reader.readAsText(file);
    };
    input.click();
  });
}
