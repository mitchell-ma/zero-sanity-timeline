import { GearEffectType, GearType, WeaponType } from "../consts/enums";
import { Operator } from "../model/operators/operator";
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
import { EdgeOfLightness } from "../model/weapons/edgeOfLightness";
import { Tarr11 } from "../model/weapons/tarr11";
import { GenericWeapon } from "../model/weapons/genericWeapon";
import { createWeaponFromData } from "../model/weapons/weaponData";
import { Gear } from "../model/gears/gear";
import {
  HotWorkExoskeleton,
  HotWorkGauntlets,
  HotWorkGauntletsT1,
  HotWorkPowerBank,
  HotWorkPowerCartridge,
  HotWorkPyrometer,
} from "../model/gears/hotWork";
import { TideFallLightArmor, TideSurgeGauntlets } from "../model/gears/tideSurge";
import { GenericGear } from "../model/gears/genericGear";
import { RedeemerHands, RedeemerSeal, RedeemerSealT1, RedeemerTag, RedeemerTagT1 } from "../model/gears/redeemer";
import {
  AburreyAuditoryChip,
  AburreyAuditoryChipT1,
  AburreyFlashlight,
  AburreyGauntlets,
  AburreyHeavyArmor,
  AburreyHeavyArmorT1,
  AburreyLightArmor,
  AburreyLightArmorT1,
  AburreySensorChip,
  AburreySensorChipT1,
  AburreyUvLamp,
} from "../model/gears/aburreyLegacy";
import {
  AethertechAnalysisBand,
  AethertechGloves,
  AethertechLightGloves,
  AethertechPlating,
  AethertechStabilizer,
  AethertechStabilizerT1,
  AethertechVisor,
  AethertechWatch,
} from "../model/gears/aethertech";
import { AicAlloyPlate, AicGauntlets, AicHeavyArmor, AicHeavyPlate } from "../model/gears/aicHeavy";
import { AicCeramicPlate, AicLightArmor, AicLightPlate, AicTacticalGloves } from "../model/gears/aicLight";
import {
  ArmoredMsgrFlashlight,
  ArmoredMsgrFlashlightT1,
  ArmoredMsgrFlashspike,
  ArmoredMsgrFlashspikeMod,
  ArmoredMsgrGloves,
  ArmoredMsgrGlovesMod,
  ArmoredMsgrGlovesT1,
  ArmoredMsgrGlovesT2,
  ArmoredMsgrGyro,
  ArmoredMsgrGyroMod,
  ArmoredMsgrGyroT1,
  ArmoredMsgrJacket,
  ArmoredMsgrJacketMod,
  ArmoredMsgrJacketT1,
} from "../model/gears/armoredMsgr";
import {
  BonekrushaFigurine,
  BonekrushaFigurineMod,
  BonekrushaFigurineT1,
  BonekrushaHeavyArmor,
  BonekrushaHeavyArmorT1,
  BonekrushaHeavyArmorT2,
  BonekrushaMask,
  BonekrushaMaskMod,
  BonekrushaMaskT1,
  BonekrushaMaskT2,
  BonekrushaPoncho,
  BonekrushaPonchoMod,
  BonekrushaPonchoT1,
  BonekrushaWristband,
  BonekrushaWristbandMod,
} from "../model/gears/bonekrusha";
import {
  CatastropheFilter,
  CatastropheGauzeCartridge,
  CatastropheGauzeCartridgeT1,
  CatastropheGloves,
  CatastropheHeavyArmor,
  CatastropheHeavyArmorT1,
} from "../model/gears/catastrophe";
import {
  EternalXiraniteArmor,
  EternalXiraniteAuxiliaryArm,
  EternalXiraniteGloves,
  EternalXiraniteGlovesT1,
  EternalXiranitePowerCore,
  EternalXiranitePowerCoreT1,
} from "../model/gears/eternalXiranite";
import {
  FrontiersAnalyzer,
  FrontiersAnalyzerMod,
  FrontiersArmor,
  FrontiersArmorMod,
  FrontiersArmorT1,
  FrontiersArmorT2,
  FrontiersArmorT3,
  FrontiersBlightResGloves,
  FrontiersBlightResGlovesMod,
  FrontiersComm,
  FrontiersCommMod,
  FrontiersCommT1,
  FrontiersExtraO2Tube,
  FrontiersFiberGloves,
  FrontiersFiberGlovesMod,
  FrontiersO2Tether,
  FrontiersO2TetherMod,
  FrontiersProtectionSuit,
} from "../model/gears/frontiers";
import {
  LynxAegisInjector,
  LynxAegisInjectorMod,
  LynxConnector,
  LynxConnectorMod,
  LynxConnectorT1,
  LynxConnectorT2,
  LynxCuirass,
  LynxCuirassMod,
  LynxGauntlets,
  LynxGloves,
  LynxGlovesMod,
  LynxHeavyArmor,
  LynxSlab,
  LynxSlabMod,
} from "../model/gears/lynx";
import {
  MiSecurityArmband,
  MiSecurityArmor,
  MiSecurityArmorMod,
  MiSecurityGloves,
  MiSecurityGlovesMod,
  MiSecurityHandsPpe,
  MiSecurityHandsPpeMod,
  MiSecurityHandsPpeT1,
  MiSecurityOveralls,
  MiSecurityOverallsMod,
  MiSecurityOverallsT1,
  MiSecurityOverallsT2,
  MiSecurityPushKnife,
  MiSecurityPushKnifeMod,
  MiSecurityPushKnifeT1,
  MiSecurityScope,
  MiSecurityScopeMod,
  MiSecurityToolkit,
  MiSecurityToolkitMod,
  MiSecurityVisor,
  MiSecurityVisorMod,
} from "../model/gears/miSecurity";
import {
  MordvoltInsulationBattery,
  MordvoltInsulationBatteryMod,
  MordvoltInsulationBatteryT1,
  MordvoltInsulationGloves,
  MordvoltInsulationGlovesMod,
  MordvoltInsulationGlovesT1,
  MordvoltInsulationVest,
  MordvoltInsulationVestMod,
  MordvoltInsulationVestT1,
  MordvoltInsulationVestT2,
  MordvoltInsulationWrench,
  MordvoltInsulationWrenchMod,
  MordvoltInsulationWrenchT1,
  MordvoltInsulationWrenchT2,
} from "../model/gears/mordvoltInsulation";
import {
  MordvoltResistantBattery,
  MordvoltResistantBatteryMod,
  MordvoltResistantBatteryT1,
  MordvoltResistantGloves,
  MordvoltResistantGlovesMod,
  MordvoltResistantGlovesT1,
  MordvoltResistantVest,
  MordvoltResistantVestMod,
  MordvoltResistantVestT1,
  MordvoltResistantWrench,
  MordvoltResistantWrenchMod,
  MordvoltResistantWrenchT1,
} from "../model/gears/mordvoltResistant";
import {
  PulserLabsCalibrator,
  PulserLabsDisruptorSuit,
  PulserLabsGloves,
  PulserLabsInvasionCore,
  PulserLabsProbe,
} from "../model/gears/pulserLabs";
import {
  RovingMsgrFists,
  RovingMsgrFistsMod,
  RovingMsgrFistsT1,
  RovingMsgrFlashlight,
  RovingMsgrFlashlightT1,
  RovingMsgrFlashlightT2,
  RovingMsgrFlashspike,
  RovingMsgrFlashspikeMod,
  RovingMsgrGyro,
  RovingMsgrGyroMod,
  RovingMsgrGyroT1,
  RovingMsgrJacket,
  RovingMsgrJacketMod,
  RovingMsgrJacketT1,
} from "../model/gears/rovingMsgr";
import {
  SwordmancerFlint,
  SwordmancerHeavyArmor,
  SwordmancerLightArmor,
  SwordmancerMicroFilter,
  SwordmancerNavBeacon,
  SwordmancerTacFists,
  SwordmancerTacGauntlets,
  SwordmancerTacGloves,
} from "../model/gears/swordmancer";
import {
  Type50YinglungGloves,
  Type50YinglungGlovesT1,
  Type50YinglungHeavyArmor,
  Type50YinglungKnife,
  Type50YinglungHeavyArmorT1,
  Type50YinglungHeavyArmorT2,
  Type50YinglungKnifeT1,
  Type50YinglungLightArmor,
  Type50YinglungRadar,
  Type50YinglungRadarT2,
} from "../model/gears/type50Yinglung";
import { Consumable } from "../model/consumables/consumable";
import { GinsengMeatStew } from "../model/consumables/ginsengMeatStew";
import { PerplexingMedication } from "../model/consumables/perplexingMedication";
import { Tactical } from "../model/consumables/tactical";
import { StewMeeting } from "../model/consumables/stewMeeting";

// ─── Weapon icon imports ────────────────────────────────────────────────────
import neverRestIcon from "../assets/weapons/Never_Rest_icon.png";
import thermiteCutterIcon from "../assets/weapons/Thermite_Cutter_icon.png";
import forgebornScatheIcon from "../assets/weapons/Forgeborn_Scathe_icon.png";
import stanzaIcon from "../assets/weapons/Stanza_of_Memorials_icon.png";
import clannibalIcon from "../assets/weapons/Clannibal_icon.png";
import dreamsIcon from "../assets/weapons/Dreams_of_the_Starry_Beach_icon.png";
import eminentRepute from "../assets/weapons/Eminent_Repute_icon.png";
import rapidAscent from "../assets/weapons/Rapid_Ascent_icon.png";
import whiteNightNova from "../assets/weapons/White_Night_Nova_icon.png";
import grandVision from "../assets/weapons/Grand_Vision_icon.png";
import umbralTorch from "../assets/weapons/Umbral_Torch_icon.png";
import sunderingSteel from "../assets/weapons/Sundering_Steel_icon.png";
import fortmaker from "../assets/weapons/Fortmaker_icon.png";
import aspirant from "../assets/weapons/Aspirant_icon.png";
import objEdgeOfLightness from "../assets/weapons/OBJ_Edge_of_Lightness_icon.png";
import twelveQuestions from "../assets/weapons/Twelve_Questions_icon.png";
import finchaser from "../assets/weapons/Finchaser_3.0_icon.png";
import waveTide from "../assets/weapons/Wave_Tide_icon.png";
import contingentMeasure from "../assets/weapons/Contingent_Measure_icon.png";
import tarr11 from "../assets/weapons/Tarr_11_icon.png";
import formerFinery from "../assets/weapons/Former_Finery_icon.png";
import sunderedPrince from "../assets/weapons/Sundered_Prince_icon.png";
import thunderberge from "../assets/weapons/Thunderberge_icon.png";
import exemplar from "../assets/weapons/Exemplar_icon.png";
import khravengger from "../assets/weapons/Khravengger_icon.png";
import objHeavyBurden from "../assets/weapons/OBJ_Heavy_Burden_icon.png";
import finishingCall from "../assets/weapons/Finishing_Call_icon.png";
import ancientCanal from "../assets/weapons/Ancient_Canal_icon.png";
import seekerOfDarkLung from "../assets/weapons/Seeker_of_Dark_Lung_icon.png";
import industry01 from "../assets/weapons/Industry_0.1_icon.png";
import quencher from "../assets/weapons/Quencher_icon.png";
import darhoff7 from "../assets/weapons/Darhoff_7_icon.png";
import jetIcon from "../assets/weapons/JET_icon.png";
import mountainBearer from "../assets/weapons/Mountain_Bearer_icon.png";
import valiant from "../assets/weapons/Valiant_icon.png";
import cohesiveTraction from "../assets/weapons/Cohesive_Traction_icon.png";
import chimericJustice from "../assets/weapons/Chimeric_Justice_icon.png";
import objRazorhorn from "../assets/weapons/OBJ_Razorhorn_icon.png";
import pathfindersBeacon from "../assets/weapons/Pathfinder%27s_Beacon_icon.png";
import aggeloslayer from "../assets/weapons/Aggeloslayer_icon.png";
import opero77 from "../assets/weapons/Opero_77_icon.png";
import wedgeIcon from "../assets/weapons/Wedge_icon.png";
import navigator from "../assets/weapons/Navigator_icon.png";
import artzyTyrannical from "../assets/weapons/Artzy_Tyrannical_icon.png";
import rationalFarewell from "../assets/weapons/Rational_Farewell_icon.png";
import opusTheLiving from "../assets/weapons/Opus_The_Living_icon.png";
import objVelocitous from "../assets/weapons/OBJ_Velocitous_icon.png";
import howlingGuard from "../assets/weapons/Howling_Guard_icon.png";
import longRoad from "../assets/weapons/Long_Road_icon.png";
import peco5 from "../assets/weapons/Peco_5_icon.png";
import chivalricVirtues from "../assets/weapons/Chivalric_Virtues_icon.png";
import detonationUnit from "../assets/weapons/Detonation_Unit_icon.png";
import oblivion from "../assets/weapons/Oblivion_icon.png";
import opusEtchFigure from "../assets/weapons/Opus_Etch_Figure_icon.png";
import deliveryGuaranteed from "../assets/weapons/Delivery_Guaranteed_icon.png";
import objArtsIdentifier from "../assets/weapons/OBJ_Arts_Identifier_icon.png";
import freedomToProselytize from "../assets/weapons/Freedom_to_Proselytize_icon.png";
import wildWanderer from "../assets/weapons/Wild_Wanderer_icon.png";
import monaihe from "../assets/weapons/Monaihe_icon.png";
import fluorescentRoc from "../assets/weapons/Fluorescent_Roc_icon.png";
import hypernovaAuto from "../assets/weapons/Hypernova_Auto_icon.png";
import jiminy12 from "../assets/weapons/Jiminy_12_icon.png";

// ─── Operator icon imports ──────────────────────────────────────────────────
import endministratorIcon from "../assets/operators/Endministrator_icon.png";
import lifengIcon from "../assets/operators/Lifeng_icon.png";
import rossiIcon from "../assets/operators/Rossi_icon.png";
import chenQianyuIcon from "../assets/operators/Chen_Qianyu_icon.png";
import estellaIcon from "../assets/operators/Estella_icon.png";
import emberIcon from "../assets/operators/Ember_icon.png";
import snowshineIcon from "../assets/operators/Snowshine_icon.png";
import catcherIcon from "../assets/operators/Catcher_icon.png";
import ardeliaIcon from "../assets/operators/Ardelia_icon.png";
import gilbertaIcon from "../assets/operators/Gilberta_icon.png";
import xaihiIcon from "../assets/operators/Xaihi_icon.png";
import antalIcon from "../assets/operators/Antal_icon.png";
import tangtangIcon from "../assets/operators/Tangtang_icon.png";
import perlicaIcon from "../assets/operators/Perlica_icon.png";
import wulfgardIcon from "../assets/operators/Wulfgard_icon.png";
import fluoriteIcon from "../assets/operators/Fluorite_icon.png";
import laevatainIcon from "../assets/operators/Laevatain_icon.png";
import lastRiteIcon from "../assets/operators/Last_Rite_icon.png";
import yvonneIcon from "../assets/operators/Yvonne_icon.png";
import avywennaIcon from "../assets/operators/Avywenna_icon.png";
import daPanIcon from "../assets/operators/Da_Pan_icon.png";
import pogranichnikIcon from "../assets/operators/Pogranichnik_icon.png";
import aleshIcon from "../assets/operators/Alesh_icon.png";
import arclightIcon from "../assets/operators/Arclight_icon.png";
import akekuriIcon from "../assets/operators/Akekuri_icon.png";

// ─── Gear icon imports (existing webp) ──────────────────────────────────────
import hotWorkExoskeletonIcon from "../assets/gears/Hot_Work_Exoskeleton.webp";
import hotWorkGauntletsIcon from "../assets/gears/Hot_Work_Gauntlets.webp";
import hotWorkGauntletsT1Icon from "../assets/gears/Hot_Work_Gauntlets_T1.webp";
import hotWorkPowerBankIcon from "../assets/gears/Hot_Work_Power_Bank.webp";
import hotWorkPowerCartridgeIcon from "../assets/gears/Hot_Work_Power_Cartridge.webp";
import hotWorkPyrometerIcon from "../assets/gears/Hot_Work_Pyrometer.webp";

// ─── Gear icon imports (armor) ──────────────────────────────────────────────
import aHeavyArmor from "../assets/gears/Aburrey_Heavy_Armor.png";
import aHeavyArmorT1 from "../assets/gears/Aburrey_Heavy_Armor_T1.png";
import aLightArmor from "../assets/gears/Aburrey_Light_Armor.png";
import aLightArmorT1 from "../assets/gears/Aburrey_Light_Armor_T1.png";
import aicHeavyArmor from "../assets/gears/AIC_Heavy_Armor.png";
import aicLightArmor from "../assets/gears/AIC_Light_Armor.png";
import amsgrJacket from "../assets/gears/Armored_MSGR_Jacket.png";
import amsgrJacketMod from "../assets/gears/Armored_MSGR_Jacket_MOD.png";
import amsgrJacketT1 from "../assets/gears/Armored_MSGR_Jacket_T1.png";
import basicArmor from "../assets/gears/Basic_Armor.png";
import basicPPE from "../assets/gears/Basic_PPE.png";
import bkHeavyArmor from "../assets/gears/Bonekrusha_Heavy_Armor.png";
import bkHeavyArmorT1 from "../assets/gears/Bonekrusha_Heavy_Armor_T1.png";
import bkPoncho from "../assets/gears/Bonekrusha_Poncho.png";
import bkPonchoMod from "../assets/gears/Bonekrusha_Poncho_MOD.png";
import bkPonchoT1 from "../assets/gears/Bonekrusha_Poncho_T1.png";
import catHeavyArmor from "../assets/gears/Catastrophe_Heavy_Armor.png";
import catHeavyArmorT1 from "../assets/gears/Catastrophe_Heavy_Armor_T1.png";
import exArmor from "../assets/gears/Eternal_Xiranite_Armor.png";
import fsArmor from "../assets/gears/Frontier-Smart_Armor.png";
import fsArmorMod from "../assets/gears/Frontier-Smart_Armor_MOD.png";
import frArmor from "../assets/gears/Frontiers_Armor.png";
import frArmorMod from "../assets/gears/Frontiers_Armor_MOD.png";
import frArmorT1 from "../assets/gears/Frontiers_Armor_T1.png";
import frArmorT2 from "../assets/gears/Frontiers_Armor_T2.png";
import frArmorT3 from "../assets/gears/Frontiers_Armor_T3.png";
import hwExoRig from "../assets/gears/Hot_Work_Exo-Rig.png";
import lynxCuirass from "../assets/gears/LYNX_Cuirass.png";
import lynxCuirassMod from "../assets/gears/LYNX_Cuirass_MOD.png";
import lynxHeavyArmor from "../assets/gears/LYNX_Heavy_Armor.png";
import miArmor from "../assets/gears/MI_Security_Armor.png";
import miArmorMod from "../assets/gears/MI_Security_Armor_MOD.png";
import miOveralls from "../assets/gears/MI_Security_Overalls.png";
import miOverallsMod from "../assets/gears/MI_Security_Overalls_MOD.png";
import miOverallsT1 from "../assets/gears/MI_Security_Overalls_T1.png";
import miOverallsT2 from "../assets/gears/MI_Security_Overalls_T2.png";
import minerArmor from "../assets/gears/Miner_Armor.png";
import minerArmorT1 from "../assets/gears/Miner_Armor_T1.png";
import minerArmorT2 from "../assets/gears/Miner_Armor_T2.png";
import minerArmorT4 from "../assets/gears/Miner_Armor_T4.png";
import minerCleansuit from "../assets/gears/Miner_Cleansuit.png";
import minerOveralls from "../assets/gears/Miner_Overalls.png";
import minerOverallsT1 from "../assets/gears/Miner_Overalls_T1.png";
import minerOverallsT2 from "../assets/gears/Miner_Overalls_T2.png";
import minerOverallsT4 from "../assets/gears/Miner_Overalls_T4.png";
import minerPpeT2 from "../assets/gears/Miner_PPE_T2.png";
import minerVest from "../assets/gears/Miner_Vest.png";
import minerVestT2 from "../assets/gears/Miner_Vest_T2.png";
import mvInsVest from "../assets/gears/Mordvolt_Insulation_Vest.png";
import mvInsVestMod from "../assets/gears/Mordvolt_Insulation_Vest_MOD.png";
import mvInsVestT1 from "../assets/gears/Mordvolt_Insulation_Vest_T1.png";
import mvInsVestT2 from "../assets/gears/Mordvolt_Insulation_Vest_T2.png";
import mvResVest from "../assets/gears/Mordvolt_Resistant_Vest.png";
import mvResVestMod from "../assets/gears/Mordvolt_Resistant_Vest_MOD.png";
import mvResVestT1 from "../assets/gears/Mordvolt_Resistant_Vest_T1.png";
import protoHeavy from "../assets/gears/Prototype_Heavy_Armor.png";
import protoHeavyT1 from "../assets/gears/Prototype_Heavy_Armor_T1.png";
import plDisruptorSuit from "../assets/gears/Pulser_Labs_Disruptor_Suit.png";
import redeemerArmor from "../assets/gears/Redeemer_Armor.png";
import redeemerPlates from "../assets/gears/Redeemer_Plates.png";
import rmsgrJacket from "../assets/gears/Roving_MSGR_Jacket.png";
import rmsgrJacketMod from "../assets/gears/Roving_MSGR_Jacket_MOD.png";
import rmsgrJacketT1 from "../assets/gears/Roving_MSGR_Jacket_T1.png";
import swHeavyArmor from "../assets/gears/Swordmancer_Heavy_Armor.png";
import swLightArmor from "../assets/gears/Swordmancer_Light_Armor.png";
import tfLightArmor from "../assets/gears/Tide_Fall_Light_Armor.png";
import ylHeavyArmor from "../assets/gears/Type_50_Yinglung_Heavy_Armor.png";
import ylLightArmor from "../assets/gears/Type_50_Yinglung_Light_Armor.png";
import aetPlating from "../assets/gears/Æthertech_Plating.png";

// ─── Gear icon imports (gloves) ─────────────────────────────────────────────
import aGauntlets from "../assets/gears/Aburrey_Gauntlets.png";
import aicGauntlets from "../assets/gears/AIC_Gauntlets.png";
import aicTacGloves from "../assets/gears/AIC_Tactical_Gloves.png";
import amsgrGloves from "../assets/gears/Armored_MSGR_Gloves.png";
import amsgrGlovesMod from "../assets/gears/Armored_MSGR_Gloves_MOD.png";
import amsgrGlovesT1 from "../assets/gears/Armored_MSGR_Gloves_T1.png";
import amsgrGlovesT2 from "../assets/gears/Armored_MSGR_Gloves_T2.png";
import basicGauntlets from "../assets/gears/Basic_Gauntlets.png";
import basicGloves from "../assets/gears/Basic_Gloves.png";
import bkWristband from "../assets/gears/Bonekrusha_Wristband.png";
import bkWristbandMod from "../assets/gears/Bonekrusha_Wristband_MOD.png";
import catGloves from "../assets/gears/Catastrophe_Gloves.png";
import exGloves from "../assets/gears/Eternal_Xiranite_Gloves.png";
import exGlovesT1 from "../assets/gears/Eternal_Xiranite_Gloves_T1.png";
import frBlightGloves from "../assets/gears/Frontiers_Blight_RES_Gloves.png";
import frBlightGlovesMod from "../assets/gears/Frontiers_Blight_RES_Gloves_MOD.png";
import frFiberGloves from "../assets/gears/Frontiers_Fiber_Gloves.png";
import frFiberGlovesMod from "../assets/gears/Frontiers_Fiber_Gloves_MOD.png";
import hwGloves from "../assets/gears/Hot_Work_Gloves.png";
import lynxGauntlets from "../assets/gears/LYNX_Gauntlets.png";
import lynxGloves from "../assets/gears/LYNX_Gloves.png";
import lynxGlovesMod from "../assets/gears/LYNX_Gloves_MOD.png";
import miGloves from "../assets/gears/MI_Security_Gloves.png";
import miGlovesMod from "../assets/gears/MI_Security_Gloves_MOD.png";
import miHandsPpe from "../assets/gears/MI_Security_Hands_PPE.png";
import miHandsPpeMod from "../assets/gears/MI_Security_Hands_PPE_MOD.png";
import miHandsPpeT1 from "../assets/gears/MI_Security_Hands_PPE_T1.png";
import minerFists from "../assets/gears/Miner_Fists.png";
import minerFistsT1 from "../assets/gears/Miner_Fists_T1.png";
import minerFistsT2 from "../assets/gears/Miner_Fists_T2.png";
import minerFistsT4 from "../assets/gears/Miner_Fists_T4.png";
import minerGauntlets from "../assets/gears/Miner_Gauntlets.png";
import minerGauntletsT1 from "../assets/gears/Miner_Gauntlets_T1.png";
import minerGauntletsT2 from "../assets/gears/Miner_Gauntlets_T2.png";
import minerGauntletsT3 from "../assets/gears/Miner_Gauntlets_T3.png";
import minerGauntletsT4 from "../assets/gears/Miner_Gauntlets_T4.png";
import minerGloves from "../assets/gears/Miner_Gloves.png";
import minerGlovesT1 from "../assets/gears/Miner_Gloves_T1.png";
import minerGlovesT2 from "../assets/gears/Miner_Gloves_T2.png";
import minerGlovesT3 from "../assets/gears/Miner_Gloves_T3.png";
import minerWrists from "../assets/gears/Miner_Wrists.png";
import minerWristsT2 from "../assets/gears/Miner_Wrists_T2.png";
import mvInsGloves from "../assets/gears/Mordvolt_Insulation_Gloves.png";
import mvInsGlovesMod from "../assets/gears/Mordvolt_Insulation_Gloves_MOD.png";
import mvInsGlovesT1 from "../assets/gears/Mordvolt_Insulation_Gloves_T1.png";
import mvResGloves from "../assets/gears/Mordvolt_Resistant_Gloves.png";
import mvResGlovesMod from "../assets/gears/Mordvolt_Resistant_Gloves_MOD.png";
import mvResGlovesT1 from "../assets/gears/Mordvolt_Resistant_Gloves_T1.png";
import plGloves from "../assets/gears/Pulser_Labs_Gloves.png";
import redGlovesDex from "../assets/gears/Redeemer_Gloves_DEX.png";
import redGlovesForce from "../assets/gears/Redeemer_Gloves_FORCE.png";
import rmsgrFists from "../assets/gears/Roving_MSGR_Fists.png";
import rmsgrFistsMod from "../assets/gears/Roving_MSGR_Fists_MOD.png";
import rmsgrFistsT1 from "../assets/gears/Roving_MSGR_Fists_T1.png";
import swTacFists from "../assets/gears/Swordmancer_TAC_Fists.png";
import swTacGauntlets from "../assets/gears/Swordmancer_TAC_Gauntlets.png";
import tsGauntlets from "../assets/gears/Tide_Surge_Gauntlets.png";
import ylGloves from "../assets/gears/Type_50_Yinglung_Gloves.png";
import ylGlovesT1 from "../assets/gears/Type_50_Yinglung_Gloves_T1.png";
import aetGloves from "../assets/gears/Æthertech_Gloves.png";

// ─── Gear icon imports (kit) ────────────────────────────────────────────────
import aAuditoryChip from "../assets/gears/Aburrey_Auditory_Chip.png";
import aAuditoryChipT1 from "../assets/gears/Aburrey_Auditory_Chip_T1.png";
import aFlashlight from "../assets/gears/Aburrey_Flashlight.png";
import aSensorChip from "../assets/gears/Aburrey_Sensor_Chip.png";
import aSensorChipT1 from "../assets/gears/Aburrey_Sensor_Chip_T1.png";
import aUvLamp from "../assets/gears/Aburrey_UV_Lamp.png";
import aicAlloyPlate from "../assets/gears/AIC_Alloy_Plate.png";
import aicCeramicPlate from "../assets/gears/AIC_Ceramic_Plate.png";
import aicHeavyPlate from "../assets/gears/AIC_Heavy_Plate.png";
import aicLightPlate from "../assets/gears/AIC_Light_Plate.png";
import amsgrFlashlight from "../assets/gears/Armored_MSGR_Flashlight.png";
import amsgrFlashlightT1 from "../assets/gears/Armored_MSGR_Flashlight_T1.png";
import amsgrFlashspike from "../assets/gears/Armored_MSGR_Flashspike.png";
import amsgrFlashspikeMod from "../assets/gears/Armored_MSGR_Flashspike_MOD.png";
import amsgrGyro from "../assets/gears/Armored_MSGR_Gyro.png";
import amsgrGyroMod from "../assets/gears/Armored_MSGR_Gyro_MOD.png";
import amsgrGyroT1 from "../assets/gears/Armored_MSGR_Gyro_T1.png";
import bkFigurine from "../assets/gears/Bonekrusha_Figurine.png";
import bkFigurineMod from "../assets/gears/Bonekrusha_Figurine_MOD.png";
import bkFigurineT1 from "../assets/gears/Bonekrusha_Figurine_T1.png";
import bkMask from "../assets/gears/Bonekrusha_Mask.png";
import bkMaskMod from "../assets/gears/Bonekrusha_Mask_MOD.png";
import bkMaskT1 from "../assets/gears/Bonekrusha_Mask_T1.png";
import catFilter from "../assets/gears/Catastrophe_Filter.png";
import catGauze from "../assets/gears/Catastrophe_Gauze_Cartridge.png";
import catGauzeT1 from "../assets/gears/Catastrophe_Gauze_Cartridge_T1.png";
import emergencyComm from "../assets/gears/Emergency_Comm.png";
import emergencyCore from "../assets/gears/Emergency_Compression_Core.png";
import exAuxArm from "../assets/gears/Eternal_Xiranite_Auxiliary_Arm.png";
import exPowerCore from "../assets/gears/Eternal_Xiranite_Power_Core.png";
import exPowerCoreT1 from "../assets/gears/Eternal_Xiranite_Power_Core_T1.png";
import frAnalyzer from "../assets/gears/Frontiers_Analyzer.png";
import frAnalyzerMod from "../assets/gears/Frontiers_Analyzer_MOD.png";
import frComm from "../assets/gears/Frontiers_Comm.png";
import frCommMod from "../assets/gears/Frontiers_Comm_MOD.png";
import frCommT1 from "../assets/gears/Frontiers_Comm_T1.png";
import frExtraO2 from "../assets/gears/Frontiers_Extra_O2_Tube.png";
import frO2Tether from "../assets/gears/Frontiers_O2_Tether.png";
import frO2TetherMod from "../assets/gears/Frontiers_O2_Tether_MOD.png";
import hangingRiverO2 from "../assets/gears/Hanging_River_O2_Tube.png";
import hwHpd from "../assets/gears/Hot_Work_HPD.png";
import lynxAegis from "../assets/gears/LYNX_Aegis_Injector.png";
import lynxAegisMod from "../assets/gears/LYNX_Aegis_Injector_MOD.png";
import lynxConnector from "../assets/gears/LYNX_Connector.png";
import lynxConnectorMod from "../assets/gears/LYNX_Connector_MOD.png";
import lynxConnectorT1 from "../assets/gears/LYNX_Connector_T1.png";
import lynxSlab from "../assets/gears/LYNX_Slab.png";
import lynxSlabMod from "../assets/gears/LYNX_Slab_MOD.png";
import miArmband from "../assets/gears/MI_Security_Armband.png";
import miPushKnife from "../assets/gears/MI_Security_Push_Knife.png";
import miPushKnifeMod from "../assets/gears/MI_Security_Push_Knife_MOD.png";
import miPushKnifeT1 from "../assets/gears/MI_Security_Push_Knife_T1.png";
import miScope from "../assets/gears/MI_Security_Scope.png";
import miScopeMod from "../assets/gears/MI_Security_Scope_MOD.png";
import miToolkit from "../assets/gears/MI_Security_Toolkit.png";
import miToolkitMod from "../assets/gears/MI_Security_Toolkit_MOD.png";
import miVisor from "../assets/gears/MI_Security_Visor.png";
import miVisorMod from "../assets/gears/MI_Security_Visor_MOD.png";
import minerComm from "../assets/gears/Miner_Comm.png";
import minerCommT1 from "../assets/gears/Miner_Comm_T1.png";
import minerCommT2 from "../assets/gears/Miner_Comm_T2.png";
import minerCommT3 from "../assets/gears/Miner_Comm_T3.png";
import minerCommT4 from "../assets/gears/Miner_Comm_T4.png";
import minerCompCore from "../assets/gears/Miner_Compression_Core.png";
import minerCompCoreT1 from "../assets/gears/Miner_Compression_Core_T1.png";
import minerCompCoreT2 from "../assets/gears/Miner_Compression_Core_T2.png";
import minerCompCoreT3 from "../assets/gears/Miner_Compression_Core_T3.png";
import minerCompCoreT4 from "../assets/gears/Miner_Compression_Core_T4.png";
import minerDriveWheel from "../assets/gears/Miner_Drive_Wheel.png";
import minerDriveWheelT1 from "../assets/gears/Miner_Drive_Wheel_T1.png";
import minerDriveWheelT2 from "../assets/gears/Miner_Drive_Wheel_T2.png";
import minerDriveWheelT3 from "../assets/gears/Miner_Drive_Wheel_T3.png";
import minerDriveWheelT4 from "../assets/gears/Miner_Drive_Wheel_T4.png";
import minerDriveWheelT5 from "../assets/gears/Miner_Drive_Wheel_T5.png";
import minerTurbine from "../assets/gears/Miner_Turbine.png";
import minerTurbineT1 from "../assets/gears/Miner_Turbine_T1.png";
import minerTurbineT2 from "../assets/gears/Miner_Turbine_T2.png";
import minerTurbineT3 from "../assets/gears/Miner_Turbine_T3.png";
import minerTurbineT4 from "../assets/gears/Miner_Turbine_T4.png";
import minerTurbineT5 from "../assets/gears/Miner_Turbine_T5.png";
import mvInsBattery from "../assets/gears/Mordvolt_Insulation_Battery.png";
import mvInsBatteryMod from "../assets/gears/Mordvolt_Insulation_Battery_MOD.png";
import mvInsBatteryT1 from "../assets/gears/Mordvolt_Insulation_Battery_T1.png";
import mvInsWrench from "../assets/gears/Mordvolt_Insulation_Wrench.png";
import mvInsWrenchMod from "../assets/gears/Mordvolt_Insulation_Wrench_MOD.png";
import mvInsWrenchT1 from "../assets/gears/Mordvolt_Insulation_Wrench_T1.png";
import mvInsWrenchT2 from "../assets/gears/Mordvolt_Insulation_Wrench_T2.png";
import mvResBattery from "../assets/gears/Mordvolt_Resistant_Battery.png";
import mvResBatteryMod from "../assets/gears/Mordvolt_Resistant_Battery_MOD.png";
import mvResBatteryT1 from "../assets/gears/Mordvolt_Resistant_Battery_T1.png";
import mvResWrench from "../assets/gears/Mordvolt_Resistant_Wrench.png";
import mvResWrenchMod from "../assets/gears/Mordvolt_Resistant_Wrench_MOD.png";
import mvResWrenchT1 from "../assets/gears/Mordvolt_Resistant_Wrench_T1.png";
import obsoleteComm from "../assets/gears/Obsolete_Comm.png";
import obsoleteCore from "../assets/gears/Obsolete_Compression_Core.png";
import plCalibrator from "../assets/gears/Pulser_Labs_Calibrator.png";
import plInvasionCore from "../assets/gears/Pulser_Labs_Invasion_Core.png";
import plProbe from "../assets/gears/Pulser_Labs_Probe.png";
import redSeal from "../assets/gears/Redeemer_Seal.png";
import redSealT1 from "../assets/gears/Redeemer_Seal_T1.png";
import redTag from "../assets/gears/Redeemer_Tag.png";
import redTagT1 from "../assets/gears/Redeemer_Tag_T1.png";
import rmsgrFlashlight from "../assets/gears/Roving_MSGR_Flashlight.png";
import rmsgrFlashlightT1 from "../assets/gears/Roving_MSGR_Flashlight_T1.png";
import rmsgrFlashlightT2 from "../assets/gears/Roving_MSGR_Flashlight_T2.png";
import rmsgrFlashspike from "../assets/gears/Roving_MSGR_Flashspike.png";
import rmsgrFlashspikeMod from "../assets/gears/Roving_MSGR_Flashspike_MOD.png";
import rmsgrGyro from "../assets/gears/Roving_MSGR_Gyro.png";
import rmsgrGyroMod from "../assets/gears/Roving_MSGR_Gyro_MOD.png";
import rmsgrGyroT1 from "../assets/gears/Roving_MSGR_Gyro_T1.png";
import swFlint from "../assets/gears/Swordmancer_Flint.png";
import swMicroFilter from "../assets/gears/Swordmancer_Micro_Filter.png";
import swNavBeacon from "../assets/gears/Swordmancer_NAV_Beacon.png";
import turbidCuttingTorch from "../assets/gears/Turbid_Cutting_Torch.png";
import ylKnife from "../assets/gears/Type_50_Yinglung_Knife.png";
import ylKnifeT1 from "../assets/gears/Type_50_Yinglung_Knife_T1.png";
import ylRadar from "../assets/gears/Type_50_Yinglung_Radar.png";
import aetAnalysisBand from "../assets/gears/Æthertech_Analysis_Band.png";
import aetStabilizer from "../assets/gears/Æthertech_Stabilizer.png";
import aetVisor from "../assets/gears/Æthertech_Visor.png";
import aetWatch from "../assets/gears/Æthertech_Watch.png";

// ─── Consumable/Tactical imports ────────────────────────────────────────────
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

interface GearRegistryInput {
  name: string;
  icon?: string;
  gearType: GearType;
  create: () => Gear;
}

export interface GearRegistryEntry extends RegistryEntry<Gear> {
  gearType: GearType;
  gearEffectType: GearEffectType;
}

// ─── Operators ──────────────────────────────────────────────────────────────

export const OPERATORS: RegistryEntry<Operator>[] = [
  { name: "Laevatain",      icon: laevatainIcon,      rarity: 6, create: () => new LaevatainOperator({ level: 90 }) },
  { name: "Antal",          icon: antalIcon,           rarity: 4, create: () => new AntalOperator({ level: 90 }) },
  { name: "Akekuri",        icon: akekuriIcon,         rarity: 4, create: () => new AkekuriOperator({ level: 90 }) },
  { name: "Wulfgard",       icon: wulfgardIcon,        rarity: 5, create: () => new WulfgardOperator({ level: 90 }) },
  { name: "Ardelia",        icon: ardeliaIcon,         rarity: 6, create: () => new ArdeliaOperator({ level: 90 }) },
  { name: "Endministrator", icon: endministratorIcon,  rarity: 6, create: () => new LaevatainOperator({ level: 90 }) },
  { name: "Lifeng",         icon: lifengIcon,          rarity: 6, create: () => new LaevatainOperator({ level: 90 }) },
  { name: "Rossi",          icon: rossiIcon,           rarity: 5, create: () => new LaevatainOperator({ level: 90 }) },
  { name: "Chen Qianyu",    icon: chenQianyuIcon,      rarity: 6, create: () => new LaevatainOperator({ level: 90 }) },
  { name: "Estella",        icon: estellaIcon,         rarity: 5, create: () => new LaevatainOperator({ level: 90 }) },
  { name: "Ember",          icon: emberIcon,           rarity: 6, create: () => new LaevatainOperator({ level: 90 }) },
  { name: "Snowshine",      icon: snowshineIcon,       rarity: 6, create: () => new LaevatainOperator({ level: 90 }) },
  { name: "Catcher",        icon: catcherIcon,         rarity: 4, create: () => new LaevatainOperator({ level: 90 }) },
  { name: "Gilberta",       icon: gilbertaIcon,        rarity: 6, create: () => new LaevatainOperator({ level: 90 }) },
  { name: "Xaihi",          icon: xaihiIcon,           rarity: 5, create: () => new LaevatainOperator({ level: 90 }) },
  { name: "Tangtang",       icon: tangtangIcon,        rarity: 5, create: () => new LaevatainOperator({ level: 90 }) },
  { name: "Perlica",        icon: perlicaIcon,         rarity: 5, create: () => new LaevatainOperator({ level: 90 }) },
  { name: "Fluorite",       icon: fluoriteIcon,        rarity: 5, create: () => new LaevatainOperator({ level: 90 }) },
  { name: "Last Rite",      icon: lastRiteIcon,        rarity: 6, create: () => new LaevatainOperator({ level: 90 }) },
  { name: "Yvonne",         icon: yvonneIcon,          rarity: 5, create: () => new LaevatainOperator({ level: 90 }) },
  { name: "Avywenna",       icon: avywennaIcon,        rarity: 5, create: () => new LaevatainOperator({ level: 90 }) },
  { name: "Da Pan",         icon: daPanIcon,           rarity: 4, create: () => new LaevatainOperator({ level: 90 }) },
  { name: "Pogranichnik",   icon: pogranichnikIcon,    rarity: 5, create: () => new LaevatainOperator({ level: 90 }) },
  { name: "Alesh",          icon: aleshIcon,           rarity: 4, create: () => new LaevatainOperator({ level: 90 }) },
  { name: "Arclight",       icon: arclightIcon,        rarity: 5, create: () => new LaevatainOperator({ level: 90 }) },
];

// ─── Weapons (62) ───────────────────────────────────────────────────────────

const gw = (name: string, t: WeaponType) => createWeaponFromData(name, t);

export const WEAPONS: WeaponRegistryEntry[] = [
  // Sword (17)
  { name: "Never Rest",            icon: neverRestIcon,       rarity: 6, weaponType: WeaponType.SWORD, create: () => new NeverRest({ level: 90, skillOneLevel: 1, skillTwoLevel: 1, skillThreeLevel: 1 }) },
  { name: "Thermite Cutter",       icon: thermiteCutterIcon,  rarity: 6, weaponType: WeaponType.SWORD, create: () => new ThermiteCutter({ level: 90, skillOneLevel: 1, skillTwoLevel: 1, skillThreeLevel: 1 }) },
  { name: "Forgeborn Scathe",      icon: forgebornScatheIcon, rarity: 6, weaponType: WeaponType.SWORD, create: () => new ForgebornScathe({ level: 90, skillOneLevel: 1, skillTwoLevel: 1, skillThreeLevel: 1 }) },
  { name: "Eminent Repute",        icon: eminentRepute,       rarity: 6, weaponType: WeaponType.SWORD, create: () => gw("Eminent Repute", WeaponType.SWORD) },
  { name: "Rapid Ascent",          icon: rapidAscent,         rarity: 6, weaponType: WeaponType.SWORD, create: () => gw("Rapid Ascent", WeaponType.SWORD) },
  { name: "White Night Nova",      icon: whiteNightNova,      rarity: 6, weaponType: WeaponType.SWORD, create: () => gw("White Night Nova", WeaponType.SWORD) },
  { name: "Grand Vision",          icon: grandVision,         rarity: 6, weaponType: WeaponType.SWORD, create: () => gw("Grand Vision", WeaponType.SWORD) },
  { name: "Umbral Torch",          icon: umbralTorch,         rarity: 6, weaponType: WeaponType.SWORD, create: () => gw("Umbral Torch", WeaponType.SWORD) },
  { name: "Sundering Steel",       icon: sunderingSteel,      rarity: 5, weaponType: WeaponType.SWORD, create: () => gw("Sundering Steel", WeaponType.SWORD) },
  { name: "Fortmaker",             icon: fortmaker,           rarity: 5, weaponType: WeaponType.SWORD, create: () => gw("Fortmaker", WeaponType.SWORD) },
  { name: "Aspirant",              icon: aspirant,            rarity: 5, weaponType: WeaponType.SWORD, create: () => gw("Aspirant", WeaponType.SWORD) },
  { name: "OBJ Edge of Lightness", icon: objEdgeOfLightness,  rarity: 5, weaponType: WeaponType.SWORD, create: () => new EdgeOfLightness({ level: 90, skillOneLevel: 1, skillTwoLevel: 1, skillThreeLevel: 1 }) },
  { name: "Twelve Questions",      icon: twelveQuestions,      rarity: 5, weaponType: WeaponType.SWORD, create: () => gw("Twelve Questions", WeaponType.SWORD) },
  { name: "Finchaser 3.0",         icon: finchaser,           rarity: 5, weaponType: WeaponType.SWORD, create: () => gw("Finchaser 3.0", WeaponType.SWORD) },
  { name: "Wave Tide",             icon: waveTide,            rarity: 4, weaponType: WeaponType.SWORD, create: () => gw("Wave Tide", WeaponType.SWORD) },
  { name: "Contingent Measure",    icon: contingentMeasure,   rarity: 4, weaponType: WeaponType.SWORD, create: () => gw("Contingent Measure", WeaponType.SWORD) },
  { name: "Tarr 11",               icon: tarr11,              rarity: 3, weaponType: WeaponType.SWORD, create: () => new Tarr11({ level: 90, skillOneLevel: 1, skillTwoLevel: 1 }) },
  // Great Sword (12)
  { name: "Former Finery",         icon: formerFinery,        rarity: 6, weaponType: WeaponType.GREAT_SWORD, create: () => gw("Former Finery", WeaponType.GREAT_SWORD) },
  { name: "Sundered Prince",       icon: sunderedPrince,      rarity: 6, weaponType: WeaponType.GREAT_SWORD, create: () => gw("Sundered Prince", WeaponType.GREAT_SWORD) },
  { name: "Thunderberge",          icon: thunderberge,        rarity: 6, weaponType: WeaponType.GREAT_SWORD, create: () => gw("Thunderberge", WeaponType.GREAT_SWORD) },
  { name: "Exemplar",              icon: exemplar,            rarity: 6, weaponType: WeaponType.GREAT_SWORD, create: () => gw("Exemplar", WeaponType.GREAT_SWORD) },
  { name: "Khravengger",           icon: khravengger,         rarity: 6, weaponType: WeaponType.GREAT_SWORD, create: () => gw("Khravengger", WeaponType.GREAT_SWORD) },
  { name: "OBJ Heavy Burden",      icon: objHeavyBurden,      rarity: 5, weaponType: WeaponType.GREAT_SWORD, create: () => gw("OBJ Heavy Burden", WeaponType.GREAT_SWORD) },
  { name: "Finishing Call",         icon: finishingCall,       rarity: 5, weaponType: WeaponType.GREAT_SWORD, create: () => gw("Finishing Call", WeaponType.GREAT_SWORD) },
  { name: "Ancient Canal",         icon: ancientCanal,        rarity: 5, weaponType: WeaponType.GREAT_SWORD, create: () => gw("Ancient Canal", WeaponType.GREAT_SWORD) },
  { name: "Seeker of Dark Lung",   icon: seekerOfDarkLung,    rarity: 5, weaponType: WeaponType.GREAT_SWORD, create: () => gw("Seeker of Dark Lung", WeaponType.GREAT_SWORD) },
  { name: "Industry 0.1",          icon: industry01,          rarity: 4, weaponType: WeaponType.GREAT_SWORD, create: () => gw("Industry 0.1", WeaponType.GREAT_SWORD) },
  { name: "Quencher",              icon: quencher,            rarity: 4, weaponType: WeaponType.GREAT_SWORD, create: () => gw("Quencher", WeaponType.GREAT_SWORD) },
  { name: "Darhoff 7",             icon: darhoff7,            rarity: 3, weaponType: WeaponType.GREAT_SWORD, create: () => gw("Darhoff 7", WeaponType.GREAT_SWORD) },
  // Polearm (9)
  { name: "JET",                   icon: jetIcon,             rarity: 6, weaponType: WeaponType.POLEARM, create: () => gw("JET", WeaponType.POLEARM) },
  { name: "Mountain Bearer",       icon: mountainBearer,      rarity: 6, weaponType: WeaponType.POLEARM, create: () => gw("Mountain Bearer", WeaponType.POLEARM) },
  { name: "Valiant",               icon: valiant,             rarity: 6, weaponType: WeaponType.POLEARM, create: () => gw("Valiant", WeaponType.POLEARM) },
  { name: "Cohesive Traction",     icon: cohesiveTraction,    rarity: 5, weaponType: WeaponType.POLEARM, create: () => gw("Cohesive Traction", WeaponType.POLEARM) },
  { name: "Chimeric Justice",      icon: chimericJustice,     rarity: 5, weaponType: WeaponType.POLEARM, create: () => gw("Chimeric Justice", WeaponType.POLEARM) },
  { name: "OBJ Razorhorn",         icon: objRazorhorn,        rarity: 5, weaponType: WeaponType.POLEARM, create: () => gw("OBJ Razorhorn", WeaponType.POLEARM) },
  { name: "Pathfinder's Beacon",   icon: pathfindersBeacon,   rarity: 4, weaponType: WeaponType.POLEARM, create: () => gw("Pathfinder's Beacon", WeaponType.POLEARM) },
  { name: "Aggeloslayer",          icon: aggeloslayer,        rarity: 4, weaponType: WeaponType.POLEARM, create: () => gw("Aggeloslayer", WeaponType.POLEARM) },
  { name: "Opero 77",              icon: opero77,             rarity: 3, weaponType: WeaponType.POLEARM, create: () => gw("Opero 77", WeaponType.POLEARM) },
  // Handcannon (10)
  { name: "Clannibal",             icon: clannibalIcon,       rarity: 6, weaponType: WeaponType.HANDCANNON, create: () => new Clannibal({ level: 90, skillOneLevel: 1, skillTwoLevel: 1, skillThreeLevel: 1 }) },
  { name: "Wedge",                 icon: wedgeIcon,           rarity: 6, weaponType: WeaponType.HANDCANNON, create: () => gw("Wedge", WeaponType.HANDCANNON) },
  { name: "Navigator",             icon: navigator,           rarity: 6, weaponType: WeaponType.HANDCANNON, create: () => gw("Navigator", WeaponType.HANDCANNON) },
  { name: "Artzy Tyrannical",      icon: artzyTyrannical,     rarity: 6, weaponType: WeaponType.HANDCANNON, create: () => gw("Artzy Tyrannical", WeaponType.HANDCANNON) },
  { name: "Rational Farewell",     icon: rationalFarewell,    rarity: 5, weaponType: WeaponType.HANDCANNON, create: () => gw("Rational Farewell", WeaponType.HANDCANNON) },
  { name: "Opus: The Living",      icon: opusTheLiving,       rarity: 5, weaponType: WeaponType.HANDCANNON, create: () => gw("Opus: The Living", WeaponType.HANDCANNON) },
  { name: "OBJ Velocitous",        icon: objVelocitous,       rarity: 5, weaponType: WeaponType.HANDCANNON, create: () => gw("OBJ Velocitous", WeaponType.HANDCANNON) },
  { name: "Howling Guard",         icon: howlingGuard,        rarity: 4, weaponType: WeaponType.HANDCANNON, create: () => gw("Howling Guard", WeaponType.HANDCANNON) },
  { name: "Long Road",             icon: longRoad,            rarity: 4, weaponType: WeaponType.HANDCANNON, create: () => gw("Long Road", WeaponType.HANDCANNON) },
  { name: "Peco 5",                icon: peco5,               rarity: 3, weaponType: WeaponType.HANDCANNON, create: () => gw("Peco 5", WeaponType.HANDCANNON) },
  // Arts Unit (14)
  { name: "Stanza of Memorials",   icon: stanzaIcon,          rarity: 5, weaponType: WeaponType.ARTS_UNIT, create: () => new StanzaOfMemorials({ level: 90, skillOneLevel: 1, skillTwoLevel: 1, skillThreeLevel: 1 }) },
  { name: "Dreams of the Starry Beach", icon: dreamsIcon,     rarity: 6, weaponType: WeaponType.ARTS_UNIT, create: () => new DreamsOfTheStarryBeach({ level: 90, skillOneLevel: 1, skillTwoLevel: 1, skillThreeLevel: 1 }) },
  { name: "Chivalric Virtues",     icon: chivalricVirtues,    rarity: 6, weaponType: WeaponType.ARTS_UNIT, create: () => gw("Chivalric Virtues", WeaponType.ARTS_UNIT) },
  { name: "Detonation Unit",       icon: detonationUnit,      rarity: 6, weaponType: WeaponType.ARTS_UNIT, create: () => gw("Detonation Unit", WeaponType.ARTS_UNIT) },
  { name: "Oblivion",              icon: oblivion,            rarity: 6, weaponType: WeaponType.ARTS_UNIT, create: () => gw("Oblivion", WeaponType.ARTS_UNIT) },
  { name: "Opus: Etch Figure",     icon: opusEtchFigure,      rarity: 6, weaponType: WeaponType.ARTS_UNIT, create: () => gw("Opus: Etch Figure", WeaponType.ARTS_UNIT) },
  { name: "Delivery Guaranteed",   icon: deliveryGuaranteed,  rarity: 6, weaponType: WeaponType.ARTS_UNIT, create: () => gw("Delivery Guaranteed", WeaponType.ARTS_UNIT) },
  { name: "OBJ Arts Identifier",   icon: objArtsIdentifier,   rarity: 5, weaponType: WeaponType.ARTS_UNIT, create: () => gw("OBJ Arts Identifier", WeaponType.ARTS_UNIT) },
  { name: "Freedom to Proselytize", icon: freedomToProselytize, rarity: 5, weaponType: WeaponType.ARTS_UNIT, create: () => gw("Freedom to Proselytize", WeaponType.ARTS_UNIT) },
  { name: "Wild Wanderer",         icon: wildWanderer,        rarity: 5, weaponType: WeaponType.ARTS_UNIT, create: () => gw("Wild Wanderer", WeaponType.ARTS_UNIT) },
  { name: "Monaihe",               icon: monaihe,             rarity: 5, weaponType: WeaponType.ARTS_UNIT, create: () => gw("Monaihe", WeaponType.ARTS_UNIT) },
  { name: "Fluorescent Roc",       icon: fluorescentRoc,      rarity: 4, weaponType: WeaponType.ARTS_UNIT, create: () => gw("Fluorescent Roc", WeaponType.ARTS_UNIT) },
  { name: "Hypernova Auto",        icon: hypernovaAuto,       rarity: 4, weaponType: WeaponType.ARTS_UNIT, create: () => gw("Hypernova Auto", WeaponType.ARTS_UNIT) },
  { name: "Jiminy 12",             icon: jiminy12,            rarity: 3, weaponType: WeaponType.ARTS_UNIT, create: () => gw("Jiminy 12", WeaponType.ARTS_UNIT) },
];

// ─── Gear helper ────────────────────────────────────────────────────────────

const createGenericGear = (t: GearType, e: GearEffectType = GearEffectType.NONE) =>
  new GenericGear({ gearType: t, gearEffectType: e });

const GEAR_RARITY: Partial<Record<GearEffectType, number>> = {
  [GearEffectType.AIC_HEAVY]:            2,
  [GearEffectType.AIC_LIGHT]:            2,
  [GearEffectType.ARMORED_MSGR]:         4,
  [GearEffectType.ROVING_MSGR]:          4,
  [GearEffectType.MORDVOLT_INSULATION]:  4,
  [GearEffectType.MORDVOLT_RESISTANT]:   4,
  [GearEffectType.ABURREY_LEGACY]:       4,
  [GearEffectType.CATASTROPHE]:          4,
  [GearEffectType.SWORDMANCER]:          5,
  [GearEffectType.LYNX]:                 5,
  [GearEffectType.AETHERTECH]:           5,
  [GearEffectType.BONEKRUSHA]:           5,
  [GearEffectType.PULSER_LABS]:          5,
  [GearEffectType.FRONTIERS]:            5,
  [GearEffectType.HOT_WORK]:             5,
  [GearEffectType.MI_SECURITY]:          5,
  [GearEffectType.TYPE_50_YINGLUNG]:     5,
  [GearEffectType.TIDE_SURGE]:           5,
  [GearEffectType.ETERNAL_XIRANITE]:     5,
};

type GI = GearRegistryInput;
const A = GearType.ARMOR;
const G = GearType.GLOVES;
const K = GearType.KIT;
const E = GearEffectType;

// ─── Gear (256) ─────────────────────────────────────────────────────────────

const GEARS_RAW: GI[] = [
  // ── Armor (70) ──────────────────────────────────────────────────────────────
  { name: "Aburrey Heavy Armor",           icon: aHeavyArmor,          gearType: A, create: () => new AburreyHeavyArmor() },
  { name: "Aburrey Heavy Armor T1",        icon: aHeavyArmorT1,        gearType: A, create: () => new AburreyHeavyArmorT1() },
  { name: "Aburrey Light Armor",           icon: aLightArmor,          gearType: A, create: () => new AburreyLightArmor() },
  { name: "Aburrey Light Armor T1",        icon: aLightArmorT1,        gearType: A, create: () => new AburreyLightArmorT1() },
  { name: "AIC Heavy Armor",              icon: aicHeavyArmor,         gearType: A, create: () => new AicHeavyArmor() },
  { name: "AIC Light Armor",              icon: aicLightArmor,         gearType: A, create: () => new AicLightArmor() },
  { name: "Armored MSGR Jacket",          icon: amsgrJacket,           gearType: A, create: () => new ArmoredMsgrJacket() },
  { name: "Armored MSGR Jacket MOD",      icon: amsgrJacketMod,        gearType: A, create: () => new ArmoredMsgrJacketMod() },
  { name: "Armored MSGR Jacket T1",       icon: amsgrJacketT1,         gearType: A, create: () => new ArmoredMsgrJacketT1() },
  { name: "Basic Armor",                  icon: basicArmor,            gearType: A, create: () => createGenericGear(A) },
  { name: "Basic PPE",                    icon: basicPPE,              gearType: A, create: () => createGenericGear(A) },
  { name: "Bonekrusha Heavy Armor",       icon: bkHeavyArmor,          gearType: A, create: () => new BonekrushaHeavyArmor() },
  { name: "Bonekrusha Heavy Armor T1",    icon: bkHeavyArmorT1,        gearType: A, create: () => new BonekrushaHeavyArmorT1() },
  { name: "Bonekrusha Heavy Armor T2",    icon: bkHeavyArmorT1,        gearType: A, create: () => new BonekrushaHeavyArmorT2() },
  { name: "Bonekrusha Poncho",            icon: bkPoncho,              gearType: A, create: () => new BonekrushaPoncho() },
  { name: "Bonekrusha Poncho MOD",        icon: bkPonchoMod,           gearType: A, create: () => new BonekrushaPonchoMod() },
  { name: "Bonekrusha Poncho T1",         icon: bkPonchoT1,            gearType: A, create: () => new BonekrushaPonchoT1() },
  { name: "Catastrophe Heavy Armor",      icon: catHeavyArmor,         gearType: A, create: () => new CatastropheHeavyArmor() },
  { name: "Catastrophe Heavy Armor T1",   icon: catHeavyArmorT1,       gearType: A, create: () => new CatastropheHeavyArmorT1() },
  { name: "Eternal Xiranite Armor",       icon: exArmor,               gearType: A, create: () => new EternalXiraniteArmor() },
  { name: "Frontier-Smart Armor",         icon: fsArmor,               gearType: A, create: () => createGenericGear(A) },
  { name: "Frontier-Smart Armor MOD",     icon: fsArmorMod,            gearType: A, create: () => createGenericGear(A) },
  { name: "Frontiers Armor",              icon: frArmor,               gearType: A, create: () => new FrontiersArmor() },
  { name: "Frontiers Armor MOD",          icon: frArmorMod,            gearType: A, create: () => new FrontiersArmorMod() },
  { name: "Frontiers Armor T1",           icon: frArmorT1,             gearType: A, create: () => new FrontiersArmorT1() },
  { name: "Frontiers Armor T2",           icon: frArmorT2,             gearType: A, create: () => new FrontiersArmorT2() },
  { name: "Frontiers Armor T3",           icon: frArmorT3,             gearType: A, create: () => new FrontiersArmorT3() },
  { name: "Frontiers Protection Suit",   icon: frArmorT1,             gearType: A, create: () => new FrontiersProtectionSuit() },
  { name: "Hot Work Exo-Rig",             icon: hwExoRig,              gearType: A, create: () => createGenericGear(A, E.HOT_WORK) },
  { name: "Hot Work Exoskeleton",         icon: hotWorkExoskeletonIcon, gearType: A, create: () => new HotWorkExoskeleton() },
  { name: "LYNX Cuirass",                 icon: lynxCuirass,           gearType: A, create: () => new LynxCuirass() },
  { name: "LYNX Cuirass MOD",             icon: lynxCuirassMod,        gearType: A, create: () => new LynxCuirassMod() },
  { name: "LYNX Heavy Armor",             icon: lynxHeavyArmor,        gearType: A, create: () => new LynxHeavyArmor() },
  { name: "MI Security Armor",            icon: miArmor,               gearType: A, create: () => new MiSecurityArmor() },
  { name: "MI Security Armor MOD",        icon: miArmorMod,            gearType: A, create: () => new MiSecurityArmorMod() },
  { name: "MI Security Overalls",         icon: miOveralls,            gearType: A, create: () => new MiSecurityOveralls() },
  { name: "MI Security Overalls MOD",     icon: miOverallsMod,         gearType: A, create: () => new MiSecurityOverallsMod() },
  { name: "MI Security Overalls T1",      icon: miOverallsT1,          gearType: A, create: () => new MiSecurityOverallsT1() },
  { name: "MI Security Overalls T2",      icon: miOverallsT2,          gearType: A, create: () => new MiSecurityOverallsT2() },
  { name: "Miner Armor",                  icon: minerArmor,            gearType: A, create: () => createGenericGear(A) },
  { name: "Miner Armor T1",               icon: minerArmorT1,          gearType: A, create: () => createGenericGear(A) },
  { name: "Miner Armor T2",               icon: minerArmorT2,          gearType: A, create: () => createGenericGear(A) },
  { name: "Miner Armor T4",               icon: minerArmorT4,          gearType: A, create: () => createGenericGear(A) },
  { name: "Miner Cleansuit",              icon: minerCleansuit,        gearType: A, create: () => createGenericGear(A) },
  { name: "Miner Overalls",               icon: minerOveralls,         gearType: A, create: () => createGenericGear(A) },
  { name: "Miner Overalls T1",            icon: minerOverallsT1,       gearType: A, create: () => createGenericGear(A) },
  { name: "Miner Overalls T2",            icon: minerOverallsT2,       gearType: A, create: () => createGenericGear(A) },
  { name: "Miner Overalls T4",            icon: minerOverallsT4,       gearType: A, create: () => createGenericGear(A) },
  { name: "Miner PPE T2",                 icon: minerPpeT2,            gearType: A, create: () => createGenericGear(A) },
  { name: "Miner Vest",                   icon: minerVest,             gearType: A, create: () => createGenericGear(A) },
  { name: "Miner Vest T2",                icon: minerVestT2,           gearType: A, create: () => createGenericGear(A) },
  { name: "Mordvolt Insulation Vest",     icon: mvInsVest,             gearType: A, create: () => new MordvoltInsulationVest() },
  { name: "Mordvolt Insulation Vest MOD", icon: mvInsVestMod,          gearType: A, create: () => new MordvoltInsulationVestMod() },
  { name: "Mordvolt Insulation Vest T1",  icon: mvInsVestT1,           gearType: A, create: () => new MordvoltInsulationVestT1() },
  { name: "Mordvolt Insulation Vest T2",  icon: mvInsVestT2,           gearType: A, create: () => new MordvoltInsulationVestT2() },
  { name: "Mordvolt Resistant Vest",      icon: mvResVest,             gearType: A, create: () => new MordvoltResistantVest() },
  { name: "Mordvolt Resistant Vest MOD",  icon: mvResVestMod,          gearType: A, create: () => new MordvoltResistantVestMod() },
  { name: "Mordvolt Resistant Vest T1",   icon: mvResVestT1,           gearType: A, create: () => new MordvoltResistantVestT1() },
  { name: "Prototype Heavy Armor",        icon: protoHeavy,            gearType: A, create: () => createGenericGear(A) },
  { name: "Prototype Heavy Armor T1",     icon: protoHeavyT1,          gearType: A, create: () => createGenericGear(A) },
  { name: "Pulser Labs Disruptor Suit",   icon: plDisruptorSuit,       gearType: A, create: () => new PulserLabsDisruptorSuit() },
  { name: "Redeemer Armor",               icon: redeemerArmor,         gearType: A, create: () => createGenericGear(A) },
  { name: "Redeemer Plates",              icon: redeemerPlates,        gearType: A, create: () => createGenericGear(A) },
  { name: "Roving MSGR Jacket",           icon: rmsgrJacket,           gearType: A, create: () => new RovingMsgrJacket() },
  { name: "Roving MSGR Jacket MOD",       icon: rmsgrJacketMod,        gearType: A, create: () => new RovingMsgrJacketMod() },
  { name: "Roving MSGR Jacket T1",        icon: rmsgrJacketT1,         gearType: A, create: () => new RovingMsgrJacketT1() },
  { name: "Swordmancer Heavy Armor",      icon: swHeavyArmor,          gearType: A, create: () => new SwordmancerHeavyArmor() },
  { name: "Swordmancer Light Armor",      icon: swLightArmor,          gearType: A, create: () => new SwordmancerLightArmor() },
  { name: "Tide Fall Light Armor",        icon: tfLightArmor,          gearType: A, create: () => new TideFallLightArmor() },
  { name: "Type 50 Yinglung Heavy Armor", icon: ylHeavyArmor,          gearType: A, create: () => new Type50YinglungHeavyArmor() },
  { name: "Type 50 Yinglung Heavy Armor T1", icon: ylHeavyArmor,    gearType: A, create: () => new Type50YinglungHeavyArmorT1() },
  { name: "Type 50 Yinglung Heavy Armor T2", icon: ylHeavyArmor,    gearType: A, create: () => new Type50YinglungHeavyArmorT2() },
  { name: "Type 50 Yinglung Light Armor", icon: ylLightArmor,          gearType: A, create: () => new Type50YinglungLightArmor() },
  { name: "Æthertech Plating",            icon: aetPlating,            gearType: A, create: () => new AethertechPlating() },

  // ── Gloves (62) ─────────────────────────────────────────────────────────────
  { name: "Aburrey Gauntlets",               icon: aGauntlets,         gearType: G, create: () => new AburreyGauntlets() },
  { name: "AIC Gauntlets",                   icon: aicGauntlets,       gearType: G, create: () => new AicGauntlets() },
  { name: "AIC Tactical Gloves",             icon: aicTacGloves,       gearType: G, create: () => new AicTacticalGloves() },
  { name: "Armored MSGR Gloves",             icon: amsgrGloves,        gearType: G, create: () => new ArmoredMsgrGloves() },
  { name: "Armored MSGR Gloves MOD",         icon: amsgrGlovesMod,     gearType: G, create: () => new ArmoredMsgrGlovesMod() },
  { name: "Armored MSGR Gloves T1",          icon: amsgrGlovesT1,      gearType: G, create: () => new ArmoredMsgrGlovesT1() },
  { name: "Armored MSGR Gloves T2",          icon: amsgrGlovesT2,      gearType: G, create: () => new ArmoredMsgrGlovesT2() },
  { name: "Basic Gauntlets",                 icon: basicGauntlets,     gearType: G, create: () => createGenericGear(G) },
  { name: "Basic Gloves",                    icon: basicGloves,        gearType: G, create: () => createGenericGear(G) },
  { name: "Bonekrusha Wristband",            icon: bkWristband,        gearType: G, create: () => new BonekrushaWristband() },
  { name: "Bonekrusha Wristband MOD",        icon: bkWristbandMod,     gearType: G, create: () => new BonekrushaWristbandMod() },
  { name: "Catastrophe Gloves",              icon: catGloves,          gearType: G, create: () => new CatastropheGloves() },
  { name: "Eternal Xiranite Gloves",         icon: exGloves,           gearType: G, create: () => new EternalXiraniteGloves() },
  { name: "Eternal Xiranite Gloves T1",      icon: exGlovesT1,         gearType: G, create: () => new EternalXiraniteGlovesT1() },
  { name: "Frontiers Blight RES Gloves",     icon: frBlightGloves,     gearType: G, create: () => new FrontiersBlightResGloves() },
  { name: "Frontiers Blight RES Gloves MOD", icon: frBlightGlovesMod,  gearType: G, create: () => new FrontiersBlightResGlovesMod() },
  { name: "Frontiers Fiber Gloves",          icon: frFiberGloves,      gearType: G, create: () => new FrontiersFiberGloves() },
  { name: "Frontiers Fiber Gloves MOD",      icon: frFiberGlovesMod,   gearType: G, create: () => new FrontiersFiberGlovesMod() },
  { name: "Hot Work Gauntlets",              icon: hotWorkGauntletsIcon, gearType: G, create: () => new HotWorkGauntlets() },
  { name: "Hot Work Gauntlets T1",           icon: hotWorkGauntletsT1Icon, gearType: G, create: () => new HotWorkGauntletsT1() },
  { name: "Hot Work Gloves",                 icon: hwGloves,           gearType: G, create: () => createGenericGear(G, E.HOT_WORK) },
  { name: "LYNX Gauntlets",                  icon: lynxGauntlets,      gearType: G, create: () => new LynxGauntlets() },
  { name: "LYNX Gloves",                     icon: lynxGloves,         gearType: G, create: () => new LynxGloves() },
  { name: "LYNX Gloves MOD",                 icon: lynxGlovesMod,      gearType: G, create: () => new LynxGlovesMod() },
  { name: "MI Security Gloves",              icon: miGloves,           gearType: G, create: () => new MiSecurityGloves() },
  { name: "MI Security Gloves MOD",          icon: miGlovesMod,        gearType: G, create: () => new MiSecurityGlovesMod() },
  { name: "MI Security Hands PPE",           icon: miHandsPpe,         gearType: G, create: () => new MiSecurityHandsPpe() },
  { name: "MI Security Hands PPE MOD",       icon: miHandsPpeMod,      gearType: G, create: () => new MiSecurityHandsPpeMod() },
  { name: "MI Security Hands PPE T1",        icon: miHandsPpeT1,       gearType: G, create: () => new MiSecurityHandsPpeT1() },
  { name: "Miner Fists",                     icon: minerFists,         gearType: G, create: () => createGenericGear(G) },
  { name: "Miner Fists T1",                  icon: minerFistsT1,       gearType: G, create: () => createGenericGear(G) },
  { name: "Miner Fists T2",                  icon: minerFistsT2,       gearType: G, create: () => createGenericGear(G) },
  { name: "Miner Fists T4",                  icon: minerFistsT4,       gearType: G, create: () => createGenericGear(G) },
  { name: "Miner Gauntlets",                 icon: minerGauntlets,     gearType: G, create: () => createGenericGear(G) },
  { name: "Miner Gauntlets T1",              icon: minerGauntletsT1,   gearType: G, create: () => createGenericGear(G) },
  { name: "Miner Gauntlets T2",              icon: minerGauntletsT2,   gearType: G, create: () => createGenericGear(G) },
  { name: "Miner Gauntlets T3",              icon: minerGauntletsT3,   gearType: G, create: () => createGenericGear(G) },
  { name: "Miner Gauntlets T4",              icon: minerGauntletsT4,   gearType: G, create: () => createGenericGear(G) },
  { name: "Miner Gloves",                    icon: minerGloves,        gearType: G, create: () => createGenericGear(G) },
  { name: "Miner Gloves T1",                 icon: minerGlovesT1,      gearType: G, create: () => createGenericGear(G) },
  { name: "Miner Gloves T2",                 icon: minerGlovesT2,      gearType: G, create: () => createGenericGear(G) },
  { name: "Miner Gloves T3",                 icon: minerGlovesT3,      gearType: G, create: () => createGenericGear(G) },
  { name: "Miner Wrists",                    icon: minerWrists,        gearType: G, create: () => createGenericGear(G) },
  { name: "Miner Wrists T2",                 icon: minerWristsT2,      gearType: G, create: () => createGenericGear(G) },
  { name: "Mordvolt Insulation Gloves",      icon: mvInsGloves,        gearType: G, create: () => new MordvoltInsulationGloves() },
  { name: "Mordvolt Insulation Gloves MOD",  icon: mvInsGlovesMod,     gearType: G, create: () => new MordvoltInsulationGlovesMod() },
  { name: "Mordvolt Insulation Gloves T1",   icon: mvInsGlovesT1,      gearType: G, create: () => new MordvoltInsulationGlovesT1() },
  { name: "Mordvolt Resistant Gloves",       icon: mvResGloves,        gearType: G, create: () => new MordvoltResistantGloves() },
  { name: "Mordvolt Resistant Gloves MOD",   icon: mvResGlovesMod,     gearType: G, create: () => new MordvoltResistantGlovesMod() },
  { name: "Mordvolt Resistant Gloves T1",    icon: mvResGlovesT1,      gearType: G, create: () => new MordvoltResistantGlovesT1() },
  { name: "Pulser Labs Gloves",              icon: plGloves,           gearType: G, create: () => new PulserLabsGloves() },
  { name: "Redeemer Gloves DEX",             icon: redGlovesDex,       gearType: G, create: () => createGenericGear(G) },
  { name: "Redeemer Hands",                  icon: redGlovesForce,     gearType: G, create: () => new RedeemerHands() },
  { name: "Redeemer Gloves FORCE",           icon: redGlovesForce,     gearType: G, create: () => createGenericGear(G) },
  { name: "Roving MSGR Fists",              icon: rmsgrFists,          gearType: G, create: () => new RovingMsgrFists() },
  { name: "Roving MSGR Fists MOD",          icon: rmsgrFistsMod,       gearType: G, create: () => new RovingMsgrFistsMod() },
  { name: "Roving MSGR Fists T1",           icon: rmsgrFistsT1,        gearType: G, create: () => new RovingMsgrFistsT1() },
  { name: "Swordmancer TAC Fists",          icon: swTacFists,          gearType: G, create: () => new SwordmancerTacFists() },
  { name: "Swordmancer TAC Gauntlets",      icon: swTacGauntlets,      gearType: G, create: () => new SwordmancerTacGauntlets() },
  { name: "Swordmancer TAC Gloves",         icon: swTacGauntlets,      gearType: G, create: () => new SwordmancerTacGloves() },
  { name: "Tide Surge Gauntlets",            icon: tsGauntlets,         gearType: G, create: () => new TideSurgeGauntlets() },
  { name: "Type 50 Yinglung Gloves",        icon: ylGloves,            gearType: G, create: () => new Type50YinglungGloves() },
  { name: "Type 50 Yinglung Gloves T1",     icon: ylGlovesT1,          gearType: G, create: () => new Type50YinglungGlovesT1() },
  { name: "Æthertech Gloves",               icon: aetGloves,           gearType: G, create: () => new AethertechGloves() },
  { name: "Æthertech Light Gloves",          icon: aetGloves,           gearType: G, create: () => new AethertechLightGloves() },

  // ── Kit (124) ───────────────────────────────────────────────────────────────
  { name: "Aburrey Auditory Chip",       icon: aAuditoryChip,       gearType: K, create: () => new AburreyAuditoryChip() },
  { name: "Aburrey Auditory Chip T1",    icon: aAuditoryChipT1,     gearType: K, create: () => new AburreyAuditoryChipT1() },
  { name: "Aburrey Flashlight",          icon: aFlashlight,          gearType: K, create: () => new AburreyFlashlight() },
  { name: "Aburrey Sensor Chip",         icon: aSensorChip,          gearType: K, create: () => new AburreySensorChip() },
  { name: "Aburrey Sensor Chip T1",      icon: aSensorChipT1,        gearType: K, create: () => new AburreySensorChipT1() },
  { name: "Aburrey UV Lamp",             icon: aUvLamp,              gearType: K, create: () => new AburreyUvLamp() },
  { name: "AIC Alloy Plate",             icon: aicAlloyPlate,        gearType: K, create: () => new AicAlloyPlate() },
  { name: "AIC Ceramic Plate",           icon: aicCeramicPlate,      gearType: K, create: () => new AicCeramicPlate() },
  { name: "AIC Heavy Plate",             icon: aicHeavyPlate,        gearType: K, create: () => new AicHeavyPlate() },
  { name: "AIC Light Plate",             icon: aicLightPlate,        gearType: K, create: () => new AicLightPlate() },
  { name: "Armored MSGR Flashlight",     icon: amsgrFlashlight,      gearType: K, create: () => new ArmoredMsgrFlashlight() },
  { name: "Armored MSGR Flashlight T1",  icon: amsgrFlashlightT1,    gearType: K, create: () => new ArmoredMsgrFlashlightT1() },
  { name: "Armored MSGR Flashspike",     icon: amsgrFlashspike,      gearType: K, create: () => new ArmoredMsgrFlashspike() },
  { name: "Armored MSGR Flashspike MOD", icon: amsgrFlashspikeMod,   gearType: K, create: () => new ArmoredMsgrFlashspikeMod() },
  { name: "Armored MSGR Gyro",           icon: amsgrGyro,            gearType: K, create: () => new ArmoredMsgrGyro() },
  { name: "Armored MSGR Gyro MOD",       icon: amsgrGyroMod,         gearType: K, create: () => new ArmoredMsgrGyroMod() },
  { name: "Armored MSGR Gyro T1",        icon: amsgrGyroT1,          gearType: K, create: () => new ArmoredMsgrGyroT1() },
  { name: "Bonekrusha Figurine",         icon: bkFigurine,           gearType: K, create: () => new BonekrushaFigurine() },
  { name: "Bonekrusha Figurine MOD",     icon: bkFigurineMod,        gearType: K, create: () => new BonekrushaFigurineMod() },
  { name: "Bonekrusha Figurine T1",      icon: bkFigurineT1,         gearType: K, create: () => new BonekrushaFigurineT1() },
  { name: "Bonekrusha Mask",             icon: bkMask,               gearType: K, create: () => new BonekrushaMask() },
  { name: "Bonekrusha Mask MOD",         icon: bkMaskMod,            gearType: K, create: () => new BonekrushaMaskMod() },
  { name: "Bonekrusha Mask T1",          icon: bkMaskT1,             gearType: K, create: () => new BonekrushaMaskT1() },
  { name: "Bonekrusha Mask T2",          icon: bkMaskT1,             gearType: K, create: () => new BonekrushaMaskT2() },
  { name: "Catastrophe Filter",          icon: catFilter,            gearType: K, create: () => new CatastropheFilter() },
  { name: "Catastrophe Gauze Cartridge", icon: catGauze,             gearType: K, create: () => new CatastropheGauzeCartridge() },
  { name: "Catastrophe Gauze Cartridge T1", icon: catGauzeT1,        gearType: K, create: () => new CatastropheGauzeCartridgeT1() },
  { name: "Emergency Comm",              icon: emergencyComm,        gearType: K, create: () => createGenericGear(K) },
  { name: "Emergency Compression Core",  icon: emergencyCore,        gearType: K, create: () => createGenericGear(K) },
  { name: "Eternal Xiranite Auxiliary Arm", icon: exAuxArm,          gearType: K, create: () => new EternalXiraniteAuxiliaryArm() },
  { name: "Eternal Xiranite Power Core", icon: exPowerCore,          gearType: K, create: () => new EternalXiranitePowerCore() },
  { name: "Eternal Xiranite Power Core T1", icon: exPowerCoreT1,    gearType: K, create: () => new EternalXiranitePowerCoreT1() },
  { name: "Frontiers Analyzer",          icon: frAnalyzer,           gearType: K, create: () => new FrontiersAnalyzer() },
  { name: "Frontiers Analyzer MOD",      icon: frAnalyzerMod,        gearType: K, create: () => new FrontiersAnalyzerMod() },
  { name: "Frontiers Comm",              icon: frComm,               gearType: K, create: () => new FrontiersComm() },
  { name: "Frontiers Comm MOD",          icon: frCommMod,            gearType: K, create: () => new FrontiersCommMod() },
  { name: "Frontiers Comm T1",           icon: frCommT1,             gearType: K, create: () => new FrontiersCommT1() },
  { name: "Frontiers Extra O2 Tube",     icon: frExtraO2,            gearType: K, create: () => new FrontiersExtraO2Tube() },
  { name: "Frontiers O2 Tether",         icon: frO2Tether,           gearType: K, create: () => new FrontiersO2Tether() },
  { name: "Frontiers O2 Tether MOD",     icon: frO2TetherMod,        gearType: K, create: () => new FrontiersO2TetherMod() },
  { name: "Hanging River O2 Tube",       icon: hangingRiverO2,       gearType: K, create: () => createGenericGear(K) },
  { name: "Hot Work HPD",                icon: hwHpd,                gearType: K, create: () => createGenericGear(K, E.HOT_WORK) },
  { name: "Hot Work Power Bank",         icon: hotWorkPowerBankIcon, gearType: K, create: () => new HotWorkPowerBank() },
  { name: "Hot Work Power Cartridge",    icon: hotWorkPowerCartridgeIcon, gearType: K, create: () => new HotWorkPowerCartridge() },
  { name: "Hot Work Pyrometer",          icon: hotWorkPyrometerIcon, gearType: K, create: () => new HotWorkPyrometer() },
  { name: "LYNX Aegis Injector",         icon: lynxAegis,            gearType: K, create: () => new LynxAegisInjector() },
  { name: "LYNX Aegis Injector MOD",     icon: lynxAegisMod,         gearType: K, create: () => new LynxAegisInjectorMod() },
  { name: "LYNX Connector",              icon: lynxConnector,        gearType: K, create: () => new LynxConnector() },
  { name: "LYNX Connector MOD",          icon: lynxConnectorMod,     gearType: K, create: () => new LynxConnectorMod() },
  { name: "LYNX Connector T1",           icon: lynxConnectorT1,      gearType: K, create: () => new LynxConnectorT1() },
  { name: "LYNX Connector T2",           icon: lynxConnectorT1,      gearType: K, create: () => new LynxConnectorT2() },
  { name: "LYNX Slab",                   icon: lynxSlab,             gearType: K, create: () => new LynxSlab() },
  { name: "LYNX Slab MOD",               icon: lynxSlabMod,          gearType: K, create: () => new LynxSlabMod() },
  { name: "MI Security Armband",         icon: miArmband,            gearType: K, create: () => new MiSecurityArmband() },
  { name: "MI Security Push Knife",      icon: miPushKnife,          gearType: K, create: () => new MiSecurityPushKnife() },
  { name: "MI Security Push Knife MOD",  icon: miPushKnifeMod,       gearType: K, create: () => new MiSecurityPushKnifeMod() },
  { name: "MI Security Push Knife T1",   icon: miPushKnifeT1,        gearType: K, create: () => new MiSecurityPushKnifeT1() },
  { name: "MI Security Scope",           icon: miScope,              gearType: K, create: () => new MiSecurityScope() },
  { name: "MI Security Scope MOD",       icon: miScopeMod,           gearType: K, create: () => new MiSecurityScopeMod() },
  { name: "MI Security Toolkit",         icon: miToolkit,            gearType: K, create: () => new MiSecurityToolkit() },
  { name: "MI Security Toolkit MOD",     icon: miToolkitMod,         gearType: K, create: () => new MiSecurityToolkitMod() },
  { name: "MI Security Visor",           icon: miVisor,              gearType: K, create: () => new MiSecurityVisor() },
  { name: "MI Security Visor MOD",       icon: miVisorMod,           gearType: K, create: () => new MiSecurityVisorMod() },
  { name: "Miner Comm",                  icon: minerComm,            gearType: K, create: () => createGenericGear(K) },
  { name: "Miner Comm T1",               icon: minerCommT1,          gearType: K, create: () => createGenericGear(K) },
  { name: "Miner Comm T2",               icon: minerCommT2,          gearType: K, create: () => createGenericGear(K) },
  { name: "Miner Comm T3",               icon: minerCommT3,          gearType: K, create: () => createGenericGear(K) },
  { name: "Miner Comm T4",               icon: minerCommT4,          gearType: K, create: () => createGenericGear(K) },
  { name: "Miner Compression Core",      icon: minerCompCore,        gearType: K, create: () => createGenericGear(K) },
  { name: "Miner Compression Core T1",   icon: minerCompCoreT1,      gearType: K, create: () => createGenericGear(K) },
  { name: "Miner Compression Core T2",   icon: minerCompCoreT2,      gearType: K, create: () => createGenericGear(K) },
  { name: "Miner Compression Core T3",   icon: minerCompCoreT3,      gearType: K, create: () => createGenericGear(K) },
  { name: "Miner Compression Core T4",   icon: minerCompCoreT4,      gearType: K, create: () => createGenericGear(K) },
  { name: "Miner Drive Wheel",           icon: minerDriveWheel,      gearType: K, create: () => createGenericGear(K) },
  { name: "Miner Drive Wheel T1",        icon: minerDriveWheelT1,    gearType: K, create: () => createGenericGear(K) },
  { name: "Miner Drive Wheel T2",        icon: minerDriveWheelT2,    gearType: K, create: () => createGenericGear(K) },
  { name: "Miner Drive Wheel T3",        icon: minerDriveWheelT3,    gearType: K, create: () => createGenericGear(K) },
  { name: "Miner Drive Wheel T4",        icon: minerDriveWheelT4,    gearType: K, create: () => createGenericGear(K) },
  { name: "Miner Drive Wheel T5",        icon: minerDriveWheelT5,    gearType: K, create: () => createGenericGear(K) },
  { name: "Miner Turbine",               icon: minerTurbine,         gearType: K, create: () => createGenericGear(K) },
  { name: "Miner Turbine T1",            icon: minerTurbineT1,       gearType: K, create: () => createGenericGear(K) },
  { name: "Miner Turbine T2",            icon: minerTurbineT2,       gearType: K, create: () => createGenericGear(K) },
  { name: "Miner Turbine T3",            icon: minerTurbineT3,       gearType: K, create: () => createGenericGear(K) },
  { name: "Miner Turbine T4",            icon: minerTurbineT4,       gearType: K, create: () => createGenericGear(K) },
  { name: "Miner Turbine T5",            icon: minerTurbineT5,       gearType: K, create: () => createGenericGear(K) },
  { name: "Mordvolt Insulation Battery",      icon: mvInsBattery,     gearType: K, create: () => new MordvoltInsulationBattery() },
  { name: "Mordvolt Insulation Battery MOD",  icon: mvInsBatteryMod,  gearType: K, create: () => new MordvoltInsulationBatteryMod() },
  { name: "Mordvolt Insulation Battery T1",   icon: mvInsBatteryT1,   gearType: K, create: () => new MordvoltInsulationBatteryT1() },
  { name: "Mordvolt Insulation Wrench",       icon: mvInsWrench,      gearType: K, create: () => new MordvoltInsulationWrench() },
  { name: "Mordvolt Insulation Wrench MOD",   icon: mvInsWrenchMod,   gearType: K, create: () => new MordvoltInsulationWrenchMod() },
  { name: "Mordvolt Insulation Wrench T1",    icon: mvInsWrenchT1,    gearType: K, create: () => new MordvoltInsulationWrenchT1() },
  { name: "Mordvolt Insulation Wrench T2",    icon: mvInsWrenchT2,    gearType: K, create: () => new MordvoltInsulationWrenchT2() },
  { name: "Mordvolt Resistant Battery",       icon: mvResBattery,     gearType: K, create: () => new MordvoltResistantBattery() },
  { name: "Mordvolt Resistant Battery MOD",   icon: mvResBatteryMod,  gearType: K, create: () => new MordvoltResistantBatteryMod() },
  { name: "Mordvolt Resistant Battery T1",    icon: mvResBatteryT1,   gearType: K, create: () => new MordvoltResistantBatteryT1() },
  { name: "Mordvolt Resistant Wrench",        icon: mvResWrench,      gearType: K, create: () => new MordvoltResistantWrench() },
  { name: "Mordvolt Resistant Wrench MOD",    icon: mvResWrenchMod,   gearType: K, create: () => new MordvoltResistantWrenchMod() },
  { name: "Mordvolt Resistant Wrench T1",     icon: mvResWrenchT1,    gearType: K, create: () => new MordvoltResistantWrenchT1() },
  { name: "Obsolete Comm",               icon: obsoleteComm,         gearType: K, create: () => createGenericGear(K) },
  { name: "Obsolete Compression Core",   icon: obsoleteCore,         gearType: K, create: () => createGenericGear(K) },
  { name: "Pulser Labs Calibrator",      icon: plCalibrator,         gearType: K, create: () => new PulserLabsCalibrator() },
  { name: "Pulser Labs Invasion Core",   icon: plInvasionCore,       gearType: K, create: () => new PulserLabsInvasionCore() },
  { name: "Pulser Labs Probe",           icon: plProbe,              gearType: K, create: () => new PulserLabsProbe() },
  { name: "Redeemer Seal",               icon: redSeal,              gearType: K, create: () => new RedeemerSeal() },
  { name: "Redeemer Seal T1",            icon: redSealT1,            gearType: K, create: () => new RedeemerSealT1() },
  { name: "Redeemer Tag",                icon: redTag,               gearType: K, create: () => new RedeemerTag() },
  { name: "Redeemer Tag T1",             icon: redTagT1,             gearType: K, create: () => new RedeemerTagT1() },
  { name: "Roving MSGR Flashlight",      icon: rmsgrFlashlight,      gearType: K, create: () => new RovingMsgrFlashlight() },
  { name: "Roving MSGR Flashlight T1",   icon: rmsgrFlashlightT1,    gearType: K, create: () => new RovingMsgrFlashlightT1() },
  { name: "Roving MSGR Flashlight T2",   icon: rmsgrFlashlightT2,    gearType: K, create: () => new RovingMsgrFlashlightT2() },
  { name: "Roving MSGR Flashspike",      icon: rmsgrFlashspike,      gearType: K, create: () => new RovingMsgrFlashspike() },
  { name: "Roving MSGR Flashspike MOD",  icon: rmsgrFlashspikeMod,   gearType: K, create: () => new RovingMsgrFlashspikeMod() },
  { name: "Roving MSGR Gyro",            icon: rmsgrGyro,            gearType: K, create: () => new RovingMsgrGyro() },
  { name: "Roving MSGR Gyro MOD",        icon: rmsgrGyroMod,         gearType: K, create: () => new RovingMsgrGyroMod() },
  { name: "Roving MSGR Gyro T1",         icon: rmsgrGyroT1,          gearType: K, create: () => new RovingMsgrGyroT1() },
  { name: "Swordmancer Flint",           icon: swFlint,              gearType: K, create: () => new SwordmancerFlint() },
  { name: "Swordmancer Micro Filter",    icon: swMicroFilter,        gearType: K, create: () => new SwordmancerMicroFilter() },
  { name: "Swordmancer NAV Beacon",      icon: swNavBeacon,          gearType: K, create: () => new SwordmancerNavBeacon() },
  { name: "Turbid Cutting Torch",        icon: turbidCuttingTorch,   gearType: K, create: () => createGenericGear(K) },
  { name: "Type 50 Yinglung Knife",      icon: ylKnife,              gearType: K, create: () => new Type50YinglungKnife() },
  { name: "Type 50 Yinglung Knife T1",   icon: ylKnifeT1,            gearType: K, create: () => new Type50YinglungKnifeT1() },
  { name: "Type 50 Yinglung Radar",      icon: ylRadar,              gearType: K, create: () => new Type50YinglungRadar() },
  { name: "Type 50 Yinglung Radar T2",  icon: ylRadar,              gearType: K, create: () => new Type50YinglungRadarT2() },
  { name: "Æthertech Analysis Band",     icon: aetAnalysisBand,      gearType: K, create: () => new AethertechAnalysisBand() },
  { name: "Æthertech Stabilizer",        icon: aetStabilizer,        gearType: K, create: () => new AethertechStabilizer() },
  { name: "Æthertech Stabilizer T1",    icon: aetStabilizer,        gearType: K, create: () => new AethertechStabilizerT1() },
  { name: "Æthertech Visor",             icon: aetVisor,             gearType: K, create: () => new AethertechVisor() },
  { name: "Æthertech Watch",             icon: aetWatch,             gearType: K, create: () => new AethertechWatch() },
];

/** Derive rarity from the gear instance's GearEffectType. */
function gearRarity(entry: GI): GearRegistryEntry {
  const instance = entry.create();
  const r = GEAR_RARITY[instance.gearEffectType] ?? 3;
  return { ...entry, rarity: r, gearEffectType: instance.gearEffectType };
}

export const GEARS: GearRegistryEntry[] = GEARS_RAW.map(gearRarity);
export const ARMORS = GEARS.filter((g) => g.gearType === GearType.ARMOR);
export const GLOVES = GEARS.filter((g) => g.gearType === GearType.GLOVES);
export const KITS   = GEARS.filter((g) => g.gearType === GearType.KIT);

// ─── Consumables & Tacticals ────────────────────────────────────────────────

export const CONSUMABLES: RegistryEntry<Consumable>[] = [
  { name: "Ginseng Meat Stew", icon: ginsengMeatStewIcon, rarity: 3, create: () => new GinsengMeatStew() },
  { name: "Perplexing Medication", icon: perplexingMedicationIcon, rarity: 4, create: () => new PerplexingMedication() },
];

export const TACTICALS: RegistryEntry<Tactical>[] = [
  { name: "Stew Meeting", icon: stewMeetingIcon, rarity: 3, create: () => new StewMeeting() },
];
