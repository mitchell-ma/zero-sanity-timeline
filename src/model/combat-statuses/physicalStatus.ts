import { StatusType, PhysicalStatusType } from "../../consts/enums";
import { StatusLevel } from "../../consts/types";
import { Reaction } from "./reaction";

const PHYSICAL_STATUS_TYPES = new Set<string>(Object.values(PhysicalStatusType));

export abstract class PhysicalStatus extends Reaction {
  constructor(params: {
    statusType: StatusType;
    statusLevel: StatusLevel;
    maxStatusLevel: StatusLevel;
    isForced?: boolean;
  }) {
    if (!PHYSICAL_STATUS_TYPES.has(params.statusType)) {
      throw new Error(
        `${params.statusType} is not a physical status type`,
      );
    }
    super(params);
  }
}
