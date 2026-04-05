/**
 * Shared skill type map builder.
 *
 * Reads eventIdType/eventQualifierType from skill properties to build a
 * hierarchical map preserving the column→sub-type relationship:
 *
 *   { BASIC_ATTACK: { BATK: [id, ...], FINISHER: [id], DIVE: [id] },
 *     BATTLE: [id, ...], COMBO: [id, ...], ULTIMATE: [id, ...] }
 *
 * Skills with eventQualifierType (BASIC_ATTACK sub-types) are nested under
 * their eventIdType. Skills without a qualifier are stored as flat arrays.
 */

/** Minimal skill shape needed for type map building. */
interface SkillLike {
  eventIdType?: string;
  eventQualifierType?: string;
}

/** Skill type map: column → array of skill IDs, or column → { sub-type → array of skill IDs }. */
export type SkillTypeMap = Record<string, string[] | Record<string, string[]>>;

/**
 * Build skill type map from a keyed collection of skills.
 * Accepts either a Map (OperatorSkill store) or a Record (raw JSON).
 */
export function buildSkillTypeMap(skills: ReadonlyMap<string, SkillLike> | Record<string, { properties?: SkillLike }>): SkillTypeMap {
  const typeMap: SkillTypeMap = {};

  const entries: [string, SkillLike][] = skills instanceof Map
    ? Array.from(skills.entries())
    : Object.entries(skills).map(([id, s]) => [id, s.properties ?? s] as [string, SkillLike]);

  for (const [id, skill] of entries) {
    const idType = skill.eventIdType;
    if (!idType) continue;

    if (skill.eventQualifierType) {
      // Nested: BASIC_ATTACK → { BATK: [...], FINISHER: [...] }
      if (!typeMap[idType] || Array.isArray(typeMap[idType])) {
        typeMap[idType] = {};
      }
      const subMap = typeMap[idType] as Record<string, string[]>;
      const qKey = skill.eventQualifierType;
      if (!subMap[qKey]) subMap[qKey] = [];
      subMap[qKey].push(id);
    } else {
      // Flat: BATTLE → [...]
      if (!typeMap[idType]) typeMap[idType] = [];
      (typeMap[idType] as string[]).push(id);
    }
  }

  // Sort: base variants first (no _ENHANCED/_EMPOWERED suffix), then enhanced, then empowered
  const enhancementRank = (id: string) =>
    id.includes('_ENHANCED_EMPOWERED') ? 3 : id.includes('_EMPOWERED') ? 2 : id.includes('_ENHANCED') ? 1 : 0;
  for (const value of Object.values(typeMap)) {
    if (Array.isArray(value)) {
      value.sort((a, b) => enhancementRank(a) - enhancementRank(b));
    } else {
      for (const subIds of Object.values(value)) {
        subIds.sort((a, b) => enhancementRank(a) - enhancementRank(b));
      }
    }
  }

  return typeMap;
}
