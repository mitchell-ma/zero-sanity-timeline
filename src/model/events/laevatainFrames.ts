import { BasicAttackType } from "../enums";
import { BasicAttackEventFrame } from "./basicAttackEventFrame";
import { BasicSkillEventFrame } from "./basicSkillEventFrame";
import { ComboSkillEventFrame } from "./comboSkillEventFrame";

// ── Flaming Cinders ───────────────────────────────────────────────────────────

export class FlamingCindersFrame extends BasicAttackEventFrame {
  constructor(params: { sequence: BasicAttackType; offsetFrame?: number }) {
    super(params);
  }
}

export class TwilightEnhancedFlamingCindersFrame extends BasicAttackEventFrame {
  constructor(params: {
    sequence:
      | BasicAttackType.SEQUENCE_1
      | BasicAttackType.SEQUENCE_2
      | BasicAttackType.SEQUENCE_3
      | BasicAttackType.SEQUENCE_4
      | BasicAttackType.SEQUENCE_5
      | BasicAttackType.FINAL_STRIKE;
    offsetFrame?: number;
  }) {
    super(params);
  }
}

// ── Smouldering Fire ──────────────────────────────────────────────────────────

export class SmoulderingFireExplosionFrame extends BasicSkillEventFrame {}

export class SmoulderingFireDotFrame extends BasicSkillEventFrame {}

export class SmoulderingFireAdditionalAtkFrame extends BasicSkillEventFrame {}

export class SmoulderingFireUltBatkSeq1Frame extends BasicSkillEventFrame {}

export class SmoulderingFireUltBatkSeq2Frame extends BasicSkillEventFrame {}

export class SmoulderingFireUltAdditionalAtkFrame extends BasicSkillEventFrame {}

// ── Seethe ────────────────────────────────────────────────────────────────────

export class SeetheFrame extends ComboSkillEventFrame {}
