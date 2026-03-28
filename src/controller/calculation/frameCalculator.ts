import { TimelineEvent } from "../../consts/viewTypes";
import { NounType } from '../../dsl/semantics';

// ── SP Return Summary ────────────────────────────────────────────────────────

export interface SpReturnSummary {
  spCost: number;
  totalSpReturn: number;
  naturalConsumed: number;
  returnedConsumed: number;
  derivedUltimateCharge: number;
}

/** Compute SP return summary for a battle skill event. */
export function computeSpReturnSummary(
  event: TimelineEvent,
  consumptionRecord?: { naturalConsumed: number; returnedConsumed: number },
): SpReturnSummary {
  let totalSpReturn = 0;
  if (event.columnId === NounType.BATTLE_SKILL && event.segments) {
    for (const seg of event.segments) {
      if (!seg.frames) continue;
      for (const f of seg.frames) {
        if (f.skillPointRecovery) totalSpReturn += f.skillPointRecovery;
      }
    }
  }
  const spCost = event.skillPointCost ?? 100;
  // Use actual dual-pool split if available, otherwise assume all natural
  const naturalConsumed = consumptionRecord?.naturalConsumed ?? spCost;
  const returnedConsumed = consumptionRecord?.returnedConsumed ?? 0;
  const RATIO = 0.065;
  return {
    spCost,
    totalSpReturn,
    naturalConsumed,
    returnedConsumed,
    derivedUltimateCharge: naturalConsumed * RATIO,
  };
}
