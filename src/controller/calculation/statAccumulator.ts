/**
 * StatAccumulator — real-time per-entity stat tracking during the event queue pipeline.
 *
 * Maintains a running stat snapshot per entity (operator slots + enemy + common).
 * Initialized once per pipeline run from aggregateLoadoutStats (operators) and
 * enemy stats. Updated incrementally as status effects are created/consumed
 * during queue processing via applyStatDelta / applyFactorDelta.
 *
 * Consumed by:
 * - handleProcessFrame (crit resolution for damage frames)
 * - Future: damage calculation during pipeline, buff-dependent derived events
 */

import { StatType, DamageFactorType, CritMode } from '../../consts/enums';
import { DEFAULT_STATS } from '../../consts/stats';
import { aggregateLoadoutStats } from './loadoutAggregator';
import type { LoadoutProperties } from '../../view/InformationPane';
import type { OperatorLoadoutState } from '../../view/OperatorLoadoutHeader';
import type { EnemyStats } from '../appStateController';
import { ENEMY_OWNER_ID } from '../../model/channels';
import { COMMON_OWNER_ID } from '../slot/commonSlotController';

// ── Types ────────────────────────────────────────────────────────────────

export interface StatSnapshot {
  /** Operator/enemy base stats (all StatType values). */
  stats: Record<StatType, number>;
  /** Combat multiplier factors from active status effects. */
  factors: Record<DamageFactorType, number>;
}

const DEFAULT_FACTORS: Readonly<Record<DamageFactorType, number>> = {
  [DamageFactorType.NONE]: 0,
  [DamageFactorType.DAMAGE_BONUS]: 0,
  [DamageFactorType.AMP]: 0,
  [DamageFactorType.STAGGER]: 0,
  [DamageFactorType.LINK]: 0,
  [DamageFactorType.WEAKEN]: 0,
  [DamageFactorType.SUSCEPTIBILITY]: 0,
  [DamageFactorType.FRAGILITY]: 0,
  [DamageFactorType.DMG_REDUCTION]: 0,
  [DamageFactorType.PROTECTION]: 0,
  [DamageFactorType.DEFENSE]: 0,
  [DamageFactorType.RESISTANCE]: 0,
};

function emptySnapshot(): StatSnapshot {
  return {
    stats: { ...DEFAULT_STATS },
    factors: { ...DEFAULT_FACTORS },
  };
}

// ── Accumulator ──────────────────────────────────────────────────────────

export class StatAccumulator {
  /** Per-entity running state — mutated in-place as deltas arrive. */
  private current = new Map<string, StatSnapshot>();

  /** Per-entity base stats (set during init, never mutated). */
  private base = new Map<string, Partial<Record<StatType, number>>>();

  /** Per-frame stat deltas: frameKey → entityId → stat deltas from base. */
  private frameDeltas = new Map<string, Map<string, Partial<Record<StatType, number>>>>();

  /** Collected crit results from SIMULATION mode (for write-back to overrides). */
  private resolvedCrits = new Map<string, Map<number, Map<number, boolean>>>();

  // ── Init ────────────────────────────────────────────────────────

  /**
   * Initialize base stats for all entities.
   * Called once at the start of each pipeline run.
   */
  init(
    slotIds: string[],
    loadoutProperties: Record<string, LoadoutProperties>,
    loadouts: Record<string, OperatorLoadoutState> | undefined,
    slotOperatorMap: Record<string, string> | undefined,
    enemyStats: EnemyStats | undefined,
  ): void {
    this.current.clear();
    this.base.clear();
    this.frameDeltas.clear();
    this.resolvedCrits.clear();

    // Per operator slot: aggregate from operator + weapon + gear + consumable
    for (const slotId of slotIds) {
      const opId = slotOperatorMap?.[slotId];
      if (!opId) {
        this.current.set(slotId, emptySnapshot());
        continue;
      }
      const loadout = loadouts?.[slotId];
      const props = loadoutProperties[slotId];
      if (!loadout || !props) {
        this.current.set(slotId, emptySnapshot());
        continue;
      }
      const agg = aggregateLoadoutStats(opId, loadout, props);
      if (!agg) {
        this.current.set(slotId, emptySnapshot());
        continue;
      }
      this.current.set(slotId, {
        stats: { ...agg.stats },
        factors: { ...DEFAULT_FACTORS },
      });
      this.base.set(slotId, { ...agg.stats });
    }

    // Enemy stats
    const enemySnap = emptySnapshot();
    if (enemyStats) {
      for (const key of Object.keys(enemyStats) as (keyof EnemyStats)[]) {
        const statKey = key as string;
        if (statKey in StatType) {
          enemySnap.stats[statKey as StatType] = enemyStats[key] as number;
        }
      }
    }
    this.current.set(ENEMY_OWNER_ID, enemySnap);

    // Common (team-level)
    this.current.set(COMMON_OWNER_ID, emptySnapshot());
  }

  // ── Delta application ──────────────────────────────────────────

  /** Apply base stat changes (e.g. buff granting +ATK%, +crit rate). */
  applyStatDelta(entityId: string, deltas: Partial<Record<StatType, number>>): void {
    const snap = this.current.get(entityId);
    if (!snap) return;
    for (const key of Object.keys(deltas) as StatType[]) {
      snap.stats[key] = (snap.stats[key] ?? 0) + (deltas[key] ?? 0);
    }
  }

  /** Apply combat factor changes (e.g. AMP, SUSCEPTIBILITY, FRAGILITY status effects). */
  applyFactorDelta(entityId: string, factor: DamageFactorType, delta: number): void {
    const snap = this.current.get(entityId);
    if (!snap) return;
    snap.factors[factor] = (snap.factors[factor] ?? 0) + delta;
  }

  // ── Queries (O(1)) ─────────────────────────────────────────────

  getStat(entityId: string, stat: StatType): number {
    return this.current.get(entityId)?.stats[stat] ?? 0;
  }

  getFactor(entityId: string, factor: DamageFactorType): number {
    return this.current.get(entityId)?.factors[factor] ?? 0;
  }

  getSnapshot(entityId: string): StatSnapshot | undefined {
    return this.current.get(entityId);
  }

  // ── Frame-level stat snapshots ──────────────────────────────────

  /** Record the current stat deltas (from base) for an entity at a damage frame. */
  snapshotDeltas(frameKey: string, entityId: string): void {
    const current = this.current.get(entityId);
    const base = this.base.get(entityId);
    if (!current || !base) return;

    const deltas: Partial<Record<StatType, number>> = {};
    let hasDelta = false;
    for (const key of Object.keys(current.stats) as StatType[]) {
      const diff = (current.stats[key] ?? 0) - (base[key] ?? 0);
      if (diff !== 0) {
        deltas[key] = diff;
        hasDelta = true;
      }
    }
    if (!hasDelta) return;

    if (!this.frameDeltas.has(frameKey)) this.frameDeltas.set(frameKey, new Map());
    this.frameDeltas.get(frameKey)!.set(entityId, deltas);
  }

  /** Get the stat deltas for an entity at a specific damage frame. */
  getFrameStatDeltas(frameKey: string, entityId: string): Partial<Record<StatType, number>> | undefined {
    return this.frameDeltas.get(frameKey)?.get(entityId);
  }

  // ── Crit resolution ────────────────────────────────────────────

  /**
   * Resolve crit for a damage frame. Reads current crit stats from the accumulator.
   *
   * @param existingPin - If defined, the frame already has a pinned crit value (user or previous sim).
   * @returns boolean for SIMULATION/ALWAYS/NEVER, undefined for EXPECTED (use formula downstream).
   */
  resolveCrit(
    overrideKey: string,
    segIdx: number,
    frameIdx: number,
    slotId: string,
    critMode: CritMode,
    existingPin?: boolean,
  ): boolean | undefined {
    // Already pinned — return as-is, no roll
    if (existingPin !== undefined) return existingPin;

    if (critMode === CritMode.ALWAYS) return true;
    if (critMode === CritMode.NEVER) return false;

    // Roll against current crit rate for RANDOM (and legacy EXPECTED pre-model)
    const critRate = Math.min(Math.max(this.getStat(slotId, StatType.CRITICAL_RATE), 0), 1);
    const result = Math.random() < critRate;

    // Only store for write-back in RANDOM mode (persists rolls to overrides)
    if (critMode === CritMode.RANDOM) {
      if (!this.resolvedCrits.has(overrideKey)) this.resolvedCrits.set(overrideKey, new Map());
      const segMap = this.resolvedCrits.get(overrideKey)!;
      if (!segMap.has(segIdx)) segMap.set(segIdx, new Map());
      segMap.get(segIdx)!.set(frameIdx, result);
    }

    return result;
  }

  // ── Results ────────────────────────────────────────────────────

  /** Get all crit results from this pipeline run (for persistence to overrides). */
  getResolvedCrits(): Map<string, Map<number, Map<number, boolean>>> {
    return this.resolvedCrits;
  }

  /** Reset all state for the next pipeline run. */
  clear(): void {
    this.current.clear();
    this.base.clear();
    this.frameDeltas.clear();
    this.resolvedCrits.clear();
  }
}
