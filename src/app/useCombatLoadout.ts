import { useRef } from 'react';
import { CombatLoadoutController } from '../controller/combat-loadout';
import type { Slot } from '../controller/timeline/columnBuilder';

/** Manages CombatLoadout controller lifecycle and slot syncing. */
export function useCombatLoadout(
  slotIds: string[],
  slots: Slot[],
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

  return {
    combatLoadout: combatLoadoutRef.current,
  };
}
