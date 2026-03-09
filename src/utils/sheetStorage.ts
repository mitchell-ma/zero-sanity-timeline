import { TimelineEvent, VisibleSkills } from '../consts/viewTypes';
import { OperatorLoadoutState } from '../view/OperatorLoadoutHeader';
import { LoadoutStats } from '../view/LoadoutEditPanel';

const STORAGE_KEY = 'zst-sheet';
const CURRENT_VERSION = 1;

export interface SheetData {
  version: number;
  operatorIds: (string | null)[];
  enemyId: string;
  events: TimelineEvent[];
  loadouts: Record<string, OperatorLoadoutState>;
  loadoutStats: Record<string, LoadoutStats>;
  visibleSkills: VisibleSkills;
  nextEventId: number;
}

export function serializeSheet(
  operatorIds: (string | null)[],
  enemyId: string,
  events: TimelineEvent[],
  loadouts: Record<string, OperatorLoadoutState>,
  loadoutStats: Record<string, LoadoutStats>,
  visibleSkills: VisibleSkills,
  nextEventId: number,
): SheetData {
  return {
    version: CURRENT_VERSION,
    operatorIds,
    enemyId,
    events,
    loadouts,
    loadoutStats,
    visibleSkills,
    nextEventId,
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

  return { ok: true, data: obj as unknown as SheetData };
}

// ─── LocalStorage ────────────────────────────────────────────────────────

export function saveToLocalStorage(data: SheetData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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
  const json = JSON.stringify(data, null, 2);
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
