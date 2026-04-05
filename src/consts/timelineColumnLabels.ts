import { PhysicalStatusType, StatusType, ELEMENT_COLORS, ElementType } from './enums';
import { NounType } from '../dsl/semantics';
import { getAllSkillLabels, getAllStatusLabels } from '../controller/gameDataStore';
import { t } from '../locales/locale';
import {
  INFLICTION_COLUMNS, REACTION_COLUMNS,
  PHYSICAL_INFLICTION_COLUMNS,
  NODE_STAGGER_COLUMN_ID, FULL_STAGGER_COLUMN_ID,
} from '../model/channels';

// ── Column header labels ────────────────────────────────────────────────────

export const SKILL_LABELS: Record<string, string> = {
  [NounType.BASIC_ATTACK]: t('skill.type.basic'),
  [NounType.BATTLE]: t('skill.type.battle'),
  [NounType.COMBO]:  t('skill.type.combo'),
  [NounType.ULTIMATE]:     t('skill.type.ultimate'),
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
  ACTION               = 'ACTION',
  CONTROLLED           = 'CONTROLLED',
  OTHER                = 'OTHER',
}

/** Game-mechanic status labels (non-operator-specific). Operator status labels come from JSON via gameDataController. */
const GAME_MECHANIC_STATUS_LABELS: Record<string, string> = {
  [StatusType.FOCUS]:           t('status.FOCUS'),
  [StatusType.SUSCEPTIBILITY]:  t('status.SUSCEPTIBILITY'),
  [StatusType.FRAGILITY]:       t('status.FRAGILITY'),
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
  [INFLICTION_COLUMNS.HEAT]:     t('infliction.heatInfliction'),
  [INFLICTION_COLUMNS.CRYO]:     t('infliction.cryoInfliction'),
  [INFLICTION_COLUMNS.NATURE]:   t('infliction.natureInfliction'),
  [INFLICTION_COLUMNS.ELECTRIC]: t('infliction.electricInfliction'),
  // Physical inflictions
  [PHYSICAL_INFLICTION_COLUMNS.VULNERABLE]: t('infliction.vulnerableInfliction'),
  // Arts reactions
  [REACTION_COLUMNS.COMBUSTION]:       t('infliction.combustion'),
  [REACTION_COLUMNS.SOLIDIFICATION]:   t('infliction.solidification'),
  [REACTION_COLUMNS.CORROSION]:        t('infliction.corrosion'),
  [REACTION_COLUMNS.ELECTRIFICATION]:  t('infliction.electrification'),
  // Physical statuses
  [PhysicalStatusType.BREACH]:  t('infliction.breach'),
  // Enemy statuses
  [StatusType.FOCUS]:           t('infliction.FOCUS'),
  [StatusType.SUSCEPTIBILITY]:  t('infliction.SUSCEPTIBILITY'),
  // Team statuses
  [StatusType.SHIELD]:          t('infliction.SHIELD'),
  // Enemy debuffs
  [StatusType.FRAGILITY]:       t('infliction.FRAGILITY'),
  // Stagger status events
  [NODE_STAGGER_COLUMN_ID]:     t('infliction.STAGGER_NODE'),
  [FULL_STAGGER_COLUMN_ID]:     t('infliction.STAGGER'),
  // Enemy actions
  AOE_PHYSICAL:         t('enemyAction.AOE_PHYSICAL'),
  AOE_HEAT:             t('enemyAction.AOE_HEAT'),
  AOE_CRYO:             t('enemyAction.AOE_CRYO'),
  AOE_NATURE:           t('enemyAction.AOE_NATURE'),
  AOE_ELECTRIC:         t('enemyAction.AOE_ELECTRIC'),
};

// ── Reaction labels & micro-columns ─────────────────────────────────────────

export const REACTION_LABELS: Record<string, { label: string; color: string }> = {
  [REACTION_COLUMNS.COMBUSTION]:      { label: t('reaction.combustion'),      color: ELEMENT_COLORS[ElementType.HEAT] },
  [REACTION_COLUMNS.SOLIDIFICATION]:  { label: t('reaction.solidification'),  color: ELEMENT_COLORS[ElementType.CRYO] },
  [REACTION_COLUMNS.CORROSION]:       { label: t('reaction.corrosion'),       color: ELEMENT_COLORS[ElementType.NATURE] },
  [REACTION_COLUMNS.ELECTRIFICATION]: { label: t('reaction.electrification'), color: ELEMENT_COLORS[ElementType.ELECTRIC] },
  [REACTION_COLUMNS.SHATTER]:         { label: t('reaction.shatter'),         color: ELEMENT_COLORS[ElementType.CRYO] },
};

export const REACTION_MICRO_COLUMNS = [
  { id: REACTION_COLUMNS.COMBUSTION,      label: t('reaction.micro.combustion'),       color: ELEMENT_COLORS[ElementType.HEAT] },
  { id: REACTION_COLUMNS.SOLIDIFICATION,  label: t('reaction.micro.solidification'),   color: ELEMENT_COLORS[ElementType.CRYO] },
  { id: REACTION_COLUMNS.CORROSION,       label: t('reaction.micro.corrosion'),        color: ELEMENT_COLORS[ElementType.NATURE] },
  { id: REACTION_COLUMNS.ELECTRIFICATION, label: t('reaction.micro.electrification'),  color: ELEMENT_COLORS[ElementType.ELECTRIC] },
  { id: REACTION_COLUMNS.SHATTER,         label: t('reaction.micro.shatter'),          color: ELEMENT_COLORS[ElementType.CRYO] },
];

// ── Physical infliction / status labels ──────────────────────────────────────

export const PHYSICAL_INFLICTION_LABELS: Record<string, { label: string; color: string }> = {
  [PHYSICAL_INFLICTION_COLUMNS.VULNERABLE]: { label: t('physicalInfliction.vulnerable'), color: ELEMENT_COLORS[ElementType.PHYSICAL] },
};

export const PHYSICAL_INFLICTION_MICRO_COLUMNS = [
  { id: 'vuln-0', label: t('physicalInfliction.micro.vuln'), color: ELEMENT_COLORS[ElementType.PHYSICAL] },
  { id: 'vuln-1', label: t('physicalInfliction.micro.vuln'), color: ELEMENT_COLORS[ElementType.PHYSICAL] },
  { id: 'vuln-2', label: t('physicalInfliction.micro.vuln'), color: ELEMENT_COLORS[ElementType.PHYSICAL] },
  { id: 'vuln-3', label: t('physicalInfliction.micro.vuln'), color: ELEMENT_COLORS[ElementType.PHYSICAL] },
];

export const PHYSICAL_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  [PhysicalStatusType.LIFT]: { label: t('physicalStatus.LIFT'), color: ELEMENT_COLORS[ElementType.PHYSICAL] },
  [PhysicalStatusType.KNOCK_DOWN]: { label: t('physicalStatus.KNOCK_DOWN'), color: ELEMENT_COLORS[ElementType.PHYSICAL] },
  [PhysicalStatusType.CRUSH]: { label: t('physicalStatus.CRUSH'), color: ELEMENT_COLORS[ElementType.PHYSICAL] },
  [PhysicalStatusType.BREACH]: { label: t('physicalStatus.BREACH'), color: ELEMENT_COLORS[ElementType.PHYSICAL] },
};


export const PHYSICAL_STATUS_MICRO_COLUMNS = [
  { id: PhysicalStatusType.LIFT, label: t('physicalStatus.micro.LIFT'), color: ELEMENT_COLORS[ElementType.PHYSICAL] },
  { id: PhysicalStatusType.KNOCK_DOWN, label: t('physicalStatus.micro.KNOCK_DOWN'), color: ELEMENT_COLORS[ElementType.PHYSICAL] },
  { id: PhysicalStatusType.CRUSH, label: t('physicalStatus.micro.CRUSH'), color: ELEMENT_COLORS[ElementType.PHYSICAL] },
  { id: PhysicalStatusType.BREACH, label: t('physicalStatus.micro.BREACH'), color: ELEMENT_COLORS[ElementType.PHYSICAL] },
];
