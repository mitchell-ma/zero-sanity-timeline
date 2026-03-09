import { useState, useEffect, useRef } from 'react';
import { CombatLoadout, WindowsMap } from '../controller/combat-loadout';
import { Operator, TimelineEvent } from '../consts/viewTypes';

/** Manages CombatLoadout controller lifecycle, operator syncing, and activation window computation. */
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

  const [activationWindows, setActivationWindows] = useState<WindowsMap>(new Map());
  const activationWindowsRef = useRef<WindowsMap>(activationWindows);
  activationWindowsRef.current = activationWindows;

  // Subscribe to window changes
  useEffect(() => {
    return combatLoadoutRef.current.subscribe(setActivationWindows);
  }, []);

  // Sync operators into loadout
  useEffect(() => {
    operators.forEach((op, i) => {
      combatLoadoutRef.current.setOperator(i, op?.id ?? null);
    });
  }, [operators]);

  // Recompute windows when events change
  useEffect(() => {
    combatLoadoutRef.current.recomputeWindows(events);
  }, [events]);

  return {
    activationWindows,
    activationWindowsRef,
    combatLoadout: combatLoadoutRef.current,
  };
}
