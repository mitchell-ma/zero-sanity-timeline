/**
 * Registers/deregisters custom operators into the runtime registries.
 *
 * Delegates to the unified registrar in operatorRegistry.ts, which handles
 * both built-in and custom operators through the same path.
 */
import {
  registerCustomOperatorFromConfig,
  deregisterCustomOperatorById,
} from '../operators/operatorRegistry';
import { OPERATORS } from '../../utils/loadoutRegistry';
import type { CustomOperator, CustomCombatSkillDef } from '../../model/custom/customOperatorTypes';
import { CombatSkillType } from '../../consts/enums';

const DEFAULT_SKILL: CustomCombatSkillDef = {
  name: 'Unnamed Skill',
  combatSkillType: CombatSkillType.BASIC_ATTACK,
  durationSeconds: 1,
};

/**
 * Convert a CustomOperator into the JSON shape expected by the unified registrar.
 * This bridges the CustomOperator type to the same operator JSON format
 * used by built-in operators.
 */
function customOperatorToJson(operator: CustomOperator): Record<string, any> {
  const skills = operator.skills ?? {
    basicAttack: { ...DEFAULT_SKILL, name: 'Basic Attack', combatSkillType: CombatSkillType.BASIC_ATTACK },
    battleSkill: { ...DEFAULT_SKILL, name: 'Battle Skill', combatSkillType: CombatSkillType.BATTLE_SKILL },
    comboSkill: { ...DEFAULT_SKILL, name: 'Combo Skill', combatSkillType: CombatSkillType.COMBO_SKILL },
    ultimate: { ...DEFAULT_SKILL, name: 'Ultimate', combatSkillType: CombatSkillType.ULTIMATE, durationSeconds: 3 },
  };
  const json: Record<string, any> = {
    operatorType: operator.id.toUpperCase(),
    name: operator.name,
    operatorRarity: operator.operatorRarity,
    operatorClassType: operator.operatorClassType,
    elementType: operator.elementType,
    weaponType: operator.weaponType,
    mainAttributeType: operator.mainAttributeType,
    secondaryAttributeType: operator.secondaryAttributeType ?? operator.mainAttributeType,
    splashArt: operator.splashArt,
    baseStats: operator.baseStats,
    potentials: operator.potentials?.map(p => ({
      level: p.level,
      name: p.description,
      effects: [
        ...(p.statModifiers
          ? Object.entries(p.statModifiers).map(([stat, value]) => ({
            potentialEffectType: 'STAT_MODIFIER',
            statModifier: { statType: stat, value },
          }))
          : []),
      ],
    })) ?? [],
    talents: {},
    // Timing overrides from custom skill defs
    basicAttackDefaultDuration: skills.basicAttack.durationSeconds,
    skills: {
      BASIC_ATTACK: {
        id: skills.basicAttack.name,
        segments: [{
          duration: { value: skills.basicAttack.durationSeconds, unit: 'SECOND' },
        }],
      },
      BATTLE_SKILL: {
        id: skills.battleSkill.name,
        duration: { value: skills.battleSkill.durationSeconds, unit: 'SECOND' },
        ...(skills.battleSkill.animationSeconds
          ? { animation: { duration: { value: skills.battleSkill.animationSeconds, unit: 'SECOND' } } }
          : {}),
        ...(skills.battleSkill.resourceInteractions?.length
          ? { effects: skills.battleSkill.resourceInteractions.map(r => ({
            prepositionType: 'TO', toObjectType: 'THIS_OPERATOR',
            verbType: r.verbType, objectType: r.resourceType, cardinality: r.value,
          })) }
          : {}),
      },
      COMBO_SKILL: {
        id: skills.comboSkill.name,
        duration: { value: skills.comboSkill.durationSeconds, unit: 'SECOND' },
        ...(skills.comboSkill.cooldownSeconds
          ? { effects: [{ prepositionType: 'TO', toObjectType: 'THIS_OPERATOR', verbType: 'EXPEND', objectType: 'COOLDOWN', cardinality: skills.comboSkill.cooldownSeconds }] }
          : {}),
        ...(skills.comboSkill.animationSeconds
          ? { animation: { duration: { value: skills.comboSkill.animationSeconds, unit: 'SECOND' } } }
          : {}),
        // Combo trigger
        ...(operator.combo.triggerClause.length > 0 ? {
          trigger: {
            triggerClause: operator.combo.triggerClause,
            description: operator.combo.description,
            windowFrames: operator.combo.windowFrames ?? 720,
          },
        } : {}),
      },
      ULTIMATE: {
        id: skills.ultimate.name,
        duration: { value: skills.ultimate.durationSeconds, unit: 'SECOND' },
        ...(skills.ultimate.animationSeconds
          ? { animation: { duration: { value: skills.ultimate.animationSeconds, unit: 'SECOND' } } }
          : {}),
        effects: [
          { prepositionType: 'TO', toObjectType: 'THIS_OPERATOR', verbType: 'EXPEND', objectType: 'ULTIMATE_ENERGY', cardinality: 300 },
        ],
      },
    },
  };

  return json;
}

export function registerCustomOperator(operator: CustomOperator): void {
  const customId = `custom_${operator.id}`;
  const opJson = customOperatorToJson(operator);

  const viewOp = registerCustomOperatorFromConfig(customId, opJson);
  if (!viewOp) return;

  OPERATORS.push({
    name: operator.name,
    icon: operator.splashArt,
    rarity: operator.operatorRarity,
    create: () => viewOp as any,
  });
}

export function deregisterCustomOperator(operator: CustomOperator): void {
  const customId = `custom_${operator.id}`;
  deregisterCustomOperatorById(customId);

  const regIdx = OPERATORS.findIndex((o) => o.name === operator.name);
  if (regIdx >= 0) OPERATORS.splice(regIdx, 1);
}
