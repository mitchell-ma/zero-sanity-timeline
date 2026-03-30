/**
 * One-time migration from v1 custom content format (Custom* types) to v2 (game data JSON).
 *
 * v1: Simplified types like CustomWeapon { baseAtk: { lv1, lv90 }, skills: [...] }
 * v2: Game data JSON matching the format used by built-in entities in src/model/game-data/
 *
 * Migration backs up v1 data before converting, and only runs once.
 */
import {
  operatorFromFriendly,
  weaponFromFriendly,
  weaponNamedEffectsToStatuses,
  gearPiecesFromFriendly,
  gearSetEffectFromFriendly,
  gearSetStatusesFromFriendly,
} from '../controller/custom/gameDataAdapters';
import type { CustomOperator } from '../model/custom/customOperatorTypes';
import type { CustomWeapon } from '../model/custom/customWeaponTypes';
import type { CustomGearSet } from '../model/custom/customGearTypes';

const VERSION_KEY = 'zst-custom-content-version';
const CURRENT_VERSION = 'v2';

const STORAGE_KEYS = {
  operators: 'zst-custom-operators',
  skills: 'zst_custom_skills',
  operatorStatuses: 'zst-custom-operator-statuses',
  operatorTalents: 'zst-custom-operator-talents',
  weapons: 'zst-custom-weapons',
  weaponEffects: 'zst-custom-weapon-effects',
  gearSets: 'zst-custom-gear-sets',
  gearEffects: 'zst-custom-gear-effects',
} as const;

/** Check if migration is needed. */
export function needsMigration(): boolean {
  const version = localStorage.getItem(VERSION_KEY);
  return version !== CURRENT_VERSION;
}

/** Mark migration as complete. */
export function markMigrationComplete(): void {
  localStorage.setItem(VERSION_KEY, CURRENT_VERSION);
}

/** Run v1→v2 migration. Backs up old data and converts to game data JSON format. */
export function migrateV1ToV2(): { migrated: number; errors: string[] } {
  const errors: string[] = [];
  let migrated = 0;

  // Check if there's any v1 data to migrate
  const version = localStorage.getItem(VERSION_KEY);
  if (version === CURRENT_VERSION) return { migrated, errors };

  // Back up all existing data
  for (const [, key] of Object.entries(STORAGE_KEYS)) {
    const raw = localStorage.getItem(key);
    if (raw) {
      localStorage.setItem(`${key}-v1-backup`, raw);
    }
  }

  // Migrate operators
  migrated += migrateArray<CustomOperator>(
    STORAGE_KEYS.operators,
    (op) => operatorFromFriendly(op),
    errors,
    'operator',
  );

  // Note: Skills, operator statuses, operator talents, weapon effects, and gear effects
  // are NOT migrated yet — their controllers still use v1 friendly format.
  // They will be migrated when those controllers are updated.

  // Migrate weapons — produce bundles { weapon, statuses }
  const weaponsRaw = localStorage.getItem(STORAGE_KEYS.weapons);
  if (weaponsRaw) {
    try {
      const weapons = JSON.parse(weaponsRaw) as CustomWeapon[];
      if (Array.isArray(weapons)) {
        const bundles: Record<string, unknown>[] = [];
        for (const weapon of weapons) {
          try {
            bundles.push({
              weapon: weaponFromFriendly(weapon),
              statuses: weaponNamedEffectsToStatuses(weapon),
            });
            migrated++;
          } catch (e) {
            errors.push(`weapon "${weapon.id}": ${e}`);
          }
        }
        localStorage.setItem(STORAGE_KEYS.weapons, JSON.stringify(bundles));
      }
    } catch (e) {
      errors.push(`weapons: ${e}`);
    }
  }

  // Migrate gear sets — these produce multiple entities (set effect + pieces + statuses)
  // We store the set effect JSON in gearSets key
  const gearSetsRaw = localStorage.getItem(STORAGE_KEYS.gearSets);
  if (gearSetsRaw) {
    try {
      const gearSets = JSON.parse(gearSetsRaw) as CustomGearSet[];
      if (Array.isArray(gearSets)) {
        const setEffects: Record<string, unknown>[] = [];
        const allPieces: Record<string, unknown>[] = [];
        const allStatuses: Record<string, unknown>[] = [];

        for (const gs of gearSets) {
          try {
            const setEffect = gearSetEffectFromFriendly(gs);
            if (setEffect) setEffects.push(setEffect);
            allPieces.push(...gearPiecesFromFriendly(gs));
            allStatuses.push(...gearSetStatusesFromFriendly(gs));
            migrated++;
          } catch (e) {
            errors.push(`gear set "${gs.id}": ${e}`);
          }
        }

        // Store converted data — we bundle set effects, pieces, and statuses together
        // in the gear sets key as a structured bundle
        localStorage.setItem(STORAGE_KEYS.gearSets, JSON.stringify(
          gearSets.map(gs => ({
            _v2Bundle: true,
            setEffect: gearSetEffectFromFriendly(gs),
            pieces: gearPiecesFromFriendly(gs),
            statuses: gearSetStatusesFromFriendly(gs),
          })),
        ));
      }
    } catch (e) {
      errors.push(`gear sets: ${e}`);
    }
  }

  // Mark as migrated
  markMigrationComplete();

  return { migrated, errors };
}

/** Migrate an array of items 1:1. */
function migrateArray<T extends { id: string }>(
  key: string,
  convert: (item: T) => Record<string, unknown>,
  errors: string[],
  label: string,
): number {
  const raw = localStorage.getItem(key);
  if (!raw) return 0;

  try {
    const items = JSON.parse(raw) as T[];
    if (!Array.isArray(items)) return 0;

    const converted: Record<string, unknown>[] = [];
    let count = 0;

    for (const item of items) {
      try {
        converted.push(convert(item));
        count++;
      } catch (e) {
        errors.push(`${label} "${item.id}": ${e}`);
      }
    }

    localStorage.setItem(key, JSON.stringify(converted));
    return count;
  } catch (e) {
    errors.push(`${label}s: ${e}`);
    return 0;
  }
}

