/**
 * Operator registry — unified registrar that builds view operators from JSON config.
 *
 * Built-in operators: auto-discovered from game-data/operators/*.json
 * Custom operators: loaded from localStorage and registered through the same path.
 *
 * No hardcoded DISPLAY_CONFIGS — all display/timing data comes from JSON fields.
 */
import { Operator as ViewOperator, SkillDef } from '../../consts/viewTypes';
import { ElementType, OperatorClassType, ELEMENT_COLORS } from '../../consts/enums';
import { Potential } from '../../consts/types';
import {
  getOperatorJson,
  getAllOperatorIds,
  getSkillTypeMap,
  getSkillTimings as loadSkillTimings,
  getSkillGaugeGains as loadSkillGaugeGains,
  getUltimateEnergyCost as loadUltimateEnergyCost,
  getBattleSkillSpCost as loadBattleSkillSpCost,
} from '../../model/event-frames/operatorJsonLoader';
import type { OperatorStatConfig } from '../../model/operators/dataDrivenOperator';
import { loadCustomOperators } from '../../utils/customContentStorage';

// Auto-discover splash art assets
const splashContext = require.context('../../assets/operators', false, /Banner\.webp$/);
const SPLASH_ART: Record<string, string> = {};
for (const key of splashContext.keys()) {
  const match = key.match(/\.\/(.+)_Banner\.webp$/);
  if (match) {
    const assetName = match[1];
    SPLASH_ART[assetName] = splashContext(key);
  }
}

/** Look up splash art by operator display name. */
function getSplashArt(operatorName: string): string | undefined {
  const key = operatorName.replace(/ /g, '_');
  if (SPLASH_ART[key]) return SPLASH_ART[key];
  for (const [assetKey, url] of Object.entries(SPLASH_ART)) {
    if (assetKey.startsWith(key)) return url;
  }
  return undefined;
}

// ── Role display names ──────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  [OperatorClassType.GUARD]: 'Guard',
  [OperatorClassType.CASTER]: 'Caster',
  [OperatorClassType.STRIKER]: 'Striker',
  [OperatorClassType.VANGUARD]: 'Vanguard',
  [OperatorClassType.DEFENDER]: 'Defender',
  [OperatorClassType.SUPPORTER]: 'Supporter',
};

// ── Placeholder equipment ────────────────────────────────────────────────────

const PLACEHOLDER_EQUIPMENT = {
  armor: 'Hot Work Exoskeleton',
  gloves: 'Hot Work Gauntlets',
  kit1: 'Hot Work Power Bank',
  kit2: 'Hot Work Power Cartridge',
  food: 'Ginseng Meat Stew',
  tactical: 'Stew Meeting',
};


// ── Helper: seconds → frames ────────────────────────────────────────────────

function dur(seconds: number): number { return Math.round(seconds * 120); }

// ── Unified view operator builder ────────────────────────────────────────────

/**
 * Build a ViewOperator from an operator JSON config.
 * Works for both built-in operators (auto-discovered JSONs) and custom operators
 * (loaded from localStorage with the same shape).
 */
function buildViewOperatorFromJson(operatorId: string, opJson: Record<string, unknown>): ViewOperator {
  const timings = loadSkillTimings(opJson);
  const gaugeMax = loadUltimateEnergyCost(opJson);
  const gg = loadSkillGaugeGains(opJson);
  const elementType = opJson.elementType as string;
  const talents = opJson.talents as {
    one?: { name: string; maxLevel: number };
    two?: { name: string; maxLevel: number };
    attributeIncrease?: { name: string; attribute: string };
  } | undefined;
  const opSkills = opJson.skills as Record<string, any> | undefined;

  // Display color: always derived from element
  const color = ELEMENT_COLORS[elementType as ElementType] ?? '#888888';

  // Splash art: explicit field → asset auto-discovery
  const splash = opJson.splashArt ?? getSplashArt(opJson.name as string);

  // Build skill type → base skill ID map from skillTypeMap
  const typeMap = getSkillTypeMap(operatorId);
  const categoryToName: Record<string, string> = {};
  for (const [type, baseId] of Object.entries(typeMap)) {
    const viewKey = type === 'BASIC_ATTACK' ? 'basic' : type === 'BATTLE_SKILL' ? 'battle'
      : type === 'COMBO_SKILL' ? 'combo' : type === 'ULTIMATE' ? 'ultimate' : null;
    if (viewKey) categoryToName[viewKey] = baseId;
  }

  // Compute skill timing — use JSON override fields when available, fall back to getSkillTimings
  const basicActivation = opJson.basicAttackDefaultDuration != null
    ? dur(opJson.basicAttackDefaultDuration as number) : 24;
  const battleActivation = opJson.battleSkillActivationDuration != null
    ? dur(opJson.battleSkillActivationDuration as number) : timings.battleDur;
  const battleCooldown = opJson.battleSkillCooldownDuration != null
    ? dur(opJson.battleSkillCooldownDuration as number) : 0;
  const comboActivation = opJson.comboSkillActivationDuration != null
    ? dur(opJson.comboSkillActivationDuration as number) : timings.comboDur;
  const ultActiveDur = timings.ultActiveDur
    ?? (opJson.ultimateActiveDuration != null
      ? dur(opJson.ultimateActiveDuration as number) : Math.max(0, timings.ultDur - timings.ultAnimDur));
  const ultCooldown = timings.ultCd || (opJson.ultimateCooldownDuration != null
    ? dur(opJson.ultimateCooldownDuration as number) : 0);

  const skillTimingConfigs: Record<string, {
    defaultActivationDuration: number;
    defaultActiveDuration: number;
    defaultCooldownDuration: number;
    triggerCondition: string | null;
    animationDuration?: number;
  }> = {
    basic: {
      defaultActivationDuration: basicActivation,
      defaultActiveDuration: 0,
      defaultCooldownDuration: 0,
      triggerCondition: null,
    },
    battle: {
      defaultActivationDuration: battleActivation,
      defaultActiveDuration: 0,
      defaultCooldownDuration: battleCooldown,
      triggerCondition: null,
    },
    combo: {
      defaultActivationDuration: comboActivation,
      defaultActiveDuration: 0,
      defaultCooldownDuration: timings.comboCd,
      triggerCondition: null,
      animationDuration: timings.comboAnimDur,
    },
    ultimate: {
      defaultActivationDuration: timings.ultAnimDur,
      defaultActiveDuration: ultActiveDur,
      defaultCooldownDuration: ultCooldown,
      triggerCondition: null,
      animationDuration: timings.ultAnimDur,
    },
  };

  const skills: Record<string, SkillDef> = {};
  for (const [key, timing] of Object.entries(skillTimingConfigs)) {
    const skillName = categoryToName[key] ?? key;
    const categoryKey = key === 'basic' ? 'BASIC_ATTACK' : key === 'battle' ? 'BATTLE_SKILL'
      : key === 'combo' ? 'COMBO_SKILL' : 'ULTIMATE';
    const rawEntry = typeMap[categoryKey] as any;
    const resolvedSkillId = typeof rawEntry === 'string' ? rawEntry
      : rawEntry?.BATK ?? categoryKey;
    const catData = opSkills?.[resolvedSkillId];
    const desc = catData?.description;
    skills[key] = { name: skillName, element: elementType, ...timing, ...(desc ? { description: desc } : {}) };
  }

  // SP cost from JSON
  if (skills.battle) {
    const spCost = loadBattleSkillSpCost(opJson);
    if (spCost > 0) skills.battle = { ...skills.battle, skillPointCost: spCost };
  }

  // Gauge gains
  if (skills.combo) {
    skills.combo = {
      ...skills.combo,
      gaugeGain: gg.comboGaugeGain,
      teamGaugeGain: gg.comboTeamGaugeGain,
      ...(gg.comboGaugeGainByEnemies ? { gaugeGainByEnemies: gg.comboGaugeGainByEnemies } : {}),
    };
  }

  // SP return notes from JSON (resolve via skillTypeMap)
  const battleSkillId = typeMap.BATTLE_SKILL;
  const spReturnNotes = battleSkillId ? opSkills?.[battleSkillId]?.spReturnNotes : undefined;
  if (skills.battle && spReturnNotes?.length) {
    skills.battle = { ...skills.battle, spReturnNotes };
  }

  return {
    id: operatorId,
    name: opJson.name as string,
    color,
    element: elementType,
    operatorClassType: opJson.operatorClassType as string,
    role: ROLE_LABELS[opJson.operatorClassType as string] ?? opJson.operatorClassType,
    rarity: opJson.operatorRarity as number,
    splash: splash as string | undefined,
    weaponTypes: Array.isArray(opJson.weaponType) ? opJson.weaponType : [opJson.weaponType],
    weapon: '',
    ...PLACEHOLDER_EQUIPMENT,
    skills,
    ultimateEnergyCost: gaugeMax,
    maxTalentOneLevel: talents?.one?.maxLevel ?? 0,
    maxTalentTwoLevel: talents?.two?.maxLevel ?? 0,
    talentOneName: talents?.one?.name ?? '',
    talentTwoName: talents?.two?.name ?? '',
    attributeIncreaseName: talents?.attributeIncrease?.name ?? '',
    attributeIncreaseAttribute: talents?.attributeIncrease?.attribute ?? '',
    maxAttributeIncreaseLevel: 4,
  };
}

// ── Config validation ────────────────────────────────────────────────────────

const FIELD_HINTS: Record<string, string> = {
  name: 'operator name',
  elementType: 'element (Heat, Cryo, etc.)',
  operatorClassType: 'class (Striker, Caster, etc.)',
  weaponType: 'weapon type (Sword, Arts Unit, etc.)',
};

function validateOperatorJson(json: Record<string, unknown>, isBuiltIn: boolean): string[] {
  const issues: string[] = [];
  for (const [field, hint] of Object.entries(FIELD_HINTS)) {
    if (!json[field]) issues.push(hint);
  }
  if (!json.skills && !json.basicAttackDefaultDuration) {
    issues.push('skill data (basic attack, battle skill, combo, ultimate)');
  }
  return issues;
}

function formatWarning(name: string, issues: string[], isBuiltIn: boolean): string {
  const missing = issues.join(', ');
  if (isBuiltIn) {
    // Developer-facing: this is our game data, be technical
    return `[game-data] ${name}: incomplete operator JSON — missing ${missing}. Check src/model/game-data/operators/.`;
  }
  // User-facing: imported/shared config
  return `"${name}" is missing: ${missing}. This can happen when importing a sheet from someone else. Try editing the operator to fill in the missing info, or delete and re-create it.`;
}

export const operatorWarnings: { id: string; name: string; message: string; isBuiltIn: boolean }[] = [];

// ── Build all operators ─────────────────────────────────────────────────────

export const ALL_OPERATORS: ViewOperator[] = [];
for (const id of getAllOperatorIds()) {
  const json = getOperatorJson(id);
  if (!json) {
    operatorWarnings.push({ id, name: id, isBuiltIn: true, message: `[game-data] ${id}: no JSON file found. Operator was registered but has no data.` });
    continue;
  }
  const issues = validateOperatorJson(json, true);
  if (issues.length > 0) {
    const name = (json.name as string) ?? id;
    const msg = formatWarning(name, issues, true);
    console.warn(msg);
    operatorWarnings.push({ id, name, isBuiltIn: true, message: msg });
    continue;
  }
  try {
    ALL_OPERATORS.push(buildViewOperatorFromJson(id, json));
  } catch (e) {
    const name = (json.name as string) ?? id;
    console.warn(`[game-data] ${name}: failed to build operator —`, e);
    operatorWarnings.push({ id, name, isBuiltIn: true, message: `[game-data] ${name}: unexpected build error. See console for details.` });
  }
}

// ── Public registration for custom operators ─────────────────────────────────

/**
 * Register a custom operator into ALL_OPERATORS from its config.
 * Called by the custom content system after loading from localStorage.
 */
export function registerCustomOperatorFromConfig(
  customId: string,
  opJson: Record<string, unknown>,
): ViewOperator | null {
  const name = (opJson.name as string) ?? customId;
  const issues = validateOperatorJson(opJson, false);
  if (issues.length > 0) {
    const msg = formatWarning(name, issues, false);
    console.warn(msg);
    operatorWarnings.push({ id: customId, name, isBuiltIn: false, message: msg });
    return null;
  }
  try {
    const viewOp = buildViewOperatorFromJson(customId, opJson);
    ALL_OPERATORS.push(viewOp);
    return viewOp;
  } catch (e) {
    const msg = `"${name}" failed to load. Try opening it in the editor and re-saving, or delete and re-create it.`;
    console.warn(msg, e);
    operatorWarnings.push({ id: customId, name, isBuiltIn: false, message: msg });
    return null;
  }
}

/** Deregister a custom operator by ID. */
export function deregisterCustomOperatorById(operatorId: string): void {
  const idx = ALL_OPERATORS.findIndex((o) => o.id === operatorId);
  if (idx >= 0) ALL_OPERATORS.splice(idx, 1);
}

// ── Ultimate energy cost with potential modifiers ────────────────────────────

function getUltimateEnergyCost(operatorId: string): number {
  const json = getOperatorJson(operatorId);
  if (!json) return 0;
  return loadUltimateEnergyCost(json);
}

/** Get the ultimate energy cost for an operator at a given potential. */
export function getUltimateEnergyCostForPotential(
  operatorId: string,
  potential: Potential,
): number | null {
  const opJson = getOperatorJson(operatorId);
  if (!opJson) return null;

  let baseCost = getUltimateEnergyCost(operatorId);

  const potentials = (opJson.potentials ?? []) as { level: number; effects: { potentialEffectType: string; skillCostModifier?: { skillType: string; value: number } }[] }[];
  for (const pot of potentials) {
    if (pot.level > potential) break;
    for (const eff of pot.effects) {
      if (eff.potentialEffectType === 'SKILL_COST' && eff.skillCostModifier) {
        const mod = eff.skillCostModifier;
        const tm = getSkillTypeMap(operatorId);
        const ultBaseId = tm['ULTIMATE'];
        const modSkill = mod.skillType;
        if (ultBaseId && (modSkill === ultBaseId || modSkill.endsWith(ultBaseId))) {
          baseCost = Math.round(baseCost * mod.value);
        }
      }
    }
  }

  return baseCost;
}

// ── Unified operator config lookup ──────────────────────────────────────────

/**
 * Get operator config for stat computation (DataDrivenOperator).
 * Checks built-in JSON first, then custom operators from localStorage.
 */
export function getOperatorConfig(operatorId: string): OperatorStatConfig | null {
  // Built-in operator JSON
  const json = getOperatorJson(operatorId);
  if (json) return json as OperatorStatConfig;

  // Custom operator (id stored as custom_<id>, strip prefix for lookup)
  const customId = operatorId.startsWith('custom_') ? operatorId.slice(7) : operatorId;
  const customs = loadCustomOperators();
  const custom = customs.find(c => c.id === customId);
  if (custom) {
    return {
      elementType: custom.elementType,
      mainAttributeType: custom.mainAttributeType as string,
      secondaryAttributeType: (custom.secondaryAttributeType ?? custom.mainAttributeType) as string,
      baseStats: custom.baseStats as OperatorStatConfig['baseStats'],
      potentials: custom.potentials
        ?.filter(p => p.statModifiers && Object.keys(p.statModifiers).length > 0)
        .map(p => ({
          level: p.level,
          effects: Object.entries(p.statModifiers!).map(([stat, value]) => ({
            potentialEffectType: 'STAT_MODIFIER',
            statModifier: { statType: stat, value: value as number },
          })),
        })) ?? [],
    };
  }

  return null;
}
