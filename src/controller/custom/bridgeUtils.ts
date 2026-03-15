/**
 * Bridge utilities for converting between SVO ObjectType entities and
 * legacy target strings used by weapon/gear effect configs.
 */
import { ObjectType } from '../../consts/semantics';

type LegacyTarget = 'wielder' | 'team' | 'enemy';

/** Convert legacy target to SVO ObjectType. */
export function legacyTargetToObjectType(target: LegacyTarget): ObjectType {
  switch (target) {
    case 'enemy': return ObjectType.ENEMY;
    case 'team': return ObjectType.ALL_OPERATORS;
    default: return ObjectType.THIS_OPERATOR;
  }
}

/** Convert SVO ObjectType entity to legacy target string. */
export function mapTargetToLegacy(target: string): LegacyTarget {
  switch (target) {
    case ObjectType.ENEMY: return 'enemy';
    case ObjectType.ALL_OPERATORS:
    case ObjectType.OTHER_OPERATOR:
    case ObjectType.OTHER_OPERATORS:
      return 'team';
    default: return 'wielder';
  }
}
