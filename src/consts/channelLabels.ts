import { CombatSkillsType, StatusType, TriggerConditionType } from './enums';
import { SkillType } from './viewTypes';

// ── Column header labels ────────────────────────────────────────────────────

export const SKILL_LABELS: Record<SkillType, string> = {
  basic:    'BASIC',
  battle:   'BATTLE',
  combo:    'COMBO',
  ultimate: 'ULTIMATE',
};

export const enum ColumnLabel {
  SKILL_POINTS         = 'SKILL POINTS',
  TEAM_STATUS          = 'TEAM STATUS',
  LINK                 = 'LINK',
  ARTS_AMP             = 'ARTS AMP',
  SHIELD               = 'SHIELD',
  INFLICTION           = 'ARTS INFLICTION',
  ARTS_REACTION        = 'ARTS REACTION',
  PHYSICAL_INFLICTION  = 'PHYSICAL INFLICTION',
  PHYSICAL_STATUS      = 'PHYSICAL STATUS',
  SUSCEPTIBILITY       = 'SUSCEPTIBILITY',
}

export const STATUS_LABELS: Record<StatusType, string> = {
  [StatusType.COMBUSTION]:      'Combustion',
  [StatusType.SOLIDIFICATION]:  'Solidification',
  [StatusType.CORROSION]:       'Corrosion',
  [StatusType.ELECTRIFICATION]: 'Electrification',
  [StatusType.MELTING_FLAME]:   'Melting Flame',
  [StatusType.THUNDERLANCE]:    'Thunderlance',
  [StatusType.SQUAD_BUFF]:      'Squad Buff',
  [StatusType.LINK]:            'Link',
  [StatusType.ARTS_AMP]:        'Arts Amp',
  [StatusType.SHIELD]:          'Shield',
  [StatusType.FOCUS]:           'Focus',
  [StatusType.SUSCEPTIBILITY]:  'Susceptibility',
  [StatusType.LIFT]:            'Lift',
  [StatusType.KNOCK_DOWN]:      'Knock Down',
  [StatusType.CRUSH]:           'Crush',
  [StatusType.BREACH]:          'Breach',
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
  // Endministrator
  [CombatSkillsType.DESTRUCTIVE_SEQUENCE]:       'Destructive Sequence',
  [CombatSkillsType.CONSTRUCTIVE_SEQUENCE]:       'Constructive Sequence',
  [CombatSkillsType.SEALING_SEQUENCE]:             'Sealing Sequence',
  [CombatSkillsType.BOMBARDMENT_SEQUENCE]:         'Bombardment Sequence',
  // Lifeng
  [CombatSkillsType.RUINATION]:                    'Ruination',
  [CombatSkillsType.TURBID_AVATAR]:                'Turbid Avatar',
  [CombatSkillsType.ASPECT_OF_WRATH]:              'Aspect of Wrath',
  [CombatSkillsType.HEART_OF_THE_UNMOVING]:        'Heart of the Unmoving',
  // Chen Qianyu
  [CombatSkillsType.SOARING_BREAK]:                'Soaring Break',
  [CombatSkillsType.ASCENDING_STRIKE]:             'Ascending Strike',
  [CombatSkillsType.SOAR_TO_THE_STARS]:            'Soar to the Stars',
  [CombatSkillsType.BLADE_GALE]:                   'Blade Gale',
  // Estella
  [CombatSkillsType.AUDIO_NOISE]:                  'Audio Noise',
  [CombatSkillsType.ONOMATOPOEIA]:                 'Onomatopoeia',
  [CombatSkillsType.DISTORTION]:                   'Distortion',
  [CombatSkillsType.TREMOLO]:                      'Tremolo',
  // Ember
  [CombatSkillsType.SWORD_ART_OF_ASSAULT]:         'Sword Art of Assault',
  [CombatSkillsType.FORWARD_MARCH]:                'Forward March',
  [CombatSkillsType.FRONTLINE_SUPPORT]:             'Frontline Support',
  [CombatSkillsType.RE_IGNITED_OATH]:               'Re-Ignited Oath',
  // Snowshine
  [CombatSkillsType.HYPOTHERMIC_ASSAULT]:           'Hypothermic Assault',
  [CombatSkillsType.SATURATED_DEFENSE]:             'Saturated Defense',
  [CombatSkillsType.POLAR_RESCUE]:                  'Polar Rescue',
  [CombatSkillsType.FRIGID_SNOWFIELD]:              'Frigid Snowfield',
  // Catcher
  [CombatSkillsType.RIGID_INTERDICTION_BASIC]:      'Rigid Interdiction',
  [CombatSkillsType.RIGID_INTERDICTION]:             'Rigid Interdiction',
  [CombatSkillsType.TIMELY_SUPPRESSION]:             'Timely Suppression',
  [CombatSkillsType.TEXTBOOK_ASSAULT]:               'Textbook Assault',
  // Gilberta
  [CombatSkillsType.BEAM_COHESION_ARTS]:             'Beam Cohesion Arts',
  [CombatSkillsType.GRAVITY_MODE]:                   'Gravity Mode',
  [CombatSkillsType.MATRIX_DISPLACEMENT]:            'Matrix Displacement',
  [CombatSkillsType.GRAVITY_FIELD]:                  'Gravity Field',
  // Xaihi
  [CombatSkillsType.XAIHI_BASIC_ATTACK]:             'Xaihi Basic Attack',
  [CombatSkillsType.DISTRIBUTED_DOS]:                'Distributed DoS',
  [CombatSkillsType.STRESS_TESTING]:                  'Stress Testing',
  [CombatSkillsType.STACK_OVERFLOW]:                  'Stack Overflow',
  // Perlica
  [CombatSkillsType.PROTOCOL_ALPHA_BREACH]:           'Protocol \u03b1: Breach',
  [CombatSkillsType.PROTOCOL_OMEGA_STRIKE]:           'Protocol \u03c9: Strike',
  [CombatSkillsType.INSTANT_PROTOCOL_CHAIN]:          'Instant Protocol: Chain',
  [CombatSkillsType.PROTOCOL_EPSILON]:                'Protocol \u03b5: 70.41K',
  // Fluorite
  [CombatSkillsType.SIGNATURE_GUN_KATA]:              'Signature Gun Kata',
  [CombatSkillsType.TINY_SURPRISE]:                   'Tiny Surprise',
  [CombatSkillsType.FREE_GIVEAWAY]:                   'Free Giveaway',
  [CombatSkillsType.APEX_PRANKSTER]:                  'Apex Prankster',
  // Last Rite
  [CombatSkillsType.DANCE_OF_RIME]:                   'Dance of Rime',
  [CombatSkillsType.ESOTERIC_LEGACY]:                 'Esoteric Legacy',
  [CombatSkillsType.WINTERS_DEVOURER]:                "Winter's Devourer",
  [CombatSkillsType.VIGIL_SERVICES]:                  'Vigil Services',
  // Yvonne
  [CombatSkillsType.EXUBERANT_TRIGGER]:               'Exuberant Trigger',
  [CombatSkillsType.BRR_BRR_BOMB]:                    'Brr-Brr-Bomb \u03b2',
  [CombatSkillsType.FLASHFREEZER]:                     'Flashfreezer \u03c5-37',
  [CombatSkillsType.CRYOBLASTING_PISTOLIER]:           'Cryoblasting Pistolier',
  // Avywenna
  [CombatSkillsType.THUNDERLANCE_BLITZ]:               'Thunderlance: Blitz',
  [CombatSkillsType.THUNDERLANCE_INTERDICTION]:        'Thunderlance: Interdiction',
  [CombatSkillsType.THUNDERLANCE_STRIKE]:              'Thunderlance: Strike',
  [CombatSkillsType.THUNDERLANCE_FINAL_SHOCK]:         'Thunderlance: Final Shock',
  // Da Pan
  [CombatSkillsType.ROLLING_CUT]:                      'ROLLING CUT!',
  [CombatSkillsType.FLIP_DA_WOK]:                      'FLIP DA WOK!',
  [CombatSkillsType.MORE_SPICE]:                        'MORE SPICE!',
  [CombatSkillsType.CHOP_N_DUNK]:                       "CHOP 'N DUNK!",
  // Pogranichnik
  [CombatSkillsType.ALL_OUT_OFFENSIVE]:                 'All-Out Offensive',
  [CombatSkillsType.THE_PULVERIZING_FRONT]:             'The Pulverizing Front',
  [CombatSkillsType.FULL_MOON_SLASH]:                   'Full Moon Slash',
  [CombatSkillsType.SHIELDGUARD_BANNER]:                'Shieldguard Banner, Forward',
  // Alesh
  [CombatSkillsType.ROD_CASTING]:                       'Rod Casting',
  [CombatSkillsType.UNCONVENTIONAL_LURE]:               'Unconventional Lure',
  [CombatSkillsType.AUGER_ANGLING]:                     'Auger Angling',
  [CombatSkillsType.ONE_MONSTER_CATCH]:                  'One Monster Catch!',
  // Arclight
  [CombatSkillsType.SEEK_AND_HUNT]:                     'Seek and Hunt',
  [CombatSkillsType.TEMPESTUOUS_ARC]:                   'Tempestuous Arc',
  [CombatSkillsType.PEAL_OF_THUNDER]:                   'Peal of Thunder',
  [CombatSkillsType.EXPLODING_BLITZ]:                   'Exploding Blitz',
};

// ── Infliction event labels ────────────────────────────────────────────────

export const INFLICTION_EVENT_LABELS: Record<string, string> = {
  // Arts inflictions
  heatInfliction:       'Heat',
  cryoInfliction:       'Cryo',
  natureInfliction:     'Nature',
  electricInfliction:   'Electric',
  // Physical inflictions
  vulnerableInfliction: 'Vulnerable',
  // Arts reactions (derived event names use lowercase columnId)
  combustion:           'Combustion',
  solidification:       'Solidification',
  corrosion:            'Corrosion',
  electrification:      'Electrification',
  // Physical statuses
  breach:               'Breach',
  // Operator statuses (exchange status enum values)
  MELTING_FLAME:        'Melting Flame',
  THUNDERLANCE:         'Thunderlance',
  // Enemy statuses (applied via applyStatus frames)
  focus:                'Focus',
  FOCUS:                'Focus',
  SUSCEPTIBILITY:       'Susceptibility',
  // Team statuses
  ARTS_AMP:             'Arts Amp',
  SHIELD:               'Shield',
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

// ── Physical infliction / status labels ──────────────────────────────────────

export const PHYSICAL_INFLICTION_LABELS: Record<string, { label: string; color: string }> = {
  vulnerableInfliction: { label: 'Vulnerable', color: '#c0c8d0' },
};

export const PHYSICAL_INFLICTION_MICRO_COLUMNS = [
  { id: 'vuln-0', label: 'VULN', color: '#c0c8d0' },
  { id: 'vuln-1', label: 'VULN', color: '#c0c8d0' },
  { id: 'vuln-2', label: 'VULN', color: '#c0c8d0' },
  { id: 'vuln-3', label: 'VULN', color: '#c0c8d0' },
];

export const PHYSICAL_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  breach: { label: 'Breach', color: '#c0c8d0' },
};

export const TRIGGER_CONDITION_LABELS: Record<string, string> = {
  [TriggerConditionType.SKILL_POINT_RECOVERY_FROM_SKILL]: 'SP Recovery from Skill',
  [TriggerConditionType.FINAL_STRIKE]:                    'Final Strike',
  [TriggerConditionType.COMBUSTION]:                      'Combustion',
  [TriggerConditionType.SOLIDIFICATION]:                  'Solidification',
  [TriggerConditionType.CORROSION]:                       'Corrosion',
  [TriggerConditionType.ELECTRIFICATION]:                 'Electrification',
  [TriggerConditionType.DEFEAT_ENEMY]:                    'Defeat Enemy',
  [TriggerConditionType.CAST_BATTLE_SKILL]:               'Cast Battle Skill',
  [TriggerConditionType.CAST_COMBO_SKILL]:                'Cast Combo Skill',
  [TriggerConditionType.CAST_ULTIMATE]:                   'Cast Ultimate',
  [TriggerConditionType.APPLY_PHYSICAL_STATUS]:           'Apply Physical Status',
  [TriggerConditionType.APPLY_VULNERABILITY]:             'Apply Vulnerability',
  [TriggerConditionType.CRITICAL_HIT]:                    'Critical Hit',
  [TriggerConditionType.HP_TREATMENT]:                    'HP Treatment',
  [TriggerConditionType.HP_TREATMENT_EXCEEDS_MAX]:        'HP Treatment Exceeds Max',
  [TriggerConditionType.TEAM_CAST_BATTLE_SKILL]:          'Team Cast Battle Skill',
  [TriggerConditionType.APPLY_ARTS_INFLICTION]:           'Apply Arts Infliction',
  [TriggerConditionType.APPLY_HEAT_INFLICTION]:           'Apply Heat Infliction',
  [TriggerConditionType.APPLY_CRYO_INFLICTION]:           'Apply Cryo Infliction',
  [TriggerConditionType.APPLY_NATURE_INFLICTION]:         'Apply Nature Infliction',
  [TriggerConditionType.APPLY_ELECTRIC_INFLICTION]:       'Apply Electric Infliction',
  [TriggerConditionType.APPLY_ARTS_INFLICTION_2_STACKS]:  'Apply Arts Infliction (2+ stacks)',
  [TriggerConditionType.APPLY_BUFF]:                      'Apply Buff',
  [TriggerConditionType.HP_ABOVE_THRESHOLD]:              'HP Above Threshold',
  [TriggerConditionType.HP_BELOW_THRESHOLD]:              'HP Below Threshold',
  [TriggerConditionType.ULTIMATE_ENERGY_BELOW_THRESHOLD]: 'Ultimate Energy Below Threshold',
  [TriggerConditionType.OPERATOR_ATTACKED]:               'Operator Attacked',
  [TriggerConditionType.STAGGER]:                        'Stagger',
  [TriggerConditionType.STAGGER_NODE]:                   'Stagger Node',
};

export const PHYSICAL_STATUS_MICRO_COLUMNS = [
  { id: 'breach', label: 'BREACH', color: '#c0c8d0' },
];
