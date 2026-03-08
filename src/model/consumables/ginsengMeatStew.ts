import { StatType } from "../../consts/enums";
import { Consumable } from "./consumable";

export class GinsengMeatStew extends Consumable {
  constructor() {
    super({
      name: "Ginseng Meat Stew",
      rarity: 5,
      stats: {
        [StatType.ATTACK]: 180,
        [StatType.CRITICAL_RATE]: 0.1144,
      },
      durationSeconds: 300,
    });
  }
}
