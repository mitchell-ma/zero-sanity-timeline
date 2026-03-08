import { BasicAttackType, ElementType } from "../../consts/enums";
import { BasicAttackEventFrame } from "./basicAttackEventFrame";
import { BasicSkillEventFrame } from "./basicSkillEventFrame";
import { ComboSkillEventFrame } from "./comboSkillEventFrame";
import { CombatSkillEventFrame } from "./combatSkillEventFrame";

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

// ── Finisher Attack ──────────────────────────────────────────────────────────

/**
 * Finisher attack frame for Laevatain's basic attack chain.
 * Consumes all heat infliction stacks from the enemy target and grants
 * MeltingFlameStatus at a 1:1 exchange ratio (max 4 stacks).
 */
export class FinisherAttackEventFrame extends CombatSkillEventFrame {
  /** Number of heat infliction stacks consumed from the enemy. */
  consumedStacks: number;

  /** Number of MeltingFlame stacks granted (= consumedStacks, capped at 4). */
  grantedMeltingFlameStacks: number;

  constructor(params: {
    offsetFrame?: number;
    hitDelayFrames?: number;
    consumedStacks?: number;
  }) {
    super({
      offsetFrame: params.offsetFrame,
      hitDelayFrames: params.hitDelayFrames,
      element: ElementType.HEAT,
    });
    this.consumedStacks = params.consumedStacks ?? 0;
    this.grantedMeltingFlameStacks = Math.min(this.consumedStacks, 4);
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
