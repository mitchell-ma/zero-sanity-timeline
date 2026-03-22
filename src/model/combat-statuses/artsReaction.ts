import { ElementType, StatusType, ArtsReactionType } from "../../consts/enums";
import { StatusLevel } from "../../consts/types";
import { Reaction } from "./reaction";

const ARTS_REACTION_TYPES = new Set<string>(Object.values(ArtsReactionType));

export abstract class ArtsReaction extends Reaction {
  readonly element: ElementType;
  readonly durationSeconds: number;

  constructor(params: {
    statusType: StatusType;
    stacks: StatusLevel;
    maxStacks: StatusLevel;
    element: ElementType;
    isForced?: boolean;
    durationSeconds: number;
  }) {
    if (!ARTS_REACTION_TYPES.has(params.statusType)) {
      throw new Error(
        `${params.statusType} is not an arts reaction status type`,
      );
    }
    super({ ...params, isForced: params.isForced });
    this.element = params.element;
    this.durationSeconds = params.durationSeconds;
  }

  getDurationSeconds(): number {
    return this.durationSeconds;
  }

  abstract getInitialDamage(): number;
}
