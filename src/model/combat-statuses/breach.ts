import { StatusType } from "../../consts/enums";
import { StatusLevel } from "../../consts/types";
import { PhysicalStatus } from "./physicalStatus";

/**
 * Breach — physical status triggered by consuming Vulnerable stacks.
 *
 * Stacks consumed | Initial DMG multiplier | Increased Physical DMG taken | Duration
 * 1               | 100%                   | 11%                          | 12s
 * 2               | 150%                   | 14%                          | 18s
 * 3               | 200%                   | 17%                          | 24s
 * 4               | 250%                   | 20%                          | 30s
 */

const INITIAL_DAMAGE: Readonly<Record<StatusLevel, number>> = {
  1: 1.0,
  2: 1.5,
  3: 2.0,
  4: 2.5,
};

const PHYSICAL_DMG_TAKEN: Readonly<Record<StatusLevel, number>> = {
  1: 0.11,
  2: 0.14,
  3: 0.17,
  4: 0.20,
};

const DURATION_SECONDS: Readonly<Record<StatusLevel, number>> = {
  1: 12,
  2: 18,
  3: 24,
  4: 30,
};

export class Breach extends PhysicalStatus {
  constructor(params: { statusLevel: StatusLevel }) {
    super({
      statusType: StatusType.BREACH,
      statusLevel: params.statusLevel,
      maxStatusLevel: 4,
    });
  }

  getInitialDamage(): number {
    return INITIAL_DAMAGE[this.statusLevel];
  }

  getPhysicalDmgTaken(): number {
    return PHYSICAL_DMG_TAKEN[this.statusLevel];
  }

  getDurationSeconds(): number {
    return DURATION_SECONDS[this.statusLevel];
  }
}
