import { ElementType, OperatorClassType, StatType, TriggerConditionType, WeaponType } from "../../consts/enums";
import { DEFAULT_STATS } from "../../consts/stats";
import { OperatorRarity, Potential, SkillLevel } from "../../consts/types";
import { lookupByLevel } from "../../utils/lookupByLevel";
import { BasicAttack } from "../combat-skills/basicAttack";
import { BasicSkill } from "../combat-skills/basicSkill";
import { ComboSkill } from "../combat-skills/comboSkill";
import { Ultimate } from "../combat-skills/ultimate";

type StatsByLevel = Readonly<Record<number, Partial<Record<StatType, number>>>>;

export abstract class Operator {
  readonly name: string;
  readonly element: ElementType;
  readonly operatorClass: OperatorClassType;
  readonly weaponTypes: WeaponType[];
  readonly operatorRarity: OperatorRarity;
  readonly mainAttributeType: StatType;
  readonly secondaryAttributeType: StatType;
  readonly maxTalentOneLevel: number;
  readonly maxTalentTwoLevel: number;

  abstract readonly basicAttack: BasicAttack;
  abstract readonly battleSkill: BasicSkill;
  abstract readonly comboSkill: ComboSkill;
  abstract readonly ultimate: Ultimate;

  level: number;
  potential: Potential;
  talentOneLevel: number;
  talentTwoLevel: number;

  basicAttackLevel: SkillLevel;
  battleSkillLevel: SkillLevel;
  comboSkillLevel: SkillLevel;
  ultimateLevel: SkillLevel;

  /** All operator stats — attributes and combat stats — in a single map. */
  stats: Record<StatType, number>;

  protected readonly statsByLevel: StatsByLevel;

  constructor(params: {
    name: string;
    level: number;
    element: ElementType;
    operatorClass: OperatorClassType;
    weaponTypes: WeaponType[];
    operatorRarity: OperatorRarity;
    mainAttributeType: StatType;
    secondaryAttributeType: StatType;
    statsByLevel: StatsByLevel;
    maxTalentOneLevel: number;
    maxTalentTwoLevel: number;
    potential?: Potential;
    talentOneLevel?: number;
    talentTwoLevel?: number;
    basicAttackLevel?: SkillLevel;
    battleSkillLevel?: SkillLevel;
    comboSkillLevel?: SkillLevel;
    ultimateLevel?: SkillLevel;
  }) {
    const {
      name,
      level,
      element,
      operatorClass,
      weaponTypes,
      operatorRarity,
      mainAttributeType,
      secondaryAttributeType,
      statsByLevel,
      maxTalentOneLevel,
      maxTalentTwoLevel,
      potential = 0,
      talentOneLevel = 0,
      talentTwoLevel = 0,
      basicAttackLevel = 1,
      battleSkillLevel = 1,
      comboSkillLevel = 1,
      ultimateLevel = 1,
    } = params;

    if (level < 1 || level > 90 || !Number.isInteger(level)) {
      throw new RangeError(
        `Operator level must be an integer between 1 and 90, got ${level}`,
      );
    }

    if (
      talentOneLevel < 0 ||
      talentOneLevel > 3 ||
      !Number.isInteger(talentOneLevel)
    ) {
      throw new RangeError(`talentOneLevel must be 0–3, got ${talentOneLevel}`);
    }
    if (
      talentTwoLevel < 0 ||
      talentTwoLevel > 3 ||
      !Number.isInteger(talentTwoLevel)
    ) {
      throw new RangeError(`talentTwoLevel must be 0–3, got ${talentTwoLevel}`);
    }

    this.name = name;
    this.level = level;
    this.element = element;
    this.operatorClass = operatorClass;
    this.weaponTypes = weaponTypes;
    this.operatorRarity = operatorRarity;
    this.mainAttributeType = mainAttributeType;
    this.secondaryAttributeType = secondaryAttributeType;
    this.maxTalentOneLevel = maxTalentOneLevel;
    this.maxTalentTwoLevel = maxTalentTwoLevel;
    this.potential = potential;
    this.talentOneLevel = talentOneLevel;
    this.talentTwoLevel = talentTwoLevel;
    this.basicAttackLevel = basicAttackLevel;
    this.battleSkillLevel = battleSkillLevel;
    this.comboSkillLevel = comboSkillLevel;
    this.ultimateLevel = ultimateLevel;
    this.statsByLevel = statsByLevel;
    this.stats = {
      ...DEFAULT_STATS,
      [StatType.CRITICAL_RATE]: 0.05,
      [StatType.CRITICAL_DAMAGE]: 0.5,
      ...lookupByLevel(statsByLevel, level),
    };
  }

  getBaseAttack(): number {
    const stats = lookupByLevel(this.statsByLevel, this.level);
    const atk = stats[StatType.ATTACK];
    if (atk === undefined) {
      throw new Error(
        `${this.name} has no ATTACK stat at level ${this.level}`,
      );
    }
    return atk;
  }

  // ── Combo trigger config (from talent) ──────────────────────────────────────

  /** Trigger conditions that activate this operator's combo (OR). Override in subclass. */
  get comboRequires(): TriggerConditionType[] { return []; }
  /** Human-readable combo trigger description. */
  get comboDescription(): string { return ''; }
  /** Combo activation window in frames. */
  get comboWindowFrames(): number { return 720; }
  /** Combo blocked when any of these columnIds are active. */
  get comboForbidsActiveColumns(): string[] | undefined { return undefined; }
  /** Combo requires at least one of these columnIds to be active. */
  get comboRequiresActiveColumns(): string[] | undefined { return undefined; }
  /** Enemy column keys that should be shown when this operator is on the team. */
  get derivedEnemyColumns(): string[] | undefined { return undefined; }
  /** Team column keys that should be shown when this operator is on the team. */
  get derivedTeamColumns(): string[] | undefined { return undefined; }
}
