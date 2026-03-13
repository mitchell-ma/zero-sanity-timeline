import { GearEffectType, GearType, StatType } from "../../consts/enums";
import { GearRank } from "../../consts/types";
import { Gear } from "./gear";

// ── Pulser Labs Disruptor Suit (Armor) ──────────────────────────────────────
export class PulserLabsDisruptorSuit extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.ARMOR,
      gearEffectType: GearEffectType.PULSER_LABS,
      rank,
      statsByRank: {
        1: {
          [StatType.INTELLECT]: 87,
          [StatType.WILL]: 58,
          [StatType.ARTS_INTENSITY]: 20.7,
        },
        2: {
          [StatType.INTELLECT]: 95,
          [StatType.WILL]: 63,
          [StatType.ARTS_INTENSITY]: 22.8,
        },
        3: {
          [StatType.INTELLECT]: 104,
          [StatType.WILL]: 69,
          [StatType.ARTS_INTENSITY]: 24.8,
        },
        4: {
          [StatType.INTELLECT]: 113,
          [StatType.WILL]: 75,
          [StatType.ARTS_INTENSITY]: 26.9,
        },
      },
      defense: 56,
    });
  }
}

// ── Pulser Labs Gloves (Gloves) ─────────────────────────────────────────────
export class PulserLabsGloves extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.GLOVES,
      gearEffectType: GearEffectType.PULSER_LABS,
      rank,
      statsByRank: {
        1: {
          [StatType.WILL]: 65,
          [StatType.INTELLECT]: 43,
          [StatType.CRYO_DAMAGE_BONUS]: 0.192,
          [StatType.ELECTRIC_DAMAGE_BONUS]: 0.192,
        },
        2: {
          [StatType.WILL]: 71,
          [StatType.INTELLECT]: 47,
          [StatType.CRYO_DAMAGE_BONUS]: 0.211,
          [StatType.ELECTRIC_DAMAGE_BONUS]: 0.211,
        },
        3: {
          [StatType.WILL]: 78,
          [StatType.INTELLECT]: 51,
          [StatType.CRYO_DAMAGE_BONUS]: 0.230,
          [StatType.ELECTRIC_DAMAGE_BONUS]: 0.230,
        },
        4: {
          [StatType.WILL]: 84,
          [StatType.INTELLECT]: 55,
          [StatType.CRYO_DAMAGE_BONUS]: 0.249,
          [StatType.ELECTRIC_DAMAGE_BONUS]: 0.249,
        },
      },
      defense: 42,
    });
  }
}

// ── Pulser Labs Calibrator (Kit) ────────────────────────────────────────────
export class PulserLabsCalibrator extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.PULSER_LABS,
      rank,
      statsByRank: {
        1: {
          [StatType.INTELLECT]: 41,
          [StatType.ARTS_INTENSITY]: 41.4,
        },
        2: {
          [StatType.INTELLECT]: 45,
          [StatType.ARTS_INTENSITY]: 45.5,
        },
        3: {
          [StatType.INTELLECT]: 49,
          [StatType.ARTS_INTENSITY]: 49.7,
        },
        4: {
          [StatType.INTELLECT]: 53,
          [StatType.ARTS_INTENSITY]: 53.8,
        },
      },
      defense: 21,
    });
  }
}

// ── Pulser Labs Invasion Core (Kit) ─────────────────────────────────────────
export class PulserLabsInvasionCore extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.PULSER_LABS,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
      defense: 21,
    });
  }
}

// ── Pulser Labs Probe (Kit) ─────────────────────────────────────────────────
export class PulserLabsProbe extends Gear {
  constructor(rank: GearRank = 1) {
    super({
      gearType: GearType.KIT,
      gearEffectType: GearEffectType.PULSER_LABS,
      rank,
      statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
      defense: 21,
    });
  }
}
