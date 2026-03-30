/**
 * Registers/deregisters custom operators into the runtime registries.
 *
 * V2: Custom operators are stored as game data JSON (same format as built-in operators).
 * Registration simply passes the JSON to the unified registrar.
 *
 * V1 legacy: Also supports CustomOperator format via adapter conversion for migration.
 */
import {
  registerCustomOperatorFromConfig,
  deregisterCustomOperatorById,
} from '../operators/operatorRegistry';
import { OPERATORS } from '../../utils/loadoutRegistry';
import type { CustomOperator } from '../../model/custom/customOperatorTypes';
import { operatorFromFriendly } from './gameDataAdapters';

type GameDataJson = Record<string, unknown>;

/**
 * Register a custom operator from game data JSON.
 * This is the primary v2 path — JSON is already in game data format.
 */
export function registerCustomOperatorJson(json: GameDataJson): void {
  const id = (json.id ?? '') as string;
  const customId = id.startsWith('CUSTOM_') ? id.toLowerCase() : `custom_${id.toLowerCase()}`;
  const name = (json.name ?? '') as string;
  const icon = json.splashArt as string | undefined;
  const rarity = (json.operatorRarity ?? 6) as number;

  const viewOp = registerCustomOperatorFromConfig(customId, json);
  if (!viewOp) return;

  OPERATORS.push({
    name,
    icon,
    rarity,
    create: () => viewOp as unknown as import('../../model/operators/dataDrivenOperator').DataDrivenOperator,
  });
}

/**
 * Deregister a custom operator by game data ID.
 */
export function deregisterCustomOperatorJson(json: GameDataJson): void {
  const id = (json.id ?? '') as string;
  const customId = id.startsWith('CUSTOM_') ? id.toLowerCase() : `custom_${id.toLowerCase()}`;
  const name = (json.name ?? '') as string;

  deregisterCustomOperatorById(customId);

  const regIdx = OPERATORS.findIndex((o) => o.name === name);
  if (regIdx >= 0) OPERATORS.splice(regIdx, 1);
}

// ── Legacy v1 support (for migration compatibility) ────────────────────────

/** Register a custom operator from the legacy CustomOperator format. */
export function registerCustomOperator(operator: CustomOperator): void {
  const json = operatorFromFriendly(operator);
  registerCustomOperatorJson(json);
}

/** Deregister a custom operator from the legacy CustomOperator format. */
export function deregisterCustomOperator(operator: CustomOperator): void {
  deregisterCustomOperatorJson(operatorFromFriendly(operator));
}
