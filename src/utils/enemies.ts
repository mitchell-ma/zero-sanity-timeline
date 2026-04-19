import { Enemy } from "../consts/viewTypes";
import { StatType, ELEMENT_COLORS, ElementType } from "../consts/enums";
import { getModelEnemy } from "../controller/calculation/enemyRegistry";
import { BossEnemy } from "../model/enemies/bossEnemy";
import { INFLICTION_COLUMNS } from "../model/channels";
import { t } from "../locales/locale";

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

// ─── Default statuses (infliction columns on the timeline) ─────────────────
const DEFAULT_STATUSES = [
  { id: INFLICTION_COLUMNS.HEAT,     label: t('infliction.heat'),     color: ELEMENT_COLORS[ElementType.HEAT] },
  { id: INFLICTION_COLUMNS.NATURE,   label: t('infliction.nature'),   color: ELEMENT_COLORS[ElementType.NATURE] },
  { id: INFLICTION_COLUMNS.ELECTRIC, label: t('infliction.electric'), color: ELEMENT_COLORS[ElementType.ELECTRIC] },
  { id: INFLICTION_COLUMNS.CRYO,     label: t('infliction.cryo'),     color: ELEMENT_COLORS[ElementType.CRYO] },
];

function e(id: string, name: string, tier: string, sprite?: string): Enemy {
  const model = getModelEnemy(id);
  const staggerHp = model?.stats[StatType.STAGGER_HP] ?? 60;
  const staggerNodes = model instanceof BossEnemy ? model.staggerNodes : 0;
  const staggerNodeRecoverySeconds = model instanceof BossEnemy ? model.staggerNodeRecoverySeconds : 0;
  const staggerBreakDurationSeconds = model?.stats[StatType.STAGGER_RECOVERY] ?? 6;
  return { id, name, tier, sprite, statuses: DEFAULT_STATUSES, staggerHp, staggerNodes, staggerNodeRecoverySeconds, staggerBreakDurationSeconds };
}

export const ENEMY_TIERS = ['Boss', 'Aggeloi', 'Landbreaker', 'Wildlife', 'Pirate'] as const;

export const ALL_ENEMIES: Enemy[] = [
  // ── Bosses ────────────────────────────────────────────────
  e('rhodagn',                   'Rhodagn the Bonekrushing Fist',   'Boss',        rhodagnSprite),
  e('triaggelos',               'Triaggelos',                      'Boss',        triaggelosSprite),
  e('marble_palecore',          'Marble Aggelomoirai Palecore',    'Boss',        marblePalecoreSprite),
  e('marble_palesent',          'Marble Aggelomoirai Palesent',    'Boss',        marblePalesentSprite),
  e('marble_appendage',         'Marble Appendage',                'Boss',        marbleAppendageSprite),
  // ── Aggeloi ───────────────────────────────────────────────
  e('ram',                       'Ram',                             'Aggeloi',     ramSprite),
  e('ram_alpha',                 'Ram \u03b1',                      'Aggeloi',     ramAlphaSprite),
  e('sting',                     'Sting',                           'Aggeloi',     stingSprite),
  e('sting_alpha',               'Sting \u03b1',                    'Aggeloi',     stingAlphaSprite),
  e('falsewings',                'Falsewings',                      'Aggeloi',     falsewingsSprite),
  e('falsewings_alpha',          'Falsewings \u03b1',               'Aggeloi',     falsewingsAlphaSprite),
  e('mudflow',                   'Mudflow',                         'Aggeloi',     mudflowSprite),
  e('mudflow_delta',             'Mudflow \u03b4',                  'Aggeloi',     mudflowDeltaSprite),
  e('hedron',                    'Hedron',                          'Aggeloi',     hedronSprite),
  e('hedron_delta',              'Hedron \u03b4',                   'Aggeloi',     hedronDeltaSprite),
  e('prism',                     'Prism',                           'Aggeloi',     prismSprite),
  e('heavy_ram',                 'Heavy Ram',                       'Aggeloi',     heavyRamSprite),
  e('heavy_ram_alpha',           'Heavy Ram \u03b1',                'Aggeloi',     heavyRamAlphaSprite),
  e('heavy_sting',               'Heavy Sting',                     'Aggeloi',     heavyStingSprite),
  e('heavy_sting_alpha',         'Heavy Sting \u03b1',              'Aggeloi',     heavyStingAlphaSprite),
  e('effigy',                    'Effigy',                          'Aggeloi',     effigySprite),
  e('sentinel',                  'Sentinel',                        'Aggeloi',     sentinelSprite),
  e('tidewalker',                'Tidewalker',                      'Aggeloi',     tidewalkerSprite),
  e('tidewalker_delta',          'Tidewalker \u03b4',               'Aggeloi',     tidewalkerDeltaSprite),
  e('walking_chrysopolis',       'Walking Chrysopolis',             'Aggeloi',     walkingChrysopolisSprite),
  e('tidalklast',                'Tidalklast',                      'Aggeloi',     tidalklastSprite),
  // ── Landbreakers ──────────────────────────────────────────
  e('bonekrusher_ripptusk',      'Bonekrusher Ripptusk',            'Landbreaker', bonekrusherRipptuskSprite),
  e('elite_ripptusk',            'Elite Ripptusk',                  'Landbreaker', eliteRipptuskSprite),
  e('hazefyre_tuskbeast',        'Hazefyre Tuskbeast',              'Landbreaker', hazefyreTuskbeastSprite),
  e('hazefyre_claw',             'Hazefyre Claw',                   'Landbreaker', hazefyreClawSprite),
  e('bonekrusher_raider',        'Bonekrusher Raider',              'Landbreaker', bonekrusherRaiderSprite),
  e('elite_raider',              'Elite Raider',                    'Landbreaker', eliteRaiderSprite),
  e('bonekrusher_ambusher',      'Bonekrusher Ambusher',            'Landbreaker', bonekrusherAmbusherSprite),
  e('elite_ambusher',            'Elite Ambusher',                  'Landbreaker', eliteAmbusherSprite),
  e('bonekrusher_infiltrator',   'Bonekrusher Infiltrator',         'Landbreaker', bonekrusherInfiltratorSprite),
  e('bonekrusher_vanguard',      'Bonekrusher Vanguard',            'Landbreaker', bonekrusherVanguardSprite),
  e('bonekrusher_pyromancer',    'Bonekrusher Pyromancer',           'Landbreaker', bonekrusherPyromancerSprite),
  e('bonekrusher_arsonist',      'Bonekrusher Arsonist',            'Landbreaker', bonekrusherArsonistSprite),
  e('bonekrusher_ballista',      'Bonekrusher Ballista',            'Landbreaker', bonekrusherBallistaSprite),
  e('bonekrusher_executioner',   'Bonekrusher Executioner',         'Landbreaker', bonekrusherExecutionerSprite),
  e('elite_executioner',         'Elite Executioner',               'Landbreaker', eliteExecutionerSprite),
  e('bonekrusher_siegeknuckles', 'Bonekrusher Siegeknuckles',       'Landbreaker', bonekrusherSiegeknucklesSprite),
  // ── Wildlife ──────────────────────────────────────────────
  e('acid_originium_slug',       'Acid Originium Slug',             'Wildlife',    acidOriginiumSlugSprite),
  e('blazemist_originium_slug',  'Blazemist Originium Slug',        'Wildlife',    blazemistOriginiumSlugSprite),
  e('firemist_originium_slug',   'Firemist Originium Slug',         'Wildlife',    firemistOriginiumSlugSprite),
  e('brutal_pincerbeast',        'Brutal Pincerbeast',              'Wildlife',    brutalPincerbeastSprite),
  e('indigenous_pincerbeast',    'Indigenous Pincerbeast',           'Wildlife',    indigenousPincerbeastSprite),
  e('waterlamp',                 'Waterlamp',                       'Wildlife',    waterlampSprite),
  e('imbued_quillbeast',         'Imbued Quillbeast',               'Wildlife',    imbuedQuillbeastSprite),
  e('quillbeast',                'Quillbeast',                      'Wildlife',    quillbeastSprite),
  e('tunneling_nidwyrm',         'Tunneling Nidwyrm',               'Wildlife',    tunnelingNidwyrmSprite),
  e('axe_armorbeast',            'Axe Armorbeast',                  'Wildlife',    axeArmorbeastSprite),
  e('hazefyre_axe_armorbeast',   'Hazefyre Axe Armorbeast',         'Wildlife',    hazefyreAxeArmorbeastSprite),
  e('glaring_rakerbeast',        'Glaring Rakerbeast',              'Wildlife',    glaringRakerbeastSprite),
  e('spotted_rakerbeast',        'Spotted Rakerbeast',              'Wildlife',    spottedRakerbeastSprite),
  // ── Cangzei Pirates ───────────────────────────────────────
  e('grove_archer',              'Grove Archer',                    'Pirate',      groveArcherSprite),
  e('road_plunderer',            'Road Plunderer',                  'Pirate',      roadPlundererSprite),
];

export const DEFAULT_ENEMY: Enemy = ALL_ENEMIES[0]; // Rhodagn
