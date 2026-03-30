/**
 * Registers/deregisters custom weapons into the runtime registries
 * so they appear alongside built-in weapons in loadout dropdowns
 * and the timeline pipeline.
 *
 * V2: Custom weapons are stored as game data JSON (same format as built-in weapons).
 * V1 legacy: Also supports CustomWeapon format via adapter conversion.
 */
import { registerCustomWeaponEffectDefs, deregisterCustomWeaponEffectDefs, registerCustomWeapon as registerInController, deregisterCustomWeapon as deregisterFromController } from '../gameDataStore';
import type { CustomWeapon } from '../../model/custom/customWeaponTypes';
import { weaponFromFriendly, weaponNamedEffectsToStatuses } from './gameDataAdapters';

type GameDataJson = Record<string, unknown>;

/**
 * Register a custom weapon from game data JSON.
 * Handles both the weapon itself and any associated status defs.
 */
export function registerCustomWeaponJson(weaponJson: GameDataJson, statusJsons?: GameDataJson[]): void {
  const props = (weaponJson.properties ?? {}) as GameDataJson;
  const meta = (weaponJson.metadata ?? {}) as GameDataJson;
  const icon = (meta.icon ?? '') as string | undefined;

  // Register the weapon in the weapons store
  registerInController(weaponJson, icon);

  // Register status defs for the derivation engine
  if (statusJsons && statusJsons.length > 0) {
    const name = (props.name ?? props.id ?? '') as string;
    registerCustomWeaponEffectDefs(name, statusJsons);
  }
}

/**
 * Deregister a custom weapon by game data JSON.
 */
export function deregisterCustomWeaponJson(weaponJson: GameDataJson): void {
  const props = (weaponJson.properties ?? {}) as GameDataJson;
  const id = (props.id ?? '') as string;
  const name = (props.name ?? '') as string;

  deregisterCustomWeaponEffectDefs(name);
  deregisterFromController(id);
}

// ── Legacy v1 support ──────────────────────────────────────────────────────

/** Register from legacy CustomWeapon format. */
export function registerCustomWeapon(weapon: CustomWeapon): void {
  const weaponJson = weaponFromFriendly(weapon);
  const statusJsons = weaponNamedEffectsToStatuses(weapon);
  registerCustomWeaponJson(weaponJson, statusJsons);
}

/** Deregister from legacy CustomWeapon format. */
export function deregisterCustomWeapon(weapon: CustomWeapon): void {
  deregisterCustomWeaponJson(weaponFromFriendly(weapon));
}
