import { GearType } from "../consts/enums";
import { Consumable } from "../model/consumables/consumable";
import { Tactical } from "../model/consumables/tactical";
import { Gear } from "../model/gears/gear";
import { BaseOperator } from "../model/operators/baseOperator";
import { Weapon } from "../model/weapons/weapon";

export class OperatorLoadout {
  operator: BaseOperator | null;
  weapon: Weapon | null;
  armor: Gear | null;
  gloves: Gear | null;
  kit1: Gear | null;
  kit2: Gear | null;
  consumable: Consumable | null;
  tactical: Tactical | null;

  constructor(params: {
    operator: BaseOperator | null;
    weapon: Weapon | null;
    armor: Gear | null;
    gloves: Gear | null;
    kit1: Gear | null;
    kit2: Gear | null;
    consumable: Consumable | null;
    tactical: Tactical | null;
  }) {
    if (params.armor && params.armor.gearType !== GearType.ARMOR) {
      throw new Error(`Armor slot requires ARMOR gear, got ${params.armor.gearType}`);
    }
    if (params.gloves && params.gloves.gearType !== GearType.GLOVES) {
      throw new Error(`Gloves slot requires GLOVES gear, got ${params.gloves.gearType}`);
    }
    if (params.kit1 && params.kit1.gearType !== GearType.KIT) {
      throw new Error(`Kit1 slot requires KIT gear, got ${params.kit1.gearType}`);
    }
    if (params.kit2 && params.kit2.gearType !== GearType.KIT) {
      throw new Error(`Kit2 slot requires KIT gear, got ${params.kit2.gearType}`);
    }

    this.operator = params.operator;
    this.weapon = params.weapon;
    this.armor = params.armor;
    this.gloves = params.gloves;
    this.kit1 = params.kit1;
    this.kit2 = params.kit2;
    this.consumable = params.consumable;
    this.tactical = params.tactical;
  }
}
