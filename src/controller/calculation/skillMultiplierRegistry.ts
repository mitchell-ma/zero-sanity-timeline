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

// ── Operator → multiplier function map ───────────────────────────────────────

const MULTIPLIER_FNS: Record<string, MultiplierFn> = {
  akekuri: akekuriMultiplier,
  laevatain: laevatainMultiplier,
  antal: antalMultiplier,
  wulfgard: wulfgardMultiplier,
  ardelia: ardeliaMultiplier,
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
