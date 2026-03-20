import { StatusType } from "../../consts/enums";
import { PhysicalStatus } from "./physicalStatus";

/**
 * Knock Down — physical status triggered when Vulnerable is already active.
 *
 * Mechanically identical to Lift:
 * - Duration: 1 second (fixed)
 * - Max status level: 1
 * - Damage: 120% ATK (physical)
 * - Stagger: 10 × (1 + ArtsIntensity / 200)
 */
export class KnockDown extends PhysicalStatus {
  constructor(params: { isForced?: boolean }) {
    super({
      statusType: StatusType.KNOCK_DOWN,
      statusLevel: 1,
      maxStatusLevel: 1,
      isForced: params.isForced,
    });
  }

  getDurationSeconds(): number {
    return 1;
  }
}
