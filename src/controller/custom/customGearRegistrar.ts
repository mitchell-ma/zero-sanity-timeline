/**
 * Registers/deregisters custom gear sets into the runtime registries.
 *
 * V2: Custom gear sets are stored as game data JSON bundles
 *     (Gear + GearPiece[] + GearStat[]).
 * V1 legacy: Also supports CustomGearSet format via adapter conversion.
 */
import { GearSetType } from '../../consts/enums';
import { GEAR_SET_EFFECTS } from '../../consts/gearSetEffects';
import type { CustomGearSet } from '../../model/custom/customGearTypes';
import {
  gearPiecesFromFriendly,
  gearSetEffectFromFriendly,
  gearSetStatusesFromFriendly,
} from './gameDataAdapters';
import { registerCustomGearEffectDefs, deregisterCustomGearEffectDefs, registerCustomGearPiece as registerPieceInController, deregisterCustomGearPiece as deregisterPieceFromController } from '../gameDataStore';

type GameDataJson = Record<string, unknown>;

/**
 * Register a custom gear set from game data JSON bundle.
 */
export function registerCustomGearSetJson(
  setEffectJson: GameDataJson | null,
  pieceJsons: GameDataJson[],
  statusJsons: GameDataJson[],
): void {
  // Register each piece
  for (const piece of pieceJsons) {
    registerPieceInController(piece);
  }

  if (setEffectJson) {
    const setProps = (setEffectJson.properties ?? {}) as GameDataJson;
    const gearSetType = (setProps.id ?? '') as unknown as GearSetType;

    // Register passive set effect
    GEAR_SET_EFFECTS.push({
      gearSetType,
      label: (setProps.name ?? '') as string,
      passiveStats: {},
      effects: [],
    });

    // Register status defs for the derivation engine
    if (statusJsons.length > 0) {
      registerCustomGearEffectDefs(gearSetType as unknown as string, statusJsons);
    }
  }
}

/**
 * Deregister a custom gear set by game data JSON bundle.
 */
export function deregisterCustomGearSetJson(
  setEffectJson: GameDataJson | null,
  pieceJsons: GameDataJson[],
): void {
  // Remove pieces
  for (const piece of pieceJsons) {
    const pProps = (piece.properties ?? {}) as GameDataJson;
    deregisterPieceFromController((pProps.id ?? '') as string);
  }

  if (setEffectJson) {
    const setProps = (setEffectJson.properties ?? {}) as GameDataJson;
    const gearSetId = (setProps.id ?? '') as string;

    // Remove set effects
    const effectIdx = GEAR_SET_EFFECTS.findIndex((e) => (e.gearSetType as string) === gearSetId);
    if (effectIdx >= 0) GEAR_SET_EFFECTS.splice(effectIdx, 1);
    deregisterCustomGearEffectDefs(gearSetId);
  }
}

// ── Legacy v1 support ──────────────────────────────────────────────────────

/** Register from legacy CustomGearSet format. */
export function registerCustomGearSet(gearSet: CustomGearSet): void {
  const setEffect = gearSetEffectFromFriendly(gearSet);
  const pieces = gearPiecesFromFriendly(gearSet);
  const statuses = gearSetStatusesFromFriendly(gearSet);
  registerCustomGearSetJson(setEffect, pieces, statuses);
}

/** Deregister from legacy CustomGearSet format. */
export function deregisterCustomGearSet(gearSet: CustomGearSet): void {
  const setEffect = gearSetEffectFromFriendly(gearSet);
  const pieces = gearPiecesFromFriendly(gearSet);
  deregisterCustomGearSetJson(setEffect, pieces);
}
