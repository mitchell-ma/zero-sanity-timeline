import { ElementType } from "../../consts/enums";
import { EventFrame } from "./eventFrame";

export abstract class CombatSkillEventFrame extends EventFrame {
  /** Frames between the event frame trigger and the actual hit landing. */
  hitDelayFrames: number;

  readonly element: ElementType;

  constructor(params: {
    offsetFrame?: number;
    hitDelayFrames?: number;
    element: ElementType;
  }) {
    super({ offsetFrame: params.offsetFrame });
    this.hitDelayFrames = params.hitDelayFrames ?? 0;
    this.element = params.element;
  }
}
