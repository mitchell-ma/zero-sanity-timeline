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
    stacks: StatusLevel;
    isForced?: boolean;
  }) {
    super({
      statusType: StatusType.SOLIDIFICATION,
      stacks: params.stacks,
      maxStacks: 4,
      element: ElementType.CRYO,
      isForced: params.isForced ?? false,
      durationSeconds: DURATION_SECONDS[params.stacks],
    });
  }

  getInitialDamage(): number {
    if (this.isForced) return 0;
    return INITIAL_DAMAGE[this.stacks];
  }

  getShatterDamage(): number {
    return SHATTER_DAMAGE[this.stacks];
  }
}
