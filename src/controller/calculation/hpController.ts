/**
 * HPController — tracks HP for all operators and enemy over the timeline.
 *
 * Operators: start at max HP (from aggregated BASE_HP), increased by healing (RESTORE HP).
 * No damage-to-operators mechanism exists yet.
 *
 * Enemy: replaces the old precomputeDamageByFrame / getEnemyHpPercentage in calculationController.
 * Enemy HP goes down from damage ticks.
 *
 * Tracks healing done and overhealing per heal event.
 */
import type { ResourcePoint } from '../timeline/resourceTimeline';

// ── Types ────────────────────────────────────────────────────────────────────

/** A heal tick on the timeline. */
export interface HealTick {
  frame: number;
  /** Target slot ID receiving the heal. */
  targetSlotId: string;
  /** Source slot ID that owns the heal talent/status. */
  sourceSlotId: string;
  /** Raw heal amount (before overheal clamping). */
  amount: number;
}

/** A damage tick on the enemy timeline. */
interface DamageTick {
  frame: number;
  damage: number;
}

/** Summary of healing for display. */
export interface HealSummary {
  totalHealing: number;
  totalOverhealing: number;
}

// ── HPController ─────────────────────────────────────────────────────────────

export class HPController {
  // ── Enemy HP tracking (replaces old precomputeDamageByFrame) ────────────

  private bossMaxHp: number | null = null;
  /** Sorted (frame, cumDamage) pairs for enemy HP binary search. */
  private damageTicks: { frame: number; cumDamage: number }[] = [];

  // ── Operator HP tracking ───────────────────────────────────────────────

  /** Per-slot max HP, keyed by slot ID. */
  private slotMaxHp = new Map<string, number>();
  /** Accumulated heal ticks per slot. */
  private healTicks: HealTick[] = [];
  /** Per-slot HP graph (after finalize). */
  private slotHpGraphs = new Map<string, ResourcePoint[]>();
  /** Per-slot heal summary (after finalize). */
  private slotHealSummaries = new Map<string, HealSummary>();

  // ── Configuration ──────────────────────────────────────────────────────

  /** Set enemy max HP for HP% queries. Call before precomputeDamage. */
  initEnemyHp(maxHp: number | null) {
    this.bossMaxHp = maxHp;
    this.damageTicks = [];
  }

  /** Configure operator max HP for a slot. */
  configureSlotHp(slotId: string, maxHp: number) {
    this.slotMaxHp.set(slotId, maxHp);
  }

  // ── Accumulation (called during pipeline) ──────────────────────────────

  /**
   * Add a heal tick (e.g. from RESTORE HP effect). Reactive — rebuilds the
   * affected slot's HP graph and heal summary on every call so consumers
   * never need a finalize step. O(N) per call where N is the slot's tick
   * count; total O(N²) over a pipeline run, fine for hundreds of ticks.
   */
  addHeal(tick: HealTick) {
    this.healTicks.push(tick);
    this._rebuildSlotGraph(tick.targetSlotId);
  }

  private _rebuildSlotGraph(slotId: string) {
    const maxHp = this.slotMaxHp.get(slotId) ?? 0;
    if (maxHp <= 0) return;
    // Collect this slot's heals in chronological order
    const heals = this.healTicks
      .filter(t => t.targetSlotId === slotId)
      .sort((a, b) => a.frame - b.frame);
    let currentHp = maxHp;
    let totalHealing = 0;
    let totalOverhealing = 0;
    const graph: ResourcePoint[] = [{ frame: 0, value: currentHp }];
    for (const heal of heals) {
      const effectiveHeal = Math.min(heal.amount, maxHp - currentHp);
      const overheal = heal.amount - effectiveHeal;
      currentHp += effectiveHeal;
      totalHealing += effectiveHeal;
      totalOverhealing += overheal;
      graph.push({ frame: heal.frame, value: currentHp });
    }
    this.slotHpGraphs.set(slotId, graph);
    this.slotHealSummaries.set(slotId, { totalHealing, totalOverhealing });
  }

  /**
   * Store pre-computed enemy damage ticks (cumulative).
   * Takes raw (frame, damage) pairs, sorts and builds cumulative array.
   */
  setEnemyDamageTicks(ticks: DamageTick[]) {
    ticks.sort((a, b) => a.frame - b.frame);
    let cum = 0;
    this.damageTicks = ticks.map(t => {
      cum += t.damage;
      return { frame: t.frame, cumDamage: cum };
    });
  }

  // ── Enemy HP queries ───────────────────────────────────────────────────

  /**
   * Get enemy HP as a percentage (0–100) at the given frame.
   * Uses binary search on pre-computed cumulative damage.
   * Returns null if no boss HP configured.
   */
  getEnemyHpPercentage = (frame: number): number | null => {
    if (this.bossMaxHp == null || this.bossMaxHp <= 0) return null;
    if (this.damageTicks.length === 0) return 100;

    // Binary search: find last tick at or before `frame`
    let lo = 0;
    let hi = this.damageTicks.length - 1;
    let result = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (this.damageTicks[mid].frame <= frame) {
        result = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    const cumDamage = result >= 0 ? this.damageTicks[result].cumDamage : 0;
    return Math.max(0, (this.bossMaxHp - cumDamage) / this.bossMaxHp * 100);
  };

  // ── Operator HP queries (by operatorId) ────────────────────────────────

  /** Per-operator max HP, keyed by operator ID. */
  private operatorMaxHp = new Map<string, number>();
  /** Sorted heal ticks per operator for live HP queries. */
  private operatorHealTicks = new Map<string, { frame: number; amount: number }[]>();

  /** Initialize operator HP (call before pipeline). */
  initOperatorHp(operatorId: string, maxHp: number) {
    this.operatorMaxHp.set(operatorId, maxHp);
  }

  /** Record a heal on an operator at a frame. */
  applyHeal(operatorId: string, frame: number, amount: number) {
    const ticks = this.operatorHealTicks.get(operatorId) ?? [];
    ticks.push({ frame, amount });
    this.operatorHealTicks.set(operatorId, ticks);
  }

  /** Get current flat HP for an operator at a given frame. */
  getOperatorFlatHp(operatorId: string, frame: number): number {
    const maxHp = this.operatorMaxHp.get(operatorId);
    if (maxHp == null) return 0;
    // No damage tracking yet — start at maxHp, add heals (clamped)
    let hp = maxHp;
    const ticks = this.operatorHealTicks.get(operatorId);
    if (ticks) {
      for (const t of ticks) {
        if (t.frame > frame) break;
        hp = Math.min(maxHp, hp + t.amount);
      }
    }
    return hp;
  }

  /** Get HP as percentage (0–100) for an operator at a given frame. */
  getOperatorPercentageHp(operatorId: string, frame: number): number {
    const maxHp = this.operatorMaxHp.get(operatorId);
    if (!maxHp || maxHp <= 0) return 100;
    return (this.getOperatorFlatHp(operatorId, frame) / maxHp) * 100;
  }

  /** Get all configured operator IDs. */
  getOperatorIds(): string[] {
    const ids: string[] = [];
    this.operatorMaxHp.forEach((_, id) => ids.push(id));
    return ids;
  }

  // ── Slot-based HP queries (legacy, for graphs) ────────────────────────

  /** Get HP graph for a slot (after finalize). */
  getSlotHpGraph(slotId: string): ReadonlyArray<ResourcePoint> {
    return this.slotHpGraphs.get(slotId) ?? [];
  }

  /** Get heal summary for a slot (after finalize). */
  getSlotHealSummary(slotId: string): HealSummary | undefined {
    return this.slotHealSummaries.get(slotId);
  }

  // Phase 9c: finalize() deleted. Per-slot HP graph + heal summary rebuild
  // reactively from addHeal via _rebuildSlotGraph. No post-pipeline pass.

  // ── Clear ──────────────────────────────────────────────────────────────

  clear() {
    this.bossMaxHp = null;
    this.damageTicks = [];
    this.healTicks = [];
    this.slotHpGraphs.clear();
    this.slotHealSummaries.clear();
    this.operatorHealTicks.clear();
    // slotMaxHp and operatorMaxHp intentionally kept — reconfigured before each pipeline run
  }
}
