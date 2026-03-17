import { useState, useEffect, useMemo } from 'react';
import { Operator, TimelineEvent, ResourceConfig } from '../consts/viewTypes';
import { SKILL_COLUMNS } from '../model/channels';
import { ResourcePoint } from '../controller/timeline/resourceTimeline';
import { CombatLoadout } from '../controller/combat-loadout';
import { COMMON_OWNER_ID, COMMON_COLUMN_IDS } from '../controller/slot/commonSlotController';
import { FPS } from '../utils/timeline';
import { generateTacticalEvents } from '../controller/events/tacticalEventGenerator';
import { getUltimateActiveWindow } from '../controller/timeline/eventValidator';
import { computeUltimateEnergyGraph, UltEnergyEvent } from '../controller/timeline/ultimateEnergyTimeline';
import { collectRawGaugeGains, applyGainEfficiency } from '../controller/timeline/ultimateEnergyController';

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
  combatLoadout: CombatLoadout,
  resourceConfigs?: Record<string, ResourceConfig>,
  tacticalNames?: Record<string, string | undefined>,
  tacticalMaxUsesOverrides?: Record<string, number | undefined>,
  gaugeGainMultipliers?: Record<string, number>,
) {
  // ── Skill point graphs (from CommonSlot resource timeline) ──────────────
  const [spGraphs, setSpGraphs] = useState<Map<string, ResourceGraphData>>(new Map());
  // Track consumption log version to trigger re-memo of ultimate graphs
  const [consumptionVersion, setConsumptionLogVersion] = useState(0);

  useEffect(() => {
    const sp = combatLoadout.commonSlot.skillPoints;
    const key = `${COMMON_OWNER_ID}-${COMMON_COLUMN_IDS.SKILL_POINTS}`;
    const update = (points: ReadonlyArray<ResourcePoint>) => {
      setSpGraphs((prev) => {
        const next = new Map(prev);
        next.set(key, { points, min: sp.min, max: sp.max, wasted: sp.wastedSP });
        return next;
      });
      // Bump version so ultimate graphs re-derive from updated consumption log
      setConsumptionLogVersion((v) => v + 1);
    };
    update(sp.getGraph());
    return sp.onGraphChange(update);
  }, [combatLoadout]);

  // ── Stagger graphs (from CommonSlot stagger timeline) ──────────────────
  const [staggerGraphs, setStaggerGraphs] = useState<Map<string, ResourceGraphData>>(new Map());

  useEffect(() => {
    const st = combatLoadout.commonSlot.stagger;
    const key = `enemy-${COMMON_COLUMN_IDS.STAGGER}`;
    const update = (points: ReadonlyArray<ResourcePoint>) => {
      setStaggerGraphs((prev) => {
        const next = new Map(prev);
        next.set(key, { points, min: st.min, max: st.max });
        return next;
      });
    };
    update(st.getGraph());
    return st.onGraphChange(update);
  }, [combatLoadout]);

  // ── Ultimate energy graphs + tactical events ────────────────────────────
  const { ultimateGraphs, tacticalEvents } = useMemo(() => {
    const graphs = new Map<string, ResourceGraphData>();
    const allTacticalEvents: TimelineEvent[] = [];

    // Collect raw gauge gain events from battle/combo skill first frames
    const consumptionHistory = combatLoadout.commonSlot.skillPoints.consumptionHistory ?? [];
    const gaugeEvents = collectRawGaugeGains(events, consumptionHistory);

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

      // Collect active-phase windows for this slot's ultimates
      // During the active phase, ultimate charge cannot be gained
      const ultActiveWindows: { start: number; end: number }[] = [];
      for (const ev of events) {
        if (ev.ownerId === slotId && ev.columnId === SKILL_COLUMNS.ULTIMATE) {
          const w = getUltimateActiveWindow(ev);
          if (w) ultActiveWindows.push(w);
        }
      }

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
  }, [operators, slotIds, events, resourceConfigs, tacticalNames, tacticalMaxUsesOverrides, gaugeGainMultipliers, consumptionVersion]);

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
