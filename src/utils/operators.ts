import { SkillType, Operator, Enemy } from '../model/types';

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
    id: 'perlica',
    name: 'Perlica',
    color: '#4488ff',
    role: 'Support',
    weapon: 'Arcane Staff +4',
    armor: 'Phase Shift Vest',
    gloves: 'Signal Amplifier',
    kit1: 'Energy Flask',
    kit2: 'Revive Crystal',
    food: 'Combat Ration',
    tactical: 'Resonance Grenade ×3',
    skills: {
      basic: {
        name: 'Staff Strike',
        defaultActiveDuration: 24,
        defaultLingeringDuration: 0,
        defaultCooldownDuration: 0,
        triggerCondition: null,
      },
      battle: {
        name: 'Resonance Field',
        defaultActiveDuration: 960,
        defaultLingeringDuration: 240,
        defaultCooldownDuration: 1440,
        triggerCondition: null,
      },
      combo: {
        name: 'Arc Pulse',
        defaultActiveDuration: 360,
        defaultLingeringDuration: 480,
        defaultCooldownDuration: 0,
        triggerCondition: 'Enemy has NatureInfliction',
      },
      ultimate: {
        name: 'Arcane Nova',
        defaultActiveDuration: 600,
        defaultLingeringDuration: 0,
        defaultCooldownDuration: 3000,
        triggerCondition: null,
      },
    },
  },
  {
    id: 'aster',
    name: 'Aster',
    color: '#e05555',
    role: 'Attacker',
    weapon: 'Thermal Blade III',
    armor: 'Assault Weave',
    gloves: 'Combat Grip',
    kit1: 'Adrenaline Vial',
    kit2: 'Ammo Pack',
    food: 'Protein Gel',
    tactical: 'Incendiary Round ×5',
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
    id: 'laevatein',
    name: 'Laevatein',
    color: '#f0a040',
    role: 'Attacker',
    weapon: 'Executioner Blade',
    armor: 'Ironweave Vest',
    gloves: 'Power Knuckle',
    kit1: 'Defense Breaker',
    kit2: 'Stamina Pill',
    food: 'Energy Bar',
    tactical: 'Smoke Grenade ×3',
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
    id: 'eterna',
    name: 'Civ. Eterna',
    color: '#9060e8',
    role: 'Caster',
    weapon: 'Void Scepter',
    armor: 'Ether Coat',
    gloves: 'Phase Gloves',
    kit1: 'Arts Amplifier',
    kit2: 'Mana Crystal',
    food: 'Focus Tonic',
    tactical: 'Phase Disruptor ×2',
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
        triggerCondition: 'Enemy has NatureInfliction + HeatInfliction',
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
];

export const ENEMY: Enemy = {
  id: 'enemy',
  name: 'Target Enemy',
  statuses: [
    { id: 'heatInfliction',   label: 'HEAT',   color: '#ff5522' },
    { id: 'natureInfliction', label: 'NATURE', color: '#33cc66' },
  ],
};
