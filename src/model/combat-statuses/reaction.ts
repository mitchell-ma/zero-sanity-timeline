import { StatusType } from "../../consts/enums";
import { StatusLevel } from "../../consts/types";
import { Status } from "./status";

/**
 * Abstract base class for all reaction types (arts reactions + physical statuses).
 * All reactions share these editable properties: stacks, durationSeconds, isForced.
 */
export abstract class Reaction extends Status {
  readonly isForced: boolean;

  /** Editable WITH properties for all reaction types. */
  static readonly EDITABLE_PROPERTIES = ['isForced', 'duration', 'stacks'] as const;

  constructor(params: {
    statusType: StatusType;
    stacks: StatusLevel;
    maxStacks: StatusLevel;
    isForced?: boolean;
  }) {
    super(params);
    this.isForced = params.isForced ?? false;
  }

  abstract getDurationSeconds(): number;
}
