import { Operator } from '../../consts/viewTypes';
import { NounType } from '../../dsl/semantics';
import type { Slot } from '../timeline/columnBuilder';
import { getWeapon } from '../gameDataStore';
import { CommonSlotController } from '../slot/commonSlotController';
import { getComboTriggerClause, getTeamStatusIds } from '../gameDataStore';
import { TriggerIndex } from '../timeline/triggerIndex';
import type { LoadoutProperties } from '../../view/InformationPane';

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
  private triggerIndex: TriggerIndex | null = null;

  // ── Common (global) slot ────────────────────────────────────────────────
  readonly commonSlot = new CommonSlotController();

  setSlotIds(ids: string[]): void {
    this.slotIds = ids;
  }

  /**
   * Sync the full slot array into the combat context.
   * Rebuilds operator wiring, SP costs, and trigger index.
   */
  syncSlots(slots: Slot[]): void {
    this.cachedSlots = slots;
    this.spCosts.clear();

    const slotOperatorMap: Record<string, string> = {};
    const loadoutProperties: Record<string, LoadoutProperties> = {};
    const slotWeapons: Record<string, string | undefined> = {};
    const slotGearSets: Record<string, string | undefined> = {};
    const slotConsumables: Record<string, string | undefined> = {};
    const slotTacticals: Record<string, string | undefined> = {};

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const op = slot.operator;
      if (!op) {
        this.slots[i] = null;
      } else {
        this.slots[i] = getComboTriggerClause(op.id)
          ? { operatorId: op.id }
          : null;
        this.spCosts.set(slot.slotId, op.skills[NounType.BATTLE]?.skillPointCost ?? 100);
        slotOperatorMap[slot.slotId] = op.id;
      }
      if (slot.loadoutProperties) loadoutProperties[slot.slotId] = slot.loadoutProperties;
      slotWeapons[slot.slotId] = slot.weaponId;
      slotGearSets[slot.slotId] = slot.gearSetType;
      slotConsumables[slot.slotId] = slot.consumableId;
      slotTacticals[slot.slotId] = slot.tacticalId;
    }

    this.triggerIndex = TriggerIndex.build(slotOperatorMap, loadoutProperties, slotWeapons, slotGearSets, undefined, slotConsumables, slotTacticals);
  }

  // ── SP queries ─────────────────────────────────────────────────────────

  hasSufficientSP(ownerEntityId: string, frame: number): boolean {
    const cost = this.spCosts.get(ownerEntityId) ?? 100;
    return this.commonSlot.skillPoints.valueAt(frame) >= cost;
  }

  getSpCost(ownerEntityId: string): number {
    return this.spCosts.get(ownerEntityId) ?? 100;
  }

  getAllSpCosts(): ReadonlyMap<string, number> {
    return this.spCosts;
  }

  // ── Slot queries ───────────────────────────────────────────────────────

  getSlots(): readonly Slot[] {
    return this.cachedSlots;
  }

  // ── Trigger index ────────────────────────────────────────────────────────

  getTriggerIndex(): TriggerIndex | null {
    return this.triggerIndex;
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