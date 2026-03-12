import { TimelineEvent, VisibleSkills, ResourceConfig } from '../consts/viewTypes';
import { OperatorLoadoutState } from '../view/OperatorLoadoutHeader';
import { LoadoutStats } from '../view/InformationPane';
import { EnemyStats } from '../controller/appStateController';
import { LoadoutTree, LoadoutNode } from './loadoutStorage';

const STORAGE_KEY = 'zst-sheet';
const CURRENT_VERSION = 2;

export interface SheetData {
  version: number;
  operatorIds: (string | null)[];
  enemyId: string;
  enemyStats?: EnemyStats;
  events: TimelineEvent[];
  loadouts: Record<string, OperatorLoadoutState>;
  loadoutStats: Record<string, LoadoutStats>;
  visibleSkills: VisibleSkills;
  nextEventId: number;
  resourceConfigs?: Record<string, ResourceConfig>;
}

export function serializeSheet(
  operatorIds: (string | null)[],
  enemyId: string,
  enemyStats: EnemyStats | undefined,
  events: TimelineEvent[],
  loadouts: Record<string, OperatorLoadoutState>,
  loadoutStats: Record<string, LoadoutStats>,
  visibleSkills: VisibleSkills,
  nextEventId: number,
  resourceConfigs?: Record<string, ResourceConfig>,
): SheetData {
  return {
    version: CURRENT_VERSION,
    operatorIds,
    enemyId,
    ...(enemyStats ? { enemyStats } : {}),
    events,
    loadouts,
    loadoutStats,
    visibleSkills,
    nextEventId,
    ...(resourceConfigs && Object.keys(resourceConfigs).length > 0 ? { resourceConfigs } : {}),
  };
}

export type LoadResult =
  | { ok: true; data: SheetData }
  | { ok: false; error: string };

export function validateSheetData(raw: unknown): LoadResult {
  if (raw == null || typeof raw !== 'object') {
    return { ok: false, error: 'Save data is not a valid object.' };
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj.version !== 'number') {
    return { ok: false, error: 'Missing or invalid version field.' };
  }
  if (obj.version > CURRENT_VERSION) {
    return {
      ok: false,
      error: `Save data version (${obj.version}) is newer than this app supports (${CURRENT_VERSION}). Try updating the app.`,
    };
  }
  if (!Array.isArray(obj.operatorIds)) {
    return { ok: false, error: 'Missing or invalid operatorIds field.' };
  }
  if (typeof obj.enemyId !== 'string') {
    return { ok: false, error: 'Missing or invalid enemyId field.' };
  }
  if (!Array.isArray(obj.events)) {
    return { ok: false, error: 'Missing or invalid events array.' };
  }
  for (let i = 0; i < obj.events.length; i++) {
    const ev = obj.events[i];
    if (
      typeof ev !== 'object' || ev == null ||
      typeof ev.id !== 'string' ||
      typeof ev.ownerId !== 'string' ||
      typeof ev.columnId !== 'string' ||
      typeof ev.startFrame !== 'number' ||
      typeof ev.activationDuration !== 'number' ||
      typeof ev.activeDuration !== 'number' ||
      typeof ev.cooldownDuration !== 'number'
    ) {
      return { ok: false, error: `Invalid event at index ${i}.` };
    }
  }
  if (typeof obj.loadouts !== 'object' || obj.loadouts == null) {
    return { ok: false, error: 'Missing or invalid loadouts field.' };
  }
  if (typeof obj.loadoutStats !== 'object' || obj.loadoutStats == null) {
    return { ok: false, error: 'Missing or invalid loadoutStats field.' };
  }
  if (typeof obj.visibleSkills !== 'object' || obj.visibleSkills == null) {
    return { ok: false, error: 'Missing or invalid visibleSkills field.' };
  }
  if (typeof obj.nextEventId !== 'number') {
    return { ok: false, error: 'Missing or invalid nextEventId field.' };
  }

  // Migration: convert isFinalStrike boolean to hitType enum
  for (const ev of obj.events as any[]) {
    if (ev.segments) {
      for (const seg of ev.segments) {
        if (seg.frames) {
          for (const f of seg.frames) {
            if (f.isFinalStrike) {
              f.hitType = 'FINAL_STRIKE';
            }
            delete f.isFinalStrike;
          }
        }
      }
    }
  }

  return { ok: true, data: obj as unknown as SheetData };
}

// ─── Clean & normalize ───────────────────────────────────────────────────

/** Stamp current version and strip legacy fields before persisting. */
export function cleanSheetData(data: SheetData): SheetData {
  const events = data.events.map((ev) => {
    const cleaned = { ...ev };
    // Strip legacy isFinalStrike boolean (replaced by hitType enum)
    if (cleaned.segments) {
      cleaned.segments = cleaned.segments.map((seg) => {
        if (!seg.frames) return seg;
        return {
          ...seg,
          frames: seg.frames.map((f) => {
            const { isFinalStrike, ...rest } = f as any;
            return rest;
          }),
        };
      });
    }
    return cleaned;
  });
  return { ...data, version: CURRENT_VERSION, events };
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
      node = tree.nodes.find((n) => n.id === node!.parentId);
    }
  }

  const filteredTree: LoadoutTree = {
    nodes: tree.nodes
      .filter((n) => includedIds.has(n.id))
      .map((n) => (n.type as string) === 'session' ? { ...n, type: 'loadout' as const } : n),
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
    // Migrate legacy "session" type to "loadout"
    if (n.type === 'session') n.type = 'loadout';
  }

  // Support both old 'sessions' and new 'loadouts' field names
  const loadoutsObj = (obj.loadouts ?? obj.sessions) as Record<string, unknown> | undefined;
  if (typeof loadoutsObj !== 'object' || loadoutsObj == null) {
    return { ok: false, error: 'Missing or invalid loadouts field.' };
  }
  for (const [id, loadoutData] of Object.entries(loadoutsObj)) {
    const result = validateSheetData(loadoutData);
    if (!result.ok) {
      return { ok: false, error: `Invalid loadout data for "${id}": ${result.error}` };
    }
  }

  // Normalize: drop legacy 'sessions' key, keep only 'loadouts'
  const { sessions: _legacy, ...rest } = obj as any;
  const normalized = { ...rest, tree: obj.tree, loadouts: loadoutsObj };
  return { ok: true, data: normalized as unknown as MultiLoadoutBundle };
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
