import { useState, useEffect, useMemo } from 'react';
import { Operator, TimelineEvent, ResourceConfig } from '../consts/viewTypes';
import { ResourcePoint } from '../controller/timeline/resourceTimeline';
import { CombatLoadout } from '../controller/combat-loadout';
import { COMMON_OWNER_ID, COMMON_COLUMN_IDS } from '../controller/slot/commonSlotController';
import { TOTAL_FRAMES, FPS } from '../utils/timeline';

export type ResourceGraphData = {
  points: ReadonlyArray<ResourcePoint>;
  min: number;
  max: number;
};

/** Computes and merges SP + ultimate energy resource graphs. */
export function useResourceGraphs(
  operators: (Operator | null)[],
  slotIds: string[],
  events: TimelineEvent[],
  combatLoadout: CombatLoadout,
  resourceConfigs?: Record<string, ResourceConfig>,
) {
  // ── Skill point graphs (from CommonSlot resource timeline) ──────────────
  const [spGraphs, setSpGraphs] = useState<Map<string, ResourceGraphData>>(new Map());

  useEffect(() => {
    const sp = combatLoadout.commonSlot.skillPoints;
    const key = `${COMMON_OWNER_ID}-${COMMON_COLUMN_IDS.SKILL_POINTS}`;
    const update = (points: ReadonlyArray<ResourcePoint>) => {
      setSpGraphs((prev) => {
        const next = new Map(prev);
        next.set(key, { points, min: sp.min, max: sp.max });
        return next;
      });
    };
    update(sp.getGraph());
    return sp.onGraphChange(update);
  }, [combatLoadout]);

  // ── Ultimate energy graphs (computed from events + operator data) ───────
  const ultimateGraphs = useMemo(() => {
    const graphs = new Map<string, ResourceGraphData>();

    // Collect gauge gain events: battle/combo skills that affect ultimate charge
    // Each event can grant gaugeGain to its own operator and teamGaugeGain to all operators
    type GaugeEvent = { frame: number; selfSlotId: string; gaugeGain: number; teamGaugeGain: number };
    const gaugeEvents: GaugeEvent[] = [];
    for (const ev of events) {
      if (ev.columnId !== 'battle' && ev.columnId !== 'combo') continue;
      if ((ev.gaugeGain ?? 0) > 0 || (ev.teamGaugeGain ?? 0) > 0) {
        gaugeEvents.push({
          frame: ev.startFrame,
          selfSlotId: ev.ownerId,
          gaugeGain: ev.gaugeGain ?? 0,
          teamGaugeGain: ev.teamGaugeGain ?? 0,
        });
      }
    }
    gaugeEvents.sort((a, b) => a.frame - b.frame);

    for (let i = 0; i < slotIds.length; i++) {
      const op = operators[i];
      if (!op) continue;
      const slotId = slotIds[i];
      const key = `${slotId}-ultimate`;
      const cfg = resourceConfigs?.[key];
      const max = cfg?.max ?? op.ultimateEnergyCost;
      const startValue = cfg?.startValue ?? 0;
      const chargePerFrame = (cfg?.regenPerSecond ?? 0) / FPS;

      // Merge ultimate consumption events and gauge gain events for this slot
      type UltEvent = { frame: number; type: 'consume' | 'gain'; amount: number };
      const timeline: UltEvent[] = [];

      // Ultimate activations consume the full gauge
      for (const ev of events) {
        if (ev.ownerId === slotId && ev.columnId === 'ultimate') {
          timeline.push({ frame: ev.startFrame, type: 'consume', amount: max });
        }
      }

      // Gauge gains from skills (self + team)
      for (const ge of gaugeEvents) {
        const gain = (ge.selfSlotId === slotId ? ge.gaugeGain : 0) + ge.teamGaugeGain;
        if (gain > 0) {
          timeline.push({ frame: ge.frame, type: 'gain', amount: gain });
        }
      }

      timeline.sort((a, b) => a.frame - b.frame || (a.type === 'gain' ? -1 : 1));

      const points: ResourcePoint[] = [];
      let value = startValue;
      let lastFrame = 0;
      points.push({ frame: 0, value });

      for (const te of timeline) {
        const regenFrames = te.frame - lastFrame;
        const preAction = Math.min(max, value + regenFrames * chargePerFrame);

        if (preAction !== value || te.frame !== lastFrame) {
          if (preAction !== points[points.length - 1].value || te.frame !== points[points.length - 1].frame) {
            points.push({ frame: te.frame, value: preAction });
          }
        }

        let postAction: number;
        if (te.type === 'consume') {
          postAction = Math.max(0, preAction - te.amount);
        } else {
          postAction = Math.min(max, preAction + te.amount);
        }
        points.push({ frame: te.frame, value: postAction });
        value = postAction;
        lastFrame = te.frame;
      }

      const endValue = Math.min(max, value + (TOTAL_FRAMES - lastFrame) * chargePerFrame);
      if (endValue !== value && chargePerFrame > 0 && value < max) {
        const framesToMax = Math.ceil((max - value) / chargePerFrame);
        const maxFrame = Math.min(lastFrame + framesToMax, TOTAL_FRAMES);
        if (maxFrame < TOTAL_FRAMES) {
          points.push({ frame: maxFrame, value: max });
        }
      }
      points.push({ frame: TOTAL_FRAMES, value: endValue });

      graphs.set(key, { points, min: 0, max });
    }
    return graphs;
  }, [operators, slotIds, events, resourceConfigs]);

  // ── Merge SP + ultimate graphs ──────────────────────────────────────────
  const resourceGraphs = useMemo(() => {
    const merged = new Map(spGraphs);
    for (const [key, data] of Array.from(ultimateGraphs)) {
      merged.set(key, data);
    }
    return merged;
  }, [spGraphs, ultimateGraphs]);

  return { resourceGraphs };
}
