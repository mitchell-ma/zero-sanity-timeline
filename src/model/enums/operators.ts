export enum OperatorInformationType {
  OPERATOR_TYPE = "id",
  NAME = "name",
  OPERATOR_RARITY = "operatorRarity",
  OPERATOR_CLASS_TYPE = "operatorClassType",
  ELEMENT_TYPE = "elementType",
  WEAPON_TYPE = "weaponType",
  MAIN_ATTRIBUTE_TYPE = "mainAttributeType",
  SECONDARY_ATTRIBUTE_TYPE = "secondaryAttributeType",
  POTENTIALS = "potentials",
  ALL_LEVELS = "allLevels",
}

export enum OperatorType {
  LAEVATAIN = "LAEVATAIN",
  AKEKURI = "AKEKURI",
  ANTAL = "ANTAL",
  ARDELIA = "ARDELIA",
  WULFGARD = "WULFGARD",
  ENDMINISTRATOR = "ENDMINISTRATOR",
  LIFENG = "LIFENG",
  CHEN_QIANYU = "CHEN_QIANYU",
  ESTELLA = "ESTELLA",
  EMBER = "EMBER",
  SNOWSHINE = "SNOWSHINE",
  CATCHER = "CATCHER",
  GILBERTA = "GILBERTA",
  XAIHI = "XAIHI",
  PERLICA = "PERLICA",
  FLUORITE = "FLUORITE",
  LAST_RITE = "LAST_RITE",
  YVONNE = "YVONNE",
  AVYWENNA = "AVYWENNA",
  DA_PAN = "DA_PAN",
  POGRANICHNIK = "POGRANICHNIK",
  ALESH = "ALESH",
  ARCLIGHT = "ARCLIGHT",
}

/** How a potential effect modifies the operator. */
export enum PotentialEffectType {
  /** Modifies a skill's cost parameter (e.g. energy cost). */
  SKILL_COST = "SKILL_COST",
  /** Modifies a skill's tunable parameter (e.g. SP return, damage ratio, duration). */
  SKILL_PARAMETER = "SKILL_PARAMETER",
  /** Flat stat bonus (e.g. Intellect +20). */
  STAT_MODIFIER = "STAT_MODIFIER",
  /** Attaches or modifies a buff. */
  BUFF_ATTACHMENT = "BUFF_ATTACHMENT",
}

/** How a parameter value is applied to the base. */
export enum ParameterModifyType {
  /** Additive: base + value (e.g. SP +20). */
  ADDITIVE = "ADDITIVE",
  /** Multiplicative: base × value (e.g. duration ×1.5). */
  MULTIPLICATIVE = "MULTIPLICATIVE",
  /** Unique multiplier: multiplied with base value (e.g. damage multiplier ×1.2). */
  UNIQUE_MULTIPLIER = "UNIQUE_MULTIPLIER",
}

export enum OperatorClassType {
  GUARD = "GUARD",
  CASTER = "CASTER",
  STRIKER = "STRIKER",
  VANGUARD = "VANGUARD",
  DEFENDER = "DEFENDER",
  SUPPORTER = "SUPPORTER",
}
