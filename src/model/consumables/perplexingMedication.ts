import { StatType } from "../../consts/enums";
import { Consumable } from "./consumable";

export class PerplexingMedication extends Consumable {
  constructor() {
    super({
      name: "Perplexing Medication",
      rarity: 4,
      stats: {
        [StatType.ULTIMATE_GAIN_EFFICIENCY]: 0.2376,
      },
      durationSeconds: 300,
    });
  }
}
