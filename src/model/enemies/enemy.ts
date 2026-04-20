import {
  ElementType,
  EnemyLocationType,
  StatType,
  EnemyTierType,
  RaceType,
} from "../../consts/enums";
import { lookupByLevel } from "../../utils/lookupByLevel";
import { DEFAULT_STATS } from "../../consts/stats";
import { LocaleKey, resolveEventName } from "../../locales/gameDataLocale";

/** Default baseline for all enemy stats (spreads from DEFAULT_STATS, overrides enemy-specific values). */
export const DEFAULT_ENEMY_STATS: Readonly<Record<StatType, number>> = {
  ...DEFAULT_STATS,
  [StatType.BASE_DEFENSE]: 100,
  [StatType.PHYSICAL_RESISTANCE]: 1,
  [StatType.HEAT_RESISTANCE]: 1,
  [StatType.ELECTRIC_RESISTANCE]: 1,
  [StatType.CRYO_RESISTANCE]: 1,
  [StatType.NATURE_RESISTANCE]: 1,
  [StatType.AETHER_RESISTANCE]: 1,
  [StatType.STAGGER_HP]: 60,
  [StatType.STAGGER_RECOVERY]: 6,
  [StatType.FINISHER_ATK_MULTIPLIER]: 1,
  [StatType.FINISHER_SP_GAIN]: 25,
  [StatType.ATTACK_RANGE]: 2,
  [StatType.WEIGHT]: 1,
};

export type EnemyStatsByLevel = Readonly<
  Record<number, Partial<Record<StatType, number>>>
>;

export interface EnemyJsonLevelEntry {
  level: number;
  attributes: Partial<Record<StatType, number>>;
}

export interface EnemyJsonConfig {
  id: string;
  tier: EnemyTierType;
  race: RaceType;
  location: EnemyLocationType;
  attackElement: ElementType | null;
  baseStats?: Partial<Record<StatType, number>>;
  statsByLevel: EnemyJsonLevelEntry[];
  staggerNodes?: number;
  staggerNodeRecoverySeconds?: number;
}

function statsByLevelFromJson(entries: EnemyJsonLevelEntry[]): EnemyStatsByLevel {
  const out: Record<number, Partial<Record<StatType, number>>> = {};
  for (const entry of entries) {
    out[entry.level] = entry.attributes;
  }
  return out;
}

export class Enemy {
  readonly id: string;
  readonly name: string;
  readonly tier: EnemyTierType;
  readonly race: RaceType;
  readonly location: EnemyLocationType;
  readonly attackElement: ElementType | null;

  level: number;
  stats: Record<StatType, number>;

  readonly statsByLevel: EnemyStatsByLevel;
  readonly staggerNodes: number;
  readonly staggerNodeRecoverySeconds: number;

  constructor(config: EnemyJsonConfig, level: number) {
    if (level < 1 || level > 90 || !Number.isInteger(level)) {
      throw new RangeError(
        `Enemy level must be an integer between 1 and 90, got ${level}`,
      );
    }

    this.id = config.id;
    this.name = resolveEventName(LocaleKey.enemy(config.id));
    this.tier = config.tier;
    this.race = config.race;
    this.location = config.location;
    this.attackElement = config.attackElement;
    this.level = level;
    this.statsByLevel = statsByLevelFromJson(config.statsByLevel);
    this.staggerNodes = config.staggerNodes ?? 0;
    this.staggerNodeRecoverySeconds = config.staggerNodeRecoverySeconds ?? 0;

    this.stats = {
      ...DEFAULT_ENEMY_STATS,
      ...(config.baseStats ?? {}),
      ...lookupByLevel(this.statsByLevel, level),
    };
  }

  getHp(): number {
    return this.stats[StatType.BASE_HP];
  }

  getAtk(): number {
    return this.stats[StatType.BASE_ATTACK];
  }

  getDef(): number {
    return this.stats[StatType.BASE_DEFENSE];
  }

  getResistance(element: ElementType): number {
    const resistanceMap: Record<ElementType, StatType> = {
      [ElementType.NONE]: StatType.PHYSICAL_RESISTANCE,
      [ElementType.PHYSICAL]: StatType.PHYSICAL_RESISTANCE,
      [ElementType.HEAT]: StatType.HEAT_RESISTANCE,
      [ElementType.ELECTRIC]: StatType.ELECTRIC_RESISTANCE,
      [ElementType.CRYO]: StatType.CRYO_RESISTANCE,
      [ElementType.NATURE]: StatType.NATURE_RESISTANCE,
      [ElementType.ARTS]: StatType.AETHER_RESISTANCE,
    };
    return this.stats[resistanceMap[element]] ?? this.stats[StatType.AETHER_RESISTANCE];
  }
}
