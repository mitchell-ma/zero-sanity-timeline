/**
 * Loader for weapon and gear set effect DSL definitions.
 *
 * Auto-discovers JSON files from weapon-effects/ and gear-effects/ directories.
 * Provides lookup functions used by the status derivation engine.
 *
 * Uses require.context (webpack) for auto-discovery. Falls back to empty
 * registries in test environments where require.context is unavailable.
 */
import type { GearSetType } from '../../consts/enums';

// ── Auto-discover weapon effect JSONs ────────────────────────────────────────

const WEAPON_EFFECT_JSON: Record<string, { weaponName: string; statusEvents: any[] }> = {};
/** Weapon name → file key lookup for O(1) access. */
const WEAPON_NAME_INDEX: Record<string, string> = {};

try {
  const weaponEffectContext = (require as any).context('./weapon-effects', false, /-effects\.json$/);
  for (const key of weaponEffectContext.keys()) {
    const data = weaponEffectContext(key);
    WEAPON_EFFECT_JSON[key] = data;
    if (data.weaponName) {
      WEAPON_NAME_INDEX[data.weaponName] = key;
    }
  }
} catch {
  // require.context unavailable (Jest) — weapon effects populated via custom registration
}

// ── Auto-discover gear effect JSONs ──────────────────────────────────────────

const GEAR_EFFECT_JSON: Record<string, { gearSetType: string; label: string; statusEvents: any[] }> = {};
/** GearSetType → file key lookup for O(1) access. */
const GEAR_TYPE_INDEX: Record<string, string> = {};

try {
  const gearEffectContext = (require as any).context('./gear-effects', false, /-effects\.json$/);
  for (const key of gearEffectContext.keys()) {
    const data = gearEffectContext(key);
    GEAR_EFFECT_JSON[key] = data;
    if (data.gearSetType) {
      GEAR_TYPE_INDEX[data.gearSetType] = key;
    }
  }
} catch {
  // require.context unavailable (Jest) — gear effects populated via custom registration
}

// ── Custom weapon/gear effect registries ─────────────────────────────────────

const customWeaponEffects: Record<string, any[]> = {};
const customGearEffects: Record<string, any[]> = {};

// ── Public API ───────────────────────────────────────────────────────────────

/** Get DSL status event defs for a weapon by name. */
export function getWeaponEffectDefs(weaponName: string): any[] {
  // Check custom first
  if (customWeaponEffects[weaponName]) return customWeaponEffects[weaponName];
  const key = WEAPON_NAME_INDEX[weaponName];
  if (!key) return [];
  return WEAPON_EFFECT_JSON[key]?.statusEvents ?? [];
}

/** Get DSL status event defs for a gear set type. */
export function getGearEffectDefs(gearSetType: GearSetType | string): any[] {
  // Check custom first
  if (customGearEffects[gearSetType]) return customGearEffects[gearSetType];
  const key = GEAR_TYPE_INDEX[gearSetType];
  if (!key) return [];
  return GEAR_EFFECT_JSON[key]?.statusEvents ?? [];
}

/** Get all weapon names that have effect definitions. */
export function getAllWeaponEffectNames(): string[] {
  return [
    ...Object.values(WEAPON_EFFECT_JSON).map(d => d.weaponName),
    ...Object.keys(customWeaponEffects),
  ];
}

/** Get all gear set types that have effect definitions. */
export function getAllGearEffectTypes(): string[] {
  return [
    ...Object.values(GEAR_EFFECT_JSON).map(d => d.gearSetType),
    ...Object.keys(customGearEffects),
  ];
}

/** Register custom weapon effect defs at runtime. */
export function registerCustomWeaponEffectDefs(weaponName: string, defs: any[]): void {
  customWeaponEffects[weaponName] = defs;
}

/** Deregister custom weapon effect defs. */
export function deregisterCustomWeaponEffectDefs(weaponName: string): void {
  delete customWeaponEffects[weaponName];
}

/** Register custom gear effect defs at runtime. */
export function registerCustomGearEffectDefs(gearSetType: string, defs: any[]): void {
  customGearEffects[gearSetType] = defs;
}

/** Deregister custom gear effect defs. */
export function deregisterCustomGearEffectDefs(gearSetType: string): void {
  delete customGearEffects[gearSetType];
}

/** Get the gear set label from the gear JSON metadata. */
export function getGearEffectLabel(gearSetType: GearSetType | string): string | undefined {
  const key = GEAR_TYPE_INDEX[gearSetType];
  if (!key) return undefined;
  return GEAR_EFFECT_JSON[key]?.label;
}

// ── Display helpers for DSL status event defs ────────────────────────────────

/** Resolve target display string from DSL def fields. */
export function resolveTargetDisplay(def: { target: string; targetDeterminer?: string }): string {
  if (def.target === 'ENEMY') return 'enemy';
  if (def.targetDeterminer === 'OTHER') return 'team';
  return 'wielder';
}

/** Get duration in seconds from a DSL def. */
export function resolveDurationSeconds(def: { properties?: { duration?: { value: number[] } } }): number {
  return def.properties?.duration?.value?.[0] ?? 0;
}

/** Resolve triggerClause conditions to flat Interaction-like objects for display. */
export function resolveTriggerInteractions(def: { triggerClause: { conditions: any[] }[] }): any[] {
  return def.triggerClause.flatMap(c => c.conditions);
}
