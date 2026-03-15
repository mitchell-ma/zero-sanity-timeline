/**
 * Manages bidirectional links between operators and custom skills.
 *
 * Two sources of truth kept in sync:
 *   1. Link table (localStorage) — flat array of { operatorId, skillCategory, customSkillId }
 *   2. CustomSkill.associationIds — list of operator IDs on each skill object
 *
 * Every mutation (add/remove) updates BOTH sides so neither can leak.
 */
import type { SkillType } from '../../consts/viewTypes';
import { getCustomSkills, updateSkillAssociations } from './customSkillController';

const STORAGE_KEY = 'zst_custom_skill_links';

interface SkillLink {
  operatorId: string;
  skillCategory: SkillType;
  customSkillId: string;
}

function loadLinks(): SkillLink[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLinks(links: SkillLink[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
}

// ── Queries ──────────────────────────────────────────────────────────────────

/** Get all custom skill IDs linked to a specific operator + skill category. Filters stale refs. */
export function getLinksForSlot(operatorId: string, skillCategory: SkillType): string[] {
  const links = loadLinks();
  const validIds = new Set(getCustomSkills().map((s) => s.id));
  return links
    .filter((l) => l.operatorId === operatorId && l.skillCategory === skillCategory && validIds.has(l.customSkillId))
    .map((l) => l.customSkillId);
}

/** Get all links for a given operator (all categories). */
export function getLinksForOperator(operatorId: string): { skillCategory: SkillType; customSkillId: string }[] {
  const links = loadLinks();
  const validIds = new Set(getCustomSkills().map((s) => s.id));
  return links
    .filter((l) => l.operatorId === operatorId && validIds.has(l.customSkillId))
    .map((l) => ({ skillCategory: l.skillCategory, customSkillId: l.customSkillId }));
}

// ── Mutations (bidirectional) ────────────────────────────────────────────────

/** Link a custom skill to an operator's skill category. Updates both link table and skill.associationIds. */
export function addSkillLink(operatorId: string, skillCategory: SkillType, customSkillId: string): void {
  // Link table
  const links = loadLinks();
  const exists = links.some(
    (l) => l.operatorId === operatorId && l.skillCategory === skillCategory && l.customSkillId === customSkillId,
  );
  if (!exists) {
    links.push({ operatorId, skillCategory, customSkillId });
    saveLinks(links);
  }
  // Skill side — add operator to associationIds
  updateSkillAssociations(customSkillId, (ids) =>
    ids.includes(operatorId) ? ids : [...ids, operatorId],
  );
}

/** Remove a specific link. Updates both link table and skill.associationIds. */
export function removeSkillLink(operatorId: string, skillCategory: SkillType, customSkillId: string): void {
  // Link table
  const links = loadLinks().filter(
    (l) => !(l.operatorId === operatorId && l.skillCategory === skillCategory && l.customSkillId === customSkillId),
  );
  saveLinks(links);
  // Skill side — remove operator if no remaining links from this operator to this skill
  const stillLinked = links.some((l) => l.operatorId === operatorId && l.customSkillId === customSkillId);
  if (!stillLinked) {
    updateSkillAssociations(customSkillId, (ids) => ids.filter((id) => id !== operatorId));
  }
}

/** Remove ALL links referencing a skill. Clears the skill's associationIds. Called on skill deletion. */
export function removeAllLinksForSkill(customSkillId: string): void {
  const links = loadLinks().filter((l) => l.customSkillId !== customSkillId);
  saveLinks(links);
  updateSkillAssociations(customSkillId, () => []);
}

/** Remove ALL links referencing an operator. Updates every affected skill's associationIds. Called on operator deletion. */
export function removeAllLinksForOperator(operatorId: string): void {
  const links = loadLinks();
  // Collect affected skill IDs before filtering
  const affectedSkillIds = new Set(
    links.filter((l) => l.operatorId === operatorId).map((l) => l.customSkillId),
  );
  // Remove from link table
  const remaining = links.filter((l) => l.operatorId !== operatorId);
  saveLinks(remaining);
  // Remove operator from each affected skill's associationIds
  affectedSkillIds.forEach((skillId) => {
    updateSkillAssociations(skillId, (ids) => ids.filter((id) => id !== operatorId));
  });
}
