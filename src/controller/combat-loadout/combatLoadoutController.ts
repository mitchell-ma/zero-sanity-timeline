import { Operator } from '../../consts/viewTypes';
import type { Slot } from '../timeline/columnBuilder';
import { getWeapon } from '../gameDataController';
import { CommonSlotController } from '../slot/commonSlotController';
import { getComboTriggerClause, getTeamStatusIds } from '../../model/event-frames/operatorJsonLoader';

const NUM_SLOTS = 4;

interface SlotWiring {
  operatorId: string;
}


export class CombatLoadoutController {
  /**
   * Check if a weapon is compatible with an operator.
   * Returns true if the operator can equip the weapon, false otherwise.
   * Returns true if operator or weapon is null (no constraint to violate).
   */
  static isWeaponCompatible(
    operator: Operator | null,
    weaponId: string | null | undefined,
  ): boolean {
    if (!operator || !weaponId) return true;
    const weapon = getWeapon(weaponId);
    if (!weapon) return true;
    return operator.weaponTypes.includes(weapon.type);
  }

  private slots: (SlotWiring | null)[] = Array(NUM_SLOTS).fill(null);
  private slotIds: string[] = [];
  private cachedSlots: Slot[] = [];
  private spCosts: Map<string, number> = new Map();

  // ── Common (global) slot ────────────────────────────────────────────────
  readonly commonSlot = new CommonSlotController();

  setSlotIds(ids: string[]): void {
    this.slotIds = ids;
  }

  /**
   * Sync the full slot array into the combat context.
   * Rebuilds operator wiring and SP costs.
   */
  syncSlots(slots: Slot[]): void {
    this.cachedSlots = slots;
    this.spCosts.clear();
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const op = slot.operator;
      if (!op) {
        this.slots[i] = null;
      } else {
        this.slots[i] = getComboTriggerClause(op.id)
          ? { operatorId: op.id }
          : null;
        this.spCosts.set(slot.slotId, op.skills.battle.skillPointCost ?? 100);
      }
    }
  }

  // ── SP queries ─────────────────────────────────────────────────────────

  hasSufficientSP(ownerId: string, frame: number): boolean {
    const cost = this.spCosts.get(ownerId) ?? 100;
    return this.commonSlot.skillPoints.valueAt(frame) >= cost;
  }

  getSpCost(ownerId: string): number {
    return this.spCosts.get(ownerId) ?? 100;
  }

  getAllSpCosts(): ReadonlyMap<string, number> {
    return this.spCosts;
  }

  // ── Slot queries ───────────────────────────────────────────────────────

  getSlots(): readonly Slot[] {
    return this.cachedSlots;
  }

  // ── Team status queries ─────────────────────────────────────────────────

  /**
   * Get the set of team-targeted status IDs derived from the current team's skill configs.
   * Scans all operators' skills for clause effects with "to": "TEAM".
   */
  getTeamStatusIds(): Set<string> {
    const ids = new Set<string>();
    for (const slot of this.cachedSlots) {
      if (!slot.operator) continue;
      for (const id of getTeamStatusIds(slot.operator.id)) ids.add(id);
    }
    return ids;
  }

}