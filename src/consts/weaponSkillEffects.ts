/**
 * Weapon skill effect data registry.
 *
 * Maps weapon names to their triggered named skill effects.
 * Used by columnBuilder to create weapon buff/debuff subtimeline columns.
 *
 * Weapons with only passive stat boosts (no triggered named skill) are omitted.
 */
import { TriggerConditionType, StatType, ElementType } from './enums';

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
  /** WeaponSkillType enum key for this effect. */
  skillKey: string;
  /** Trigger condition(s) — any match activates. */
  triggers: TriggerConditionType[];
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
        skillKey: 'FLOW_REINCARNATION',
        triggers: [TriggerConditionType.SKILL_POINT_RECOVERY_FROM_SKILL],
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
        skillKey: 'FLOW_REINCARNATION',
        triggers: [TriggerConditionType.SKILL_POINT_RECOVERY_FROM_SKILL],
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
        skillKey: 'FLOW_THERMAL_RELEASE',
        triggers: [TriggerConditionType.SKILL_POINT_RECOVERY_FROM_SKILL],
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
        skillKey: 'FLOW_THERMAL_RELEASE',
        triggers: [TriggerConditionType.SKILL_POINT_RECOVERY_FROM_SKILL],
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
      skillKey: 'TWILIGHT_BLAZING_WAIL',
      triggers: [TriggerConditionType.CAST_ULTIMATE],
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
      skillKey: 'BRUTALITY_DISCIPLINARIAN',
      triggers: [TriggerConditionType.CONSUME_VULNERABILITY],
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
      skillKey: 'INFLICTION_WHITE_NIGHT_NOVA',
      triggers: [TriggerConditionType.APPLY_ARTS_REACTION],
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
      skillKey: 'INFLICTION_LONG_TIME_WISH',
      triggers: [TriggerConditionType.SOLIDIFICATION],
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
      skillKey: 'INFLICTION_COVETOUS_BUILDUP',
      triggers: [TriggerConditionType.COMBUSTION, TriggerConditionType.CORROSION],
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
      skillKey: 'COMBATIVE_ANTHEM_OF_CINDER',
      triggers: [TriggerConditionType.APPLY_PHYSICAL_STATUS],
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
      skillKey: 'TWILIGHT_IMPOSING_PEAK',
      triggers: [TriggerConditionType.APPLY_LIFTED],
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
      skillKey: 'FLOW_UNBRIDLED_EDGE',
      triggers: [TriggerConditionType.SKILL_POINT_RECOVERY_FROM_SKILL],
      target: 'team',
      durationSeconds: 20,
      maxStacks: 3,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.HEAT_DAMAGE_BONUS, valueMin: 0.03, valueMax: 0.06, perStack: true },
        { stat: StatType.ELECTRIC_DAMAGE_BONUS, valueMin: 0.03, valueMax: 0.06, perStack: true },
      ],
    }],
  },

  // Twelve Questions — Infliction: Sincere Interrogation (Consume Arts Reaction)
  {
    weaponName: 'Twelve Questions',
    effects: [{
      label: 'Sincere Interrogation',
      skillKey: 'INFLICTION_SINCERE_INTERROGATION',
      triggers: [TriggerConditionType.CONSUME_ARTS_REACTION],
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
      skillKey: 'SUPPRESSION_FIN_CHASERS_INTENT',
      triggers: [TriggerConditionType.SOLIDIFICATION],
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
      skillKey: 'PURSUIT_UNENDING_CYCLE',
      triggers: [TriggerConditionType.CAST_COMBO_SKILL],
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
      skillKey: 'SUPPRESSION_EMERGENCY_BOOST',
      triggers: [TriggerConditionType.CAST_BATTLE_SKILL],
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
      skillKey: 'CRUSHER_PRINCELY_DETERRENCE',
      triggers: [TriggerConditionType.FINAL_STRIKE],
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
      skillKey: 'SUPPRESSION_STACKED_HEW',
      triggers: [TriggerConditionType.CAST_BATTLE_SKILL],
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
      skillKey: 'DETONATE_BONECHILLING',
      triggers: [TriggerConditionType.APPLY_CRYO_INFLICTION],
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
      skillKey: 'EFFICACY_TENACIOUS_WILL',
      triggers: [TriggerConditionType.APPLY_KNOCKED_DOWN],
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
      skillKey: 'BRUTALITY_LANDS_OF_YORE',
      triggers: [TriggerConditionType.CONSUME_VULNERABILITY],
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
      skillKey: 'DETONATE_SEEKER_OF_THE_ESOTERIC',
      triggers: [TriggerConditionType.APPLY_ARTS_BURST],
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
      skillKey: 'SUPPRESSION_EMERGENCY_BOOST',
      triggers: [TriggerConditionType.CAST_BATTLE_SKILL],
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
      skillKey: 'CRUSHER_HONED_INTO_LEGION',
      triggers: [TriggerConditionType.FINAL_STRIKE],
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
      skillKey: 'MINCING_THERAPY',
      triggers: [TriggerConditionType.OPERATOR_ATTACKED],
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
      skillKey: 'MEDICANT_EYE_OF_TALOS',
      triggers: [TriggerConditionType.HP_TREATMENT],
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
      skillKey: 'SUPPRESSION_ASTROPHYSICS',
      triggers: [TriggerConditionType.CAST_BATTLE_SKILL, TriggerConditionType.CAST_COMBO_SKILL],
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
      skillKey: 'COMBATIVE_VIRTUOUS_GAIN',
      triggers: [TriggerConditionType.APPLY_PHYSICAL_STATUS],
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
      skillKey: 'SUPPRESSION_CONCENTRIC_CIRCLES',
      triggers: [TriggerConditionType.CAST_COMBO_SKILL],
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
      skillKey: 'BRUTALITY_CEMENTED_FURY',
      triggers: [TriggerConditionType.APPLY_VULNERABILITY],
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
      skillKey: 'SUPPRESSION_EMERGENCY_BOOST',
      triggers: [TriggerConditionType.CAST_BATTLE_SKILL],
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
      skillKey: 'INFLICTION_CONQUEST_OF_ICY_PEAKS',
      triggers: [TriggerConditionType.SOLIDIFICATION],
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
        skillKey: 'INFLICTION_VICIOUS_PURGE',
        triggers: [TriggerConditionType.CONSUME_ARTS_REACTION],
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
        skillKey: 'INFLICTION_VICIOUS_PURGE',
        triggers: [TriggerConditionType.CONSUME_ARTS_REACTION],
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
      skillKey: 'INFLICTION_WEDGE_OF_CIVILIZATION',
      triggers: [TriggerConditionType.APPLY_ARTS_REACTION],
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
      skillKey: 'FRACTURE_ARTZY_EXAGGERATION',
      triggers: [TriggerConditionType.CRITICAL_HIT],
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
      skillKey: 'PURSUIT_AID_FROM_THE_PAST',
      triggers: [TriggerConditionType.APPLY_ARTS_BURST, TriggerConditionType.COMBUSTION],
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
      skillKey: 'INFLICTION_ROAD_HOME_FOR_ALL_LIFE',
      triggers: [TriggerConditionType.APPLY_ARTS_REACTION],
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
      skillKey: 'SUPPRESSION_EMERGENCY_BOOST',
      triggers: [TriggerConditionType.CAST_BATTLE_SKILL],
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
      skillKey: 'PURSUIT_UNENDING_CYCLE',
      triggers: [TriggerConditionType.CAST_COMBO_SKILL],
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
      skillKey: 'TWILIGHT_LUSTROUS_PYRE',
      triggers: [TriggerConditionType.CAST_ULTIMATE],
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
        skillKey: 'INFLICTION_TIDAL_MURMURS',
        triggers: [TriggerConditionType.CONSUME_CORROSION],
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
        skillKey: 'INFLICTION_TIDAL_MURMURS',
        triggers: [TriggerConditionType.CONSUME_CORROSION],
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
      skillKey: 'MEDICANT_BLIGHT_FERVOR',
      triggers: [TriggerConditionType.HP_TREATMENT],
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
        skillKey: 'DETONATE_IMPOSING_CHAMPION',
        triggers: [TriggerConditionType.APPLY_ARTS_BURST],
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
        skillKey: 'DETONATE_IMPOSING_CHAMPION',
        triggers: [TriggerConditionType.APPLY_ARTS_BURST],
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
      skillKey: 'TWILIGHT_HUMILIATION',
      triggers: [TriggerConditionType.CAST_ULTIMATE, TriggerConditionType.CAST_COMBO_SKILL],
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
      skillKey: 'PURSUIT_DUTY_FULFILLED',
      triggers: [TriggerConditionType.APPLY_LIFTED],
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
      skillKey: 'PURSUIT_TRANSCENDENT_ARTS',
      triggers: [TriggerConditionType.APPLY_ARTS_BURST, TriggerConditionType.APPLY_PHYSICAL_STATUS],
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
      skillKey: 'MEDICANT_REDEMPTION_OF_FAITH',
      triggers: [TriggerConditionType.HP_TREATMENT],
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
      skillKey: 'INFLICTION_WILDERNESS_CLUSTER',
      triggers: [TriggerConditionType.ELECTRIFICATION],
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
      skillKey: 'SUPPRESSION_EMERGENCY_BOOST',
      triggers: [TriggerConditionType.CAST_BATTLE_SKILL],
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
