import { ElementType, StatusType } from "../../consts/enums";
import { StatusLevel } from "../../consts/types";
import { Status } from "./status";

const ARTS_REACTION_TYPES = new Set([
  StatusType.COMBUSTION,
  StatusType.SOLIDIFICATION,
  StatusType.CORROSION,
  StatusType.ELECTRIFICATION,
]);

export abstract class ArtsReaction extends Status {
  readonly element: ElementType;
  readonly isForceApplied: boolean;
  readonly durationSeconds: number;

  constructor(params: {
    statusType: StatusType;
    statusLevel: StatusLevel;
    maxStatusLevel: StatusLevel;
    element: ElementType;
    isForceApplied: boolean;
    durationSeconds: number;
  }) {
    if (!ARTS_REACTION_TYPES.has(params.statusType)) {
      throw new Error(
        `${params.statusType} is not an arts reaction status type`,
      );
    }
    super(params);
    this.element = params.element;
    this.isForceApplied = params.isForceApplied;
    this.durationSeconds = params.durationSeconds;
  }

  abstract getInitialDamage(): number;
}
