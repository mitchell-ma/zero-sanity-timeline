/**
 * Weapon skill effect data registry.
 *
 * Maps weapon names to their triggered named skill effects.
 * Used by columnBuilder to create weapon buff/debuff subtimeline columns.
 *
 * Weapons with only passive stat boosts (no triggered named skill) are omitted.
 */
import { StatType } from './enums';
import { SubjectType, VerbType, ObjectType } from './semantics';
import type { Interaction } from './semantics';

// ── Trigger interaction shorthand ────────────────────────────────────────────
const _I = (s: any, v: any, o: any, x?: Partial<Interaction>): Interaction => ({ subjectType: s, verbType: v, objectType: o, ...x } as Interaction);
const THIS = SubjectType.THIS_OPERATOR;
const ENEMY = SubjectType.ENEMY;
const PERFORM = VerbType.PERFORM;
const APPLY = VerbType.APPLY;
const RECOVER = VerbType.RECOVER;
const CONSUME = VerbType.CONSUME;
const IS = VerbType.IS;
const HIT = VerbType.HIT;

// ── Types ────────────────────────────────────────────────────────────────────

/** Target of a weapon skill effect. */
export type WeaponEffectTarget = 'wielder' | 'team' | 'enemy';

/** A single buff/debuff applied by a weapon skill effect. */
export interface WeaponEffectBuff {
  /** Stat type affected (e.g. ATTACK_BONUS, PHYSICAL_DAMAGE_BONUS). */
  stat: StatType | 'PROTECTION' | 'DEF' | 'TREATMENT_EFFICIENCY' | 'SHIELD';
  /** Value at rank 1. */
  valueMin: number;
  /** Value at max rank. */
  valueMax: number;
  /** Whether this buff is applied per stack (if stacking). */
  perStack?: boolean;
}

/** A triggered weapon skill effect. */
export interface WeaponSkillEffect {
  /** Named skill label (e.g. "Twilight: Blazing Wail"). */
  label: string;
  /** Wiki description of the triggered effect mechanic. */
  description?: string;
  /** WeaponSkillType enum key for this effect. */
  skillKey: string;
  /** Trigger condition(s) — any match activates. */
  triggers: Interaction[];
  /** Who receives the buff: wielder, team, or enemy. */
  target: WeaponEffectTarget;
  /** Duration in seconds. */
  durationSeconds: number;
  /** Max stacks (1 = no stacking, just refreshes). */
  maxStacks: number;
  /** Cooldown in seconds (0 = no cooldown). */
  cooldownSeconds: number;
  /** Buffs/debuffs applied by this effect. */
  buffs: WeaponEffectBuff[];
  /** Additional notes for display. */
  note?: string;
}

/** All triggered effects for a weapon. */
export interface WeaponEffectsEntry {
  /** The weapon's display name (must match WEAPONS registry name). */
  weaponName: string;
  /** All triggered effects (most weapons have 1, some have 2+). */
  effects: WeaponSkillEffect[];
}

// ── Data ─────────────────────────────────────────────────────────────────────

export const WEAPON_SKILL_EFFECTS: WeaponEffectsEntry[] = [
  // ── Sword ─────────────────────────────────────────────────────────────────

  // Never Rest — Flow: Reincarnation (SP Recovery)
  {
    weaponName: 'Never Rest',
    effects: [
      {
        label: 'Reincarnation',
        description: "After the wielder's skill recovers SP, the wielder gains Physical DMG Dealt bonus for 30s. Max 5 stacks. Duration of each stack is counted separately.",
        skillKey: 'NEVER_REST_FLOW_REINCARNATION',
        triggers: [_I(THIS, RECOVER, ObjectType.SKILL_POINT)],
        target: 'wielder',
        durationSeconds: 30,
        maxStacks: 5,
        cooldownSeconds: 0,
        buffs: [
          { stat: StatType.PHYSICAL_DAMAGE_BONUS, valueMin: 0.05, valueMax: 0.10, perStack: true },
        ],
      },
      {
        label: 'Reincarnation (Team)',
        description: "After the wielder's skill recovers SP, other operators in the team gain ATK bonus for 30s. Max 5 stacks. Duration of each stack is counted separately.",
        skillKey: 'NEVER_REST_FLOW_REINCARNATION',
        triggers: [_I(THIS, RECOVER, ObjectType.SKILL_POINT)],
        target: 'team',
        durationSeconds: 30,
        maxStacks: 5,
        cooldownSeconds: 0,
        buffs: [
          { stat: StatType.ATTACK_BONUS, valueMin: 0.025, valueMax: 0.05, perStack: true },
        ],
      },
    ],
  },

  // Thermite Cutter — Flow: Thermal Release (SP Recovery)
  {
    weaponName: 'Thermite Cutter',
    effects: [
      {
        label: 'Thermal Release',
        description: "After the wielder's skill recovers SP or grants a Link state, the wielder gains ATK bonus for 20s. Max 2 stacks.",
        skillKey: 'THERMITE_CUTTER_FLOW_THERMAL_RELEASE',
        triggers: [_I(THIS, RECOVER, ObjectType.SKILL_POINT)],
        target: 'wielder',
        durationSeconds: 20,
        maxStacks: 2,
        cooldownSeconds: 0,
        buffs: [
          { stat: StatType.ATTACK_BONUS, valueMin: 0.10, valueMax: 0.28, perStack: true },
        ],
      },
      {
        label: 'Thermal Release (Team)',
        description: "After the wielder's skill recovers SP or grants a Link state, the entire team gains ATK bonus for 20s. Max 2 stacks.",
        skillKey: 'THERMITE_CUTTER_FLOW_THERMAL_RELEASE',
        triggers: [_I(THIS, RECOVER, ObjectType.SKILL_POINT)],
        target: 'team',
        durationSeconds: 20,
        maxStacks: 2,
        cooldownSeconds: 0,
        buffs: [
          { stat: StatType.ATTACK_BONUS, valueMin: 0.05, valueMax: 0.14, perStack: true },
        ],
      },
    ],
  },

  // Forgeborn Scathe — Twilight: Blazing Wail (Cast Ultimate)
  {
    weaponName: 'Forgeborn Scathe',
    effects: [{
      label: 'Blazing Wail',
      description: 'When the wielder casts an ultimate, the wielder gains Basic Attack DMG Dealt and Heat DMG Dealt bonus for 20s. Effects of the same name cannot stack.',
      skillKey: 'FORGEBORN_SCATHE_TWILIGHT_BLAZING_WAIL',
      triggers: [_I(THIS, PERFORM, ObjectType.ULTIMATE)],
      target: 'wielder',
      durationSeconds: 20,
      maxStacks: 1,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.BASIC_ATTACK_DAMAGE_BONUS, valueMin: 0.75, valueMax: 2.10 },
        { stat: StatType.HEAT_DAMAGE_BONUS, valueMin: 0.16, valueMax: 0.448 },
      ],
    }],
  },

  // Eminent Repute — Brutality: Disciplinarian (Consume Vulnerability)
  {
    weaponName: 'Eminent Repute',
    effects: [{
      label: 'Disciplinarian',
      description: 'After the wielder consumes Vulnerability stack(s), the wielder gains ATK bonus scaling with consumed stacks for 20s. Other operators in the team gain half of this buff.',
      skillKey: 'EMINENT_REPUTE_BRUTALITY_DISCIPLINARIAN',
      triggers: [_I(THIS, CONSUME, ObjectType.STATUS, { objectId: "VULNERABILITY" })],
      target: 'wielder',
      durationSeconds: 20,
      maxStacks: 1,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.ATTACK_BONUS, valueMin: 0.05, valueMax: 0.10 },
      ],
      note: 'ATK bonus scales with consumed stacks; team gets half',
    }],
  },

  // White Night Nova — Infliction: White Night Nova (Apply Arts Reaction)
  {
    weaponName: 'White Night Nova',
    effects: [{
      label: 'White Night Nova',
      description: 'After the wielder applies Combustion or Electrification, the wielder gains Arts DMG Dealt and Arts Intensity bonus for 15s. Effects of the same name cannot stack.',
      skillKey: 'WHITE_NIGHT_NOVA_INFLICTION_WHITE_NIGHT_NOVA',
      triggers: [_I(THIS, APPLY, ObjectType.REACTION)],
      target: 'wielder',
      durationSeconds: 15,
      maxStacks: 1,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.ARTS_DAMAGE_BONUS, valueMin: 0.12, valueMax: 0.336 },
        { stat: StatType.ARTS_INTENSITY, valueMin: 25, valueMax: 70 },
      ],
    }],
  },

  // Grand Vision — Infliction: Long Time Wish (Apply Solidification/Crystals)
  {
    weaponName: 'Grand Vision',
    effects: [{
      label: 'Long Time Wish',
      description: 'When the wielder applies Originium Crystals or Solidification, during the next battle skill or ultimate cast within 20s, the wielder gains Physical DMG Dealt bonus.',
      skillKey: 'GRAND_VISION_INFLICTION_LONG_TIME_WISH',
      triggers: [_I(ENEMY, IS, ObjectType.SOLIDIFIED)],
      target: 'wielder',
      durationSeconds: 20,
      maxStacks: 1,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.ARTS_INTENSITY, valueMin: 30, valueMax: 60 },
        { stat: StatType.PHYSICAL_DAMAGE_BONUS, valueMin: 0.36, valueMax: 0.72 },
      ],
      note: 'Phys DMG bonus on next battle/ult skill',
    }],
  },

  // Umbral Torch — Infliction: Covetous Buildup (Apply Combustion/Corrosion)
  {
    weaponName: 'Umbral Torch',
    effects: [{
      label: 'Covetous Buildup',
      description: 'Whenever Combustion or Corrosion is applied to an enemy, the wielder gains Heat DMG Dealt, Nature DMG Dealt, and ATK bonus for 20s. Max 2 stacks.',
      skillKey: 'UMBRAL_TORCH_INFLICTION_COVETOUS_BUILDUP',
      triggers: [_I(ENEMY, IS, ObjectType.COMBUSTED), _I(ENEMY, IS, ObjectType.CORRODED)],
      target: 'wielder',
      durationSeconds: 20,
      maxStacks: 2,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.HEAT_DAMAGE_BONUS, valueMin: 0.08, valueMax: 0.224, perStack: true },
        { stat: StatType.NATURE_DAMAGE_BONUS, valueMin: 0.08, valueMax: 0.224, perStack: true },
        { stat: StatType.ATTACK_BONUS, valueMin: 0.07, valueMax: 0.196, perStack: true },
      ],
    }],
  },

  // Sundering Steel — Combative: Anthem of Cinder (Apply Physical Status)
  {
    weaponName: 'Sundering Steel',
    effects: [{
      label: 'Anthem of Cinder',
      description: 'When the wielder applies a Physical Status, the wielder gains ATK bonus for 20s. Max 2 stacks.',
      skillKey: 'SUNDERING_STEEL_COMBATIVE_ANTHEM_OF_CINDER',
      triggers: [_I(THIS, APPLY, ObjectType.STATUS)],
      target: 'wielder',
      durationSeconds: 20,
      maxStacks: 2,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.ATTACK_BONUS, valueMin: 0.05, valueMax: 0.14, perStack: true },
      ],
    }],
  },

  // Aspirant — Twilight: Imposing Peak (Apply Lifted)
  {
    weaponName: 'Aspirant',
    effects: [{
      label: 'Imposing Peak',
      description: 'After the wielder applies Lifted, during the next ultimate cast within 30s, the wielder gains Physical DMG Dealt bonus. Max 3 stacks. Duration of each stack is counted separately.',
      skillKey: 'ASPIRANT_TWILIGHT_IMPOSING_PEAK',
      triggers: [_I(THIS, APPLY, ObjectType.STATUS, { objectId: "LIFTED" })],
      target: 'wielder',
      durationSeconds: 30,
      maxStacks: 3,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.PHYSICAL_DAMAGE_BONUS, valueMin: 0.12, valueMax: 0.24, perStack: true },
      ],
      note: 'Phys DMG bonus on next ult skill',
    }],
  },

  // OBJ Edge of Lightness — Flow: Unbridled Edge (SP Recovery)
  {
    weaponName: 'OBJ Edge of Lightness',
    effects: [{
      label: 'Unbridled Edge',
      description: "After the wielder's skill recovers SP, the entire team gains Heat DMG Dealt and Electric DMG Dealt bonus for 20s. Max 3 stacks.",
      skillKey: 'OBJ_EDGE_OF_LIGHTNESS_FLOW_UNBRIDLED_EDGE',
      triggers: [_I(THIS, RECOVER, ObjectType.SKILL_POINT)],
      target: 'team',
      durationSeconds: 20,
      maxStacks: 3,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.HEAT_DAMAGE_BONUS, valueMin: 0.03, valueMax: 0.084, perStack: true },
        { stat: StatType.ELECTRIC_DAMAGE_BONUS, valueMin: 0.03, valueMax: 0.084, perStack: true },
      ],
    }],
  },

  // Twelve Questions — Infliction: Sincere Interrogation (Consume Arts Reaction)
  {
    weaponName: 'Twelve Questions',
    effects: [{
      label: 'Sincere Interrogation',
      description: 'After the wielder consumes an Arts Reaction, the wielder gains ATK bonus for 20s. Max 2 stacks. Duration of each stack is counted separately.',
      skillKey: 'TWELVE_QUESTIONS_INFLICTION_SINCERE_INTERROGATION',
      triggers: [_I(THIS, CONSUME, ObjectType.REACTION)],
      target: 'wielder',
      durationSeconds: 20,
      maxStacks: 2,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.ATTACK_BONUS, valueMin: 0.075, valueMax: 0.15, perStack: true },
      ],
    }],
  },

  // Finchaser 3.0 — Suppression: Fin Chaser's Intent (Apply Solidification)
  {
    weaponName: 'Finchaser 3.0',
    effects: [{
      label: "Fin Chaser's Intent",
      description: "When the wielder's battle skill applies Solidification, target enemy suffers Cryo DMG Taken bonus for 15s. Effects of the same name cannot stack.",
      skillKey: 'FINCHASER_3_0_SUPPRESSION_FIN_CHASERS_INTENT',
      triggers: [_I(ENEMY, IS, ObjectType.SOLIDIFIED)],
      target: 'enemy',
      durationSeconds: 15,
      maxStacks: 1,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.CRYO_DAMAGE_BONUS, valueMin: 0.07, valueMax: 0.14 },
      ],
      note: 'Enemy Cryo DMG Taken (Fragility)',
    }],
  },

  // Wave Tide — Pursuit: Unending Cycle (Cast Combo)
  {
    weaponName: 'Wave Tide',
    effects: [{
      label: 'Unending Cycle',
      description: 'When the wielder casts a combo skill, the wielder gains ATK bonus for 20s. Effects of the same name cannot stack.',
      skillKey: 'WAVE_TIDE_PURSUIT_UNENDING_CYCLE',
      triggers: [_I(THIS, PERFORM, ObjectType.COMBO_SKILL)],
      target: 'wielder',
      durationSeconds: 20,
      maxStacks: 1,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.ATTACK_BONUS, valueMin: 0.12, valueMax: 0.24 },
      ],
    }],
  },

  // Contingent Measure — Suppression: Emergency Boost (Cast Battle Skill)
  {
    weaponName: 'Contingent Measure',
    effects: [{
      label: 'Emergency Boost',
      description: "When the wielder's battle skill hits the enemy, the wielder gains ATK bonus for 20s. Effects of the same name cannot stack.",
      skillKey: 'CONTINGENT_MEASURE_SUPPRESSION_EMERGENCY_BOOST',
      triggers: [_I(THIS, PERFORM, ObjectType.BATTLE_SKILL)],
      target: 'wielder',
      durationSeconds: 20,
      maxStacks: 1,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.ATTACK_BONUS, valueMin: 0.12, valueMax: 0.24 },
      ],
    }],
  },

  // ── Great Sword ───────────────────────────────────────────────────────────

  // Sundered Prince — Crusher: Princely Deterrence (Final Strike)
  {
    weaponName: 'Sundered Prince',
    effects: [{
      label: 'Princely Deterrence',
      description: 'When the wielder performs a Final Strike on the enemy, the wielder gains ATK and Stagger Efficiency bonus for 8s. If the wielder is the controlled operator, the ATK increase is doubled.',
      skillKey: 'SUNDERED_PRINCE_CRUSHER_PRINCELY_DETERRENCE',
      triggers: [_I(THIS, PERFORM, ObjectType.FINAL_STRIKE)],
      target: 'wielder',
      durationSeconds: 8,
      maxStacks: 1,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.ATTACK_BONUS, valueMin: 0.10, valueMax: 0.28 },
        { stat: StatType.STAGGER_EFFICIENCY_BONUS, valueMin: 0.12, valueMax: 0.336 },
      ],
      note: 'ATK doubled when controlled (+20-56%)',
    }],
  },

  // Exemplar — Suppression: Stacked Hew (Cast Battle Skill hit)
  {
    weaponName: 'Exemplar',
    effects: [{
      label: 'Stacked Hew',
      description: "When the wielder's battle skill or ultimate hits the enemy, the wielder gains Physical DMG Dealt bonus for 30s. Max 3 stacks. Duration of each stack is counted separately.",
      skillKey: 'EXEMPLAR_SUPPRESSION_STACKED_HEW',
      triggers: [_I(THIS, PERFORM, ObjectType.BATTLE_SKILL)],
      target: 'wielder',
      durationSeconds: 30,
      maxStacks: 3,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.PHYSICAL_DAMAGE_BONUS, valueMin: 0.10, valueMax: 0.28, perStack: true },
      ],
    }],
  },

  // Khravengger — Detonate: Bonechilling (Apply Cryo Infliction / Combo on Cryo)
  {
    weaponName: 'Khravengger',
    effects: [{
      label: 'Bonechilling',
      description: "When the wielder's battle skill applies Cryo Infliction, the wielder gains Cryo DMG Dealt bonus for 15s. When the wielder deals combo skill DMG to an enemy with Cryo Infliction, the wielder gains double Cryo DMG Dealt bonus for 15s.",
      skillKey: 'KHRAVENGGER_DETONATE_BONECHILLING',
      triggers: [_I(THIS, APPLY, ObjectType.INFLICTION, { element: "CRYO" })],
      target: 'wielder',
      durationSeconds: 15,
      maxStacks: 1,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.CRYO_DAMAGE_BONUS, valueMin: 0.10, valueMax: 0.20 },
      ],
      note: 'Battle skill: +10-20%, Combo on Cryo: +20-40%',
    }],
  },

  // OBJ Heavy Burden — Efficacy: Tenacious Will (Apply Knock Down/Weakened)
  {
    weaponName: 'OBJ Heavy Burden',
    effects: [{
      label: 'Tenacious Will',
      description: 'When the wielder applies Knocked Down or Weakened, the wielder gains DEF bonus for 15s. Effects of the same name cannot stack.',
      skillKey: 'OBJ_HEAVY_BURDEN_EFFICACY_TENACIOUS_WILL',
      triggers: [_I(THIS, APPLY, ObjectType.STATUS, { objectId: "KNOCKED_DOWN" })],
      target: 'wielder',
      durationSeconds: 15,
      maxStacks: 1,
      cooldownSeconds: 0,
      buffs: [
        { stat: 'DEF', valueMin: 0.18, valueMax: 0.36 },
      ],
    }],
  },

  // Ancient Canal — Brutality: Lands of Yore (Consume Vulnerability)
  {
    weaponName: 'Ancient Canal',
    effects: [{
      label: 'Lands of Yore',
      description: 'After the wielder consumes Vulnerability stack(s), the wielder gains Physical DMG Dealt bonus scaling with consumed stacks for 20s.',
      skillKey: 'ANCIENT_CANAL_BRUTALITY_LANDS_OF_YORE',
      triggers: [_I(THIS, CONSUME, ObjectType.STATUS, { objectId: "VULNERABILITY" })],
      target: 'wielder',
      durationSeconds: 20,
      maxStacks: 1,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.PHYSICAL_DAMAGE_BONUS, valueMin: 0.05, valueMax: 0.10 },
      ],
      note: 'Phys DMG bonus scales per consumed stack',
    }],
  },

  // Seeker of Dark Lung — Detonate: Seeker of the Esoteric (Apply Arts Burst)
  {
    weaponName: 'Seeker of Dark Lung',
    effects: [{
      label: 'Seeker of the Esoteric',
      description: 'When the wielder applies an Arts Burst, the wielder gains ATK bonus for 30s. Max 3 stacks. Duration of each stack is counted separately.',
      skillKey: 'SEEKER_OF_DARK_LUNG_DETONATE_SEEKER_OF_THE_ESOTERIC',
      triggers: [_I(THIS, APPLY, ObjectType.ARTS_REACTION)],
      target: 'wielder',
      durationSeconds: 30,
      maxStacks: 3,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.ATTACK_BONUS, valueMin: 0.06, valueMax: 0.12, perStack: true },
      ],
    }],
  },

  // Industry 0.1 — Suppression: Emergency Boost (Cast Battle Skill)
  {
    weaponName: 'Industry 0.1',
    effects: [{
      label: 'Emergency Boost',
      description: "When the wielder's battle skill hits the enemy, the wielder gains ATK bonus for 20s. Effects of the same name cannot stack.",
      skillKey: 'INDUSTRY_0_1_SUPPRESSION_EMERGENCY_BOOST',
      triggers: [_I(THIS, PERFORM, ObjectType.BATTLE_SKILL)],
      target: 'wielder',
      durationSeconds: 20,
      maxStacks: 1,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.ATTACK_BONUS, valueMin: 0.12, valueMax: 0.24 },
      ],
    }],
  },

  // Quencher — Crusher: Honed into Legion (Final Strike)
  {
    weaponName: 'Quencher',
    effects: [{
      label: 'Honed into Legion',
      description: 'When the wielder performs a Final Strike on the enemy, the wielder gains ATK bonus for 10s. Effects of the same name cannot stack.',
      skillKey: 'QUENCHER_CRUSHER_HONED_INTO_LEGION',
      triggers: [_I(THIS, PERFORM, ObjectType.FINAL_STRIKE)],
      target: 'wielder',
      durationSeconds: 10,
      maxStacks: 1,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.ATTACK_BONUS, valueMin: 0.12, valueMax: 0.24 },
      ],
    }],
  },

  // Former Finery — Mincing Therapy (Protected Operator Takes DMG)
  {
    weaponName: 'Former Finery',
    effects: [{
      label: 'Mincing Therapy',
      description: 'After a Protected operator takes DMG, the wielder restores the said operator\'s HP. Effect only triggers once every 15s.',
      skillKey: 'FORMER_FINERY_MINCING_THERAPY',
      triggers: [_I(ENEMY, HIT, ObjectType.THIS_OPERATOR)],
      target: 'wielder',
      durationSeconds: 15,
      maxStacks: 1,
      cooldownSeconds: 15,
      buffs: [
        { stat: 'TREATMENT_EFFICIENCY', valueMin: 0.10, valueMax: 0.28 },
      ],
      note: 'Heal protected operator; 15s CD',
    }],
  },

  // Thunderberge — Medicant: Eye of Talos (Combo HP Treatment)
  {
    weaponName: 'Thunderberge',
    effects: [{
      label: 'Eye of Talos',
      description: "After the wielder's combo skill provides HP treatment, the controlled operator gains an additional Shield based on the wielder's Max HP for 15s. Effect only triggers once every 15s.",
      skillKey: 'THUNDERBERGE_MEDICANT_EYE_OF_TALOS',
      triggers: [_I(THIS, RECOVER, ObjectType.HP)],
      target: 'wielder',
      durationSeconds: 15,
      maxStacks: 1,
      cooldownSeconds: 15,
      buffs: [
        { stat: 'SHIELD', valueMin: 0.24, valueMax: 0.672 },
      ],
      note: 'Shield from combo HP treatment; 15s CD',
    }],
  },

  // ── Polearm ───────────────────────────────────────────────────────────────

  // JET — Suppression: Astrophysics (Cast Battle Skill / Cast Combo Skill)
  {
    weaponName: 'JET',
    effects: [{
      label: 'Astrophysics',
      description: 'When the wielder casts a battle skill or combo skill, the wielder gains Arts DMG Dealt bonus for 15s. The two effects apply separately and do not stack with themselves.',
      skillKey: 'JET_SUPPRESSION_ASTROPHYSICS',
      triggers: [_I(THIS, PERFORM, ObjectType.BATTLE_SKILL), _I(THIS, PERFORM, ObjectType.COMBO_SKILL)],
      target: 'wielder',
      durationSeconds: 15,
      maxStacks: 1,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.ARTS_DAMAGE_BONUS, valueMin: 0.12, valueMax: 0.336 },
      ],
    }],
  },

  // Valiant — Combative: Virtuous Gain (Apply Physical Status)
  {
    weaponName: 'Valiant',
    effects: [{
      label: 'Virtuous Gain',
      description: 'After the wielder applies Physical Statuses, the wielder also deals another hit of Physical DMG and gains ATK bonus for 15s.',
      skillKey: 'VALIANT_COMBATIVE_VIRTUOUS_GAIN',
      triggers: [_I(THIS, APPLY, ObjectType.STATUS)],
      target: 'wielder',
      durationSeconds: 15,
      maxStacks: 1,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.ATTACK_BONUS, valueMin: 0.10, valueMax: 0.28 },
      ],
      note: 'Extra hit + ATK buff',
    }],
  },

  // Cohesive Traction — Suppression: Concentric Circles (Cast Combo Skill)
  {
    weaponName: 'Cohesive Traction',
    effects: [{
      label: 'Concentric Circles',
      description: 'When the wielder casts a combo skill, during the next battle skill cast within 30s, the wielder gains Combo Skill DMG Dealt and Electric DMG Dealt bonus. Max 3 stacks. Duration of each stack is counted separately.',
      skillKey: 'COHESIVE_TRACTION_SUPPRESSION_CONCENTRIC_CIRCLES',
      triggers: [_I(THIS, PERFORM, ObjectType.COMBO_SKILL)],
      target: 'wielder',
      durationSeconds: 30,
      maxStacks: 3,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.COMBO_SKILL_DAMAGE_BONUS, valueMin: 0.10, valueMax: 0.28, perStack: true },
        { stat: StatType.ELECTRIC_DAMAGE_BONUS, valueMin: 0.10, valueMax: 0.28, perStack: true },
      ],
      note: 'Electric DMG on next battle skill',
    }],
  },

  // Chimeric Justice — Brutality: Cemented Fury (Apply Vulnerability to 0-stack enemy)
  {
    weaponName: 'Chimeric Justice',
    effects: [{
      label: 'Cemented Fury',
      description: 'When the wielder applies Vulnerability to an enemy with no Vulnerability stacks, the wielder gains ATK and Critical Rate bonus for 15s. Effects of the same name cannot stack.',
      skillKey: 'CHIMERIC_JUSTICE_BRUTALITY_CEMENTED_FURY',
      triggers: [_I(THIS, APPLY, ObjectType.STATUS, { objectId: "VULNERABILITY" })],
      target: 'wielder',
      durationSeconds: 15,
      maxStacks: 1,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.CRITICAL_RATE, valueMin: 0.03, valueMax: 0.084 },
        { stat: StatType.ATTACK_BONUS, valueMin: 0.15, valueMax: 0.42 },
      ],
      note: 'On applying Vulnerability to 0-stack enemy',
    }],
  },

  // Aggeloslayer — Suppression: Emergency Boost (Cast Battle Skill)
  {
    weaponName: 'Aggeloslayer',
    effects: [{
      label: 'Emergency Boost',
      description: "When the wielder's battle skill hits the enemy, the wielder gains ATK bonus for 20s. Effects of the same name cannot stack.",
      skillKey: 'AGGELOSLAYER_SUPPRESSION_EMERGENCY_BOOST',
      triggers: [_I(THIS, PERFORM, ObjectType.BATTLE_SKILL)],
      target: 'wielder',
      durationSeconds: 20,
      maxStacks: 1,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.ATTACK_BONUS, valueMin: 0.12, valueMax: 0.24 },
      ],
    }],
  },

  // OBJ Razorhorn — Infliction: Conquest of Icy Peaks (Apply Solidification)
  {
    weaponName: 'OBJ Razorhorn',
    effects: [{
      label: 'Conquest of Icy Peaks',
      description: 'To enemies with Cryo Infliction or Solidification, the wielder gains DMG Dealt bonus. After consuming Solidification, the wielder gains ATK bonus for 15s.',
      skillKey: 'OBJ_RAZORHORN_INFLICTION_CONQUEST_OF_ICY_PEAKS',
      triggers: [_I(ENEMY, IS, ObjectType.SOLIDIFIED)],
      target: 'wielder',
      durationSeconds: 15,
      maxStacks: 1,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.CRYO_DAMAGE_BONUS, valueMin: 0.08, valueMax: 0.16 },
        { stat: StatType.ATTACK_BONUS, valueMin: 0.12, valueMax: 0.24 },
      ],
      note: 'vs Cryo/Solid DMG +8-16%; consume Solidification → ATK buff',
    }],
  },

  // ── Handcannon ────────────────────────────────────────────────────────────

  // Clannibal — Infliction: Vicious Purge (Consume Arts Reaction)
  {
    weaponName: 'Clannibal',
    effects: [
      {
        label: 'Vicious Purge',
        description: 'After the wielder consumes an Arts Reaction, the wielder gains Arts DMG Dealt bonus for 15s. Effect only triggers once every 25s.',
        skillKey: 'CLANNIBAL_INFLICTION_VICIOUS_PURGE',
        triggers: [_I(THIS, CONSUME, ObjectType.REACTION)],
        target: 'wielder',
        durationSeconds: 15,
        maxStacks: 1,
        cooldownSeconds: 25,
        buffs: [
          { stat: StatType.ARTS_DAMAGE_BONUS, valueMin: 0.12, valueMax: 0.336 },
        ],
      },
      {
        label: 'Vicious Purge (Enemy)',
        description: 'After the wielder consumes an Arts Reaction, target enemy suffers Arts DMG Taken bonus for 15s. Effect only triggers once every 25s.',
        skillKey: 'CLANNIBAL_INFLICTION_VICIOUS_PURGE',
        triggers: [_I(THIS, CONSUME, ObjectType.REACTION)],
        target: 'enemy',
        durationSeconds: 15,
        maxStacks: 1,
        cooldownSeconds: 25,
        buffs: [
          { stat: StatType.ARTS_DAMAGE_BONUS, valueMin: 0.10, valueMax: 0.28 },
        ],
        note: 'Enemy Arts DMG Taken (Fragility)',
      },
    ],
  },

  // Wedge — Infliction: Wedge of Civilization (Battle Skill applies Arts Reaction)
  {
    weaponName: 'Wedge',
    effects: [{
      label: 'Wedge of Civilization',
      description: "When the wielder casts a battle skill, the wielder gains Arts DMG Dealt bonus for 15s. When the wielder's battle skill applies an Arts Reaction, the wielder gains double the Arts DMG Dealt bonus for 15s. These do not stack with themselves.",
      skillKey: 'WEDGE_INFLICTION_WEDGE_OF_CIVILIZATION',
      triggers: [_I(THIS, APPLY, ObjectType.REACTION)],
      target: 'wielder',
      durationSeconds: 15,
      maxStacks: 1,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.ARTS_DAMAGE_BONUS, valueMin: 0.08, valueMax: 0.224 },
      ],
      note: 'Battle skill: +8-22.4%, Arts reaction: +16-44.8%',
    }],
  },

  // Artzy Tyrannical — Fracture: Artzy Exaggeration (Crit with Battle/Combo)
  {
    weaponName: 'Artzy Tyrannical',
    effects: [{
      label: 'Artzy Exaggeration',
      description: 'After the wielder scores a critical hit with a battle skill or combo skill, the wielder gains Cryo DMG Dealt bonus for 30s. Max 3 stacks. Duration of each stack is counted separately.',
      skillKey: 'ARTZY_TYRANNICAL_FRACTURE_ARTZY_EXAGGERATION',
      triggers: [_I(THIS, PERFORM, ObjectType.CRITICAL_HIT)],
      target: 'wielder',
      durationSeconds: 30,
      maxStacks: 3,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.CRYO_DAMAGE_BONUS, valueMin: 0.16, valueMax: 0.448, perStack: true },
      ],
      note: 'Crit with battle/combo skill',
    }],
  },

  // Rational Farewell — Pursuit: Aid from the Past (Combo applies Arts Burst/Combustion)
  {
    weaponName: 'Rational Farewell',
    effects: [{
      label: 'Aid from the Past',
      description: "When the wielder's combo skill applies Arts Burst or Combustion, the wielder gains Battle Skill DMG Dealt and ATK bonus for 15s. Effects of the same name cannot stack.",
      skillKey: 'RATIONAL_FAREWELL_PURSUIT_AID_FROM_THE_PAST',
      triggers: [_I(THIS, APPLY, ObjectType.ARTS_REACTION), _I(ENEMY, IS, ObjectType.COMBUSTED)],
      target: 'wielder',
      durationSeconds: 15,
      maxStacks: 1,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.BATTLE_SKILL_DAMAGE_BONUS, valueMin: 0.10, valueMax: 0.28 },
        { stat: StatType.ATTACK_BONUS, valueMin: 0.16, valueMax: 0.448 },
      ],
      note: 'When combo applies Arts Burst/Combustion',
    }],
  },

  // Opus: The Living — Infliction: Road Home for All Life (Apply Arts Reaction)
  {
    weaponName: 'Opus: The Living',
    effects: [{
      label: 'Road Home for All Life',
      description: 'When the wielder applies an Arts Reaction, the wielder gains ATK bonus for 20s. Max 2 stacks. Duration of each stack is counted separately.',
      skillKey: 'OPUS_THE_LIVING_INFLICTION_ROAD_HOME_FOR_ALL_LIFE',
      triggers: [_I(THIS, APPLY, ObjectType.REACTION)],
      target: 'wielder',
      durationSeconds: 20,
      maxStacks: 2,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.ATTACK_BONUS, valueMin: 0.075, valueMax: 0.15, perStack: true },
      ],
    }],
  },

  // Howling Guard — Suppression: Emergency Boost (Cast Battle Skill)
  {
    weaponName: 'Howling Guard',
    effects: [{
      label: 'Emergency Boost',
      description: "When the wielder's battle skill hits the enemy, the wielder gains ATK bonus for 20s. Effects of the same name cannot stack.",
      skillKey: 'HOWLING_GUARD_SUPPRESSION_EMERGENCY_BOOST',
      triggers: [_I(THIS, PERFORM, ObjectType.BATTLE_SKILL)],
      target: 'wielder',
      durationSeconds: 20,
      maxStacks: 1,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.ATTACK_BONUS, valueMin: 0.12, valueMax: 0.24 },
      ],
    }],
  },

  // Long Road — Pursuit: Unending Cycle (Cast Combo)
  {
    weaponName: 'Long Road',
    effects: [{
      label: 'Unending Cycle',
      description: 'When the wielder casts a combo skill, the wielder gains ATK bonus for 20s. Effects of the same name cannot stack.',
      skillKey: 'LONG_ROAD_PURSUIT_UNENDING_CYCLE',
      triggers: [_I(THIS, PERFORM, ObjectType.COMBO_SKILL)],
      target: 'wielder',
      durationSeconds: 20,
      maxStacks: 1,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.ATTACK_BONUS, valueMin: 0.12, valueMax: 0.24 },
      ],
    }],
  },

  // ── Arts Unit ─────────────────────────────────────────────────────────────

  // Stanza of Memorials — Twilight: Lustrous Pyre (Cast Ultimate)
  {
    weaponName: 'Stanza of Memorials',
    effects: [{
      label: 'Lustrous Pyre',
      description: 'When the wielder casts an ultimate, operators whose elements differ from the wielder gain ATK bonus for 20s. Effects of the same name cannot stack.',
      skillKey: 'STANZA_OF_MEMORIALS_TWILIGHT_LUSTROUS_PYRE',
      triggers: [_I(THIS, PERFORM, ObjectType.ULTIMATE)],
      target: 'team',
      durationSeconds: 20,
      maxStacks: 1,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.ATTACK_BONUS, valueMin: 0.08, valueMax: 0.16 },
      ],
      note: 'Applies to different-element operators',
    }],
  },

  // Dreams of the Starry Beach — Infliction: Tidal Murmurs (Consume Corrosion)
  {
    weaponName: 'Dreams of the Starry Beach',
    effects: [
      {
        label: 'Tidal Murmurs',
        description: 'After the wielder consumes Corrosion, the wielder gains secondary attribute bonus for 25s. Effects of the same name cannot stack.',
        skillKey: 'DREAMS_OF_THE_STARRY_BEACH_INFLICTION_TIDAL_MURMURS',
        triggers: [_I(THIS, CONSUME, ObjectType.REACTION, { objectId: "CORROSION" })],
        target: 'wielder',
        durationSeconds: 25,
        maxStacks: 1,
        cooldownSeconds: 0,
        buffs: [
          { stat: StatType.WILL_BONUS, valueMin: 0.16, valueMax: 0.448 },
        ],
        note: 'Secondary attribute bonus',
      },
      {
        label: 'Tidal Murmurs (Enemy)',
        description: 'After the wielder consumes Corrosion, target enemy suffers Arts DMG Taken bonus for 25s. Effects of the same name cannot stack.',
        skillKey: 'DREAMS_OF_THE_STARRY_BEACH_INFLICTION_TIDAL_MURMURS',
        triggers: [_I(THIS, CONSUME, ObjectType.REACTION, { objectId: "CORROSION" })],
        target: 'enemy',
        durationSeconds: 25,
        maxStacks: 1,
        cooldownSeconds: 0,
        buffs: [
          { stat: StatType.ARTS_DAMAGE_BONUS, valueMin: 0.10, valueMax: 0.28 },
        ],
        note: 'Enemy Arts DMG Taken (Fragility)',
      },
    ],
  },

  // Chivalric Virtues — Medicant: Blight Fervor (Skill HP Treatment)
  {
    weaponName: 'Chivalric Virtues',
    effects: [{
      label: 'Blight Fervor',
      description: "After the wielder's skill provides HP treatment, the entire team gains ATK bonus for 15s. Effects of the same name cannot stack.",
      skillKey: 'CHIVALRIC_VIRTUES_MEDICANT_BLIGHT_FERVOR',
      triggers: [_I(THIS, RECOVER, ObjectType.HP)],
      target: 'team',
      durationSeconds: 15,
      maxStacks: 1,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.ATTACK_BONUS, valueMin: 0.09, valueMax: 0.252 },
      ],
    }],
  },

  // Detonation Unit — Detonate: Imposing Champion (Apply Arts Burst)
  {
    weaponName: 'Detonation Unit',
    effects: [
      {
        label: 'Imposing Champion',
        description: 'When the wielder applies an Arts Burst, the wielder gains secondary attribute bonus for 15s. Effects of the same name cannot stack.',
        skillKey: 'DETONATION_UNIT_DETONATE_IMPOSING_CHAMPION',
        triggers: [_I(THIS, APPLY, ObjectType.ARTS_REACTION)],
        target: 'wielder',
        durationSeconds: 15,
        maxStacks: 1,
        cooldownSeconds: 0,
        buffs: [
          { stat: StatType.WILL_BONUS, valueMin: 0.10, valueMax: 0.28 },
        ],
        note: 'Secondary attribute bonus',
      },
      {
        label: 'Imposing Champion (Enemy)',
        description: 'When the wielder applies an Arts Burst, target enemy suffers Arts DMG Taken bonus for 15s. Effects of the same name cannot stack.',
        skillKey: 'DETONATION_UNIT_DETONATE_IMPOSING_CHAMPION',
        triggers: [_I(THIS, APPLY, ObjectType.ARTS_REACTION)],
        target: 'enemy',
        durationSeconds: 15,
        maxStacks: 1,
        cooldownSeconds: 0,
        buffs: [
          { stat: StatType.ARTS_DAMAGE_BONUS, valueMin: 0.09, valueMax: 0.252 },
        ],
        note: 'Enemy Arts DMG Taken (Fragility)',
      },
    ],
  },

  // Oblivion — Twilight: Humiliation (Cast Ultimate / Cast Combo)
  {
    weaponName: 'Oblivion',
    effects: [{
      label: 'Humiliation',
      description: 'When the wielder casts an ultimate or combo skill, the wielder gains Arts DMG Dealt bonus for 15s. Ultimate grants double the bonus. The two effects apply separately and do not stack with themselves.',
      skillKey: 'OBLIVION_TWILIGHT_HUMILIATION',
      triggers: [_I(THIS, PERFORM, ObjectType.ULTIMATE), _I(THIS, PERFORM, ObjectType.COMBO_SKILL)],
      target: 'wielder',
      durationSeconds: 15,
      maxStacks: 1,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.ARTS_DAMAGE_BONUS, valueMin: 0.24, valueMax: 0.48 },
      ],
      note: 'Ultimate: 24-48%, Combo: 12-24%',
    }],
  },

  // Delivery Guaranteed — Pursuit: Duty Fulfilled (Apply Lifted)
  {
    weaponName: 'Delivery Guaranteed',
    effects: [{
      label: 'Duty Fulfilled',
      description: "After the wielder's combo skill applies Lifted, the team gains Arts DMG Dealt and Nature DMG Dealt bonus for 15s. For every enemy Lifted, the team gains additional Arts DMG Dealt bonus. Effects of the same name cannot stack.",
      skillKey: 'DELIVERY_GUARANTEED_PURSUIT_DUTY_FULFILLED',
      triggers: [_I(THIS, APPLY, ObjectType.STATUS, { objectId: "LIFTED" })],
      target: 'team',
      durationSeconds: 15,
      maxStacks: 1,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.ARTS_DAMAGE_BONUS, valueMin: 0.12, valueMax: 0.336 },
        { stat: StatType.NATURE_DAMAGE_BONUS, valueMin: 0.16, valueMax: 0.448 },
      ],
    }],
  },

  // OBJ Arts Identifier — Pursuit: Transcendent Arts (Combo applies Arts Burst/Physical Status)
  {
    weaponName: 'OBJ Arts Identifier',
    effects: [{
      label: 'Transcendent Arts',
      description: "When the wielder's combo skill applies Arts Burst or Physical Status, the entire team gains Heat DMG Dealt and Electric DMG Dealt bonus for 15s. Effects of the same name cannot stack.",
      skillKey: 'OBJ_ARTS_IDENTIFIER_PURSUIT_TRANSCENDENT_ARTS',
      triggers: [_I(THIS, APPLY, ObjectType.ARTS_REACTION), _I(THIS, APPLY, ObjectType.STATUS)],
      target: 'team',
      durationSeconds: 15,
      maxStacks: 1,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.HEAT_DAMAGE_BONUS, valueMin: 0.08, valueMax: 0.16 },
        { stat: StatType.ELECTRIC_DAMAGE_BONUS, valueMin: 0.08, valueMax: 0.16 },
      ],
      note: 'When combo applies Arts Burst or Physical Status',
    }],
  },

  // Freedom to Proselytize — Medicant: Redemption of Faith (Skill HP Treatment)
  {
    weaponName: 'Freedom to Proselytize',
    effects: [{
      label: 'Redemption of Faith',
      description: "When the wielder's battle skill provides HP treatment, the controlled operator is restored for additional HP. Effect only triggers once every 15s.",
      skillKey: 'FREEDOM_TO_PROSELYTIZE_MEDICANT_REDEMPTION_OF_FAITH',
      triggers: [_I(THIS, RECOVER, ObjectType.HP)],
      target: 'wielder',
      durationSeconds: 15,
      maxStacks: 1,
      cooldownSeconds: 15,
      buffs: [],
      note: 'Heal controlled operator; 15s CD',
    }],
  },

  // Wild Wanderer — Infliction: Wilderness Cluster (Apply Electrification)
  {
    weaponName: 'Wild Wanderer',
    effects: [{
      label: 'Wilderness Cluster',
      description: 'When the wielder applies Electrification, the team gains Physical DMG Dealt and Electric DMG Dealt bonus for 15s. Effects of the same name cannot stack.',
      skillKey: 'WILD_WANDERER_INFLICTION_WILDERNESS_CLUSTER',
      triggers: [_I(ENEMY, IS, ObjectType.ELECTRIFIED)],
      target: 'team',
      durationSeconds: 15,
      maxStacks: 1,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.PHYSICAL_DAMAGE_BONUS, valueMin: 0.08, valueMax: 0.16 },
        { stat: StatType.ELECTRIC_DAMAGE_BONUS, valueMin: 0.08, valueMax: 0.16 },
      ],
    }],
  },

  // Fluorescent Roc — Suppression: Emergency Boost (Cast Battle Skill)
  {
    weaponName: 'Fluorescent Roc',
    effects: [{
      label: 'Emergency Boost',
      description: "When the wielder's battle skill hits the enemy, the wielder gains ATK bonus for 20s. Effects of the same name cannot stack.",
      skillKey: 'FLUORESCENT_ROC_SUPPRESSION_EMERGENCY_BOOST',
      triggers: [_I(THIS, PERFORM, ObjectType.BATTLE_SKILL)],
      target: 'wielder',
      durationSeconds: 20,
      maxStacks: 1,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.ATTACK_BONUS, valueMin: 0.12, valueMax: 0.24 },
      ],
    }],
  },
];

// ── Lookup helpers ───────────────────────────────────────────────────────────

/** Look up weapon effects by weapon name. Returns undefined for passive-only weapons. */
export function getWeaponEffects(weaponName: string): WeaponEffectsEntry | undefined {
  return WEAPON_SKILL_EFFECTS.find((e) => e.weaponName === weaponName);
}

/** Register custom weapon effects at runtime. */
export function registerWeaponEffects(entry: WeaponEffectsEntry): void {
  WEAPON_SKILL_EFFECTS.push(entry);
}

/** Remove custom weapon effects by weapon name. */
export function deregisterWeaponEffects(weaponName: string): void {
  const idx = WEAPON_SKILL_EFFECTS.findIndex((e) => e.weaponName === weaponName);
  if (idx >= 0) WEAPON_SKILL_EFFECTS.splice(idx, 1);
}
