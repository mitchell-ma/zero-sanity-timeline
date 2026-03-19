import { ElementType, StatusType } from "../../consts/enums";
import { StatusLevel } from "../../consts/types";
import { ArtsReaction } from "./artsReaction";

const INITIAL_DAMAGE: Readonly<Record<StatusLevel, number>> = {
  1: 1.6,
  2: 2.4,
  3: 3.2,
  4: 4.0,
};

const INITIAL_REDUCTION: Readonly<Record<StatusLevel, number>> = {
  1: 3.6,
  2: 4.8,
  3: 6.0,
  4: 7.2,
};

const MAXIMUM_REDUCTION: Readonly<Record<StatusLevel, number>> = {
  1: 12,
  2: 16,
  3: 20,
  4: 24,
};

export class Corrosion extends ArtsReaction {
  static readonly DURATION_SECONDS = 15;
  static readonly DURATION_UNTIL_FULL_EFFECT_SECONDS = 10;

  constructor(params: {
    statusLevel: StatusLevel;
    isForced?: boolean;
  }) {
    super({
      statusType: StatusType.CORROSION,
      statusLevel: params.statusLevel,
      maxStatusLevel: 4,
      element: ElementType.NATURE,
      isForced: params.isForced ?? false,
      durationSeconds: Corrosion.DURATION_SECONDS,
    });
  }

  getInitialDamage(): number {
    if (this.isForced) return 0;
    return INITIAL_DAMAGE[this.statusLevel];
  }

  getInitialReduction(): number {
    return INITIAL_REDUCTION[this.statusLevel];
  }

  getMaximumReduction(): number {
    return MAXIMUM_REDUCTION[this.statusLevel];
  }
}
