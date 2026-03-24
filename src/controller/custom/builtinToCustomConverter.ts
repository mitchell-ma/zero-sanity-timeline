/**
 * Converts built-in game data to CustomWeapon / CustomGearSet format
 * for the "Clone as Custom" feature.
 */
import { WeaponType, GearSetType, GearCategory, ElementType } from '../../consts/enums';
import { getWeapon, resolveWeaponId, getAllGearPieces, getGearSetEffect, getWeaponEffectDefs, getGearEffectDefs, resolveTargetDisplay, resolveDurationSeconds, resolveTriggerInteractions } from '../gameDataStore';
import { getGearSetEffects } from '../../consts/gearSetEffects';
import { ALL_OPERATORS } from '../operators/operatorRegistry';
import { legacyTargetToObjectType, encodeLegacyTarget } from './bridgeUtils';
import { SubjectType, VerbType, ObjectType, DeterminerType } from '../../dsl/semantics';
import type { Predicate } from '../../dsl/semantics';
import { resolveValueNode, DEFAULT_VALUE_CONTEXT } from '../calculation/valueResolver';
import { OperatorClassType } from '../../model/enums/operators';
import type { CustomWeapon, CustomWeaponSkillDef } from '../../model/custom/customWeaponTypes';
import type { CustomGearSet, CustomGearPiece, CustomGearSetEffect } from '../../model/custom/customGearTypes';
import type { CustomOperator } from '../../model/custom/customOperatorTypes';
import { getComboTriggerInfo } from '../gameDataStore';

/** Convert a built-in weapon to CustomWeapon format. */
export function weaponToCustomWeapon(weaponName: string): CustomWeapon | null {
  const weaponId = resolveWeaponId(weaponName);
  const config = weaponId ? getWeapon(weaponId) : undefined;
  if (!config) return null;

  const skills: CustomWeaponSkillDef[] = [];

  // Skill 1 & 2 are stat boosts; skill 3 is the named effect
  const skillTypes = [config.skills[0], config.skills[1]].filter(Boolean);
  if (config.skills[2]) skillTypes.push(config.skills[2]);

  // Check for triggered effects from DSL JSON
  const dslDefs = getWeaponEffectDefs(weaponName);
  // Index DSL defs by label for matching to skill slots
  let dslDefIdx = 0;

  for (const skillType of skillTypes) {
    // Named skill (skill 3) — match to DSL defs
    if (dslDefIdx < dslDefs.length && skillType === config.skills[2]) {
      // All remaining DSL defs belong to the named skill slot
      while (dslDefIdx < dslDefs.length) {
        const def = dslDefs[dslDefIdx];
        const target = resolveTargetDisplay(def);
        const clauseEffects = (def.clause ?? []).flatMap((c) => (c.effects ?? []) as Record<string, unknown>[])
          .filter((e) => e.verb === 'APPLY' && (e.with as Record<string, unknown>)?.value);
        skills.push({
          type: 'NAMED',
          label: def.name ?? def.description ?? '',
          namedEffect: {
            name: def.name ?? def.description ?? '',
            triggers: resolveTriggerInteractions(def),
            target: encodeLegacyTarget(legacyTargetToObjectType(target as 'wielder' | 'team' | 'enemy')),
            durationSeconds: resolveDurationSeconds(def),
            maxStacks: def.stacks?.limit ? resolveValueNode(def.stacks.limit, DEFAULT_VALUE_CONTEXT) : 1,
            cooldownSeconds: def.cooldownSeconds ?? 0,
            buffs: clauseEffects.map((e) => {
              const wv = (e.with as Record<string, unknown>).value as Record<string, unknown>;
              const perStack = wv.verb === VerbType.VARY_BY && wv.object === 'STATUS_LEVEL';
              return {
                stat: e.object as string,
                valueMin: (wv.valueMin as number) ?? (wv.value as number) ?? 0,
                valueMax: (wv.valueMax as number) ?? (wv.value as number) ?? 0,
                perStack,
              };
            }),
            note: def.note,
          },
        });
        dslDefIdx++;
      }
    } else {
      // Treat as stat boost with placeholder label
      skills.push({
        type: 'STAT_BOOST',
        label: skillType.replace(/_/g, ' '),
        statBoost: { stat: skillType, values: [] },
      });
    }
  }

  return {
    id: `clone_${weaponName.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`,
    name: `${weaponName} (Clone)`,
    weaponType: config.type as WeaponType,
    weaponRarity: config.rarity as 3 | 4 | 5 | 6,
    baseAtk: { lv1: config.getBaseAttack(1), lv90: config.getBaseAttack(90) },
    skills,
  };
}

/** Convert a built-in gear set to CustomGearSet format. */
export function gearSetToCustomGearSet(gearSetType: GearSetType): CustomGearSet | null {
  const gearPieces = getAllGearPieces().filter((g) => g.gearSet === gearSetType);
  if (gearPieces.length === 0) return null;

  const passiveEntry = getGearSetEffects(gearSetType);
  const dslDefs = getGearEffectDefs(gearSetType);

  const pieces: CustomGearPiece[] = gearPieces.slice(0, 3).map((g) => ({
    name: g.name,
    gearCategory: g.type as GearCategory,
    defense: 0,
    statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
  }));

  let setEffect: CustomGearSetEffect | undefined;
  if (passiveEntry || dslDefs.length > 0) {
    setEffect = {
      passiveStats: (passiveEntry?.passiveStats ?? {}) as Record<string, number>,
      effects: dslDefs.map((def) => {
        const clauseEffects = (def.clause ?? []).flatMap((c) => (c.effects ?? []) as Record<string, unknown>[])
          .filter((e) => e.verb === 'APPLY' && (e.with as Record<string, unknown>)?.value);
        return {
          label: def.name ?? def.description ?? '',
          triggers: resolveTriggerInteractions(def),
          target: encodeLegacyTarget(legacyTargetToObjectType(resolveTargetDisplay(def) as 'wielder' | 'team' | 'enemy')),
          durationSeconds: resolveDurationSeconds(def),
          maxStacks: def.stacks?.limit ? resolveValueNode(def.stacks.limit, DEFAULT_VALUE_CONTEXT) : 1,
          cooldownSeconds: def.cooldownSeconds ?? 0,
          buffs: clauseEffects.map((e) => {
            const wv = (e.with as Record<string, unknown>).value as Record<string, unknown>;
            const perStack = wv.verb === VerbType.VARY_BY && wv.object === 'STATUS_LEVEL';
            return {
              stat: e.object as string,
              value: (wv.value as number) ?? (wv.valueMin as number) ?? 0,
              perStack,
            };
          }),
          note: def.note,
        };
      }),
    };
  }

  return {
    id: `clone_${gearSetType.toLowerCase()}_${Date.now()}`,
    setName: `${passiveEntry?.label ?? gearSetType} (Clone)`,
    rarity: ((getGearSetEffect(gearSetType)?.rarity ?? 5) as 4 | 5 | 6) || 5,
    pieces,
    setEffect,
  };
}

/** Convert a built-in operator to CustomOperator format. */
export function operatorToCustomOperator(operatorId: string): CustomOperator | null {
  const op = ALL_OPERATORS.find((o) => o.id === operatorId);
  if (!op) return null;

  const info = getComboTriggerInfo(operatorId);

  // Provide placeholder BASE_ATTACK so validation passes
  const placeholderStats: Partial<Record<string, number>> = { BASE_ATTACK: 100 };

  // Copy onTriggerClause directly from JSON (already in the right shape)
  const onTriggerClause: Predicate[] = info
    ? (info.onTriggerClause as Predicate[])
    : [{ conditions: [{ subjectDeterminer: DeterminerType.THIS, subject: SubjectType.OPERATOR, verb: VerbType.PERFORM, object: ObjectType.BATTLE_SKILL }], effects: [] }];

  return {
    id: `clone_${operatorId}_${Date.now()}`,
    name: `${op.name} (Clone)`,
    operatorClassType: op.role.toUpperCase().replace(/\s+/g, '_') as OperatorClassType,
    elementType: op.element as ElementType,
    weaponTypes: op.weaponTypes as WeaponType[],
    operatorRarity: (op.rarity as 4 | 5 | 6) || 6,
    mainAttributeType: '',
    baseStats: { lv1: { ...placeholderStats }, lv90: { ...placeholderStats } },
    potentials: [],
    skills: [],
    combo: {
      onTriggerClause,
      description: info?.description ?? '',
      windowFrames: info?.windowFrames ?? 720,
    },
  };
}
