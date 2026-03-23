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
import { CombatSkillType, UnitType } from '../../consts/enums';
import { VerbType } from '../../dsl/semantics';

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
/** Find the first skill of a given type, or return a default. */
function findSkill(skills: CustomCombatSkillDef[], type: CombatSkillType): CustomCombatSkillDef {
  return skills.find(s => s.combatSkillType === type) ?? { ...DEFAULT_SKILL, combatSkillType: type };
}

function customOperatorToJson(operator: CustomOperator): Record<string, unknown> {
  const skillArr = operator.skills ?? [];
  const skills = {
    basicAttack: findSkill(skillArr, CombatSkillType.BASIC_ATTACK),
    battleSkill: findSkill(skillArr, CombatSkillType.BATTLE_SKILL),
    comboSkill: findSkill(skillArr, CombatSkillType.COMBO_SKILL),
    ultimate: findSkill(skillArr, CombatSkillType.ULTIMATE),
  };
  const json: Record<string, unknown> = {
    id: operator.id.toUpperCase(),
    name: operator.name,
    operatorRarity: operator.operatorRarity,
    operatorClassType: operator.operatorClassType,
    elementType: operator.elementType,
    weaponTypes: operator.weaponTypes,
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
          duration: { value: { verb: VerbType.IS, value: skills.basicAttack.durationSeconds }, unit: UnitType.SECOND },
        }],
      },
      BATTLE_SKILL: {
        id: skills.battleSkill.name,
        duration: { value: { verb: VerbType.IS, value: skills.battleSkill.durationSeconds }, unit: UnitType.SECOND },
        ...(skills.battleSkill.animationSeconds
          ? { segments: [{
            metadata: { eventComponentType: 'SEGMENT' },
            properties: { segmentTypes: ['ANIMATION'], name: 'Animation', duration: { value: { verb: VerbType.IS, value: skills.battleSkill.animationSeconds }, unit: UnitType.SECOND }, timeDependency: 'REAL_TIME', timeInteractionType: 'TIME_STOP' },
            frames: [],
          }] }
          : {}),
        ...(skills.battleSkill.resourceInteractions?.length
          ? { effects: skills.battleSkill.resourceInteractions.map(r => ({
            toDeterminer: 'THIS', toObject: 'OPERATOR',
            verb: r.verb, object: r.resourceType, with: { value: { verb: VerbType.IS, value: r.value } },
          })) }
          : {}),
      },
      COMBO_SKILL: {
        id: skills.comboSkill.name,
        duration: { value: { verb: VerbType.IS, value: skills.comboSkill.durationSeconds }, unit: UnitType.SECOND },
        ...(skills.comboSkill.cooldownSeconds
          ? { effects: [{ toDeterminer: 'THIS', toObject: 'OPERATOR', verb: 'CONSUME', object: 'COOLDOWN', with: { value: { verb: VerbType.IS, value: skills.comboSkill.cooldownSeconds } } }] }
          : {}),
        ...(skills.comboSkill.animationSeconds
          ? { segments: [{
            metadata: { eventComponentType: 'SEGMENT' },
            properties: { segmentTypes: ['ANIMATION'], name: 'Animation', duration: { value: { verb: VerbType.IS, value: skills.comboSkill.animationSeconds }, unit: UnitType.SECOND }, timeDependency: 'REAL_TIME', timeInteractionType: 'TIME_STOP' },
            frames: [],
          }] }
          : {}),
        // Combo trigger
        ...(operator.combo.onTriggerClause.length > 0 ? {
          trigger: {
            onTriggerClause: operator.combo.onTriggerClause,
            description: operator.combo.description,
            windowFrames: operator.combo.windowFrames ?? 720,
          },
        } : {}),
      },
      ULTIMATE: {
        id: skills.ultimate.name,
        duration: { value: { verb: VerbType.IS, value: skills.ultimate.durationSeconds }, unit: UnitType.SECOND },
        ...(skills.ultimate.animationSeconds
          ? { segments: [{
            metadata: { eventComponentType: 'SEGMENT' },
            properties: { segmentTypes: ['ANIMATION'], name: 'Animation', duration: { value: { verb: VerbType.IS, value: skills.ultimate.animationSeconds }, unit: UnitType.SECOND }, timeDependency: 'REAL_TIME', timeInteractionType: 'TIME_STOP' },
            frames: [],
          }] }
          : {}),
        effects: [
          { toDeterminer: 'THIS', toObject: 'OPERATOR', verb: 'CONSUME', object: 'ULTIMATE_ENERGY', with: { value: { verb: VerbType.IS, value: 300 } } },
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
    create: () => viewOp as unknown as import('../../model/operators/dataDrivenOperator').DataDrivenOperator,
  });
}

export function deregisterCustomOperator(operator: CustomOperator): void {
  const customId = `custom_${operator.id}`;
  deregisterCustomOperatorById(customId);

  const regIdx = OPERATORS.findIndex((o) => o.name === operator.name);
  if (regIdx >= 0) OPERATORS.splice(regIdx, 1);
}
