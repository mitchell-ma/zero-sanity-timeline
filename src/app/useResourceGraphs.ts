import { useState, useEffect, useMemo } from 'react';
import { Operator, TimelineEvent, ResourceConfig } from '../consts/viewTypes';
import { ResourcePoint } from '../controller/timeline/resourceTimeline';
import { CombatLoadoutController } from '../controller/combat-loadout';
import { TEAM_ID, COMMON_COLUMN_IDS } from '../controller/slot/commonSlotController';
import { getUltimateEnergyCost } from '../controller/operators/operatorRegistry';
import { ultimateGraphKey } from '../model/channels';


export type ResourceGraphData = {
  points: ReadonlyArray<ResourcePoint>;
  min: number;
  max: number;
  /** Total resource wasted due to overflow (gains/regen exceeding max). */
  wasted?: number;
};

/** Computes and merges SP + stagger + ultimate energy resource graphs. */
export function useResourceGraphs(
  operators: (Operator | null)[],
  slotIds: string[],
  events: TimelineEvent[],
  combatLoadout: CombatLoadoutController,
  resourceConfigs?: Record<string, ResourceConfig>,
) {
  // ── Skill point graphs (from CommonSlot resource timeline) ──────────────
  const [spGraphs, setSpGraphs] = useState<Map<string, ResourceGraphData>>(new Map());

  useEffect(() => {
    const spCtrl = combatLoadout.commonSlot.skillPoints;
    const key = `${TEAM_ID}-${COMMON_COLUMN_IDS.SKILL_POINTS}`;
    const update = (points: ReadonlyArray<ResourcePoint>) => {
      setSpGraphs((prev) => {
        const next = new Map(prev);
        next.set(key, { points, min: spCtrl.min, max: spCtrl.max, wasted: spCtrl.wastedSP });
        return next;
      });
    };
    update(spCtrl.getGraph());
    return spCtrl.onGraphChange(update);
  }, [combatLoadout]);

  // ── Stagger graphs (from CommonSlot stagger timeline) ──────────────────
  const [staggerGraphs, setStaggerGraphs] = useState<Map<string, ResourceGraphData>>(new Map());

  useEffect(() => {
    const stCtrl = combatLoadout.commonSlot.stagger;
    const key = `enemy-${COMMON_COLUMN_IDS.STAGGER}`;
    const update = (points: ReadonlyArray<ResourcePoint>) => {
      setStaggerGraphs((prev) => {
        const next = new Map(prev);
        next.set(key, { points, min: stCtrl.min, max: stCtrl.max });
        return next;
      });
    };
    update(stCtrl.getGraph());
    return stCtrl.onGraphChange(update);
  }, [combatLoadout]);

  // ── Ultimate energy graphs ──────────────────────────────────────────────
  // UE graphs are computed inside processCombatSimulation via UltimateEnergyController.
  const ultimateGraphs = useMemo(() => {
    const ueCtrl = combatLoadout.commonSlot.ultimateEnergy;
    const graphs = new Map<string, ResourceGraphData>();

    for (let i = 0; i < slotIds.length; i++) {
      const op = operators[i];
      if (!op) continue;
      const slotId = slotIds[i];
      const key = ultimateGraphKey(slotId);
      const cfg = resourceConfigs?.[key];
      const max = cfg?.max ?? getUltimateEnergyCost(op.id);

      const result = ueCtrl.getGraph(slotId);
      if (result) {
        graphs.set(key, { points: result.points, min: 0, max, wasted: result.wastedCharge });
      }
    }
    return graphs;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operators, slotIds, events, resourceConfigs, combatLoadout]);

  // ── Merge SP + stagger + ultimate graphs ───────────────────────────────
  const resourceGraphs = useMemo(() => {
    const merged = new Map(spGraphs);
    for (const [key, data] of Array.from(staggerGraphs)) {
      merged.set(key, data);
    }
    for (const [key, data] of Array.from(ultimateGraphs)) {
      merged.set(key, data);
    }
    return merged;
  }, [spGraphs, staggerGraphs, ultimateGraphs]);

  return { resourceGraphs };
}
