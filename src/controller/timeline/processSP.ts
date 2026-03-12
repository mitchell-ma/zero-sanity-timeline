import { TimelineEvent } from '../../consts/viewTypes';

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

    // Sum up all SP recovery from frame data
    let totalSpReturn = 0;
    for (const seg of ev.segments) {
      if (!seg.frames) continue;
      for (const frame of seg.frames) {
        if (frame.skillPointRecovery && frame.skillPointRecovery > 0) {
          totalSpReturn += frame.skillPointRecovery;
        }
      }
    }

    if (totalSpReturn <= 0) continue;

    const spCost = ev.skillPointCost ?? 100;
    if (spCost <= 0) continue;

    const ratio = Math.max(0, (spCost - totalSpReturn) / spCost);

    const updates: Partial<TimelineEvent> = {};
    if (ev.gaugeGain != null) {
      updates.gaugeGain = ev.gaugeGain * ratio;
    }
    if (ev.teamGaugeGain != null) {
      updates.teamGaugeGain = ev.teamGaugeGain * ratio;
    }
    if (ev.gaugeGainByEnemies != null) {
      const reduced: Record<number, number> = {};
      for (const [k, v] of Object.entries(ev.gaugeGainByEnemies)) {
        reduced[Number(k)] = v * ratio;
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
