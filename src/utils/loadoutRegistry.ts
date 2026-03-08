import { GearType, WeaponType } from "../consts/enums";
import { BaseOperator } from "../model/operators/baseOperator";
import { LaevatainOperator } from "../model/operators/laevatainOperator";
import { AntalOperator } from "../model/operators/antalOperator";
import { AkekuriOperator } from "../model/operators/akekuriOperator";
import { WulfgardOperator } from "../model/operators/wulfgardOperator";
import { ArdeliaOperator } from "../model/operators/ardeliaOperator";
import { Weapon } from "../model/weapons/weapon";
import { NeverRest } from "../model/weapons/neverRest";
import { ThermiteCutter } from "../model/weapons/thermiteCutter";
import { ForgebornScathe } from "../model/weapons/forgebornScathe";
import { StanzaOfMemorials } from "../model/weapons/stanzaOfMemorials";
import { Clannibal } from "../model/weapons/clannibal";
import { DreamsOfTheStarryBeach } from "../model/weapons/dreamsOfTheStarryBeach";
import { Gear } from "../model/gears/gear";
import {
  HotWorkExoskeleton,
  HotWorkGauntlets,
  HotWorkGauntletsT1,
  HotWorkPowerBank,
  HotWorkPowerCartridge,
  HotWorkPyrometer,
} from "../model/gears/hotWork";
import { Consumable } from "../model/consumables/consumable";
import { GinsengMeatStew } from "../model/consumables/ginsengMeatStew";
import { Tactical } from "../model/consumables/tactical";
import { StewMeeting } from "../model/consumables/stewMeeting";

// ─── Asset imports ──────────────────────────────────────────────────────────
import neverRestIcon from "../assets/weapons/Never_Rest_icon.webp";
import thermiteCutterIcon from "../assets/weapons/Thermite_Cutter_icon.webp";
import forgebornScatheIcon from "../assets/weapons/Forgeborn_Scathe_icon.webp";
import stanzaIcon from "../assets/weapons/Stanza_of_Memorials_icon.webp";
import clannibalIcon from "../assets/weapons/Clannibal_icon.webp";
import dreamsIcon from "../assets/weapons/Dreams_of_the_Starry_Beach_icon.webp";

import hotWorkExoskeletonIcon from "../assets/gears/Hot_Work_Exoskeleton.webp";
import hotWorkGauntletsIcon from "../assets/gears/Hot_Work_Gauntlets.webp";
import hotWorkGauntletsT1Icon from "../assets/gears/Hot_Work_Gauntlets_T1.webp";
import hotWorkPowerBankIcon from "../assets/gears/Hot_Work_Power_Bank.webp";
import hotWorkPowerCartridgeIcon from "../assets/gears/Hot_Work_Power_Cartridge.webp";
import hotWorkPyrometerIcon from "../assets/gears/Hot_Work_Pyrometer.webp";

import ginsengMeatStewIcon from "../assets/consumables/ginseng_meat_stew.webp";
import stewMeetingIcon from "../assets/consumables/stew_meeting.webp";

// ─── Registry ───────────────────────────────────────────────────────────────

export interface RegistryEntry<T> {
  name: string;
  icon?: string;
  create: () => T;
}

export const OPERATORS: RegistryEntry<BaseOperator>[] = [
  { name: "Laevatain",  create: () => new LaevatainOperator({ level: 90 }) },
  { name: "Antal",      create: () => new AntalOperator({ level: 90 }) },
  { name: "Akekuri",    create: () => new AkekuriOperator({ level: 90 }) },
  { name: "Wulfgard",   create: () => new WulfgardOperator({ level: 90 }) },
  { name: "Ardelia",    create: () => new ArdeliaOperator({ level: 90 }) },
];

export interface WeaponRegistryEntry extends RegistryEntry<Weapon> {
  weaponType: WeaponType;
}

export const WEAPONS: WeaponRegistryEntry[] = [
  { name: "Never Rest",                 icon: neverRestIcon,      weaponType: WeaponType.SWORD,     create: () => new NeverRest({ level: 90, skillOneLevel: 1, skillTwoLevel: 1, skillThreeLevel: 1 }) },
  { name: "Thermite Cutter",            icon: thermiteCutterIcon, weaponType: WeaponType.SWORD,     create: () => new ThermiteCutter({ level: 90, skillOneLevel: 1, skillTwoLevel: 1, skillThreeLevel: 1 }) },
  { name: "Forgeborn Scathe",           icon: forgebornScatheIcon, weaponType: WeaponType.SWORD,    create: () => new ForgebornScathe({ level: 90, skillOneLevel: 1, skillTwoLevel: 1, skillThreeLevel: 1 }) },
  { name: "Stanza of Memorials",        icon: stanzaIcon,         weaponType: WeaponType.ARTS_UNIT, create: () => new StanzaOfMemorials({ level: 90, skillOneLevel: 1, skillTwoLevel: 1, skillThreeLevel: 1 }) },
  { name: "Clannibal",                  icon: clannibalIcon,      weaponType: WeaponType.HANDCANNON, create: () => new Clannibal({ level: 90, skillOneLevel: 1, skillTwoLevel: 1, skillThreeLevel: 1 }) },
  { name: "Dreams of the Starry Beach", icon: dreamsIcon,         weaponType: WeaponType.ARTS_UNIT, create: () => new DreamsOfTheStarryBeach({ level: 90, skillOneLevel: 1, skillTwoLevel: 1, skillThreeLevel: 1 }) },
];

export const GEARS: RegistryEntry<Gear>[] = [
  { name: "Hot Work Exoskeleton",     icon: hotWorkExoskeletonIcon,    create: () => new HotWorkExoskeleton() },
  { name: "Hot Work Gauntlets",       icon: hotWorkGauntletsIcon,      create: () => new HotWorkGauntlets() },
  { name: "Hot Work Gauntlets T1",    icon: hotWorkGauntletsT1Icon,    create: () => new HotWorkGauntletsT1() },
  { name: "Hot Work Power Bank",      icon: hotWorkPowerBankIcon,      create: () => new HotWorkPowerBank() },
  { name: "Hot Work Power Cartridge", icon: hotWorkPowerCartridgeIcon,  create: () => new HotWorkPowerCartridge() },
  { name: "Hot Work Pyrometer",       icon: hotWorkPyrometerIcon,      create: () => new HotWorkPyrometer() },
];

export const ARMORS   = GEARS.filter((g) => g.create().gearType === GearType.ARMOR);
export const GLOVES   = GEARS.filter((g) => g.create().gearType === GearType.GLOVES);
export const KITS     = GEARS.filter((g) => g.create().gearType === GearType.KIT);

export const CONSUMABLES: RegistryEntry<Consumable>[] = [
  { name: "Ginseng Meat Stew", icon: ginsengMeatStewIcon, create: () => new GinsengMeatStew() },
];

export const TACTICALS: RegistryEntry<Tactical>[] = [
  { name: "Stew Meeting", icon: stewMeetingIcon, create: () => new StewMeeting() },
];
