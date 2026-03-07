import { Attribute, Element, OperatorClass, WeaponType } from '../enums';

/** Valid operator rarity values. */
export type OperatorRarity = 4 | 5 | 6;

/**
 * Maximum talent level depends on rarity:
 * - Rarity 6: talent levels range 0–2
 * - Rarity 4/5: talent levels range 0–1
 */
export type TalentLevel<R extends OperatorRarity> = R extends 6 ? 0 | 1 | 2 : 0 | 1;

/** Skill upgrade level, ranging 1–12. */
export type SkillLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/** Potential ranking, ranging 0–5. */
export type Potential = 0 | 1 | 2 | 3 | 4 | 5;

/** Secondary combat and utility stats. All values are raw (e.g. 0.05 = 5%). */
export interface OperatorStats {
  criticalRate:                number;
  criticalDamage:              number;
  artsIntensity:               number;
  physicalResistance:          number;
  heatResistance:              number;
  electricResistance:          number;
  cryoResistance:              number;
  natureResistance:            number;
  aetherResistance:            number;
  treatmentBonus:              number;
  treatmentReceivedBonus:      number;
  comboSkillCooldownReduction: number;
  ultimateGainEfficiency:      number;
  staggerEfficiencyBonus:      number;
  physicalDamageBonus:         number;
  heatDamageBonus:             number;
  electricDamageBonus:         number;
  cryoDamageBonus:             number;
  natureDamageBonus:           number;
  basicAttackDamageBonus:      number;
}

export abstract class BaseOperator {
  readonly name: string;
  readonly element: Element;
  readonly operatorClass: OperatorClass;
  readonly weaponTypes: WeaponType[];
  readonly operatorRarity: OperatorRarity;
  readonly mainAttribute: Attribute;
  readonly secondaryAttribute: Attribute;

  level: number;
  potential: Potential;
  talentOneLevel: number;
  talentTwoLevel: number;

  basicAttackLevel: SkillLevel;
  battleSkillLevel: SkillLevel;
  comboSkillLevel:  SkillLevel;
  ultimateLevel:    SkillLevel;

  /** Core attribute scores derived from level, equipment, and potential. */
  strength:  number;
  agility:   number;
  intellect: number;
  will:      number;

  /** Secondary / combat stats. */
  stats: OperatorStats;

  constructor(params: {
    name: string;
    level: number;
    element: Element;
    operatorClass: OperatorClass;
    weaponTypes: WeaponType[];
    operatorRarity: OperatorRarity;
    mainAttribute: Attribute;
    secondaryAttribute: Attribute;
    potential?: Potential;
    talentOneLevel?: number;
    talentTwoLevel?: number;
    basicAttackLevel?: SkillLevel;
    battleSkillLevel?: SkillLevel;
    comboSkillLevel?:  SkillLevel;
    ultimateLevel?:    SkillLevel;
    strength?: number;
    agility?:  number;
    intellect?: number;
    will?:     number;
    stats?: Partial<OperatorStats>;
  }) {
    const {
      name,
      level,
      element,
      operatorClass,
      weaponTypes,
      operatorRarity,
      mainAttribute,
      secondaryAttribute,
      potential        = 0,
      talentOneLevel   = 0,
      talentTwoLevel   = 0,
      basicAttackLevel = 1,
      battleSkillLevel = 1,
      comboSkillLevel  = 1,
      ultimateLevel    = 1,
      strength         = 0,
      agility          = 0,
      intellect        = 0,
      will             = 0,
      stats            = {},
    } = params;

    if (level < 1 || level > 90 || !Number.isInteger(level)) {
      throw new RangeError(`Operator level must be an integer between 1 and 90, got ${level}`);
    }

    const maxTalentLevel = operatorRarity === 6 ? 2 : 1;
    if (talentOneLevel < 0 || talentOneLevel > maxTalentLevel || !Number.isInteger(talentOneLevel)) {
      throw new RangeError(
        `talentOneLevel must be 0–${maxTalentLevel} for rarity ${operatorRarity}, got ${talentOneLevel}`,
      );
    }
    if (talentTwoLevel < 0 || talentTwoLevel > maxTalentLevel || !Number.isInteger(talentTwoLevel)) {
      throw new RangeError(
        `talentTwoLevel must be 0–${maxTalentLevel} for rarity ${operatorRarity}, got ${talentTwoLevel}`,
      );
    }

    this.name               = name;
    this.level              = level;
    this.element            = element;
    this.operatorClass      = operatorClass;
    this.weaponTypes        = weaponTypes;
    this.operatorRarity     = operatorRarity;
    this.mainAttribute      = mainAttribute;
    this.secondaryAttribute = secondaryAttribute;
    this.potential          = potential;
    this.talentOneLevel     = talentOneLevel;
    this.talentTwoLevel     = talentTwoLevel;
    this.basicAttackLevel   = basicAttackLevel;
    this.battleSkillLevel   = battleSkillLevel;
    this.comboSkillLevel    = comboSkillLevel;
    this.ultimateLevel      = ultimateLevel;
    this.strength           = strength;
    this.agility            = agility;
    this.intellect          = intellect;
    this.will               = will;

    this.stats = {
      criticalRate:                0,
      criticalDamage:              0,
      artsIntensity:               0,
      physicalResistance:          0,
      heatResistance:              0,
      electricResistance:          0,
      cryoResistance:              0,
      natureResistance:            0,
      aetherResistance:            0,
      treatmentBonus:              0,
      treatmentReceivedBonus:      0,
      comboSkillCooldownReduction: 0,
      ultimateGainEfficiency:      0,
      staggerEfficiencyBonus:      0,
      physicalDamageBonus:         0,
      heatDamageBonus:             0,
      electricDamageBonus:         0,
      cryoDamageBonus:             0,
      natureDamageBonus:           0,
      basicAttackDamageBonus:      0,
      ...stats,
    };
  }
}
