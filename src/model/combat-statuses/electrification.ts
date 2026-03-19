import { ElementType, StatusType } from "../../consts/enums";
import { StatusLevel } from "../../consts/types";
import { ArtsReaction } from "./artsReaction";

const INITIAL_DAMAGE: Readonly<Record<StatusLevel, number>> = {
  1: 1.6,
  2: 2.4,
  3: 3.2,
  4: 4.0,
};

const EXTRA_ARTS_DAMAGE_TAKEN: Readonly<Record<StatusLevel, number>> = {
  1: 0.12,
  2: 0.16,
  3: 0.20,
  4: 0.24,
};

const DURATION_SECONDS: Readonly<Record<StatusLevel, number>> = {
  1: 12,
  2: 18,
  3: 24,
  4: 30,
};

export class Electrification extends ArtsReaction {
  constructor(params: {
    statusLevel: StatusLevel;
    isForced?: boolean;
  }) {
    super({
      statusType: StatusType.ELECTRIFICATION,
      statusLevel: params.statusLevel,
      maxStatusLevel: 4,
      element: ElementType.ELECTRIC,
      isForced: params.isForced ?? false,
      durationSeconds: DURATION_SECONDS[params.statusLevel],
    });
  }

  getInitialDamage(): number {
    if (this.isForced) return 0;
    return INITIAL_DAMAGE[this.statusLevel];
  }

  getExtraArtsDamageTaken(): number {
    return EXTRA_ARTS_DAMAGE_TAKEN[this.statusLevel];
  }
}
