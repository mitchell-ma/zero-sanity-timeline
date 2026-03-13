/**
 * Skill multiplier registry — controller-layer bridge between combat skill
 * models and the damage table builder.
 *
 * Maps (operatorId, skillName, segmentLabel, skillLevel, potential) → multiplier.
 * Only operators with populated multiplier data return values; others return null.
 */
import { BasicAttackType, CombatSkillsType } from '../../consts/enums';
import { Potential, SkillLevel } from '../../consts/types';

// ── Akekuri ──────────────────────────────────────────────────────────────────
import {
  SwordOfAspiration,
  BurstOfPassion,
  FlashAndDash,
} from '../../model/combat-skills/akekuriSkills';

// ── Laevatain ────────────────────────────────────────────────────────────────
import {
  FlamingCinders,
  SmoulderingFire,
  Seethe,
} from '../../model/combat-skills/laevatainSkills';

// ── Antal ─────────────────────────────────────────────────────────────────────
import {
  ExchangeCurrent,
  SpecifiedResearchSubject,
  EmpTestSite,
} from '../../model/combat-skills/antalSkills';

// ── Wulfgard ──────────────────────────────────────────────────────────────────
import {
  RapidFireAkimbo,
  ThermiteTracers,
  FragGrenadeBeta,
  WolvenFury,
} from '../../model/combat-skills/wulfgardSkills';

// ── Ardelia ───────────────────────────────────────────────────────────────────
import {
  RockyWhispers,
  DollyRush,
  EruptionColumn,
  WoolyParty,
} from '../../model/combat-skills/ardeliaSkills';

// ── Avywenna ──────────────────────────────────────────────────────────────────
import {
  ThunderlanceBlitz,
  ThunderlanceInterdiction,
  ThunderlanceStrike,
  ThunderlanceFinalShock,
} from '../../model/combat-skills/avywennaSkills';

// ── Alesh ─────────────────────────────────────────────────────────────────────
import {
  RodCasting,
  UnconventionalLure,
  AugerAngling,
  OneMonsterCatch,
} from '../../model/combat-skills/aleshSkills';

// ── Arclight ──────────────────────────────────────────────────────────────────
import {
  SeekAndHunt,
  TempestuousArc,
  PealOfThunder,
  ExplodingBlitz,
} from '../../model/combat-skills/arclightSkills';

// ── Catcher ───────────────────────────────────────────────────────────────────
import {
  RigidInterdictionBasic,
  RigidInterdiction,
  TimelySuppression,
  TextbookAssault,
} from '../../model/combat-skills/catcherSkills';

// ── Chen Qianyu ───────────────────────────────────────────────────────────────
import {
  SoaringBreak,
  AscendingStrike,
  SoarToTheStars,
  BladeGale,
} from '../../model/combat-skills/chenQianyuSkills';

// ── Da Pan ────────────────────────────────────────────────────────────────────
import {
  RollingCut,
  FlipDaWok,
  MoreSpice,
  ChopNDunk,
} from '../../model/combat-skills/daPanSkills';

// ── Ember ─────────────────────────────────────────────────────────────────────
import {
  SwordArtOfAssault,
  ForwardMarch,
  FrontlineSupport,
  ReIgnitedOath,
} from '../../model/combat-skills/emberSkills';

// ── Endministrator ────────────────────────────────────────────────────────────
import {
  DestructiveSequence,
  ConstructiveSequence,
  SealingSequence,
  BombardmentSequence,
} from '../../model/combat-skills/endministratorSkills';

// ── Estella ───────────────────────────────────────────────────────────────────
import {
  AudioNoise,
  Onomatopoeia,
  Distortion,
  Tremolo,
} from '../../model/combat-skills/estellaSkills';

// ── Fluorite ──────────────────────────────────────────────────────────────────
import {
  SignatureGunKata,
  TinySurprise,
  FreeGiveaway,
  ApexPrankster,
} from '../../model/combat-skills/fluoriteSkills';

// ── Gilberta ──────────────────────────────────────────────────────────────────
import {
  BeamCohesionArts,
  GravityMode,
  MatrixDisplacement,
  GravityField,
} from '../../model/combat-skills/gilbertaSkills';

// ── Last Rite ─────────────────────────────────────────────────────────────────
import {
  DanceOfRime,
  EsotericLegacy,
  WintersDevourer,
  VigilServices,
} from '../../model/combat-skills/lastRiteSkills';

// ── Lifeng ────────────────────────────────────────────────────────────────────
import {
  Ruination,
  TurbidAvatar,
  AspectOfWrath,
  HeartOfTheUnmoving,
} from '../../model/combat-skills/lifengSkills';

// ── Perlica ───────────────────────────────────────────────────────────────────
import {
  ProtocolAlphaBreach,
  ProtocolOmegaStrike,
  InstantProtocolChain,
  ProtocolEpsilon,
} from '../../model/combat-skills/perlicaSkills';

// ── Pogranichnik ──────────────────────────────────────────────────────────────
import {
  AllOutOffensive,
  ThePulverizingFront,
  FullMoonSlash,
  ShieldguardBanner,
} from '../../model/combat-skills/pogranichnikSkills';

// ── Snowshine ─────────────────────────────────────────────────────────────────
import {
  HypothermicAssault,
  SaturatedDefense,
  FrigidSnowfield,
} from '../../model/combat-skills/snowshineSkills';

// ── Xaihi ─────────────────────────────────────────────────────────────────────
import {
  XaihiBasicAttack,
  StressTesting,
} from '../../model/combat-skills/xaihiSkills';

// ── Yvonne ────────────────────────────────────────────────────────────────────
import {
  ExuberantTrigger,
  BrrBrrBomb,
  Flashfreezer,
  CryoblastingPistolier,
} from '../../model/combat-skills/yvonneSkills';

// ── Segment label → BasicAttackType mapping ──────────────────────────────────

const SEGMENT_LABEL_TO_ATTACK_TYPE: Record<string, BasicAttackType> = {
  '1': BasicAttackType.SEQUENCE_1,
  '2': BasicAttackType.SEQUENCE_2,
  '3': BasicAttackType.SEQUENCE_3,
  '4': BasicAttackType.SEQUENCE_4,
  '5': BasicAttackType.SEQUENCE_5,
  'Finisher': BasicAttackType.FINISHER,
  'Dive': BasicAttackType.DIVE,
  'Final': BasicAttackType.FINAL_STRIKE,
};

// ── Multiplier lookup functions per operator ─────────────────────────────────

type MultiplierFn = (
  skillName: CombatSkillsType,
  segmentLabel: string | undefined,
  level: SkillLevel,
  potential: Potential,
) => number | null;

function akekuriMultiplier(
  skillName: CombatSkillsType,
  segmentLabel: string | undefined,
  level: SkillLevel,
  potential: Potential,
): number | null {
  switch (skillName) {
    case CombatSkillsType.SWORD_OF_ASPIRATION: {
      const seq = segmentLabel ? SEGMENT_LABEL_TO_ATTACK_TYPE[segmentLabel] : null;
      if (!seq) return null;
      const skill = new SwordOfAspiration({ level, operatorPotential: potential });
      return skill.getBasicAttackSequenceMultiplier(seq, level, potential);
    }
    case CombatSkillsType.BURST_OF_PASSION:
      return new BurstOfPassion({ level, operatorPotential: potential }).getDmgMultiplier(level);
    case CombatSkillsType.FLASH_AND_DASH:
      return new FlashAndDash({ level, operatorPotential: potential }).getDmgMultiplierPerSeq(level);
    case CombatSkillsType.SQUAD_ON_ME:
      return null; // SP recovery, no damage multiplier
    default:
      return null;
  }
}

function laevatainMultiplier(
  skillName: CombatSkillsType,
  segmentLabel: string | undefined,
  level: SkillLevel,
  potential: Potential,
): number | null {
  switch (skillName) {
    case CombatSkillsType.FLAMING_CINDERS: {
      const seq = segmentLabel ? SEGMENT_LABEL_TO_ATTACK_TYPE[segmentLabel] : null;
      if (!seq) return null;
      const skill = new FlamingCinders({ level, operatorPotential: potential });
      return skill.getBasicAttackSequenceMultiplier(seq, level, potential);
    }
    case CombatSkillsType.FLAMING_CINDERS_ENHANCED: {
      const seq = segmentLabel ? SEGMENT_LABEL_TO_ATTACK_TYPE[segmentLabel] : null;
      if (!seq) return null;
      const skill = new FlamingCinders({ level, operatorPotential: potential });
      // Enhanced sequences have separate multiplier methods
      switch (seq) {
        case BasicAttackType.SEQUENCE_1: return skill.getEnhancedSeq1Multiplier(level, potential);
        case BasicAttackType.SEQUENCE_2: return skill.getEnhancedSeq2Multiplier(level, potential);
        case BasicAttackType.SEQUENCE_3: return skill.getEnhancedSeq3Multiplier(level, potential);
        case BasicAttackType.SEQUENCE_4: return skill.getEnhancedSeq4Multiplier(level, potential);
        case BasicAttackType.SEQUENCE_5: return skill.getEnhancedSeq5Multiplier(level, potential);
        default: return skill.getBasicAttackSequenceMultiplier(seq, level, potential);
      }
    }
    case CombatSkillsType.SMOULDERING_FIRE:
    case CombatSkillsType.SMOULDERING_FIRE_ENHANCED:
    case CombatSkillsType.SMOULDERING_FIRE_EMPOWERED:
    case CombatSkillsType.SMOULDERING_FIRE_ENHANCED_EMPOWERED: {
      const skill = new SmoulderingFire({ level, operatorPotential: potential });
      return skill.getBaseExplosionDmgMultiplier(level);
    }
    case CombatSkillsType.SEETHE:
      return new Seethe({ level, operatorPotential: potential }).getDmgMultiplier(level);
    case CombatSkillsType.TWILIGHT:
      return null; // Duration-based ultimate, no per-hit damage
    default:
      return null;
  }
}

function antalMultiplier(
  skillName: CombatSkillsType,
  segmentLabel: string | undefined,
  level: SkillLevel,
  potential: Potential,
): number | null {
  switch (skillName) {
    case CombatSkillsType.EXCHANGE_CURRENT: {
      const seq = segmentLabel ? SEGMENT_LABEL_TO_ATTACK_TYPE[segmentLabel] : null;
      if (!seq) return null;
      const skill = new ExchangeCurrent({ level, operatorPotential: potential });
      return skill.getBasicAttackSequenceMultiplier(seq, level, potential);
    }
    case CombatSkillsType.SPECIFIED_RESEARCH_SUBJECT:
      return new SpecifiedResearchSubject({ level, operatorPotential: potential }).getDmgMultiplier(level);
    case CombatSkillsType.EMP_TEST_SITE:
      return new EmpTestSite({ level, operatorPotential: potential }).getDmgMultiplier(level);
    case CombatSkillsType.OVERCLOCKED_MOMENT:
      return null; // Amp buff ultimate, no direct damage
    default:
      return null;
  }
}

function wulfgardMultiplier(
  skillName: CombatSkillsType,
  segmentLabel: string | undefined,
  level: SkillLevel,
  potential: Potential,
): number | null {
  switch (skillName) {
    case CombatSkillsType.RAPID_FIRE_AKIMBO: {
      const seq = segmentLabel ? SEGMENT_LABEL_TO_ATTACK_TYPE[segmentLabel] : null;
      if (!seq) return null;
      const skill = new RapidFireAkimbo({ level, operatorPotential: potential });
      return skill.getBasicAttackSequenceMultiplier(seq, level, potential);
    }
    case CombatSkillsType.THERMITE_TRACERS:
      return new ThermiteTracers({ level, operatorPotential: potential }).getDmgMultiplier(level);
    case CombatSkillsType.FRAG_GRENADE_BETA:
      return new FragGrenadeBeta({ level, operatorPotential: potential }).getDmgMultiplier(level);
    case CombatSkillsType.WOLVEN_FURY:
      return new WolvenFury({ level, operatorPotential: potential }).getDmgMultiplierPerSeq(level);
    default:
      return null;
  }
}

function ardeliaMultiplier(
  skillName: CombatSkillsType,
  segmentLabel: string | undefined,
  level: SkillLevel,
  potential: Potential,
): number | null {
  switch (skillName) {
    case CombatSkillsType.ROCKY_WHISPERS: {
      const seq = segmentLabel ? SEGMENT_LABEL_TO_ATTACK_TYPE[segmentLabel] : null;
      if (!seq) return null;
      const skill = new RockyWhispers({ level, operatorPotential: potential });
      return skill.getBasicAttackSequenceMultiplier(seq, level, potential);
    }
    case CombatSkillsType.DOLLY_RUSH:
      return new DollyRush({ level, operatorPotential: potential }).getDmgMultiplier(level);
    case CombatSkillsType.ERUPTION_COLUMN:
      return new EruptionColumn({ level, operatorPotential: potential }).getDmgMultiplier(level);
    case CombatSkillsType.WOOLY_PARTY:
      return new WoolyParty({ level, operatorPotential: potential }).getDmgMultiplier(level);
    default:
      return null;
  }
}

function avywennaMultiplier(
  skillName: CombatSkillsType,
  segmentLabel: string | undefined,
  level: SkillLevel,
  potential: Potential,
): number | null {
  switch (skillName) {
    case CombatSkillsType.THUNDERLANCE_BLITZ: {
      const seq = segmentLabel ? SEGMENT_LABEL_TO_ATTACK_TYPE[segmentLabel] : null;
      if (!seq) return null;
      const skill = new ThunderlanceBlitz({ level, operatorPotential: potential });
      return skill.getBasicAttackSequenceMultiplier(seq, level, potential);
    }
    case CombatSkillsType.THUNDERLANCE_INTERDICTION:
      return new ThunderlanceInterdiction({ level, operatorPotential: potential }).getDmgMultiplier(level);
    case CombatSkillsType.THUNDERLANCE_STRIKE:
      return new ThunderlanceStrike({ level, operatorPotential: potential }).getDmgMultiplier(level);
    case CombatSkillsType.THUNDERLANCE_FINAL_SHOCK:
      return new ThunderlanceFinalShock({ level, operatorPotential: potential }).getDmgMultiplier(level);
    default:
      return null;
  }
}

function aleshMultiplier(
  skillName: CombatSkillsType,
  segmentLabel: string | undefined,
  level: SkillLevel,
  potential: Potential,
): number | null {
  switch (skillName) {
    case CombatSkillsType.ROD_CASTING: {
      const seq = segmentLabel ? SEGMENT_LABEL_TO_ATTACK_TYPE[segmentLabel] : null;
      if (!seq) return null;
      return new RodCasting({ level, operatorPotential: potential }).getBasicAttackSequenceMultiplier(seq, level, potential);
    }
    case CombatSkillsType.UNCONVENTIONAL_LURE:
      return new UnconventionalLure({ level, operatorPotential: potential }).getDmgMultiplier(level);
    case CombatSkillsType.AUGER_ANGLING:
      return new AugerAngling({ level, operatorPotential: potential }).getDmgMultiplier(level);
    case CombatSkillsType.ONE_MONSTER_CATCH:
      return new OneMonsterCatch({ level, operatorPotential: potential }).getDmgMultiplier(level);
    default:
      return null;
  }
}

function arclightMultiplier(
  skillName: CombatSkillsType,
  segmentLabel: string | undefined,
  level: SkillLevel,
  potential: Potential,
): number | null {
  switch (skillName) {
    case CombatSkillsType.SEEK_AND_HUNT: {
      const seq = segmentLabel ? SEGMENT_LABEL_TO_ATTACK_TYPE[segmentLabel] : null;
      if (!seq) return null;
      return new SeekAndHunt({ level, operatorPotential: potential }).getBasicAttackSequenceMultiplier(seq, level, potential);
    }
    case CombatSkillsType.TEMPESTUOUS_ARC:
      return new TempestuousArc({ level, operatorPotential: potential }).getDmgMultiplier(level);
    case CombatSkillsType.PEAL_OF_THUNDER:
      return new PealOfThunder({ level, operatorPotential: potential }).getDmgMultiplier(level);
    case CombatSkillsType.EXPLODING_BLITZ:
      return new ExplodingBlitz({ level, operatorPotential: potential }).getDmgMultiplier(level);
    default:
      return null;
  }
}

function catcherMultiplier(
  skillName: CombatSkillsType,
  segmentLabel: string | undefined,
  level: SkillLevel,
  potential: Potential,
): number | null {
  switch (skillName) {
    case CombatSkillsType.RIGID_INTERDICTION_BASIC: {
      const seq = segmentLabel ? SEGMENT_LABEL_TO_ATTACK_TYPE[segmentLabel] : null;
      if (!seq) return null;
      return new RigidInterdictionBasic({ level, operatorPotential: potential }).getBasicAttackSequenceMultiplier(seq, level, potential);
    }
    case CombatSkillsType.RIGID_INTERDICTION:
      return new RigidInterdiction({ level, operatorPotential: potential }).getDmgMultiplier(level);
    case CombatSkillsType.TIMELY_SUPPRESSION:
      return new TimelySuppression({ level, operatorPotential: potential }).getDmgMultiplier(level);
    case CombatSkillsType.TEXTBOOK_ASSAULT:
      return new TextbookAssault({ level, operatorPotential: potential }).getDmgMultiplier(level);
    default:
      return null;
  }
}

function chenQianyuMultiplier(
  skillName: CombatSkillsType,
  segmentLabel: string | undefined,
  level: SkillLevel,
  potential: Potential,
): number | null {
  switch (skillName) {
    case CombatSkillsType.SOARING_BREAK: {
      const seq = segmentLabel ? SEGMENT_LABEL_TO_ATTACK_TYPE[segmentLabel] : null;
      if (!seq) return null;
      return new SoaringBreak({ level, operatorPotential: potential }).getBasicAttackSequenceMultiplier(seq, level, potential);
    }
    case CombatSkillsType.ASCENDING_STRIKE:
      return new AscendingStrike({ level, operatorPotential: potential }).getDmgMultiplier(level);
    case CombatSkillsType.SOAR_TO_THE_STARS:
      return new SoarToTheStars({ level, operatorPotential: potential }).getDmgMultiplier(level);
    case CombatSkillsType.BLADE_GALE:
      return new BladeGale({ level, operatorPotential: potential }).getDmgMultiplier(level);
    default:
      return null;
  }
}

function daPanMultiplier(
  skillName: CombatSkillsType,
  segmentLabel: string | undefined,
  level: SkillLevel,
  potential: Potential,
): number | null {
  switch (skillName) {
    case CombatSkillsType.ROLLING_CUT: {
      const seq = segmentLabel ? SEGMENT_LABEL_TO_ATTACK_TYPE[segmentLabel] : null;
      if (!seq) return null;
      return new RollingCut({ level, operatorPotential: potential }).getBasicAttackSequenceMultiplier(seq, level, potential);
    }
    case CombatSkillsType.FLIP_DA_WOK:
      return new FlipDaWok({ level, operatorPotential: potential }).getDmgMultiplier(level);
    case CombatSkillsType.MORE_SPICE:
      return new MoreSpice({ level, operatorPotential: potential }).getDmgMultiplier(level);
    case CombatSkillsType.CHOP_N_DUNK:
      return new ChopNDunk({ level, operatorPotential: potential }).getDmgMultiplier(level);
    default:
      return null;
  }
}

function emberMultiplier(
  skillName: CombatSkillsType,
  segmentLabel: string | undefined,
  level: SkillLevel,
  potential: Potential,
): number | null {
  switch (skillName) {
    case CombatSkillsType.SWORD_ART_OF_ASSAULT: {
      const seq = segmentLabel ? SEGMENT_LABEL_TO_ATTACK_TYPE[segmentLabel] : null;
      if (!seq) return null;
      return new SwordArtOfAssault({ level, operatorPotential: potential }).getBasicAttackSequenceMultiplier(seq, level, potential);
    }
    case CombatSkillsType.FORWARD_MARCH:
      return new ForwardMarch({ level, operatorPotential: potential }).getDmgMultiplier(level);
    case CombatSkillsType.FRONTLINE_SUPPORT:
      return new FrontlineSupport({ level, operatorPotential: potential }).getDmgMultiplier(level);
    case CombatSkillsType.RE_IGNITED_OATH:
      return new ReIgnitedOath({ level, operatorPotential: potential }).getDmgMultiplier(level);
    default:
      return null;
  }
}

function endministratorMultiplier(
  skillName: CombatSkillsType,
  segmentLabel: string | undefined,
  level: SkillLevel,
  potential: Potential,
): number | null {
  switch (skillName) {
    case CombatSkillsType.DESTRUCTIVE_SEQUENCE: {
      const seq = segmentLabel ? SEGMENT_LABEL_TO_ATTACK_TYPE[segmentLabel] : null;
      if (!seq) return null;
      return new DestructiveSequence({ level, operatorPotential: potential }).getBasicAttackSequenceMultiplier(seq, level, potential);
    }
    case CombatSkillsType.CONSTRUCTIVE_SEQUENCE:
      return new ConstructiveSequence({ level, operatorPotential: potential }).getDmgMultiplier(level);
    case CombatSkillsType.SEALING_SEQUENCE:
      return new SealingSequence({ level, operatorPotential: potential }).getDmgMultiplier(level);
    case CombatSkillsType.BOMBARDMENT_SEQUENCE:
      return new BombardmentSequence({ level, operatorPotential: potential }).getDmgMultiplier(level);
    default:
      return null;
  }
}

function estellaMultiplier(
  skillName: CombatSkillsType,
  segmentLabel: string | undefined,
  level: SkillLevel,
  potential: Potential,
): number | null {
  switch (skillName) {
    case CombatSkillsType.AUDIO_NOISE: {
      const seq = segmentLabel ? SEGMENT_LABEL_TO_ATTACK_TYPE[segmentLabel] : null;
      if (!seq) return null;
      return new AudioNoise({ level, operatorPotential: potential }).getBasicAttackSequenceMultiplier(seq, level, potential);
    }
    case CombatSkillsType.ONOMATOPOEIA:
      return new Onomatopoeia({ level, operatorPotential: potential }).getDmgMultiplier(level);
    case CombatSkillsType.DISTORTION:
      return new Distortion({ level, operatorPotential: potential }).getDmgMultiplier(level);
    case CombatSkillsType.TREMOLO:
      return new Tremolo({ level, operatorPotential: potential }).getDmgMultiplier(level);
    default:
      return null;
  }
}

function fluoriteMultiplier(
  skillName: CombatSkillsType,
  segmentLabel: string | undefined,
  level: SkillLevel,
  potential: Potential,
): number | null {
  switch (skillName) {
    case CombatSkillsType.SIGNATURE_GUN_KATA: {
      const seq = segmentLabel ? SEGMENT_LABEL_TO_ATTACK_TYPE[segmentLabel] : null;
      if (!seq) return null;
      return new SignatureGunKata({ level, operatorPotential: potential }).getBasicAttackSequenceMultiplier(seq, level, potential);
    }
    case CombatSkillsType.TINY_SURPRISE:
      return new TinySurprise({ level, operatorPotential: potential }).getDmgMultiplier(level);
    case CombatSkillsType.FREE_GIVEAWAY:
      return new FreeGiveaway({ level, operatorPotential: potential }).getDmgMultiplier(level);
    case CombatSkillsType.APEX_PRANKSTER:
      return new ApexPrankster({ level, operatorPotential: potential }).getDmgMultiplier(level);
    default:
      return null;
  }
}

function gilbertaMultiplier(
  skillName: CombatSkillsType,
  segmentLabel: string | undefined,
  level: SkillLevel,
  potential: Potential,
): number | null {
  switch (skillName) {
    case CombatSkillsType.BEAM_COHESION_ARTS: {
      const seq = segmentLabel ? SEGMENT_LABEL_TO_ATTACK_TYPE[segmentLabel] : null;
      if (!seq) return null;
      return new BeamCohesionArts({ level, operatorPotential: potential }).getBasicAttackSequenceMultiplier(seq, level, potential);
    }
    case CombatSkillsType.GRAVITY_MODE:
      return new GravityMode({ level, operatorPotential: potential }).getDmgMultiplier(level);
    case CombatSkillsType.MATRIX_DISPLACEMENT:
      return new MatrixDisplacement({ level, operatorPotential: potential }).getDmgMultiplier(level);
    case CombatSkillsType.GRAVITY_FIELD:
      return new GravityField({ level, operatorPotential: potential }).getDmgMultiplier(level);
    default:
      return null;
  }
}

function lastRiteMultiplier(
  skillName: CombatSkillsType,
  segmentLabel: string | undefined,
  level: SkillLevel,
  potential: Potential,
): number | null {
  switch (skillName) {
    case CombatSkillsType.DANCE_OF_RIME: {
      const seq = segmentLabel ? SEGMENT_LABEL_TO_ATTACK_TYPE[segmentLabel] : null;
      if (!seq) return null;
      return new DanceOfRime({ level, operatorPotential: potential }).getBasicAttackSequenceMultiplier(seq, level, potential);
    }
    case CombatSkillsType.ESOTERIC_LEGACY:
      return new EsotericLegacy({ level, operatorPotential: potential }).getDmgMultiplier(level);
    case CombatSkillsType.WINTERS_DEVOURER:
      return new WintersDevourer({ level, operatorPotential: potential }).getDmgMultiplier(level);
    case CombatSkillsType.VIGIL_SERVICES:
      return new VigilServices({ level, operatorPotential: potential }).getDmgMultiplier(level);
    default:
      return null;
  }
}

function lifengMultiplier(
  skillName: CombatSkillsType,
  segmentLabel: string | undefined,
  level: SkillLevel,
  potential: Potential,
): number | null {
  switch (skillName) {
    case CombatSkillsType.RUINATION: {
      const seq = segmentLabel ? SEGMENT_LABEL_TO_ATTACK_TYPE[segmentLabel] : null;
      if (!seq) return null;
      return new Ruination({ level, operatorPotential: potential }).getBasicAttackSequenceMultiplier(seq, level, potential);
    }
    case CombatSkillsType.TURBID_AVATAR:
      return new TurbidAvatar({ level, operatorPotential: potential }).getDmgMultiplier(level);
    case CombatSkillsType.ASPECT_OF_WRATH:
      return new AspectOfWrath({ level, operatorPotential: potential }).getDmgMultiplier(level);
    case CombatSkillsType.HEART_OF_THE_UNMOVING:
      return new HeartOfTheUnmoving({ level, operatorPotential: potential }).getDmgMultiplier(level);
    default:
      return null;
  }
}

function perlicaMultiplier(
  skillName: CombatSkillsType,
  segmentLabel: string | undefined,
  level: SkillLevel,
  potential: Potential,
): number | null {
  switch (skillName) {
    case CombatSkillsType.PROTOCOL_ALPHA_BREACH: {
      const seq = segmentLabel ? SEGMENT_LABEL_TO_ATTACK_TYPE[segmentLabel] : null;
      if (!seq) return null;
      return new ProtocolAlphaBreach({ level, operatorPotential: potential }).getBasicAttackSequenceMultiplier(seq, level, potential);
    }
    case CombatSkillsType.PROTOCOL_OMEGA_STRIKE:
      return new ProtocolOmegaStrike({ level, operatorPotential: potential }).getDmgMultiplier(level);
    case CombatSkillsType.INSTANT_PROTOCOL_CHAIN:
      return new InstantProtocolChain({ level, operatorPotential: potential }).getDmgMultiplier(level);
    case CombatSkillsType.PROTOCOL_EPSILON:
      return new ProtocolEpsilon({ level, operatorPotential: potential }).getDmgMultiplier(level);
    default:
      return null;
  }
}

function pogranichnikMultiplier(
  skillName: CombatSkillsType,
  segmentLabel: string | undefined,
  level: SkillLevel,
  potential: Potential,
): number | null {
  switch (skillName) {
    case CombatSkillsType.ALL_OUT_OFFENSIVE: {
      const seq = segmentLabel ? SEGMENT_LABEL_TO_ATTACK_TYPE[segmentLabel] : null;
      if (!seq) return null;
      return new AllOutOffensive({ level, operatorPotential: potential }).getBasicAttackSequenceMultiplier(seq, level, potential);
    }
    case CombatSkillsType.THE_PULVERIZING_FRONT:
      return new ThePulverizingFront({ level, operatorPotential: potential }).getDmgMultiplier(level);
    case CombatSkillsType.FULL_MOON_SLASH:
      return new FullMoonSlash({ level, operatorPotential: potential }).getDmgMultiplier(level);
    case CombatSkillsType.SHIELDGUARD_BANNER:
      return new ShieldguardBanner({ level, operatorPotential: potential }).getDmgMultiplier(level);
    default:
      return null;
  }
}

function snowshineMultiplier(
  skillName: CombatSkillsType,
  segmentLabel: string | undefined,
  level: SkillLevel,
  potential: Potential,
): number | null {
  switch (skillName) {
    case CombatSkillsType.HYPOTHERMIC_ASSAULT: {
      const seq = segmentLabel ? SEGMENT_LABEL_TO_ATTACK_TYPE[segmentLabel] : null;
      if (!seq) return null;
      return new HypothermicAssault({ level, operatorPotential: potential }).getBasicAttackSequenceMultiplier(seq, level, potential);
    }
    case CombatSkillsType.SATURATED_DEFENSE:
      return new SaturatedDefense({ level, operatorPotential: potential }).getDmgMultiplier(level);
    case CombatSkillsType.POLAR_RESCUE:
      return null; // Healing skill, no damage
    case CombatSkillsType.FRIGID_SNOWFIELD:
      return new FrigidSnowfield({ level, operatorPotential: potential }).getDmgMultiplier(level);
    default:
      return null;
  }
}

function xaihiMultiplier(
  skillName: CombatSkillsType,
  segmentLabel: string | undefined,
  level: SkillLevel,
  potential: Potential,
): number | null {
  switch (skillName) {
    case CombatSkillsType.XAIHI_BASIC_ATTACK: {
      const seq = segmentLabel ? SEGMENT_LABEL_TO_ATTACK_TYPE[segmentLabel] : null;
      if (!seq) return null;
      return new XaihiBasicAttack({ level, operatorPotential: potential }).getBasicAttackSequenceMultiplier(seq, level, potential);
    }
    case CombatSkillsType.DISTRIBUTED_DOS:
      return null; // Healing/buff skill, no damage
    case CombatSkillsType.STRESS_TESTING:
      return new StressTesting({ level, operatorPotential: potential }).getDmgMultiplier(level);
    case CombatSkillsType.STACK_OVERFLOW:
      return null; // Amp buff, no damage
    default:
      return null;
  }
}

function yvonneMultiplier(
  skillName: CombatSkillsType,
  segmentLabel: string | undefined,
  level: SkillLevel,
  potential: Potential,
): number | null {
  switch (skillName) {
    case CombatSkillsType.EXUBERANT_TRIGGER: {
      const seq = segmentLabel ? SEGMENT_LABEL_TO_ATTACK_TYPE[segmentLabel] : null;
      if (!seq) return null;
      return new ExuberantTrigger({ level, operatorPotential: potential }).getBasicAttackSequenceMultiplier(seq, level, potential);
    }
    case CombatSkillsType.EXUBERANT_TRIGGER_ENHANCED: {
      const seq = segmentLabel ? SEGMENT_LABEL_TO_ATTACK_TYPE[segmentLabel] : null;
      if (!seq) return null;
      const skill = new ExuberantTrigger({ level, operatorPotential: potential });
      switch (seq) {
        case BasicAttackType.SEQUENCE_1: return skill.getEnhancedSeq1Multiplier(level, potential);
        case BasicAttackType.SEQUENCE_2: return skill.getEnhancedSeq2Multiplier(level, potential);
        case BasicAttackType.SEQUENCE_3: return skill.getEnhancedSeq3Multiplier(level, potential);
        case BasicAttackType.SEQUENCE_4: return skill.getEnhancedSeq4Multiplier(level, potential);
        case BasicAttackType.SEQUENCE_5: return skill.getEnhancedSeq5Multiplier(level, potential);
        default: return skill.getBasicAttackSequenceMultiplier(seq, level, potential);
      }
    }
    case CombatSkillsType.BRR_BRR_BOMB:
      return new BrrBrrBomb({ level, operatorPotential: potential }).getDmgMultiplier(level);
    case CombatSkillsType.FLASHFREEZER:
      return new Flashfreezer({ level, operatorPotential: potential }).getDmgMultiplier(level);
    case CombatSkillsType.CRYOBLASTING_PISTOLIER:
      return new CryoblastingPistolier({ level, operatorPotential: potential }).getDmgMultiplier(level);
    default:
      return null;
  }
}

// ── Operator → multiplier function map ───────────────────────────────────────

const MULTIPLIER_FNS: Record<string, MultiplierFn> = {
  akekuri: akekuriMultiplier,
  laevatain: laevatainMultiplier,
  antal: antalMultiplier,
  wulfgard: wulfgardMultiplier,
  ardelia: ardeliaMultiplier,
  avywenna: avywennaMultiplier,
  alesh: aleshMultiplier,
  arclight: arclightMultiplier,
  catcher: catcherMultiplier,
  chenQianyu: chenQianyuMultiplier,
  daPan: daPanMultiplier,
  ember: emberMultiplier,
  endministrator: endministratorMultiplier,
  estella: estellaMultiplier,
  fluorite: fluoriteMultiplier,
  gilberta: gilbertaMultiplier,
  lastRite: lastRiteMultiplier,
  lifeng: lifengMultiplier,
  perlica: perlicaMultiplier,
  pogranichnik: pogranichnikMultiplier,
  snowshine: snowshineMultiplier,
  xaihi: xaihiMultiplier,
  yvonne: yvonneMultiplier,
};

/**
 * Look up the skill multiplier for a specific frame tick.
 *
 * Returns null if the operator doesn't have multiplier data, or
 * the skill doesn't deal damage (e.g. SP recovery ultimates).
 */
export function getSkillMultiplier(
  operatorId: string,
  skillName: CombatSkillsType,
  segmentLabel: string | undefined,
  level: SkillLevel,
  potential: Potential,
): number | null {
  const fn = MULTIPLIER_FNS[operatorId];
  if (!fn) return null;
  return fn(skillName, segmentLabel, level, potential);
}
