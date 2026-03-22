import { SubjectType, VerbType, ObjectType, CardinalityConstraintType, DeterminerType } from "../../dsl/semantics";
import { Tactical } from "./tactical";

export class StewMeeting extends Tactical {
  static readonly ULTIMATE_ENERGY_RESTORE = 0.2;
  static readonly TRIGGER_THRESHOLD = 0.5;

  constructor() {
    super({
      name: "Stew Meeting",
      rarity: 2,
      stats: {},
      durationSeconds: 0,
      triggerCondition: {
        subjectDeterminer: DeterminerType.THIS,
        subject: SubjectType.OPERATOR,
        verb: VerbType.HAVE,
        object: ObjectType.ULTIMATE_ENERGY,
        cardinalityConstraint: CardinalityConstraintType.AT_MOST,
      },
      maxUses: 3,
    });
  }

  getEffect(): void {
    // Restores 20% Ultimate Energy when triggered
  }
}
