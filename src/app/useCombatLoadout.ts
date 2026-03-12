import { useEffect, useRef } from 'react';
import { CombatLoadout } from '../controller/combat-loadout';
import { TimelineEvent } from '../consts/viewTypes';
import type { Slot } from '../controller/timeline/columnBuilder';

/** Manages CombatLoadout controller lifecycle and slot syncing. */
export function useCombatLoadout(
  slotIds: string[],
  slots: Slot[],
  events: TimelineEvent[],
) {
  const combatLoadoutRef = useRef<CombatLoadout>(null!);
  if (combatLoadoutRef.current === null) {
    combatLoadoutRef.current = new CombatLoadout();
    combatLoadoutRef.current.setSlotIds(slotIds);
  }

  // Sync slots (operators + SP costs + trigger wiring)
  useEffect(() => {
    combatLoadoutRef.current.syncSlots(slots);
  }, [slots]);

  // Recompute combo windows when events change
  useEffect(() => {
    combatLoadoutRef.current.recomputeWindows(events);
  }, [events]);

  return {
    combatLoadout: combatLoadoutRef.current,
  };
}
