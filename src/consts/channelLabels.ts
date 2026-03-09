import { CombatSkillsType } from './enums';
import { SkillType } from './viewTypes';

// ── Skill labels ────────────────────────────────────────────────────────────

export const SKILL_LABELS: Record<SkillType, string> = {
  basic:    'BASIC',
  battle:   'BATTLE',
  combo:    'COMBO',
  ultimate: 'ULT',
};

// ── Combat skill display names ──────────────────────────────────────────────

export const COMBAT_SKILL_LABELS: Record<CombatSkillsType, string> = {
  // Laevatain
  [CombatSkillsType.FLAMING_CINDERS]:                     'Flaming Cinders',
  [CombatSkillsType.FLAMING_CINDERS_ENHANCED]:            'Flaming Cinders (Enhanced)',
  [CombatSkillsType.SMOULDERING_FIRE]:                    'Smouldering Fire',
  [CombatSkillsType.SMOULDERING_FIRE_ENHANCED]:           'Smouldering Fire (Enhanced)',
  [CombatSkillsType.SMOULDERING_FIRE_EMPOWERED]:          'Smouldering Fire (Empowered)',
  [CombatSkillsType.SMOULDERING_FIRE_ENHANCED_EMPOWERED]: 'Smouldering Fire (Enhanced + Empowered)',
  [CombatSkillsType.SEETHE]:                              'Seethe',
  [CombatSkillsType.TWILIGHT]:                             'Twilight',
  // Antal
  [CombatSkillsType.EXCHANGE_CURRENT]:                     'Exchange Current',
  [CombatSkillsType.SPECIFIED_RESEARCH_SUBJECT]:           'Specified Research Subject',
  [CombatSkillsType.EMP_TEST_SITE]:                        'EMP Test Site',
  [CombatSkillsType.OVERCLOCKED_MOMENT]:                   'Overclocked Moment',
  // Akekuri
  [CombatSkillsType.SWORD_OF_ASPIRATION]:                  'Sword of Aspiration',
  [CombatSkillsType.BURST_OF_PASSION]:                     'Burst of Passion',
  [CombatSkillsType.FLASH_AND_DASH]:                       'Flash and Dash',
  [CombatSkillsType.SQUAD_ON_ME]:                          'Squad on Me!',
  // Wulfgard
  [CombatSkillsType.RAPID_FIRE_AKIMBO]:                    'Rapid-Fire Akimbo',
  [CombatSkillsType.THERMITE_TRACERS]:                     'Thermite Tracers',
  [CombatSkillsType.FRAG_GRENADE_BETA]:                    'Frag Grenade β',
  [CombatSkillsType.WOLVEN_FURY]:                          'Wolven Fury',
  // Ardelia
  [CombatSkillsType.ROCKY_WHISPERS]:                       'Rocky Whispers',
  [CombatSkillsType.DOLLY_RUSH]:                           'Dolly Rush',
  [CombatSkillsType.ERUPTION_COLUMN]:                      'Eruption Column',
  [CombatSkillsType.WOOLY_PARTY]:                          'Wooly Party',
};

// ── Reaction labels & micro-columns ─────────────────────────────────────────

export const REACTION_LABELS: Record<string, { label: string; color: string }> = {
  combustion:      { label: 'Combustion',      color: '#ff5522' },
  solidification:  { label: 'Solidification',  color: '#88ddff' },
  corrosion:       { label: 'Corrosion',       color: '#33cc66' },
  electrification: { label: 'Electrification', color: '#e8c840' },
};

export const REACTION_MICRO_COLUMNS = [
  { id: 'combustion',      label: 'COMB',  color: '#ff5522' },
  { id: 'solidification',  label: 'SOLID', color: '#88ddff' },
  { id: 'corrosion',       label: 'CORR',  color: '#33cc66' },
  { id: 'electrification', label: 'ELEC',  color: '#e8c840' },
];
