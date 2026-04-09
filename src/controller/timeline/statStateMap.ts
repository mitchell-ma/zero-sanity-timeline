/**
 * Stat-state bidirectional map.
 *
 * Maps stats that represent a reactive state to their corresponding DSL
 * adjective. Used by:
 *   - `interpret()` APPLY STAT handler — fires `BECOME:<adj>` / `BECOME_NOT:<adj>`
 *     trigger keys on the 0↔positive transition
 *   - `conditionEvaluator` — resolves `IS <adj>` / `BECOME <adj>` predicates
 *     by reading the stat accumulator
 *
 * Single source of truth for both sides. Adding a new stat-based state
 * requires exactly one entry here; both the forward and reverse lookups
 * (and therefore both call sites) update automatically.
 *
 * Phase 7 (pipeline-unification-plan.md): replaces the two parallel
 * `Partial<Record>` tables that used to live in `eventInterpretorController.ts`
 * (`STAT_TO_STATE_ADJECTIVE`) and `conditionEvaluator.ts` (`ADJECTIVE_TO_STAT`).
 */
import { StatType } from '../../consts/enums';
import { AdjectiveType, ObjectType } from '../../dsl/semantics';

/** Canonical (StatType → AdjectiveType) mapping. Single source of truth. */
const STAT_STATE_PAIRS: ReadonlyArray<[StatType, AdjectiveType]> = [
  [StatType.SLOW, AdjectiveType.SLOWED],
  [StatType.STAGGER_FRAILTY, AdjectiveType.STAGGERED],
];

/** Forward: StatType → state AdjectiveType (or undefined if the stat has no state). */
export const STAT_TO_STATE_ADJECTIVE: Partial<Record<StatType, AdjectiveType>> =
  Object.fromEntries(STAT_STATE_PAIRS) as Partial<Record<StatType, AdjectiveType>>;

/**
 * Reverse: state ObjectType → StatType. Keyed by the full `ObjectType` union
 * so DSL callers can pass `cond.object` (which is `NounType | AdjectiveType`)
 * directly without a cast. Lookups for non-stat-backed objects (any NounType,
 * or a non-state AdjectiveType) return undefined.
 */
export const ADJECTIVE_TO_STAT: Partial<Record<ObjectType, StatType>> =
  Object.fromEntries(STAT_STATE_PAIRS.map(([s, a]) => [a, s])) as Partial<Record<ObjectType, StatType>>;
