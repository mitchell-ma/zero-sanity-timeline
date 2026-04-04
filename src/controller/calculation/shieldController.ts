/**
 * ShieldController — tracks shield values for all operators over the timeline.
 *
 * Shield is an absorptive barrier: damage hits shield first before HP.
 * Each shield tick has a value and an expiration frame (from the parent status duration).
 * Multiple shields from different sources stack additively.
 *
 * Follows the HPController lifecycle: applyShield() → getShieldValue() → finalize() → clear().
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface ShieldTick {
  frame: number;
  operatorId: string;
  amount: number;
  expirationFrame: number;
}

// ── ShieldController ─────────────────────────────────────────────────────────

export class ShieldController {
  private ticks: ShieldTick[] = [];

  // ── Accumulation ──────────────────────────────────────────────────────

  applyShield(operatorId: string, frame: number, amount: number, expirationFrame: number) {
    this.ticks.push({ frame, operatorId, amount, expirationFrame });
  }

  // ── Query ─────────────────────────────────────────────────────────────

  /** Total active shield value for an operator at a frame. */
  getShieldValue(operatorId: string, frame: number): number {
    let total = 0;
    for (const tick of this.ticks) {
      if (tick.operatorId !== operatorId) continue;
      if (frame >= tick.frame && frame < tick.expirationFrame) {
        total += tick.amount;
      }
    }
    return total;
  }

  /** All operator IDs that have any shield data. */
  getOperatorIds(): string[] {
    const ids = new Set<string>();
    for (const tick of this.ticks) ids.add(tick.operatorId);
    return Array.from(ids);
  }

  // ── Damage absorption ──────────────────────────────────────────────────

  /**
   * Absorb damage through active shields. Depletes shields oldest-first.
   * Returns the overflow damage that should be applied to HP.
   */
  absorbDamage(operatorId: string, frame: number, damage: number): number {
    let remaining = damage;
    for (const tick of this.ticks) {
      if (remaining <= 0) break;
      if (tick.operatorId !== operatorId) continue;
      if (frame < tick.frame || frame >= tick.expirationFrame) continue;
      if (tick.amount <= 0) continue;
      const absorbed = Math.min(tick.amount, remaining);
      tick.amount -= absorbed;
      remaining -= absorbed;
    }
    return remaining;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────

  finalize() {
    // Sort ticks by frame for potential future optimizations
    this.ticks.sort((a, b) => a.frame - b.frame);
  }

  clear() {
    this.ticks.length = 0;
  }
}
