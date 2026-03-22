import { StatusType } from "../../consts/enums";
import { StatusLevel } from "../../consts/types";

export abstract class Status {
  readonly statusType: StatusType;
  stacks: StatusLevel;
  readonly maxStacks: StatusLevel;

  constructor(params: {
    statusType: StatusType;
    stacks: StatusLevel;
    maxStacks: StatusLevel;
  }) {
    const { statusType, stacks, maxStacks } = params;

    if (stacks > maxStacks) {
      throw new RangeError(
        `stacks (${stacks}) cannot exceed maxStacks (${maxStacks})`,
      );
    }

    this.statusType = statusType;
    this.stacks = stacks;
    this.maxStacks = maxStacks;
  }
}
