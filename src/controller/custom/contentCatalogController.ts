/**
 * Aggregates all game content into a flat list for the Content Browser sidebar.
 */
import { ContentCategory, ContentBrowserItem } from '../../consts/contentBrowserTypes';
import { ALL_OPERATORS } from '../operators/operatorRegistry';
import { WEAPONS, GEARS } from '../../utils/loadoutRegistry';
import { WEAPON_SKILL_EFFECTS } from '../../consts/weaponSkillEffects';
import { GEAR_SET_EFFECTS } from '../../consts/gearSetEffects';
import { COMBAT_SKILL_LABELS } from '../../consts/timelineColumnLabels';
import { CombatSkillsType } from '../../consts/enums';
import { getCustomWeapons } from './customWeaponController';
import { getCustomGearSets } from './customGearController';
import { getCustomOperators } from './customOperatorController';
import { getCustomSkills } from './customSkillController';
import type { SkillType } from '../../consts/viewTypes';

function starStr(rarity: number): string {
  return `${rarity}\u2605`;
}

export function getAllContentItems(): ContentBrowserItem[] {
  const items: ContentBrowserItem[] = [];

  // ── Operators ───────────────────────────────────────────────────────────
  const customOpIds = new Set(getCustomOperators().map((o) => `custom_${o.id}`));
  for (const op of ALL_OPERATORS) {
    // Skip custom operators — they're listed separately below
    if (customOpIds.has(op.id)) continue;
    items.push({
      id: op.id,
      name: op.name,
      category: ContentCategory.OPERATORS,
      source: 'builtin',
      meta: `${starStr(op.rarity)} ${op.role} \u00B7 ${op.element}`,
      color: op.color,
    });
  }
  for (const op of getCustomOperators()) {
    items.push({
      id: op.id,
      name: op.name,
      category: ContentCategory.OPERATORS,
      source: 'custom',
      meta: `${starStr(op.operatorRarity)} ${op.operatorClassType} \u00B7 ${op.elementType}`,
    });
  }

  // ── Skills (per-operator, grouped by skill type) ───────────────────────
  const SKILL_TYPE_LABELS: Record<SkillType, string> = {
    basic: 'Basic',
    battle: 'Battle',
    combo: 'Combo',
    ultimate: 'Ultimate',
  };
  for (const op of ALL_OPERATORS) {
    if (customOpIds.has(op.id)) continue;
    for (const [key, skill] of Object.entries(op.skills)) {
      const skillName = skill.name as CombatSkillsType;
      const label = COMBAT_SKILL_LABELS[skillName] || skill.name;
      items.push({
        id: `skill:${op.id}:${key}`,
        name: label,
        category: ContentCategory.SKILLS,
        source: 'builtin',
        meta: `${op.name} \u00B7 ${SKILL_TYPE_LABELS[key as SkillType] ?? key}`,
        color: op.color,
      });
    }
  }

  for (const cs of getCustomSkills()) {
    items.push({
      id: `skill:custom:${cs.id}`,
      name: cs.name,
      category: ContentCategory.SKILLS,
      source: 'custom',
      meta: `Custom \u00B7 ${cs.combatSkillType.replace(/_/g, ' ')}`,
    });
  }

  // ── Talents (per-operator, 2 per operator + attribute increase) ────────
  for (const op of ALL_OPERATORS) {
    if (customOpIds.has(op.id)) continue;
    if (op.talentOneName) {
      items.push({
        id: `talent:${op.id}:1`,
        name: op.talentOneName,
        category: ContentCategory.TALENTS,
        source: 'builtin',
        meta: `${op.name} \u00B7 Talent 1 \u00B7 Lv${op.maxTalentOneLevel}`,
        color: op.color,
      });
    }
    if (op.talentTwoName) {
      items.push({
        id: `talent:${op.id}:2`,
        name: op.talentTwoName,
        category: ContentCategory.TALENTS,
        source: 'builtin',
        meta: `${op.name} \u00B7 Talent 2 \u00B7 Lv${op.maxTalentTwoLevel}`,
        color: op.color,
      });
    }
  }

  // ── Weapons ─────────────────────────────────────────────────────────────
  for (const w of WEAPONS) {
    items.push({
      id: w.name,
      name: w.name,
      category: ContentCategory.WEAPONS,
      source: 'builtin',
      meta: `${starStr(w.rarity)} ${w.weaponType.replace(/_/g, ' ')}`,
    });
  }
  for (const w of getCustomWeapons()) {
    items.push({
      id: w.id,
      name: w.name,
      category: ContentCategory.WEAPONS,
      source: 'custom',
      meta: `${starStr(w.weaponRarity)} ${w.weaponType.replace(/_/g, ' ')}`,
    });
  }

  // ── Gear Sets (deduplicated by gearSetType) ─────────────────────────────
  const seenSets = new Set<string>();
  for (const g of GEARS) {
    const key = g.gearSetType;
    if (key === 'NONE' || seenSets.has(key)) continue;
    seenSets.add(key);
    const pieceCount = GEARS.filter((x) => x.gearSetType === key).length;
    items.push({
      id: key,
      name: g.name.replace(/ (Heavy Armor|Light Armor|Exoskeleton|Gauntlets|Gloves|Poncho|Knife Kit|Radar|Tool Kit|Arm Kit|Combat Kit|Field Kit|Stealth Kit).*$/, ''),
      category: ContentCategory.GEAR_SETS,
      source: 'builtin',
      meta: `${starStr(g.rarity)} \u00B7 ${pieceCount} pcs`,
    });
  }
  for (const gs of getCustomGearSets()) {
    items.push({
      id: gs.id,
      name: gs.setName,
      category: ContentCategory.GEAR_SETS,
      source: 'custom',
      meta: `${starStr(gs.rarity)} \u00B7 ${gs.pieces.length} pcs`,
    });
  }

  // ── Weapon Skill Effects ────────────────────────────────────────────────
  for (const entry of WEAPON_SKILL_EFFECTS) {
    const firstEffect = entry.effects[0];
    items.push({
      id: `wse:${entry.weaponName}`,
      name: entry.weaponName,
      category: ContentCategory.WEAPON_EFFECTS,
      source: 'builtin',
      meta: firstEffect ? firstEffect.label : 'No effects',
    });
  }

  // ── Gear Set Effects ────────────────────────────────────────────────────
  for (const entry of GEAR_SET_EFFECTS) {
    const passiveCount = Object.keys(entry.passiveStats).length;
    const effectCount = entry.effects.length;
    items.push({
      id: `gse:${entry.gearSetType}`,
      name: entry.label,
      category: ContentCategory.GEAR_EFFECTS,
      source: 'builtin',
      meta: `${passiveCount} passive${effectCount ? ` \u00B7 ${effectCount} triggered` : ''}`,
    });
  }

  return items;
}
