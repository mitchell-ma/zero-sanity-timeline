import { StatusType } from "../../consts/enums";
import { PhysicalStatus } from "./physicalStatus";

/**
 * Lift — physical status triggered when Vulnerable is already active.
 *
 * - Duration: 1 second (fixed)
 * - Max status level: 1
 * - Damage: 120% ATK (physical)
 * - Stagger: 10 × (1 + ArtsIntensity / 200)
 *
 * The actual Lift mechanic is hardcoded in the engine (eventInterpretor):
 * APPLY LIFT STATUS (PHYSICAL) → if enemy has Vulnerable or isForced,
 * add 1 Vulnerable stack + create Lift status with damage + stagger.
 * Otherwise just add 1 Vulnerable stack.
 */

const DURATION_SECONDS = 1;
const DAMAGE_MULTIPLIER = 1.2;
const BASE_STAGGER = 10;

export class Lift extends PhysicalStatus {
  constructor(params: { isForced?: boolean }) {
    super({
      statusType: StatusType.LIFT,
      stacks: 1,
      maxStacks: 1,
      isForced: params.isForced,
    });
  }

  getDurationSeconds(): number {
    return DURATION_SECONDS;
  }

  getDamageMultiplier(): number {
    return DAMAGE_MULTIPLIER;
  }

  getStagger(artsIntensity: number): number {
    return BASE_STAGGER * (1 + artsIntensity / 200);
  }
}
