import { ElementType, OperatorType, TargetType } from "../../consts/enums";
import { TalentLevel } from "../../consts/types";
import { StatusEvent } from "../events/statusEvent";

/**
 * Heat Resistance ignored by Scorching Heart at each talent level.
 * E0 (talent 0–1): 10, E1 (talent 2): 15, E3 (talent 3): 20.
 */
const HEAT_RESISTANCE_IGNORED: Readonly<Record<TalentLevel, number>> = {
  0: 10,
  1: 10,
  2: 15,
  3: 20,
};

/**
 * Scorching Heart — Laevatain's talent (passive).
 *
 * When Final Strike or Finisher hits an enemy, absorbs Heat Infliction from
 * nearby enemies. Each stack of Heat Infliction absorbed grants 1 stack of
 * Melting Flame (max 4).
 *
 * When Melting Flame reaches 4 stacks, Scorching Heart activates for 20s,
 * ignoring a portion of enemy Heat Resistance (10/15/20 by talent level).
 *
 * Also absorbs Heat Infliction from defeated enemies.
 */
export class ScorchingHeartStatus extends StatusEvent {
  static readonly DURATION_SECONDS = 20;
  static readonly MELTING_FLAME_THRESHOLD = 4;

  readonly talentLevel: TalentLevel;
  readonly element: ElementType;

  constructor(params: {
    sourceOperator: OperatorType;
    talentLevel: TalentLevel;
    duration?: number;
  }) {
    super({
      name: "Scorching Heart",
      target: TargetType.SELF,
      sourceOperator: params.sourceOperator,
      duration: params.duration ?? ScorchingHeartStatus.DURATION_SECONDS,
      maxStacks: 1, // binary: active or not
      stacks: 1,
    });
    this.talentLevel = params.talentLevel;
    this.element = ElementType.HEAT;
  }

  /** Heat Resistance points ignored while Scorching Heart is active. */
  getHeatResistanceIgnored(): number {
    return HEAT_RESISTANCE_IGNORED[this.talentLevel];
  }
}
