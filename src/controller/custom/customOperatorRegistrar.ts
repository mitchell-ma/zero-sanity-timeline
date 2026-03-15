/**
 * Registers/deregisters custom operators into the runtime registries.
 *
 * Delegates to the unified registrar in operatorRegistry.ts, which handles
 * both built-in and custom operators through the same path.
 */
import type { Operator as ViewOperator } from '../../consts/viewTypes';
import { TriggerConditionType, ELEMENT_COLORS, ElementType } from '../../consts/enums';
import {
  ALL_OPERATORS,
  registerCustomOperatorFromConfig,
  deregisterCustomOperatorById,
} from '../operators/operatorRegistry';
import { OPERATORS } from '../../utils/loadoutRegistry';
import type { CustomOperator } from '../../model/custom/customOperatorTypes';
import { interactionToTriggerCondition } from './bridgeUtils';

const FPS = 120;

/**
 * Convert a CustomOperator into the JSON shape expected by the unified registrar.
 * This bridges the CustomOperator type to the same operator JSON format
 * used by built-in operators.
 */
function customOperatorToJson(operator: CustomOperator): Record<string, any> {
  const json: Record<string, any> = {
    operatorType: operator.id.toUpperCase(),
    name: operator.name,
    operatorRarity: operator.operatorRarity,
    operatorClassType: operator.operatorClassType,
    elementType: operator.elementType,
    weaponType: operator.weaponType,
    mainAttributeType: operator.mainAttributeType,
    secondaryAttributeType: operator.secondaryAttributeType ?? operator.mainAttributeType,
    displayColor: operator.displayColor,
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
    basicAttackDefaultDuration: operator.skills.basicAttack.durationSeconds,
    skills: {
      BASIC_ATTACK: {
        id: operator.skills.basicAttack.name,
        segments: [{
          duration: { value: operator.skills.basicAttack.durationSeconds, unit: 'SECOND' },
        }],
      },
      BATTLE_SKILL: {
        id: operator.skills.battleSkill.name,
        duration: { value: operator.skills.battleSkill.durationSeconds, unit: 'SECOND' },
        ...(operator.skills.battleSkill.animationSeconds
          ? { animation: { duration: { value: operator.skills.battleSkill.animationSeconds, unit: 'SECOND' } } }
          : {}),
        ...(operator.skills.battleSkill.resourceInteractions?.length
          ? { effects: operator.skills.battleSkill.resourceInteractions.map(r => ({
            prepositionType: 'TO', toObjectType: 'THIS_OPERATOR',
            verbType: r.verbType, objectType: r.resourceType, cardinality: r.value,
          })) }
          : {}),
      },
      COMBO_SKILL: {
        id: operator.skills.comboSkill.name,
        duration: { value: operator.skills.comboSkill.durationSeconds, unit: 'SECOND' },
        ...(operator.skills.comboSkill.cooldownSeconds
          ? { effects: [{ prepositionType: 'TO', toObjectType: 'THIS_OPERATOR', verbType: 'EXPEND', objectType: 'COOLDOWN', cardinality: operator.skills.comboSkill.cooldownSeconds }] }
          : {}),
        ...(operator.skills.comboSkill.animationSeconds
          ? { animation: { duration: { value: operator.skills.comboSkill.animationSeconds, unit: 'SECOND' } } }
          : {}),
        // Combo trigger
        ...(operator.combo.requires.length > 0 ? {
          trigger: {
            requires: operator.combo.requires
              .map(interactionToTriggerCondition)
              .filter((t): t is TriggerConditionType => t !== null),
            description: operator.combo.description,
            windowFrames: operator.combo.windowFrames ?? 720,
            ...(operator.combo.forbidsActiveColumns ? { forbidsActiveColumns: operator.combo.forbidsActiveColumns } : {}),
            ...(operator.combo.requiresActiveColumns ? { requiresActiveColumns: operator.combo.requiresActiveColumns } : {}),
          },
        } : {}),
      },
      ULTIMATE: {
        id: operator.skills.ultimate.name,
        duration: { value: operator.skills.ultimate.durationSeconds, unit: 'SECOND' },
        ...(operator.skills.ultimate.animationSeconds
          ? { animation: { duration: { value: operator.skills.ultimate.animationSeconds, unit: 'SECOND' } } }
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
