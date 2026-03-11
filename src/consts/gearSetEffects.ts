/**
 * Gear set effect data registry.
 *
 * Maps gear set effect types to their triggered buff/debuff effects.
 * Used by columnBuilder to create gear buff subtimeline columns.
 *
 * Mirrors the structure of weaponSkillEffects.ts.
 * Only gear sets with triggered timed effects are included — passive-only
 * or instant effects (AIC, Armored/Roving MSGR, Mordvolt, Catastrophe,
 * Swordmancer, Bonekrusha, Type 50 Yinglung) are omitted.
 */
import { GearEffectType, TriggerConditionType, StatType } from './enums';

// ── Types ────────────────────────────────────────────────────────────────────

/** Target of a gear set effect. */
export type GearEffectTarget = 'wielder' | 'team' | 'enemy';

/** A single buff/debuff applied by a gear set effect. */
export interface GearEffectBuff {
  /** Stat type affected. */
  stat: StatType | 'PROTECTION' | 'DEF' | 'TREATMENT_EFFICIENCY' | 'SHIELD';
  /** Fixed value (gear set effects don't scale by rank). */
  value: number;
  /** Whether this buff is applied per stack (if stacking). */
  perStack?: boolean;
}

/** A triggered gear set effect. */
export interface GearSetEffect {
  /** Display label (e.g. "Hot Work"). */
  label: string;
  /** Trigger condition(s) — any match activates. */
  triggers: TriggerConditionType[];
  /** Who receives the buff: wielder, team, or enemy. */
  target: GearEffectTarget;
  /** Duration in seconds. */
  durationSeconds: number;
  /** Max stacks (1 = no stacking, just refreshes). */
  maxStacks: number;
  /** Cooldown in seconds (0 = no cooldown). */
  cooldownSeconds: number;
  /** Buffs/debuffs applied by this effect. */
  buffs: GearEffectBuff[];
  /** Additional notes for display. */
  note?: string;
}

/** All triggered effects for a gear set. */
export interface GearSetEffectsEntry {
  /** The gear set's effect type. */
  gearEffectType: GearEffectType;
  /** Display name for the gear set. */
  label: string;
  /** All triggered effects. */
  effects: GearSetEffect[];
}

// ── Data ─────────────────────────────────────────────────────────────────────

export const GEAR_SET_EFFECTS: GearSetEffectsEntry[] = [
  // ── AIC Light ──────────────────────────────────────────────────────────────
  // After defeating an enemy, ATK +20 for 5s.
  {
    gearEffectType: GearEffectType.AIC_LIGHT,
    label: 'AIC Light',
    effects: [{
      label: 'AIC Light',
      triggers: [TriggerConditionType.DEFEAT_ENEMY],
      target: 'wielder',
      durationSeconds: 5,
      maxStacks: 1,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.ATTACK, value: 20 },
      ],
    }],
  },

  // ── Aburrey's Legacy ───────────────────────────────────────────────────────
  // Skill DMG +24%. On battle/combo/ultimate cast, ATK +5% for 15s (3 unique stacks).
  {
    gearEffectType: GearEffectType.ABURREY_LEGACY,
    label: "Aburrey's Legacy",
    effects: [{
      label: "Aburrey's Legacy",
      triggers: [
        TriggerConditionType.CAST_BATTLE_SKILL,
        TriggerConditionType.CAST_COMBO_SKILL,
        TriggerConditionType.CAST_ULTIMATE,
      ],
      target: 'wielder',
      durationSeconds: 15,
      maxStacks: 3,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.ATTACK_BONUS, value: 0.05, perStack: true },
      ],
      note: 'Each skill type gives a unique non-self-stacking buff',
    }],
  },

  // ── Lynx ───────────────────────────────────────────────────────────────────
  // After HP treatment, target gains 15% DMG Reduction for 10s.
  {
    gearEffectType: GearEffectType.LYNX,
    label: 'LYNX',
    effects: [{
      label: 'LYNX',
      triggers: [TriggerConditionType.HP_TREATMENT],
      target: 'team',
      durationSeconds: 10,
      maxStacks: 1,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.FINAL_DAMAGE_REDUCTION, value: 0.15 },
      ],
      note: '30% if treatment exceeds max HP',
    }],
  },

  // ── Æthertech ──────────────────────────────────────────────────────────────
  // After applying Vulnerability, Physical DMG +8% for 15s (max 4 stacks).
  {
    gearEffectType: GearEffectType.AETHERTECH,
    label: 'Æthertech',
    effects: [{
      label: 'Æthertech',
      triggers: [TriggerConditionType.APPLY_VULNERABILITY],
      target: 'wielder',
      durationSeconds: 15,
      maxStacks: 4,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.PHYSICAL_DAMAGE_BONUS, value: 0.08, perStack: true },
      ],
      note: 'At 4 stacks of Vulnerability, additional Physical DMG +16% for 10s',
    }],
  },

  // ── Pulser Labs ────────────────────────────────────────────────────────────
  // After Electrification → Electric DMG +50% for 10s.
  // After Solidification → Cryo DMG +50% for 10s.
  {
    gearEffectType: GearEffectType.PULSER_LABS,
    label: 'Pulser Labs',
    effects: [
      {
        label: 'Pulser Labs (Electric)',
        triggers: [TriggerConditionType.ELECTRIFICATION],
        target: 'wielder',
        durationSeconds: 10,
        maxStacks: 1,
        cooldownSeconds: 0,
        buffs: [
          { stat: StatType.ELECTRIC_DAMAGE_BONUS, value: 0.50 },
        ],
      },
      {
        label: 'Pulser Labs (Cryo)',
        triggers: [TriggerConditionType.SOLIDIFICATION],
        target: 'wielder',
        durationSeconds: 10,
        maxStacks: 1,
        cooldownSeconds: 0,
        buffs: [
          { stat: StatType.CRYO_DAMAGE_BONUS, value: 0.50 },
        ],
      },
    ],
  },

  // ── Frontiers ──────────────────────────────────────────────────────────────
  // After SP recovery from skill, team DMG +16% for 15s.
  {
    gearEffectType: GearEffectType.FRONTIERS,
    label: 'Frontiers',
    effects: [{
      label: 'Frontiers',
      triggers: [TriggerConditionType.SKILL_POINT_RECOVERY_FROM_SKILL],
      target: 'team',
      durationSeconds: 15,
      maxStacks: 1,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.SKILL_DAMAGE_BONUS, value: 0.16 },
      ],
      note: 'Team DMG +16%',
    }],
  },

  // ── Hot Work ───────────────────────────────────────────────────────────────
  // After Combustion → Heat DMG +50% for 10s.
  // After Corrosion → Nature DMG +50% for 10s.
  {
    gearEffectType: GearEffectType.HOT_WORK,
    label: 'Hot Work',
    effects: [
      {
        label: 'Hot Work (Heat)',
        triggers: [TriggerConditionType.COMBUSTION],
        target: 'wielder',
        durationSeconds: 10,
        maxStacks: 1,
        cooldownSeconds: 0,
        buffs: [
          { stat: StatType.HEAT_DAMAGE_BONUS, value: 0.50 },
        ],
      },
      {
        label: 'Hot Work (Nature)',
        triggers: [TriggerConditionType.CORROSION],
        target: 'wielder',
        durationSeconds: 10,
        maxStacks: 1,
        cooldownSeconds: 0,
        buffs: [
          { stat: StatType.NATURE_DAMAGE_BONUS, value: 0.50 },
        ],
      },
    ],
  },

  // ── MI Security ────────────────────────────────────────────────────────────
  // After crit hit, ATK +5% for 5s (max 5 stacks).
  {
    gearEffectType: GearEffectType.MI_SECURITY,
    label: 'MI Security',
    effects: [{
      label: 'MI Security',
      triggers: [TriggerConditionType.CRITICAL_HIT],
      target: 'wielder',
      durationSeconds: 5,
      maxStacks: 5,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.ATTACK_BONUS, value: 0.05, perStack: true },
      ],
      note: 'At max stacks, additional Crit Rate +5%',
    }],
  },

  // ── Tide Surge ─────────────────────────────────────────────────────────────
  // After applying 2+ stacks of Arts Infliction, Arts DMG +35% for 15s.
  {
    gearEffectType: GearEffectType.TIDE_SURGE,
    label: 'Tide Surge',
    effects: [{
      label: 'Tide Surge',
      triggers: [TriggerConditionType.APPLY_ARTS_INFLICTION_2_STACKS],
      target: 'wielder',
      durationSeconds: 15,
      maxStacks: 1,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.ARTS_DAMAGE_BONUS, value: 0.35 },
      ],
    }],
  },

  // ── Eternal Xiranite ───────────────────────────────────────────────────────
  // After applying Amp/Protected/Susceptibility/Weakened, other teammates
  // gain DMG +16% for 15s.
  {
    gearEffectType: GearEffectType.ETERNAL_XIRANITE,
    label: 'Eternal Xiranite',
    effects: [{
      label: 'Eternal Xiranite',
      triggers: [TriggerConditionType.APPLY_BUFF],
      target: 'team',
      durationSeconds: 15,
      maxStacks: 1,
      cooldownSeconds: 0,
      buffs: [
        { stat: StatType.SKILL_DAMAGE_BONUS, value: 0.16 },
      ],
      note: 'On applying Amp/Protected/Susceptibility/Weakened',
    }],
  },
];

// ── Lookup helpers ───────────────────────────────────────────────────────────

/** Look up gear set effects by gear effect type. Returns undefined for sets without triggered timed effects. */
export function getGearSetEffects(gearEffectType: GearEffectType): GearSetEffectsEntry | undefined {
  return GEAR_SET_EFFECTS.find((e) => e.gearEffectType === gearEffectType);
}
