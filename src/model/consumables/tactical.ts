import { StatType } from "../../consts/enums";
import type { Interaction } from "../../dsl/semantics";
import { Consumable } from "./consumable";

export abstract class Tactical extends Consumable {
  readonly triggerCondition: Interaction;
  usesRemaining: number;
  readonly maxUses: number;

  constructor(params: {
    name: string;
    rarity: number;
    stats: Partial<Record<StatType, number>>;
    durationSeconds: number;
    triggerCondition: Interaction;
    maxUses: number;
  }) {
    super(params);
    this.triggerCondition = params.triggerCondition;
    this.maxUses = params.maxUses;
    this.usesRemaining = params.maxUses;
  }

  abstract getEffect(): void;
}
