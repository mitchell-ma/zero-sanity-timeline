/**
 * Operator registry — controller-layer bridge between model and view.
 *
 * Combines:
 * - Model operator instances (name, element, rarity, weaponTypes, skill names, ultimateEnergyCost)
 * - Display config (color, splash art, equipment names)
 * - Skill timing data from skills.json (activation/active/cooldown durations)
 * - Gauge gain data from skills.json
 */
import { Operator as ViewOperator, SkillDef } from '../../consts/viewTypes';
import { OperatorClassType, TriggerConditionType, ELEMENT_COLORS } from '../../consts/enums';
import { TriggerCapability } from '../../consts/triggerCapabilities';
import { LaevatainOperator } from '../../model/operators/laevatainOperator';
import { AntalOperator } from '../../model/operators/antalOperator';
import { AkekuriOperator } from '../../model/operators/akekuriOperator';
import { WulfgardOperator } from '../../model/operators/wulfgardOperator';
import { ArdeliaOperator } from '../../model/operators/ardeliaOperator';
import { EndministratorOperator } from '../../model/operators/endministratorOperator';
import { LifengOperator } from '../../model/operators/lifengOperator';
import { ChenQianyuOperator } from '../../model/operators/chenQianyuOperator';
import { EstellaOperator } from '../../model/operators/estellaOperator';
import { EmberOperator } from '../../model/operators/emberOperator';
import { SnowshineOperator } from '../../model/operators/snowshineOperator';
import { CatcherOperator } from '../../model/operators/catcherOperator';
import { GilbertaOperator } from '../../model/operators/gilbertaOperator';
import { XaihiOperator } from '../../model/operators/xaihiOperator';
import { PerlicaOperator } from '../../model/operators/perlicaOperator';
import { FluoriteOperator } from '../../model/operators/fluoriteOperator';
import { LastRiteOperator } from '../../model/operators/lastRiteOperator';
import { YvonneOperator } from '../../model/operators/yvonneOperator';
import { AvywennaOperator } from '../../model/operators/avywennaOperator';
import { DaPanOperator } from '../../model/operators/daPanOperator';
import { PogranichnikOperator } from '../../model/operators/pogranichnikOperator';
import { AleshOperator } from '../../model/operators/aleshOperator';
import { ArclightOperator } from '../../model/operators/arclightOperator';
import { Operator as ModelOperator } from '../../model/operators/operator';
import { Potential, SkillLevel } from '../../consts/types';
import skillsData from '../../model/game-data/skills.json';

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

// ── Per-operator display + timing config ─────────────────────────────────────

/** Skill timing/display data not available from the model layer. */
interface SkillTimingConfig {
  defaultActivationDuration: number; // frames
  defaultActiveDuration: number;     // frames
  defaultCooldownDuration: number;   // frames
  triggerCondition: string | null;
  animationDuration?: number;        // frames (cast animation subset of activation)
}

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
  /** Skill timing data — durations and trigger conditions (names come from model). */
  skills: Record<string, SkillTimingConfig>;
}

// ── Helper: compute skill durations from skills.json ─────────────────────────

function dur(seconds: number): number { return Math.round(seconds * 120); }

function getSkillData(opKey: string) {
  const op = (skillsData as any).operators?.[opKey];
  if (!op) throw new Error(`No skills.json data for ${opKey}`);
  const bsKey = `${opKey}_BATTLE_SKILL`;
  const csKey = `${opKey}_COMBO_SKILL`;
  const ultKey = `${opKey}_ULTIMATE`;
  const ultData = op.ULTIMATE[ultKey];
  const ultTotalDur = dur(ultData[`${ultKey}_DURATION`]);
  const ultAnimDur = ultData[`${ultKey}_ANIMATION_TIME`] != null
    ? dur(ultData[`${ultKey}_ANIMATION_TIME`])
    : ultTotalDur;
  const ultCdRaw = ultData[`${ultKey}_COOLDOWN`];
  const comboTimeStop = op.COMBO_SKILL[csKey][`${csKey}_TIME_STOP_DURATION`];
  const comboAnimDur = comboTimeStop?.SECONDS != null ? dur(comboTimeStop.SECONDS) : dur(0.5);
  return {
    battleDur: dur(op.BATTLE_SKILL[bsKey][`${bsKey}_DURATION`]),
    comboDur: dur(op.COMBO_SKILL[csKey][`${csKey}_DURATION`]),
    comboCd: dur(op.COMBO_SKILL[csKey][`${csKey}_COOLDOWN`]),
    comboAnimDur,
    ultDur: ultTotalDur,
    ultAnimDur,
    ultCd: ultCdRaw != null ? dur(ultCdRaw) : 0,
  };
}

// ── skills.json ULTIMATE_ENERGY_COST lookup ─────────────────────────────────

function getUltimateEnergyCost(operatorKey: string): number {
  const opData = (skillsData as any).operators?.[operatorKey];
  if (!opData?.ULTIMATE) return 0;
  const ultKey = Object.keys(opData.ULTIMATE)[0];
  if (!ultKey) return 0;
  return opData.ULTIMATE[ultKey][`${ultKey}_ENERGY_COST`] ?? 0;
}

/** Extract gauge gain values for battle and combo skills from skills.json. */
function getSkillGaugeGains(operatorKey: string): {
  battleGaugeGain: number; battleTeamGaugeGain: number;
  comboGaugeGain: number; comboTeamGaugeGain: number;
  comboGaugeGainByEnemies?: Record<number, number>;
} {
  const opData = (skillsData as any).operators?.[operatorKey];
  const result: ReturnType<typeof getSkillGaugeGains> = { battleGaugeGain: 0, battleTeamGaugeGain: 0, comboGaugeGain: 0, comboTeamGaugeGain: 0 };
  if (!opData) return result;
  if (opData.BATTLE_SKILL) {
    const bsKey = Object.keys(opData.BATTLE_SKILL)[0];
    if (bsKey) {
      const bs = opData.BATTLE_SKILL[bsKey];
      result.battleGaugeGain = bs[`${bsKey}_GAUGE_GAIN`] ?? 0;
      result.battleTeamGaugeGain = bs[`${bsKey}_TEAM_GAUGE_GAIN`] ?? 0;
    }
  }
  if (opData.COMBO_SKILL) {
    const csKey = Object.keys(opData.COMBO_SKILL)[0];
    if (csKey) {
      const cs = opData.COMBO_SKILL[csKey];
      // Check for multi-hit gauge gain keys (_GAUGE_GAIN_HIT_N_ENEM*)
      const hitPattern = new RegExp(`^${csKey}_GAUGE_GAIN_HIT_(\\d+)_ENEM`);
      const byEnemies: Record<number, number> = {};
      for (const key of Object.keys(cs)) {
        const m = key.match(hitPattern);
        if (m) byEnemies[parseInt(m[1])] = cs[key];
      }
      if (Object.keys(byEnemies).length > 0) {
        result.comboGaugeGainByEnemies = byEnemies;
        result.comboGaugeGain = byEnemies[1] ?? 0;
      } else {
        result.comboGaugeGain = cs[`${csKey}_GAUGE_GAIN`] ?? 0;
      }
      result.comboTeamGaugeGain = cs[`${csKey}_TEAM_GAUGE_GAIN`] ?? 0;
    }
  }
  return result;
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
    weapon: '',
    ...PLACEHOLDER_EQUIPMENT,

    skills: {
      basic: { defaultActivationDuration: 30, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      battle: { defaultActivationDuration: L.battleDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      combo: { defaultActivationDuration: L.comboDur, defaultActiveDuration: 0, defaultCooldownDuration: L.comboCd, triggerCondition: null, animationDuration: L.comboAnimDur },
      ultimate: { defaultActivationDuration: L.ultAnimDur, defaultActiveDuration: 1800, defaultCooldownDuration: 1200, triggerCondition: null, animationDuration: L.ultAnimDur },
    },
  },
  // ── Antal ───────────────────────────────────────────────────────────────────
  {
    id: 'antal',
    color: '#55aadd',
    splash: antalSplash,
    weapon: '',
    ...PLACEHOLDER_EQUIPMENT,
    kit2: 'Hot Work Pyrometer',

    skills: {
      basic: { defaultActivationDuration: 24, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      battle: { defaultActivationDuration: 960, defaultActiveDuration: 0, defaultCooldownDuration: 1440, triggerCondition: null },
      combo: { defaultActivationDuration: 360, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null, animationDuration: AN.comboAnimDur },
      ultimate: { defaultActivationDuration: AN.ultAnimDur, defaultActiveDuration: 1440, defaultCooldownDuration: 3000, triggerCondition: null, animationDuration: AN.ultAnimDur },
    },
  },
  // ── Akekuri ─────────────────────────────────────────────────────────────────
  {
    id: 'akekuri',
    color: '#e05555',
    splash: akekuriSplash,
    weapon: '',
    ...PLACEHOLDER_EQUIPMENT,
    gloves: 'Hot Work Gauntlets T1',
    kit1: 'Hot Work Power Cartridge',
    kit2: 'Hot Work Pyrometer',

    skills: {
      basic: { defaultActivationDuration: 18, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      battle: { defaultActivationDuration: AK.battleDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      combo: { defaultActivationDuration: AK.comboDur, defaultActiveDuration: 0, defaultCooldownDuration: AK.comboCd, triggerCondition: null, animationDuration: AK.comboAnimDur },
      ultimate: { defaultActivationDuration: AK.ultAnimDur, defaultActiveDuration: dur(3.427), defaultCooldownDuration: AK.ultCd, triggerCondition: null, animationDuration: AK.ultAnimDur },
    },
  },
  // ── Wulfgard ────────────────────────────────────────────────────────────────
  {
    id: 'wulfgard',
    color: '#9060e8',
    splash: wulfgardSplash,
    weapon: '',
    ...PLACEHOLDER_EQUIPMENT,

    skills: {
      basic: { defaultActivationDuration: 20, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      battle: { defaultActivationDuration: WF.battleDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      combo: { defaultActivationDuration: WF.comboDur, defaultActiveDuration: 0, defaultCooldownDuration: WF.comboCd, triggerCondition: null, animationDuration: WF.comboAnimDur },
      ultimate: { defaultActivationDuration: WF.ultAnimDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null, animationDuration: WF.ultAnimDur },
    },
  },
  // ── Ardelia ─────────────────────────────────────────────────────────────────
  {
    id: 'ardelia',
    color: '#33cc88',
    splash: ardeliaSplash,
    weapon: '',
    ...PLACEHOLDER_EQUIPMENT,
    kit2: 'Hot Work Pyrometer',

    skills: {
      basic: { defaultActivationDuration: 22, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      battle: { defaultActivationDuration: AR.battleDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      combo: { defaultActivationDuration: AR.comboDur, defaultActiveDuration: 0, defaultCooldownDuration: AR.comboCd, triggerCondition: null, animationDuration: AR.comboAnimDur },
      ultimate: { defaultActivationDuration: dur(2.688), defaultActiveDuration: dur(3), defaultCooldownDuration: 0, triggerCondition: null, animationDuration: dur(2.688) },
    },
  },
  // ── Endministrator ──────────────────────────────────────────────────────────
  {
    id: 'endministrator',
    color: '#ccbb44',
    splash: endministratorSplash,
    weapon: '',
    ...PLACEHOLDER_EQUIPMENT,

    skills: {
      basic: { defaultActivationDuration: 20, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      battle: { defaultActivationDuration: EN.battleDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      combo: { defaultActivationDuration: EN.comboDur, defaultActiveDuration: 0, defaultCooldownDuration: EN.comboCd, triggerCondition: null, animationDuration: EN.comboAnimDur },
      ultimate: { defaultActivationDuration: EN.ultAnimDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null, animationDuration: EN.ultAnimDur },
    },
  },
  // ── Lifeng ──────────────────────────────────────────────────────────────────
  {
    id: 'lifeng',
    color: '#dd8844',
    splash: lifengSplash,
    weapon: '',
    ...PLACEHOLDER_EQUIPMENT,

    skills: {
      basic: { defaultActivationDuration: 24, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      battle: { defaultActivationDuration: LF.battleDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      combo: { defaultActivationDuration: LF.comboDur, defaultActiveDuration: 0, defaultCooldownDuration: LF.comboCd, triggerCondition: null, animationDuration: LF.comboAnimDur },
      ultimate: { defaultActivationDuration: LF.ultAnimDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null, animationDuration: LF.ultAnimDur },
    },
  },
  // ── Chen Qianyu ─────────────────────────────────────────────────────────────
  {
    id: 'chenQianyu',
    color: '#4488cc',
    splash: chenQianyuSplash,
    weapon: '',
    ...PLACEHOLDER_EQUIPMENT,

    skills: {
      basic: { defaultActivationDuration: 20, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      battle: { defaultActivationDuration: CQ.battleDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      combo: { defaultActivationDuration: CQ.comboDur, defaultActiveDuration: 0, defaultCooldownDuration: CQ.comboCd, triggerCondition: null, animationDuration: CQ.comboAnimDur },
      ultimate: { defaultActivationDuration: CQ.ultAnimDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null, animationDuration: CQ.ultAnimDur },
    },
  },
  // ── Estella ─────────────────────────────────────────────────────────────────
  {
    id: 'estella',
    color: '#6699cc',
    splash: estellaSplash,
    weapon: '',
    ...PLACEHOLDER_EQUIPMENT,

    skills: {
      basic: { defaultActivationDuration: 18, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      battle: { defaultActivationDuration: ES.battleDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      combo: { defaultActivationDuration: ES.comboDur, defaultActiveDuration: 0, defaultCooldownDuration: ES.comboCd, triggerCondition: null, animationDuration: ES.comboAnimDur },
      ultimate: { defaultActivationDuration: ES.ultAnimDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null, animationDuration: ES.ultAnimDur },
    },
  },
  // ── Ember ───────────────────────────────────────────────────────────────────
  {
    id: 'ember',
    color: '#cc4422',
    splash: emberSplash,
    weapon: '',
    ...PLACEHOLDER_EQUIPMENT,

    skills: {
      basic: { defaultActivationDuration: 24, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      battle: { defaultActivationDuration: EM.battleDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      combo: { defaultActivationDuration: EM.comboDur, defaultActiveDuration: 0, defaultCooldownDuration: EM.comboCd, triggerCondition: null, animationDuration: EM.comboAnimDur },
      ultimate: { defaultActivationDuration: EM.ultAnimDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null, animationDuration: EM.ultAnimDur },
    },
  },
  // ── Snowshine ───────────────────────────────────────────────────────────────
  {
    id: 'snowshine',
    color: '#88bbdd',
    splash: snowshineSplash,
    weapon: '',
    ...PLACEHOLDER_EQUIPMENT,

    skills: {
      basic: { defaultActivationDuration: 30, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      battle: { defaultActivationDuration: SN.battleDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      combo: { defaultActivationDuration: SN.comboDur, defaultActiveDuration: 0, defaultCooldownDuration: SN.comboCd, triggerCondition: null, animationDuration: SN.comboAnimDur },
      ultimate: { defaultActivationDuration: SN.ultAnimDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null, animationDuration: SN.ultAnimDur },
    },
  },
  // ── Catcher ─────────────────────────────────────────────────────────────────
  {
    id: 'catcher',
    color: '#8899aa',
    splash: catcherSplash,
    weapon: '',
    ...PLACEHOLDER_EQUIPMENT,

    skills: {
      basic: { defaultActivationDuration: 22, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      battle: { defaultActivationDuration: CA.battleDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      combo: { defaultActivationDuration: CA.comboDur, defaultActiveDuration: 0, defaultCooldownDuration: CA.comboCd, triggerCondition: null, animationDuration: CA.comboAnimDur },
      ultimate: { defaultActivationDuration: CA.ultAnimDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null, animationDuration: CA.ultAnimDur },
    },
  },
  // ── Gilberta ────────────────────────────────────────────────────────────────
  {
    id: 'gilberta',
    color: '#66bb66',
    splash: gilbertaSplash,
    weapon: '',
    ...PLACEHOLDER_EQUIPMENT,

    skills: {
      basic: { defaultActivationDuration: 22, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      battle: { defaultActivationDuration: GI.battleDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      combo: { defaultActivationDuration: GI.comboDur, defaultActiveDuration: 0, defaultCooldownDuration: GI.comboCd, triggerCondition: null, animationDuration: GI.comboAnimDur },
      ultimate: { defaultActivationDuration: GI.ultAnimDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null, animationDuration: GI.ultAnimDur },
    },
  },
  // ── Xaihi ───────────────────────────────────────────────────────────────────
  {
    id: 'xaihi',
    color: '#77ccee',
    splash: xaihiSplash,
    weapon: '',
    ...PLACEHOLDER_EQUIPMENT,

    skills: {
      basic: { defaultActivationDuration: 20, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      battle: { defaultActivationDuration: XA.battleDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      combo: { defaultActivationDuration: XA.comboDur, defaultActiveDuration: 0, defaultCooldownDuration: XA.comboCd, triggerCondition: null, animationDuration: XA.comboAnimDur },
      ultimate: { defaultActivationDuration: XA.ultAnimDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null, animationDuration: XA.ultAnimDur },
    },
  },
  // ── Perlica ─────────────────────────────────────────────────────────────────
  {
    id: 'perlica',
    color: '#ddbb33',
    splash: perlicaSplash,
    weapon: '',
    ...PLACEHOLDER_EQUIPMENT,

    skills: {
      basic: { defaultActivationDuration: 20, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      battle: { defaultActivationDuration: PE.battleDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      combo: { defaultActivationDuration: PE.comboDur, defaultActiveDuration: 0, defaultCooldownDuration: PE.comboCd, triggerCondition: null, animationDuration: PE.comboAnimDur },
      ultimate: { defaultActivationDuration: PE.ultAnimDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null, animationDuration: PE.ultAnimDur },
    },
  },
  // ── Fluorite ────────────────────────────────────────────────────────────────
  {
    id: 'fluorite',
    color: '#99dd55',
    splash: fluoriteSplash,
    weapon: '',
    ...PLACEHOLDER_EQUIPMENT,

    skills: {
      basic: { defaultActivationDuration: 22, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      battle: { defaultActivationDuration: FL.battleDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      combo: { defaultActivationDuration: FL.comboDur, defaultActiveDuration: 0, defaultCooldownDuration: FL.comboCd, triggerCondition: null, animationDuration: FL.comboAnimDur },
      ultimate: { defaultActivationDuration: FL.ultAnimDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null, animationDuration: FL.ultAnimDur },
    },
  },
  // ── Last Rite ───────────────────────────────────────────────────────────────
  {
    id: 'lastRite',
    color: '#aaddff',
    splash: lastRiteSplash,
    weapon: '',
    ...PLACEHOLDER_EQUIPMENT,

    skills: {
      basic: { defaultActivationDuration: 24, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      battle: { defaultActivationDuration: LR.battleDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      combo: { defaultActivationDuration: LR.comboDur, defaultActiveDuration: 0, defaultCooldownDuration: LR.comboCd, triggerCondition: null, animationDuration: LR.comboAnimDur },
      ultimate: { defaultActivationDuration: LR.ultAnimDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null, animationDuration: LR.ultAnimDur },
    },
  },
  // ── Yvonne ──────────────────────────────────────────────────────────────────
  {
    id: 'yvonne',
    color: '#55ccdd',
    splash: yvonneSplash,
    weapon: '',
    ...PLACEHOLDER_EQUIPMENT,

    skills: {
      basic: { defaultActivationDuration: 20, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      battle: { defaultActivationDuration: YV.battleDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      combo: { defaultActivationDuration: YV.comboDur, defaultActiveDuration: 0, defaultCooldownDuration: YV.comboCd, triggerCondition: null, animationDuration: YV.comboAnimDur },
      ultimate: { defaultActivationDuration: YV.ultAnimDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null, animationDuration: YV.ultAnimDur },
    },
  },
  // ── Avywenna ────────────────────────────────────────────────────────────────
  {
    id: 'avywenna',
    color: '#dd9933',
    splash: avywennaSplash,
    weapon: '',
    ...PLACEHOLDER_EQUIPMENT,

    skills: {
      basic: { defaultActivationDuration: 18, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      battle: { defaultActivationDuration: AV.battleDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      combo: { defaultActivationDuration: AV.comboDur, defaultActiveDuration: 0, defaultCooldownDuration: AV.comboCd, triggerCondition: null, animationDuration: AV.comboAnimDur },
      ultimate: { defaultActivationDuration: AV.ultAnimDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null, animationDuration: AV.ultAnimDur },
    },
  },
  // ── Da Pan ──────────────────────────────────────────────────────────────────
  {
    id: 'daPan',
    color: '#ee6633',
    splash: daPanSplash,
    weapon: '',
    ...PLACEHOLDER_EQUIPMENT,

    skills: {
      basic: { defaultActivationDuration: 22, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      battle: { defaultActivationDuration: DP.battleDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      combo: { defaultActivationDuration: DP.comboDur, defaultActiveDuration: 0, defaultCooldownDuration: DP.comboCd, triggerCondition: null, animationDuration: DP.comboAnimDur },
      ultimate: { defaultActivationDuration: DP.ultAnimDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null, animationDuration: DP.ultAnimDur },
    },
  },
  // ── Pogranichnik ────────────────────────────────────────────────────────────
  {
    id: 'pogranichnik',
    color: '#bb5533',
    splash: pogranichnikSplash,
    weapon: '',
    ...PLACEHOLDER_EQUIPMENT,

    skills: {
      basic: { defaultActivationDuration: 20, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      battle: { defaultActivationDuration: PG.battleDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      combo: { defaultActivationDuration: PG.comboDur, defaultActiveDuration: 0, defaultCooldownDuration: PG.comboCd, triggerCondition: null, animationDuration: PG.comboAnimDur },
      ultimate: { defaultActivationDuration: PG.ultAnimDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null, animationDuration: PG.ultAnimDur },
    },
  },
  // ── Alesh ───────────────────────────────────────────────────────────────────
  {
    id: 'alesh',
    color: '#44aacc',
    splash: aleshSplash,
    weapon: '',
    ...PLACEHOLDER_EQUIPMENT,

    skills: {
      basic: { defaultActivationDuration: 18, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      battle: { defaultActivationDuration: AL.battleDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      combo: { defaultActivationDuration: AL.comboDur, defaultActiveDuration: 0, defaultCooldownDuration: AL.comboCd, triggerCondition: null, animationDuration: AL.comboAnimDur },
      ultimate: { defaultActivationDuration: AL.ultAnimDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null, animationDuration: AL.ultAnimDur },
    },
  },
  // ── Arclight ────────────────────────────────────────────────────────────────
  {
    id: 'arclight',
    color: '#eebb44',
    splash: arclightSplash,
    weapon: '',
    ...PLACEHOLDER_EQUIPMENT,

    skills: {
      basic: { defaultActivationDuration: 18, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      battle: { defaultActivationDuration: AC.battleDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null },
      combo: { defaultActivationDuration: AC.comboDur, defaultActiveDuration: 0, defaultCooldownDuration: AC.comboCd, triggerCondition: null, animationDuration: AC.comboAnimDur },
      ultimate: { defaultActivationDuration: AC.ultAnimDur, defaultActiveDuration: 0, defaultCooldownDuration: 0, triggerCondition: null, animationDuration: AC.ultAnimDur },
    },
  },
];

// ── Model operator factories (level defaults to 90) ─────────────────────────

export const MODEL_FACTORIES: Record<string, (level?: number) => ModelOperator> = {
  laevatain: (level = 90) => new LaevatainOperator({ level }),
  antal: (level = 90) => new AntalOperator({ level }),
  akekuri: (level = 90) => new AkekuriOperator({ level }),
  wulfgard: (level = 90) => new WulfgardOperator({ level }),
  ardelia: (level = 90) => new ArdeliaOperator({ level }),
  endministrator: (level = 90) => new EndministratorOperator({ level }),
  lifeng: (level = 90) => new LifengOperator({ level }),
  chenQianyu: (level = 90) => new ChenQianyuOperator({ level }),
  estella: (level = 90) => new EstellaOperator({ level }),
  ember: (level = 90) => new EmberOperator({ level }),
  snowshine: (level = 90) => new SnowshineOperator({ level }),
  catcher: (level = 90) => new CatcherOperator({ level }),
  gilberta: (level = 90) => new GilbertaOperator({ level }),
  xaihi: (level = 90) => new XaihiOperator({ level }),
  perlica: (level = 90) => new PerlicaOperator({ level }),
  fluorite: (level = 90) => new FluoriteOperator({ level }),
  lastRite: (level = 90) => new LastRiteOperator({ level }),
  yvonne: (level = 90) => new YvonneOperator({ level }),
  avywenna: (level = 90) => new AvywennaOperator({ level }),
  daPan: (level = 90) => new DaPanOperator({ level }),
  pogranichnik: (level = 90) => new PogranichnikOperator({ level }),
  alesh: (level = 90) => new AleshOperator({ level }),
  arclight: (level = 90) => new ArclightOperator({ level }),
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
  const gaugeMax = jsonKey ? getUltimateEnergyCost(jsonKey) : model.ultimate.ultimateEnergyCost;
  const gg = jsonKey ? getSkillGaugeGains(jsonKey) : null;

  // Read skill names, triggers, and element from model instances, merge with timing config
  const modelSkills: Record<string, { skillName: string; publishesTriggers: TriggerConditionType[]; element: string }> = {
    basic:    { skillName: model.basicAttack.skillName, publishesTriggers: model.basicAttack.publishesTriggers, element: model.basicAttack.elementType },
    battle:   { skillName: model.battleSkill.skillName, publishesTriggers: model.battleSkill.publishesTriggers, element: model.battleSkill.elementType },
    combo:    { skillName: model.comboSkill.skillName,  publishesTriggers: model.comboSkill.publishesTriggers,  element: model.comboSkill.elementType },
    ultimate: { skillName: model.ultimate.skillName,    publishesTriggers: model.ultimate.publishesTriggers,    element: model.ultimate.elementType },
  };

  const skills: Record<string, SkillDef> = {};
  for (const [key, timing] of Object.entries(config.skills)) {
    const ms = modelSkills[key];
    // Auto-add default triggers per skill type
    const defaultTriggers: TriggerConditionType[] = [];
    if (key === 'basic') defaultTriggers.push(TriggerConditionType.FINAL_STRIKE);
    if (key === 'battle') defaultTriggers.push(TriggerConditionType.CAST_BATTLE_SKILL);
    if (key === 'combo') defaultTriggers.push(TriggerConditionType.CAST_COMBO_SKILL);
    if (key === 'ultimate') defaultTriggers.push(TriggerConditionType.CAST_ULTIMATE);
    const merged = [...defaultTriggers, ...ms.publishesTriggers];
    const publishesTriggers = merged.length > 0 ? merged : undefined;
    skills[key] = { name: ms?.skillName ?? key, element: ms.element, ...timing, publishesTriggers };
  }

  // Attach SP cost to battle skill def
  if (skills.battle && 'skillPointCost' in model.battleSkill) {
    skills.battle = { ...skills.battle, skillPointCost: (model.battleSkill as any).skillPointCost };
  }

  // Attach gauge gain values to battle and combo skill defs
  if (gg && skills.battle) {
    skills.battle = { ...skills.battle, gaugeGain: gg.battleGaugeGain, teamGaugeGain: gg.battleTeamGaugeGain };
  }
  if (gg && skills.combo) {
    skills.combo = {
      ...skills.combo,
      gaugeGain: gg.comboGaugeGain,
      teamGaugeGain: gg.comboTeamGaugeGain,
      ...(gg.comboGaugeGainByEnemies ? { gaugeGainByEnemies: gg.comboGaugeGainByEnemies } : {}),
    };
  }

  // Attach SP return notes from model
  if (skills.battle && model.spReturnNotes.length > 0) {
    skills.battle = { ...skills.battle, spReturnNotes: model.spReturnNotes };
  }

  // Build triggerCapability from model's skill triggers + operator combo config
  let triggerCapability: TriggerCapability | undefined;
  const comboRequires = model.comboRequires;
  if (comboRequires.length > 0) {
    const publishesTriggers: Partial<Record<string, TriggerConditionType[]>> = {};
    for (const [key, skillDef] of Object.entries(skills)) {
      if (skillDef.publishesTriggers && skillDef.publishesTriggers.length > 0) {
        publishesTriggers[key] = skillDef.publishesTriggers;
      }
    }
    triggerCapability = {
      publishesTriggers,
      comboRequires,
      comboDescription: model.comboDescription,
      comboWindowFrames: model.comboWindowFrames,
      comboForbidsActiveColumns: model.comboForbidsActiveColumns,
      comboRequiresActiveColumns: model.comboRequiresActiveColumns,
      derivedEnemyColumns: model.derivedEnemyColumns,
      derivedTeamColumns: model.derivedTeamColumns,
    };
  }

  return {
    id: config.id,
    name: model.name,
    color: ELEMENT_COLORS[model.element],
    element: model.element,
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
    skills,
    ultimateEnergyCost: gaugeMax,
    maxTalentOneLevel: model.maxTalentOneLevel,
    maxTalentTwoLevel: model.maxTalentTwoLevel,
    talentOneName: model.talentOneName,
    talentTwoName: model.talentTwoName,
    attributeIncreaseName: model.attributeIncreaseName,
    attributeIncreaseAttribute: model.attributeIncreaseAttribute,
    maxAttributeIncreaseLevel: model.maxAttributeIncreaseLevel,
    triggerCapability,
  };
}

export const ALL_OPERATORS: ViewOperator[] = DISPLAY_CONFIGS.map(buildViewOperator);

/** Get the ultimate energy cost for an operator at a given potential. */
export function getUltimateEnergyCostForPotential(
  operatorId: string,
  potential: Potential,
): number | null {
  const factory = MODEL_FACTORIES[operatorId];
  if (!factory) return null;
  const model = factory();
  return model.ultimate.getUltimateEnergyCost(12 as SkillLevel, potential);
}
