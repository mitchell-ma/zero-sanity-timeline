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
import { GenericWeapon } from "../model/weapons/genericWeapon";
import { Gear } from "../model/gears/gear";
import {
  HotWorkExoskeleton,
  HotWorkGauntlets,
  HotWorkGauntletsT1,
  HotWorkPowerBank,
  HotWorkPowerCartridge,
  HotWorkPyrometer,
} from "../model/gears/hotWork";
import { GenericGear } from "../model/gears/genericGear";
import { Consumable } from "../model/consumables/consumable";
import { GinsengMeatStew } from "../model/consumables/ginsengMeatStew";
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

// ─── Registry types ─────────────────────────────────────────────────────────

export interface RegistryEntry<T> {
  name: string;
  icon?: string;
  create: () => T;
}

export interface WeaponRegistryEntry extends RegistryEntry<Weapon> {
  weaponType: WeaponType;
}

export interface GearRegistryEntry extends RegistryEntry<Gear> {
  gearType: GearType;
}

// ─── Operators ──────────────────────────────────────────────────────────────

export const OPERATORS: RegistryEntry<Operator>[] = [
  { name: "Laevatain",      icon: laevatainIcon,      create: () => new LaevatainOperator({ level: 90 }) },
  { name: "Antal",          icon: antalIcon,           create: () => new AntalOperator({ level: 90 }) },
  { name: "Akekuri",        icon: akekuriIcon,         create: () => new AkekuriOperator({ level: 90 }) },
  { name: "Wulfgard",       icon: wulfgardIcon,        create: () => new WulfgardOperator({ level: 90 }) },
  { name: "Ardelia",        icon: ardeliaIcon,         create: () => new ArdeliaOperator({ level: 90 }) },
  { name: "Endministrator", icon: endministratorIcon,  create: () => new LaevatainOperator({ level: 90 }) },
  { name: "Lifeng",         icon: lifengIcon,          create: () => new LaevatainOperator({ level: 90 }) },
  { name: "Rossi",          icon: rossiIcon,           create: () => new LaevatainOperator({ level: 90 }) },
  { name: "Chen Qianyu",    icon: chenQianyuIcon,      create: () => new LaevatainOperator({ level: 90 }) },
  { name: "Estella",        icon: estellaIcon,         create: () => new LaevatainOperator({ level: 90 }) },
  { name: "Ember",          icon: emberIcon,           create: () => new LaevatainOperator({ level: 90 }) },
  { name: "Snowshine",      icon: snowshineIcon,       create: () => new LaevatainOperator({ level: 90 }) },
  { name: "Catcher",        icon: catcherIcon,         create: () => new LaevatainOperator({ level: 90 }) },
  { name: "Gilberta",       icon: gilbertaIcon,        create: () => new LaevatainOperator({ level: 90 }) },
  { name: "Xaihi",          icon: xaihiIcon,           create: () => new LaevatainOperator({ level: 90 }) },
  { name: "Tangtang",       icon: tangtangIcon,        create: () => new LaevatainOperator({ level: 90 }) },
  { name: "Perlica",        icon: perlicaIcon,         create: () => new LaevatainOperator({ level: 90 }) },
  { name: "Fluorite",       icon: fluoriteIcon,        create: () => new LaevatainOperator({ level: 90 }) },
  { name: "Last Rite",      icon: lastRiteIcon,        create: () => new LaevatainOperator({ level: 90 }) },
  { name: "Yvonne",         icon: yvonneIcon,          create: () => new LaevatainOperator({ level: 90 }) },
  { name: "Avywenna",       icon: avywennaIcon,        create: () => new LaevatainOperator({ level: 90 }) },
  { name: "Da Pan",         icon: daPanIcon,           create: () => new LaevatainOperator({ level: 90 }) },
  { name: "Pogranichnik",   icon: pogranichnikIcon,    create: () => new LaevatainOperator({ level: 90 }) },
  { name: "Alesh",          icon: aleshIcon,           create: () => new LaevatainOperator({ level: 90 }) },
  { name: "Arclight",       icon: arclightIcon,        create: () => new LaevatainOperator({ level: 90 }) },
];

// ─── Weapons (62) ───────────────────────────────────────────────────────────

const gw = (t: WeaponType) => new GenericWeapon({ weaponType: t });

export const WEAPONS: WeaponRegistryEntry[] = [
  // Sword (17)
  { name: "Never Rest",            icon: neverRestIcon,       weaponType: WeaponType.SWORD, create: () => new NeverRest({ level: 90, skillOneLevel: 1, skillTwoLevel: 1, skillThreeLevel: 1 }) },
  { name: "Thermite Cutter",       icon: thermiteCutterIcon,  weaponType: WeaponType.SWORD, create: () => new ThermiteCutter({ level: 90, skillOneLevel: 1, skillTwoLevel: 1, skillThreeLevel: 1 }) },
  { name: "Forgeborn Scathe",      icon: forgebornScatheIcon, weaponType: WeaponType.SWORD, create: () => new ForgebornScathe({ level: 90, skillOneLevel: 1, skillTwoLevel: 1, skillThreeLevel: 1 }) },
  { name: "Eminent Repute",        icon: eminentRepute,       weaponType: WeaponType.SWORD, create: () => gw(WeaponType.SWORD) },
  { name: "Rapid Ascent",          icon: rapidAscent,         weaponType: WeaponType.SWORD, create: () => gw(WeaponType.SWORD) },
  { name: "White Night Nova",      icon: whiteNightNova,      weaponType: WeaponType.SWORD, create: () => gw(WeaponType.SWORD) },
  { name: "Grand Vision",          icon: grandVision,         weaponType: WeaponType.SWORD, create: () => gw(WeaponType.SWORD) },
  { name: "Umbral Torch",          icon: umbralTorch,         weaponType: WeaponType.SWORD, create: () => gw(WeaponType.SWORD) },
  { name: "Sundering Steel",       icon: sunderingSteel,      weaponType: WeaponType.SWORD, create: () => gw(WeaponType.SWORD) },
  { name: "Fortmaker",             icon: fortmaker,           weaponType: WeaponType.SWORD, create: () => gw(WeaponType.SWORD) },
  { name: "Aspirant",              icon: aspirant,            weaponType: WeaponType.SWORD, create: () => gw(WeaponType.SWORD) },
  { name: "OBJ Edge of Lightness", icon: objEdgeOfLightness,  weaponType: WeaponType.SWORD, create: () => gw(WeaponType.SWORD) },
  { name: "Twelve Questions",      icon: twelveQuestions,      weaponType: WeaponType.SWORD, create: () => gw(WeaponType.SWORD) },
  { name: "Finchaser 3.0",         icon: finchaser,           weaponType: WeaponType.SWORD, create: () => gw(WeaponType.SWORD) },
  { name: "Wave Tide",             icon: waveTide,            weaponType: WeaponType.SWORD, create: () => gw(WeaponType.SWORD) },
  { name: "Contingent Measure",    icon: contingentMeasure,   weaponType: WeaponType.SWORD, create: () => gw(WeaponType.SWORD) },
  { name: "Tarr 11",               icon: tarr11,              weaponType: WeaponType.SWORD, create: () => gw(WeaponType.SWORD) },
  // Great Sword (12)
  { name: "Former Finery",         icon: formerFinery,        weaponType: WeaponType.GREAT_SWORD, create: () => gw(WeaponType.GREAT_SWORD) },
  { name: "Sundered Prince",       icon: sunderedPrince,      weaponType: WeaponType.GREAT_SWORD, create: () => gw(WeaponType.GREAT_SWORD) },
  { name: "Thunderberge",          icon: thunderberge,        weaponType: WeaponType.GREAT_SWORD, create: () => gw(WeaponType.GREAT_SWORD) },
  { name: "Exemplar",              icon: exemplar,            weaponType: WeaponType.GREAT_SWORD, create: () => gw(WeaponType.GREAT_SWORD) },
  { name: "Khravengger",           icon: khravengger,         weaponType: WeaponType.GREAT_SWORD, create: () => gw(WeaponType.GREAT_SWORD) },
  { name: "OBJ Heavy Burden",      icon: objHeavyBurden,      weaponType: WeaponType.GREAT_SWORD, create: () => gw(WeaponType.GREAT_SWORD) },
  { name: "Finishing Call",         icon: finishingCall,       weaponType: WeaponType.GREAT_SWORD, create: () => gw(WeaponType.GREAT_SWORD) },
  { name: "Ancient Canal",         icon: ancientCanal,        weaponType: WeaponType.GREAT_SWORD, create: () => gw(WeaponType.GREAT_SWORD) },
  { name: "Seeker of Dark Lung",   icon: seekerOfDarkLung,    weaponType: WeaponType.GREAT_SWORD, create: () => gw(WeaponType.GREAT_SWORD) },
  { name: "Industry 0.1",          icon: industry01,          weaponType: WeaponType.GREAT_SWORD, create: () => gw(WeaponType.GREAT_SWORD) },
  { name: "Quencher",              icon: quencher,            weaponType: WeaponType.GREAT_SWORD, create: () => gw(WeaponType.GREAT_SWORD) },
  { name: "Darhoff 7",             icon: darhoff7,            weaponType: WeaponType.GREAT_SWORD, create: () => gw(WeaponType.GREAT_SWORD) },
  // Polearm (9)
  { name: "JET",                   icon: jetIcon,             weaponType: WeaponType.POLEARM, create: () => gw(WeaponType.POLEARM) },
  { name: "Mountain Bearer",       icon: mountainBearer,      weaponType: WeaponType.POLEARM, create: () => gw(WeaponType.POLEARM) },
  { name: "Valiant",               icon: valiant,             weaponType: WeaponType.POLEARM, create: () => gw(WeaponType.POLEARM) },
  { name: "Cohesive Traction",     icon: cohesiveTraction,    weaponType: WeaponType.POLEARM, create: () => gw(WeaponType.POLEARM) },
  { name: "Chimeric Justice",      icon: chimericJustice,     weaponType: WeaponType.POLEARM, create: () => gw(WeaponType.POLEARM) },
  { name: "OBJ Razorhorn",         icon: objRazorhorn,        weaponType: WeaponType.POLEARM, create: () => gw(WeaponType.POLEARM) },
  { name: "Pathfinder's Beacon",   icon: pathfindersBeacon,   weaponType: WeaponType.POLEARM, create: () => gw(WeaponType.POLEARM) },
  { name: "Aggeloslayer",          icon: aggeloslayer,        weaponType: WeaponType.POLEARM, create: () => gw(WeaponType.POLEARM) },
  { name: "Opero 77",              icon: opero77,             weaponType: WeaponType.POLEARM, create: () => gw(WeaponType.POLEARM) },
  // Handcannon (10)
  { name: "Clannibal",             icon: clannibalIcon,       weaponType: WeaponType.HANDCANNON, create: () => new Clannibal({ level: 90, skillOneLevel: 1, skillTwoLevel: 1, skillThreeLevel: 1 }) },
  { name: "Wedge",                 icon: wedgeIcon,           weaponType: WeaponType.HANDCANNON, create: () => gw(WeaponType.HANDCANNON) },
  { name: "Navigator",             icon: navigator,           weaponType: WeaponType.HANDCANNON, create: () => gw(WeaponType.HANDCANNON) },
  { name: "Artzy Tyrannical",      icon: artzyTyrannical,     weaponType: WeaponType.HANDCANNON, create: () => gw(WeaponType.HANDCANNON) },
  { name: "Rational Farewell",     icon: rationalFarewell,    weaponType: WeaponType.HANDCANNON, create: () => gw(WeaponType.HANDCANNON) },
  { name: "Opus: The Living",      icon: opusTheLiving,       weaponType: WeaponType.HANDCANNON, create: () => gw(WeaponType.HANDCANNON) },
  { name: "OBJ Velocitous",        icon: objVelocitous,       weaponType: WeaponType.HANDCANNON, create: () => gw(WeaponType.HANDCANNON) },
  { name: "Howling Guard",         icon: howlingGuard,        weaponType: WeaponType.HANDCANNON, create: () => gw(WeaponType.HANDCANNON) },
  { name: "Long Road",             icon: longRoad,            weaponType: WeaponType.HANDCANNON, create: () => gw(WeaponType.HANDCANNON) },
  { name: "Peco 5",                icon: peco5,               weaponType: WeaponType.HANDCANNON, create: () => gw(WeaponType.HANDCANNON) },
  // Arts Unit (14)
  { name: "Stanza of Memorials",   icon: stanzaIcon,          weaponType: WeaponType.ARTS_UNIT, create: () => new StanzaOfMemorials({ level: 90, skillOneLevel: 1, skillTwoLevel: 1, skillThreeLevel: 1 }) },
  { name: "Dreams of the Starry Beach", icon: dreamsIcon,     weaponType: WeaponType.ARTS_UNIT, create: () => new DreamsOfTheStarryBeach({ level: 90, skillOneLevel: 1, skillTwoLevel: 1, skillThreeLevel: 1 }) },
  { name: "Chivalric Virtues",     icon: chivalricVirtues,    weaponType: WeaponType.ARTS_UNIT, create: () => gw(WeaponType.ARTS_UNIT) },
  { name: "Detonation Unit",       icon: detonationUnit,      weaponType: WeaponType.ARTS_UNIT, create: () => gw(WeaponType.ARTS_UNIT) },
  { name: "Oblivion",              icon: oblivion,            weaponType: WeaponType.ARTS_UNIT, create: () => gw(WeaponType.ARTS_UNIT) },
  { name: "Opus: Etch Figure",     icon: opusEtchFigure,      weaponType: WeaponType.ARTS_UNIT, create: () => gw(WeaponType.ARTS_UNIT) },
  { name: "Delivery Guaranteed",   icon: deliveryGuaranteed,  weaponType: WeaponType.ARTS_UNIT, create: () => gw(WeaponType.ARTS_UNIT) },
  { name: "OBJ Arts Identifier",   icon: objArtsIdentifier,   weaponType: WeaponType.ARTS_UNIT, create: () => gw(WeaponType.ARTS_UNIT) },
  { name: "Freedom to Proselytize", icon: freedomToProselytize, weaponType: WeaponType.ARTS_UNIT, create: () => gw(WeaponType.ARTS_UNIT) },
  { name: "Wild Wanderer",         icon: wildWanderer,        weaponType: WeaponType.ARTS_UNIT, create: () => gw(WeaponType.ARTS_UNIT) },
  { name: "Monaihe",               icon: monaihe,             weaponType: WeaponType.ARTS_UNIT, create: () => gw(WeaponType.ARTS_UNIT) },
  { name: "Fluorescent Roc",       icon: fluorescentRoc,      weaponType: WeaponType.ARTS_UNIT, create: () => gw(WeaponType.ARTS_UNIT) },
  { name: "Hypernova Auto",        icon: hypernovaAuto,       weaponType: WeaponType.ARTS_UNIT, create: () => gw(WeaponType.ARTS_UNIT) },
  { name: "Jiminy 12",             icon: jiminy12,            weaponType: WeaponType.ARTS_UNIT, create: () => gw(WeaponType.ARTS_UNIT) },
];

// ─── Gear helper ────────────────────────────────────────────────────────────

const gg = (t: GearType, e: GearEffectType = GearEffectType.HOT_WORK) =>
  new GenericGear({ gearType: t, gearEffectType: e });

type GE = GearRegistryEntry;
const A = GearType.ARMOR;
const G = GearType.GLOVES;
const K = GearType.KIT;
const E = GearEffectType;

// ─── Gear (256) ─────────────────────────────────────────────────────────────

export const GEARS: GE[] = [
  // ── Armor (70) ──────────────────────────────────────────────────────────────
  { name: "Aburrey Heavy Armor",           icon: aHeavyArmor,          gearType: A, create: () => gg(A, E.ABURREY_LEGACY) },
  { name: "Aburrey Heavy Armor T1",        icon: aHeavyArmorT1,        gearType: A, create: () => gg(A, E.ABURREY_LEGACY) },
  { name: "Aburrey Light Armor",           icon: aLightArmor,          gearType: A, create: () => gg(A, E.ABURREY_LEGACY) },
  { name: "Aburrey Light Armor T1",        icon: aLightArmorT1,        gearType: A, create: () => gg(A, E.ABURREY_LEGACY) },
  { name: "AIC Heavy Armor",              icon: aicHeavyArmor,         gearType: A, create: () => gg(A, E.AIC_HEAVY) },
  { name: "AIC Light Armor",              icon: aicLightArmor,         gearType: A, create: () => gg(A, E.AIC_LIGHT) },
  { name: "Armored MSGR Jacket",          icon: amsgrJacket,           gearType: A, create: () => gg(A, E.ARMORED_MSGR) },
  { name: "Armored MSGR Jacket MOD",      icon: amsgrJacketMod,        gearType: A, create: () => gg(A, E.ARMORED_MSGR) },
  { name: "Armored MSGR Jacket T1",       icon: amsgrJacketT1,         gearType: A, create: () => gg(A, E.ARMORED_MSGR) },
  { name: "Basic Armor",                  icon: basicArmor,            gearType: A, create: () => gg(A) },
  { name: "Basic PPE",                    icon: basicPPE,              gearType: A, create: () => gg(A) },
  { name: "Bonekrusha Heavy Armor",       icon: bkHeavyArmor,          gearType: A, create: () => gg(A, E.BONEKRUSHA) },
  { name: "Bonekrusha Heavy Armor T1",    icon: bkHeavyArmorT1,        gearType: A, create: () => gg(A, E.BONEKRUSHA) },
  { name: "Bonekrusha Poncho",            icon: bkPoncho,              gearType: A, create: () => gg(A, E.BONEKRUSHA) },
  { name: "Bonekrusha Poncho MOD",        icon: bkPonchoMod,           gearType: A, create: () => gg(A, E.BONEKRUSHA) },
  { name: "Bonekrusha Poncho T1",         icon: bkPonchoT1,            gearType: A, create: () => gg(A, E.BONEKRUSHA) },
  { name: "Catastrophe Heavy Armor",      icon: catHeavyArmor,         gearType: A, create: () => gg(A, E.CATASTROPHE) },
  { name: "Catastrophe Heavy Armor T1",   icon: catHeavyArmorT1,       gearType: A, create: () => gg(A, E.CATASTROPHE) },
  { name: "Eternal Xiranite Armor",       icon: exArmor,               gearType: A, create: () => gg(A, E.ETERNAL_XIRANITE) },
  { name: "Frontier-Smart Armor",         icon: fsArmor,               gearType: A, create: () => gg(A) },
  { name: "Frontier-Smart Armor MOD",     icon: fsArmorMod,            gearType: A, create: () => gg(A) },
  { name: "Frontiers Armor",              icon: frArmor,               gearType: A, create: () => gg(A, E.FRONTIERS) },
  { name: "Frontiers Armor MOD",          icon: frArmorMod,            gearType: A, create: () => gg(A, E.FRONTIERS) },
  { name: "Frontiers Armor T1",           icon: frArmorT1,             gearType: A, create: () => gg(A, E.FRONTIERS) },
  { name: "Frontiers Armor T2",           icon: frArmorT2,             gearType: A, create: () => gg(A, E.FRONTIERS) },
  { name: "Frontiers Armor T3",           icon: frArmorT3,             gearType: A, create: () => gg(A, E.FRONTIERS) },
  { name: "Hot Work Exo-Rig",             icon: hwExoRig,              gearType: A, create: () => gg(A, E.HOT_WORK) },
  { name: "Hot Work Exoskeleton",         icon: hotWorkExoskeletonIcon, gearType: A, create: () => new HotWorkExoskeleton() },
  { name: "LYNX Cuirass",                 icon: lynxCuirass,           gearType: A, create: () => gg(A, E.LYNX) },
  { name: "LYNX Cuirass MOD",             icon: lynxCuirassMod,        gearType: A, create: () => gg(A, E.LYNX) },
  { name: "LYNX Heavy Armor",             icon: lynxHeavyArmor,        gearType: A, create: () => gg(A, E.LYNX) },
  { name: "MI Security Armor",            icon: miArmor,               gearType: A, create: () => gg(A, E.MI_SECURITY) },
  { name: "MI Security Armor MOD",        icon: miArmorMod,            gearType: A, create: () => gg(A, E.MI_SECURITY) },
  { name: "MI Security Overalls",         icon: miOveralls,            gearType: A, create: () => gg(A, E.MI_SECURITY) },
  { name: "MI Security Overalls MOD",     icon: miOverallsMod,         gearType: A, create: () => gg(A, E.MI_SECURITY) },
  { name: "MI Security Overalls T1",      icon: miOverallsT1,          gearType: A, create: () => gg(A, E.MI_SECURITY) },
  { name: "MI Security Overalls T2",      icon: miOverallsT2,          gearType: A, create: () => gg(A, E.MI_SECURITY) },
  { name: "Miner Armor",                  icon: minerArmor,            gearType: A, create: () => gg(A) },
  { name: "Miner Armor T1",               icon: minerArmorT1,          gearType: A, create: () => gg(A) },
  { name: "Miner Armor T2",               icon: minerArmorT2,          gearType: A, create: () => gg(A) },
  { name: "Miner Armor T4",               icon: minerArmorT4,          gearType: A, create: () => gg(A) },
  { name: "Miner Cleansuit",              icon: minerCleansuit,        gearType: A, create: () => gg(A) },
  { name: "Miner Overalls",               icon: minerOveralls,         gearType: A, create: () => gg(A) },
  { name: "Miner Overalls T1",            icon: minerOverallsT1,       gearType: A, create: () => gg(A) },
  { name: "Miner Overalls T2",            icon: minerOverallsT2,       gearType: A, create: () => gg(A) },
  { name: "Miner Overalls T4",            icon: minerOverallsT4,       gearType: A, create: () => gg(A) },
  { name: "Miner PPE T2",                 icon: minerPpeT2,            gearType: A, create: () => gg(A) },
  { name: "Miner Vest",                   icon: minerVest,             gearType: A, create: () => gg(A) },
  { name: "Miner Vest T2",                icon: minerVestT2,           gearType: A, create: () => gg(A) },
  { name: "Mordvolt Insulation Vest",     icon: mvInsVest,             gearType: A, create: () => gg(A, E.MORDVOLT_INSULATION) },
  { name: "Mordvolt Insulation Vest MOD", icon: mvInsVestMod,          gearType: A, create: () => gg(A, E.MORDVOLT_INSULATION) },
  { name: "Mordvolt Insulation Vest T1",  icon: mvInsVestT1,           gearType: A, create: () => gg(A, E.MORDVOLT_INSULATION) },
  { name: "Mordvolt Insulation Vest T2",  icon: mvInsVestT2,           gearType: A, create: () => gg(A, E.MORDVOLT_INSULATION) },
  { name: "Mordvolt Resistant Vest",      icon: mvResVest,             gearType: A, create: () => gg(A, E.MORDVOLT_RESISTANT) },
  { name: "Mordvolt Resistant Vest MOD",  icon: mvResVestMod,          gearType: A, create: () => gg(A, E.MORDVOLT_RESISTANT) },
  { name: "Mordvolt Resistant Vest T1",   icon: mvResVestT1,           gearType: A, create: () => gg(A, E.MORDVOLT_RESISTANT) },
  { name: "Prototype Heavy Armor",        icon: protoHeavy,            gearType: A, create: () => gg(A) },
  { name: "Prototype Heavy Armor T1",     icon: protoHeavyT1,          gearType: A, create: () => gg(A) },
  { name: "Pulser Labs Disruptor Suit",   icon: plDisruptorSuit,       gearType: A, create: () => gg(A, E.PULSER_LABS) },
  { name: "Redeemer Armor",               icon: redeemerArmor,         gearType: A, create: () => gg(A) },
  { name: "Redeemer Plates",              icon: redeemerPlates,        gearType: A, create: () => gg(A) },
  { name: "Roving MSGR Jacket",           icon: rmsgrJacket,           gearType: A, create: () => gg(A, E.ROVING_MSGR) },
  { name: "Roving MSGR Jacket MOD",       icon: rmsgrJacketMod,        gearType: A, create: () => gg(A, E.ROVING_MSGR) },
  { name: "Roving MSGR Jacket T1",        icon: rmsgrJacketT1,         gearType: A, create: () => gg(A, E.ROVING_MSGR) },
  { name: "Swordmancer Heavy Armor",      icon: swHeavyArmor,          gearType: A, create: () => gg(A, E.SWORDMANCER) },
  { name: "Swordmancer Light Armor",      icon: swLightArmor,          gearType: A, create: () => gg(A, E.SWORDMANCER) },
  { name: "Tide Fall Light Armor",        icon: tfLightArmor,          gearType: A, create: () => gg(A) },
  { name: "Type 50 Yinglung Heavy Armor", icon: ylHeavyArmor,          gearType: A, create: () => gg(A, E.TYPE_50_YINGLUNG) },
  { name: "Type 50 Yinglung Light Armor", icon: ylLightArmor,          gearType: A, create: () => gg(A, E.TYPE_50_YINGLUNG) },
  { name: "Æthertech Plating",            icon: aetPlating,            gearType: A, create: () => gg(A, E.AETHERTECH) },

  // ── Gloves (62) ─────────────────────────────────────────────────────────────
  { name: "Aburrey Gauntlets",               icon: aGauntlets,         gearType: G, create: () => gg(G, E.ABURREY_LEGACY) },
  { name: "AIC Gauntlets",                   icon: aicGauntlets,       gearType: G, create: () => gg(G, E.AIC_HEAVY) },
  { name: "AIC Tactical Gloves",             icon: aicTacGloves,       gearType: G, create: () => gg(G, E.AIC_LIGHT) },
  { name: "Armored MSGR Gloves",             icon: amsgrGloves,        gearType: G, create: () => gg(G, E.ARMORED_MSGR) },
  { name: "Armored MSGR Gloves MOD",         icon: amsgrGlovesMod,     gearType: G, create: () => gg(G, E.ARMORED_MSGR) },
  { name: "Armored MSGR Gloves T1",          icon: amsgrGlovesT1,      gearType: G, create: () => gg(G, E.ARMORED_MSGR) },
  { name: "Armored MSGR Gloves T2",          icon: amsgrGlovesT2,      gearType: G, create: () => gg(G, E.ARMORED_MSGR) },
  { name: "Basic Gauntlets",                 icon: basicGauntlets,     gearType: G, create: () => gg(G) },
  { name: "Basic Gloves",                    icon: basicGloves,        gearType: G, create: () => gg(G) },
  { name: "Bonekrusha Wristband",            icon: bkWristband,        gearType: G, create: () => gg(G, E.BONEKRUSHA) },
  { name: "Bonekrusha Wristband MOD",        icon: bkWristbandMod,     gearType: G, create: () => gg(G, E.BONEKRUSHA) },
  { name: "Catastrophe Gloves",              icon: catGloves,          gearType: G, create: () => gg(G, E.CATASTROPHE) },
  { name: "Eternal Xiranite Gloves",         icon: exGloves,           gearType: G, create: () => gg(G, E.ETERNAL_XIRANITE) },
  { name: "Eternal Xiranite Gloves T1",      icon: exGlovesT1,         gearType: G, create: () => gg(G, E.ETERNAL_XIRANITE) },
  { name: "Frontiers Blight RES Gloves",     icon: frBlightGloves,     gearType: G, create: () => gg(G, E.FRONTIERS) },
  { name: "Frontiers Blight RES Gloves MOD", icon: frBlightGlovesMod,  gearType: G, create: () => gg(G, E.FRONTIERS) },
  { name: "Frontiers Fiber Gloves",          icon: frFiberGloves,      gearType: G, create: () => gg(G, E.FRONTIERS) },
  { name: "Frontiers Fiber Gloves MOD",      icon: frFiberGlovesMod,   gearType: G, create: () => gg(G, E.FRONTIERS) },
  { name: "Hot Work Gauntlets",              icon: hotWorkGauntletsIcon, gearType: G, create: () => new HotWorkGauntlets() },
  { name: "Hot Work Gauntlets T1",           icon: hotWorkGauntletsT1Icon, gearType: G, create: () => new HotWorkGauntletsT1() },
  { name: "Hot Work Gloves",                 icon: hwGloves,           gearType: G, create: () => gg(G, E.HOT_WORK) },
  { name: "LYNX Gauntlets",                  icon: lynxGauntlets,      gearType: G, create: () => gg(G, E.LYNX) },
  { name: "LYNX Gloves",                     icon: lynxGloves,         gearType: G, create: () => gg(G, E.LYNX) },
  { name: "LYNX Gloves MOD",                 icon: lynxGlovesMod,      gearType: G, create: () => gg(G, E.LYNX) },
  { name: "MI Security Gloves",              icon: miGloves,           gearType: G, create: () => gg(G, E.MI_SECURITY) },
  { name: "MI Security Gloves MOD",          icon: miGlovesMod,        gearType: G, create: () => gg(G, E.MI_SECURITY) },
  { name: "MI Security Hands PPE",           icon: miHandsPpe,         gearType: G, create: () => gg(G, E.MI_SECURITY) },
  { name: "MI Security Hands PPE MOD",       icon: miHandsPpeMod,      gearType: G, create: () => gg(G, E.MI_SECURITY) },
  { name: "MI Security Hands PPE T1",        icon: miHandsPpeT1,       gearType: G, create: () => gg(G, E.MI_SECURITY) },
  { name: "Miner Fists",                     icon: minerFists,         gearType: G, create: () => gg(G) },
  { name: "Miner Fists T1",                  icon: minerFistsT1,       gearType: G, create: () => gg(G) },
  { name: "Miner Fists T2",                  icon: minerFistsT2,       gearType: G, create: () => gg(G) },
  { name: "Miner Fists T4",                  icon: minerFistsT4,       gearType: G, create: () => gg(G) },
  { name: "Miner Gauntlets",                 icon: minerGauntlets,     gearType: G, create: () => gg(G) },
  { name: "Miner Gauntlets T1",              icon: minerGauntletsT1,   gearType: G, create: () => gg(G) },
  { name: "Miner Gauntlets T2",              icon: minerGauntletsT2,   gearType: G, create: () => gg(G) },
  { name: "Miner Gauntlets T3",              icon: minerGauntletsT3,   gearType: G, create: () => gg(G) },
  { name: "Miner Gauntlets T4",              icon: minerGauntletsT4,   gearType: G, create: () => gg(G) },
  { name: "Miner Gloves",                    icon: minerGloves,        gearType: G, create: () => gg(G) },
  { name: "Miner Gloves T1",                 icon: minerGlovesT1,      gearType: G, create: () => gg(G) },
  { name: "Miner Gloves T2",                 icon: minerGlovesT2,      gearType: G, create: () => gg(G) },
  { name: "Miner Gloves T3",                 icon: minerGlovesT3,      gearType: G, create: () => gg(G) },
  { name: "Miner Wrists",                    icon: minerWrists,        gearType: G, create: () => gg(G) },
  { name: "Miner Wrists T2",                 icon: minerWristsT2,      gearType: G, create: () => gg(G) },
  { name: "Mordvolt Insulation Gloves",      icon: mvInsGloves,        gearType: G, create: () => gg(G, E.MORDVOLT_INSULATION) },
  { name: "Mordvolt Insulation Gloves MOD",  icon: mvInsGlovesMod,     gearType: G, create: () => gg(G, E.MORDVOLT_INSULATION) },
  { name: "Mordvolt Insulation Gloves T1",   icon: mvInsGlovesT1,      gearType: G, create: () => gg(G, E.MORDVOLT_INSULATION) },
  { name: "Mordvolt Resistant Gloves",       icon: mvResGloves,        gearType: G, create: () => gg(G, E.MORDVOLT_RESISTANT) },
  { name: "Mordvolt Resistant Gloves MOD",   icon: mvResGlovesMod,     gearType: G, create: () => gg(G, E.MORDVOLT_RESISTANT) },
  { name: "Mordvolt Resistant Gloves T1",    icon: mvResGlovesT1,      gearType: G, create: () => gg(G, E.MORDVOLT_RESISTANT) },
  { name: "Pulser Labs Gloves",              icon: plGloves,           gearType: G, create: () => gg(G, E.PULSER_LABS) },
  { name: "Redeemer Gloves DEX",             icon: redGlovesDex,       gearType: G, create: () => gg(G) },
  { name: "Redeemer Gloves FORCE",           icon: redGlovesForce,     gearType: G, create: () => gg(G) },
  { name: "Roving MSGR Fists",              icon: rmsgrFists,          gearType: G, create: () => gg(G, E.ROVING_MSGR) },
  { name: "Roving MSGR Fists MOD",          icon: rmsgrFistsMod,       gearType: G, create: () => gg(G, E.ROVING_MSGR) },
  { name: "Roving MSGR Fists T1",           icon: rmsgrFistsT1,        gearType: G, create: () => gg(G, E.ROVING_MSGR) },
  { name: "Swordmancer TAC Fists",          icon: swTacFists,          gearType: G, create: () => gg(G, E.SWORDMANCER) },
  { name: "Swordmancer TAC Gauntlets",      icon: swTacGauntlets,      gearType: G, create: () => gg(G, E.SWORDMANCER) },
  { name: "Tide Surge Gauntlets",            icon: tsGauntlets,         gearType: G, create: () => gg(G, E.TIDE_SURGE) },
  { name: "Type 50 Yinglung Gloves",        icon: ylGloves,            gearType: G, create: () => gg(G, E.TYPE_50_YINGLUNG) },
  { name: "Type 50 Yinglung Gloves T1",     icon: ylGlovesT1,          gearType: G, create: () => gg(G, E.TYPE_50_YINGLUNG) },
  { name: "Æthertech Gloves",               icon: aetGloves,           gearType: G, create: () => gg(G, E.AETHERTECH) },

  // ── Kit (124) ───────────────────────────────────────────────────────────────
  { name: "Aburrey Auditory Chip",       icon: aAuditoryChip,       gearType: K, create: () => gg(K, E.ABURREY_LEGACY) },
  { name: "Aburrey Auditory Chip T1",    icon: aAuditoryChipT1,     gearType: K, create: () => gg(K, E.ABURREY_LEGACY) },
  { name: "Aburrey Flashlight",          icon: aFlashlight,          gearType: K, create: () => gg(K, E.ABURREY_LEGACY) },
  { name: "Aburrey Sensor Chip",         icon: aSensorChip,          gearType: K, create: () => gg(K, E.ABURREY_LEGACY) },
  { name: "Aburrey Sensor Chip T1",      icon: aSensorChipT1,        gearType: K, create: () => gg(K, E.ABURREY_LEGACY) },
  { name: "Aburrey UV Lamp",             icon: aUvLamp,              gearType: K, create: () => gg(K, E.ABURREY_LEGACY) },
  { name: "AIC Alloy Plate",             icon: aicAlloyPlate,        gearType: K, create: () => gg(K, E.AIC_HEAVY) },
  { name: "AIC Ceramic Plate",           icon: aicCeramicPlate,      gearType: K, create: () => gg(K, E.AIC_LIGHT) },
  { name: "AIC Heavy Plate",             icon: aicHeavyPlate,        gearType: K, create: () => gg(K, E.AIC_HEAVY) },
  { name: "AIC Light Plate",             icon: aicLightPlate,        gearType: K, create: () => gg(K, E.AIC_LIGHT) },
  { name: "Armored MSGR Flashlight",     icon: amsgrFlashlight,      gearType: K, create: () => gg(K, E.ARMORED_MSGR) },
  { name: "Armored MSGR Flashlight T1",  icon: amsgrFlashlightT1,    gearType: K, create: () => gg(K, E.ARMORED_MSGR) },
  { name: "Armored MSGR Flashspike",     icon: amsgrFlashspike,      gearType: K, create: () => gg(K, E.ARMORED_MSGR) },
  { name: "Armored MSGR Flashspike MOD", icon: amsgrFlashspikeMod,   gearType: K, create: () => gg(K, E.ARMORED_MSGR) },
  { name: "Armored MSGR Gyro",           icon: amsgrGyro,            gearType: K, create: () => gg(K, E.ARMORED_MSGR) },
  { name: "Armored MSGR Gyro MOD",       icon: amsgrGyroMod,         gearType: K, create: () => gg(K, E.ARMORED_MSGR) },
  { name: "Armored MSGR Gyro T1",        icon: amsgrGyroT1,          gearType: K, create: () => gg(K, E.ARMORED_MSGR) },
  { name: "Bonekrusha Figurine",         icon: bkFigurine,           gearType: K, create: () => gg(K, E.BONEKRUSHA) },
  { name: "Bonekrusha Figurine MOD",     icon: bkFigurineMod,        gearType: K, create: () => gg(K, E.BONEKRUSHA) },
  { name: "Bonekrusha Figurine T1",      icon: bkFigurineT1,         gearType: K, create: () => gg(K, E.BONEKRUSHA) },
  { name: "Bonekrusha Mask",             icon: bkMask,               gearType: K, create: () => gg(K, E.BONEKRUSHA) },
  { name: "Bonekrusha Mask MOD",         icon: bkMaskMod,            gearType: K, create: () => gg(K, E.BONEKRUSHA) },
  { name: "Bonekrusha Mask T1",          icon: bkMaskT1,             gearType: K, create: () => gg(K, E.BONEKRUSHA) },
  { name: "Catastrophe Filter",          icon: catFilter,            gearType: K, create: () => gg(K, E.CATASTROPHE) },
  { name: "Catastrophe Gauze Cartridge", icon: catGauze,             gearType: K, create: () => gg(K, E.CATASTROPHE) },
  { name: "Catastrophe Gauze Cartridge T1", icon: catGauzeT1,        gearType: K, create: () => gg(K, E.CATASTROPHE) },
  { name: "Emergency Comm",              icon: emergencyComm,        gearType: K, create: () => gg(K) },
  { name: "Emergency Compression Core",  icon: emergencyCore,        gearType: K, create: () => gg(K) },
  { name: "Eternal Xiranite Auxiliary Arm", icon: exAuxArm,          gearType: K, create: () => gg(K, E.ETERNAL_XIRANITE) },
  { name: "Eternal Xiranite Power Core", icon: exPowerCore,          gearType: K, create: () => gg(K, E.ETERNAL_XIRANITE) },
  { name: "Eternal Xiranite Power Core T1", icon: exPowerCoreT1,    gearType: K, create: () => gg(K, E.ETERNAL_XIRANITE) },
  { name: "Frontiers Analyzer",          icon: frAnalyzer,           gearType: K, create: () => gg(K, E.FRONTIERS) },
  { name: "Frontiers Analyzer MOD",      icon: frAnalyzerMod,        gearType: K, create: () => gg(K, E.FRONTIERS) },
  { name: "Frontiers Comm",              icon: frComm,               gearType: K, create: () => gg(K, E.FRONTIERS) },
  { name: "Frontiers Comm MOD",          icon: frCommMod,            gearType: K, create: () => gg(K, E.FRONTIERS) },
  { name: "Frontiers Comm T1",           icon: frCommT1,             gearType: K, create: () => gg(K, E.FRONTIERS) },
  { name: "Frontiers Extra O2 Tube",     icon: frExtraO2,            gearType: K, create: () => gg(K, E.FRONTIERS) },
  { name: "Frontiers O2 Tether",         icon: frO2Tether,           gearType: K, create: () => gg(K, E.FRONTIERS) },
  { name: "Frontiers O2 Tether MOD",     icon: frO2TetherMod,        gearType: K, create: () => gg(K, E.FRONTIERS) },
  { name: "Hanging River O2 Tube",       icon: hangingRiverO2,       gearType: K, create: () => gg(K) },
  { name: "Hot Work HPD",                icon: hwHpd,                gearType: K, create: () => gg(K, E.HOT_WORK) },
  { name: "Hot Work Power Bank",         icon: hotWorkPowerBankIcon, gearType: K, create: () => new HotWorkPowerBank() },
  { name: "Hot Work Power Cartridge",    icon: hotWorkPowerCartridgeIcon, gearType: K, create: () => new HotWorkPowerCartridge() },
  { name: "Hot Work Pyrometer",          icon: hotWorkPyrometerIcon, gearType: K, create: () => new HotWorkPyrometer() },
  { name: "LYNX Aegis Injector",         icon: lynxAegis,            gearType: K, create: () => gg(K, E.LYNX) },
  { name: "LYNX Aegis Injector MOD",     icon: lynxAegisMod,         gearType: K, create: () => gg(K, E.LYNX) },
  { name: "LYNX Connector",              icon: lynxConnector,        gearType: K, create: () => gg(K, E.LYNX) },
  { name: "LYNX Connector MOD",          icon: lynxConnectorMod,     gearType: K, create: () => gg(K, E.LYNX) },
  { name: "LYNX Connector T1",           icon: lynxConnectorT1,      gearType: K, create: () => gg(K, E.LYNX) },
  { name: "LYNX Slab",                   icon: lynxSlab,             gearType: K, create: () => gg(K, E.LYNX) },
  { name: "LYNX Slab MOD",               icon: lynxSlabMod,          gearType: K, create: () => gg(K, E.LYNX) },
  { name: "MI Security Armband",         icon: miArmband,            gearType: K, create: () => gg(K, E.MI_SECURITY) },
  { name: "MI Security Push Knife",      icon: miPushKnife,          gearType: K, create: () => gg(K, E.MI_SECURITY) },
  { name: "MI Security Push Knife MOD",  icon: miPushKnifeMod,       gearType: K, create: () => gg(K, E.MI_SECURITY) },
  { name: "MI Security Push Knife T1",   icon: miPushKnifeT1,        gearType: K, create: () => gg(K, E.MI_SECURITY) },
  { name: "MI Security Scope",           icon: miScope,              gearType: K, create: () => gg(K, E.MI_SECURITY) },
  { name: "MI Security Scope MOD",       icon: miScopeMod,           gearType: K, create: () => gg(K, E.MI_SECURITY) },
  { name: "MI Security Toolkit",         icon: miToolkit,            gearType: K, create: () => gg(K, E.MI_SECURITY) },
  { name: "MI Security Toolkit MOD",     icon: miToolkitMod,         gearType: K, create: () => gg(K, E.MI_SECURITY) },
  { name: "MI Security Visor",           icon: miVisor,              gearType: K, create: () => gg(K, E.MI_SECURITY) },
  { name: "MI Security Visor MOD",       icon: miVisorMod,           gearType: K, create: () => gg(K, E.MI_SECURITY) },
  { name: "Miner Comm",                  icon: minerComm,            gearType: K, create: () => gg(K) },
  { name: "Miner Comm T1",               icon: minerCommT1,          gearType: K, create: () => gg(K) },
  { name: "Miner Comm T2",               icon: minerCommT2,          gearType: K, create: () => gg(K) },
  { name: "Miner Comm T3",               icon: minerCommT3,          gearType: K, create: () => gg(K) },
  { name: "Miner Comm T4",               icon: minerCommT4,          gearType: K, create: () => gg(K) },
  { name: "Miner Compression Core",      icon: minerCompCore,        gearType: K, create: () => gg(K) },
  { name: "Miner Compression Core T1",   icon: minerCompCoreT1,      gearType: K, create: () => gg(K) },
  { name: "Miner Compression Core T2",   icon: minerCompCoreT2,      gearType: K, create: () => gg(K) },
  { name: "Miner Compression Core T3",   icon: minerCompCoreT3,      gearType: K, create: () => gg(K) },
  { name: "Miner Compression Core T4",   icon: minerCompCoreT4,      gearType: K, create: () => gg(K) },
  { name: "Miner Drive Wheel",           icon: minerDriveWheel,      gearType: K, create: () => gg(K) },
  { name: "Miner Drive Wheel T1",        icon: minerDriveWheelT1,    gearType: K, create: () => gg(K) },
  { name: "Miner Drive Wheel T2",        icon: minerDriveWheelT2,    gearType: K, create: () => gg(K) },
  { name: "Miner Drive Wheel T3",        icon: minerDriveWheelT3,    gearType: K, create: () => gg(K) },
  { name: "Miner Drive Wheel T4",        icon: minerDriveWheelT4,    gearType: K, create: () => gg(K) },
  { name: "Miner Drive Wheel T5",        icon: minerDriveWheelT5,    gearType: K, create: () => gg(K) },
  { name: "Miner Turbine",               icon: minerTurbine,         gearType: K, create: () => gg(K) },
  { name: "Miner Turbine T1",            icon: minerTurbineT1,       gearType: K, create: () => gg(K) },
  { name: "Miner Turbine T2",            icon: minerTurbineT2,       gearType: K, create: () => gg(K) },
  { name: "Miner Turbine T3",            icon: minerTurbineT3,       gearType: K, create: () => gg(K) },
  { name: "Miner Turbine T4",            icon: minerTurbineT4,       gearType: K, create: () => gg(K) },
  { name: "Miner Turbine T5",            icon: minerTurbineT5,       gearType: K, create: () => gg(K) },
  { name: "Mordvolt Insulation Battery",      icon: mvInsBattery,     gearType: K, create: () => gg(K, E.MORDVOLT_INSULATION) },
  { name: "Mordvolt Insulation Battery MOD",  icon: mvInsBatteryMod,  gearType: K, create: () => gg(K, E.MORDVOLT_INSULATION) },
  { name: "Mordvolt Insulation Battery T1",   icon: mvInsBatteryT1,   gearType: K, create: () => gg(K, E.MORDVOLT_INSULATION) },
  { name: "Mordvolt Insulation Wrench",       icon: mvInsWrench,      gearType: K, create: () => gg(K, E.MORDVOLT_INSULATION) },
  { name: "Mordvolt Insulation Wrench MOD",   icon: mvInsWrenchMod,   gearType: K, create: () => gg(K, E.MORDVOLT_INSULATION) },
  { name: "Mordvolt Insulation Wrench T1",    icon: mvInsWrenchT1,    gearType: K, create: () => gg(K, E.MORDVOLT_INSULATION) },
  { name: "Mordvolt Insulation Wrench T2",    icon: mvInsWrenchT2,    gearType: K, create: () => gg(K, E.MORDVOLT_INSULATION) },
  { name: "Mordvolt Resistant Battery",       icon: mvResBattery,     gearType: K, create: () => gg(K, E.MORDVOLT_RESISTANT) },
  { name: "Mordvolt Resistant Battery MOD",   icon: mvResBatteryMod,  gearType: K, create: () => gg(K, E.MORDVOLT_RESISTANT) },
  { name: "Mordvolt Resistant Battery T1",    icon: mvResBatteryT1,   gearType: K, create: () => gg(K, E.MORDVOLT_RESISTANT) },
  { name: "Mordvolt Resistant Wrench",        icon: mvResWrench,      gearType: K, create: () => gg(K, E.MORDVOLT_RESISTANT) },
  { name: "Mordvolt Resistant Wrench MOD",    icon: mvResWrenchMod,   gearType: K, create: () => gg(K, E.MORDVOLT_RESISTANT) },
  { name: "Mordvolt Resistant Wrench T1",     icon: mvResWrenchT1,    gearType: K, create: () => gg(K, E.MORDVOLT_RESISTANT) },
  { name: "Obsolete Comm",               icon: obsoleteComm,         gearType: K, create: () => gg(K) },
  { name: "Obsolete Compression Core",   icon: obsoleteCore,         gearType: K, create: () => gg(K) },
  { name: "Pulser Labs Calibrator",      icon: plCalibrator,         gearType: K, create: () => gg(K, E.PULSER_LABS) },
  { name: "Pulser Labs Invasion Core",   icon: plInvasionCore,       gearType: K, create: () => gg(K, E.PULSER_LABS) },
  { name: "Pulser Labs Probe",           icon: plProbe,              gearType: K, create: () => gg(K, E.PULSER_LABS) },
  { name: "Redeemer Seal",               icon: redSeal,              gearType: K, create: () => gg(K) },
  { name: "Redeemer Seal T1",            icon: redSealT1,            gearType: K, create: () => gg(K) },
  { name: "Redeemer Tag",                icon: redTag,               gearType: K, create: () => gg(K) },
  { name: "Redeemer Tag T1",             icon: redTagT1,             gearType: K, create: () => gg(K) },
  { name: "Roving MSGR Flashlight",      icon: rmsgrFlashlight,      gearType: K, create: () => gg(K, E.ROVING_MSGR) },
  { name: "Roving MSGR Flashlight T1",   icon: rmsgrFlashlightT1,    gearType: K, create: () => gg(K, E.ROVING_MSGR) },
  { name: "Roving MSGR Flashlight T2",   icon: rmsgrFlashlightT2,    gearType: K, create: () => gg(K, E.ROVING_MSGR) },
  { name: "Roving MSGR Flashspike",      icon: rmsgrFlashspike,      gearType: K, create: () => gg(K, E.ROVING_MSGR) },
  { name: "Roving MSGR Flashspike MOD",  icon: rmsgrFlashspikeMod,   gearType: K, create: () => gg(K, E.ROVING_MSGR) },
  { name: "Roving MSGR Gyro",            icon: rmsgrGyro,            gearType: K, create: () => gg(K, E.ROVING_MSGR) },
  { name: "Roving MSGR Gyro MOD",        icon: rmsgrGyroMod,         gearType: K, create: () => gg(K, E.ROVING_MSGR) },
  { name: "Roving MSGR Gyro T1",         icon: rmsgrGyroT1,          gearType: K, create: () => gg(K, E.ROVING_MSGR) },
  { name: "Swordmancer Flint",           icon: swFlint,              gearType: K, create: () => gg(K, E.SWORDMANCER) },
  { name: "Swordmancer Micro Filter",    icon: swMicroFilter,        gearType: K, create: () => gg(K, E.SWORDMANCER) },
  { name: "Swordmancer NAV Beacon",      icon: swNavBeacon,          gearType: K, create: () => gg(K, E.SWORDMANCER) },
  { name: "Turbid Cutting Torch",        icon: turbidCuttingTorch,   gearType: K, create: () => gg(K) },
  { name: "Type 50 Yinglung Knife",      icon: ylKnife,              gearType: K, create: () => gg(K, E.TYPE_50_YINGLUNG) },
  { name: "Type 50 Yinglung Knife T1",   icon: ylKnifeT1,            gearType: K, create: () => gg(K, E.TYPE_50_YINGLUNG) },
  { name: "Type 50 Yinglung Radar",      icon: ylRadar,              gearType: K, create: () => gg(K, E.TYPE_50_YINGLUNG) },
  { name: "Æthertech Analysis Band",     icon: aetAnalysisBand,      gearType: K, create: () => gg(K, E.AETHERTECH) },
  { name: "Æthertech Stabilizer",        icon: aetStabilizer,        gearType: K, create: () => gg(K, E.AETHERTECH) },
  { name: "Æthertech Visor",             icon: aetVisor,             gearType: K, create: () => gg(K, E.AETHERTECH) },
  { name: "Æthertech Watch",             icon: aetWatch,             gearType: K, create: () => gg(K, E.AETHERTECH) },
];

export const ARMORS = GEARS.filter((g) => g.gearType === GearType.ARMOR);
export const GLOVES = GEARS.filter((g) => g.gearType === GearType.GLOVES);
export const KITS   = GEARS.filter((g) => g.gearType === GearType.KIT);

// ─── Consumables & Tacticals ────────────────────────────────────────────────

export const CONSUMABLES: RegistryEntry<Consumable>[] = [
  { name: "Ginseng Meat Stew", icon: ginsengMeatStewIcon, create: () => new GinsengMeatStew() },
];

export const TACTICALS: RegistryEntry<Tactical>[] = [
  { name: "Stew Meeting", icon: stewMeetingIcon, create: () => new StewMeeting() },
];
