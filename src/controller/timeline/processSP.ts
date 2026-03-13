import { TimelineEvent } from '../../consts/viewTypes';
import { computeSpReturnSummary } from '../calculation/frameCalculator';

// ── SP Return → Gauge Gain Reduction ─────────────────────────────────────────

/**
 * For battle skill events whose frame data includes SKILL_POINT_RECOVERY,
 * reduces gaugeGain and teamGaugeGain proportionally.
 *
 * ratio = (spCost - totalSpReturn) / spCost
 *
 * Affects: Last Rite (30 SP), Snowshine (30 SP), Catcher (30 SP).
 */
export function applySpReturnGaugeReduction(events: TimelineEvent[]): TimelineEvent[] {
  const modified = new Map<string, TimelineEvent>();

  for (const ev of events) {
    if (ev.columnId !== 'battle') continue;
    if (!ev.segments) continue;

    const sp = computeSpReturnSummary(ev);
    if (!sp.hasReduction) continue;

    const updates: Partial<TimelineEvent> = {};
    if (ev.gaugeGain != null) {
      updates.gaugeGain = ev.gaugeGain * sp.gaugeReduction;
    }
    if (ev.teamGaugeGain != null) {
      updates.teamGaugeGain = ev.teamGaugeGain * sp.gaugeReduction;
    }
    if (ev.gaugeGainByEnemies != null) {
      const reduced: Record<number, number> = {};
      for (const [k, v] of Object.entries(ev.gaugeGainByEnemies)) {
        reduced[Number(k)] = v * sp.gaugeReduction;
      }
      updates.gaugeGainByEnemies = reduced;
    }

    if (Object.keys(updates).length > 0) {
      modified.set(ev.id, { ...ev, ...updates });
    }
  }

  if (modified.size === 0) return events;
  return events.map((ev) => modified.get(ev.id) ?? ev);
}
