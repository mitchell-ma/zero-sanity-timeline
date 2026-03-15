// Centralized weapon game data — auto-discovers all weapon JSONs and provides
// lookup functions for skill level data and base attack tables.

// Auto-discover all weapon JSON files
const weaponContext = (require as any).context('./weapons', false, /\.json$/);
const ALL_WEAPONS: any[] = weaponContext.keys().map((key: string) => weaponContext(key));

// Skill index: weaponSkillType → allLevels array
const skillIndex = new Map<string, any[]>();
for (const w of ALL_WEAPONS) {
  for (const s of w.skills) {
    if (!skillIndex.has(s.weaponSkillType)) {
      skillIndex.set(s.weaponSkillType, s.allLevels);
    }
  }
}

// Attack index: weapon display name → level→baseAttack map
const attackIndex = new Map<string, Record<number, number>>();
for (const w of ALL_WEAPONS) {
  const map: Record<number, number> = {};
  for (const e of w.allLevels) map[e.level] = e.baseAttack;
  attackIndex.set(w.name, map);
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Get skill level values for a given stat key. Returns empty array if skill type not found. */
export function getSkillValues(skillType: string, statKey: string): number[] {
  const levels = skillIndex.get(skillType);
  if (!levels) return [];
  return levels.map((e: any) => e[statKey] as number);
}

/** Get conditional stat values from a skill's conditionalStats entries. */
export function getConditionalValues(skillType: string, statKey: string, condIndex = 0): number[] {
  const levels = skillIndex.get(skillType);
  if (!levels) return [];
  return levels.map((e: any) => e.conditionalStats?.[condIndex]?.[statKey] as number);
}

/** Get a scalar value from the first level's conditionalStats (e.g. duration, maxStacks). */
export function getConditionalScalar(skillType: string, key: string, condIndex = 0): any {
  const levels = skillIndex.get(skillType);
  if (!levels || levels.length === 0) return undefined;
  return levels[0].conditionalStats?.[condIndex]?.[key];
}

/** Get the full level→baseAttack lookup map for a weapon by display name. */
export function getAttackByLevel(weaponName: string): Record<number, number> {
  return attackIndex.get(weaponName) ?? {};
}
