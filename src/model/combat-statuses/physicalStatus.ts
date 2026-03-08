import { StatusType } from "../../consts/enums";
import { StatusLevel } from "../../consts/types";
import { Status } from "./status";

const PHYSICAL_STATUS_TYPES = new Set([
  StatusType.LIFT,
  StatusType.KNOCK_DOWN,
  StatusType.CRUSH,
  StatusType.BREACH,
]);

export abstract class PhysicalStatus extends Status {
  constructor(params: {
    statusType: StatusType;
    statusLevel: StatusLevel;
    maxStatusLevel: StatusLevel;
  }) {
    if (!PHYSICAL_STATUS_TYPES.has(params.statusType)) {
      throw new Error(
        `${params.statusType} is not a physical status type`,
      );
    }
    super(params);
  }
}
