import { Enemy } from "../consts/viewTypes";
import { StatType, ELEMENT_COLORS, ElementType, EnemyTierType, RaceType } from "../consts/enums";
import { getModelEnemy, getAllEnemyIds, getEnemyConfigById } from "../controller/calculation/enemyRegistry";
import { INFLICTION_COLUMNS } from "../model/channels";
import { t } from "../locales/locale";
import { LocaleKey, resolveEventName } from "../locales/gameDataLocale";

// ─── Enemy sprite imports ──────────────────────────────────────────────────
import rhodagnSprite from "../assets/enemies/rhodagn_the_bonekrushing_fist_sprite.png";
import triaggelosSprite from "../assets/enemies/triaggelos_sprite.png";
import marblePalecoreSprite from "../assets/enemies/marble_aggelomoirai_palecore_sprite.png";
import marblePalesentSprite from "../assets/enemies/marble_aggelomoirai_palesent_sprite.png";
import marbleAppendageSprite from "../assets/enemies/marble_appendage_sprite.png";
import ramSprite from "../assets/enemies/ram_sprite.png";
import ramAlphaSprite from "../assets/enemies/ram_alpha_sprite.png";
import stingSprite from "../assets/enemies/sting_sprite.png";
import stingAlphaSprite from "../assets/enemies/sting_alpha_sprite.png";
import falsewingsSprite from "../assets/enemies/falsewings_sprite.png";
import falsewingsAlphaSprite from "../assets/enemies/falsewings_alpha_sprite.png";
import mudflowSprite from "../assets/enemies/mudflow_sprite.png";
import mudflowDeltaSprite from "../assets/enemies/mudflow_delta_sprite.png";
import hedronSprite from "../assets/enemies/hedron_sprite.png";
import hedronDeltaSprite from "../assets/enemies/hedron_delta_sprite.png";
import prismSprite from "../assets/enemies/prism_sprite.png";
import heavyRamSprite from "../assets/enemies/heavy_ram_sprite.png";
import heavyRamAlphaSprite from "../assets/enemies/heavy_ram_alpha_sprite.png";
import heavyStingSprite from "../assets/enemies/heavy_sting_sprite.png";
import heavyStingAlphaSprite from "../assets/enemies/heavy_sting_alpha_sprite.png";
import effigySprite from "../assets/enemies/effigy_sprite.png";
import sentinelSprite from "../assets/enemies/sentinel_sprite.png";
import tidewalkerSprite from "../assets/enemies/tidewalker_sprite.png";
import tidewalkerDeltaSprite from "../assets/enemies/tidewalker_delta_sprite.png";
import walkingChrysopolisSprite from "../assets/enemies/walking_chrysopolis_sprite.png";
import tidalklastSprite from "../assets/enemies/tidalklast_sprite.png";
import bonekrusherRipptuskSprite from "../assets/enemies/bonekrusher_ripptusk_sprite.png";
import eliteRipptuskSprite from "../assets/enemies/elite_ripptusk_sprite.png";
import hazefyreTuskbeastSprite from "../assets/enemies/hazefyre_tuskbeast_sprite.png";
import hazefyreClawSprite from "../assets/enemies/hazefyre_claw_sprite.png";
import bonekrusherRaiderSprite from "../assets/enemies/bonekrusher_raider_sprite.png";
import eliteRaiderSprite from "../assets/enemies/elite_raider_sprite.png";
import bonekrusherAmbusherSprite from "../assets/enemies/bonekrusher_ambusher_sprite.png";
import eliteAmbusherSprite from "../assets/enemies/elite_ambusher_sprite.png";
import bonekrusherInfiltratorSprite from "../assets/enemies/bonekrusher_infiltrator_sprite.png";
import bonekrusherVanguardSprite from "../assets/enemies/bonekrusher_vanguard_sprite.png";
import bonekrusherPyromancerSprite from "../assets/enemies/bonekrusher_pyromancer_sprite.png";
import bonekrusherArsonistSprite from "../assets/enemies/bonekrusher_arsonist_sprite.png";
import bonekrusherBallistaSprite from "../assets/enemies/bonekrusher_ballista_sprite.png";
import bonekrusherExecutionerSprite from "../assets/enemies/bonekrusher_executioner_sprite.png";
import eliteExecutionerSprite from "../assets/enemies/elite_executioner_sprite.png";
import bonekrusherSiegeknucklesSprite from "../assets/enemies/bonekrusher_siegeknuckles_sprite.png";
import acidOriginiumSlugSprite from "../assets/enemies/acid_originium_slug_sprite.png";
import blazemistOriginiumSlugSprite from "../assets/enemies/blazemist_originium_slug_sprite.png";
import firemistOriginiumSlugSprite from "../assets/enemies/firemist_originium_slug_sprite.png";
import brutalPincerbeastSprite from "../assets/enemies/brutal_pincerbeast_sprite.png";
import indigenousPincerbeastSprite from "../assets/enemies/indigenous_pincerbeast_sprite.png";
import waterlampSprite from "../assets/enemies/waterlamp_sprite.png";
import imbuedQuillbeastSprite from "../assets/enemies/imbued_quillbeast_sprite.png";
import quillbeastSprite from "../assets/enemies/quillbeast_sprite.png";
import tunnelingNidwyrmSprite from "../assets/enemies/tunneling_nidwyrm_sprite.png";
import axeArmorbeastSprite from "../assets/enemies/axe_armorbeast_sprite.png";
import hazefyreAxeArmorbeastSprite from "../assets/enemies/hazefyre_axe_armorbeast_sprite.png";
import glaringRakerbeastSprite from "../assets/enemies/glaring_rakerbeast_sprite.png";
import spottedRakerbeastSprite from "../assets/enemies/spotted_rakerbeast_sprite.png";
import groveArcherSprite from "../assets/enemies/grove_archer_sprite.png";
import roadPlundererSprite from "../assets/enemies/road_plunderer_sprite.png";

const ENEMY_SPRITES: Record<string, string> = {
  RHODAGN: rhodagnSprite,
  TRIAGGELOS: triaggelosSprite,
  MARBLE_PALECORE: marblePalecoreSprite,
  MARBLE_PALESENT: marblePalesentSprite,
  MARBLE_APPENDAGE: marbleAppendageSprite,
  RAM: ramSprite,
  RAM_ALPHA: ramAlphaSprite,
  STING: stingSprite,
  STING_ALPHA: stingAlphaSprite,
  FALSEWINGS: falsewingsSprite,
  FALSEWINGS_ALPHA: falsewingsAlphaSprite,
  MUDFLOW: mudflowSprite,
  MUDFLOW_DELTA: mudflowDeltaSprite,
  HEDRON: hedronSprite,
  HEDRON_DELTA: hedronDeltaSprite,
  PRISM: prismSprite,
  HEAVY_RAM: heavyRamSprite,
  HEAVY_RAM_ALPHA: heavyRamAlphaSprite,
  HEAVY_STING: heavyStingSprite,
  HEAVY_STING_ALPHA: heavyStingAlphaSprite,
  EFFIGY: effigySprite,
  SENTINEL: sentinelSprite,
  TIDEWALKER: tidewalkerSprite,
  TIDEWALKER_DELTA: tidewalkerDeltaSprite,
  WALKING_CHRYSOPOLIS: walkingChrysopolisSprite,
  TIDALKLAST: tidalklastSprite,
  BONEKRUSHER_RIPPTUSK: bonekrusherRipptuskSprite,
  ELITE_RIPPTUSK: eliteRipptuskSprite,
  HAZEFYRE_TUSKBEAST: hazefyreTuskbeastSprite,
  HAZEFYRE_CLAW: hazefyreClawSprite,
  BONEKRUSHER_RAIDER: bonekrusherRaiderSprite,
  ELITE_RAIDER: eliteRaiderSprite,
  BONEKRUSHER_AMBUSHER: bonekrusherAmbusherSprite,
  ELITE_AMBUSHER: eliteAmbusherSprite,
  BONEKRUSHER_INFILTRATOR: bonekrusherInfiltratorSprite,
  BONEKRUSHER_VANGUARD: bonekrusherVanguardSprite,
  BONEKRUSHER_PYROMANCER: bonekrusherPyromancerSprite,
  BONEKRUSHER_ARSONIST: bonekrusherArsonistSprite,
  BONEKRUSHER_BALLISTA: bonekrusherBallistaSprite,
  BONEKRUSHER_EXECUTIONER: bonekrusherExecutionerSprite,
  ELITE_EXECUTIONER: eliteExecutionerSprite,
  BONEKRUSHER_SIEGEKNUCKLES: bonekrusherSiegeknucklesSprite,
  ACID_ORIGINIUM_SLUG: acidOriginiumSlugSprite,
  BLAZEMIST_ORIGINIUM_SLUG: blazemistOriginiumSlugSprite,
  FIREMIST_ORIGINIUM_SLUG: firemistOriginiumSlugSprite,
  BRUTAL_PINCERBEAST: brutalPincerbeastSprite,
  INDIGENOUS_PINCERBEAST: indigenousPincerbeastSprite,
  WATERLAMP: waterlampSprite,
  IMBUED_QUILLBEAST: imbuedQuillbeastSprite,
  QUILLBEAST: quillbeastSprite,
  TUNNELING_NIDWYRM: tunnelingNidwyrmSprite,
  AXE_ARMORBEAST: axeArmorbeastSprite,
  HAZEFYRE_AXE_ARMORBEAST: hazefyreAxeArmorbeastSprite,
  GLARING_RAKERBEAST: glaringRakerbeastSprite,
  SPOTTED_RAKERBEAST: spottedRakerbeastSprite,
  GROVE_ARCHER: groveArcherSprite,
  ROAD_PLUNDERER: roadPlundererSprite,
};

// ─── Default statuses (infliction columns on the timeline) ─────────────────
const DEFAULT_STATUSES = [
  { id: INFLICTION_COLUMNS.HEAT,     label: t('infliction.heat'),     color: ELEMENT_COLORS[ElementType.HEAT] },
  { id: INFLICTION_COLUMNS.NATURE,   label: t('infliction.nature'),   color: ELEMENT_COLORS[ElementType.NATURE] },
  { id: INFLICTION_COLUMNS.ELECTRIC, label: t('infliction.electric'), color: ELEMENT_COLORS[ElementType.ELECTRIC] },
  { id: INFLICTION_COLUMNS.CRYO,     label: t('infliction.cryo'),     color: ELEMENT_COLORS[ElementType.CRYO] },
];

const RACE_TIER_LABEL: Record<RaceType, string> = {
  [RaceType.LANDBREAKERS]: 'Landbreaker',
  [RaceType.AGGELOI]: 'Aggeloi',
  [RaceType.WILDLIFE]: 'Wildlife',
  [RaceType.CANGZEI_PIRATES]: 'Pirate',
};

function buildEnemy(enemyId: string): Enemy | null {
  const config = getEnemyConfigById(enemyId);
  if (!config) return null;
  const model = getModelEnemy(enemyId);
  const name = resolveEventName(LocaleKey.enemy(config.id));
  const sprite = ENEMY_SPRITES[enemyId];
  const tierLabel = config.tier === EnemyTierType.BOSS
    ? 'Boss'
    : (RACE_TIER_LABEL[config.race as RaceType] ?? String(config.race));
  const staggerHp = model?.stats[StatType.STAGGER_HP] ?? 60;
  const staggerNodes = model?.staggerNodes ?? 0;
  const staggerNodeRecoverySeconds = model?.staggerNodeRecoverySeconds ?? 0;
  const staggerBreakDurationSeconds = model?.stats[StatType.STAGGER_RECOVERY] ?? 6;
  return {
    id: enemyId,
    name,
    tier: tierLabel,
    sprite,
    statuses: DEFAULT_STATUSES,
    staggerHp,
    staggerNodes,
    staggerNodeRecoverySeconds,
    staggerBreakDurationSeconds,
  };
}

/** Display-tier labels used by the enemy selector filter chips. */
export const ENEMY_TIERS = ['Boss', 'Aggeloi', 'Landbreaker', 'Wildlife', 'Pirate'] as const;

/** Stable sort: bosses first, then by tier-label order from ENEMY_TIERS, then by name. */
const TIER_ORDER: Record<string, number> = {
  Boss: 0,
  Aggeloi: 1,
  Landbreaker: 2,
  Wildlife: 3,
  Pirate: 4,
};

/** Default-selected enemy id. Pinned here so the DEFAULT_ENEMY lookup isn't a magic string. */
export const DEFAULT_ENEMY_ID = 'RHODAGN';

export const ALL_ENEMIES: Enemy[] = getAllEnemyIds()
  .map(buildEnemy)
  .filter((e): e is Enemy => e !== null)
  .sort((a, b) => {
    const ta = TIER_ORDER[a.tier] ?? 99;
    const tb = TIER_ORDER[b.tier] ?? 99;
    if (ta !== tb) return ta - tb;
    return a.name.localeCompare(b.name);
  });

export const DEFAULT_ENEMY: Enemy = ALL_ENEMIES.find((e) => e.id === DEFAULT_ENEMY_ID) ?? ALL_ENEMIES[0];
