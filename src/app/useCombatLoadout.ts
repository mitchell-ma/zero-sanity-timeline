import { useRef } from 'react';
import { CombatLoadoutController } from '../controller/combat-loadout';
import { TimelineEvent } from '../consts/viewTypes';
import type { Slot } from '../controller/timeline/columnBuilder';

/** Manages CombatLoadout controller lifecycle and slot syncing. */
export function useCombatLoadout(
  slotIds: string[],
  slots: Slot[],
  events: TimelineEvent[],
) {
  const combatLoadoutRef = useRef<CombatLoadoutController>(null!);
  if (combatLoadoutRef.current === null) {
    combatLoadoutRef.current = new CombatLoadoutController();
    combatLoadoutRef.current.setSlotIds(slotIds);
  }

  // Sync slots synchronously so SP costs are available when processedEvents
  // useMemo reads getAllSpCosts() during the same render cycle.
  const prevSlotsRef = useRef<Slot[]>(null!);
  if (prevSlotsRef.current !== slots) {
    prevSlotsRef.current = slots;
    combatLoadoutRef.current.syncSlots(slots);
  }

  // Recompute combo windows synchronously for the same reason.
  const prevEventsRef = useRef<TimelineEvent[]>(null!);
  if (prevEventsRef.current !== events) {
    prevEventsRef.current = events;
    combatLoadoutRef.current.recomputeWindows(events);
  }

  return {
    combatLoadout: combatLoadoutRef.current,
  };
}
