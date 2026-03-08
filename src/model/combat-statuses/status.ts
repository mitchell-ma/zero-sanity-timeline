import { StatusType } from "../../consts/enums";
import { StatusLevel } from "../../consts/types";

export abstract class Status {
  readonly statusType: StatusType;
  statusLevel: StatusLevel;
  readonly maxStatusLevel: StatusLevel;

  constructor(params: {
    statusType: StatusType;
    statusLevel: StatusLevel;
    maxStatusLevel: StatusLevel;
  }) {
    const { statusType, statusLevel, maxStatusLevel } = params;

    if (statusLevel > maxStatusLevel) {
      throw new RangeError(
        `statusLevel (${statusLevel}) cannot exceed maxStatusLevel (${maxStatusLevel})`,
      );
    }

    this.statusType = statusType;
    this.statusLevel = statusLevel;
    this.maxStatusLevel = maxStatusLevel;
  }
}
