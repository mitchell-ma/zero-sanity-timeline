import { StatType, TriggerConditionType } from "../../consts/enums";
import { Consumable } from "./consumable";

export abstract class Tactical extends Consumable {
  readonly triggerCondition: TriggerConditionType;
  usesRemaining: number;
  readonly maxUses: number;

  constructor(params: {
    name: string;
    rarity: number;
    stats: Partial<Record<StatType, number>>;
    durationSeconds: number;
    triggerCondition: TriggerConditionType;
    maxUses: number;
  }) {
    super(params);
    this.triggerCondition = params.triggerCondition;
    this.maxUses = params.maxUses;
    this.usesRemaining = params.maxUses;
  }

  abstract getEffect(): void;
}
