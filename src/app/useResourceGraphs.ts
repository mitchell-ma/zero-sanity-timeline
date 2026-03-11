import { useState, useEffect, useMemo } from 'react';
import { Operator, TimelineEvent, ResourceConfig } from '../consts/viewTypes';
import { ResourcePoint } from '../controller/timeline/resourceTimeline';
import { CombatLoadout } from '../controller/combat-loadout';
import { COMMON_OWNER_ID, COMMON_COLUMN_IDS } from '../controller/slot/commonSlotController';
import { TOTAL_FRAMES, FPS, absoluteGameFrame } from '../utils/timeline';
import { generateTacticalEvents } from '../controller/events/tacticalEventGenerator';

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

  // ── Ultimate energy graphs + tactical events ────────────────────────────
  const { ultimateGraphs, tacticalEvents } = useMemo(() => {
    const graphs = new Map<string, ResourceGraphData>();
    const allTacticalEvents: TimelineEvent[] = [];

    // Collect gauge gain events: battle/combo skills that affect ultimate charge
    // Gauge gain is tied to the first frame of the first segment; fall back to event-level for legacy data
    type GaugeEvent = { frame: number; selfSlotId: string; gaugeGain: number; teamGaugeGain: number; timeStopAdjust: number };
    const gaugeEvents: GaugeEvent[] = [];
    for (const ev of events) {
      if (ev.columnId !== 'battle' && ev.columnId !== 'combo') continue;
      // Read gauge gain from first frame of first segment if available
      const firstFrame = ev.segments?.[0]?.frames?.[0];
      const selfGain = firstFrame?.gaugeGain ?? ev.gaugeGain ?? 0;
      const teamGain = firstFrame?.teamGaugeGain ?? ev.teamGaugeGain ?? 0;
      if (selfGain > 0 || teamGain > 0) {
        const frameOffset = firstFrame?.offsetFrame ?? 0;
        // During time stops, game-time is frozen — clamp offsets within the
        // animation window to startFrame.
        const anim = ev.animationDuration ?? 0;
        const gameFrame = absoluteGameFrame(ev.startFrame, frameOffset, ev.animationDuration);
        // Combo events with time stops: EventBlock renders diamonds using ownZones
        // (excluding the event's own time-stop insertion). The diamond is at
        // frameToPxDilated(S+F, ownZones) = A + F*ppf, but the graph point at
        // gameFrame=S has frameToPxDilated(S, fullZones) = A (zone not yet added).
        // Add F*ppf to bridge the gap. For hits after the time stop (F > D),
        // gameFrame already includes the offset, and fullZones adds the insertion,
        // so no adjustment is needed.
        const isOwnTimeStop = ev.columnId === 'combo' && anim > 0;
        const timeStopAdjust = isOwnTimeStop && frameOffset <= anim ? frameOffset : 0;
        gaugeEvents.push({
          frame: gameFrame,
          selfSlotId: ev.ownerId,
          gaugeGain: selfGain,
          teamGaugeGain: teamGain,
          timeStopAdjust,
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
      type UltEvent = { frame: number; type: 'consume' | 'gain'; amount: number; timeStopAdjust?: number };
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
          timeline.push({ frame: ge.frame, type: 'gain', amount: gain, timeStopAdjust: ge.timeStopAdjust || undefined });
        }
      }

      timeline.sort((a, b) => a.frame - b.frame || (a.type === 'gain' ? -1 : 1));

      // Generate tactical events (iteratively inserts gauge gains)
      const tacticalName = tacticalNames?.[slotId];
      if (tacticalName) {
        const result = generateTacticalEvents(
          slotId, tacticalName, max, timeline, chargePerFrame, startValue,
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
            points.push({ frame: te.frame, value: preAction, timeStopAdjust: te.timeStopAdjust });
          }
        }

        let postAction: number;
        if (te.type === 'consume') {
          postAction = Math.max(0, preAction - te.amount);
        } else {
          postAction = Math.min(max, preAction + te.amount);
        }
        points.push({ frame: te.frame, value: postAction, timeStopAdjust: te.timeStopAdjust });
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
  }, [operators, slotIds, events, resourceConfigs, tacticalNames]);

  // ── Merge SP + ultimate graphs ──────────────────────────────────────────
  const resourceGraphs = useMemo(() => {
    const merged = new Map(spGraphs);
    for (const [key, data] of Array.from(ultimateGraphs)) {
      merged.set(key, data);
    }
    return merged;
  }, [spGraphs, ultimateGraphs]);

  return { resourceGraphs, tacticalEvents };
}
