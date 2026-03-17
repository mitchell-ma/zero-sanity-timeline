/**
 * Bridge utilities for converting between SVO ObjectType entities and
 * legacy target strings used by weapon/gear effect configs.
 *
 * The stored target string uses the pattern "<DETERMINER>_<NOUN>" for OPERATOR
 * targets (e.g. "THIS_OPERATOR", "ALL_OPERATOR") and plain noun strings for
 * non-operator targets (e.g. "ENEMY").
 */
import { ObjectType, DeterminerType } from '../../consts/semantics';

type LegacyTarget = 'wielder' | 'team' | 'enemy';

/** Result of converting a legacy target — noun type plus optional determiner. */
export interface LegacyTargetResult {
  objectType: ObjectType;
  objectDeterminer?: DeterminerType;
}

/** Convert legacy target to SVO ObjectType + optional DeterminerType. */
export function legacyTargetToObjectType(target: LegacyTarget): LegacyTargetResult {
  switch (target) {
    case 'enemy': return { objectType: ObjectType.ENEMY };
    case 'team': return { objectType: ObjectType.OPERATOR, objectDeterminer: DeterminerType.ALL };
    default: return { objectType: ObjectType.OPERATOR, objectDeterminer: DeterminerType.THIS };
  }
}

/**
 * Encode a LegacyTargetResult as a single string for storage in custom type configs.
 * OPERATOR targets are encoded as "<DETERMINER>_OPERATOR" (e.g. "THIS_OPERATOR").
 */
export function encodeLegacyTarget(result: LegacyTargetResult): string {
  if (result.objectType === ObjectType.OPERATOR) {
    const det = result.objectDeterminer ?? DeterminerType.THIS;
    return `${det}_OPERATOR`;
  }
  return result.objectType;
}

/** Convert a stored target string back to a legacy target string. */
export function mapTargetToLegacy(target: string): LegacyTarget {
  switch (target) {
    case ObjectType.ENEMY: return 'enemy';
    case `${DeterminerType.ALL}_OPERATOR`:
    case `${DeterminerType.OTHER}_OPERATOR`:
      return 'team';
    default: return 'wielder';
  }
}
