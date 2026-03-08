import { SkillType, Operator } from "../consts/viewTypes";
import { WeaponType } from "../consts/enums";

import laevatainSplash from "../assets/operators/Laevatain_Banner.webp";
import antalSplash from "../assets/operators/Antal_Banner.webp";
import akekuriSplash from "../assets/operators/Akekuri_Banner.webp";
import wulfgardSplash from "../assets/operators/Wulfgard_Banner.webp";
import ardeliaSplash from "../assets/operators/Ardelia_Banner.webp";

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
    rarity: 6,
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
        name: 'Flaming Cinders',
        defaultActiveDuration: 30,
        defaultLingeringDuration: 0,
        defaultCooldownDuration: 0,
        triggerCondition: null,
      },
      battle: {
        name: 'Smouldering Fire',
        defaultActiveDuration: 600,
        defaultLingeringDuration: 120,
        defaultCooldownDuration: 2160,
        triggerCondition: null,
      },
      combo: {
        name: 'Seethe',
        defaultActiveDuration: 840,
        defaultLingeringDuration: 0,
        defaultCooldownDuration: 0,
        triggerCondition: 'Enemy has Combustion',
      },
      ultimate: {
        name: 'Twilight',
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
    rarity: 4,
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
        name: 'Exchange Current',
        defaultActiveDuration: 24,
        defaultLingeringDuration: 0,
        defaultCooldownDuration: 0,
        triggerCondition: null,
      },
      battle: {
        name: 'Specified Research Subject',
        defaultActiveDuration: 960,
        defaultLingeringDuration: 240,
        defaultCooldownDuration: 1440,
        triggerCondition: null,
      },
      combo: {
        name: 'EMP Test Site',
        defaultActiveDuration: 360,
        defaultLingeringDuration: 480,
        defaultCooldownDuration: 0,
        triggerCondition: 'Enemy has Electrification',
      },
      ultimate: {
        name: 'Overclocked Moment',
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
    rarity: 4,
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
        name: 'Sword of Aspiration',
        defaultActiveDuration: 18,
        defaultLingeringDuration: 0,
        defaultCooldownDuration: 0,
        triggerCondition: null,
      },
      battle: {
        name: 'Burst of Passion',
        defaultActiveDuration: 720,
        defaultLingeringDuration: 0,
        defaultCooldownDuration: 1800,
        triggerCondition: null,
      },
      combo: {
        name: 'Flash and Dash',
        defaultActiveDuration: 480,
        defaultLingeringDuration: 960,
        defaultCooldownDuration: 0,
        triggerCondition: 'Enemy has Combustion',
      },
      ultimate: {
        name: 'Squad on Me',
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
    rarity: 5,
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
        name: 'Rapid-fire Akimbo',
        defaultActiveDuration: 20,
        defaultLingeringDuration: 0,
        defaultCooldownDuration: 0,
        triggerCondition: null,
      },
      battle: {
        name: 'Thermite Tracers',
        defaultActiveDuration: 1200,
        defaultLingeringDuration: 0,
        defaultCooldownDuration: 1440,
        triggerCondition: null,
      },
      combo: {
        name: 'Frag Grenade β',
        defaultActiveDuration: 360,
        defaultLingeringDuration: 1200,
        defaultCooldownDuration: 0,
        triggerCondition: 'Enemy has Combustion',
      },
      ultimate: {
        name: 'Wolven Fury',
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
    rarity: 6,
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
        name: 'Rocky Whispers',
        defaultActiveDuration: 22,
        defaultLingeringDuration: 0,
        defaultCooldownDuration: 0,
        triggerCondition: null,
      },
      battle: {
        name: 'Dolly Rush',
        defaultActiveDuration: 900,
        defaultLingeringDuration: 360,
        defaultCooldownDuration: 1800,
        triggerCondition: null,
      },
      combo: {
        name: 'Eruption Column',
        defaultActiveDuration: 480,
        defaultLingeringDuration: 600,
        defaultCooldownDuration: 0,
        triggerCondition: 'Enemy has Corrosion',
      },
      ultimate: {
        name: 'Wooly Party',
        defaultActiveDuration: 720,
        defaultLingeringDuration: 0,
        defaultCooldownDuration: 3600,
        triggerCondition: null,
      },
    },
  },
];

