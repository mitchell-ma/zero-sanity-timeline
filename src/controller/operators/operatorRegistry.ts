/**
 * Operator registry — unified registrar that builds view operators from JSON config.
 *
 * Built-in operators: auto-discovered from game-data/operators/*.json
 * Custom operators: loaded from localStorage and registered through the same path.
 *
 * No hardcoded DISPLAY_CONFIGS — all display/timing data comes from JSON fields.
 */
import { Operator as ViewOperator, SkillDef, EventSegmentData } from '../../consts/viewTypes';
import { ElementType, OperatorClassType, ELEMENT_COLORS, SegmentType, TimeDependency } from '../../consts/enums';
import { NounType } from '../../dsl/semantics';
import { Potential } from '../../consts/types';
import {
  buildMergedOperatorJson,
  getAllOperatorIds,
  getOperatorBase,
  getSkillTypeMap,
  getSkillTimings as loadSkillTimings,
  getUltimateEnergyCost as loadUltimateEnergyCost,
  getBattleSkillSpCost as loadBattleSkillSpCost,
} from '../gameDataStore';
import { ATTRIBUTE_INCREASE_LOOKUP, type OperatorStatConfig } from '../../model/operators/dataDrivenOperator';
import { loadCustomOperators } from '../../utils/customContentStorage';
import { LocaleKey, resolveEventName, resolveOptionalEventDescription } from '../../locales/gameDataLocale';

// Auto-discover splash art assets
const splashContext = require.context('../../assets/operators', false, /banner\.webp$/);
const SPLASH_ART: Record<string, string> = {};
for (const key of splashContext.keys()) {
  const match = key.match(/\.\/(.+)_banner\.webp$/);
  if (match) {
    const assetName = match[1];
    SPLASH_ART[assetName] = splashContext(key);
  }
}

/** Look up splash art by operator ID (hard-wired: `<id.toLowerCase()>_banner.webp`). */
function getSplashArt(operatorId: string): string | undefined {
  return SPLASH_ART[operatorId.toLowerCase()];
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


// ── Unified view operator builder ────────────────────────────────────────────

/**
 * Build a ViewOperator from an operator JSON config.
 * Works for both built-in operators (auto-discovered JSONs) and custom operators
 * (loaded from localStorage with the same shape).
 */
function buildViewOperatorFromJson(operatorId: string, opJson: Record<string, unknown>): ViewOperator {
  const timings = loadSkillTimings(opJson);
  const elementType = opJson.elementType as string;
  const talents = opJson.talents as {
    one?: { name: string; maxLevel: number };
    two?: { name: string; maxLevel: number };
    attributeIncrease?: { id: string };
  } | undefined;
  const opSkills = opJson.skills as Record<string, Record<string, unknown>> | undefined;

  // Display color: always derived from element
  const color = ELEMENT_COLORS[elementType as ElementType] ?? '#888888';

  // Splash art: explicit field → asset auto-discovery
  const splash = opJson.splashArt ?? getSplashArt(operatorId);

  // Build skill type → base skill ID map from skillTypeMap
  const typeMap = getSkillTypeMap(operatorId);
  // typeMap keys are already NounType values (BASIC_ATTACK, BATTLE_SKILL, etc.)
  // so categoryToName is just typeMap itself
  const categoryToName = typeMap;

  // Compute skill timing from End-Axis data
  const basicActivation = 24;
  const battleActivation = timings.battleDur;
  const battleCooldown = 0;
  // Build defaultSegments for basic/battle skills only — combo and ultimate are fully data-driven from JSON
  const buildSegments = (activation: number, cooldown: number): EventSegmentData[] => {
    const segs: EventSegmentData[] = [];
    if (activation > 0) segs.push({ properties: { duration: activation } });
    if (cooldown > 0) segs.push({ properties: { segmentTypes: [SegmentType.COOLDOWN, SegmentType.IMMEDIATE_COOLDOWN], duration: cooldown, name: 'Cooldown', timeDependency: TimeDependency.REAL_TIME } });
    return segs.length > 0 ? segs : [{ properties: { duration: activation || 24 } }];
  };

  const skillSegmentConfigs: Record<string, {
    defaultSegments?: EventSegmentData[];
    triggerCondition: string | null;
  }> = {
    [NounType.BASIC_ATTACK]: {
      defaultSegments: buildSegments(basicActivation, 0),
      triggerCondition: null,
    },
    [NounType.BATTLE]: {
      defaultSegments: buildSegments(battleActivation, battleCooldown),
      triggerCondition: null,
    },
    [NounType.COMBO]: {
      triggerCondition: null,
    },
    [NounType.ULTIMATE]: {
      triggerCondition: null,
    },
  };

  const skills: Record<string, SkillDef> = {};
  for (const [key, timing] of Object.entries(skillSegmentConfigs)) {
    const skillName = categoryToName[key] ?? key;
    const rawEntry: string | undefined = typeMap[key];
    const resolvedSkillId = rawEntry ?? key;
    const desc = resolvedSkillId
      ? resolveOptionalEventDescription(LocaleKey.operatorSkill(operatorId, resolvedSkillId))
      : undefined;
    skills[key] = { name: skillName, element: elementType, ...timing, ...(desc ? { description: desc } : {}) };
  }

  // SP cost from JSON
  if (skills[NounType.BATTLE]) {
    const spCost = loadBattleSkillSpCost(opJson);
    if (spCost > 0) skills[NounType.BATTLE] = { ...skills[NounType.BATTLE], skillPointCost: spCost };
  }

  // SP return notes from JSON (resolve via skillTypeMap)
  const battleSkillId = typeMap[NounType.BATTLE];
  const spReturnNotes = (battleSkillId ? opSkills?.[battleSkillId]?.spReturnNotes : undefined) as string[] | undefined;
  if (skills[NounType.BATTLE] && spReturnNotes?.length) {
    skills[NounType.BATTLE] = { ...skills[NounType.BATTLE], spReturnNotes };
  }

  return {
    id: operatorId,
    name: resolveEventName(LocaleKey.operator(operatorId)),
    color,
    element: elementType,
    operatorClassType: opJson.operatorClassType as string,
    role: ROLE_LABELS[opJson.operatorClassType as string] ?? opJson.operatorClassType,
    rarity: opJson.operatorRarity as number,
    splash: splash as string | undefined,
    weaponTypes: (opJson.weaponTypes as string[]) ?? [],
    weapon: '',
    ...PLACEHOLDER_EQUIPMENT,
    skills,
    maxTalentOneLevel: talents?.one?.maxLevel ?? 0,
    maxTalentTwoLevel: talents?.two?.maxLevel ?? 0,
    talentOneName: talents?.one?.name ?? '',
    talentTwoName: talents?.two?.name ?? '',
    attributeIncreaseName: (talents?.attributeIncrease?.id ? ATTRIBUTE_INCREASE_LOOKUP[talents.attributeIncrease.id]?.name : undefined) ?? '',
    attributeIncreaseAttribute: (talents?.attributeIncrease?.id ? ATTRIBUTE_INCREASE_LOOKUP[talents.attributeIncrease.id]?.attribute : undefined) ?? '',
    maxAttributeIncreaseLevel: 4,
  };
}

// ── Config validation ────────────────────────────────────────────────────────

const FIELD_HINTS: Record<string, string> = {
  elementType: 'element (Heat, Cryo, etc.)',
  operatorClassType: 'class (Striker, Caster, etc.)',
  weaponTypes: 'weapon type (Sword, Arts Unit, etc.)',
};

function validateOperatorJson(json: Record<string, unknown>, isBuiltIn: boolean): string[] {
  const issues: string[] = [];
  for (const [field, hint] of Object.entries(FIELD_HINTS)) {
    if (!json[field]) issues.push(hint);
  }
  if (!json.skills) {
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

function clearOperatorWarning(id: string): void {
  for (let i = operatorWarnings.length - 1; i >= 0; i--) {
    if (operatorWarnings[i].id === id) operatorWarnings.splice(i, 1);
  }
}

/** Look up a pending warning for a custom operator by id (case-insensitive). */
export function getCustomOperatorWarning(customId: string): string | undefined {
  const key = customId.toLowerCase();
  return operatorWarnings.find((w) => !w.isBuiltIn && w.id.toLowerCase() === key)?.message;
}

// ── Build all operators ─────────────────────────────────────────────────────

export const ALL_OPERATORS: ViewOperator[] = [];
for (const id of getAllOperatorIds()) {
  const json = buildMergedOperatorJson(id);
  if (!json) {
    operatorWarnings.push({ id, name: id, isBuiltIn: true, message: `[game-data] ${id}: no JSON file found. Operator was registered but has no data.` });
    continue;
  }
  const issues = validateOperatorJson(json, true);
  if (issues.length > 0) {
    const name = resolveEventName(LocaleKey.operator(id));
    const msg = formatWarning(name, issues, true);
    console.warn(msg);
    operatorWarnings.push({ id, name, isBuiltIn: true, message: msg });
    continue;
  }
  try {
    ALL_OPERATORS.push(buildViewOperatorFromJson(id, json));
  } catch (e) {
    const name = resolveEventName(LocaleKey.operator(id));
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
  const name = resolveEventName(LocaleKey.operator(customId));
  clearOperatorWarning(customId);
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
  clearOperatorWarning(operatorId);
}

// ── Ultimate energy cost ─────────────────────────────────────────────────────

export function getUltimateEnergyCost(operatorId: string): number {
  const json = buildMergedOperatorJson(operatorId);
  if (!json) return 0;
  return loadUltimateEnergyCost(json);
}

/** Get the ultimate energy cost for an operator at a given potential. */
export function getUltimateEnergyCostForPotential(
  operatorId: string,
  potential: Potential,
): number | null {
  const json = buildMergedOperatorJson(operatorId);
  if (!json) return null;
  return loadUltimateEnergyCost(json, { skillLevel: 12, potential, stats: {} });
}

// ── Unified operator config lookup ──────────────────────────────────────────

/**
 * Get operator config for stat computation (DataDrivenOperator).
 * Checks built-in JSON first, then custom operators from localStorage.
 */
export function getOperatorConfig(operatorId: string): OperatorStatConfig | null {
  // Built-in operator — use typed OperatorBase directly
  const base = getOperatorBase(operatorId);
  if (base) return base.serialize() as unknown as OperatorStatConfig;

  // Custom operator (id stored as custom_<id>, strip prefix for lookup)
  const customId = operatorId.startsWith('custom_') ? operatorId.slice(7) : operatorId;
  const customs = loadCustomOperators();
  const custom = customs.find(c => c.id === customId);
  if (custom) {
    return {
      id: operatorId,
      elementType: custom.elementType,
      mainAttributeType: custom.mainAttributeType as string,
      secondaryAttributeType: (custom.secondaryAttributeType ?? custom.mainAttributeType) as string,
      baseStats: custom.baseStats as OperatorStatConfig['baseStats'],
      potentials: custom.potentials?.map(p => ({
          level: p.level,
        })) ?? [],
    };
  }

  return null;
}
