/**
 * Converts built-in game data to CustomWeapon / CustomGearSet format
 * for the "Clone as Custom" feature.
 */
import { WeaponType, GearSetType, ElementType } from '../../consts/enums';
import { WEAPON_DATA } from '../../model/weapons/weaponData';
import { WEAPONS, GEARS } from '../../utils/loadoutRegistry';
import { getWeaponEffectDefs, getGearEffectDefs, resolveTargetDisplay, resolveDurationSeconds, resolveTriggerInteractions } from '../../model/game-data/weaponGearEffectLoader';
import { getGearSetEffects } from '../../consts/gearSetEffects';
import { ALL_OPERATORS } from '../operators/operatorRegistry';
import { legacyTargetToObjectType, encodeLegacyTarget } from './bridgeUtils';
import { SubjectType, VerbType, ObjectType, DeterminerType } from '../../consts/semantics';
import type { Predicate, Interaction } from '../../consts/semantics';
import { OperatorClassType } from '../../model/enums/operators';
import type { CustomWeapon, CustomWeaponSkillDef } from '../../model/custom/customWeaponTypes';
import type { CustomGearSet, CustomGearPiece, CustomGearSetEffect } from '../../model/custom/customGearTypes';
import type { CustomOperator } from '../../model/custom/customOperatorTypes';

/** Convert a built-in weapon to CustomWeapon format. */
export function weaponToCustomWeapon(weaponName: string): CustomWeapon | null {
  const config = WEAPON_DATA[weaponName];
  const entry = WEAPONS.find((w) => w.name === weaponName);
  if (!config || !entry) return null;

  const skills: CustomWeaponSkillDef[] = [];

  // Skill 1 & 2 are stat boosts; skill 3 is the named effect
  const skillTypes = [config.skill1, config.skill2];
  if (config.skill3) skillTypes.push(config.skill3);

  // Check for triggered effects from DSL JSON
  const dslDefs = getWeaponEffectDefs(weaponName);
  // Index DSL defs by label for matching to skill slots
  let dslDefIdx = 0;

  for (const skillType of skillTypes) {
    // Named skill (skill 3) — match to DSL defs
    if (dslDefIdx < dslDefs.length && skillType === config.skill3) {
      // All remaining DSL defs belong to the named skill slot
      while (dslDefIdx < dslDefs.length) {
        const def = dslDefs[dslDefIdx];
        const target = resolveTargetDisplay(def);
        skills.push({
          type: 'NAMED',
          label: def.label ?? def.name,
          namedEffect: {
            name: def.label ?? def.name,
            triggers: resolveTriggerInteractions(def),
            target: encodeLegacyTarget(legacyTargetToObjectType(target as 'wielder' | 'team' | 'enemy')),
            durationSeconds: resolveDurationSeconds(def),
            maxStacks: def.stack?.max?.P0 ?? 1,
            cooldownSeconds: def.cooldownSeconds ?? 0,
            buffs: (def.buffs ?? []).map((b: any) => ({
              stat: b.stat,
              valueMin: b.valueMin ?? b.value ?? 0,
              valueMax: b.valueMax ?? b.value ?? 0,
              perStack: b.perStack ?? false,
            })),
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
    weaponType: config.type,
    weaponRarity: config.rarity as 3 | 4 | 5 | 6,
    baseAtk: { lv1: config.baseAtk.lv1, lv90: config.baseAtk.lv90 },
    skills,
  };
}

/** Convert a built-in gear set to CustomGearSet format. */
export function gearSetToCustomGearSet(gearSetType: GearSetType): CustomGearSet | null {
  const gearEntries = GEARS.filter((g) => g.gearSetType === gearSetType);
  if (gearEntries.length === 0) return null;

  const passiveEntry = getGearSetEffects(gearSetType);
  const dslDefs = getGearEffectDefs(gearSetType);

  const pieces: CustomGearPiece[] = gearEntries.slice(0, 3).map((g) => ({
    name: g.name,
    gearCategory: g.gearCategory,
    defense: 0,
    statsByRank: { 1: {}, 2: {}, 3: {}, 4: {} },
  }));

  let setEffect: CustomGearSetEffect | undefined;
  if (passiveEntry || dslDefs.length > 0) {
    setEffect = {
      passiveStats: (passiveEntry?.passiveStats ?? {}) as Record<string, number>,
      effects: dslDefs.map((def: any) => ({
        label: def.label ?? def.name,
        triggers: resolveTriggerInteractions(def),
        target: encodeLegacyTarget(legacyTargetToObjectType(resolveTargetDisplay(def) as 'wielder' | 'team' | 'enemy')),
        durationSeconds: resolveDurationSeconds(def),
        maxStacks: def.stack?.max?.P0 ?? 1,
        cooldownSeconds: def.cooldownSeconds ?? 0,
        buffs: (def.buffs ?? []).map((b: any) => ({
          stat: b.stat,
          value: b.value ?? b.valueMin ?? 0,
          perStack: b.perStack ?? false,
        })),
        note: def.note,
      })),
    };
  }

  return {
    id: `clone_${gearSetType.toLowerCase()}_${Date.now()}`,
    setName: `${passiveEntry?.label ?? gearSetType} (Clone)`,
    rarity: (gearEntries[0].rarity as 4 | 5 | 6) || 5,
    pieces,
    setEffect,
  };
}

/** Convert a built-in operator to CustomOperator format. */
export function operatorToCustomOperator(operatorId: string): CustomOperator | null {
  const op = ALL_OPERATORS.find((o) => o.id === operatorId);
  if (!op) return null;

  const comboRequires = op.triggerCapability?.comboRequires ?? [];
  const comboForbids = op.triggerCapability?.comboForbidsActiveColumns ?? [];
  const comboRequiresActive = op.triggerCapability?.comboRequiresActiveColumns ?? [];

  // Provide placeholder BASE_ATTACK so validation passes
  const placeholderStats: Partial<Record<string, number>> = { BASE_ATTACK: 100 };

  // Build triggerClause: each trigger condition → single-condition predicate
  const triggerClause: Predicate[] = comboRequires.length > 0
    ? comboRequires.map(tc => {
        const conditions: Interaction[] = [tc];
        // Fold column constraints into each predicate
        for (const col of comboRequiresActive) {
          const statusId = col.replace('enemy-', '').toUpperCase();
          conditions.push({ subjectType: SubjectType.ENEMY, verbType: VerbType.HAVE, objectType: ObjectType.STATUS, objectId: statusId });
        }
        for (const col of comboForbids) {
          const statusId = col.replace('enemy-', '').toUpperCase();
          conditions.push({ subjectType: SubjectType.ENEMY, verbType: VerbType.HAVE, objectType: ObjectType.STATUS, objectId: statusId, negated: true });
        }
        return { conditions, effects: [] };
      })
    : [{ conditions: [{ subjectDeterminer: DeterminerType.THIS, subjectType: SubjectType.OPERATOR, verbType: VerbType.PERFORM, objectType: ObjectType.BATTLE_SKILL }], effects: [] }];

  return {
    id: `clone_${operatorId}_${Date.now()}`,
    name: `${op.name} (Clone)`,
    operatorClassType: op.role.toUpperCase().replace(/\s+/g, '_') as OperatorClassType,
    elementType: op.element as ElementType,
    weaponType: op.weaponTypes[0] as WeaponType,
    operatorRarity: (op.rarity as 4 | 5 | 6) || 6,
    mainAttributeType: '',
    baseStats: { lv1: { ...placeholderStats }, lv90: { ...placeholderStats } },
    potentials: [],
    combo: {
      triggerClause,
      description: op.triggerCapability?.comboDescription ?? '',
      windowFrames: op.triggerCapability?.comboWindowFrames ?? 720,
    },
  };
}
