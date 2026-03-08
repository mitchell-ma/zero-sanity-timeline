import { StatType } from "../../consts/enums";

export abstract class Consumable {
  readonly name: string;
  readonly rarity: number;
  readonly stats: Partial<Record<StatType, number>>;
  readonly durationSeconds: number;

  constructor(params: {
    name: string;
    rarity: number;
    stats: Partial<Record<StatType, number>>;
    durationSeconds: number;
  }) {
    this.name = params.name;
    this.rarity = params.rarity;
    this.stats = params.stats;
    this.durationSeconds = params.durationSeconds;
  }
}
