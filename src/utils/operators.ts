import { SkillType, Operator, Enemy } from "../consts/viewTypes";
import { WeaponType } from "../consts/enums";

import laevatainSplash from "../assets/operators/laevatain_splash.webp";
import antalSplash from "../assets/operators/antal_splash.webp";
import akekuriSplash from "../assets/operators/akekuri_splash.webp";
import wulfgardSplash from "../assets/operators/wulfgard_splash.webp";
import ardeliaSplash from "../assets/operators/ardelia_splash.webp";

export const SKILL_TYPES: Record<string, SkillType> = {
  BASIC:   'basic',
  BATTLE:  'battle',
  COMBO:   'combo',
  ULTIMATE:'ultimate',
};

export const SKILL_LABELS: Record<SkillType, string> = {
  basic:   'BASIC',
  battle:  'BATTLE',
  combo:   'COMBO',
  ultimate:'ULT',
};

export const SKILL_ORDER: SkillType[] = ['basic', 'battle', 'combo', 'ultimate'];

// Durations are in frames (120 fps)
export const SAMPLE_OPERATORS: Operator[] = [
  {
    id: 'laevatain',
    name: 'Laevatain',
    color: '#f0a040',
    role: 'Striker',
    splash: laevatainSplash,
    weaponTypes: [WeaponType.SWORD],
    weapon: 'Never Rest',
    armor: 'Hot Work Exoskeleton',
    gloves: 'Hot Work Gauntlets',
    kit1: 'Hot Work Power Bank',
    kit2: 'Hot Work Power Cartridge',
    food: 'Ginseng Meat Stew',
    tactical: 'Stew Meeting',
    skills: {
      basic: {
        name: 'Heavy Strike',
        defaultActiveDuration: 30,
        defaultLingeringDuration: 0,
        defaultCooldownDuration: 0,
        triggerCondition: null,
      },
      battle: {
        name: 'Reaping Slash',
        defaultActiveDuration: 600,
        defaultLingeringDuration: 120,
        defaultCooldownDuration: 2160,
        triggerCondition: null,
      },
      combo: {
        name: 'Execution Stance',
        defaultActiveDuration: 840,
        defaultLingeringDuration: 0,
        defaultCooldownDuration: 0,
        triggerCondition: 'Enemy DEF below 50%',
      },
      ultimate: {
        name: 'Hellfire Incarnation',
        defaultActiveDuration: 1200,
        defaultLingeringDuration: 0,
        defaultCooldownDuration: 3600,
        triggerCondition: null,
      },
    },
  },
  {
    id: 'antal',
    name: 'Antal',
    color: '#55aadd',
    role: 'Supporter',
    splash: antalSplash,
    weaponTypes: [WeaponType.ARTS_UNIT],
    weapon: 'Stanza of Memorials',
    armor: 'Hot Work Exoskeleton',
    gloves: 'Hot Work Gauntlets',
    kit1: 'Hot Work Power Bank',
    kit2: 'Hot Work Pyrometer',
    food: 'Ginseng Meat Stew',
    tactical: 'Stew Meeting',
    skills: {
      basic: {
        name: 'Dragon Pulse',
        defaultActiveDuration: 24,
        defaultLingeringDuration: 0,
        defaultCooldownDuration: 0,
        triggerCondition: null,
      },
      battle: {
        name: 'Thunder Guard',
        defaultActiveDuration: 960,
        defaultLingeringDuration: 240,
        defaultCooldownDuration: 1440,
        triggerCondition: null,
      },
      combo: {
        name: 'Storm Aegis',
        defaultActiveDuration: 360,
        defaultLingeringDuration: 480,
        defaultCooldownDuration: 0,
        triggerCondition: 'Enemy has ElectricInfliction',
      },
      ultimate: {
        name: 'Primordial Tempest',
        defaultActiveDuration: 600,
        defaultLingeringDuration: 0,
        defaultCooldownDuration: 3000,
        triggerCondition: null,
      },
    },
  },
  {
    id: 'akekuri',
    name: 'Akekuri',
    color: '#e05555',
    role: 'Vanguard',
    splash: akekuriSplash,
    weaponTypes: [WeaponType.SWORD],
    weapon: 'Thermite Cutter',
    armor: 'Hot Work Exoskeleton',
    gloves: 'Hot Work Gauntlets T1',
    kit1: 'Hot Work Power Cartridge',
    kit2: 'Hot Work Pyrometer',
    food: 'Ginseng Meat Stew',
    tactical: 'Stew Meeting',
    skills: {
      basic: {
        name: 'Slash',
        defaultActiveDuration: 18,
        defaultLingeringDuration: 0,
        defaultCooldownDuration: 0,
        triggerCondition: null,
      },
      battle: {
        name: 'Flame Surge',
        defaultActiveDuration: 720,
        defaultLingeringDuration: 0,
        defaultCooldownDuration: 1800,
        triggerCondition: null,
      },
      combo: {
        name: 'Searing Edge',
        defaultActiveDuration: 480,
        defaultLingeringDuration: 960,
        defaultCooldownDuration: 0,
        triggerCondition: 'Enemy has HeatInfliction',
      },
      ultimate: {
        name: 'Inferno Blaze',
        defaultActiveDuration: 480,
        defaultLingeringDuration: 720,
        defaultCooldownDuration: 3360,
        triggerCondition: null,
      },
    },
  },
  {
    id: 'wulfgard',
    name: 'Wulfgard',
    color: '#9060e8',
    role: 'Caster',
    splash: wulfgardSplash,
    weaponTypes: [WeaponType.HANDCANNON],
    weapon: 'Forgeborn Scathe',
    armor: 'Hot Work Exoskeleton',
    gloves: 'Hot Work Gauntlets',
    kit1: 'Hot Work Power Bank',
    kit2: 'Hot Work Power Cartridge',
    food: 'Ginseng Meat Stew',
    tactical: 'Stew Meeting',
    skills: {
      basic: {
        name: 'Void Bolt',
        defaultActiveDuration: 20,
        defaultLingeringDuration: 0,
        defaultCooldownDuration: 0,
        triggerCondition: null,
      },
      battle: {
        name: 'Twilight Veil',
        defaultActiveDuration: 1200,
        defaultLingeringDuration: 0,
        defaultCooldownDuration: 1440,
        triggerCondition: null,
      },
      combo: {
        name: 'Void Resonance',
        defaultActiveDuration: 360,
        defaultLingeringDuration: 1200,
        defaultCooldownDuration: 0,
        triggerCondition: 'Enemy has HeatInfliction',
      },
      ultimate: {
        name: 'Void Collapse',
        defaultActiveDuration: 360,
        defaultLingeringDuration: 0,
        defaultCooldownDuration: 4200,
        triggerCondition: null,
      },
    },
  },
  {
    id: 'ardelia',
    name: 'Ardelia',
    color: '#33cc88',
    role: 'Defender',
    splash: ardeliaSplash,
    weaponTypes: [WeaponType.POLEARM],
    weapon: 'Verdant Lance',
    armor: 'Hot Work Exoskeleton',
    gloves: 'Hot Work Gauntlets',
    kit1: 'Hot Work Power Bank',
    kit2: 'Hot Work Pyrometer',
    food: 'Ginseng Meat Stew',
    tactical: 'Stew Meeting',
    skills: {
      basic: {
        name: 'Piercing Thrust',
        defaultActiveDuration: 22,
        defaultLingeringDuration: 0,
        defaultCooldownDuration: 0,
        triggerCondition: null,
      },
      battle: {
        name: 'Verdant Shield',
        defaultActiveDuration: 900,
        defaultLingeringDuration: 360,
        defaultCooldownDuration: 1800,
        triggerCondition: null,
      },
      combo: {
        name: 'Nature\'s Embrace',
        defaultActiveDuration: 480,
        defaultLingeringDuration: 600,
        defaultCooldownDuration: 0,
        triggerCondition: 'Enemy has NatureInfliction',
      },
      ultimate: {
        name: 'Gaia\'s Bulwark',
        defaultActiveDuration: 720,
        defaultLingeringDuration: 0,
        defaultCooldownDuration: 3600,
        triggerCondition: null,
      },
    },
  },
];

export const ENEMY: Enemy = {
  id: 'enemy',
  name: 'Target Enemy',
  statuses: [
    { id: 'heatInfliction',   label: 'HEAT',   color: '#ff5522' },
    { id: 'natureInfliction', label: 'NATURE', color: '#33cc66' },
  ],
};
