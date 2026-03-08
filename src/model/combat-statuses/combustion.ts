import { ElementType, StatusType } from "../../consts/enums";
import { StatusLevel } from "../../consts/types";
import { ArtsReaction } from "./artsReaction";

const INITIAL_DAMAGE: Readonly<Record<StatusLevel, number>> = {
  1: 1.6,
  2: 2.4,
  3: 3.2,
  4: 4.0,
};

const DAMAGE_OVER_TIME: Readonly<Record<StatusLevel, number>> = {
  1: 0.24,
  2: 0.36,
  3: 0.48,
  4: 0.60,
};

const TOTAL_DAMAGE: Readonly<Record<StatusLevel, number>> = {
  1: 4.0,
  2: 6.0,
  3: 8.0,
  4: 10.0,
};

export class Combustion extends ArtsReaction {
  static readonly DURATION_SECONDS = 10;
  static readonly TICKS_PER_SECOND = 1;

  constructor(params: {
    statusLevel: StatusLevel;
    isForceApplied?: boolean;
  }) {
    super({
      statusType: StatusType.COMBUSTION,
      statusLevel: params.statusLevel,
      maxStatusLevel: 4,
      element: ElementType.HEAT,
      isForceApplied: params.isForceApplied ?? false,
      durationSeconds: Combustion.DURATION_SECONDS,
    });
  }

  getInitialDamage(): number {
    return INITIAL_DAMAGE[this.statusLevel];
  }

  getDamageOverTime(): number {
    return DAMAGE_OVER_TIME[this.statusLevel];
  }

  getTotalDamage(): number {
    return TOTAL_DAMAGE[this.statusLevel];
  }
}
