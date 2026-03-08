import { BasicAttackType } from "../enums";
import { EventFrame } from "./eventFrame";

export class BasicAttackEventFrame extends EventFrame {
  /** Which hit in the basic attack chain this frame represents. */
  readonly sequence: BasicAttackType;

  constructor(params: { sequence: BasicAttackType; offsetFrame?: number }) {
    super({ offsetFrame: params.offsetFrame });
    this.sequence = params.sequence;
  }
}
