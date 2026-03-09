/**
 * Operator registry — single source of truth for view-layer operator data.
 *
 * Combines:
 * - Model operator instances (name, rarity, weaponTypes, ultimateEnergyCost)
 * - Display config (color, splash art, equipment names)
 * - Skill timing data (manual game knowledge — activation/active/cooldown frames)
 * - skills.json GAUGE_MAX for ultimateEnergyCost
 */
import { Operator as ViewOperator, SkillDef } from '../../consts/viewTypes';
import { OperatorClassType } from '../../consts/enums';
import { LaevatainOperator } from './laevatainOperator';
import { AntalOperator } from './antalOperator';
import { AkekuriOperator } from './akekuriOperator';
import { WulfgardOperator } from './wulfgardOperator';
import { ArdeliaOperator } from './ardeliaOperator';
import { Operator as ModelOperator } from './operator';
import skillsData from '../game-data/skills.json';

import laevatainSplash from '../../assets/operators/Laevatain_Banner.webp';
import antalSplash from '../../assets/operators/Antal_Banner.webp';
import akekuriSplash from '../../assets/operators/Akekuri_Banner.webp';
import wulfgardSplash from '../../assets/operators/Wulfgard_Banner.webp';
import ardeliaSplash from '../../assets/operators/Ardelia_Banner.webp';

// ── Role display names ──────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  [OperatorClassType.GUARD]: 'Guard',
  [OperatorClassType.CASTER]: 'Caster',
  [OperatorClassType.STRIKER]: 'Striker',
  [OperatorClassType.VANGUARD]: 'Vanguard',
  [OperatorClassType.DEFENDER]: 'Defender',
  [OperatorClassType.SUPPORTER]: 'Supporter',
};

// ── Per-operator display config ─────────────────────────────────────────────

interface OperatorDisplayConfig {
  id: string;
  color: string;
  splash?: string;
  weapon: string;
  armor: string;
  gloves: string;
  kit1: string;
  kit2: string;
  food: string;
  tactical: string;
  /** Skill timing data — manual game knowledge (durations in frames at 120fps). */
  skills: Record<string, SkillDef>;
}

// ── skills.json GAUGE_MAX lookup ────────────────────────────────────────────

function getUltimateGaugeMax(operatorKey: string): number {
  const opData = (skillsData as any).operators?.[operatorKey];
  if (!opData?.ULTIMATE) return 0;
  const ultKey = Object.keys(opData.ULTIMATE)[0];
  if (!ultKey) return 0;
  return opData.ULTIMATE[ultKey][`${ultKey}_GAUGE_MAX`] ?? 0;
}

// ── Registry entries ────────────────────────────────────────────────────────

const DISPLAY_CONFIGS: OperatorDisplayConfig[] = [
  {
    id: 'laevatain',
    color: '#f0a040',
    splash: laevatainSplash,
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
        defaultActivationDuration: 30,
        defaultActiveDuration: 0,
        defaultCooldownDuration: 0,
        triggerCondition: null,
      },
      battle: {
        name: 'Smouldering Fire',
        defaultActivationDuration: 600,
        defaultActiveDuration: 120,
        defaultCooldownDuration: 2160,
        triggerCondition: null,
      },
      combo: {
        name: 'Seethe',
        defaultActivationDuration: 840,
        defaultActiveDuration: 0,
        defaultCooldownDuration: 0,
        triggerCondition: 'Enemy has Combustion',
      },
      ultimate: {
        name: 'Twilight',
        defaultActivationDuration: 284,
        defaultActiveDuration: 1800,
        defaultCooldownDuration: 1200,
        triggerCondition: null,
      },
    },
  },
  {
    id: 'antal',
    color: '#55aadd',
    splash: antalSplash,
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
        defaultActivationDuration: 24,
        defaultActiveDuration: 0,
        defaultCooldownDuration: 0,
        triggerCondition: null,
      },
      battle: {
        name: 'Specified Research Subject',
        defaultActivationDuration: 960,
        defaultActiveDuration: 240,
        defaultCooldownDuration: 1440,
        triggerCondition: null,
      },
      combo: {
        name: 'EMP Test Site',
        defaultActivationDuration: 360,
        defaultActiveDuration: 480,
        defaultCooldownDuration: 0,
        triggerCondition: 'Enemy has Electrification',
      },
      ultimate: {
        name: 'Overclocked Moment',
        defaultActivationDuration: 600,
        defaultActiveDuration: 0,
        defaultCooldownDuration: 3000,
        triggerCondition: null,
      },
    },
  },
  {
    id: 'akekuri',
    color: '#e05555',
    splash: akekuriSplash,
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
        defaultActivationDuration: 18,
        defaultActiveDuration: 0,
        defaultCooldownDuration: 0,
        triggerCondition: null,
      },
      battle: {
        name: 'Burst of Passion',
        defaultActivationDuration: 720,
        defaultActiveDuration: 0,
        defaultCooldownDuration: 1800,
        triggerCondition: null,
      },
      combo: {
        name: 'Flash and Dash',
        defaultActivationDuration: 480,
        defaultActiveDuration: 960,
        defaultCooldownDuration: 0,
        triggerCondition: 'Enemy has Combustion',
      },
      ultimate: {
        name: 'Squad on Me',
        defaultActivationDuration: 480,
        defaultActiveDuration: 720,
        defaultCooldownDuration: 3360,
        triggerCondition: null,
      },
    },
  },
  {
    id: 'wulfgard',
    color: '#9060e8',
    splash: wulfgardSplash,
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
        defaultActivationDuration: 20,
        defaultActiveDuration: 0,
        defaultCooldownDuration: 0,
        triggerCondition: null,
      },
      battle: {
        name: 'Thermite Tracers',
        defaultActivationDuration: 1200,
        defaultActiveDuration: 0,
        defaultCooldownDuration: 1440,
        triggerCondition: null,
      },
      combo: {
        name: 'Frag Grenade β',
        defaultActivationDuration: 360,
        defaultActiveDuration: 1200,
        defaultCooldownDuration: 0,
        triggerCondition: 'Enemy has Combustion',
      },
      ultimate: {
        name: 'Wolven Fury',
        defaultActivationDuration: 360,
        defaultActiveDuration: 0,
        defaultCooldownDuration: 4200,
        triggerCondition: null,
      },
    },
  },
  {
    id: 'ardelia',
    color: '#33cc88',
    splash: ardeliaSplash,
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
        defaultActivationDuration: 22,
        defaultActiveDuration: 0,
        defaultCooldownDuration: 0,
        triggerCondition: null,
      },
      battle: {
        name: 'Dolly Rush',
        defaultActivationDuration: 900,
        defaultActiveDuration: 360,
        defaultCooldownDuration: 1800,
        triggerCondition: null,
      },
      combo: {
        name: 'Eruption Column',
        defaultActivationDuration: 480,
        defaultActiveDuration: 600,
        defaultCooldownDuration: 0,
        triggerCondition: 'Enemy has Corrosion',
      },
      ultimate: {
        name: 'Wooly Party',
        defaultActivationDuration: 720,
        defaultActiveDuration: 0,
        defaultCooldownDuration: 3600,
        triggerCondition: null,
      },
    },
  },
];

// ── Model operator factories (instantiated at default level 90) ─────────────

const MODEL_FACTORIES: Record<string, () => ModelOperator & { ultimate: { ultimateEnergyCost: number } }> = {
  laevatain: () => new LaevatainOperator({ level: 90 }),
  antal: () => new AntalOperator({ level: 90 }),
  akekuri: () => new AkekuriOperator({ level: 90 }),
  wulfgard: () => new WulfgardOperator({ level: 90 }),
  ardelia: () => new ArdeliaOperator({ level: 90 }),
};

// skills.json key mapping (operator ID → skills.json key)
const SKILLS_JSON_KEYS: Record<string, string> = {
  laevatain: 'LAEVATAIN',
  antal: 'ANTAL',
  akekuri: 'AKEKURI',
  wulfgard: 'WULFGARD',
  ardelia: 'ARDELIA',
};

// ── Build view operators ────────────────────────────────────────────────────

function buildViewOperator(config: OperatorDisplayConfig): ViewOperator {
  const factory = MODEL_FACTORIES[config.id];
  if (!factory) throw new Error(`No model factory for operator: ${config.id}`);

  const model = factory();
  const jsonKey = SKILLS_JSON_KEYS[config.id];
  const gaugeMax = jsonKey ? getUltimateGaugeMax(jsonKey) : model.ultimate.ultimateEnergyCost;

  return {
    id: config.id,
    name: model.name,
    color: config.color,
    role: ROLE_LABELS[model.operatorClass] ?? model.operatorClass,
    rarity: model.operatorRarity,
    splash: config.splash,
    weaponTypes: model.weaponTypes,
    weapon: config.weapon,
    armor: config.armor,
    gloves: config.gloves,
    kit1: config.kit1,
    kit2: config.kit2,
    food: config.food,
    tactical: config.tactical,
    skills: config.skills as Record<string, SkillDef>,
    ultimateEnergyCost: gaugeMax,
  };
}

export const ALL_OPERATORS: ViewOperator[] = DISPLAY_CONFIGS.map(buildViewOperator);
