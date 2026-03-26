import { PhysicalStatusType, StatusType } from './enums';
import { SkillType } from './viewTypes';
import { getAllSkillLabels, getAllStatusLabels } from '../controller/gameDataStore';
import { t } from '../locales/locale';

// ── Column header labels ────────────────────────────────────────────────────

export const SKILL_LABELS: Record<SkillType, string> = {
  basic:    t('skill.type.basic'),
  battle:   t('skill.type.battle'),
  combo:    t('skill.type.combo'),
  ultimate: t('skill.type.ultimate'),
};

export const enum ColumnLabel {
  SKILL_POINTS         = 'SKILL POINTS',
  TEAM_STATUS          = 'TEAM STATUS',
  LINK                 = 'LINK',
  SHIELD               = 'SHIELD',
  INFLICTION           = 'ARTS INFLICTION',
  ARTS_REACTION        = 'ARTS REACTION',
  PHYSICAL_INFLICTION  = 'PHYSICAL INFLICTION',
  PHYSICAL_STATUS      = 'PHYSICAL STATUS',
  SUSCEPTIBILITY       = 'SUSCEPTIBILITY',
  FRAGILITY            = 'FRAGILITY',
  WEAPON_BUFF          = 'WEAPON',
  GEAR_BUFF            = 'GEAR',
  TACTICAL             = 'TACTICAL',
  STATUS               = 'STATUS',
  STAGGER              = 'STAGGER',
  STAGGER_FRAILTY      = 'STAGGER FRAILTY',
  WULFGARD_TALENT1_SCORCHING_FANGS = 'SCORCHING FANGS',
  SCORCHING_HEART      = 'SCORCHING HEART (TALENT)',
  SCORCHING_HEART_EFFECT = 'SCORCHING HEART',
  ORIGINIUM_CRYSTAL    = 'CRYSTAL',
  WILDLAND_TREKKER     = 'WILDLAND TREKKER',
  MESSENGERS_SONG      = "MESSENGER'S SONG",
  ACTION               = 'ACTION',
  CONTROLLED           = 'CONTROLLED',
  OTHER                = 'OTHER',
}

/** Game-mechanic status labels (non-operator-specific). Operator status labels come from JSON via gameDataController. */
const GAME_MECHANIC_STATUS_LABELS: Record<string, string> = {
  [StatusType.FOCUS]:           t('status.FOCUS'),
  [StatusType.SUSCEPTIBILITY]:  t('status.SUSCEPTIBILITY'),
  [StatusType.FRAGILITY]:       t('status.FRAGILITY'),
  [StatusType.ORIGINIUM_CRYSTAL]: t('status.ORIGINIUM_CRYSTAL'),
  [StatusType.WEAKEN]:          t('status.WEAKEN'),
  [StatusType.DMG_REDUCTION]:   t('status.DMG_REDUCTION'),
  [StatusType.PROTECTION]:      t('status.PROTECTION'),
  [StatusType.LINK]:            t('status.LINK'),
  [StatusType.SHIELD]:          t('status.SHIELD'),
  [StatusType.GEAR_BUFF]:       t('status.GEAR_BUFF'),
  // Reactions
  [StatusType.COMBUSTION]:      t('status.COMBUSTION'),
  [StatusType.SOLIDIFICATION]:  t('status.SOLIDIFICATION'),
  [StatusType.CORROSION]:       t('status.CORROSION'),
  [StatusType.ELECTRIFICATION]: t('status.ELECTRIFICATION'),
  // Physical statuses
  [StatusType.LIFT]:            t('status.LIFT'),
  [StatusType.KNOCK_DOWN]:      t('status.KNOCK_DOWN'),
  [StatusType.CRUSH]:           t('status.CRUSH'),
  [StatusType.BREACH]:          t('status.BREACH'),
  [StatusType.SHATTER]:         t('status.SHATTER'),
};

/** All status display labels — game-mechanic + operator statuses from JSON. */
export const STATUS_LABELS: Record<string, string> = {
  ...GAME_MECHANIC_STATUS_LABELS,
  ...getAllStatusLabels(),
};

// ── Combat skill display names ──────────────────────────────────────────────

/** All combat skill display labels — common + operator skills from JSON. */
export const COMBAT_SKILL_LABELS: Record<string, string> = getAllSkillLabels();

// ── Infliction event labels ────────────────────────────────────────────────

export const INFLICTION_EVENT_LABELS: Record<string, string> = {
  // Arts inflictions
  heatInfliction:       t('infliction.heatInfliction'),
  cryoInfliction:       t('infliction.cryoInfliction'),
  natureInfliction:     t('infliction.natureInfliction'),
  electricInfliction:   t('infliction.electricInfliction'),
  // Physical inflictions
  vulnerableInfliction: t('infliction.vulnerableInfliction'),
  // Arts reactions (derived event names use lowercase columnId)
  combustion:           t('infliction.combustion'),
  solidification:       t('infliction.solidification'),
  corrosion:            t('infliction.corrosion'),
  electrification:      t('infliction.electrification'),
  // Physical statuses
  breach:               t('infliction.breach'),
  // Operator statuses (exchange status enum values)
  MELTING_FLAME:        t('infliction.MELTING_FLAME'),
  THUNDERLANCE:         t('infliction.THUNDERLANCE'),
  // Enemy statuses (applied via applyStatus frames)
  focus:                t('infliction.focus'),
  FOCUS:                t('infliction.FOCUS'),
  SUSCEPTIBILITY:       t('infliction.SUSCEPTIBILITY'),
  // Team statuses
  SHIELD:               t('infliction.SHIELD'),
  // Enemy debuffs
  SCORCHING_HEART:      t('infliction.SCORCHING_HEART'),
  SCORCHING_HEART_EFFECT: t('infliction.SCORCHING_HEART_EFFECT'),
  FRAGILITY:            t('infliction.FRAGILITY'),
  ORIGINIUM_CRYSTAL:    t('infliction.ORIGINIUM_CRYSTAL'),
  'originium-crystal':  t('infliction.originium-crystal'),
  WILDLAND_TREKKER:     t('infliction.WILDLAND_TREKKER'),
  // Stagger status events
  STAGGER_NODE:         t('infliction.STAGGER_NODE'),
  STAGGER:              t('infliction.STAGGER'),
  // Enemy actions
  AOE_PHYSICAL:         t('enemyAction.AOE_PHYSICAL'),
  AOE_HEAT:             t('enemyAction.AOE_HEAT'),
  AOE_CRYO:             t('enemyAction.AOE_CRYO'),
  AOE_NATURE:           t('enemyAction.AOE_NATURE'),
  AOE_ELECTRIC:         t('enemyAction.AOE_ELECTRIC'),
};

// ── Reaction labels & micro-columns ─────────────────────────────────────────

export const REACTION_LABELS: Record<string, { label: string; color: string }> = {
  combustion:      { label: t('reaction.combustion'),      color: '#ff5522' },
  solidification:  { label: t('reaction.solidification'),  color: '#88ddff' },
  corrosion:       { label: t('reaction.corrosion'),       color: '#33cc66' },
  electrification: { label: t('reaction.electrification'), color: '#e8c840' },
  shatter:         { label: t('reaction.shatter'),         color: '#88ddff' },
};

export const REACTION_MICRO_COLUMNS = [
  { id: 'combustion',      label: t('reaction.micro.combustion'),  color: '#ff5522' },
  { id: 'solidification',  label: t('reaction.micro.solidification'), color: '#88ddff' },
  { id: 'corrosion',       label: t('reaction.micro.corrosion'),  color: '#33cc66' },
  { id: 'electrification', label: t('reaction.micro.electrification'),  color: '#e8c840' },
  { id: 'shatter',         label: t('reaction.micro.shatter'),    color: '#88ddff' },
];

// ── Physical infliction / status labels ──────────────────────────────────────

export const PHYSICAL_INFLICTION_LABELS: Record<string, { label: string; color: string }> = {
  vulnerableInfliction: { label: t('physicalInfliction.vulnerable'), color: '#c0c8d0' },
};

export const PHYSICAL_INFLICTION_MICRO_COLUMNS = [
  { id: 'vuln-0', label: t('physicalInfliction.micro.vuln'), color: '#c0c8d0' },
  { id: 'vuln-1', label: t('physicalInfliction.micro.vuln'), color: '#c0c8d0' },
  { id: 'vuln-2', label: t('physicalInfliction.micro.vuln'), color: '#c0c8d0' },
  { id: 'vuln-3', label: t('physicalInfliction.micro.vuln'), color: '#c0c8d0' },
];

export const PHYSICAL_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  [PhysicalStatusType.LIFT]: { label: t('physicalStatus.LIFT'), color: '#c0c8d0' },
  [PhysicalStatusType.KNOCK_DOWN]: { label: t('physicalStatus.KNOCK_DOWN'), color: '#c0c8d0' },
  [PhysicalStatusType.CRUSH]: { label: t('physicalStatus.CRUSH'), color: '#c0c8d0' },
  [PhysicalStatusType.BREACH]: { label: t('physicalStatus.BREACH'), color: '#c0c8d0' },
};


export const PHYSICAL_STATUS_MICRO_COLUMNS = [
  { id: PhysicalStatusType.LIFT, label: t('physicalStatus.micro.LIFT'), color: '#c0c8d0' },
  { id: PhysicalStatusType.KNOCK_DOWN, label: t('physicalStatus.micro.KNOCK_DOWN'), color: '#c0c8d0' },
  { id: PhysicalStatusType.CRUSH, label: t('physicalStatus.micro.CRUSH'), color: '#c0c8d0' },
  { id: PhysicalStatusType.BREACH, label: t('physicalStatus.micro.BREACH'), color: '#c0c8d0' },
];
