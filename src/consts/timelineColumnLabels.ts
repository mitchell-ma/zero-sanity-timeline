import { CombatSkillsType, PhysicalStatusType, StatusType } from './enums';
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
  FRAGILITY            = 'FRAGILITY',
  WEAPON_BUFF          = 'WEAPON',
  GEAR_BUFF            = 'GEAR',
  TACTICAL             = 'TACTICAL',
  STATUS               = 'STATUS',
  STAGGER              = 'STAGGER',
  STAGGER_FRAILTY      = 'STAGGER FRAILTY',
  SCORCHING_FANGS      = 'SCORCHING FANGS',
  SCORCHING_HEART      = 'SCORCHING HEART',
  SCORCHING_HEART_EFFECT = 'SCORCHING HEART',
  ORIGINIUM_CRYSTAL    = 'CRYSTAL',
  WILDLAND_TREKKER     = 'WILDLAND TREKKER',
  MESSENGERS_SONG      = "MESSENGER'S SONG",
  OTHER                = 'OTHER',
}

export const STATUS_LABELS: Record<StatusType, string> = {
  [StatusType.COMBUSTION]:      'Combustion',
  [StatusType.SOLIDIFICATION]:  'Solidification',
  [StatusType.CORROSION]:       'Corrosion',
  [StatusType.ELECTRIFICATION]: 'Electrification',
  [StatusType.MELTING_FLAME]:   'Melting Flame',
  [StatusType.THUNDERLANCE]:    'Thunderlance',
  [StatusType.CRIT_STACKS]:     'Crit Stacks',
  [StatusType.SQUAD_BUFF]:      'Squad Buff',
  [StatusType.SCORCHING_FANGS]: 'Scorching Fangs',
  [StatusType.LINK]:            'Link',
  [StatusType.ARTS_AMP]:        'Arts Amp',
  [StatusType.SHIELD]:          'Shield',
  [StatusType.UNBRIDLED_EDGE]:  'Unbridled Edge',
  [StatusType.WILDLAND_TREKKER]: 'Wildland Trekker',
  [StatusType.MESSENGERS_SONG]: "Messenger's Song",
  [StatusType.SCORCHING_HEART]: 'Scorching Heart',
  [StatusType.SCORCHING_HEART_EFFECT]: 'Scorching Heart',
  [StatusType.FOCUS]:           'Focus',
  [StatusType.SUSCEPTIBILITY]:  'Susceptibility',
  [StatusType.FRAGILITY]:       'Fragility',
  [StatusType.ORIGINIUM_CRYSTAL]: 'Originium Crystal',
  [StatusType.WEAKEN]:          'Weaken',
  [StatusType.DMG_REDUCTION]:   'DMG Reduction',
  [StatusType.PROTECTION]:      'Protection',
  [StatusType.LIFT]:            'Lift',
  [StatusType.KNOCK_DOWN]:      'Knock Down',
  [StatusType.CRUSH]:           'Crush',
  [StatusType.BREACH]:          'Breach',
  [StatusType.SHATTER]:         'Shatter',
  // Gear set effects
  [StatusType.GEAR_BUFF]:       'Gear Buff',
  // Potential buffs
  [StatusType.LAEVATAIN_POTENTIAL5_PROOF_OF_EXISTENCE]:      'Proof of Existence',
  [StatusType.AKEKURI_POTENTIAL1_POSITIVE_FEEDBACK]:       'Positive Feedback',
  [StatusType.AKEKURI_POTENTIAL5_TEMPO_OF_AWARENESS]:      'Tempo of Awareness',
  [StatusType.ARDELIA_POTENTIAL5_VOLCANIC_STEAM]:          'Volcanic Steam',
  [StatusType.ENDMINISTRATOR_POTENTIAL1_FINAL_AWAKENING]:         'Final Awakening',
  [StatusType.ENDMINISTRATOR_POTENTIAL2_REFLECTION_OF_AUTHORITY]: 'Reflection of Authority',
  [StatusType.ENDMINISTRATOR_POTENTIAL5]:       'Endministrator P5',
  [StatusType.CHEN_QIANYU_POTENTIAL1_SHADOWLESS]:              'Shadowless',
  [StatusType.GILBERTA_POTENTIAL5_SPECIAL_MAIL]:            'Special Mail',
  [StatusType.LIFENG_POTENTIAL5_UNREMITTING]:             'Unremitting',
  [StatusType.EMBER_POTENTIAL5_THE_STEEL_OATH]:          'The Steel Oath',
  [StatusType.PERLICA_POTENTIAL3_SUPERVISORY_DUTIES]:      'Supervisory Duties',
  [StatusType.ARCLIGHT_POTENTIAL5_SERVANT_OF_THE_WILDLANDS]: 'Servant of the Wildlands',
  [StatusType.ESTELLA_POTENTIAL5_SURVIVAL_IS_A_WIN]:       'Survival is a Win',
  [StatusType.CATCHER_POTENTIAL1_MULTI_LAYERED_READINESS]: 'Multi-layered Readiness',
  [StatusType.FLUORITE_POTENTIAL5_CRAVER_OF_CHAOS]:         'Craver of Chaos',
  [StatusType.LAST_RITE_POTENTIAL5_WINTER_IS_RETURNING]:     'Winter is Returning',
  [StatusType.YVONNE_POTENTIAL5_EXPERT_MECHCRAFTER]:      'Expert Mechcrafter',
  [StatusType.POGRANICHNIK_POTENTIAL5_NEWLY_FORGED_BLADE]:      'Newly Forged Blade',
};

// ── Combat skill display names ──────────────────────────────────────────────

export const COMBAT_SKILL_LABELS: Record<CombatSkillsType, string> = {
  // Common
  [CombatSkillsType.DASH]:                                'Dash',
  [CombatSkillsType.FINISHER]:                            'Finisher',
  [CombatSkillsType.DIVE]:                                'Dive Attack',

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
  [CombatSkillsType.EXUBERANT_TRIGGER_ENHANCED]:      'Exuberant Trigger (Enhanced)',
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
  [CombatSkillsType.TEMPESTUOUS_ARC_EMPOWERED]:        'Tempestuous Arc (Empowered)',
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
  // Enemy debuffs
  SCORCHING_HEART:      'Scorching Heart',
  SCORCHING_HEART_EFFECT: 'Scorching Heart',
  FRAGILITY:            'Fragility',
  ORIGINIUM_CRYSTAL:    'Originium Crystal',
  'originium-crystal':  'Originium Crystal',
  WILDLAND_TREKKER:     'Wildland Trekker',
  // Stagger status events
  STAGGER_NODE:         'Node Stagger',
  STAGGER:              'Stagger',
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
  [PhysicalStatusType.LIFT]: { label: 'Lift', color: '#c0c8d0' },
  [PhysicalStatusType.KNOCK_DOWN]: { label: 'Knock Down', color: '#c0c8d0' },
  [PhysicalStatusType.CRUSH]: { label: 'Crush', color: '#c0c8d0' },
  [PhysicalStatusType.BREACH]: { label: 'Breach', color: '#c0c8d0' },
};


export const PHYSICAL_STATUS_MICRO_COLUMNS = [
  { id: PhysicalStatusType.LIFT, label: 'LIFT', color: '#c0c8d0' },
  { id: PhysicalStatusType.KNOCK_DOWN, label: 'KD', color: '#c0c8d0' },
  { id: PhysicalStatusType.CRUSH, label: 'CRUSH', color: '#c0c8d0' },
  { id: PhysicalStatusType.BREACH, label: 'BREACH', color: '#c0c8d0' },
];
