import { useEffect, useRef } from 'react';
import { CombatLoadout } from '../controller/combat-loadout';
import { Operator, TimelineEvent } from '../consts/viewTypes';

/** Manages CombatLoadout controller lifecycle and operator syncing. */
export function useCombatLoadout(
  slotIds: string[],
  operators: (Operator | null)[],
  events: TimelineEvent[],
) {
  const combatLoadoutRef = useRef<CombatLoadout>(null!);
  if (combatLoadoutRef.current === null) {
    combatLoadoutRef.current = new CombatLoadout();
    combatLoadoutRef.current.setSlotIds(slotIds);
  }

  // Sync operators into loadout
  useEffect(() => {
    operators.forEach((op, i) => {
      combatLoadoutRef.current.setOperator(i, op);
    });
  }, [operators]);

  // Keep common slot aware of events for SP tracking
  useEffect(() => {
    combatLoadoutRef.current.recomputeWindows(events);
  }, [events]);

  return {
    combatLoadout: combatLoadoutRef.current,
  };
}
