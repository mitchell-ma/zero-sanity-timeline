import { ElementType, StatusType } from "../../consts/enums";
import { StatusLevel } from "../../consts/types";
import { ArtsReaction } from "./artsReaction";

const INITIAL_DAMAGE: Readonly<Record<StatusLevel, number>> = {
  1: 1.6,
  2: 2.4,
  3: 3.2,
  4: 4.0,
};

const DURATION_SECONDS: Readonly<Record<StatusLevel, number>> = {
  1: 6,
  2: 7,
  3: 8,
  4: 9,
};

const SHATTER_DAMAGE: Readonly<Record<StatusLevel, number>> = {
  1: 2.4,
  2: 3.6,
  3: 4.8,
  4: 6.0,
};

export class Solidification extends ArtsReaction {
  constructor(params: {
    statusLevel: StatusLevel;
    isForceApplied?: boolean;
  }) {
    super({
      statusType: StatusType.SOLIDIFICATION,
      statusLevel: params.statusLevel,
      maxStatusLevel: 4,
      element: ElementType.CRYO,
      isForceApplied: params.isForceApplied ?? false,
      durationSeconds: DURATION_SECONDS[params.statusLevel],
    });
  }

  getInitialDamage(): number {
    if (this.isForceApplied) return 0;
    return INITIAL_DAMAGE[this.statusLevel];
  }

  getShatterDamage(): number {
    return SHATTER_DAMAGE[this.statusLevel];
  }
}
