import { GearSetType, GearCategory, WeaponType } from "../consts/enums";
import { DataDrivenOperator } from "../model/operators/dataDrivenOperator";
import { getOperatorConfig } from "../controller/operators/operatorRegistry";
import { getOperatorJson, getAllOperatorIds } from "../model/event-frames/operatorJsonLoader";
import { Weapon } from "../model/weapons/weapon";
import { createWeaponFromData, WEAPON_DATA } from "../model/weapons/weaponData";
import { Gear } from "../model/gears/gear";
import { DataDrivenGear } from "../model/gears/dataDrivenGear";
import { Consumable } from "../model/consumables/consumable";
import { GinsengMeatStew } from "../model/consumables/ginsengMeatStew";
import { PerplexingMedication } from "../model/consumables/perplexingMedication";
import { Tactical } from "../model/consumables/tactical";
import { StewMeeting } from "../model/consumables/stewMeeting";
import ginsengMeatStewIcon from "../assets/consumables/ginseng_meat_stew.webp";
import stewMeetingIcon from "../assets/consumables/stew_meeting.webp";
import perplexingMedicationIcon from "../assets/consumables/perplexing_medication.webp";

// ─── Registry types ─────────────────────────────────────────────────────────

export interface RegistryEntry<T> {
  name: string;
  icon?: string;
  rarity: number;
  create: () => T;
}

export interface WeaponRegistryEntry extends RegistryEntry<Weapon> {
  weaponType: WeaponType;
}

export interface GearRegistryEntry extends RegistryEntry<Gear> {
  gearCategory: GearCategory;
  gearSetType: GearSetType;
}

// ─── Icon auto-discovery ────────────────────────────────────────────────────

// Weapon icons
const weaponIconContext = require.context('../assets/weapons', false, /\.(png|webp)$/);
const WEAPON_ICONS: Record<string, string> = {};
for (const key of weaponIconContext.keys()) {
  const match = key.match(/\.\/(.+)\.(png|webp)$/);
  if (match) {
    const assetName = match[1].replace(/_icon$/, '');
    WEAPON_ICONS[assetName] = weaponIconContext(key);
  }
}

function getWeaponIcon(name: string): string | undefined {
  const key = name.replace(/ /g, '_');
  if (WEAPON_ICONS[key]) return WEAPON_ICONS[key];
  const encoded = key.replace(/'/g, '%27');
  if (WEAPON_ICONS[encoded]) return WEAPON_ICONS[encoded];
  const lcKey = key.toLowerCase();
  for (const [k, v] of Object.entries(WEAPON_ICONS)) {
    if (k.toLowerCase() === lcKey) return v;
  }
  return undefined;
}

// Operator icons
const operatorIconContext = require.context('../assets/operators', false, /_icon\.png$/);
const OPERATOR_ICONS: Record<string, string> = {};
for (const key of operatorIconContext.keys()) {
  const match = key.match(/\.\/(.+)_icon\.png$/);
  if (match) {
    OPERATOR_ICONS[match[1]] = operatorIconContext(key);
  }
}

function getOperatorIcon(name: string): string | undefined {
  const key = name.replace(/ /g, '_');
  if (OPERATOR_ICONS[key]) return OPERATOR_ICONS[key];
  for (const [assetKey, url] of Object.entries(OPERATOR_ICONS)) {
    if (assetKey.startsWith(key)) return url;
  }
  return undefined;
}

// Gear icons
const gearIconContext = require.context('../assets/gears', false, /\.(png|webp)$/);
const GEAR_ICONS: Record<string, string> = {};
const GEAR_ICONS_LC: Record<string, string> = {};
for (const key of gearIconContext.keys()) {
  const match = key.match(/\.\/(.+)\.(png|webp)$/);
  if (match) {
    GEAR_ICONS[match[1]] = gearIconContext(key);
    GEAR_ICONS_LC[match[1].toLowerCase()] = gearIconContext(key);
  }
}

function getGearIcon(name: string): string | undefined {
  const key = name.replace(/ /g, '_');
  if (GEAR_ICONS[key]) return GEAR_ICONS[key];
  const lcKey = key.toLowerCase();
  if (GEAR_ICONS_LC[lcKey]) return GEAR_ICONS_LC[lcKey];
  return undefined;
}

// ─── Operators ──────────────────────────────────────────────────────────────

export const OPERATORS: RegistryEntry<DataDrivenOperator | null>[] = getAllOperatorIds().map(id => {
  const json = getOperatorJson(id);
  if (!json) throw new Error(`No JSON data for operator: ${id}`);
  return {
    name: json.name as string,
    icon: getOperatorIcon(json.name as string),
    rarity: json.operatorRarity as number,
    create: () => {
      const config = getOperatorConfig(id);
      return config ? new DataDrivenOperator(config, 90) : null;
    },
  };
});

// ─── Weapons (auto-generated from WEAPON_DATA) ─────────────────────────────

export const WEAPONS: WeaponRegistryEntry[] = Object.entries(WEAPON_DATA).map(([name, config]) => ({
  name,
  icon: getWeaponIcon(name),
  rarity: config.rarity,
  weaponType: config.type,
  create: () => createWeaponFromData(name, config.type),
}));

// ─── Gear (auto-discovered from JSON) ───────────────────────────────────────

const gearJsonContext = require.context('../model/game-data/gears', false, /\.json$/);

const gearEntries: GearRegistryEntry[] = [];
for (const jsonKey of gearJsonContext.keys()) {
  const gearSet = gearJsonContext(jsonKey);
  for (const piece of gearSet.pieces) {
    gearEntries.push({
      name: piece.name,
      icon: getGearIcon(piece.name),
      rarity: gearSet.rarity,
      gearCategory: piece.gearCategory as GearCategory,
      gearSetType: gearSet.gearSetType as unknown as GearSetType,
      create: () => new DataDrivenGear(piece, gearSet.gearSetType),
    });
  }
}

gearEntries.sort((a, b) => a.name.localeCompare(b.name));

export const GEARS: GearRegistryEntry[] = gearEntries;
export const ARMORS = GEARS.filter((g) => g.gearCategory === GearCategory.ARMOR);
export const GLOVES = GEARS.filter((g) => g.gearCategory === GearCategory.GLOVES);
export const KITS   = GEARS.filter((g) => g.gearCategory === GearCategory.KIT);

// ─── Consumables & Tacticals ────────────────────────────────────────────────

export const CONSUMABLES: RegistryEntry<Consumable>[] = [
  { name: "Ginseng Meat Stew", icon: ginsengMeatStewIcon, rarity: 3, create: () => new GinsengMeatStew() },
  { name: "Perplexing Medication", icon: perplexingMedicationIcon, rarity: 4, create: () => new PerplexingMedication() },
];

export const TACTICALS: RegistryEntry<Tactical>[] = [
  { name: "Stew Meeting", icon: stewMeetingIcon, rarity: 3, create: () => new StewMeeting() },
];
