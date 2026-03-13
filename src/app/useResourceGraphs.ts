import { useState, useEffect, useMemo } from 'react';
import { Operator, TimelineEvent, ResourceConfig } from '../consts/viewTypes';
import { ResourcePoint } from '../controller/timeline/resourceTimeline';
import { CombatLoadout } from '../controller/combat-loadout';
import { COMMON_OWNER_ID, COMMON_COLUMN_IDS } from '../controller/slot/commonSlotController';
import { TOTAL_FRAMES, FPS } from '../utils/timeline';
import { generateTacticalEvents } from '../controller/events/tacticalEventGenerator';
import { getUltimateActiveWindow } from '../controller/timeline/eventValidator';

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
  tacticalNames?: Record<string, string | undefined>,
  tacticalMaxUsesOverrides?: Record<string, number | undefined>,
  gaugeGainMultipliers?: Record<string, number>,
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

    // Collect gauge gain events: battle/combo skills that affect ultimate charge
    // Scan all segment frames for gaugeGain; fall back to event-level for legacy data
    type GaugeEvent = { frame: number; selfSlotId: string; gaugeGain: number; teamGaugeGain: number };
    const gaugeEvents: GaugeEvent[] = [];
    for (const ev of events) {
      if (ev.columnId !== 'battle' && ev.columnId !== 'combo') continue;
      // If the event has gaugeGainByEnemies, prefer the event-level gaugeGain
      // which is updated when the user changes the "enemies hit" selection.
      const firstFrame = ev.segments?.[0]?.frames?.[0];
      if (ev.gaugeGainByEnemies) {
        const selfGain = ev.gaugeGain ?? firstFrame?.gaugeGain ?? 0;
        const teamGain = firstFrame?.teamGaugeGain ?? ev.teamGaugeGain ?? 0;
        if (selfGain > 0 || teamGain > 0) {
          gaugeEvents.push({
            frame: firstFrame?.absoluteFrame ?? ev.startFrame,
            selfSlotId: ev.ownerId,
            gaugeGain: selfGain,
            teamGaugeGain: teamGain,
          });
        }
      } else {
        // Scan all frames across all segments for gauge gain
        let found = false;
        for (const seg of ev.segments ?? []) {
          for (const f of seg.frames ?? []) {
            const selfGain = f.gaugeGain ?? 0;
            const teamGain = f.teamGaugeGain ?? 0;
            if (selfGain > 0 || teamGain > 0) {
              found = true;
              gaugeEvents.push({
                frame: f.absoluteFrame ?? ev.startFrame,
                selfSlotId: ev.ownerId,
                gaugeGain: selfGain,
                teamGaugeGain: teamGain,
              });
            }
          }
        }
        // Fall back to event-level gauge gain if no frame-level data
        if (!found) {
          const selfGain = ev.gaugeGain ?? 0;
          const teamGain = ev.teamGaugeGain ?? 0;
          if (selfGain > 0 || teamGain > 0) {
            gaugeEvents.push({
              frame: ev.startFrame,
              selfSlotId: ev.ownerId,
              gaugeGain: selfGain,
              teamGaugeGain: teamGain,
            });
          }
        }
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

      // Collect active-phase windows for this slot's ultimates
      // During the active phase, ultimate charge cannot be gained
      const ultActiveWindows: { start: number; end: number }[] = [];
      for (const ev of events) {
        if (ev.ownerId === slotId && ev.columnId === 'ultimate') {
          const w = getUltimateActiveWindow(ev);
          if (w) ultActiveWindows.push(w);
        }
      }

      // Gauge gains from skills (self + team), scaled by ultimate gain efficiency
      const multiplier = 1 + (gaugeGainMultipliers?.[slotId] ?? 0);
      for (const ge of gaugeEvents) {
        // Skip gauge gains during ultimate active phase
        if (ultActiveWindows.some(w => ge.frame >= w.start && ge.frame < w.end)) continue;
        const rawGain = (ge.selfSlotId === slotId ? ge.gaugeGain : 0) + ge.teamGaugeGain;
        if (rawGain > 0) {
          const gain = rawGain * multiplier;
          timeline.push({ frame: ge.frame, type: 'gain', amount: gain });
        }
      }

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
    return { ultimateGraphs: graphs, tacticalEvents: allTacticalEvents };
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
