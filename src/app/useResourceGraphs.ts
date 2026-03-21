import { useState, useEffect, useMemo } from 'react';
import { Operator, TimelineEvent, ResourceConfig } from '../consts/viewTypes';
import { SKILL_COLUMNS } from '../model/channels';
import { ResourcePoint } from '../controller/timeline/resourceTimeline';
import { CombatLoadoutController } from '../controller/combat-loadout';
import { COMMON_OWNER_ID, COMMON_COLUMN_IDS } from '../controller/slot/commonSlotController';
import { FPS } from '../utils/timeline';
import { generateTacticalEvents } from '../controller/events/tacticalEventGenerator';
import { computeUltimateEnergyGraph, UltEnergyEvent } from '../controller/timeline/ultimateEnergyTimeline';
import { collectRawGaugeGains, applyGainEfficiency, collectNoGainWindows } from '../controller/timeline/ultimateEnergyController';

export type ResourceGraphData = {
  points: ReadonlyArray<ResourcePoint>;
  min: number;
  max: number;
  /** Total resource wasted due to overflow (gains/regen exceeding max). */
  wasted?: number;
};

/** Computes and merges SP + ultimate energy resource graphs. */
export function useResourceGraphs(
  operators: (Operator | null)[],
  slotIds: string[],
  events: TimelineEvent[],
  combatLoadout: CombatLoadoutController,
  resourceConfigs?: Record<string, ResourceConfig>,
  tacticalNames?: Record<string, string | undefined>,
  tacticalMaxUsesOverrides?: Record<string, number | undefined>,
  gaugeGainMultipliers?: Record<string, number>,
) {
  // ── Skill point graphs (from CommonSlot resource timeline) ──────────────
  const [spGraphs, setSpGraphs] = useState<Map<string, ResourceGraphData>>(new Map());

  useEffect(() => {
    const spCtrl = combatLoadout.commonSlot.skillPoints;
    const key = `${COMMON_OWNER_ID}-${COMMON_COLUMN_IDS.SKILL_POINTS}`;
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

  // ── Ultimate energy graphs + tactical events ────────────────────────────
  const { ultimateGraphs, tacticalEvents } = useMemo(() => {
    const graphs = new Map<string, ResourceGraphData>();
    const allTacticalEvents: TimelineEvent[] = [];

    // Collect raw gauge gain events from battle/combo skill first frames
    const gaugeEvents = collectRawGaugeGains(events);

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
      const timeline: UltEnergyEvent[] = [];

      // Ultimate activations consume the full gauge
      for (const ev of events) {
        if (ev.ownerId === slotId && ev.columnId === SKILL_COLUMNS.ULTIMATE) {
          timeline.push({ frame: ev.startFrame, type: 'consume', amount: max });
        }
      }

      const ultActiveWindows = collectNoGainWindows(events, slotId);

      // Gauge gains from skills (self + team), scaled by ultimate gain efficiency
      const efficiencyBonus = gaugeGainMultipliers?.[slotId] ?? 0;
      const gains = applyGainEfficiency(gaugeEvents, slotId, efficiencyBonus, ultActiveWindows);
      timeline.push(...gains);

      timeline.sort((a, b) => a.frame - b.frame || (a.type === 'gain' ? -1 : 1));

      // Generate tactical events (iteratively inserts gauge gains)
      const tacticalName = tacticalNames?.[slotId];
      if (tacticalName) {
        const result = generateTacticalEvents(
          slotId, tacticalName, max, timeline, chargePerFrame, startValue,
          tacticalMaxUsesOverrides?.[slotId],
        );
        if (result) {
          allTacticalEvents.push(...result.events);
          // Inject tactical gauge gains into the timeline for graph computation
          for (const g of result.gaugeGains) {
            timeline.push({ frame: g.frame, type: 'gain', amount: g.amount });
          }
          timeline.sort((a, b) => a.frame - b.frame || (a.type === 'gain' ? -1 : 1));
        }
      }

      // Compute the ult energy graph (now including tactical gains)
      const result = computeUltimateEnergyGraph(timeline, max, startValue, chargePerFrame);
      graphs.set(key, { points: result.points, min: 0, max, wasted: result.wastedCharge });
    }
    return { ultimateGraphs: graphs, tacticalEvents: allTacticalEvents };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operators, slotIds, events, resourceConfigs, tacticalNames, tacticalMaxUsesOverrides, gaugeGainMultipliers]);

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

  return { resourceGraphs, tacticalEvents };
}
