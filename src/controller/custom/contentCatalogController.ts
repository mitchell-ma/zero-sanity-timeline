/**
 * Aggregates all game content into a flat list for the Content Browser sidebar.
 */
import { ContentCategory, ContentBrowserItem } from '../../consts/contentBrowserTypes';
import { ALL_OPERATORS, getCustomOperatorWarning } from '../operators/operatorRegistry';
import { getAllWeapons, getAllGearPieces, getGearSet, getWeapon, getWeaponEffectDefs, getGearEffectDefs, getAllWeaponEffectIds, getAllGearEffectTypes, getGearEffectLabel } from '../gameDataStore';
import { getAllConsumables, getAllTacticals } from '../../model/game-data/consumablesStore';
import { getGearSetData } from '../gameDataStore';
import { getGears } from '../../consts/gearSetEffects';
import { getAllSkillLabels } from '../gameDataStore';
import { GearSetType } from '../../consts/enums';
import { getCustomWeapons } from './customWeaponController';
import { getCustomGearSets } from './customGearController';
import { getCustomOperators } from './customOperatorController';
import { getCustomSkills } from './customSkillController';
import { getCustomWeaponEffects } from './customWeaponEffectController';
import { getCustomGearEffects } from './customGearEffectController';
import { getCustomOperatorStatuses } from './customOperatorStatusController';
import { getCustomOperatorTalents } from './customOperatorTalentController';
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
    const warningKey = op.id.toLowerCase().startsWith('custom_') ? op.id : `custom_${op.id}`;
    const warning = getCustomOperatorWarning(warningKey);
    items.push({
      id: op.id,
      name: op.name,
      category: ContentCategory.OPERATORS,
      source: 'custom',
      meta: `${starStr(op.operatorRarity)} ${op.operatorClassType} \u00B7 ${op.elementType}`,
      ...(warning ? { warning } : {}),
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
      const skillName = skill.name as string;
      const label = getAllSkillLabels()[skillName] || skill.name;
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
  for (const w of getAllWeapons()) {
    items.push({
      id: w.name,
      name: w.name,
      category: ContentCategory.WEAPONS,
      source: 'builtin',
      meta: `${starStr(w.rarity)} ${w.type.replace(/_/g, ' ')}`,
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

  // ── Gear Sets (deduplicated by gearSet) ─────────────────────────────────
  const seenSets = new Set<string>();
  for (const g of getAllGearPieces()) {
    const key = g.gearSet;
    if (key === GearSetType.NONE || seenSets.has(key)) continue;
    seenSets.add(key);
    const pieceCount = getAllGearPieces().filter((x) => x.gearSet === key).length;
    const setData = getGearSetData(key);
    const setEffect = getGearSet(key);
    const rarity = setEffect?.rarity ?? 5;
    items.push({
      id: key,
      name: setData?.name ?? g.name.replace(/ (Heavy Armor|Light Armor|Exoskeleton|Gauntlets|Gloves|Poncho|Knife Kit|Radar|Tool Kit|Arm Kit|Combat Kit|Field Kit|Stealth Kit).*$/, ''),
      category: ContentCategory.GEAR_SETS,
      source: 'builtin',
      meta: `${starStr(rarity)} \u00B7 ${pieceCount} pcs`,
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
  for (const weaponId of getAllWeaponEffectIds()) {
    const defs = getWeaponEffectDefs(weaponId);
    const firstDef = defs[0];
    const weaponDisplayName = getWeapon(weaponId)?.name ?? weaponId;
    items.push({
      id: `wse:${weaponId}`,
      name: weaponDisplayName,
      category: ContentCategory.WEAPON_EFFECTS,
      source: 'builtin',
      meta: firstDef ? (firstDef.label ?? firstDef.name ?? '') : 'No effects',
    });
  }

  // ── Gear Set Effects ────────────────────────────────────────────────────
  for (const gearSetType of getAllGearEffectTypes()) {
    const defs = getGearEffectDefs(gearSetType);
    const passiveEntry = getGears(gearSetType as GearSetType);
    const passiveCount = passiveEntry ? Object.keys(passiveEntry.passiveStats).length : 0;
    items.push({
      id: `gse:${gearSetType}`,
      name: getGearEffectLabel(gearSetType) ?? passiveEntry?.label ?? gearSetType,
      category: ContentCategory.GEAR_EFFECTS,
      source: 'builtin',
      meta: `${passiveCount} passive${defs.length ? ` \u00B7 ${defs.length} triggered` : ''}`,
    });
  }

  // ── Custom Weapon Effects ─────────────────────────────────────────────
  for (const we of getCustomWeaponEffects()) {
    items.push({
      id: we.id,
      name: we.name,
      category: ContentCategory.WEAPON_EFFECTS,
      source: 'custom',
      meta: `${we.statusEvents.length} status event${we.statusEvents.length !== 1 ? 's' : ''}`,
    });
  }

  // ── Custom Gear Effects ───────────────────────────────────────────────
  for (const ge of getCustomGearEffects()) {
    items.push({
      id: ge.id,
      name: ge.name,
      category: ContentCategory.GEAR_EFFECTS,
      source: 'custom',
      meta: `${ge.statusEvents.length} status event${ge.statusEvents.length !== 1 ? 's' : ''}`,
    });
  }

  // ── Custom Operator Statuses ──────────────────────────────────────────
  for (const os of getCustomOperatorStatuses()) {
    items.push({
      id: os.id,
      name: os.name,
      category: ContentCategory.OPERATOR_STATUSES,
      source: 'custom',
      meta: os.operatorId ? `Operator: ${os.operatorId}` : 'Standalone',
    });
  }

  // ── Custom Operator Talents ───────────────────────────────────────────
  for (const ot of getCustomOperatorTalents()) {
    items.push({
      id: ot.id,
      name: ot.name,
      category: ContentCategory.OPERATOR_TALENTS,
      source: 'custom',
      meta: `Slot ${ot.slot} \u00B7 Lv${ot.maxLevel}`,
    });
  }

  // ── Consumables ──────────────────────────────────────────────────────
  for (const c of getAllConsumables()) {
    items.push({
      id: c.id,
      name: c.name,
      category: ContentCategory.CONSUMABLES,
      source: 'builtin',
      meta: `${starStr(c.rarity)} Consumable`,
    });
  }

  // ── Tacticals ────────────────────────────────────────────────────────
  for (const tc of getAllTacticals()) {
    items.push({
      id: tc.id,
      name: tc.name,
      category: ContentCategory.TACTICALS,
      source: 'builtin',
      meta: `${starStr(tc.rarity)} Tactical`,
    });
  }

  return items;
}
