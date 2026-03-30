/**
 * useCombatState — pairs CombatStateController with useHistory for undo/redo.
 *
 * The controller is a stateless facade; useHistory holds the CombatState snapshots.
 * Handlers call controller methods to produce new state, then pass it through setState.
 */

import { useRef } from 'react';
import { useHistory } from '../utils/useHistory';
import type { CombatState } from '../controller/appStateController';
import { CombatStateController } from '../controller/combatStateController';

export function useCombatState(initial: CombatState) {
  const controllerRef = useRef<CombatStateController>(null!);
  if (controllerRef.current === null) {
    controllerRef.current = new CombatStateController();
  }

  const { state, setState, resetState, beginBatch, endBatch, undo, redo } =
    useHistory<CombatState>(initial);

  return {
    state,
    setState,
    resetState,
    beginBatch,
    endBatch,
    undo,
    redo,
    controller: controllerRef.current,
  };
}
