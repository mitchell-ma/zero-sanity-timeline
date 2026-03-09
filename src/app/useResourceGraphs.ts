import { useState, useEffect, useMemo } from 'react';
import { Operator, TimelineEvent } from '../consts/viewTypes';
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
    const ULT_CHARGE_PER_FRAME = 10 / FPS;
    const graphs = new Map<string, ResourceGraphData>();

    for (let i = 0; i < slotIds.length; i++) {
      const op = operators[i];
      if (!op) continue;
      const slotId = slotIds[i];
      const key = `${slotId}-ultimate`;
      const max = op.ultimateEnergyCost;
      const ultEvents = events
        .filter((ev) => ev.ownerId === slotId && ev.columnId === 'ultimate')
        .sort((a, b) => a.startFrame - b.startFrame);

      const points: ResourcePoint[] = [];
      let value = 0;
      let lastFrame = 0;
      points.push({ frame: 0, value });

      for (const ev of ultEvents) {
        const regenFrames = ev.startFrame - lastFrame;
        const preConsume = Math.min(max, value + regenFrames * ULT_CHARGE_PER_FRAME);

        if (preConsume !== value || ev.startFrame !== lastFrame) {
          if (preConsume !== points[points.length - 1].value || ev.startFrame !== points[points.length - 1].frame) {
            points.push({ frame: ev.startFrame, value: preConsume });
          }
        }

        const postConsume = Math.max(0, preConsume - max);
        points.push({ frame: ev.startFrame, value: postConsume });
        value = postConsume;
        lastFrame = ev.startFrame;
      }

      const endValue = Math.min(max, value + (TOTAL_FRAMES - lastFrame) * ULT_CHARGE_PER_FRAME);
      if (endValue !== value && ULT_CHARGE_PER_FRAME > 0 && value < max) {
        const framesToMax = Math.ceil((max - value) / ULT_CHARGE_PER_FRAME);
        const maxFrame = Math.min(lastFrame + framesToMax, TOTAL_FRAMES);
        if (maxFrame < TOTAL_FRAMES) {
          points.push({ frame: maxFrame, value: max });
        }
      }
      points.push({ frame: TOTAL_FRAMES, value: endValue });

      graphs.set(key, { points, min: 0, max });
    }
    return graphs;
  }, [operators, slotIds, events]);

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
