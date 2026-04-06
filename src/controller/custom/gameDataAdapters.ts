/**
 * Bidirectional adapters between "friendly editor types" (Custom*) and game data JSON.
 *
 * toFriendly(gameDataJson) → Custom* type for the editor UI
 * fromFriendly(friendlyObj) → game data JSON for storage/registration
 *
 * These adapters consolidate the conversion logic previously split between
 * builtinToCustomConverter.ts (game data → friendly) and the registrar files
 * (friendly → game data).
 */
import { VerbType, NounType, DeterminerType } from '../../dsl/semantics';
import type { Predicate, Interaction, Clause } from '../../dsl/semantics';
import {
  UnitType, StackInteractionType, ElementType,
  WeaponType, GearCategory, EventType,
} from '../../consts/enums';
import type { StatType } from '../../model/enums';
import type { OperatorClassType } from '../../model/enums/operators';
import type { CustomOperator, CustomPotentialEntry } from '../../model/custom/customOperatorTypes';
import type { CustomSkill, CustomSkillResourceInteraction, CustomSkillSegmentDef } from '../../model/custom/customSkillTypes';
import type { CustomOperatorStatus } from '../../model/custom/customOperatorStatusTypes';
import type { CustomOperatorTalent } from '../../model/custom/customOperatorTalentTypes';
import type { CustomWeapon, CustomWeaponSkillDef } from '../../model/custom/customWeaponTypes';
import type { CustomGearSet, CustomGearPiece, CustomGearSetEffect, CustomGearEffect as CustomGearEffectDef } from '../../model/custom/customGearTypes';
import type { CustomWeaponEffect } from '../../model/custom/customWeaponEffectTypes';
import type { CustomGearEffect } from '../../model/custom/customGearEffectTypes';
import type { CustomStatusEventDef, CustomSegmentDef } from '../../model/custom/customStatusEventTypes';
import { resolveValueNode, DEFAULT_VALUE_CONTEXT } from '../calculation/valueResolver';

// ── Helpers ────────────────────────────────────────────────────────────────

type GameDataJson = Record<string, unknown>;

/** Wrap a scalar value in a DSL IS ValueNode. */
function isNode(value: number) {
  return { verb: VerbType.IS, value };
}

/** Build a DSL duration object. */
function dslDuration(seconds: number) {
  return { value: isNode(seconds), unit: UnitType.SECOND };
}

/** Extract a scalar duration in seconds from a DSL duration config. */
function extractDurationSeconds(dur: unknown): number {
  if (!dur || typeof dur !== 'object') return 0;
  const d = dur as { value?: unknown; unit?: string };
  if (!d.value) return 0;
  return resolveValueNode(d.value as import('../../dsl/semantics').ValueNode, DEFAULT_VALUE_CONTEXT);
}

/** Extract max stacks from a DSL stacks config. */
function extractMaxStacks(stacks: unknown): number {
  if (!stacks || typeof stacks !== 'object') return 1;
  const s = stacks as { limit?: unknown };
  if (!s.limit) return 1;
  return resolveValueNode(s.limit as import('../../dsl/semantics').ValueNode, DEFAULT_VALUE_CONTEXT);
}

/** Extract stack interaction type string from a DSL stacks config. */
function extractStackInteraction(stacks: unknown): string {
  if (!stacks || typeof stacks !== 'object') return StackInteractionType.NONE;
  return ((stacks as { interactionType?: string }).interactionType ?? StackInteractionType.NONE);
}

/** Normalize an ID to uppercase snake_case for game data. */
function toGameDataId(id: string): string {
  return id.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}

/** Build a kebab-case directory name from an ID. */
export function toDirectoryName(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ── Operator Adapters ──────────────────────────────────────────────────────

/** Convert game data OperatorBase JSON → CustomOperator for the editor. */
export function operatorToFriendly(json: GameDataJson): CustomOperator {
  const meta = (json.metadata ?? {}) as GameDataJson;
  const statsByLevel = (json.statsByLevel ?? []) as { level: number; operatorPromotionStage: number; attributes: Record<string, number> }[];

  // Extract lv1 and lv90 stats from statsByLevel
  const lv1Entry = statsByLevel.find(e => e.level === 1) ?? statsByLevel[0];
  const lv90Entry = statsByLevel.find(e => e.level === 90) ?? statsByLevel[statsByLevel.length - 1];

  // Convert potentials
  const rawPotentials = (json.potentials ?? []) as { level?: number; name?: string; description?: string; properties?: GameDataJson }[];
  const potentials: CustomPotentialEntry[] = rawPotentials.map((p, i) => {
    const props = p.properties as GameDataJson | undefined;
    const level = (props?.level ?? p.level ?? i + 1) as 1 | 2 | 3 | 4 | 5;
    return {
      level,
      type: (props?.name ?? p.name ?? '') as string,
      description: (props?.description ?? p.description ?? p.name ?? '') as string,
    };
  });

  return {
    id: (json.id ?? '') as string,
    name: (json.name ?? '') as string,
    operatorClassType: (json.operatorClassType ?? '') as OperatorClassType,
    elementType: (json.elementType ?? ElementType.PHYSICAL) as ElementType,
    weaponTypes: (json.weaponTypes ?? []) as WeaponType[],
    operatorRarity: (json.operatorRarity ?? 6) as 4 | 5 | 6,
    splashArt: json.splashArt as string | undefined,
    baseOperatorId: (meta.baseOperatorId ?? meta.originId) as string | undefined,
    mainAttributeType: (json.mainAttributeType ?? '') as StatType | string,
    secondaryAttributeType: (json.secondaryAttributeType ?? json.mainAttributeType ?? '') as StatType | string,
    baseStats: {
      lv1: lv1Entry?.attributes ? { ...lv1Entry.attributes } : {},
      lv90: lv90Entry?.attributes ? { ...lv90Entry.attributes } : {},
    },
    potentials,
    combo: {
      onTriggerClause: [] as Predicate[],
      description: '',
      windowFrames: 720,
    },
  };
}

/** Convert CustomOperator → game data OperatorBase JSON. */
export function operatorFromFriendly(op: CustomOperator): GameDataJson {
  const id = toGameDataId(op.id);

  // Build statsByLevel from lv1/lv90
  const statsByLevel = [
    { level: 1, operatorPromotionStage: 0, attributes: { ...op.baseStats.lv1 } as Record<string, number> },
    { level: 90, operatorPromotionStage: 0, attributes: { ...op.baseStats.lv90 } as Record<string, number> },
  ];

  // Convert potentials to game data format
  const potentials = op.potentials.map(p => ({
    properties: {
      level: p.level,
      name: p.type || p.description,
      ...(p.description ? { description: p.description } : {}),
    },
  }));

  return {
    id,
    name: op.name,
    operatorRarity: op.operatorRarity,
    operatorClassType: op.operatorClassType,
    elementType: op.elementType,
    weaponTypes: op.weaponTypes,
    mainAttributeType: op.mainAttributeType,
    secondaryAttributeType: op.secondaryAttributeType ?? op.mainAttributeType,
    statsByLevel,
    ...(potentials.length > 0 ? { potentials } : {}),
    talents: {},
    ...(op.splashArt ? { splashArt: op.splashArt } : {}),
    metadata: {
      originId: id,
      dataSources: ['CUSTOM'],
      ...(op.baseOperatorId ? { baseOperatorId: op.baseOperatorId } : {}),
    },
  };
}

// ── Operator Skill Adapters ────────────────────────────────────────────────

/** Convert game data OperatorSkill JSON → CustomSkill for the editor. */
export function skillToFriendly(json: GameDataJson, skillId?: string): CustomSkill {
  const props = (json.properties ?? {}) as GameDataJson;
  const meta = (json.metadata ?? {}) as GameDataJson;

  // Extract duration
  const dur = props.duration as { value?: unknown; unit?: string } | undefined;
  const durationSeconds = dur ? extractDurationSeconds(dur) : 0;

  // Extract resource interactions from clause effects
  const clauseArr = (json.clause ?? []) as { conditions?: unknown[]; effects?: GameDataJson[] }[];
  const resourceInteractions: CustomSkillResourceInteraction[] = [];
  for (const clause of clauseArr) {
    for (const ef of (clause.effects ?? [])) {
      if (ef.verb === VerbType.CONSUME || ef.verb === VerbType.RECOVER || ef.verb === VerbType.RETURN) {
        resourceInteractions.push({
          resourceType: ef.object as string,
          verb: ef.verb as string,
          value: ef.with ? resolveValueNode((ef.with as GameDataJson).value as import('../../dsl/semantics').ValueNode, DEFAULT_VALUE_CONTEXT) : 0,
          target: ef.to as string | undefined,
        });
      }
    }
  }

  // Extract segments
  const rawSegments = (json.segments ?? []) as GameDataJson[];
  const segments: CustomSkillSegmentDef[] = rawSegments.map(seg => {
    const segProps = (seg.properties ?? {}) as GameDataJson;
    const segDur = segProps.duration as { value?: unknown; unit?: string } | undefined;
    return {
      name: segProps.name as string | undefined,
      durationSeconds: segDur ? extractDurationSeconds(segDur) : 0,
    };
  });

  // Determine combat skill type from eventIdType
  const eventIdType = props.eventIdType as string | undefined;
  let combatSkillType = NounType.BASIC_ATTACK;
  if (eventIdType === NounType.BATTLE) combatSkillType = NounType.BATTLE;
  else if (eventIdType === NounType.COMBO) combatSkillType = NounType.COMBO;
  else if (eventIdType === NounType.ULTIMATE_SKILL) combatSkillType = NounType.ULTIMATE;
  else if (eventIdType === NounType.ACTION) combatSkillType = NounType.ACTION;

  return {
    id: skillId ?? (props.id as string) ?? '',
    name: (props.name ?? '') as string,
    originId: (meta.originId ?? '') as string | undefined,
    combatSkillType,
    element: props.element as ElementType | undefined,
    durationSeconds,
    cooldownSeconds: props.cooldownSeconds as number | undefined,
    description: props.description as string | undefined,
    resourceInteractions: resourceInteractions.length > 0 ? resourceInteractions : undefined,
    segments: segments.length > 0 ? segments : undefined,
  };
}

/** Convert CustomSkill → game data OperatorSkill JSON. */
export function skillFromFriendly(skill: CustomSkill, operatorId?: string): GameDataJson {
  const id = toGameDataId(skill.id || skill.name);

  // Map combat skill type to event category
  const categoryMap: Record<string, string> = {
    [NounType.BASIC_ATTACK]: NounType.BASIC_ATTACK,
    [NounType.BATTLE]: NounType.BATTLE,
    [NounType.COMBO]: NounType.COMBO,
    [NounType.ULTIMATE]: NounType.ULTIMATE_SKILL,
  };

  // Build clause from resource interactions
  const effects: GameDataJson[] = (skill.resourceInteractions ?? []).map(r => ({
    toDeterminer: DeterminerType.THIS,
    to: NounType.OPERATOR,
    verb: r.verb,
    object: r.resourceType,
    with: { value: isNode(r.value) },
  }));

  // Build segments
  const segments = (skill.segments ?? []).map(seg => ({
    metadata: { eventComponentType: 'SEGMENT' },
    properties: {
      ...(seg.name ? { name: seg.name } : {}),
      duration: dslDuration(seg.durationSeconds),
    },
    frames: [],
  }));

  return {
    ...(segments.length > 0 ? { segments } : {}),
    ...(effects.length > 0 ? { clause: [{ conditions: [], effects }] } : {}),
    properties: {
      id,
      name: skill.name,
      ...(skill.description ? { description: skill.description } : {}),
      ...(skill.durationSeconds ? { duration: dslDuration(skill.durationSeconds) } : {}),
      ...(skill.element ? { element: skill.element } : {}),
      eventType: EventType.SKILL,
      eventIdType: categoryMap[skill.combatSkillType] ?? NounType.BASIC_ATTACK,
    },
    metadata: {
      originId: operatorId ?? skill.originId ?? '',
      dataSources: ['CUSTOM'],
    },
  };
}

// ── Operator Status Adapters ───────────────────────────────────────────────

/** Convert game data OperatorStatus JSON → CustomOperatorStatus for the editor. */
export function operatorStatusToFriendly(json: GameDataJson, wrapId?: string): CustomOperatorStatus {
  const props = (json.properties ?? {}) as GameDataJson;
  const meta = (json.metadata ?? {}) as GameDataJson;

  const statusEvent = statusJsonToCustomDef(json);

  return {
    id: wrapId ?? (props.id as string) ?? '',
    name: (props.name ?? '') as string,
    operatorId: (meta.originId ?? '') as string | undefined,
    statusEvent,
  };
}

/** Convert CustomOperatorStatus → game data OperatorStatus JSON. */
export function operatorStatusFromFriendly(status: CustomOperatorStatus, operatorId?: string): GameDataJson {
  return customDefToStatusJson(status.statusEvent, operatorId ?? status.operatorId ?? '', NounType.SKILL_STATUS);
}

// ── Operator Talent Adapters ───────────────────────────────────────────────

/** Convert game data talent JSONs → CustomOperatorTalent for the editor. */
export function operatorTalentToFriendly(talentStatuses: GameDataJson[], talentId: string, talentName: string, slot: number, maxLevel: number, operatorId?: string): CustomOperatorTalent {
  return {
    id: talentId,
    name: talentName,
    operatorId,
    slot,
    maxLevel,
    statusEvents: talentStatuses.map(s => statusJsonToCustomDef(s)),
  };
}

/** Convert CustomOperatorTalent → game data OperatorStatus JSONs. */
export function operatorTalentFromFriendly(talent: CustomOperatorTalent): GameDataJson[] {
  return talent.statusEvents.map(se =>
    customDefToStatusJson(se, talent.operatorId ?? '', NounType.TALENT),
  );
}

// ── Weapon Adapters ────────────────────────────────────────────────────────

/** Convert game data Weapon JSON → CustomWeapon for the editor. */
export function weaponToFriendly(json: GameDataJson, weaponSkills?: GameDataJson[], weaponStatuses?: GameDataJson[]): CustomWeapon {
  const props = (json.properties ?? {}) as GameDataJson;
  const meta = (json.metadata ?? {}) as GameDataJson;
  const clause = (json.clause ?? []) as { conditions?: unknown[]; effects?: GameDataJson[] }[];

  // Extract base attack from clause
  let lv1 = 0;
  let lv90 = 0;
  for (const c of clause) {
    for (const ef of (c.effects ?? [])) {
      if (ef.verb === VerbType.APPLY && (ef.objectId === 'BASE_ATTACK' || ef.object === 'STAT')) {
        const wv = (ef.with as GameDataJson)?.value as { value?: number | number[]; verb?: string };
        if (wv?.value != null) {
          const vals = Array.isArray(wv.value) ? wv.value : [wv.value];
          lv1 = vals[0] ?? 0;
          lv90 = vals[vals.length - 1] ?? lv1;
        }
      }
    }
  }

  // Build skill defs from weapon skills and statuses
  const skills: CustomWeaponSkillDef[] = [];
  const skillIds = (json.skills ?? []) as string[];

  // Generic skills (stat boosts) — first 2 slots
  for (const skillId of skillIds.slice(0, 2)) {
    if (!skillId) continue;
    const skillJson = weaponSkills?.find(s => {
      const sp = (s.properties ?? {}) as GameDataJson;
      return sp.id === skillId;
    });
    skills.push({
      type: 'STAT_BOOST',
      label: skillId.replace(/_/g, ' '),
      statBoost: {
        stat: skillId,
        values: skillJson ? extractWeaponSkillValues(skillJson) : [],
      },
    });
  }

  // Named skill (slot 3) — convert from weapon statuses
  if (weaponStatuses && weaponStatuses.length > 0) {
    for (const statusJson of weaponStatuses) {
      const statusProps = (statusJson.properties ?? {}) as GameDataJson;
      const statusClause = (statusJson.clause ?? []) as { conditions?: unknown[]; effects?: GameDataJson[] }[];

      const buffs = statusClause.flatMap(c => (c.effects ?? []))
        .filter(e => e.verb === VerbType.APPLY && (e.with as GameDataJson)?.value)
        .map(e => {
          const wv = (e.with as GameDataJson).value as GameDataJson;
          const perStack = wv.verb === VerbType.VARY_BY && wv.object === NounType.STATUS_LEVEL;
          return {
            stat: (e.objectId ?? e.object) as string,
            valueMin: (wv.valueMin as number) ?? (wv.value as number) ?? 0,
            valueMax: (wv.valueMax as number) ?? (wv.value as number) ?? 0,
            perStack,
          };
        });

      skills.push({
        type: 'NAMED',
        label: (statusProps.name ?? statusProps.id ?? '') as string,
        namedEffect: {
          name: (statusProps.name ?? statusProps.id ?? '') as string,
          triggers: extractTriggerInteractions(statusJson),
          target: resolveTargetString(statusJson),
          durationSeconds: extractDurationSeconds(statusProps.duration),
          maxStacks: extractMaxStacks(statusProps.stacks),
          cooldownSeconds: statusProps.cooldownSeconds as number | undefined,
          buffs,
        },
      });
    }
  }

  return {
    id: (props.id ?? '') as string,
    name: (props.name ?? '') as string,
    weaponType: (props.type ?? '') as WeaponType,
    weaponRarity: (props.rarity ?? 6) as 3 | 4 | 5 | 6,
    icon: (meta.icon ?? '') as string | undefined,
    baseAtk: { lv1, lv90 },
    skills,
  };
}

/** Convert CustomWeapon → game data Weapon JSON. */
export function weaponFromFriendly(weapon: CustomWeapon): GameDataJson {
  const id = toGameDataId(weapon.id);

  // Build base attack clause with 90-level interpolation
  const baseAtkValues = interpolateWeaponLevels(weapon.baseAtk.lv1, weapon.baseAtk.lv90, 90);

  // Collect generic skill IDs
  const skillIds = weapon.skills
    .filter(s => s.type === 'STAT_BOOST' && s.statBoost)
    .map(s => s.statBoost!.stat);

  // Named skill ID placeholder
  const namedSkills = weapon.skills.filter(s => s.type === 'NAMED' && s.namedEffect);
  if (namedSkills.length > 0) {
    skillIds.push(`${id}_NAMED`);
  }

  return {
    skills: skillIds,
    properties: {
      id,
      name: weapon.name,
      type: weapon.weaponType,
      rarity: weapon.weaponRarity,
    },
    metadata: {
      originId: id,
      dataSources: ['CUSTOM'],
      ...(weapon.icon ? { icon: weapon.icon } : {}),
    },
    clause: [{
      conditions: [],
      effects: [{
        verb: VerbType.APPLY,
        object: NounType.STAT,
        objectId: 'BASE_ATTACK',
        toDeterminer: DeterminerType.THIS,
        to: NounType.OPERATOR,
        with: { value: { verb: VerbType.VARY_BY, object: 'WEAPON_LEVEL', value: baseAtkValues } },
      }],
    }],
  };
}

/** Convert a CustomWeapon's named effects → game data WeaponStatus JSONs. */
export function weaponNamedEffectsToStatuses(weapon: CustomWeapon): GameDataJson[] {
  const originId = toGameDataId(weapon.id);
  const statuses: GameDataJson[] = [];

  for (const skill of weapon.skills) {
    if (skill.type !== 'NAMED' || !skill.namedEffect) continue;
    const ne = skill.namedEffect;
    if (ne.triggers.length === 0) continue;

    const statusId = `${originId}_${toGameDataId(ne.name)}`;

    statuses.push({
      clause: [{
        conditions: [],
        effects: ne.buffs.map(b => ({
          verb: VerbType.APPLY,
          object: NounType.STAT,
          objectId: b.stat,
          toDeterminer: DeterminerType.THIS,
          to: NounType.OPERATOR,
          with: {
            value: b.perStack
              ? { verb: VerbType.VARY_BY, object: NounType.STATUS_LEVEL, valueMin: b.valueMin, valueMax: b.valueMax }
              : isNode(b.valueMax || b.valueMin),
          },
        })),
      }],
      properties: {
        id: statusId,
        name: ne.name,
        to: resolveTargetNoun(ne.target),
        ...(resolveTargetDeterminer(ne.target) ? { toDeterminer: resolveTargetDeterminer(ne.target) } : {}),
        duration: dslDuration(ne.durationSeconds),
        stacks: {
          limit: isNode(ne.maxStacks),
          interactionType: ne.maxStacks > 1 ? StackInteractionType.NONE : StackInteractionType.RESET,
        },
        eventType: EventType.STATUS,
        eventIdType: NounType.WEAPON_STATUS,
        ...(ne.cooldownSeconds ? { cooldownSeconds: ne.cooldownSeconds } : {}),
      },
      onTriggerClause: ne.triggers.map(t => ({ conditions: [t] })),
      metadata: {
        originId,
        dataSources: ['CUSTOM'],
      },
    });
  }

  return statuses;
}

// ── Weapon Effect Adapters ─────────────────────────────────────────────────

/** Convert game data WeaponStatus JSONs → CustomWeaponEffect for the editor. */
export function weaponEffectToFriendly(statuses: GameDataJson[], effectId: string, effectName: string, weaponId?: string): CustomWeaponEffect {
  return {
    id: effectId,
    name: effectName,
    weaponId,
    statusEvents: statuses.map(s => statusJsonToCustomDef(s)),
  };
}

/** Convert CustomWeaponEffect → game data WeaponStatus JSONs. */
export function weaponEffectFromFriendly(effect: CustomWeaponEffect): GameDataJson[] {
  return effect.statusEvents.map(se =>
    customDefToStatusJson(se, effect.weaponId ?? effect.id, NounType.WEAPON_STATUS),
  );
}

// ── Gear Set Adapters ──────────────────────────────────────────────────────

/** Convert game data GearSetEffect + GearPiece JSONs → CustomGearSet for the editor. */
export function gearSetToFriendly(
  setEffectJson: GameDataJson | undefined,
  pieceJsons: GameDataJson[],
  gearStatuses: GameDataJson[],
  gearSetId: string,
): CustomGearSet {
  const setProps = setEffectJson ? (setEffectJson.properties ?? {}) as GameDataJson : {};

  // Convert pieces
  const pieces: CustomGearPiece[] = pieceJsons.map(pj => {
    const pProps = (pj.properties ?? {}) as GameDataJson;
    const clause = (pj.clause ?? []) as { conditions?: unknown[]; effects?: GameDataJson[] }[];

    // Extract defense and stats by rank from clause
    let defense = 0;
    const statsByRank: Record<number, Partial<Record<StatType | string, number>>> = { 1: {}, 2: {}, 3: {}, 4: {} };

    for (const c of clause) {
      for (const ef of (c.effects ?? [])) {
        const statKey = (ef.objectId ?? ef.object) as string;
        const wv = (ef.with as GameDataJson)?.value as { value?: number | number[]; verb?: string } | undefined;
        if (!wv?.value) continue;

        const values = Array.isArray(wv.value) ? wv.value : [wv.value];
        if (statKey === 'BASE_DEFENSE') {
          defense = values[0] ?? 0;
        } else {
          for (let rank = 1; rank <= 4; rank++) {
            const val = values.length === 1 ? values[0] : (values[rank - 1] ?? 0);
            if (val !== 0) statsByRank[rank][statKey] = val;
          }
        }
      }
    }

    return {
      name: (pProps.name ?? '') as string,
      gearCategory: (pProps.gearType ?? GearCategory.ARMOR) as GearCategory,
      defense,
      statsByRank,
    };
  });

  // Convert set effect from gear statuses
  let setEffect: CustomGearSetEffect | undefined;
  if (gearStatuses.length > 0 || setEffectJson) {
    const effects: CustomGearEffectDef[] = gearStatuses.map(gs => {
      const gsProps = (gs.properties ?? {}) as GameDataJson;
      const gsClause = (gs.clause ?? []) as { conditions?: unknown[]; effects?: GameDataJson[] }[];

      return {
        label: (gsProps.name ?? gsProps.id ?? '') as string,
        triggers: extractTriggerInteractions(gs),
        target: resolveTargetString(gs),
        durationSeconds: extractDurationSeconds(gsProps.duration),
        maxStacks: extractMaxStacks(gsProps.stacks),
        cooldownSeconds: gsProps.cooldownSeconds as number | undefined,
        buffs: gsClause.flatMap(c => (c.effects ?? []))
          .filter(e => e.verb === VerbType.APPLY && (e.with as GameDataJson)?.value)
          .map(e => {
            const wv = (e.with as GameDataJson).value as GameDataJson;
            const perStack = wv.verb === VerbType.VARY_BY && wv.object === NounType.STATUS_LEVEL;
            return {
              stat: (e.objectId ?? e.object) as string,
              value: (wv.value as number) ?? (wv.valueMin as number) ?? 0,
              perStack,
            };
          }),
      };
    });

    setEffect = {
      effects: effects.length > 0 ? effects : undefined,
    };
  }

  return {
    id: gearSetId,
    setName: (setProps.name ?? gearSetId) as string,
    rarity: ((setProps.rarity ?? 5) as 4 | 5 | 6) || 5,
    pieces,
    setEffect,
  };
}

/** Convert CustomGearSet → game data GearPiece JSONs. */
export function gearPiecesFromFriendly(gearSet: CustomGearSet): GameDataJson[] {
  const gearSetId = toGameDataId(gearSet.id);

  return gearSet.pieces.map(piece => {
    const effects: GameDataJson[] = [];

    // Defense effect
    if (piece.defense > 0) {
      effects.push({
        verb: VerbType.APPLY,
        object: NounType.STAT,
        objectId: 'BASE_DEFENSE',
        with: { value: isNode(piece.defense) },
      });
    }

    // Stat effects from ranks
    const allStats = new Set<string>();
    for (const rank of Object.values(piece.statsByRank)) {
      for (const key of Object.keys(rank)) allStats.add(key);
    }

    for (const statKey of Array.from(allStats)) {
      const values = [1, 2, 3, 4].map(r => (piece.statsByRank[r] ?? {})[statKey] ?? 0);
      effects.push({
        verb: VerbType.APPLY,
        object: NounType.STAT,
        objectId: statKey,
        with: { value: { verb: VerbType.VARY_BY, object: 'SKILL_LEVEL', value: values } },
      });
    }

    return {
      clause: effects.length > 0 ? [{ conditions: [], effects }] : [],
      properties: {
        id: `${gearSetId}_${piece.gearCategory}`,
        name: piece.name,
        gearType: piece.gearCategory,
        gearSet: gearSetId,
      },
    };
  });
}

/** Convert CustomGearSet → game data GearSetEffect JSON (if set has effects). */
export function gearSetEffectFromFriendly(gearSet: CustomGearSet): GameDataJson | null {
  if (!gearSet.setEffect) return null;

  const gearSetId = toGameDataId(gearSet.id);

  // Build trigger clause from effects
  const triggerEffects = (gearSet.setEffect.effects ?? []).map(ef => ({
    verb: VerbType.APPLY,
    object: NounType.STATUS,
    objectId: `${gearSetId}_${toGameDataId(ef.label)}`,
  }));

  return {
    ...(triggerEffects.length > 0 ? {
      onTriggerClause: (gearSet.setEffect.effects ?? []).flatMap(ef =>
        ef.triggers.map(t => ({
          conditions: [t],
          effects: [{
            verb: VerbType.APPLY,
            object: NounType.STATUS,
            objectId: `${gearSetId}_${toGameDataId(ef.label)}`,
          }],
        })),
      ),
    } : {}),
    properties: {
      id: gearSetId,
      name: gearSet.setName,
      rarity: gearSet.rarity,
      eventType: EventType.STATUS,
      eventIdType: NounType.GEAR_SET_EFFECT,
    },
    metadata: {
      originId: gearSetId,
      dataSources: ['CUSTOM'],
    },
  };
}

/** Convert CustomGearSet effects → game data GearStatus JSONs. */
export function gearSetStatusesFromFriendly(gearSet: CustomGearSet): GameDataJson[] {
  if (!gearSet.setEffect?.effects) return [];
  const gearSetId = toGameDataId(gearSet.id);

  return gearSet.setEffect.effects.map(ef => {
    const statusId = `${gearSetId}_${toGameDataId(ef.label)}`;

    return {
      clause: [{
        conditions: [],
        effects: ef.buffs.map(b => ({
          verb: VerbType.APPLY,
          object: NounType.STAT,
          objectId: b.stat,
          with: {
            value: b.perStack
              ? { verb: VerbType.VARY_BY, object: NounType.STATUS_LEVEL, value: b.value }
              : isNode(b.value),
          },
        })),
      }],
      properties: {
        id: statusId,
        name: ef.label,
        duration: dslDuration(ef.durationSeconds),
        stacks: {
          limit: isNode(ef.maxStacks),
          interactionType: ef.maxStacks > 1 ? StackInteractionType.NONE : StackInteractionType.RESET,
        },
        ...(ef.cooldownSeconds ? { cooldownSeconds: ef.cooldownSeconds } : {}),
        eventType: EventType.STATUS,
        eventIdType: NounType.GEAR_SET_STATUS,
      },
      metadata: {
        originId: gearSetId,
        dataSources: ['CUSTOM'],
      },
    };
  });
}

// ── Gear Effect Adapters ───────────────────────────────────────────────────

/** Convert game data GearStatus JSONs → CustomGearEffect for the editor. */
export function gearEffectToFriendly(statuses: GameDataJson[], effectId: string, effectName: string, gearSetId?: string): CustomGearEffect {
  return {
    id: effectId,
    name: effectName,
    gearSetId,
    statusEvents: statuses.map(s => statusJsonToCustomDef(s)),
  };
}

/** Convert CustomGearEffect → game data GearStatus JSONs. */
export function gearEffectFromFriendly(effect: CustomGearEffect): GameDataJson[] {
  return effect.statusEvents.map(se =>
    customDefToStatusJson(se, effect.gearSetId ?? effect.id, NounType.GEAR_SET_STATUS),
  );
}

// ── Shared Status ↔ CustomStatusEventDef Conversion ────────────────────────

/** Convert a game data status JSON → CustomStatusEventDef. */
function statusJsonToCustomDef(json: GameDataJson): CustomStatusEventDef {
  const props = (json.properties ?? {}) as GameDataJson;
  const clause = (json.clause ?? []) as Clause;
  const onTriggerClause = (json.onTriggerClause ?? []) as Clause;

  // Extract duration values
  const dur = props.duration as { value?: unknown; unit?: string } | undefined;
  const durationSeconds = dur ? extractDurationSeconds(dur) : 0;
  const durationUnit = (dur?.unit ?? UnitType.SECOND) as string;

  // Extract stacks
  const maxStacks = extractMaxStacks(props.stacks);
  const stackInteraction = extractStackInteraction(props.stacks);

  // Extract stat effects from clause
  const stats: { statType: StatType | string; value: number[] }[] = [];
  for (const pred of (clause as unknown as { conditions?: unknown[]; effects?: GameDataJson[] }[])) {
    for (const ef of (pred.effects ?? [])) {
      if (ef.verb === VerbType.APPLY) {
        const wv = (ef.with as GameDataJson)?.value as { value?: number | number[] } | undefined;
        if (wv?.value != null) {
          const values = Array.isArray(wv.value) ? wv.value : [wv.value];
          stats.push({ statType: (ef.objectId ?? ef.object) as string, value: values });
        }
      }
    }
  }

  // Extract segments
  const rawSegments = (json.segments ?? []) as GameDataJson[];
  const segments: CustomSegmentDef[] = rawSegments.map(seg => {
    const segProps = (seg.properties ?? {}) as GameDataJson;
    const segDur = segProps.duration as { value?: unknown; unit?: string } | undefined;
    return {
      name: segProps.name as string | undefined,
      durationSeconds: segDur ? extractDurationSeconds(segDur) : 0,
    };
  });

  return {
    name: (props.id ?? props.name ?? '') as string,
    target: resolveTargetString(json),
    element: (props.element ?? ElementType.PHYSICAL) as ElementType,
    isNamedEvent: !!props.name,
    durationValues: [durationSeconds],
    durationUnit,
    stack: {
      interactionType: stackInteraction,
      max: maxStacks,
      instances: maxStacks,
    },
    clause,
    onTriggerClause,
    stats,
    segments: segments.length > 0 ? segments : undefined,
  };
}

/** Convert a CustomStatusEventDef → game data status JSON. */
function customDefToStatusJson(def: CustomStatusEventDef, originId: string, eventIdType: string): GameDataJson {
  const statusId = toGameDataId(def.name);

  // Build clause from stats
  const effects: GameDataJson[] = def.stats.map(s => ({
    verb: VerbType.APPLY,
    object: NounType.STAT,
    objectId: s.statType,
    with: {
      value: s.value.length > 1
        ? { verb: VerbType.VARY_BY, object: 'TALENT_LEVEL', value: s.value }
        : isNode(s.value[0] ?? 0),
    },
  }));

  // Use provided clause if present, otherwise build from stats
  const clause = def.clause && (def.clause as unknown[]).length > 0
    ? def.clause
    : (effects.length > 0 ? [{ conditions: [], effects }] : []);

  const maxStacks = Array.isArray(def.stack.max) ? Math.max(...def.stack.max) : def.stack.max;

  return {
    ...(clause && (clause as unknown[]).length > 0 ? { clause } : {}),
    ...(def.onTriggerClause && (def.onTriggerClause as unknown[]).length > 0 ? { onTriggerClause: def.onTriggerClause } : {}),
    ...(def.segments && def.segments.length > 0 ? {
      segments: def.segments.map(seg => ({
        properties: {
          ...(seg.name ? { name: seg.name } : {}),
          duration: dslDuration(seg.durationSeconds),
        },
      })),
    } : {}),
    properties: {
      id: statusId,
      name: def.name,
      to: resolveTargetNoun(def.target) ?? NounType.OPERATOR,
      ...(resolveTargetDeterminer(def.target) ? { toDeterminer: resolveTargetDeterminer(def.target) } : {}),
      ...(def.element ? { element: def.element } : {}),
      duration: dslDuration(def.durationValues[0] ?? 0),
      stacks: {
        limit: isNode(maxStacks),
        interactionType: def.stack.interactionType ?? StackInteractionType.NONE,
      },
      eventType: EventType.STATUS,
      eventIdType,
    },
    metadata: {
      originId,
      dataSources: ['CUSTOM'],
    },
  };
}

// ── Internal Helpers ───────────────────────────────────────────────────────

/** Extract trigger interactions from a status JSON's onTriggerClause. */
function extractTriggerInteractions(json: GameDataJson): Interaction[] {
  const clauses = (json.onTriggerClause ?? []) as { conditions?: Interaction[] }[];
  return clauses.flatMap(c => c.conditions ?? []);
}

/** Resolve a target display string from a status JSON (self/team/enemy). */
function resolveTargetString(json: GameDataJson): string {
  const props = (json.properties ?? {}) as GameDataJson;
  const to = (props.to ?? props.target ?? NounType.OPERATOR) as string;
  const toDeterminer = (props.toDeterminer ?? props.targetDeterminer) as string | undefined;

  if (to === NounType.ENEMY || to === 'ENEMY') return 'enemy';
  if (toDeterminer === DeterminerType.ALL || toDeterminer === 'ALL' || toDeterminer === 'OTHER') return 'team';
  return 'self';
}

/** Map friendly target string → DSL noun. */
function resolveTargetNoun(target: string): string {
  const map: Record<string, string> = { self: NounType.OPERATOR, team: NounType.OPERATOR, enemy: NounType.ENEMY };
  // Also handle already-DSL values passthrough
  if (target === NounType.OPERATOR || target === NounType.ENEMY || target === NounType.TEAM) return target;
  return map[target] ?? NounType.OPERATOR;
}

/** Map friendly target string → DSL determiner. */
function resolveTargetDeterminer(target: string): string | undefined {
  const map: Record<string, string> = { self: DeterminerType.THIS, team: DeterminerType.ALL };
  if (target === DeterminerType.THIS || target === DeterminerType.ALL) return target;
  return map[target];
}

/** Extract values array from a weapon skill JSON. */
function extractWeaponSkillValues(json: GameDataJson): number[] {
  const clause = (json.clause ?? []) as { effects?: GameDataJson[] }[];
  for (const c of clause) {
    for (const ef of (c.effects ?? [])) {
      const wv = (ef.with as GameDataJson)?.value as { value?: number | number[] } | undefined;
      if (wv?.value != null) {
        return Array.isArray(wv.value) ? wv.value : [wv.value];
      }
    }
  }
  return [];
}

/** Linearly interpolate weapon base attack values across N levels. */
function interpolateWeaponLevels(lv1: number, lvMax: number, levels: number): number[] {
  if (levels <= 1) return [lv1];
  const values: number[] = [];
  for (let i = 0; i < levels; i++) {
    const t = i / (levels - 1);
    values.push(Math.round(lv1 + (lvMax - lv1) * t));
  }
  return values;
}
