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
import { CombatSkillsType, OperatorClassType } from '../../consts/enums';
import { TRIGGER_CAPABILITIES } from '../../consts/triggerCapabilities';
import { LaevatainOperator } from './laevatainOperator';
import { AntalOperator } from './antalOperator';
import { AkekuriOperator } from './akekuriOperator';
import { WulfgardOperator } from './wulfgardOperator';
import { ArdeliaOperator } from './ardeliaOperator';
import { EndministratorOperator } from './endministratorOperator';
import { LifengOperator } from './lifengOperator';
import { ChenQianyuOperator } from './chenQianyuOperator';
import { EstellaOperator } from './estellaOperator';
import { EmberOperator } from './emberOperator';
import { SnowshineOperator } from './snowshineOperator';
import { CatcherOperator } from './catcherOperator';
import { GilbertaOperator } from './gilbertaOperator';
import { XaihiOperator } from './xaihiOperator';
import { PerlicaOperator } from './perlicaOperator';
import { FluoriteOperator } from './fluoriteOperator';
import { LastRiteOperator } from './lastRiteOperator';
import { YvonneOperator } from './yvonneOperator';
import { AvywennaOperator } from './avywennaOperator';
import { DaPanOperator } from './daPanOperator';
import { PogranichnikOperator } from './pogranichnikOperator';
import { AleshOperator } from './aleshOperator';
import { ArclightOperator } from './arclightOperator';
import { Operator as ModelOperator } from './operator';
import skillsData from '../game-data/skills.json';

import laevatainSplash from '../../assets/operators/Laevatain_Banner.webp';
import antalSplash from '../../assets/operators/Antal_Banner.webp';
import akekuriSplash from '../../assets/operators/Akekuri_Banner.webp';
import wulfgardSplash from '../../assets/operators/Wulfgard_Banner.webp';
import ardeliaSplash from '../../assets/operators/Ardelia_Banner.webp';
import endministratorSplash from '../../assets/operators/Endministrator_(Male)_Banner.webp';
import lifengSplash from '../../assets/operators/Lifeng_Banner.webp';
import chenQianyuSplash from '../../assets/operators/Chen_Qianyu_Banner.webp';
import estellaSplash from '../../assets/operators/Estella_Banner.webp';
import emberSplash from '../../assets/operators/Ember_Banner.webp';
import snowshineSplash from '../../assets/operators/Snowshine_Banner.webp';
import gilbertaSplash from '../../assets/operators/Gilberta_Banner.webp';
import xaihiSplash from '../../assets/operators/Xaihi_Banner.webp';
import perlicaSplash from '../../assets/operators/Perlica_Banner.webp';
import fluoriteSplash from '../../assets/operators/Fluorite_Banner.webp';
import lastRiteSplash from '../../assets/operators/Last_Rite_Banner.webp';
import yvonneSplash from '../../assets/operators/Yvonne_Banner.webp';
import avywennaSplash from '../../assets/operators/Avywenna_Banner.webp';
import daPanSplash from '../../assets/operators/Da_Pan_Banner.webp';
import pogranichnikSplash from '../../assets/operators/Pogranichnik_Banner.webp';
import aleshSplash from '../../assets/operators/Alesh_Banner.webp';
import arclightSplash from '../../assets/operators/Arclight_Banner.webp';
import catcherSplash from '../../assets/operators/Catcher_Banner.webp';

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

// ── Helper: compute skill durations from skills.json ─────────────────────────

function dur(seconds: number): number { return Math.round(seconds * 120); }

function getSkillData(opKey: string) {
  const op = (skillsData as any).operators?.[opKey];
  if (!op) throw new Error(`No skills.json data for ${opKey}`);
  const bsKey = `${opKey}_BATTLE_SKILL`;
  const csKey = `${opKey}_COMBO_SKILL`;
  const ultKey = `${opKey}_ULTIMATE`;
  return {
    battleDur: dur(op.BATTLE_SKILL[bsKey][`${bsKey}_DURATION`]),
    comboDur: dur(op.COMBO_SKILL[csKey][`${csKey}_DURATION`]),
    comboCd: dur(op.COMBO_SKILL[csKey][`${csKey}_COOLDOWN`]),
    ultDur: dur(op.ULTIMATE[ultKey][`${ultKey}_DURATION`]),
  };
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

const L = getSkillData('LAEVATAIN');
const AK = getSkillData('AKEKURI');
const AN = getSkillData('ANTAL');
const WF = getSkillData('WULFGARD');
const AR = getSkillData('ARDELIA');
const EN = getSkillData('ENDMINISTRATOR');
const LF = getSkillData('LIFENG');
const CQ = getSkillData('CHENQIANYU');
const ES = getSkillData('ESTELLA');
const EM = getSkillData('EMBER');
const SN = getSkillData('SNOWSHINE');
const CA = getSkillData('CATCHER');
const GI = getSkillData('GILBERTA');
const XA = getSkillData('XAIHI');
const PE = getSkillData('PERLICA');
const FL = getSkillData('FLUORITE');
const LR = getSkillData('LASTRITE');
const YV = getSkillData('YVONNE');
const AV = getSkillData('AVYWENNA');
const DP = getSkillData('DAPAN');
const PG = getSkillData('POGRANICHNK');
const AL = getSkillData('ALESH');
const AC = getSkillData('ARCLIGHT');

const PLACEHOLDER_EQUIPMENT = {
  armor: 'Hot Work Exoskeleton',
  gloves: 'Hot Work Gauntlets',
  kit1: 'Hot Work Power Bank',
  kit2: 'Hot Work Power Cartridge',
  food: 'Ginseng Meat Stew',
  tactical: 'Stew Meeting',
};

const DISPLAY_CONFIGS: OperatorDisplayConfig[] = [
  // ── Laevatain ───────────────────────────────────────────────────────────────
  {
    id: 'laevatain',
    color: '#f0a040',
    splash: laevatainSplash,
    weapon: 'Never Rest',
    ...PLACEHOLDER_EQUIPMENT,

    skills: {
      basic: { name: CombatSkillsType.FLAMING_CINDERS, defaultActivationDuration: 30, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      battle: { name: CombatSkillsType.SMOULDERING_FIRE, defaultActivationDuration: L.battleDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      combo: { name: CombatSkillsType.SEETHE, defaultActivationDuration: L.comboDur, defaultActiveDuration: 0, defaultCooldownDuration: L.comboCd, triggerCondition: 'Enemy has Combustion or Corrosion' },
      ultimate: { name: CombatSkillsType.TWILIGHT, defaultActivationDuration: L.ultDur, defaultActiveDuration: 1800, defaultCooldownDuration: 1200, triggerCondition: null },
    },
  },
  // ── Antal ───────────────────────────────────────────────────────────────────
  {
    id: 'antal',
    color: '#55aadd',
    splash: antalSplash,
    weapon: 'Stanza of Memorials',
    ...PLACEHOLDER_EQUIPMENT,
    kit2: 'Hot Work Pyrometer',

    skills: {
      basic: { name: CombatSkillsType.EXCHANGE_CURRENT, defaultActivationDuration: 24, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      battle: { name: CombatSkillsType.SPECIFIED_RESEARCH_SUBJECT, defaultActivationDuration: 960, defaultActiveDuration: 240, defaultCooldownDuration: 1440, triggerCondition: null },
      combo: { name: CombatSkillsType.EMP_TEST_SITE, defaultActivationDuration: 360, defaultActiveDuration: 480, defaultCooldownDuration: 0, triggerCondition: 'Enemy has Electrification' },
      ultimate: { name: CombatSkillsType.OVERCLOCKED_MOMENT, defaultActivationDuration: 600, defaultActiveDuration: 0, defaultCooldownDuration: 3000, triggerCondition: null },
    },
  },
  // ── Akekuri ─────────────────────────────────────────────────────────────────
  {
    id: 'akekuri',
    color: '#e05555',
    splash: akekuriSplash,
    weapon: 'Thermite Cutter',
    ...PLACEHOLDER_EQUIPMENT,
    gloves: 'Hot Work Gauntlets T1',
    kit1: 'Hot Work Power Cartridge',
    kit2: 'Hot Work Pyrometer',

    skills: {
      basic: { name: CombatSkillsType.SWORD_OF_ASPIRATION, defaultActivationDuration: 18, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      battle: { name: CombatSkillsType.BURST_OF_PASSION, defaultActivationDuration: AK.battleDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      combo: { name: CombatSkillsType.FLASH_AND_DASH, defaultActivationDuration: AK.comboDur, defaultActiveDuration: 0, defaultCooldownDuration: AK.comboCd, triggerCondition: 'Enemy has Combustion' },
      ultimate: { name: CombatSkillsType.SQUAD_ON_ME, defaultActivationDuration: AK.ultDur, defaultActiveDuration: 720, defaultCooldownDuration: 3360, triggerCondition: null },
    },
  },
  // ── Wulfgard ────────────────────────────────────────────────────────────────
  {
    id: 'wulfgard',
    color: '#9060e8',
    splash: wulfgardSplash,
    weapon: 'Forgeborn Scathe',
    ...PLACEHOLDER_EQUIPMENT,

    skills: {
      basic: { name: CombatSkillsType.RAPID_FIRE_AKIMBO, defaultActivationDuration: 20, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      battle: { name: CombatSkillsType.THERMITE_TRACERS, defaultActivationDuration: WF.battleDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      combo: { name: CombatSkillsType.FRAG_GRENADE_BETA, defaultActivationDuration: WF.comboDur, defaultActiveDuration: 0, defaultCooldownDuration: WF.comboCd, triggerCondition: 'Enemy has Combustion' },
      ultimate: { name: CombatSkillsType.WOLVEN_FURY, defaultActivationDuration: WF.ultDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
    },
  },
  // ── Ardelia ─────────────────────────────────────────────────────────────────
  {
    id: 'ardelia',
    color: '#33cc88',
    splash: ardeliaSplash,
    weapon: 'Verdant Lance',
    ...PLACEHOLDER_EQUIPMENT,
    kit2: 'Hot Work Pyrometer',

    skills: {
      basic: { name: CombatSkillsType.ROCKY_WHISPERS, defaultActivationDuration: 22, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      battle: { name: CombatSkillsType.DOLLY_RUSH, defaultActivationDuration: AR.battleDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      combo: { name: CombatSkillsType.ERUPTION_COLUMN, defaultActivationDuration: AR.comboDur, defaultActiveDuration: 0, defaultCooldownDuration: AR.comboCd, triggerCondition: 'Enemy has Corrosion' },
      ultimate: { name: CombatSkillsType.WOOLY_PARTY, defaultActivationDuration: AR.ultDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
    },
  },
  // ── Endministrator ──────────────────────────────────────────────────────────
  {
    id: 'endministrator',
    color: '#ccbb44',
    splash: endministratorSplash,
    weapon: 'Endministrator Blade',
    ...PLACEHOLDER_EQUIPMENT,

    skills: {
      basic: { name: CombatSkillsType.DESTRUCTIVE_SEQUENCE, defaultActivationDuration: 20, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      battle: { name: CombatSkillsType.CONSTRUCTIVE_SEQUENCE, defaultActivationDuration: EN.battleDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      combo: { name: CombatSkillsType.SEALING_SEQUENCE, defaultActivationDuration: EN.comboDur, defaultActiveDuration: 0, defaultCooldownDuration: EN.comboCd, triggerCondition: 'Teammate casts combo skill' },
      ultimate: { name: CombatSkillsType.BOMBARDMENT_SEQUENCE, defaultActivationDuration: EN.ultDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
    },
  },
  // ── Lifeng ──────────────────────────────────────────────────────────────────
  {
    id: 'lifeng',
    color: '#dd8844',
    splash: lifengSplash,
    weapon: 'Vajra Fang',
    ...PLACEHOLDER_EQUIPMENT,

    skills: {
      basic: { name: CombatSkillsType.RUINATION, defaultActivationDuration: 24, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      battle: { name: CombatSkillsType.TURBID_AVATAR, defaultActivationDuration: LF.battleDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      combo: { name: CombatSkillsType.ASPECT_OF_WRATH, defaultActivationDuration: LF.comboDur, defaultActiveDuration: 0, defaultCooldownDuration: LF.comboCd, triggerCondition: 'Final Strike + Phys Suscept./Breach' },
      ultimate: { name: CombatSkillsType.HEART_OF_THE_UNMOVING, defaultActivationDuration: LF.ultDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
    },
  },
  // ── Chen Qianyu ─────────────────────────────────────────────────────────────
  {
    id: 'chenQianyu',
    color: '#4488cc',
    splash: chenQianyuSplash,
    weapon: 'Dawn Breaker',
    ...PLACEHOLDER_EQUIPMENT,

    skills: {
      basic: { name: CombatSkillsType.SOARING_BREAK, defaultActivationDuration: 20, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      battle: { name: CombatSkillsType.ASCENDING_STRIKE, defaultActivationDuration: CQ.battleDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      combo: { name: CombatSkillsType.SOAR_TO_THE_STARS, defaultActivationDuration: CQ.comboDur, defaultActiveDuration: 0, defaultCooldownDuration: CQ.comboCd, triggerCondition: 'Enemy becomes Vulnerable' },
      ultimate: { name: CombatSkillsType.BLADE_GALE, defaultActivationDuration: CQ.ultDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
    },
  },
  // ── Estella ─────────────────────────────────────────────────────────────────
  {
    id: 'estella',
    color: '#6699cc',
    splash: estellaSplash,
    weapon: 'Frost Spear',
    ...PLACEHOLDER_EQUIPMENT,

    skills: {
      basic: { name: CombatSkillsType.AUDIO_NOISE, defaultActivationDuration: 18, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      battle: { name: CombatSkillsType.ONOMATOPOEIA, defaultActivationDuration: ES.battleDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      combo: { name: CombatSkillsType.DISTORTION, defaultActivationDuration: ES.comboDur, defaultActiveDuration: 0, defaultCooldownDuration: ES.comboCd, triggerCondition: 'Enemy has Solidification' },
      ultimate: { name: CombatSkillsType.TREMOLO, defaultActivationDuration: ES.ultDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
    },
  },
  // ── Ember ───────────────────────────────────────────────────────────────────
  {
    id: 'ember',
    color: '#cc4422',
    splash: emberSplash,
    weapon: 'Iron Valor',
    ...PLACEHOLDER_EQUIPMENT,

    skills: {
      basic: { name: CombatSkillsType.SWORD_ART_OF_ASSAULT, defaultActivationDuration: 24, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      battle: { name: CombatSkillsType.FORWARD_MARCH, defaultActivationDuration: EM.battleDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      combo: { name: CombatSkillsType.FRONTLINE_SUPPORT, defaultActivationDuration: EM.comboDur, defaultActiveDuration: 0, defaultCooldownDuration: EM.comboCd, triggerCondition: 'Controlled op is attacked' },
      ultimate: { name: CombatSkillsType.RE_IGNITED_OATH, defaultActivationDuration: EM.ultDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
    },
  },
  // ── Snowshine ───────────────────────────────────────────────────────────────
  {
    id: 'snowshine',
    color: '#88bbdd',
    splash: snowshineSplash,
    weapon: 'Glacial Guard',
    ...PLACEHOLDER_EQUIPMENT,

    skills: {
      basic: { name: CombatSkillsType.HYPOTHERMIC_ASSAULT, defaultActivationDuration: 30, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      battle: { name: CombatSkillsType.SATURATED_DEFENSE, defaultActivationDuration: SN.battleDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      combo: { name: CombatSkillsType.POLAR_RESCUE, defaultActivationDuration: SN.comboDur, defaultActiveDuration: 0, defaultCooldownDuration: SN.comboCd, triggerCondition: 'Controlled op below 60% HP' },
      ultimate: { name: CombatSkillsType.FRIGID_SNOWFIELD, defaultActivationDuration: SN.ultDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
    },
  },
  // ── Catcher ─────────────────────────────────────────────────────────────────
  {
    id: 'catcher',
    color: '#8899aa',
    splash: catcherSplash,
    weapon: 'Iron Shield',
    ...PLACEHOLDER_EQUIPMENT,

    skills: {
      basic: { name: CombatSkillsType.RIGID_INTERDICTION_BASIC, defaultActivationDuration: 22, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      battle: { name: CombatSkillsType.RIGID_INTERDICTION, defaultActivationDuration: CA.battleDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      combo: { name: CombatSkillsType.TIMELY_SUPPRESSION, defaultActivationDuration: CA.comboDur, defaultActiveDuration: 0, defaultCooldownDuration: CA.comboCd, triggerCondition: 'Enemy charges or op below 40% HP' },
      ultimate: { name: CombatSkillsType.TEXTBOOK_ASSAULT, defaultActivationDuration: CA.ultDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
    },
  },
  // ── Gilberta ────────────────────────────────────────────────────────────────
  {
    id: 'gilberta',
    color: '#66bb66',
    splash: gilbertaSplash,
    weapon: 'Arcane Staff',
    ...PLACEHOLDER_EQUIPMENT,

    skills: {
      basic: { name: CombatSkillsType.BEAM_COHESION_ARTS, defaultActivationDuration: 22, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      battle: { name: CombatSkillsType.GRAVITY_MODE, defaultActivationDuration: GI.battleDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      combo: { name: CombatSkillsType.MATRIX_DISPLACEMENT, defaultActivationDuration: GI.comboDur, defaultActiveDuration: 0, defaultCooldownDuration: GI.comboCd, triggerCondition: 'Arts Reaction on enemy' },
      ultimate: { name: CombatSkillsType.GRAVITY_FIELD, defaultActivationDuration: GI.ultDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
    },
  },
  // ── Xaihi ───────────────────────────────────────────────────────────────────
  {
    id: 'xaihi',
    color: '#77ccee',
    splash: xaihiSplash,
    weapon: 'Crystal Prism',
    ...PLACEHOLDER_EQUIPMENT,

    skills: {
      basic: { name: CombatSkillsType.XAIHI_BASIC_ATTACK, defaultActivationDuration: 20, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      battle: { name: CombatSkillsType.DISTRIBUTED_DOS, defaultActivationDuration: XA.battleDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      combo: { name: CombatSkillsType.STRESS_TESTING, defaultActivationDuration: XA.comboDur, defaultActiveDuration: 0, defaultCooldownDuration: XA.comboCd, triggerCondition: 'Aux Crystal exhausts treatments' },
      ultimate: { name: CombatSkillsType.STACK_OVERFLOW, defaultActivationDuration: XA.ultDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
    },
  },
  // ── Perlica ─────────────────────────────────────────────────────────────────
  {
    id: 'perlica',
    color: '#ddbb33',
    splash: perlicaSplash,
    weapon: 'Spark Emitter',
    ...PLACEHOLDER_EQUIPMENT,

    skills: {
      basic: { name: CombatSkillsType.PROTOCOL_ALPHA_BREACH, defaultActivationDuration: 20, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      battle: { name: CombatSkillsType.PROTOCOL_OMEGA_STRIKE, defaultActivationDuration: PE.battleDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      combo: { name: CombatSkillsType.INSTANT_PROTOCOL_CHAIN, defaultActivationDuration: PE.comboDur, defaultActiveDuration: 0, defaultCooldownDuration: PE.comboCd, triggerCondition: 'Final Strike finisher' },
      ultimate: { name: CombatSkillsType.PROTOCOL_EPSILON, defaultActivationDuration: PE.ultDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
    },
  },
  // ── Fluorite ────────────────────────────────────────────────────────────────
  {
    id: 'fluorite',
    color: '#99dd55',
    splash: fluoriteSplash,
    weapon: 'Trick Shot',
    ...PLACEHOLDER_EQUIPMENT,

    skills: {
      basic: { name: CombatSkillsType.SIGNATURE_GUN_KATA, defaultActivationDuration: 22, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      battle: { name: CombatSkillsType.TINY_SURPRISE, defaultActivationDuration: FL.battleDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      combo: { name: CombatSkillsType.FREE_GIVEAWAY, defaultActivationDuration: FL.comboDur, defaultActiveDuration: 0, defaultCooldownDuration: FL.comboCd, triggerCondition: '2+ Cryo/Nature Infliction' },
      ultimate: { name: CombatSkillsType.APEX_PRANKSTER, defaultActivationDuration: FL.ultDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
    },
  },
  // ── Last Rite ───────────────────────────────────────────────────────────────
  {
    id: 'lastRite',
    color: '#aaddff',
    splash: lastRiteSplash,
    weapon: 'Frostbound Scythe',
    ...PLACEHOLDER_EQUIPMENT,

    skills: {
      basic: { name: CombatSkillsType.DANCE_OF_RIME, defaultActivationDuration: 24, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      battle: { name: CombatSkillsType.ESOTERIC_LEGACY, defaultActivationDuration: LR.battleDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      combo: { name: CombatSkillsType.WINTERS_DEVOURER, defaultActivationDuration: LR.comboDur, defaultActiveDuration: 0, defaultCooldownDuration: LR.comboCd, triggerCondition: '3+ Cryo Infliction' },
      ultimate: { name: CombatSkillsType.VIGIL_SERVICES, defaultActivationDuration: LR.ultDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
    },
  },
  // ── Yvonne ──────────────────────────────────────────────────────────────────
  {
    id: 'yvonne',
    color: '#55ccdd',
    splash: yvonneSplash,
    weapon: 'Frost Pistol',
    ...PLACEHOLDER_EQUIPMENT,

    skills: {
      basic: { name: CombatSkillsType.EXUBERANT_TRIGGER, defaultActivationDuration: 20, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      battle: { name: CombatSkillsType.BRR_BRR_BOMB, defaultActivationDuration: YV.battleDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      combo: { name: CombatSkillsType.FLASHFREEZER, defaultActivationDuration: YV.comboDur, defaultActiveDuration: 0, defaultCooldownDuration: YV.comboCd, triggerCondition: 'Final Strike on Solidified' },
      ultimate: { name: CombatSkillsType.CRYOBLASTING_PISTOLIER, defaultActivationDuration: YV.ultDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
    },
  },
  // ── Avywenna ────────────────────────────────────────────────────────────────
  {
    id: 'avywenna',
    color: '#dd9933',
    splash: avywennaSplash,
    weapon: 'Thunderlance',
    ...PLACEHOLDER_EQUIPMENT,

    skills: {
      basic: { name: CombatSkillsType.THUNDERLANCE_BLITZ, defaultActivationDuration: 18, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      battle: { name: CombatSkillsType.THUNDERLANCE_INTERDICTION, defaultActivationDuration: AV.battleDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      combo: { name: CombatSkillsType.THUNDERLANCE_STRIKE, defaultActivationDuration: AV.comboDur, defaultActiveDuration: 0, defaultCooldownDuration: AV.comboCd, triggerCondition: 'Final Strike + Elec Inflict./Electrif.' },
      ultimate: { name: CombatSkillsType.THUNDERLANCE_FINAL_SHOCK, defaultActivationDuration: AV.ultDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
    },
  },
  // ── Da Pan ──────────────────────────────────────────────────────────────────
  {
    id: 'daPan',
    color: '#ee6633',
    splash: daPanSplash,
    weapon: 'Wok of Justice',
    ...PLACEHOLDER_EQUIPMENT,

    skills: {
      basic: { name: CombatSkillsType.ROLLING_CUT, defaultActivationDuration: 22, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      battle: { name: CombatSkillsType.FLIP_DA_WOK, defaultActivationDuration: DP.battleDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      combo: { name: CombatSkillsType.MORE_SPICE, defaultActivationDuration: DP.comboDur, defaultActiveDuration: 0, defaultCooldownDuration: DP.comboCd, triggerCondition: '4 Vulnerability stacks' },
      ultimate: { name: CombatSkillsType.CHOP_N_DUNK, defaultActivationDuration: DP.ultDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
    },
  },
  // ── Pogranichnik ────────────────────────────────────────────────────────────
  {
    id: 'pogranichnik',
    color: '#bb5533',
    splash: pogranichnikSplash,
    weapon: 'Banner Blade',
    ...PLACEHOLDER_EQUIPMENT,

    skills: {
      basic: { name: CombatSkillsType.ALL_OUT_OFFENSIVE, defaultActivationDuration: 20, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      battle: { name: CombatSkillsType.THE_PULVERIZING_FRONT, defaultActivationDuration: PG.battleDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      combo: { name: CombatSkillsType.FULL_MOON_SLASH, defaultActivationDuration: PG.comboDur, defaultActiveDuration: 0, defaultCooldownDuration: PG.comboCd, triggerCondition: 'Crush/Breach consumes Vulnerability' },
      ultimate: { name: CombatSkillsType.SHIELDGUARD_BANNER, defaultActivationDuration: PG.ultDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
    },
  },
  // ── Alesh ───────────────────────────────────────────────────────────────────
  {
    id: 'alesh',
    color: '#44aacc',
    splash: aleshSplash,
    weapon: 'Fishing Rod',
    ...PLACEHOLDER_EQUIPMENT,

    skills: {
      basic: { name: CombatSkillsType.ROD_CASTING, defaultActivationDuration: 18, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      battle: { name: CombatSkillsType.UNCONVENTIONAL_LURE, defaultActivationDuration: AL.battleDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      combo: { name: CombatSkillsType.AUGER_ANGLING, defaultActivationDuration: AL.comboDur, defaultActiveDuration: 0, defaultCooldownDuration: AL.comboCd, triggerCondition: 'Nearby reaction/crystal consumed' },
      ultimate: { name: CombatSkillsType.ONE_MONSTER_CATCH, defaultActivationDuration: AL.ultDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
    },
  },
  // ── Arclight ────────────────────────────────────────────────────────────────
  {
    id: 'arclight',
    color: '#eebb44',
    splash: arclightSplash,
    weapon: 'Storm Edge',
    ...PLACEHOLDER_EQUIPMENT,

    skills: {
      basic: { name: CombatSkillsType.SEEK_AND_HUNT, defaultActivationDuration: 18, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      battle: { name: CombatSkillsType.TEMPESTUOUS_ARC, defaultActivationDuration: AC.battleDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      combo: { name: CombatSkillsType.PEAL_OF_THUNDER, defaultActivationDuration: AC.comboDur, defaultActiveDuration: 0, defaultCooldownDuration: AC.comboCd, triggerCondition: 'Enemy Electrification' },
      ultimate: { name: CombatSkillsType.EXPLODING_BLITZ, defaultActivationDuration: AC.ultDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
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
  endministrator: () => new EndministratorOperator({ level: 90 }),
  lifeng: () => new LifengOperator({ level: 90 }),
  chenQianyu: () => new ChenQianyuOperator({ level: 90 }),
  estella: () => new EstellaOperator({ level: 90 }),
  ember: () => new EmberOperator({ level: 90 }),
  snowshine: () => new SnowshineOperator({ level: 90 }),
  catcher: () => new CatcherOperator({ level: 90 }),
  gilberta: () => new GilbertaOperator({ level: 90 }),
  xaihi: () => new XaihiOperator({ level: 90 }),
  perlica: () => new PerlicaOperator({ level: 90 }),
  fluorite: () => new FluoriteOperator({ level: 90 }),
  lastRite: () => new LastRiteOperator({ level: 90 }),
  yvonne: () => new YvonneOperator({ level: 90 }),
  avywenna: () => new AvywennaOperator({ level: 90 }),
  daPan: () => new DaPanOperator({ level: 90 }),
  pogranichnik: () => new PogranichnikOperator({ level: 90 }),
  alesh: () => new AleshOperator({ level: 90 }),
  arclight: () => new ArclightOperator({ level: 90 }),
};

// skills.json key mapping (operator ID → skills.json key)
const SKILLS_JSON_KEYS: Record<string, string> = {
  laevatain: 'LAEVATAIN',
  antal: 'ANTAL',
  akekuri: 'AKEKURI',
  wulfgard: 'WULFGARD',
  ardelia: 'ARDELIA',
  endministrator: 'ENDMINISTRATOR',
  lifeng: 'LIFENG',
  chenQianyu: 'CHENQIANYU',
  estella: 'ESTELLA',
  ember: 'EMBER',
  snowshine: 'SNOWSHINE',
  catcher: 'CATCHER',
  gilberta: 'GILBERTA',
  xaihi: 'XAIHI',
  perlica: 'PERLICA',
  fluorite: 'FLUORITE',
  lastRite: 'LASTRITE',
  yvonne: 'YVONNE',
  avywenna: 'AVYWENNA',
  daPan: 'DAPAN',
  pogranichnik: 'POGRANICHNK',
  alesh: 'ALESH',
  arclight: 'ARCLIGHT',
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
    maxTalentOneLevel: model.maxTalentOneLevel,
    maxTalentTwoLevel: model.maxTalentTwoLevel,
    triggerCapability: TRIGGER_CAPABILITIES[config.id],
  };
}

export const ALL_OPERATORS: ViewOperator[] = DISPLAY_CONFIGS.map(buildViewOperator);
